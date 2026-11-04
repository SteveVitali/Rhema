// R7DEM.3b (REQ-DWEB-15; S-9; ADR-126) — the REPLAYED run's view-model variants: a run replayed
// from a delivered agent-discourse record carries only the facts that record holds. Every numeric
// field the record does not carry (credits, elapsed, estimate, tokens, searches) is OMITTED and
// listed in `notRecorded` — never serialized as 0 (spec §8.2; cross-cutting invariant 14). These
// types are additive siblings of `RunCardView`/`RunSummaryView`/`RunReportView`: no existing field
// is narrowed or changed, so live reads are untouched.

import type { RunState } from "@rhema/contracts";
import type {
  DeliverableChip,
  PhaseProgress,
  RunCardAction,
} from "./run-card.js";
import type { DeliveredSummary } from "./delivered-summary.js";
import type { GateDecisionView } from "./gate-card.js";
import type { ReportPhase, RunReportView } from "./run-report.js";

/** The fields a replayed run marks "not recorded" (S-9; REQ-DWEB-15). */
export type ReplayedNotRecorded =
  | "time"
  | "credits"
  | "model"
  | "estimate"
  | "approvals"
  | "usage"
  | "fetch_log"
  | "access_report"
  | "rigor";

/** One approval/gate fact exactly as PROVENANCE.md records it — the only facts S-9 may cite. */
export interface ReplayedApprovalFact {
  readonly round: string;
  readonly decision: string;
  readonly note?: string;
}

/**
 * The replayed run card: the same card anatomy minus every field the record does not hold.
 * `phases` is the set inferred from the delivered files (S-9); `phaseSource` tells the renderer
 * to label each row "inferred from the delivered files". `approvals` carries only verbatim
 * PROVENANCE facts — `"not_recorded"` when the record holds none.
 */
export interface ReplayedRunCardView {
  readonly replayed: true;
  /** the record this card replays — always the agent-discourse corpus record. */
  readonly recordSource: "agent-discourse";
  readonly runId: string;
  readonly state: RunState;
  readonly phases: readonly PhaseProgress[];
  readonly phaseSource: "inferred_from_delivered_files";
  readonly done: number;
  readonly running: number;
  readonly total: number;
  /** the delivered-record artifact list behind the phase set (verbatim corpus paths). */
  readonly artifacts: readonly string[];
  readonly deliverables: readonly DeliverableChip[];
  /** the record-composed "What it delivered" block (213's composer on snapshot data). */
  readonly delivered: DeliveredSummary | null;
  /** permanent decision rows — always empty on a replayed card; approvals ride `approvals`. */
  readonly decisions: readonly GateDecisionView[];
  readonly approvals: readonly ReplayedApprovalFact[] | "not_recorded";
  /** every card field the record does not hold (time, credits, model, estimate). */
  readonly notRecorded: readonly ReplayedNotRecorded[];
  readonly actions: readonly RunCardAction[];
  readonly failureCode: string | null;
  readonly deliveryLabel: "unverified" | null;
}

/** The ONE-summary shape for a replayed run (REQ-SYNC-1 — the same seam the Timeline mounts). */
export interface ReplayedRunSummaryView {
  readonly runId: string;
  readonly workflow: string;
  readonly state: RunState;
  /** the record holds no run timestamps — `null` + `card.notRecorded` carries "time". */
  readonly createdAt: string | null;
  readonly card: ReplayedRunCardView;
}

/** A report phase row for a replayed run — key/ordinal/status only, no usage fields. */
export interface ReplayedReportPhase {
  readonly key: string;
  readonly ordinal: number;
  readonly status: ReportPhase["status"];
  readonly seat: string | null;
  readonly source: "inferred_from_delivered_files";
}

/**
 * The Level-3 run report for a replayed run: the delivered-record facts only. Every money/usage
 * field of `RunReportView` is omitted and named in `notRecorded`; `claims` carries the ledger's
 * own checked/verified counts with the per-claim cost field dropped.
 */
export interface ReplayedRunReportView
  extends Omit<
    RunReportView,
    | "estimateCredits"
    | "spentCredits"
    | "meteredCredits"
    | "differences"
    | "capCredits"
    | "refundedCredits"
    | "estimateRatio"
    | "phases"
    | "seatSplit"
    | "flags"
    | "claims"
    | "drivers"
    | "suggestedGuidance"
    | "rateTableVersion"
  > {
  readonly replayed: true;
  readonly phases: readonly ReplayedReportPhase[];
  /** the claim ledger's own counts — recorded; `creditsPerVerified` is money and stays absent. */
  readonly claims: { readonly checked: number; readonly verified: number } | null;
  readonly notRecorded: readonly ReplayedNotRecorded[];
  readonly approvals: readonly ReplayedApprovalFact[] | "not_recorded";
}
