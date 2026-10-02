// The launcher-shape RunSheetView (§5.6). A LAUNCHER, not a control panel: the computed, dynamic surface of
// the sheet — the title line, the dollars-first estimate box, the consent decision, the insufficient-balance
// panel, the Advanced toggles with signed deltas, the collapsed-row summary, the "Why this estimate?" line,
// the obligation scope line (REQ-OBJ-6) — plus the lever matrix for in-place recompute. The presentational
// component (@rhema/ui) renders this view + a chrome-labels object; the app's COPY owns the static chrome.

import {
  consentDecision,
  creditsLine,
  estimateLine,
  formatCredits,
  resolveInsufficientBalance,
  MODEL_TIER_DISPLAY,
  MODEL_TIERS,
  RIGOR_DISPLAY,
  RIGORS,
  type ConsentDecision,
  type EstimateWhy,
  type EstimateWhyTerm,
  type InsufficientBalanceResolution,
  type ModelTier,
  type Rigor,
  type WorkflowKey,
  sheetEntitlementLine,
} from "@rhema/contracts";
import type { EstimatorInputs } from "@rhema/protocols";
import { APPROVAL_DISPLAY } from "@rhema/commands";
import { buildEstimate } from "./estimate.js";
import { buildLeverMatrix, leverKey, type LeverMatrix, type TimeBand } from "./lever-matrix.js";
import { resolveToggles, sheetProfile, type ToggleKey, type ToggleState } from "./profiles.js";
import { surfaceEstimate, type DurationCells } from "./surface.js";

/** The verb label for a workflow's title line (not reserved vocab; the three beta verbs). */
export const WORKFLOW_VERB_LABEL: Partial<Record<WorkflowKey, string>> = {
  review: "Review",
  revise: "Revise",
  fact_check: "Fact-check",
};

export interface SheetScope {
  /** P1.21 — the four §6.7 protocols (was Essay-only at beta). */
  readonly protocol: string;
  /**
   * P1.21 — the selectable protocol ids+names (the §5.3 cards, supplied server-side). Absent ⇒ the
   * field falls back to a free-text input (never fabricate options).
   */
  readonly protocolOptions?: readonly { readonly id: string; readonly name: string }[];
  readonly venue?: string;
  readonly stage?: string;
  readonly voice?: string;
}

/**
 * P1.06 (§7.2; REQ-CHAT-23) — the run's §7.2 command scope as rendered on the sheet: the scope pills
 * under the title line + the whole-draft comparison figure when the scope repriced the run. The
 * grammar stays in @rhema/commands — callers hand this module labels + estimator inputs, never syntax.
 */
export interface CommandScopeView {
  /** the canonical serialized scope (`section:III`) — the hidden `scope` form field round-trips it. */
  readonly serialized: string;
  /** the human pill labels ("Section III", "Finding v2/17"). */
  readonly labels: readonly string[];
  /**
   * The whole-draft comparison figure (§5.6: "the scoped estimate beside the whole-draft estimate").
   * Set only when the scope repriced the run — `estimate` is ALWAYS the run's own price (the scoped
   * figure when scoped); this is the unscoped context line.
   */
  readonly wholeEstimateCredits?: number;
  readonly wholeCapCredits?: number;
}

/** The §14.3 trial-entitlement facts the sheet needs for its `Included` rendering (REQ-BILL-4: a
 *  qualifying entitlement run shows "Included" — no dollar/cap arithmetic, no consent click). */
export interface EntitlementDetails {
  /** ACT.1 — the entitlement row id; the Run form posts it back so the api's unlock gate + hold
   *  claim the RIGHT row (a second tab's stale id 422s `entitlement_unavailable`). */
  readonly id?: string;
  readonly wordCap: number;
  readonly rigor: string;
  readonly modelTier: string;
  readonly kind: string;
}

export interface RunSheetTitle {
  readonly verbLabel: string;
  readonly targetVersion: string;
  readonly words: number;
  readonly claims?: number;
}

