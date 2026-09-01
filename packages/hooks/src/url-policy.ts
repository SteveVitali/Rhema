// @rhema/hooks — per-run URL policy (§12.6 URL layer; REQ-DATA-15 amended).
//
// The hook is the in-container URL check; the proxy (P0.07) duplicates it (defense in depth, deliberately
// not shared code — ticket Notes). Rule order: server-fetch disablement first (persona builder / calibrator
// route every fetch through the client `fetcher`), then blocked domains, then hold-outs (with the
// calibrator's allow-after-prediction exception), then user exclusions.

import type { FetchDenyReason, UrlPolicy } from "./types.js";

export interface UrlDecision {
  readonly decision: "allow" | "deny";
  readonly reason?: string;
  readonly denyReason?: FetchDenyReason;
  readonly normalizedUrl: string;
}

/**
 * Normalize a URL for path-level policy matching: lowercase scheme+host, strip a default port and a
 * trailing slash, drop the fragment. Query is preserved (a hold-out may differ from its corpus only by
 * query). A non-URL string is returned trimmed (still matched literally against the policy lists).
 */
export function normalizeUrl(raw: string): string {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return raw.trim();
  }
  u.hash = "";
  u.hostname = u.hostname.toLowerCase();
  u.protocol = u.protocol.toLowerCase();
  if ((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443")) {
    u.port = "";
  }
  let s = u.toString();
  if (s.endsWith("/") && !s.endsWith("://") && u.search === "") s = s.slice(0, -1);
  return s;
}

/** Registrable-ish host of a normalized URL (best-effort: the hostname), for domain-list matching. */
function hostOf(normalized: string): string | null {
  try {
    return new URL(normalized).hostname.toLowerCase();
  } catch {
    return null;
  }
}

/** scheme://host/path of a normalized URL, dropping query + fragment — the key hold-outs match on. */
function pathKey(normalized: string): string {
  try {
    const u = new URL(normalized);
    return `${u.protocol}//${u.host}${u.pathname}`;
  } catch {
    return normalized;
  }
}

/**
 * True if `normalized` matches any entry in `list`. Matching is on scheme+host+PATH, ignoring the query, so
 * an appended `?d=<exfil>` cannot slip a hold-out past the check (Finding 4 / §12.8 outbound channel). A
 * list entry matches its own path and any path beneath it.
 */
function matchesUrl(normalized: string, list: readonly string[]): boolean {
  const c = pathKey(normalized);
  return list.some((entry) => {
    const e = pathKey(normalizeUrl(entry));
    return c === e || c.startsWith(e.endsWith("/") ? e : e + "/");
  });
}

/**
 * Evaluate a fetch URL against the run's policy. `isCalibrator` marks the input-scoped holdout-calibrator
 * subagent, whose `calibratorAllow` hold-outs open only once `predictionFileWritten` is set. `viaFetcher`
 * marks a call from the client-side `fetcher` tool (not the server `WebFetch` tool): the persona builder
 * and calibrator have server `web_fetch` disabled but fetch through `fetcher`, so `serverFetchDisabled`
 * only short-circuits a server call — the fetcher path reaches the calibrator's allow-after-prediction rule
 * (Finding 3 / §12.6).
 */
export function evaluateUrl(
  url: string,
  policy: UrlPolicy,
  opts: { isCalibrator?: boolean; viaFetcher?: boolean } = {},
): UrlDecision {
  const normalizedUrl = normalizeUrl(url);

  if (policy.serverFetchDisabled && !opts.viaFetcher) {
    return {
      decision: "deny",
      denyReason: "policy",
      reason: "server web_fetch is disabled for this seat; fetch via the client-side fetcher",
      normalizedUrl,
    };
  }

  const host = hostOf(normalizedUrl);
  if (host && policy.blockedDomains?.some((d) => host === d || host.endsWith("." + d))) {
    return { decision: "deny", denyReason: "paywall", reason: "blocked domain (robots/paywall)", normalizedUrl };
  }

  if (matchesUrl(normalizedUrl, policy.holdouts)) {
    const calibratorMayFetch =
      opts.isCalibrator && policy.predictionFileWritten && matchesUrl(normalizedUrl, policy.calibratorAllow);
    if (calibratorMayFetch) {
      return { decision: "allow", normalizedUrl };
    }
    return { decision: "deny", denyReason: "holdout", reason: "hold-out URL", normalizedUrl };
  }

  if (matchesUrl(normalizedUrl, policy.userExclusions)) {
    return { decision: "deny", denyReason: "policy", reason: "user-excluded source", normalizedUrl };
  }

  return { decision: "allow", normalizedUrl };
}
