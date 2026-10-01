// Authoring the per-run proxy allowlist (§12.4 step 4; §12.7). At provision the orchestrator names exactly the
// provider endpoints, models and URL policy a run may use; the proxy refuses anything outside it (403) and
// meters against `capCredits`. The model set is by tier (§12.3 routing); URL policy carries the run's hold-out
// / user-excluded domains and the novel-domain cap (§12.8d). The exact per-tier model list is refined as the
// routing table is instrumented (§16.3); this is the MVP authoring.

import type { ModelTier, WorkflowKey } from "@rhema/contracts";
import { ASSISTANT_TURN_BUDGET } from "@rhema/contracts";
import type { RunAllowlistData, WebToolPolicyData } from "./resolver.js";

/** The Anthropic model ids each tier's phases may request (main + subagent models — §12.3). */
export const MODELS_BY_TIER: Readonly<Record<ModelTier, readonly string[]>> = {
  base: ["claude-sonnet-5", "claude-haiku-4-5"],
  balanced: ["claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5"],
  frontier: ["claude-opus-5", "claude-fable-5", "claude-sonnet-5", "claude-haiku-4-5"],
};

/** The direct Anthropic API is the only allowed provider endpoint at MVP (§12.3; no Vertex path). */
export const ANTHROPIC_ENDPOINT = { host: "api.anthropic.com", pathPrefix: "/v1/" } as const;

/**
 * The agent SDK's connectivity preconnect — `HEAD ${ANTHROPIC_BASE_URL}/api/hello` fired at CLI
 * init, before the first inference call (errors are swallowed SDK-side). The run's base URL points
 * at the proxy, so the probe transits the credential path like every other Anthropic call. An
 * allowlist without it 403s HEALTHY traffic once per run — counting `egress.denied` spikes against
 * the §13.5 `egress_denied_10m` SLO (STB.3 F7). Explicitly admitted: same provider host, one fixed
 * health path, no usage block → an `allow` fetch row only, nothing metered. Nothing else on the
 * host is widened — `/v1/` plus this path only.
 */
export const ANTHROPIC_PROBE_ENDPOINT = { host: "api.anthropic.com", pathPrefix: "/api/hello" } as const;

export interface AuthorAllowlistArgs {
  readonly modelTier: ModelTier;
  /** hold-out + user-excluded domains the URL policy blocks (anti-exfil; §12.6). */
  readonly blockedDomains?: readonly string[];
  /**
   * P1.21 (REQ-WF-8/REQ-GENRE-6) — a Memo run's `user_sources[]` domains: fetches to them are
   * `web_fetch_of_user_data` violations — denied at the proxy (logged `user_source`) and folded into
   * the injected tool's `blocked_domains` so the provider refuses the call too (defense in depth).
   */
  readonly userSourceDomains?: readonly string[];
  /** the §6.7 `web_fetch_of_user_data: 'forbidden'` marker — persisted on the run's URL policy. */
  readonly fetchUserDataForbidden?: boolean;
  /** calibrator-only narrowing; usually empty. */
  readonly allowedDomains?: readonly string[];
  /** domains already in the claim ledger / a search result — the known set for the novel-domain cap. */
  readonly knownDomains?: readonly string[];
  /** max distinct novel fetched registrable domains (§12.8d). */
  readonly novelDomainCap?: number;
  /** extra endpoints (e.g. a per-run fetcher host); the Anthropic endpoint is always included. */
  readonly extraEndpoints?: readonly { host: string; pathPrefix: string }[];
}

/** Build the run's allowlist (endpoints + models + URL policy) that provisioning persists and the proxy reads. */
export function authorRunAllowlist(args: AuthorAllowlistArgs): RunAllowlistData {
  return {
    endpoints: [ANTHROPIC_ENDPOINT, ANTHROPIC_PROBE_ENDPOINT, ...(args.extraEndpoints ?? [])],
    models: MODELS_BY_TIER[args.modelTier],
    urlPolicy: {
      blockedDomains: args.blockedDomains ?? [],
      ...(args.userSourceDomains && args.userSourceDomains.length > 0
        ? { userSourceDomains: args.userSourceDomains }
        : {}),
      ...(args.fetchUserDataForbidden === true ? { fetchUserDataForbidden: true } : {}),
      ...(args.allowedDomains ? { allowedDomains: args.allowedDomains } : {}),
      ...(args.knownDomains ? { knownDomains: args.knownDomains } : {}),
      ...(args.novelDomainCap != null ? { novelDomainCap: args.novelDomainCap } : {}),
    },
  };
}

