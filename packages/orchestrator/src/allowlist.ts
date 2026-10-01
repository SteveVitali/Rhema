// Authoring the per-run proxy allowlist (§12.4 step 4; §12.7). At provision the orchestrator names exactly the
// provider endpoints, models and URL policy a run may use; the proxy refuses anything outside it (403) and
// meters against `capCredits`. The model set is by tier (§12.3 routing); URL policy carries the run's hold-out
// / user-excluded domains and the novel-domain cap (§12.8d). The exact per-tier model list is refined as the
// routing table is instrumented (§16.3); this is the MVP authoring.

import type { ModelTier } from "@rhema/contracts";
import type { RunAllowlistData, WebToolPolicyData } from "./resolver.js";

/** The Anthropic model ids each tier's phases may request (main + subagent models — §12.3). */
export const MODELS_BY_TIER: Readonly<Record<ModelTier, readonly string[]>> = {
  base: ["claude-sonnet-5", "claude-haiku-4-5"],
  balanced: ["claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5"],
  frontier: ["claude-opus-5", "claude-fable-5", "claude-sonnet-5", "claude-haiku-4-5"],
};

/** The direct Anthropic API is the only allowed provider endpoint at MVP (§12.3; no Vertex path). */
export const ANTHROPIC_ENDPOINT = { host: "api.anthropic.com", pathPrefix: "/v1/" } as const;

export interface AuthorAllowlistArgs {
  readonly modelTier: ModelTier;
  /** hold-out + user-excluded domains the URL policy blocks (anti-exfil; §12.6). */
  readonly blockedDomains?: readonly string[];
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
    endpoints: [ANTHROPIC_ENDPOINT, ...(args.extraEndpoints ?? [])],
    models: MODELS_BY_TIER[args.modelTier],
    urlPolicy: {
      blockedDomains: args.blockedDomains ?? [],
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

function clampInt(n: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, Math.round(n)));
}

/**
 * Author the run's `webTools` policy from the claim count (the input snapshot's `claimCount`, or the
 * density-derived provisional count). Claims scale the budgets; every run is bounded even at claims=0 —
 * verification still does baseline reading, and a missing count must not mean unbounded research.
 */
export function authorWebToolPolicy(args: { readonly claims?: number }): WebToolPolicyData {
  const claims = Math.max(0, args.claims ?? 0);
  return {
    search: true,
    fetch: true,
    fetchBudget: clampInt(RESEARCH_FETCH_BASE + RESEARCH_FETCH_PER_CLAIM * claims, RESEARCH_FETCH_MIN, RESEARCH_FETCH_MAX),
    searchBudget: clampInt(RESEARCH_SEARCH_BASE + RESEARCH_SEARCH_PER_CLAIM * claims, RESEARCH_SEARCH_BASE, RESEARCH_SEARCH_MAX),
    fetchMaxContentTokens: FETCH_MAX_CONTENT_TOKENS,
  };
}