export interface RunSheetEstimateBox {
  readonly estimateCredits: number;
  readonly capCredits: number;
  readonly rateTableVersion: number;
  readonly provisional: boolean;
  /** the FIRST, dollars-first line (REQ-BILL-1). Empty while `missing` (see below). */
  readonly dollarsLine: string;
  /** the SECOND, credits/cap/balance-after line (REQ-BILL-1). Empty while `missing`. */
  readonly creditsLine: string;
  readonly time: TimeBand;
  /**
   * EST.1 — the inputs could not be measured (no head draft / no word count): the sheet renders "—"
   * and an estimating hint instead of a fabricated figure (fail closed, never a stale/mock number).
   */
  readonly missing?: boolean;
}

export interface RigorOption {
  readonly rigor: Rigor;
  readonly display: string;
  readonly selected: boolean;
}

/**
 * EST.1 — one selectable model tier (§5.6 collapsed row, ADR-035): the tier label, whether the plan
 * permits it (a locked tier renders disabled with its price for context), whether it is selected, and
 * the repriced estimate if picked. The tier is a USER choice inside plan rules — never an implicit
 * consequence of the rigor notch.
 */
export interface ModelTierOption {
  readonly tier: ModelTier;
  readonly display: string;
  /** false ⇒ the plan rules lock this tier (the option renders disabled). */
  readonly allowed: boolean;
  readonly selected: boolean;
  /** this tier's estimate at the current rigor/toggles — rendered beside the option. */
  readonly estimateCredits: number;
}

/**
 * The sheet's voice line (PRB.10; §9.6). `linked` renders the persona name + the shared pill (the api's
 * `deriveVoiceStatus` projection — never re-derived in the sheet); `ad_hoc` renders the "No voice"
 * default (REQ-PERSONA-20). A stale/untested/never-built voice NEVER blocks the run — the line is a fact
 * plus an optional priced "Update voice first" action (§9.3's one verb), not a gate.
 */
export interface RunSheetVoice {
  readonly mode: "linked" | "ad_hoc";
  readonly personaId?: string;
  readonly name?: string | null;
  /** the shared pill's label + tone (server-computed); absent for `ad_hoc`. */
  readonly pill?: { readonly label: string; readonly tone: string };
  /** the profile snapshot build date the run will write against (ISO), when pinned. */
  readonly snapshotAt?: string | null;
  /** the priced chained action — set only when the pill's action is `update_voice`. */
  readonly updateEstimateCredits?: number;
  /** the form action the update button POSTs to (`/p/:slug/update-voice`). */
  readonly updateAction?: string;
}