// ---------------------------------------------------------------- research bound (PRB.22; D-PRB.21-1) ----

/**
 * The per-run web-research bound the proxy enforces (PRB.22). Live evidence (2026-09-22): an unbounded
 * verification phase issued 128 fetches + 13 searches on a 701-word draft and burned 6.65M cache-read
 * tokens — past every `ceil(1.5×estimate)` cap, five runs dead. Two controls land together:
 *   - claim-scaled RUN budgets on total web_search / web_fetch invocations (`searchBudget`/`fetchBudget`),
 *     enforced by the proxy across turns (`max_uses` is per-call, so it cannot bound a run);
 *   - per-page context truncation (`fetchMaxContentTokens`) so one fetched page cannot flood the context.
 * The estimator's `verification` addend (`RESEARCH_*_CREDITS` in @rhema/protocols) prices the residual.
 */
export const RESEARCH_FETCH_BASE = 12 as const;
export const RESEARCH_FETCH_PER_CLAIM = 4 as const;
export const RESEARCH_FETCH_MIN = 16 as const;
export const RESEARCH_FETCH_MAX = 80 as const;
export const RESEARCH_SEARCH_BASE = 8 as const;
export const RESEARCH_SEARCH_PER_CLAIM = 1 as const;
export const RESEARCH_SEARCH_MAX = 32 as const;
/** Per fetched page, tokens entering context (the proxy sets `max_content_tokens` on web_fetch). */
export const FETCH_MAX_CONTENT_TOKENS = 8000 as const;

/**
 * RES.1 (REQ-SPEC-31(2)) — the research floor share: the fraction of each run budget reserved for
 * research-class traffic (`phaseClass: "research"`, the verification/discourse passes). The proxy enforces
 * it against the harness-stamped `x-rhema-phase-class`: non-eligible requests bound at `budget − floor`, so
 * a judge/generate phase — or the agent + its subagents inside one — can never consume verification's share.
 * The floor is a GUARANTEE, not a research cap: research-class traffic draws the whole remaining budget.
 */
export const RESEARCH_FLOOR_SHARE = 0.5 as const;

/**
 * RES.1 (REQ-SPEC-31(2)) — the ONE pure sizing function for the research floor: verification's
 * reserved share of the run's search/fetch budgets. The budgets it floors are already claim-scaled
 * (`authorWebToolPolicy`), so the signature carries `claims` for the record and `rigor` for the fold
 * ECON.1's Quick 5-claim cap makes later — the share itself is uniform today: half of every bounded
 * kind is held for research-class traffic, and no earlier phase or subagent may spend it. The proxy
 * enforces it; the named guard test in `allowlist.test.ts` fails if the share or output is lowered.
 */
export function authorResearchFloor(args: {
  /** claims verification will actually check (the budget inputs are already claim-scaled). */
  readonly claims?: number;
  /** the run's rigor — carried for ECON.1's Quick cap fold; the share is rigor-uniform today. */
  readonly rigor?: string;
  readonly searchBudget: number;
  readonly fetchBudget: number;
}): { readonly searchFloor: number; readonly fetchFloor: number } {
  return {
    searchFloor: Math.floor(args.searchBudget * RESEARCH_FLOOR_SHARE),
    fetchFloor: Math.floor(args.fetchBudget * RESEARCH_FLOOR_SHARE),
  };
}

