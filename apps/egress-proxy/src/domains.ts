// @rhema/egress-proxy — best-effort registrable-domain extraction (§12.8d novel-domain cap; §12.6).
//
// A full Public Suffix List is out of scope for Phase 0; this is the same best-effort the hook uses (hostname
// heuristics). It takes the last two labels, with a small allowance for common two-level public suffixes
// (co.uk, com.au, …) so `bbc.co.uk` and `news.bbc.co.uk` collapse to one registrable domain. Good enough for
// a per-run distinct-domain heuristic cap; the hard hold-out leak audit is path-level and lives in the hook.

/** A small set of common two-level public suffixes so `example.co.uk` is one registrable domain, not `co.uk`. */
const TWO_LEVEL_SUFFIXES = new Set<string>([
  "co.uk",
  "org.uk",
  "gov.uk",
  "ac.uk",
  "co.jp",
  "co.nz",
  "co.za",
  "com.au",
  "net.au",
  "org.au",
  "com.br",
  "com.cn",
  "com.mx",
]);

/** Lowercase hostname of a URL, or `null` if it does not parse. */
export function hostnameOf(raw: string): string | null {
  try {
    return new URL(raw).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/**
 * Best-effort registrable domain of a URL (or bare hostname). Returns the last two labels, or the last three
 * when the last two form a known two-level public suffix. `null` when there is no usable host.
 */
export function registrableDomainOf(raw: string): string | null {
  // A URL, or a bare hostname (letters/digits/dots/hyphens with at least one dot — not arbitrary text).
  const bareHost = /^[a-z0-9.-]+\.[a-z0-9.-]+$/i.test(raw.trim()) ? raw.trim().toLowerCase() : null;
  const host = hostnameOf(raw) ?? bareHost;
  if (!host) return null;
  const labels = host.split(".").filter(Boolean);
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  if (TWO_LEVEL_SUFFIXES.has(lastTwo)) return labels.slice(-3).join(".");
  return lastTwo;
}
