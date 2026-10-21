// @rhema/egress-proxy — the credential gate + header scrub (REQ-SPEC-11, REQ-SPEC-10; §12.7).
//
// DELIBERATELY a second, independent implementation of the accept/refuse rule that run-task's proxy-injector
// states as its reference (ticket Notes: defense in depth, NOT shared code). The proxy presents the provider
// key only for a request carrying a valid per-run credential whose allowlist names the endpoint + model; a
// credential-less or off-allowlist request is 403 `egress.denied`. Any `Authorization`/`x-api-key` the sandbox
// sent is stripped and NEVER forwarded (AC5) — a prompt-injected Editor cannot smuggle its own key past the
// meter. The proxy credential + the internal agent-id header are harness-only and never leave the proxy.

/** The header the harness-side SDK wrapper stamps on every request (wire contract — matches run-task). */
export const PROXY_CREDENTIAL_HEADER = "x-rhema-proxy-credential";

/** Optional harness-stamped subagent attribution (§12.7 agent_id). Never forwarded upstream. */
export const AGENT_ID_HEADER = "x-rhema-agent-id";

/**
 * The harness-stamped phase identity for the research floor (RES.1; REQ-SPEC-31(2)). The credential
 * injector (uid `harness`) stamps the current phase's `phaseClass` on every request it forwards — the
 * AGENT can never set it (the injector drops any agent-supplied copy before stamping). The proxy reads
 * it to decide whether the request may draw on the run's reserved verification floor: `"research"` and
 * `"preflight"` (the harness's own probe) are floor-eligible; anything else (or absent) is not. Never
 * forwarded upstream.
 */
export const PHASE_CLASS_HEADER = "x-rhema-phase-class";

/**
 * The harness-stamped step identity for per-request usage attribution (RPT.1; §14.5 Level 4). The
 * credential injector stamps `step:<key>` for the phase currently running; the proxy folds it into
 * `usage_records.step_id` so the report's per-request drill-down attributes burn to the phase that
 * made it. Never forwarded upstream.
 */
export const STEP_HEADER = "x-rhema-step";

/**
 * Request headers the proxy must never forward to the provider: the sandbox's own credentials (stripped so it
 * cannot bill outside the meter), the proxy's internal headers, and hop-by-hop headers the forward client
 * re-derives. All lowercase — node lowercases incoming header names.
 */
const NEVER_FORWARD = new Set<string>([
  "authorization",
  "x-api-key",
  "proxy-authorization",
  PROXY_CREDENTIAL_HEADER,
  AGENT_ID_HEADER,
  PHASE_CLASS_HEADER,
  STEP_HEADER,
  "cookie",
  "host",
  "connection",
  "keep-alive",
  "proxy-connection",
  "transfer-encoding",
  "upgrade",
  "te",
  "trailer",
  "content-length",
  // The proxy is the METER OF RECORD (§12.7) and the fetch log of record (§12.6): it must be able to READ the
  // provider response it forwards — to meter usage and to log the `web_search_tool_result` source URLs that
  // back `cited⇒fetched`. If the sandbox's `accept-encoding: gzip` reaches the provider, the response comes
  // back gzip-compressed; the proxy streams those bytes straight through (the SDK decompresses fine) but
  // accumulates the COMPRESSED body for metering, so its SSE/JSON parsers silently see garbage — no usage rows,
  // no fetch rows, and delivery fails `cited_not_fetched` even though the search ran (diagnosed live P0.15i,
  // 2026-09-09: `searches` present only as `sdk_stream`, zero `fetch_log` result rows). Stripping it forces an
  // uncompressed response the proxy can parse; the proxy holds no decompression path today.
  "accept-encoding",
]);

/** Lowercase every header key (node already does this for incoming requests; belt for constructed inputs). */
function lower(headers: Readonly<Record<string, string>>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) out[k.toLowerCase()] = v;
  return out;
}

/** The per-request proxy credential the sandbox presented (harness-injected), or `undefined`. */
export function presentedCredential(headers: Readonly<Record<string, string>>): string | undefined {
  return lower(headers)[PROXY_CREDENTIAL_HEADER];
}

/** The harness-stamped agent id for subagent attribution, or `undefined` (falls back to the run's default). */
export function presentedAgentId(headers: Readonly<Record<string, string>>): string | undefined {
  return lower(headers)[AGENT_ID_HEADER];
}

/** The harness-stamped phase class for the research floor, or `undefined` (unstamped ⇒ not floor-eligible). */
export function presentedPhaseClass(headers: Readonly<Record<string, string>>): string | undefined {
  return lower(headers)[PHASE_CLASS_HEADER];
}

/** The harness-stamped step id for per-request attribution (`step:<key>`), or `undefined` (RPT.1). */
export function presentedStep(headers: Readonly<Record<string, string>>): string | undefined {
  const v = lower(headers)[STEP_HEADER];
  return typeof v === "string" && v.length > 0 && v.length <= 128 ? v : undefined;
}

/**
 * Strip the sandbox's own auth headers (AC5): remove `Authorization` and `x-api-key` so they can never reach
 * the provider. Returns a new object; used as the visible unit-tested guarantee (the full upstream header set
 * is built by `buildUpstreamHeaders`).
 */
export function stripSandboxAuth(headers: Readonly<Record<string, string>>): Record<string, string> {
  const out = lower(headers);
  delete out["authorization"];
  delete out["x-api-key"];
  return out;
}

/**
 * Build the header set to send upstream: drop everything in `NEVER_FORWARD` (sandbox creds, proxy internals,
 * hop-by-hop), then inject the provider key as `x-api-key` — the ONLY credential that reaches the provider,
 * and only on an already-validated credentialed request.
 */
export function buildUpstreamHeaders(
  headers: Readonly<Record<string, string>>,
  providerKey: string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(lower(headers))) {
    if (!NEVER_FORWARD.has(k)) out[k] = v;
  }
  out["x-api-key"] = providerKey;
  return out;
}

/** True when `host` + `path` fall inside one of the run's allowlisted endpoints (exact host, path prefix). */
export function isEndpointAllowed(
  allowlist: { endpoints: readonly { host: string; pathPrefix: string }[] },
  host: string,
  path: string,
): boolean {
  const h = host.toLowerCase();
  return allowlist.endpoints.some((e) => e.host.toLowerCase() === h && path.startsWith(e.pathPrefix));
}

/**
 * True when `model` is on the run's allowlist. An empty/absent model is NOT allowed (must be
 * explicit). R6FOR.1: allowlist entries are family names (`MODELS_BY_TIER` carries
 * `claude-haiku-4-5`) while seats may send the dated API id (`claude-haiku-4-5-20251001`) —
 * exact `includes` denied those requests live (`model ... is not on the run allowlist` on
 * three review runs). Match the entry verbatim OR the family + `-` prefix boundary; a suffix
 * without the dash (`claude-haiku-4-5x`) still denies.
 */
export function isModelAllowed(allowlist: { models: readonly string[] }, model: string | undefined): boolean {
  if (typeof model !== "string" || model.length === 0) return false;
  const m = model.toLowerCase();
  return allowlist.models.some((entry) => {
    const e = entry.toLowerCase();
    return m === e || m.startsWith(`${e}-`);
  });
}