function clampInt(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

/**
 * Author the run's `webTools` policy from the claim count (the input snapshot's `claimCount`, or the
 * density-derived provisional count). Claims scale the budgets; every run is bounded even at claims=0 —
 * verification still does baseline reading, and a missing count must not mean unbounded research.
 * RES.1: half the authored bound is floored to research-class phases (the claim-scaled budget exists FOR
 * verification; reserving half keeps a draft-time browse from starving it while still leaving earlier
 * phases a real allowance).
 */
export function authorWebToolPolicy(args: { readonly claims?: number }): WebToolPolicyData {
  const claims = Math.max(0, args.claims ?? 0);
  const searchBudget = clampInt(
    RESEARCH_SEARCH_BASE + RESEARCH_SEARCH_PER_CLAIM * claims,
    RESEARCH_SEARCH_BASE,
    RESEARCH_SEARCH_MAX,
  );
  const fetchBudget = clampInt(
    RESEARCH_FETCH_BASE + RESEARCH_FETCH_PER_CLAIM * claims,
    RESEARCH_FETCH_MIN,
    RESEARCH_FETCH_MAX,
  );
  return {
    search: true,
    fetch: true,
    fetchBudget,
    searchBudget,
    ...authorResearchFloor({ claims, searchBudget, fetchBudget }),
    fetchMaxContentTokens: FETCH_MAX_CONTENT_TOKENS,
  };
}

// ---------------------------------------------------------- the Assistant bound (P1.11; §7.1/§12.2) ----

/** A research burst's source ceiling — the plan card's N, hard-clamped (§12.2: ≤N sources). */
export const RESEARCH_BURST_MAX_SOURCES = 20 as const;

/**
 * The Assistant seat's per-run web bound (§7.1; REQ-CHAT-10). A `chat_turn` run enforces the §7.1
 * per-turn budgets AT THE PROXY (≤5 searches / ≤10 fetches, consented-shrunk via the frozen `budget`
 * input — an edited plan can only lower them); a `research_burst` bounds fetches to the plan card's
 * source count N (clamped to the burst ceiling) with the same count of searches for source
 * discovery. Returns null for non-assistant workflows so the caller falls back to the claim-scaled
 * bound. The proxy's `capCredits` still bounds spend; these budgets bound INVOCATIONS.
 */
export function authorAssistantWebToolPolicy(args: {
  readonly workflow: WorkflowKey;
  /** the run's frozen inputs — the consented per-turn `budget` (chat_turn) or planned `sources` (burst). */
  readonly inputs?: Record<string, unknown>;
}): WebToolPolicyData | null {
  if (args.workflow === "chat_turn") {
    const b = (args.inputs?.budget ?? {}) as { searches?: unknown; fetches?: unknown };
    return {
      search: true,
      fetch: true,
      // an edited plan shrinks the bound; the §7.1 numbers are the hard ceiling either way.
      searchBudget: clampInt(
        typeof b.searches === "number" ? b.searches : ASSISTANT_TURN_BUDGET.searches,
        0,
        ASSISTANT_TURN_BUDGET.searches,
      ),
      fetchBudget: clampInt(
        typeof b.fetches === "number" ? b.fetches : ASSISTANT_TURN_BUDGET.fetches,
        0,
        ASSISTANT_TURN_BUDGET.fetches,
      ),
      fetchMaxContentTokens: FETCH_MAX_CONTENT_TOKENS,
    };
  }
  if (args.workflow === "research_burst") {
    const sources = clampInt(
      typeof args.inputs?.sources === "number" ? args.inputs.sources : 5,
      1,
      RESEARCH_BURST_MAX_SOURCES,
    );
    return {
      search: true,
      fetch: true,
      // the burst's plan decomposes into ≤N fetches; searches bound at the same N for discovery.
      fetchBudget: sources,
      searchBudget: sources,
      // RES.1 — the burst runs a judge-class triage BEFORE its research phase; floor half the source
      // bound so triage browsing can never starve the research pass it precedes.
      ...authorResearchFloor({ searchBudget: sources, fetchBudget: sources }),
      fetchMaxContentTokens: FETCH_MAX_CONTENT_TOKENS,
    };
  }
  // P1.13 — the Figure run's web bound (§7.5): the honesty step's `fetched` provenance path fetches
  // the declared source URL(s) — a small fixed bound, never the claim-scaled research envelope.
  // `inputs.sourceCount` (the frozen @asset/@claim/URL refs count) shrinks it; hard ceiling 3
  // fetches / 2 searches — a figure's data resolution is bounded reading, not a literature review.
  if (args.workflow === "figure") {
    const declared =
      typeof args.inputs?.sourceCount === "number" ? clampInt(args.inputs.sourceCount, 0, 3) : 1;
    return {
      search: true,
      fetch: true,
      fetchBudget: Math.max(1, declared),
      searchBudget: Math.min(2, Math.max(1, declared)),
      fetchMaxContentTokens: FETCH_MAX_CONTENT_TOKENS,
    };
  }
  return null;
}

// ---------------------------------------------------------- research preflight (RES.1; REQ-SPEC-31(3)) ----

/**
 * The server web-tool `type` variants the proxy injects (the wire contract — duplicated with
 * `apps/egress-proxy/src/url-policy.ts` deliberately, like the credential headers). The preflight probe
 * declares THESE variants (never its own guess) so a model × variant rejection is what fails the run.
 */
export const WEB_SEARCH_TOOL_TYPE = "web_search_20250305" as const;
export const WEB_FETCH_TOOL_TYPE = "web_fetch_20250910" as const;
export type ServerWebToolKind = "web_search" | "web_fetch";

/**
 * One model × server-tool pair the run may exercise. The preflight probe proves each pair — through the
 * run's OWN proxy credential — before any paid phase runs (and again on every resume).
 */
export interface ResearchPreflightPair {
  readonly model: string;
  readonly tool: ServerWebToolKind;
}

/**
 * The server-authored preflight manifest on the run spec: the models the run's tier may call, the
 * tool kinds its `webTools` policy enables, their provider `type` variants, and the flattened pair set.
 */
export interface ResearchPreflightSpec {
  readonly models: readonly string[];
  readonly tools: readonly ServerWebToolKind[];
  readonly toolTypes: { readonly web_search: string; readonly web_fetch: string };
  readonly pairs: readonly ResearchPreflightPair[];
}

/**
 * Author the run's preflight manifest (RES.1). `models` = the tier's roster (the same set the proxy
 * allowlist admits — a pair that isn't allowlisted can never run anyway); `tools` = the webTools policy's
 * enabled kinds (absent ⇒ the proxy defaults: both on). A run whose policy disables a tool simply has no
 * pairs for it — probing a disabled pair would prove nothing (the proxy strips the tool).
 */
export function authorResearchPreflight(args: {
  readonly modelTier: ModelTier;
  readonly webTools?: WebToolPolicyData | null;
}): ResearchPreflightSpec {
  const models = MODELS_BY_TIER[args.modelTier];
  const tools: ServerWebToolKind[] = [
    ...(args.webTools?.search === false ? [] : (["web_search"] as const)),
    ...(args.webTools?.fetch === false ? [] : (["web_fetch"] as const)),
  ];
  return {
    models,
    tools,
    toolTypes: { web_search: WEB_SEARCH_TOOL_TYPE, web_fetch: WEB_FETCH_TOOL_TYPE },
    pairs: models.flatMap((model) => tools.map((tool) => ({ model, tool }))),
  };
}

/**
 * The run's URL policy (the seat's `allowlist`/`denylist`/`allowlist_plus` choice), read from the
 * run's FROZEN inputs (`inputs.urlPolicy` — server-validated at creation, never client-trusted at
 * provision). Returns the allowlist-authoring fields; absent/invalid input yields the empty
 * denylist-shaped default (`blockedDomains: []`).
 */
export function urlPolicyFromInputs(inputs: Record<string, unknown> | null | undefined): Pick<
  AuthorAllowlistArgs,
  "blockedDomains" | "allowedDomains" | "knownDomains" | "novelDomainCap" | "userSourceDomains" | "fetchUserDataForbidden"
> {
  const p = (inputs?.urlPolicy ?? null) as {
    blockedDomains?: unknown;
    allowedDomains?: unknown;
    knownDomains?: unknown;
    novelDomainCap?: unknown;
    userSourceDomains?: unknown;
    fetchUserDataForbidden?: unknown;
  } | null;
  const strList = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;
  return {
    blockedDomains: strList(p?.blockedDomains) ?? [],
    ...(p?.allowedDomains != null ? { allowedDomains: strList(p.allowedDomains) ?? [] } : {}),
    ...(p?.knownDomains != null ? { knownDomains: strList(p.knownDomains) ?? [] } : {}),
    ...(typeof p?.novelDomainCap === "number" ? { novelDomainCap: Math.max(0, Math.round(p.novelDomainCap)) } : {}),
    ...(p?.userSourceDomains != null ? { userSourceDomains: strList(p.userSourceDomains) ?? [] } : {}),
    ...(p?.fetchUserDataForbidden === true ? { fetchUserDataForbidden: true } : {}),
  };
}