export interface RunSheetView {
  readonly workflow: WorkflowKey;
  readonly title: RunSheetTitle;
  readonly rigor: Rigor;
  readonly rigorOptions: readonly RigorOption[];
  readonly modelTier: ModelTier;
  readonly modelTierDisplay: string;
  /** EST.1 — the selectable model tiers with plan-rule locking + per-tier repricing (§5.6). */
  readonly modelTierOptions: readonly ModelTierOption[];
  /**
   * EST.1 — set when the requested/defaulted tier was plan-clamped to `modelTier` (ADR-035): the sheet
   * renders the "your plan includes X only" notice so the priced tier is never a silent surprise.
   */
  readonly clampedFromModelTier?: ModelTier;
  readonly estimate: RunSheetEstimateBox;
  readonly consent: ConsentDecision;
  /** non-null ⇒ the estimate box is a resolution panel; the Run button is blocked (§5.6 item 6). */
  readonly insufficient: InsufficientBalanceResolution | null;
  readonly toggleDeltas: LeverMatrix["toggleDeltas"];
  readonly collapsedSummary: string;
  /** P1.06 (§5.6) — the collapsed row's editable scope facts (Protocol · Venue · Stage · Voice). */
  readonly scope: SheetScope;
  /**
   * P1.06 (REQ-SPEC-17's sheet half) — the scope-approval consequence at launch: informational by
   * default; a blocking 2-hour proceed-as-proposed gate under Full board / a protocol|venue change;
   * "waits for you" under Wait-for-me-at-each.
   */
  readonly scopeApprovalLine: string;
  /** EST.1 — the structured "Why this estimate?" decomposition (Σ terms × Π factors ≈ total). */
  readonly why: EstimateWhy;
  /** the rendered why-line ("… × 40 cr = 840 · … × 1.25 metered coverage ≈ N cr") — computed from `why`. */
  readonly whyLine: string;
  /** the obligation scope line (REQ-OBJ-6), when the caller supplied obligation data. */
  readonly scopeLine?: string;
  /**
   * P1.20/P1.21 (§6.7) — the "Protocol changed since vN was reviewed" marker line on the Review's
   * scope card; set when the settings page's protocol change is still unconsumed (`vN` is the
   * reviewed head the next Review opens on).
   */
  readonly protocolChangedLine?: string;
  /**
   * P1.21 (§6.7/REQ-WF-8; §16.4) — the Memo sheet's confidentiality line, rendered when the sheet's
   * protocol is `memo`: user-supplied sources mount read-only and are never fetched over the web
   * (enforced by the run's URL policy, never just advised).
   */
  readonly memoConfidentialityLine?: string;
  /**
   * P1.21 (§6.7/REQ-GENRE-6) — true ⇒ the sheet renders the memo `user_sources` field (one
   * `name :: url-or-text` per line; ≤8). `userSourcesText` round-trips the typed value on re-render.
   */
  readonly userSourcesField?: boolean;
  readonly userSourcesText?: string;
  /** P1.06 (§7.2) — the run's command scope pills + the whole-draft comparison figure. */
  readonly commandScope?: CommandScopeView;
  /**
   * P1.06 (§14.3) — true ⇒ the estimate box renders "Included" (the trial entitlement covers the run):
   * no dollar/cap arithmetic, no consent click. `entitlementLine` carries the detail
   * ("Trial run · up to 6,000 words" / "the first 6,000 words" when the draft exceeds the cap).
   */
  readonly included?: boolean;
  readonly entitlementLine?: string;
  /**
   * ACT.1 — the claimable entitlement's row id, carried as the Run form's hidden `entitlementId`
   * (the api's unlock gate + hold verify it against the account's current row — a stale id from a
   * second tab fails `entitlement_unavailable`, never a wrong-row claim).
   */
  readonly entitlementId?: string;
  /**
   * P1.06 (§5.6 collapsed row) — the sheet's editable rows: Approvals (the project's policy), the
   * "don't ask me to confirm under N credits" pref, and the budget cap (editable UPWARD only — the
   * computed cap is the floor; the Run click can only raise it).
   */
  readonly approvalPolicy: "named" | "wait_each" | "run_to_completion";
  readonly approvalPolicyDisplay: string;
  readonly dontAskUnder: number;
  /** the cap's editable floor — the computed cap (ceil(1.5×estimate)); lower values never submit. */
  readonly capFloorCredits: number;
  /** the guidance text the sheet re-renders into its free-text field (a typed /command's tail). */
  readonly guidance?: string;
  /** P1.06 (§5.6) — standing notes count beside the guidance box ("N standing notes apply"). */
  readonly standingNotes?: number;
  /**
   * P1.06 (§5.6 item 7) — the promote-on-launch line: a WORKING head freezes to `vN` atomically with
   * the run ("The working copy will be promoted to vN when this run starts").
   */
  readonly promoteLine?: string;
  /** the target draft's state at sheet open — `working` ⇒ the promote line shows. */
  readonly headState?: string;
  /** PRB.10 — the linked-voice line (§9.6): name + shared pill + the optional "Update voice first"
   *  chained action. `ad_hoc` renders the "No voice" label; never a run blocker. */
  readonly voice?: RunSheetVoice;
  /** the client's in-place recompute table (progressive enhancement). */
  readonly leverMatrix: LeverMatrix;
  /** the idempotency key minted at sheet open (§5.6; review 13 F34) — the Run click sends it. */
  readonly idempotencyKey: string;
  /** compact per-rigor recompute payload for the no-bundle inline enhancement (§5.6 item 2). */
  readonly recompute: RecomputePayload;
  /** PRB.08 — the beta Stripe Payment Link the exhaustion panel links to (§14.6; the beta's ONE real-money
   *  channel). Set only when the deploy configured one AND the account is not suspended. */
  readonly paymentLinkUrl?: string;
  /** PRB.08 — the account is suspended (a chargeback): the sheet still renders but the Run button is off and
   *  the suspended notice shows (REQ-SPEC-24.7). */
  readonly suspended?: boolean;
  /** PRB.08 — the final-month beta-plan offer's link (copy + link only — no subscription machinery). Set only
   *  when the deploy configured it (the final-month window is an ops decision, not code). */
  readonly planOfferUrl?: string;
  /**
   * BILL.3 — the purchase switch is closed for this account (`purchase_mode=closed` and not a flagged
   * test workspace): the exhaustion panel renders the paused note instead of the add-credits button —
   * never a checkout hand-off that the api would refuse.
   */
  readonly purchaseClosed?: boolean;
}

