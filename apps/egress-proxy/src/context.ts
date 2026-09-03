// @rhema/egress-proxy — the per-run context the proxy resolves from a credential (§12.4 step 4, §12.7).
//
// P0.08 (run orchestration) MINTS the credential and AUTHORS the allowlist at provision; this ticket only
// VALIDATES and CONSUMES them. The `RunContextResolver` is the DI seam P0.08 fills (a DB lookup of
// `proxy_credentials` → the run + its `proxy_allowlists` row). The proxy is outside the sandbox's reach, so
// everything here is server-side truth: nothing a request BODY carries can change the run's cap, allowlist,
// URL policy or attribution. A credential that resolves to no run is refused (403 `egress.denied`).

/** One endpoint the run may reach: an exact host plus a path prefix (e.g. api.anthropic.com + /v1/messages). */
export interface AllowedEndpoint {
  readonly host: string;
  readonly pathPrefix: string;
}

/**
 * The orchestrator-issued allowlist bound to the run's credential (§12.7): the provider endpoints and models
 * this run may call. URL policy + cap live on the `RunContext` alongside it. Authored by P0.08; a request
 * outside it is 403 `egress.denied`.
 */
export interface RunAllowlist {
  readonly endpoints: readonly AllowedEndpoint[];
  /** Model ids this run may request (canonical or dated). An off-allowlist model is 403 (AC1). */
  readonly models: readonly string[];
}

/**
 * The proxy's own URL policy (§12.6 URL layer). DELIBERATELY independent of `@rhema/hooks` — the proxy is a
 * second, defense-in-depth enforcement point, not shared code (ticket Notes). Only the domain-level lists the
 * proxy injects into server-tool bodies live here; the hook enforces the path-level policy in-container.
 */
export interface ProxyUrlPolicy {
  /** Registrable domains injected as `blocked_domains` into server-tool bodies (hold-outs, exclusions, paywall). */
  readonly blockedDomains: readonly string[];
  /** Registrable domains injected as `allowed_domains` (calibrator-only narrowing); usually empty. */
  readonly allowedDomains?: readonly string[];
}

/**
 * Everything the proxy needs to serve, meter, cap, rewrite and log one run's requests. Resolved from the
 * per-run credential; all fields are server-side truth (§12.7). The metering/attribution fields mirror the
 * NOT-NULL columns of `usage_records`.
 */
export interface RunContext {
  readonly runId: string;
  readonly attempt: number;
  /** Default attributing agent id; a credentialed (harness-originated) request may override per subagent. */
  readonly agentId: string;
  /** The seat/role stamped on `usage_records.role` (e.g. "editor"). */
  readonly role: string;
  readonly workspaceId: string;
  readonly billingAccountId: string;
  readonly userId?: string;
  readonly projectId?: string;
  readonly personaId?: string;
  readonly agentInstanceId?: string;
  /** Provider name for `usage_records.provider`; the direct Anthropic API here (no SigV4/Marketplace). */
  readonly provider: string;
  readonly modelTier: string;
  readonly rateTableVersion: number;
  /** The run's cap in credits (`runs.cap_credits`); Σ metered credits ≥ this → 402 (§12.7). */
  readonly capCredits: number;
  readonly allowlist: RunAllowlist;
  readonly urlPolicy: ProxyUrlPolicy;
  /**
   * The draft text the run's `search.performed` queries are n-gram-diffed against (§12.8d). Supplied by the
   * orchestrator from committed draft state; the proxy never receives it from the sandbox. Absent ⇒ the
   * n-gram check is skipped for this run.
   */
  readonly draftText?: string;
  /** Registrable domains already in the claim ledger or a prior search result (§12.8d novel-domain cap). */
  readonly knownDomains?: readonly string[];
  /** Max DISTINCT novel fetched registrable domains before a fetch is refused (§12.8d). Absent ⇒ uncapped. */
  readonly novelDomainCap?: number;
}

/** The DI seam P0.08 fills: credential → run context, or `null` when the credential binds to no live run. */
export interface RunContextResolver {
  resolve(credential: string): Promise<RunContext | null> | RunContext | null;
}
