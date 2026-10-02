import {
  isAutoProceed,
  NEVER_AUTOPROCEED_GATES,
  type GateKind,
  type GateOnExpiry,
  type GateView,
} from "@rhema/contracts";
import { gateDeadlineState, type DeadlineState } from "./deadline.js";

// The §6.4 gate card — one generic component's rules for every beta gate kind (REQ-BETA-1, REQ-SPEC-18).
// Framework-free: the web's SSR card and the 1.x mobile card share the model.
//
// REQ-SPEC-18 (presence): a focused, unread auto-proceed gate gets a 10-minute countdown; the server sets
// `presence_deadline_at` only in that case (P0.10). This module ALSO refuses to emit a presence timer for
// any gate whose `onExpiry` is not auto-proceed — defense in depth so wait-default and spend/refusal cards
// can never display one (AC4).

/** The five card actions (§6.4 item 1). Approve is always pre-filled (the primary). */
export const GATE_CARD_ACTIONS = [
  "approve",
  "approve_autonomous",
  "keep_planning",
  "wait",
  "stop",
] as const;
export type GateCardAction = (typeof GATE_CARD_ACTIONS)[number];

/** §10.1 phone-width input set for a gate card: Approve / Wait for me / Stop. */
export const GATE_CARD_ACTIONS_PHONE: readonly GateCardAction[] = ["approve", "wait", "stop"];

/** The actions a gate card offers. Desktop: all five; phone-width: approve/wait/stop only (§10.1). */
export function gateCardActions(surface: "full" | "phone" = "full"): readonly GateCardAction[] {
  return surface === "phone" ? GATE_CARD_ACTIONS_PHONE : GATE_CARD_ACTIONS;
}

/** What the card's "do nothing" sentence promises — keyed so the app owns the wording. */
export type DoNothingOutcome = "proceed_as_proposed" | "proceed_conservative" | "cancel" | "accept_partial" | "wait";

/** The do-nothing outcome for a gate: its `onExpiry`, or "wait" (nothing happens without you). */
export function doNothingOutcome(onExpiry: GateOnExpiry): DoNothingOutcome {
  return onExpiry === "wait" ? "wait" : onExpiry;
}

/** The raw facts the card model is built from (a gates row + run spend facts + the resolved policy). */
export interface GateCardFacts {
  readonly kind: GateKind;
  /** the resolved `onExpiry` for THIS gate (policy/project overrides already applied). */
  readonly onExpiry: GateOnExpiry;
  readonly blocking: boolean;
  /** true once "Wait for me" held the gate (deadline cleared server-side). */
  readonly held: boolean;
  readonly openedAt: string;
  readonly deadlineAt: string | null;
  /** set only by the server for a focused, unread AUTO-PROCEED gate (REQ-SPEC-18). */
  readonly presenceDeadlineAt: string | null;
  /** the reading activity paused/extended the presence deadline (§6.4 item 2). */
  readonly pausedWhileReading: boolean;
  /** run spend facts for the "cost so far / remaining" line (§6.4). */
  readonly spentCredits: number;
  readonly capCredits: number;
  readonly remainingEstimateCredits?: number | null;
}

export interface PresenceTimerModel {
  /** the presence deadline is live — show the countdown. */
  readonly active: boolean;
  readonly deadlineAt?: string;
  readonly remainingMs?: number;
  /** true while the reading pause holds (the "paused while you read" note). */
  readonly paused: boolean;
}

export interface GateCardModel {
  readonly kind: GateKind;
  readonly blocking: boolean;
  /** informational approve_scope renders the same anatomy flagged non-blocking (§6.4). */
  readonly informational: boolean;
  /** wait-default gates never display a presence countdown (REQ-SPEC-18). */
  readonly autoProceed: boolean;
  readonly deadline: DeadlineState;
  readonly presence: PresenceTimerModel;
  readonly held: boolean;
  readonly doNothing: DoNothingOutcome;
  readonly actions: readonly GateCardAction[];
  readonly spentCredits: number;
  readonly capCredits: number;
  readonly remainingEstimateCredits: number | null;
}

/**
 * Build the §6.4 card model. `surface: "phone"` reduces the action set to approve/wait/stop — every other
 * fact is identical (REQ-SPEC-20: the phone card is the same component, narrower input set).
 */