/** The data the inline progressive-enhancement script uses to recompute the estimate box on a Rigor change
 *  (§5.6 item 2) — the one first-class lever. Advanced toggles recompute on submit (under the fold). */
export interface RecomputePayload {
  readonly spendableCredits: number;
  readonly dontAskUnder: number;
  readonly entitlement: boolean;
  /**
   * Every lever-matrix state the script can repaint to, keyed by `leverKey(rigor, tier, toggles)`
   * (`"standard|balanced|discourse,fact_check,second_read"`). `e`/`c` = estimate/cap, `lo`/`hi` minutes.
   */
  readonly cells: Record<string, { e: number; c: number; lo: number; hi: number }>;
  /** the tiers the plan permits — the script repaints only onto a selectable tier. */
  readonly allowedModelTiers: readonly ModelTier[];
  /** the resolved tier (fallback when the form carries no tier select). */
  readonly modelTier: ModelTier;
  /** per-rigor DEFAULT state (§6.5: model tier is a consequence of rigor): estimate/cap/time + the tier. */
  readonly byRigor: Record<Rigor, { estimateCredits: number; capCredits: number; lowMinutes: number; highMinutes: number; modelTier: ModelTier }>;
}

export interface BuildRunSheetViewArgs {
  readonly workflow: WorkflowKey;
  readonly targetVersion: string;
  readonly rigor: Rigor;
  readonly modelTier: ModelTier;
  readonly inputs: EstimatorInputs;
  readonly toggles?: ToggleState;
  readonly variant?: string;
  /**
   * EST.1 — false when the draft could not be measured (no head draft / no word count): the estimate
   * box renders "—" + an estimating hint, never a fabricated figure (fail closed — ADR-034).
   */
  readonly inputsAvailable?: boolean;
  /**
   * EST.1 — the model tiers the caller's plan permits (the select locks the rest). Absent ⇒ all
   * tiers selectable (the unconstrained/internal path).
   */
  readonly allowedModelTiers?: readonly ModelTier[];
  /**
   * EST.1 — the tier that was REQUESTED before the plan clamp (when different from `modelTier`);
   * the sheet shows the "your plan includes X only" notice (ADR-035).
   */
  readonly requestedModelTier?: ModelTier;
  /** EST.1 — calibrated duration cells (`cost_card_cells` → `${rigor}|${tier}` bands) for the sheet
   *  + lever matrix; absent ⇒ the shared per-phase prior. */
  readonly durations?: DurationCells;
  readonly scope: SheetScope;
  readonly spendableCredits: number;
  readonly dontAskUnder?: number;
  readonly entitlement?: boolean;
  /** P1.06 (§14.3) — the unused trial entitlement's facts → the `Included` rendering + the word-cap line. */
  readonly entitlementDetails?: EntitlementDetails;
  readonly breakerMultiplier?: 1 | 2;
  readonly claimCount?: number;
  /** the obligation scope line (Review/Revise), from @rhema/obligations `runSheetObligations` (REQ-OBJ-6). */
  readonly scopeLine?: string;
  /**
   * P1.06 (§7.2) — the run's command scope: the serialized form (the hidden form field), the pill
   * labels, and the scope's own estimator inputs (a section's words / `findings:1`). When
   * `scopedInputs` resolves, `estimate` IS the scoped price and the whole-draft figure renders beside it.
   */
  readonly commandScope?: {
    readonly serialized: string;
    readonly labels: readonly string[];
    readonly scopedInputs?: EstimatorInputs;
  };
  /** the project's approval policy the sheet's Approvals row edits (§5.6 collapsed row). */
  readonly approvalPolicy?: "named" | "wait_each" | "run_to_completion";
  /**
   * P1.06 (REQ-SPEC-17) — the scope-gate blocking condition the sheet surfaces and the run freezes
   * (`inputs.scopeBlocking`): Full board, or a protocol/venue change vs the project's pinned scope.
   * Wait-for-me-each needs no flag — the policy branch already blocks.
   */
  readonly scopeBlocking?: boolean;
  /**
   * P1.20 (§6.7) — `projects.protocol_changed_at` set: a settings-page protocol change since the last
   * Review. The Review scope card carries the marker line and the same blocking consequence as a
   * lever-changed scope (the api re-derives the freeze server-side, never client-trusted).
   */
  readonly protocolChanged?: boolean;
  /**
   * P1.21 (REQ-GENRE-6) — the memo sheet's typed `user_sources` text (round-trips on re-render);
   * presence also enables the field (`scope.protocol === "memo"` is the gate, this carries the text).
   */
  readonly userSourcesText?: string;
  /** the sheet's free-text guidance (a typed command's tail) — re-rendered into the field. */
  readonly guidance?: string;
  /** P1.06 (§5.6) — the project's standing guidance count rendered beside the guidance box. */
  readonly standingNotes?: number;
  /** the cap the user edited UPWARD to (≥ computed cap floor); unset ⇒ the computed cap. */
  readonly capOverrideCredits?: number;
  /** the head draft's state (`working` ⇒ the promote-on-launch line) + its NEXT version label. */
  readonly headState?: string;
  readonly promoteToVersion?: string;
  /** the idempotency key minted at sheet open; the caller supplies it so it is stable for the Run click. */
  readonly idempotencyKey: string;
  readonly insufficientMode?: "full" | "beta";
  /** PRB.08 — the Stripe Payment Link for the exhaustion panel's add-credits action (§14.6). */
  readonly paymentLinkUrl?: string;
  /** PRB.08 — the billing account is suspended (chargeback); the sheet renders read-only. */
  readonly suspended?: boolean;
  /** PRB.08 — the final-month beta-plan offer link (copy + link only). */
  readonly planOfferUrl?: string;
  /** BILL.3 — purchase is closed for this account (the exhaustion panel shows the paused line). */
  readonly purchaseClosed?: boolean;
}

