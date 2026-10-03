import { ASSISTANT_TURN_BUDGET, type ModelTier } from "@rhema/contracts";

// The per-turn plan card + hard budgets (§7.1; REQ-CHAT-9/10/11). Every Assistant turn opens with a
// plan card — what it will do, the tool budget, the 40-credit cap, the tier, Cancel — and the three
// actions (Run as background research / Do the first step only / Edit the plan). Hitting a per-turn
// cap PAUSES the turn with the over-cap card (never silently proceeds); the check runs on METERED
// usage (run events + metered rows), never model text.

/** The hard per-turn budget (§7.1 verbatim: ≤40 cr / ≤5 searches / ≤10 fetches). */
export interface TurnBudget {
  credits: number;
  searches: number;
  fetches: number;
}
export const TURN_BUDGET: TurnBudget = { ...ASSISTANT_TURN_BUDGET };

/** A turn's metered usage so far (from run events + fetch_log/usage rows — never the model's prose). */
export interface TurnUsage {
  credits: number;
  searches: number;
  fetches: number;
}

export type BudgetAxis = "credits" | "searches" | "fetches";

export type BudgetCheck =
  | { ok: true }
  | { ok: false; axis: BudgetAxis; used: number; budget: number };

/**
 * Check a turn's metered usage against its budget (REQ-CHAT-10). Any axis at/over budget pauses the
 * turn — the caller emits `chat.over_cap` and renders `overCapCard`. A plan card may set a SMALLER
 * cap via `budget` (an edited plan); the §7.1 ceiling always applies on top (`effectiveBudget`).
 */
export function checkTurnBudget(usage: TurnUsage, budget: TurnBudget = TURN_BUDGET): BudgetCheck {
  if (usage.credits >= budget.credits)
    return { ok: false, axis: "credits", used: usage.credits, budget: budget.credits };
  if (usage.searches >= budget.searches)
    return { ok: false, axis: "searches", used: usage.searches, budget: budget.searches };
  if (usage.fetches >= budget.fetches)
    return { ok: false, axis: "fetches", used: usage.fetches, budget: budget.fetches };
  return { ok: true };
}

/** An edited plan may only SHRINK the per-turn caps (§7.1's numbers are the hard ceiling). */
export function effectiveBudget(requested?: Partial<TurnBudget>): TurnBudget {
  return {
    credits: Math.min(requested?.credits ?? TURN_BUDGET.credits, TURN_BUDGET.credits),
    searches: Math.min(requested?.searches ?? TURN_BUDGET.searches, TURN_BUDGET.searches),
    fetches: Math.min(requested?.fetches ?? TURN_BUDGET.fetches, TURN_BUDGET.fetches),
  };
}

/** The plan-card actions (§7.1/REQ-CHAT-10), verbatim. */
export const PLAN_CARD_ACTIONS = ["run_research", "first_step", "edit", "cancel"] as const;
export type PlanCardAction = (typeof PLAN_CARD_ACTIONS)[number];

/**
 * The per-turn plan card payload (what the Desk renders before a turn runs). `steps` is the turn's
 * declared plan (what it will do); `sheet` is the run-sheet payload a preparatory action lands on
 * (`run_research` opens the research_burst sheet — the sheet's Run is the only run creator).
 */
export interface TurnPlanCard {
  kind: "plan_card";
  threadId: string;
  /** the one-line summary of what the turn will do. */
  summary: string;
  steps: readonly string[];
  /** the consented budgets (always ≤ the §7.1 ceiling). */
  budget: TurnBudget;
  modelTier: ModelTier;
  /** the three actions + cancel. */
  actions: readonly PlanCardAction[];
  /** when the plan's research leg is a run: the research_burst sheet link the action opens. */
  researchSheetHref?: string;
}

/** Build the plan card for a turn (REQ-CHAT-10). */
export function planCard(args: {
  threadId: string;
  summary: string;
  steps: readonly string[];
  modelTier?: ModelTier;
  requestedBudget?: Partial<TurnBudget>;
  researchSheetHref?: string;
}): TurnPlanCard {
  return {
    kind: "plan_card",
    threadId: args.threadId,
    summary: args.summary,
    steps: args.steps,
    budget: effectiveBudget(args.requestedBudget),
    modelTier: args.modelTier ?? "base",
    actions: PLAN_CARD_ACTIONS,
    ...(args.researchSheetHref ? { researchSheetHref: args.researchSheetHref } : {}),
  };
}

/** The over-cap pause card (REQ-CHAT-10 — the pause surfaces, never a silent continuation). */
export interface OverCapCard {
  kind: "over_cap";
  axis: BudgetAxis;
  used: number;
  budget: number;
  /** resume continues the turn under the same budgets; raise is an Edit-the-plan action. */
  actions: readonly ["resume", "edit", "cancel"];
}

export function overCapCard(check: Extract<BudgetCheck, { ok: false }>): OverCapCard {
  return {
    kind: "over_cap",
    axis: check.axis,
    used: check.used,
    budget: check.budget,
    actions: ["resume", "edit", "cancel"],
  };
}

// ---- the strips (REQ-CHAT-9/11) — derived from events/metered rows, never model text ----

/** The activity strip: per-turn tool activity counted from run events. */
export interface ActivityStrip {
  searches: number;
  fetches: number;
  artifactReads: number;
  sourcesRead: number;
}

/**
 * Count a turn's tool activity from its run events (search.performed / source.read / read_artifact
 * internal rows). `events` is `{type}`-tagged — the SSE event stream's shape.
 */
export function activityStrip(events: readonly { type: string }[]): ActivityStrip {
  let searches = 0;
  let fetches = 0;
  let artifactReads = 0;
  for (const e of events) {
    if (e.type === "search.performed") searches++;
    else if (e.type === "source.read") fetches++;
    else if (e.type === "artifact.read") artifactReads++; // internal-ish; counted when present
  }
  return { searches, fetches, artifactReads, sourcesRead: fetches };
}

/** The cost strip (REQ-CHAT-9): credits vs cap, searches/fetches vs budget, workspace spend total. */
export interface CostStrip {
  spentCredits: number;
  capCredits: number;
  searchesUsed: number;
  searchesBudget: number;
  fetchesUsed: number;
  fetchesBudget: number;
  /** the workspace's spend total (metered), for the "workspace spend" line. */
  workspaceSpent?: number;
  tier: ModelTier;
}

export function costStrip(
  metered: { spentCredits: number; capCredits: number; workspaceSpent?: number },
  usage: Pick<TurnUsage, "searches" | "fetches">,
  tier: ModelTier,
  budget: TurnBudget = TURN_BUDGET,
): CostStrip {
  return {
    spentCredits: metered.spentCredits,
    capCredits: metered.capCredits,
    searchesUsed: usage.searches,
    searchesBudget: budget.searches,
    fetchesUsed: usage.fetches,
    fetchesBudget: budget.fetches,
    ...(metered.workspaceSpent != null ? { workspaceSpent: metered.workspaceSpent } : {}),
    tier,
  };
}

/** The notch-only tier picker model (REQ-CHAT-14): Base/Balanced/Frontier — never free-form model text. */
export const TIER_NOTCHES: readonly ModelTier[] = ["base", "balanced", "frontier"];
export function tierPicker(current: ModelTier): { notches: readonly ModelTier[]; current: ModelTier } {
  return { notches: TIER_NOTCHES, current };
}