export function buildGateCard(
  facts: GateCardFacts,
  now: Date,
  surface: "full" | "phone" = "full",
): GateCardModel {
  // P1.09 (REQ-SPEC-1, AC4) — spend/refusal kinds can NEVER auto-proceed, under any display: even a
  // poisoned row carrying a proceed_* expiry renders non-autoProceed (no countdown, no ping script).
  const autoProceed = isAutoProceed(facts.onExpiry) && !NEVER_AUTOPROCEED_GATES.includes(facts.kind);
  const deadline = gateDeadlineState(facts.deadlineAt, now);
  const presenceActive =
    autoProceed && facts.presenceDeadlineAt != null && !facts.held;
  const presenceRemaining =
    presenceActive && facts.presenceDeadlineAt != null
      ? Date.parse(facts.presenceDeadlineAt) - now.getTime()
      : undefined;
  return {
    kind: facts.kind,
    blocking: facts.blocking,
    informational: !facts.blocking,
    autoProceed,
    deadline,
    presence: {
      active: presenceActive,
      ...(facts.presenceDeadlineAt != null ? { deadlineAt: facts.presenceDeadlineAt } : {}),
      ...(presenceRemaining != null ? { remainingMs: Math.max(0, presenceRemaining) } : {}),
      paused: facts.pausedWhileReading,
    },
    held: facts.held,
    doNothing: doNothingOutcome(facts.onExpiry),
    actions: gateCardActions(surface),
    spentCredits: facts.spentCredits,
    capCredits: facts.capCredits,
    remainingEstimateCredits: facts.remainingEstimateCredits ?? null,
  };
}

/**
 * Map a gates row into the shared `GateView` contract (apps/api returns this shape). The presence timer
 * is emitted ONLY for an auto-proceed gate with a server-set presence deadline (REQ-SPEC-18; AC4) — a
 * wait-default or spend/refusal gate never carries one, whatever the row holds.
 */
export function gateViewFromRow(row: {
  readonly id: string;
  readonly runId: string;
  readonly kind: GateKind;
  readonly artifactVersionId: string | null;
  readonly openedAt: string;
  readonly deadlineAt: string | null;
  readonly presenceDeadlineAt: string | null;
  readonly pausedWhileReading: boolean;
  readonly blocking: boolean;
  readonly onExpiry: GateOnExpiry;
}): GateView {
  const emitPresence =
    isAutoProceed(row.onExpiry) &&
    !NEVER_AUTOPROCEED_GATES.includes(row.kind) && // P1.09 — spend/refusal kinds never carry a timer.
    row.presenceDeadlineAt != null;
  return {
    id: row.id,
    runId: row.runId,
    kind: row.kind,
    ...(row.artifactVersionId != null ? { artifactVersionId: row.artifactVersionId } : {}),
    openedAt: row.openedAt,
    ...(row.deadlineAt != null ? { deadlineAt: row.deadlineAt } : {}),
    blocking: row.blocking,
    ...(emitPresence
      ? {
          presenceTimer: {
            deadlineAt: row.presenceDeadlineAt as string,
            paused: row.pausedWhileReading,
          },
        }
      : {}),
  };
}

