import {
  isAutoProceed,
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
  const autoProceed = isAutoProceed(facts.onExpiry);
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
    isAutoProceed(row.onExpiry) && row.presenceDeadlineAt != null;
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
