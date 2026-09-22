// @rhema/engine — the subagent roster from the model profile (§12.2, §12.3).
//
// The five subagents the skills use, each with per-agent tools / model / effort (§12.2). Routing is by phase
// class against the §12.3 capability table; here we encode the Base-tier defaults (Sonnet 5 main / Haiku 4.5
// research subagents), overridable by tier. NOTE: the input-scoped subagents (second-reader, fidelity-
// auditor, gap-analyst, holdout-calibrator) are LAUNCHED BY THE ORCHESTRATOR as separate scoped `query()`
// calls in a private mount namespace (§12.6 / scoped-subagent.ts) — this roster is the catalogue of their
// types (model/effort/tools); only `researcher` fans out in-query. `tools: ["Read"]` on the scoped ones
// mirrors §12.6 (no Bash, no Write, no fetch except where a skill grants the client `fetcher`).

/** A subagent definition (per-agent tools/model/effort — §12.2). Structural; the SDK's is a superset. */
export interface AgentDef {
  description: string;
  tools: string[];
  model: string;
  effort: "low" | "medium" | "high";
  /** input-scoped (§12.6): the orchestrator launches it as a separate scoped query, not the parent model. */
  inputScoped: boolean;
}

type Tier = "base" | "balanced" | "frontier";

// Model ids MUST be the exact strings the proxy allowlist enumerates (`@rhema/orchestrator` MODELS_BY_TIER,
// an exact-match `.includes`) AND priceable in the rate table (`@rhema/contracts` isModelPriceable). A dated id
// like `claude-haiku-4-5-20251001` is NOT on the (bare-id) allowlist, so it 403s at the proxy (F4). Use the
// bare family ids the allowlist + rate table carry; the roster-allowlist alignment test guards this.
/** Main-context model per tier (§12.3 judge/generate row). */
const MAIN_MODEL: Record<Tier, string> = {
  base: "claude-sonnet-5",
  balanced: "claude-opus-5",
  frontier: "claude-fable-5",
};
/** Research fan-out subagent model per tier (§12.3 research row). */
const RESEARCH_SUB_MODEL: Record<Tier, string> = {
  base: "claude-haiku-4-5",
  balanced: "claude-sonnet-5",
  frontier: "claude-opus-5",
};

/** The main-context model for a tier (§12.3). The engine sets it as the top-level `model` (F4) so the CLI does
 *  not fall back to a default that may be off the run's allowlist. */
export function mainModelForTier(tier: Tier): string {
  return MAIN_MODEL[tier];
}

/** Every model id the roster can request for a tier (main + subagents) — the set the allowlist must cover. */
export function rosterModelIds(tier: Tier): string[] {
  return [...new Set(Object.values(buildAgentRoster({ tier })).map((a) => a.model))];
}

export interface RosterInput {
  readonly tier: Tier;
}

/** Build the five-subagent roster for a tier (§12.2). */
export function buildAgentRoster(input: RosterInput): Record<string, AgentDef> {
  const judge = MAIN_MODEL[input.tier];
  const research = RESEARCH_SUB_MODEL[input.tier];
  return {
    "second-reader": {
      description: "Independent second read; receives only the draft (§12.6).",
      tools: ["Read"],
      model: judge,
      effort: "high",
      inputScoped: true,
    },
    "fidelity-auditor": {
      description: "Independent fidelity audit against the commissioning inputs (§12.6).",
      tools: ["Read"],
      model: judge,
      effort: "high",
      inputScoped: true,
    },
    "gap-analyst": {
      description: "Independent gap check of the revision against the letter (§12.6).",
      tools: ["Read"],
      model: judge,
      effort: "high",
      inputScoped: true,
    },
    "holdout-calibrator": {
      description: "Calibration against a held-out sample; the hold-out URL is allowed only after the prediction file exists (§12.6).",
      tools: ["Read"],
      model: judge,
      effort: "high",
      inputScoped: true,
    },
    researcher: {
      description: "Research fan-out: search + fetch + read (§12.3 research row); inherits the seat's mounts.",
      tools: ["Read", "WebSearch", "WebFetch"],
      model: research,
      effort: "medium",
      inputScoped: false,
    },
  };
}
