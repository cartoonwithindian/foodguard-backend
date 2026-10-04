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

function isPrivateIPv4(octets: number[]): boolean {
  const [a, b] = octets;
  if (a === undefined) return true; // fail closed
  if (a === 0 || a === 10 || a === 127) return true; // "this network", private, loopback
  if (a === 169 && b === 254) return true; // link-local incl. cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true; // private
  if (a === 192 && b === 168) return true; // private
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
  if (a >= 224) return true; // multicast / reserved / broadcast
  return false;
}

/** Same test as {@link isPrivateIPv4} but for a dotted-quad string. */
function isPrivateIPv4Text(host: string): boolean {
  if (!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;
  return isPrivateIPv4(host.split(".").map(Number));
}

/** Two 16-bit groups -> the four IPv4 octets they encode. */
function v4FromGroups(hi: number, lo: number): number[] {
  return [(hi >> 8) & 255, hi & 255, (lo >> 8) & 255, lo & 255];
}

/**
 * Expands any IPv6 textual form into its 8 numeric 16-bit groups.
 * Handles `::` compression, an embedded dotted-quad tail, and a zone id.
 * @returns null when the input is not a well-formed IPv6 literal.
 */
function expandIPv6(input: string): number[] | null {
  let s = input.toLowerCase().replace(/^\[|\]$/g, "");
  const zone = s.indexOf("%");
  if (zone !== -1) s = s.slice(0, zone);
  if (!s.includes(":")) return null;

  // `::ffff:127.0.0.1` -> rewrite the dotted tail into two hex groups so the
  // generic parser below can handle it. (WHATWG URL already normalises the
  // dotted form to hex, so both spellings have to work.)
  if (s.includes(".")) {
    const cut = s.lastIndexOf(":");
    if (cut < 0) return null;
    const parts = s.slice(cut + 1).split(".");
    if (parts.length !== 4 || parts.some((p) => !/^\d{1,3}$/.test(p))) return null;
    const o = parts.map(Number);
    if (o.some((n) => n < 0 || n > 255)) return null;
    s = `${s.slice(0, cut + 1)}${((o[0] << 8) | o[1]).toString(16)}:${((o[2] << 8) | o[3]).toString(16)}`;
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;
  const parse = (part: string) =>
    part === "" ? [] : part.split(":").map((g) => (/^[0-9a-f]{1,4}$/.test(g) ? parseInt(g, 16) : NaN));

  const head = parse(halves[0]);
  const tail = halves.length === 2 ? parse(halves[1]) : [];
  const words = [...head, ...tail];
  if (words.some((w) => !Number.isInteger(w))) return null;

  if (halves.length === 2) {
    const fill = 8 - words.length;
    if (fill < 1) return null; // "::" must stand for at least one group
    return [...head, ...new Array<number>(fill).fill(0), ...tail];
  }
  return words.length === 8 ? words : null;
}

/**
 * True when the literal is non-public. Every IPv6 form that *embeds* an IPv4
 * address is unwrapped and re-checked, because each of them reaches the same
 * socket: an attacker just has to pick a spelling the naive check misses.
 *   - `::ffff:a.b.c.d` / `::ffff:7f00:1`  IPv4-mapped (hex and dotted)
 *   - `::a.b.c.d`                          IPv4-compatible (deprecated)
 *   - `2002:7f00:1::`                      6to4
 *   - `64:ff9b::7f00:1`                    NAT64 well-known prefix
 *   - `2001:0:...`                         Teredo
 * Fails closed: an unparseable literal is treated as private.
 */
function isPrivateIPv6(host: string): boolean {
  const g = expandIPv6(host);
  if (!g) return true;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = g;

  if (g0 === 0x2002) return isPrivateIPv4(v4FromGroups(g1, g2)); // 6to4
  if (g0 === 0x2001 && g1 === 0x0000) return isPrivateIPv4(v4FromGroups(g6, g7)); // Teredo
  if (g0 === 0x0064 && g1 === 0xff9b) return isPrivateIPv4(v4FromGroups(g6, g7)); // NAT64
  if (g0 === 0x2001 && g1 === 0x0db8) return true; // documentation 2001:db8::/32
  if (g0 === 0x2001 && g1 === 0x0002) return true; // benchmarking 2001:2::/48
  if (g0 === 0x0100 && g1 === 0 && g2 === 0 && g3 === 0) return true; // 100::/64 discard
  if (g0 === 0x3ffe) return true; // 6bone
  if ((g0 & 0xfe00) === 0xfc00) return true; // fc00::/7 unique-local
  if ((g0 & 0xfe00) === 0xfe00) return true; // fe00::/9 link-local + site-local
  if ((g0 & 0xff00) === 0xff00) return true; // ff00::/8 multicast

  const zeroPrefix = g0 === 0 && g1 === 0 && g2 === 0 && g3 === 0 && g4 === 0;
  if (zeroPrefix && (g5 === 0 || g5 === 0xffff)) {
    // Covers `::`, `::1`, ::a.b.c.d (compatible) and ::ffff:a.b.c.d (mapped).
    return isPrivateIPv4(v4FromGroups(g6, g7));
  }
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

  if (isPrivateIPv4Text(bare)) {
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
