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
 * Whether — and how much — server-side web research is enabled for this run (§12.6; P0.15i). The vendored
 * `claude` CLI does NOT reliably add Anthropic's server-side web_search tool to the `/v1/messages` request
 * (proven live at P0.15h: `usage_records.searches = 0`), so the proxy — the run's single meter of record and
 * its only network path — GUARANTEES the tool is present. Absent ⇒ BOTH web_search and web_fetch default ON (both
 * GA, no beta header); their RESULT urls give `cited⇒fetched` its provenance (the fact-check must fetch the
 * specific sources it cites, not only see them in a search result — see `fetch`).
 *
 * SCOPED SUBAGENTS: the run's credential — and thus this policy — is shared by the harness and every §12.6
 * input-scoped subagent (second-reader / fidelity-auditor / gap-analyst / holdout-calibrator), which are
 * `tools:["Read"]`, draft-only, and must NOT do web research. Because server web tools bypass the client
 * `allowedTools` list, whoever mints those scoped contexts (the orchestrator, when the phase-level scoped-query
 * machinery lands — [[D-P0.15h-5]]) MUST set `{search:false, fetch:false}` on them. Today those scoped roles
 * are not launched live, so the default-ON search only reaches the main research phases.
 */
export interface WebToolPolicy {
  /** Inject the server web_search tool when the request lacks one (default true — GA, no beta header). */
  readonly search?: boolean;
  /**
   * Inject the server web_fetch tool when the request lacks one (default TRUE). `web_fetch_20250910` is GA and
   * needs no beta header (verified live 2026-09-10). It is required for `cited⇒fetched`: the fact-check must
   * FETCH the specific sources it cites (search results, the draft's own citations) so their URLs land in the
   * proxy fetch log — search alone leaves search-adjacent citations un-fetched and delivery fails
   * `cited_not_fetched`. web_fetch only reaches URLs already in the conversation, and the outbound guards
   * (query-strip + novel-domain cap) bound the channel.
   */
  readonly fetch?: boolean;
  /** `max_uses` for the injected web_search tool (default `DEFAULT_WEB_SEARCH_MAX_USES`). */
  readonly searchMaxUses?: number;
  /** `max_uses` for the injected web_fetch tool (default `DEFAULT_WEB_FETCH_MAX_USES`). */
  readonly fetchMaxUses?: number;
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
   * Server-side web-research policy (§12.6; P0.15i). Absent ⇒ both server web tools default ON (see
   * `WebToolPolicy`) so the fact-check does real, proxy-logged research and `cited⇒fetched` has provenance.
   */
  readonly webTools?: WebToolPolicy;
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
