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
  RIGOR_DISPLAY,
  type ConsentDecision,
  type InsufficientBalanceResolution,
  type ModelTier,
  type Rigor,
  type WorkflowKey,
} from "@rhema/contracts";
import { estimatorSpec, MODEL_TIER_MULTIPLIERS, rigorMultiplier, type EstimatorInputs } from "@rhema/protocols";
import { APPROVAL_DISPLAY } from "@rhema/commands";
import { buildEstimate } from "./estimate.js";
import { buildLeverMatrix, leverKey, type LeverMatrix, type TimeBand } from "./lever-matrix.js";
import { sheetProfile, type ToggleKey, type ToggleState } from "./profiles.js";
import { RIGORS } from "@rhema/contracts";

/** The verb label for a workflow's title line (not reserved vocab; the three beta verbs). */
export const WORKFLOW_VERB_LABEL: Partial<Record<WorkflowKey, string>> = {
  review: "Review",
  revise: "Revise",
  fact_check: "Fact-check",
};

export interface SheetScope {
  /** Essay only at beta (§5.6). */
  readonly protocol: string;
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
  /** the FIRST, dollars-first line (REQ-BILL-1). */
  readonly dollarsLine: string;
  /** the SECOND, credits/cap/balance-after line (REQ-BILL-1). */
  readonly creditsLine: string;
  readonly time: TimeBand;
}

export interface RigorOption {
  readonly rigor: Rigor;
  readonly display: string;
  readonly selected: boolean;
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
  readonly whyLine: string;
  /** the obligation scope line (REQ-OBJ-6), when the caller supplied obligation data. */
  readonly scopeLine?: string;
  /**
   * P1.20 (§6.7) — the "Protocol changed since the last Review" marker line on the Review's scope card;
   * set when the settings page's protocol change is still unconsumed.
   */
  readonly protocolChangedLine?: string;
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
}

/** The data the inline progressive-enhancement script uses to recompute the estimate box on a Rigor change
 *  (§5.6 item 2) — the one first-class lever. Advanced toggles recompute on submit (under the fold). */
export interface RecomputePayload {
  readonly spendableCredits: number;
  readonly dontAskUnder: number;
  readonly entitlement: boolean;
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
}

/** The "Why this estimate?" breakdown ("21 claims × 24 cr ≈ 500 · 5,180 words ≈ 60"). Approximate by design. */
function whyLine(args: BuildRunSheetViewArgs, pricedInputs: EstimatorInputs, claims: number | undefined): string {
  const spec = estimatorSpec(args.workflow);
  const scale =
    MODEL_TIER_MULTIPLIERS[args.modelTier] *
    rigorMultiplier(args.workflow, args.rigor) *
    (spec?.calibrationScale ?? 1) *
    (spec?.meteredCoverage ?? 1);
  const parts: string[] = [];
  const perClaim = spec?.costPerVerifiedClaimBase;
  if (claims != null && perClaim != null) {
    parts.push(`${formatCredits(claims)} claims × ${formatCredits(perClaim)} cr ≈ ${formatCredits(claims * perClaim * scale)}`);
  }
  const perWord = spec?.base?.perWord;
  const words = pricedInputs.words;
  if (perWord != null && words) {
    parts.push(`${formatCredits(words)} words ≈ ${formatCredits(words * perWord * scale)}`);
  }
  return parts.join(" · ");
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
  const estimate = buildEstimate({
    workflow: args.workflow,
    rigor: args.rigor,
    modelTier: args.modelTier,
    inputs: pricedInputs,
    ...(args.toggles ? { toggles: args.toggles } : {}),
    ...(args.variant ? { variant: args.variant } : {}),
    ...(args.breakerMultiplier ? { breakerMultiplier: args.breakerMultiplier } : {}),
    ...(args.claimCount != null ? { claimCount: args.claimCount } : {}),
  });
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
  const insufficient = resolveInsufficientBalance({
    capCredits: effectiveCapCredits,
    spendableCredits: args.spendableCredits,
    ...(args.insufficientMode ? { mode: args.insufficientMode } : {}),
  });

  const claims = estimate.claimCount;

  // P1.06 (§14.3) — the trial entitlement's `Included` rendering: a qualifying unused entitlement makes
  // the run free — the box shows "Included" with the word-cap detail, no dollar/cap arithmetic, and the
  // consent click never appears (consentDecision already returns needsSecondClick:false). When the draft
  // exceeds the entitlement's word cap the offer is the FIRST wordCap words (the sheet shows the @words
  // scope chip so the covered slice is explicit).
  const included = !!args.entitlement;
  const entitlementLine = args.entitlementDetails
    ? (args.inputs.words ?? 0) > args.entitlementDetails.wordCap
      ? `Included — your trial run covers the first ${args.entitlementDetails.wordCap.toLocaleString("en-US")} words`
      : `Included — your trial run covers up to ${args.entitlementDetails.wordCap.toLocaleString("en-US")} words`
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

  // P1.20 (§6.7) — the settings-page protocol change marker on the Review's scope card (a fact line,
  // not a gate of its own — the blocking consequence rides scopeApprovalLine above).
  const protocolChangedLine = args.protocolChanged === true ? "Protocol changed since the last Review." : undefined;

  // per-rigor DEFAULT state at THAT rigor's default model tier (§6.5: tier is a consequence of rigor) —
  // the inline enhancement's recompute table. Switching rigor moves the tier with it.
  const byRigor = {} as RecomputePayload["byRigor"];
  for (const r of RIGORS) {
    const tier = profile.rigorDefaults[r].modelTier;
    const key = leverKey(r, tier, profile.rigorDefaults[r].toggles);
    const s = leverMatrix.states[key] ?? leverMatrix.current;
    byRigor[r] = { estimateCredits: s.estimateCredits, capCredits: s.capCredits, lowMinutes: s.time.lowMinutes, highMinutes: s.time.highMinutes, modelTier: tier };
  }

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
    estimate: {
      estimateCredits: estimate.estimateCredits,
      capCredits: effectiveCapCredits,
      rateTableVersion: estimate.rateTableVersion,
      provisional: estimate.provisional,
      dollarsLine: estimateLine(estimate.estimateCredits, effectiveCapCredits),
      creditsLine: creditsLine(estimate.estimateCredits, effectiveCapCredits, balanceAfterCap),
      time: leverMatrix.current.time,
    },
    consent,
    insufficient,
    toggleDeltas: leverMatrix.toggleDeltas,
    collapsedSummary: collapsedSummary(args.scope, args.modelTier),
    scope: args.scope,
    scopeApprovalLine,
    whyLine: whyLine(args, pricedInputs, claims),
    ...(args.scopeLine ? { scopeLine: args.scopeLine } : {}),
    ...(protocolChangedLine ? { protocolChangedLine } : {}),
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
    ...(args.paymentLinkUrl && !args.suspended ? { paymentLinkUrl: args.paymentLinkUrl } : {}),
    ...(args.suspended ? { suspended: true } : {}),
    ...(args.planOfferUrl ? { planOfferUrl: args.planOfferUrl } : {}),
    recompute: {
      spendableCredits: args.spendableCredits,
      dontAskUnder: args.dontAskUnder ?? 0,
      entitlement: !!args.entitlement,
      byRigor,
    },
  };
}

export type { ToggleKey };
