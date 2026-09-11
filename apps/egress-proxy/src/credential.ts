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

/** True when `model` is on the run's allowlist. An empty/absent model is NOT allowed (must be explicit). */
export function isModelAllowed(allowlist: { models: readonly string[] }, model: string | undefined): boolean {
  return typeof model === "string" && model.length > 0 && allowlist.models.includes(model);
}