/**
 * EST.1 — render the structured `EstimateWhy` as the sheet's one-line breakdown. Each additive term
 * prints `quantity units × rate cr = credits` (the intercept prints `fixed N cr`); then the
 * multiplicative factors; then the printed total. The arithmetic is checkable: Σ terms = subtotal,
 * subtotal × Π factors = the exact figure the estimate ceils to (the incident's unsummed
 * "4 claims × 40 ≈ 440" shape cannot occur — a term's credits field IS its quantity × rate).
 */
function renderWhyLine(why: EstimateWhy): string {
  const rate = (r: number) => (Number.isInteger(r) ? formatCredits(r) : String(r));
  const termStr = (t: EstimateWhyTerm) =>
    t.quantity == null
      ? `fixed ${formatCredits(t.credits)} cr`
      : `${formatCredits(t.quantity)} ${t.unit ?? "units"} × ${rate(t.rateCredits)} cr = ${formatCredits(t.credits)}`;
  const parts = why.terms.map(termStr);
  let line = parts.join(" · ");
  if (why.terms.length > 1) line += ` → ${formatCredits(why.subtotalCredits)}`;
  for (const f of why.factors) line += ` · ×${f.multiplier} ${f.label}`;
  line += ` ≈ ${formatCredits(why.totalCredits)} cr`;
  return line;
}

/** The collapsed-row summary: Protocol · Venue · Stage · Model tier · Voice (§5.6 collapsed row). */
function collapsedSummary(scope: SheetScope, modelTier: ModelTier): string {
  return [scope.protocol, scope.venue, scope.stage, MODEL_TIER_DISPLAY[modelTier], scope.voice]
    .filter((s): s is string => !!s && s.length > 0)
    .join(" · ");
}

/**
 * Build the RunSheetView (§5.6). One estimate, one lever matrix, one consent decision, one insufficiency
 * check — all from the same estimator and money contract, so the sheet never surprises on money.
 */
