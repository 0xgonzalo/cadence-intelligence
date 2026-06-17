import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * fetch with an AbortController-backed timeout. Throws if the request takes
 * longer than `ms`. Partner adapters wrap their calls in this so a slow/hung
 * upstream can't stall a route handler past its maxDuration.
 */
export async function fetchWithTimeout(
  url: string,
  init: RequestInit = {},
  ms = 5000,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

// --- SSRF guard ------------------------------------------------------------
// User-supplied URLs (e.g. a track's audioUrl) are fetched server-side, so a
// crafted value could reach internal services or the cloud metadata endpoint.
// `assertSafeUrl` requires https and rejects any host that resolves to a
// non-global address; `safeFetch` re-validates on every redirect hop so a 3xx
// to an internal IP can't slip past the initial check.

function v4Bytes(addr: string): number[] | null {
  const parts = addr.split(".");
  if (parts.length !== 4) return null;
  const bytes = parts.map((p) => Number(p));
  if (bytes.some((b) => !Number.isInteger(b) || b < 0 || b > 255)) return null;
  return bytes;
}

function v6Bytes(input: string): number[] | null {
  let addr = input.split("%")[0]; // drop zone id
  const embedded = addr.match(/^(.*:)((?:\d{1,3}\.){3}\d{1,3})$/);
  if (embedded) {
    const v4 = v4Bytes(embedded[2]);
    if (!v4) return null;
    const hi = ((v4[0] << 8) | v4[1]).toString(16);
    const lo = ((v4[2] << 8) | v4[3]).toString(16);
    addr = `${embedded[1]}${hi}:${lo}`;
  }
  const halves = addr.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  let groups: string[];
  if (halves.length === 2) {
    const missing = 8 - (head.length + tail.length);
    if (missing < 1) return null;
    groups = [...head, ...Array(missing).fill("0"), ...tail];
  } else {
    groups = head;
  }
  if (groups.length !== 8) return null;
  const bytes: number[] = [];
  for (const g of groups) {
    const n = parseInt(g || "0", 16);
    if (!/^[0-9a-fA-F]{1,4}$/.test(g) || Number.isNaN(n)) return null;
    bytes.push((n >> 8) & 0xff, n & 0xff);
  }
  return bytes;
}

function isBlockedV4(b: number[]): boolean {
  const [a, c, d] = b;
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 100 && c >= 64 && c <= 127) return true; // CGNAT 100.64/10
  if (a === 169 && c === 254) return true; // link-local
  if (a === 172 && c >= 16 && c <= 31) return true; // 172.16/12
  if (a === 192 && c === 0 && d === 0) return true; // 192.0.0/24
  if (a === 192 && c === 168) return true; // 192.168/16
  if (a === 198 && (c === 18 || c === 19)) return true; // benchmarking 198.18/15
  if (a >= 224) return true; // multicast + reserved
  return false;
}

function isBlockedAddress(addr: string): boolean {
  const fam = isIP(addr);
  if (fam === 4) {
    const b = v4Bytes(addr);
    return !b || isBlockedV4(b);
  }
  if (fam === 6) {
    const b = v6Bytes(addr);
    if (!b) return true;
    const mapped =
      b.slice(0, 10).every((x) => x === 0) && b[10] === 0xff && b[11] === 0xff;
    if (mapped) return isBlockedV4(b.slice(12)); // ::ffff:a.b.c.d
    if (b.every((x) => x === 0)) return true; // ::
    if (b.slice(0, 15).every((x) => x === 0) && b[15] === 1) return true; // ::1
    if ((b[0] & 0xfe) === 0xfc) return true; // fc00::/7 unique-local
    if (b[0] === 0xfe && (b[1] & 0xc0) === 0x80) return true; // fe80::/10 link-local
    if (b[0] === 0xff) return true; // ff00::/8 multicast
    return false;
  }
  return true; // unparseable → block
}

/**
 * Validate a user-supplied URL for server-side fetching. Requires https and
 * rejects any host that resolves (DNS) to a loopback/private/link-local/
 * reserved address. Returns the parsed URL on success; throws otherwise.
 */
export async function assertSafeUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new Error("malformed url");
  }
  if (url.protocol !== "https:") {
    throw new Error("url must use https");
  }
  const host = url.hostname.replace(/^\[|\]$/g, "");
  const addrs = isIP(host)
    ? [host]
    : (await lookup(host, { all: true })).map((r) => r.address);
  if (addrs.length === 0) throw new Error("host does not resolve");
  for (const addr of addrs) {
    if (isBlockedAddress(addr)) {
      throw new Error("url resolves to a disallowed address");
    }
  }
  return url;
}

/**
 * SSRF-safe variant of {@link fetchWithTimeout} for user-supplied URLs:
 * validates the target, then follows redirects manually so each hop is
 * re-validated (a 302 to an internal IP is rejected, not followed).
 */
export async function safeFetch(
  raw: string,
  init: RequestInit = {},
  ms = 5000,
  maxRedirects = 3,
): Promise<Response> {
  let target = (await assertSafeUrl(raw)).toString();
  for (let hop = 0; hop <= maxRedirects; hop++) {
    const res = await fetchWithTimeout(
      target,
      { ...init, redirect: "manual" },
      ms,
    );
    if (res.status < 300 || res.status >= 400) return res;
    const location = res.headers.get("location");
    if (!location) return res;
    target = (await assertSafeUrl(new URL(location, target).toString())).toString();
  }
  throw new Error("too many redirects");
}