/** mm:ss countdown text for the presence timer ("9:41"). */
export function presenceCountdown(remainingMs: number): string {
  const totalSeconds = Math.max(0, Math.floor(remainingMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
}

// -------------------------------------------------------------------------------------------------------------------
// P1.09 — the §6.4 structured-edit payloads, the Needs-you ordering, and the permanent decision record.

/**
 * A spine claim on the Approve-plan card (§6.4 item 4). Editable: reorder (the posted `ord`),
 * strike, add-with-note. `struck`/`note` reflect an already-applied edit the artifact's sidecar
 * rows carry.
 */
export interface GatePlanSpineClaimView {
  readonly text: string;
  readonly struck?: boolean;
  readonly note?: string;
}

/** A plan section row (§6.4 item 4): order, target words, function — each an editable field. */
export interface GatePlanSectionView {
  readonly ref: string;
  readonly title: string;
  readonly targetWords?: number;
  readonly purpose?: string;
}

/** The Approve-plan structured body: the structure-plan sidecar rows as an editable view. */
export interface GatePlanView {
  readonly spine: readonly GatePlanSpineClaimView[];
  readonly sections: readonly GatePlanSectionView[];
  readonly alternativesConsidered?: readonly string[];
  readonly gaps?: readonly string[];
  /** the apparatus budget row (§6.4 item 4) — edits post as a numeric field. */
  readonly apparatusBudget?: number;
}

/**
 * The Approve-scope variant facts (§6.4 row 2). `informational`/`exceedsCap`/`estimateCredits` are
 * server-derived — the card renders the informational note, the blocking countdown, or the
 * spend-wait line from these, never from client-side inference.
 */
export interface GateScopeView {
  /** informational variant — no countdown; the fields post as corrections. */
  readonly informational: boolean;
  /** the re-priced estimate exceeds the consented cap → the approval waits (never auto-proceeds). */
  readonly exceedsCap?: boolean;
  readonly estimateCredits?: number;
  readonly capCredits?: number;
  /** the sheet's submitted values vs the project's pins (the diff the card frames). */
  readonly protocol?: string | null;
  readonly venue?: string | null;
  readonly stage?: string | null;
  readonly rigor?: string | null;
}

/** One cut-list row (§6.4 item 4): the toggle is protect/restore — `protect` keeps the text. */
export interface GateCutItemView {
  readonly ordinal: number;
  readonly words: number;
  readonly reason: string;
  readonly protect: boolean;
}

export interface GateCutListView {
  readonly targetWords?: number;
  readonly cuts: readonly GateCutItemView[];
}

/**
 * The per-kind structured body on the card DTO (§6.4 item 4 — "the kind's structured parts"). Each
 * kind fills at most one slot plus optional generic `facts` lines (the sample census, the round
 * summary, the cost facts, the refusal reason) — server-composed from whitelisted fields only.
 */
export interface GateStructuredView {
  readonly plan?: GatePlanView;
  readonly scope?: GateScopeView;
  readonly cutList?: GateCutListView;
  /**
   * Kind-generic read-only FACTS keyed by name (confirm_cost's estimate/cap, continue_rounds'
   * spend-vs-budget, the refusal's reason, the sample census…) — values only; the app composes the
   * wording so the same copy table owns every surface.
   */
  readonly facts?: Readonly<Record<string, string | number | boolean | null>>;
}

/** One triage-ledger row as the card renders it (the response-ledger sidecar's `rows`). */
export interface GateTriageRowView {
  readonly findingId: string;
  readonly ordinal: number;
  readonly title: string;
  readonly severity: string;
  readonly disposition?: {
    readonly kind: string;
    readonly rationale?: string;
    /** "user" marks a row the human wrote (REQ-SPEC-9). */
    readonly actor?: string;
  };
}

/**
 * The gate card's wire shape — the api's `GateCardDto` (session `GET /projects/:id/gates` AND the
 * Timeline's per-run `gate`). One shape = identical cards on every surface (§6.4's contract).
 */
export interface GateCardWire {
  readonly id: string;
  readonly runId: string;
  readonly kind: GateKind;
  readonly workflow: string;
  readonly artifactVersionId?: string | null;
  /** the artifact's stable id — the read-before-approve sheet links to `/p/:slug/a/:artifactId`. */
  readonly artifactId?: string | null;
  readonly artifactTitle?: string | null;
  readonly openedAt: string;
  readonly deadlineAt?: string | null;
  readonly presenceDeadlineAt?: string | null;
  readonly pausedWhileReading: boolean;
  readonly held: boolean;
  readonly blocking: boolean;
  readonly onExpiry: GateOnExpiry;
  readonly spentCredits: number;
  readonly capCredits: number;
  /** estimate − spent, server-computed (the "about N more" line). */
  readonly remainingEstimateCredits?: number | null;
  readonly modelTier?: string | null;
  /** the kind's structured parts (§6.4 item 4) — absent for kinds the workflow cannot produce. */
  readonly structured?: GateStructuredView;
  /** approve_triage's response-ledger rows (actor:user = authoritative). */
  readonly triage?: { readonly rows: readonly GateTriageRowView[] };
}

/**
 * A permanent gate-decision record as surfaces render it (§6.4 item 8 — "decisions are permanent
 * records on the run"). `changes` counts the structured edits applied; `overlayVersionIds` are the
 * serialized write-back versions the edit produced (the REQ-RUN-5 audit trail).
 */
export interface GateDecisionView {
  readonly id: string;
  readonly gateId: string;
  readonly kind: GateKind;
  /** the resolved action: approve | approve_autonomous | wait | stop | auto | expired | skipped | … */
  readonly action: string;
  /** who/what resolved it: 'user' | 'timeout' | 'policy' | 'steering' … */
  readonly byActor: string;
  /** true = the presence countdown fired this resolution (§6.4 item 8's presence marker). */
  readonly presence: boolean;
  readonly at: string;
  readonly changes?: number;
  readonly overlayVersionIds?: readonly string[];
  /** the recorded decision text (the user's note or the composed "with N changes" line). */
  readonly text?: string | null;
}

/**
 * The Needs-you/Inbox ordering (§5.11): blocked-on-you first by soonest deadline, then waiting
 * approvals (no deadline — "waiting for you"), informational last. Deterministic; `openedAt` breaks
 * ties oldest-first.
 */
export function needsYouOrder<T extends { blocking?: boolean; deadlineAt?: string | null; openedAt?: string }>(
  cards: readonly T[],
): T[] {
  const rank = (c: T): number => {
    if (c.blocking === false) return 2;
    return c.deadlineAt ? 0 : 1;
  };
  return [...cards].sort((a, b) => {
    const ra = rank(a);
    const rb = rank(b);
    if (ra !== rb) return ra - rb;
    if (ra === 0) {
      const da = a.deadlineAt ?? "";
      const db = b.deadlineAt ?? "";
      if (da !== db) return da < db ? -1 : 1;
    }
    const oa = a.openedAt ?? "";
    const ob = b.openedAt ?? "";
    return oa < ob ? -1 : oa > ob ? 1 : 0;
  });
}
