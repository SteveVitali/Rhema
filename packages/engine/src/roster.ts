// @rhema/engine — the subagent roster from the model profile (§12.2, §12.3).
//
// The five subagents the skills use, each with per-agent tools / model / effort (§12.2). Routing is by phase
// class against the §12.3 capability table; here we encode the Base-tier defaults (Sonnet 5 main / Haiku 4.5
// research subagents), overridable by tier. NOTE: the input-scoped subagents (second-reader, fidelity-
// auditor, gap-analyst, holdout-calibrator) are LAUNCHED BY THE ORCHESTRATOR as separate scoped `query()`
// calls in a private mount namespace (§12.6 / scoped-subagent.ts) — this roster is the catalogue of their
// types (model/effort/tools); only `researcher` fans out in-query. `tools: ["Read"]` on the scoped ones
// mirrors §12.6 (no Bash, no Write, no fetch except where a skill grants the client `fetcher`).

import type { PhaseClass } from "@rhema/protocols";

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

/**
 * R5ECON.2 (REQ-ECON-1/12) — the `testCheapRoute` arm's model: every phase class's main context
 * resolves THIS id when the frozen lever is ON. It sits on every tier's `MODELS_BY_TIER` allowlist
 * and is priceable in the frozen rate table ($1/$5 — the ~3× cache-read cut the arm exists for);
 * the roster-allowlist alignment test asserts both under the `cheapRoute` roster variant. It is
 * ALSO the id a routed `usage_records.model` row truthfully carries while `model_tier` keeps the
 * run's frozen user-facing tier (REQ-ECON-4/5).
 */
export const TEST_CHEAP_ROUTE_MODEL = "claude-haiku-4-5" as const;

/** The main-context model for a tier (§12.3). The engine sets it as the top-level `model` (F4) so the CLI does
 *  not fall back to a default that may be off the run's allowlist. */
export function mainModelForTier(tier: Tier): string {
  return MAIN_MODEL[tier];
}

/**
 * ECON.2 L3 (REQ-ARCH-9; ADR-087) — the §12.3 routing table verbatim: the main-context model per
 * (tier, phaseClass). Today's pipeline runs `mainModelForTier` on EVERY phase — the OFF arm; the ON
 * arm routes by the manifest's `phaseClass`:
 *   · research — Base Sonnet (Haiku 4.5 research subagents, unchanged below), Balanced Sonnet,
 *     Frontier Opus;
 *   · judge / generate — the tier main (Sonnet / Opus / Fable — identical to `MAIN_MODEL`);
 *   · package — Base Sonnet, Balanced Sonnet, Frontier Opus.
 * The manifest has no `chat` phaseClass — a chat_turn phase is `generate`-class and lands on the
 * §12.3 chat row's model, which is identical to its generate cell anyway. Every id in a cell is
 * already on the tier's proxy allowlist and priceable — the roster-allowlist alignment test
 * extends to per-phase ids to keep that true (F4). The scoped-query launches (second-reader,
 * audits) keep `mainModelForTier` — their §12.6 independence context is a §6.5 preset invariant,
 * untouched by this lever.
 */
export const PHASE_CLASS_MODELS: Readonly<Record<Tier, Readonly<Record<PhaseClass, string>>>> = {
  base: {
    research: "claude-sonnet-5",
    judge: "claude-sonnet-5",
    generate: "claude-sonnet-5",
    package: "claude-sonnet-5",
  },
  balanced: {
    research: "claude-sonnet-5",
    judge: "claude-opus-5",
    generate: "claude-opus-5",
    package: "claude-sonnet-5",
  },
  frontier: {
    research: "claude-opus-5",
    judge: "claude-fable-5",
    generate: "claude-fable-5",
    package: "claude-opus-5",
  },
};

/**
 * The §12.3 per-class route for a (tier, phaseClass) — L3's resolved main model. With the lever
 * off the caller uses `mainModelForTier` instead (the flat pre-ECON.2 shape).
 */
export function routeModelForPhaseClass(tier: Tier, phaseClass: PhaseClass): string {
  return PHASE_CLASS_MODELS[tier][phaseClass];
}

/** Every model id the roster can request for a tier (main + subagents) — the set the allowlist must cover. */
export function rosterModelIds(tier: Tier): string[] {
  return [...new Set(Object.values(buildAgentRoster({ tier })).map((a) => a.model))];
}

export interface RosterInput {
  readonly tier: Tier;
  /**
   * R5ECON.2 — the `testCheapRoute` arm reroutes the judge cells to `TEST_CHEAP_ROUTE_MODEL`
   * (they are judge-class work; leaving them on the tier main would keep a test run's most
   * expensive subagents priced at the old route). `researcher` keeps its per-tier model — on
   * base that is already Haiku, and its bounded-batch contract is costed separately.
   */
  readonly cheapRoute?: boolean;
}

/** Build the five-subagent roster for a tier (§12.2). */
export function buildAgentRoster(input: RosterInput): Record<string, AgentDef> {
  const judge = input.cheapRoute === true ? TEST_CHEAP_ROUTE_MODEL : MAIN_MODEL[input.tier];
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
      // PRB.24 — the description is synthesized into the subagent's system `prompt` (`toSdkAgents`), so it
      // carries the bounded-scope contract into the subagent's OWN context: verify only the assigned batch,
      // return compact verdicts — never pasted page text (which would re-inflate the seat's transcript).
      description:
        "Research fan-out: search + fetch + read (§12.3 research row); inherits the seat's mounts. Bounded scope (PRB.24): verify ONLY the items your invoking prompt assigns; return a compact verdict list (item → verdict → retrieved source URLs), never raw page text.",
      // NO client web tools (P0.15i AC1, confirmed live): both client `WebFetch` and `WebSearch` are dropped —
      // they cannot function under the sandbox's proxy-only egress, and a client `WebSearch` pre-empts the
      // proxy-injected SERVER `web_search` (so no server search executes / meters). Research is the
      // proxy-guaranteed server-side web tools, invoked directly (not gated by this list) — see `@rhema/egress-proxy`.
      tools: ["Read"],
      model: research,
      effort: "medium",
      inputScoped: false,
    },
  };
}
