// Authoring the per-run proxy allowlist (§12.4 step 4; §12.7). At provision the orchestrator names exactly the
// provider endpoints, models and URL policy a run may use; the proxy refuses anything outside it (403) and
// meters against `capCredits`. The model set is by tier (§12.3 routing); URL policy carries the run's hold-out
// / user-excluded domains and the novel-domain cap (§12.8d). The exact per-tier model list is refined as the
// routing table is instrumented (§16.3); this is the MVP authoring.

import type { ModelTier } from "@rhema/contracts";
import type { RunAllowlistData } from "./resolver.js";

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
