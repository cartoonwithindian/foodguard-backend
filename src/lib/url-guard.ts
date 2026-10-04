import { AppError, ErrorCodes } from "@/lib/errors";

/**
 * Guard for URLs that a *client* supplies and the server (or one of its
 * upstream services) will subsequently fetch.
 *
 * Without it, an attacker can point the endpoint at
 * `http://169.254.169.254/latest/meta-data/` (cloud metadata),
 * `http://127.0.0.1:5432/` or `http://10.0.0.1/admin` and use the server as an
 * SSRF proxy to read internal-only resources.
 *
 * Known limitation: this checks the URL *syntax*. It does not resolve DNS, so
 * a hostname that resolves to a private address (DNS rebinding) still passes.
 * Full protection would require pinning the resolved IP before connecting.
 */

const BLOCKED_HOST_SUFFIXES = [".local", ".internal", ".localhost", ".home.arpa"];
const BLOCKED_HOSTNAMES = new Set([
  "localhost",
  "localhost.localdomain",
  "ip6-localhost",
  "ip6-loopback",
  "metadata",
  "metadata.google.internal",
]);

function isPrivateIPv4(host: string): boolean {
  const octets = host.split(".").map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const [a, b] = octets;
  if (a === 0 || a === 10 || a === 127) return true; // "this network", private, loopback
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved / broadcast
  return false;
}

function isPrivateIPv6(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  if (h === "::" || h === "::1") return true; // unspecified / loopback
  if (h.startsWith("fe80")) return true; // link-local
  if (h.startsWith("fc") || h.startsWith("fd")) return true; // unique-local
  const mapped = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/.exec(h);
  if (mapped) return isPrivateIPv4(mapped[1]);
  return false;
}

/**
 * Validates an externally-fetched URL.
 * @returns the parsed URL when it is safe to fetch.
 * @throws AppError(400) for anything that is not a public http(s) URL.
 */
export function assertPublicHttpUrl(raw: string, field = "url"): URL {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, `${field} must be a valid absolute URL`, 400);
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} must use http or https`,
      400,
    );
  }

  // `url.hostname` is already percent-decoded and, for IPv6, wrapped in `[]`.
  const host = url.hostname.toLowerCase();
  const bare = host.replace(/^\[|\]$/g, "");

  if (
    BLOCKED_HOSTNAMES.has(bare) ||
    BLOCKED_HOST_SUFFIXES.some((suffix) => bare.endsWith(suffix))
  ) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} must point at a public host`,
      400,
    );
  }

  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(bare) && isPrivateIPv4(bare)) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} must point at a public host`,
      400,
    );
  }

  if (bare.includes(":") && isPrivateIPv6(bare)) {
    throw new AppError(
      ErrorCodes.VALIDATION_ERROR,
      `${field} must point at a public host`,
      400,
    );
  }

  if (url.username || url.password) {
    throw new AppError(ErrorCodes.VALIDATION_ERROR, `${field} must not embed credentials`, 400);
  }

  return url;
}

/**
 * Clamps an untrusted integer query parameter.
 * Defaults are applied for non-integers, out-of-range values and `NaN`, so an
 * attacker can never use `top_k=1000000` (or `Infinity`) to over-fetch.
 */
export function clampInt(value: unknown, fallback: number, min: number, max: number): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.trunc(parsed)));
}
