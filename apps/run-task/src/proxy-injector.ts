// @rhema/run-task — the harness-side per-request proxy-credential injector + the proxy's validation rule
// (REQ-SPEC-11; §12.4 step 4, §12.7).
//
// The proxy is the meter of record AND the only route out of the sandbox. It presents the provider key ONLY
// for requests carrying a valid per-run proxy credential whose orchestrator-issued allowlist names the
// endpoints this run may call. The credential lives with uid `harness`; the harness-side SDK wrapper injects
// it PER REQUEST (`injectProxyCredential`). A shell escape from uid `agent` (`node -e`, curl) has no
// credential — so the proxy refuses it with 403 `egress.denied` and it reaches neither the provider nor an
// unmetered inference channel. `validateProxyRequest` is the reference rule; P0.07 owns the live proxy and
// DUPLICATES it (defense in depth, deliberate — not shared code).

/** The header the harness wrapper stamps on every outbound request (never in the agent's env). */
export const PROXY_CREDENTIAL_HEADER = "x-rhema-proxy-credential";

/** Inject the per-run credential into an outbound request's headers (harness-side). Returns a new object. */
export function injectProxyCredential(
  headers: Readonly<Record<string, string>>,
  credential: string,
): Record<string, string> {
  return { ...headers, [PROXY_CREDENTIAL_HEADER]: credential };
}

export interface ProxyAllowlist {
  /** provider endpoint hosts this run may call (e.g. the Claude Platform base host). */
  readonly hosts: readonly string[];
}

export interface ProxyValidation {
  readonly ok: boolean;
  readonly status: number;
  readonly reason?: string;
}

/**
 * The proxy's accept/refuse rule (REQ-SPEC-11): a request is served only when it carries the run's exact
 * credential AND its target host is on the run's allowlist. A missing/wrong credential → 403 `egress.denied`;
 * an off-allowlist host → 403. This is the check a credential-less shell escape fails.
 */
export function validateProxyRequest(input: {
  headers: Readonly<Record<string, string>>;
  host: string;
  expectedCredential: string;
  allowlist: ProxyAllowlist;
}): ProxyValidation {
  const presented = input.headers[PROXY_CREDENTIAL_HEADER];
  if (!presented) return { ok: false, status: 403, reason: "missing proxy credential (egress.denied)" };
  if (presented !== input.expectedCredential) {
    return { ok: false, status: 403, reason: "invalid proxy credential (egress.denied)" };
  }
  if (!input.allowlist.hosts.includes(input.host)) {
    return { ok: false, status: 403, reason: `host ${input.host} not on the run allowlist (egress.denied)` };
  }
  return { ok: true, status: 200 };
}
