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

/**
 * The run's URL policy (the seat's `allowlist`/`denylist`/`allowlist_plus` choice), read from the
 * run's FROZEN inputs (`inputs.urlPolicy` — server-validated at creation, never client-trusted at
 * provision). Returns the allowlist-authoring fields; absent/invalid input yields the empty
 * denylist-shaped default (`blockedDomains: []`).
 */
export function urlPolicyFromInputs(inputs: Record<string, unknown> | null | undefined): Pick<
  AuthorAllowlistArgs,
  "blockedDomains" | "allowedDomains" | "knownDomains" | "novelDomainCap"
> {
  const p = (inputs?.urlPolicy ?? null) as {
    blockedDomains?: unknown;
    allowedDomains?: unknown;
    knownDomains?: unknown;
    novelDomainCap?: unknown;
  } | null;
  const strList = (v: unknown): string[] | undefined =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;
  return {
    blockedDomains: strList(p?.blockedDomains) ?? [],
    ...(p?.allowedDomains != null ? { allowedDomains: strList(p.allowedDomains) ?? [] } : {}),
    ...(p?.knownDomains != null ? { knownDomains: strList(p.knownDomains) ?? [] } : {}),
    ...(typeof p?.novelDomainCap === "number" ? { novelDomainCap: Math.max(0, Math.round(p.novelDomainCap)) } : {}),
  };
}
