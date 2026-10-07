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

/**
 * The harness-stamped phase identity for the research floor (RES.1; REQ-SPEC-31(2)). The credential
 * injector stamps the current phase's manifest `phaseClass` on every request it forwards — the AGENT can
 * never set it (the injector drops any agent-supplied copy before stamping), and the proxy treats anything
 * other than `"research"`/`"preflight"` as not floor-eligible. Wire contract duplicated with the proxy
 * (`credential.ts`), deliberately — defense in depth, not shared code.
 */
export const PHASE_CLASS_HEADER = "x-rhema-phase-class";

/**
 * The harness-stamped step identity for per-request usage attribution (RPT.1; §14.5 Level 4). The
 * credential injector stamps `step:<key>` for the phase currently running — the AGENT can never set
 * it (its copy is dropped before stamping), and the proxy folds it into `usage_records.step_id`.
 * Wire contract duplicated with the proxy (`credential.ts`), deliberately — defense in depth.
 */
export const STEP_HEADER = "x-rhema-step";

/** Inject the per-run credential into an outbound request's headers (harness-side). Returns a new object. */
export function injectProxyCredential(
  headers: Readonly<Record<string, string>>,
  credential: string,
): Record<string, string> {
  return { ...headers, [PROXY_CREDENTIAL_HEADER]: credential };
}

/**
 * Stamp the harness-side phase class beside the credential (RES.1). Any value the agent supplied is
 * dropped first — the stamp is authority, never an echo. `undefined` leaves the header absent
 * (the proxy reads absent as not floor-eligible — the safe default).
 */
export function stampPhaseClass(
  headers: Readonly<Record<string, string>>,
  phaseClass: string | undefined,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) if (k.toLowerCase() !== PHASE_CLASS_HEADER) out[k] = v;
  if (phaseClass !== undefined) out[PHASE_CLASS_HEADER] = phaseClass;
  return out;
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
