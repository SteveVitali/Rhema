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

/** Main-context model per tier (§12.3 judge/generate row). */
const MAIN_MODEL: Record<Tier, string> = {
  base: "claude-sonnet-5",
  balanced: "claude-opus-5",
  frontier: "claude-fable-5-1",
};
/** Research fan-out subagent model per tier (§12.3 research row). */
const RESEARCH_SUB_MODEL: Record<Tier, string> = {
  base: "claude-haiku-4-5-20251001",
  balanced: "claude-sonnet-5",
  frontier: "claude-opus-5",
};

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
