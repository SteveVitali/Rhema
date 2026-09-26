import { isIP } from "node:net";

// SSRF IP denylist (REQ-ARCH-22; §13.3). The fetcher is the only arbitrary-egress component, so this is the
// load-bearing control: every resolved IP of every redirect hop is checked against the blocked ranges below.
// This defeats DNS rebinding (we re-resolve and re-check on each hop) and IP-literal targets alike. Covers
// RFC1918, loopback, link-local (incl. the cloud metadata endpoints 169.254.169.254 / 169.254.170.2 and their
// IPv6-mapped forms), CGNAT, ULA, documentation/benchmark/reserved/multicast ranges, and IPv4-in-IPv6.

interface Cidr4 {
  readonly net: number;
  readonly bits: number;
}

function v4ToInt(ip: string): number | null {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const b = Number(p);
    if (b > 255) return null;
    n = (n << 8) | b;
  }
  return n >>> 0;
}

function cidr4(range: string): Cidr4 {
  const [addr, bitsStr] = range.split("/");
  const net = v4ToInt(addr!)!;
  const bits = Number(bitsStr);
  return { net, bits };
}

// The blocked IPv4 ranges (RFC 5735/6598/3927 + documentation/benchmark/reserved).
const BLOCKED_V4: Cidr4[] = [
  "0.0.0.0/8", // "this" network / unspecified
  "10.0.0.0/8", // RFC1918 private
  "100.64.0.0/10", // CGNAT (RFC6598)
  "127.0.0.0/8", // loopback
  "169.254.0.0/16", // link-local (incl. IMDS 169.254.169.254 + ECS 169.254.170.2)
  "172.16.0.0/12", // RFC1918 private
  "192.0.0.0/24", // IETF protocol assignments
  "192.0.2.0/24", // TEST-NET-1 (documentation)
  "192.168.0.0/16", // RFC1918 private
  "198.18.0.0/15", // benchmarking
  "198.51.100.0/24", // TEST-NET-2
  "203.0.113.0/24", // TEST-NET-3
  "224.0.0.0/4", // multicast
  "240.0.0.0/4", // reserved (incl. 255.255.255.255 broadcast)
].map(cidr4);

function v4Blocked(int: number): boolean {
  return BLOCKED_V4.some(({ net, bits }) => {
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (int & mask) >>> 0 === (net & mask) >>> 0;
  });
}

/** Expand an IPv6 address to a 128-bit BigInt, extracting an embedded IPv4 tail if present. */
function v6ToBigInt(ip: string): bigint | null {
  let s = ip;
  // strip a zone id (fe80::1%eth0)
  const pct = s.indexOf("%");
  if (pct >= 0) s = s.slice(0, pct);

  // embedded IPv4 (e.g. ::ffff:192.168.0.1 or ::192.168.0.1) → convert the tail to two hextets
  const dot = s.lastIndexOf(":");
  if (s.includes(".")) {
    const tail = s.slice(dot + 1);
    const v4 = v4ToInt(tail);
    if (v4 == null) return null;
    const hi = (v4 >>> 16) & 0xffff;
    const lo = v4 & 0xffff;
    s = s.slice(0, dot + 1) + hi.toString(16) + ":" + lo.toString(16);
  }

  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0]!.split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1]!.split(":") : [];
  const missing = 8 - head.length - tail.length;
  if (missing < 0) return null;
  if (halves.length === 1 && head.length !== 8) return null;
  const groups =
    halves.length === 2 ? [...head, ...Array(missing).fill("0"), ...tail] : head;
  if (groups.length !== 8) return null;

  let n = 0n;
  for (const g of groups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(g)) return null;
    n = (n << 16n) | BigInt(parseInt(g, 16));
  }
  return n;
}

function inV6Prefix(addr: bigint, prefix: bigint, bits: number): boolean {
  const shift = BigInt(128 - bits);
  return addr >> shift === prefix >> shift;
}

const V6_ZERO = 0n;
const V6_LOOPBACK = 1n;
const FC00 = 0xfc00n << 112n; // fc00::/7 (ULA)
const FE80 = 0xfe80n << 112n; // fe80::/10 (link-local)
const FF00 = 0xff00n << 112n; // ff00::/8 (multicast)
const V6_DOC = 0x20010db8n << 96n; // 2001:db8::/32 (documentation)
const V4_MAPPED = 0xffffn << 32n; // ::ffff:0:0/96
const V4_MAPPED_MASK = (1n << 128n) - (1n << 32n); // top 96 bits
const NAT64 = 0x0064ff9bn << 64n; // 64:ff9b::/96

function v6Blocked(ip: string): boolean {
  const n = v6ToBigInt(ip);
  if (n == null) return true; // unparseable ⇒ blocked (fail closed)
  if (n === V6_ZERO || n === V6_LOOPBACK) return true;
  // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d, top-96 zero, deprecated) and NAT64
  // (64:ff9b::/96) all embed an IPv4 address in the low 32 bits — check it against the v4 rules so tricks like
  // `::ffff:169.254.169.254` or `::a9fe:a9fe` cannot slip a metadata IP past the v6 checks.
  if ((n & V4_MAPPED_MASK) === V4_MAPPED || n >> 32n === 0n || inV6Prefix(n, NAT64, 96)) {
    return v4Blocked(Number(n & 0xffffffffn) >>> 0);
  }
  if (inV6Prefix(n, FC00, 7)) return true;
  if (inV6Prefix(n, FE80, 10)) return true;
  if (inV6Prefix(n, FF00, 8)) return true;
  if (inV6Prefix(n, V6_DOC, 32)) return true;
  return false;
}

/** True if `ip` (an IPv4 or IPv6 literal) is in a blocked range. A non-IP string is blocked (fail closed). */
export function isBlockedIp(ip: string): boolean {
  const kind = isIP(ip);
  if (kind === 4) {
    const int = v4ToInt(ip);
    return int == null ? true : v4Blocked(int);
  }
  if (kind === 6) return v6Blocked(ip);
  return true;
}

/** Resolve a hostname to every A/AAAA address (the seam is injected so tests can simulate DNS rebinding). */
export type DnsResolver = (host: string) => Promise<string[]>;

export interface HostCheck {
  readonly ok: boolean;
  readonly ip?: string;
  readonly reason?: string;
}

/**
 * Assert a host is safe to connect to: an IP literal is checked directly; a hostname is resolved and EVERY
 * resolved address must be public (a single blocked record fails the whole host). Called on every redirect hop
 * with a fresh resolution, so DNS rebinding (public-then-private) is caught at the hop it flips.
 */
export async function assertPublicHost(rawHost: string, resolve: DnsResolver): Promise<HostCheck> {
  // `new URL(...).hostname` keeps the brackets around an IPv6 literal (`[::1]`) and may carry a trailing dot;
  // strip both so `net.isIP` recognises the literal and we don't fall through to DNS (which would treat a
  // bracketed/dotted literal as a name).
  const host = rawHost.replace(/^\[/, "").replace(/\]$/, "").replace(/\.$/, "");
  if (isIP(host)) {
    return isBlockedIp(host)
      ? { ok: false, ip: host, reason: "blocked IP literal" }
      : { ok: true, ip: host };
  }
  let addrs: string[];
  try {
    addrs = await resolve(host);
  } catch {
    return { ok: false, reason: "DNS resolution failed" };
  }
  if (addrs.length === 0) return { ok: false, reason: "no DNS records" };
  for (const a of addrs) {
    if (isBlockedIp(a)) return { ok: false, ip: a, reason: "host resolves to a blocked IP" };
  }
  return { ok: true, ip: addrs[0] };
}