export function buildRunSheetView(args: BuildRunSheetViewArgs): RunSheetView {
  const profile = sheetProfile(args.workflow);
  // P1.06 — a resolved command scope reprices the run from the scope's own inputs (a section's words,
  // `findings:1`); `estimate` is the RUN's price. The whole-draft figure renders beside it for context.
  const pricedInputs = args.commandScope?.scopedInputs ?? args.inputs;
  // EST.1 (ADR-034) — the estimate comes through the ONE surface API: estimate + cap + the duration
  // band + the "Why this estimate?" decomposition all derive from the same evaluation.
  const surface = surfaceEstimate({
    workflow: args.workflow,
    rigor: args.rigor,
    modelTier: args.modelTier,
    inputs: pricedInputs,
    ...(args.toggles ? { toggles: args.toggles } : {}),
    ...(args.variant ? { variant: args.variant } : {}),
    ...(args.breakerMultiplier ? { breakerMultiplier: args.breakerMultiplier } : {}),
    ...(args.claimCount != null ? { claimCount: args.claimCount } : {}),
    ...(args.durations ? { durations: args.durations } : {}),
  });
  const estimate = surface;
  const whole = args.commandScope?.scopedInputs
    ? buildEstimate({
        workflow: args.workflow,
        rigor: args.rigor,
        modelTier: args.modelTier,
        inputs: args.inputs,
        ...(args.toggles ? { toggles: args.toggles } : {}),
        ...(args.variant ? { variant: args.variant } : {}),
        ...(args.breakerMultiplier ? { breakerMultiplier: args.breakerMultiplier } : {}),
        ...(args.claimCount != null ? { claimCount: args.claimCount } : {}),
      })
    : null;

  const leverMatrix = buildLeverMatrix({
    workflow: args.workflow,
    inputs: pricedInputs,
    rigor: args.rigor,
    modelTier: args.modelTier,
    ...(args.toggles ? { toggles: args.toggles } : {}),
    ...(args.variant ? { variant: args.variant } : {}),
    ...(args.breakerMultiplier ? { breakerMultiplier: args.breakerMultiplier } : {}),
    ...(args.claimCount != null ? { claimCount: args.claimCount } : {}),
    ...(args.durations ? { durations: args.durations } : {}),
  });

  // P1.06 — the cap is editable UPWARD only: a submitted/queried override (`--budget`, a raised field)
  // above the computed floor wins; a lower value is clamped to the floor, never below it (§5.6).
  const effectiveCapCredits =
    args.capOverrideCredits != null ? Math.max(args.capOverrideCredits, estimate.capCredits) : estimate.capCredits;
  const balanceAfterCap = args.spendableCredits - effectiveCapCredits;
  const consent = consentDecision({
    estimateCredits: estimate.estimateCredits,
    spendableCredits: args.spendableCredits,
    ...(args.dontAskUnder != null ? { dontAskUnder: args.dontAskUnder } : {}),
    ...(args.entitlement ? { entitlement: args.entitlement } : {}),
  });
  // EST.1 — the resolution may only advise tiers the plan permits ("switch to Base" needs Base
  // selectable AND not already priced — §14.6's levers sentence reads the plan rules too).
  const allowedModelTiers = args.allowedModelTiers ?? MODEL_TIERS;
  const insufficient = resolveInsufficientBalance({
    capCredits: effectiveCapCredits,
    spendableCredits: args.spendableCredits,
    ...(args.insufficientMode ? { mode: args.insufficientMode } : {}),
    allowedModelTiers,
    currentModelTier: args.modelTier,
  });

  const claims = estimate.claimCount;

  // P1.06 (§14.3) — the trial entitlement's `Included` rendering: a qualifying unused entitlement makes
  // the run free — the box shows "Included" with the word-cap detail, no dollar/cap arithmetic, and the
  // consent click never appears (consentDecision already returns needsSecondClick:false). When the draft
  // exceeds the entitlement's word cap the offer is the FIRST wordCap words (the sheet shows the @words
  // scope chip so the covered slice is explicit).
  const included = !!args.entitlement;
  // ACT.1 — the Included line is the SHARED claim template (`sheetEntitlementLine` in
  // @rhema/contracts trial-claims): the word cap renders from the entitlement config, never a
  // hand-typed figure here.
  const entitlementLine = args.entitlementDetails
    ? sheetEntitlementLine({
        coveredAll: (args.inputs.words ?? 0) <= args.entitlementDetails.wordCap,
        wordCap: args.entitlementDetails.wordCap,
      })
    : args.entitlement
      ? "Included — your trial run"
      : undefined;

  // P1.06 — the collapsed-row's editable rows: the project approval policy + the consent pref + the
  // cap (upward-only — the floor is the computed figure). Approval labels are the canonical strings
  // (@rhema/commands — the palette's `--wait`/`--auto` chips and the sheet's select share them).
  const approvalPolicy = args.approvalPolicy ?? "named";

  // P1.06 (REQ-SPEC-17's sheet half) — the scope-approval consequence surfaced at launch: informational
  // by default; blocking (2 h, proceed-as-proposed) at Full board / on a protocol|venue change — which
  // P1.20 (§6.7) extends to the settings page's `protocol_changed_at` marker; "waits for you" under
  // Wait-for-me-at-each. The gate mechanics are the landed resolveGatePolicy.
  const scopeBlocking = args.scopeBlocking === true || args.protocolChanged === true;
  const scopeApprovalLine =
    approvalPolicy === "wait_each"
      ? "Scope approval — the run waits for you at the scope gate."
      : scopeBlocking
        ? "Scope approval — a blocking gate opens at launch; proceeds as proposed after 2 hours."
        : "Scope approval — informational; the run proceeds.";

  // P1.20/P1.21 (§6.7) — the settings-page protocol-change marker on the Review's scope card (a fact
  // line, not a gate of its own — the blocking consequence rides scopeApprovalLine above). `vN` is the
  // reviewed head the next Review opens on.
  const protocolChangedLine =
    args.protocolChanged === true
      ? `Protocol changed since ${args.targetVersion} was reviewed.`
      : undefined;

  // P1.21 (§6.7; §16.4's memo-confidentiality row) — a Memo sheet carries the confidentiality
  // statement and the `user_sources` field: sources mount read-only; fetches to them are denied.
  const isMemoSheet = args.scope.protocol === "memo";
  const memoConfidentialityLine = isMemoSheet
    ? "Memo — user-supplied sources mount read-only for this run and are never fetched over the web."
    : undefined;

  // EST.1 — the tier select: one option per canonical tier; a plan-locked tier renders disabled with
  // its price for context; the estimate column reads the SAME lever matrix (no second formula).
  const currentToggles = resolveToggles(profile, args.rigor, args.toggles);
  const modelTierOptions: ModelTierOption[] = MODEL_TIERS.map((tier) => {
    const key = leverKey(args.rigor, tier, currentToggles);
    const s = leverMatrix.states[key] ?? leverMatrix.current;
    return {
      tier,
      display: MODEL_TIER_DISPLAY[tier],
      allowed: allowedModelTiers.includes(tier),
      selected: tier === args.modelTier,
      estimateCredits: s.estimateCredits,
    };
  });

  // per-rigor DEFAULT state at that rigor's notch model tier — the no-JS/reference fallback row
  // (the live recompute script reads `cells`, which keeps the USER's tier across a rigor change).
  const byRigor = {} as RecomputePayload["byRigor"];
  for (const r of RIGORS) {
    const tier = profile.rigorDefaults[r].modelTier;
    const key = leverKey(r, tier, profile.rigorDefaults[r].toggles);
    const s = leverMatrix.states[key] ?? leverMatrix.current;
    byRigor[r] = { estimateCredits: s.estimateCredits, capCredits: s.capCredits, lowMinutes: s.time.lowMinutes, highMinutes: s.time.highMinutes, modelTier: tier };
  }

  // EST.1 — the full in-place recompute table (every rigor|tier|toggle state), keyed by leverKey.
  const cells: RecomputePayload["cells"] = {};
  for (const [key, s] of Object.entries(leverMatrix.states)) {
    cells[key] = { e: s.estimateCredits, c: s.capCredits, lo: s.time.lowMinutes, hi: s.time.highMinutes };
  }

  const missing = args.inputsAvailable === false;

  return {
    workflow: args.workflow,
    title: {
      verbLabel: WORKFLOW_VERB_LABEL[args.workflow] ?? args.workflow,
      targetVersion: args.targetVersion,
      words: args.inputs.words ?? 0,
      ...(claims != null ? { claims } : {}),
    },
    rigor: args.rigor,
    rigorOptions: (["quick", "standard", "full_board"] as Rigor[]).map((r) => ({
      rigor: r,
      display: RIGOR_DISPLAY[r],
      selected: r === args.rigor,
    })),
    modelTier: args.modelTier,
    modelTierDisplay: MODEL_TIER_DISPLAY[args.modelTier],
    modelTierOptions,
    ...(args.requestedModelTier != null && args.requestedModelTier !== args.modelTier
      ? { clampedFromModelTier: args.requestedModelTier }
      : {}),
    estimate: {
      estimateCredits: estimate.estimateCredits,
      capCredits: effectiveCapCredits,
      rateTableVersion: estimate.rateTableVersion,
      provisional: estimate.provisional,
      dollarsLine: estimateLine(estimate.estimateCredits, effectiveCapCredits),
      creditsLine: creditsLine(estimate.estimateCredits, effectiveCapCredits, balanceAfterCap),
      time: surface.duration,
      ...(missing ? { missing: true } : {}),
    },
    consent,
    insufficient,
    toggleDeltas: leverMatrix.toggleDeltas,
    collapsedSummary: collapsedSummary(args.scope, args.modelTier),
    scope: args.scope,
    scopeApprovalLine,
    why: surface.why,
    whyLine: renderWhyLine(surface.why),
    ...(args.scopeLine ? { scopeLine: args.scopeLine } : {}),
    ...(protocolChangedLine ? { protocolChangedLine } : {}),
    ...(memoConfidentialityLine ? { memoConfidentialityLine } : {}),
    ...(isMemoSheet
      ? { userSourcesField: true, ...(args.userSourcesText ? { userSourcesText: args.userSourcesText } : {}) }
      : {}),
    // P1.06 — the command-scope pills + the whole-draft comparison figure (§5.6: scoped beside whole).
    ...(args.commandScope
      ? {
          commandScope: {
            serialized: args.commandScope.serialized,
            labels: args.commandScope.labels,
            ...(whole ? { wholeEstimateCredits: whole.estimateCredits, wholeCapCredits: whole.capCredits } : {}),
          } satisfies CommandScopeView,
        }
      : {}),
    ...(included ? { included: true } : {}),
    ...(entitlementLine ? { entitlementLine } : {}),
    ...(args.entitlementDetails?.id ? { entitlementId: args.entitlementDetails.id } : {}),
    approvalPolicy,
    approvalPolicyDisplay: APPROVAL_DISPLAY[approvalPolicy] ?? approvalPolicy,
    dontAskUnder: args.dontAskUnder ?? 0,
    capFloorCredits: estimate.capCredits,
    ...(args.guidance ? { guidance: args.guidance } : {}),
    ...(args.standingNotes != null ? { standingNotes: args.standingNotes } : {}),
    ...(args.headState === "working" && args.promoteToVersion
      ? { promoteLine: `The working copy will be promoted to ${args.promoteToVersion} when this run starts.`, headState: args.headState }
      : args.headState
        ? { headState: args.headState }
        : {}),
    leverMatrix,
    idempotencyKey: args.idempotencyKey,
    // BILL.3 — a closed purchase mode strips the Payment Link from the view even when configured.
    ...(args.paymentLinkUrl && !args.suspended && !args.purchaseClosed
      ? { paymentLinkUrl: args.paymentLinkUrl }
      : {}),
    ...(args.purchaseClosed ? { purchaseClosed: true } : {}),
    ...(args.suspended ? { suspended: true } : {}),
    ...(args.planOfferUrl ? { planOfferUrl: args.planOfferUrl } : {}),
    recompute: {
      spendableCredits: args.spendableCredits,
      dontAskUnder: args.dontAskUnder ?? 0,
      entitlement: !!args.entitlement,
      cells,
      allowedModelTiers,
      modelTier: args.modelTier,
      byRigor,
    },
  };
}

export type { ToggleKey };
