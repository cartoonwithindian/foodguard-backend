import { lookup } from "node:dns/promises";
import { request as httpRequest } from "node:http";
import { request as httpsRequest } from "node:https";
import type { LookupFunction } from "node:net";
import { isIP } from "node:net";
import { Readable } from "node:stream";
import { AppError, ErrorCodes } from "@/lib/errors";
import { assertPublicHttpUrl } from "@/lib/url-guard";

/**
 * Outbound HTTP helper for URLs that originate from untrusted input
 * (search-engine results, provider metadata, user-supplied image URLs).
 *
 * Two SSRF primitives are closed:
 *   1. DNS rebinding / TOCTOU: the hostname is resolved and *validated*
 *      addresses are passed to the socket's `lookup` hook, so the connection
 *      cannot resolve a different (private) address after validation.
 *   2. Redirects: every hop is re-validated (syntax + DNS) before it is
 *      fetched.
 *
 * TLS hostname verification is preserved: the request still targets the
 * original hostname with `servername` set to it, so the certificate is checked
 * against the URL host — only the address lookup is pinned.
 */

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

type ResolvedAddress = { address: string; family: number };

function validationError(message: string): AppError {
  return new AppError(ErrorCodes.VALIDATION_ERROR, message, 400);
}

/**
 * Resolves `url` and returns only public addresses, or throws. Literal IPs are
 * checked by `assertPublicHttpUrl` and returned as-is.
 */
type Resolver = (host: string, field: string) => Promise<ResolvedAddress[]>;

const defaultResolver: Resolver = async (host, field) => {
  try {
    return await lookup(host, { all: true, verbatim: true });
  } catch {
    throw validationError(`${field} host could not be resolved`);
  }
};

let resolver: Resolver = defaultResolver;

/** Test-only hook: replace DNS resolution (e.g. to simulate rebinding). */
export function __setSafeFetchResolverForTests(next?: Resolver): void {
  resolver = next ?? defaultResolver;
}

async function resolvePublicAddresses(url: URL, field = "url"): Promise<ResolvedAddress[]> {
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const literalFamily = isIP(host);
  if (literalFamily) {
    // Re-run the address rules on the literal (assertPublicHttpUrl already did,
    // but callers such as redirects rely on this helper being self-contained).
    assertPublicHttpUrl(`http://${literalFamily === 6 ? `[${host}]` : host}/`, field);
    return [{ address: host, family: literalFamily }];
  }

  const addresses = await resolver(host, field);
  if (addresses.length === 0) {
    throw validationError(`${field} host could not be resolved`);
  }

  const seen = new Set<string>();
  const publicAddresses: ResolvedAddress[] = [];
  for (const { address, family } of addresses) {
    const literal = family === 6 ? `[${address}]` : address;
    // Reuse the same private/reserved-address rules as the syntax check.
    assertPublicHttpUrl(`http://${literal}/`, field);
    if (!seen.has(address)) {
      seen.add(address);
      publicAddresses.push({ address, family });
    }
  }
  return publicAddresses;
}

/**
 * Validates a client-supplied URL *and* its current DNS answers. Use this
 * before handing a URL to another service that will fetch it on our behalf
 * (so the backend still rejects private-resolving hosts).
 */
export async function assertPublicResolvableUrl(raw: string, field = "url"): Promise<URL> {
  const url = assertPublicHttpUrl(raw, field);
  await resolvePublicAddresses(url, field);
  return url;
}

type TransportInit = {
  method: string;
  headers: Record<string, string> | undefined;
  timeoutMs: number;
  addresses: ResolvedAddress[];
};

type Transport = (url: URL, init: TransportInit) => Promise<Response>;

/**
 * Node HTTP(S) transport that pins the connection to a validated address.
 * `http.request`/`https.request` call `lookup` themselves, so DNS is never
 * re-queried after validation. `servername` keeps SNI/certificate validation
 * bound to the original hostname.
 */
async function nodeTransport(url: URL, init: TransportInit): Promise<Response> {
  const isHttps = url.protocol === "https:";
  const requestFn = isHttps ? httpsRequest : httpRequest;
  const hostname = url.hostname.replace(/^\[|\]$/g, "");
  const pinned = init.addresses;

  const lookupFn = ((
    _host: string,
    options: unknown,
    callback: (...args: unknown[]) => void,
  ) => {
    const requestedFamily =
      typeof options === "number"
        ? options
        : typeof options === "object" && options !== null && "family" in options
          ? Number((options as { family?: unknown }).family) || 0
          : 0;
    const matches =
      requestedFamily > 0 ? pinned.filter((a) => a.family === requestedFamily) : [...pinned];
    const candidates = matches.length > 0 ? matches : [...pinned];
    if (candidates.length === 0) {
      callback(Object.assign(new Error("No validated address for host"), { code: "ENOTFOUND" }), "", 0);
      return;
    }
    // Node >=20.13 may request `all: true` and expect an address array.
    const wantsAll =
      typeof options === "object" &&
      options !== null &&
      (options as { all?: unknown }).all === true;
    if (wantsAll) {
      callback(null, candidates.map(({ address, family }) => ({ address, family })));
      return;
    }
    callback(null, candidates[0].address, candidates[0].family);
  }) as unknown as LookupFunction;

  return await new Promise<Response>((resolve, reject) => {
    let settled = false;
    let overallTimer: NodeJS.Timeout | undefined;
    const fail = (error: Error) => {
      if (settled) return;
      settled = true;
      if (overallTimer) clearTimeout(overallTimer);
      reject(error);
    };

    const req = requestFn(
      {
        protocol: url.protocol,
        hostname,
        port: url.port ? Number(url.port) : undefined,
        path: `${url.pathname}${url.search}`,
        method: init.method,
        headers: {
          // Identity keeps the byte cap meaningful: the helpers do not
          // transparently decompress `content-encoding: gzip` bodies.
          "accept-encoding": "identity",
          ...init.headers,
          host: url.host,
        },
        // A new socket per request; no keep-alive reuse across validation.
        agent: false,
        lookup: lookupFn,
        ...(isHttps ? { servername: hostname } : {}),
      },
      (res) => {
        if (settled) {
          res.destroy();
          return;
        }
        settled = true;
        // Keep the deadline alive until the body is consumed/closed: clearing
        // it here would let a server drip bytes forever after the headers.
        res.once("close", () => {
          if (overallTimer) clearTimeout(overallTimer);
        });

        const headers = new Headers();
        for (let i = 0; i < res.rawHeaders.length; i += 2) {
          headers.append(res.rawHeaders[i], res.rawHeaders[i + 1]);
        }
        const status = res.statusCode ?? 502;
        const bodyless = status === 204 || status === 304 || (status >= 100 && status < 200);
        const body = bodyless ? null : (Readable.toWeb(res) as ReadableStream<Uint8Array>);
        resolve(
          new Response(body, {
            status,
            statusText: res.statusMessage,
            headers,
          }),
        );
      },
    );

    // Overall (not merely idle) deadline: a server that drips one byte at a
    // time cannot hold the socket open forever.
    overallTimer = setTimeout(() => {
      req.destroy(validationError("Outbound request timed out"));
    }, init.timeoutMs);

    req.on("error", (error) => fail(error));
    req.end();
  });
}

let transport: Transport = nodeTransport;

/** Test-only hook: inject a transport without opening sockets. */
export function __setSafeFetchTransportForTests(next?: Transport): void {
  transport = next ?? nodeTransport;
}

/** Test-only hook: the real pinned transport, for socket-level tests. */
export const __nodeTransportForTests = nodeTransport;

export type SafeFetchOptions = {
  timeoutMs?: number;
  maxRedirects?: number;
  headers?: Record<string, string>;
  method?: string;
};

/**
 * Fetches a public HTTP(S) URL with SSRF protections.
 * @throws AppError(400) when the URL or any redirect target is not public.
 */
export async function fetchPublicUrl(
  raw: string,
  options: SafeFetchOptions = {},
): Promise<Response> {
  const maxRedirects = options.maxRedirects ?? 3;
  const timeoutMs = options.timeoutMs ?? 10_000;
  const method = options.method ?? "GET";

  let current = assertPublicHttpUrl(raw);

  for (let hop = 0; hop <= maxRedirects; hop += 1) {
    const addresses = await resolvePublicAddresses(current);
    const response = await transport(current, {
      method,
      headers: options.headers,
      timeoutMs,
      addresses,
    });

    if (!REDIRECT_STATUSES.has(response.status)) return response;

    const location = response.headers.get("location");
    if (!location) return response;
    // Release the redirect response body/socket before fetching the next hop.
    await response.body?.cancel().catch(() => undefined);
    if (hop === maxRedirects) {
      throw validationError("Too many redirects");
    }
    current = assertPublicHttpUrl(new URL(location, current).toString());
  }

  throw validationError("Too many redirects");
}

async function readLimited(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array | null> {
  const declared = Number(response.headers.get("content-length") ?? "");
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  if (!response.body) return new Uint8Array(0);

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        return null;
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock?.();
  }

  const merged = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    merged.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return merged;
}

/**
 * Reads a response body as text while enforcing a hard byte cap.
 * Returns null when the body exceeds `maxBytes` (caller treats it as unusable)
 * instead of buffering an unbounded page into memory.
 */
export async function readTextLimited(
  response: Response,
  maxBytes: number,
): Promise<string | null> {
  const bytes = await readLimited(response, maxBytes);
  return bytes === null ? null : new TextDecoder().decode(bytes);
}

/**
 * Reads a binary response body while enforcing a hard byte cap. `content-length`
 * is only a hint (it can be absent or lie), so the stream is counted too.
 */
export async function readBytesLimited(
  response: Response,
  maxBytes: number,
): Promise<Uint8Array | null> {
  return readLimited(response, maxBytes);
}
