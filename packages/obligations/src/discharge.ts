import type { Actor } from "@rhema/contracts";
import type { ObligationDeps, ObligationRow, SqlExecutor } from "./types.js";
import { loadObligation, loadProjectObligations } from "./queries.js";
import { applyObligationTransition, ObligationTransitionError } from "./state-machine.js";
import { incrementRoundsOpen } from "./spawn.js";
import { createDecisionRequest } from "./routing.js";

// Discharge, moot, reopen and the deferral horizon (REQ-OBJ-3 closing paths + REQ-DATA-26). Every path here is
// a named cause in the closed-world machine; none of them can close an obligation without one. `discharged` is
// verified (gap_check / covering-review no-match) or by-hand ("discharged (unverified)"); `mooted` is
// REQ-DATA-26's auto-disposition; `reopened` is a regression; a `deferred` horizon's arrival returns it to open.

export interface DischargeArgs {
  readonly obligationId: string;
  readonly draftId: string;
  readonly byActor: Actor;
  readonly dispositionId?: string;
  readonly moveOrdinal?: number;
  readonly runId?: string | null;
  readonly at?: Date;
}

/** A Full-board gap check verified the move → `discharged` (dischargedBy.verifiedBy = 'gap_check'). */
export async function dischargeByGapCheck(exec: SqlExecutor, deps: ObligationDeps, args: DischargeArgs): Promise<void> {
  await applyObligationTransition(exec, deps, {
    obligationId: args.obligationId,
    to: "discharged",
    cause: "gap_check",
    byActor: args.byActor,
    dischargedBy: {
      verifiedBy: "gap_check",
      draftId: args.draftId,
      ...(args.dispositionId ? { dispositionId: args.dispositionId } : {}),
      ...(args.moveOrdinal !== undefined ? { moveOrdinal: args.moveOrdinal } : {}),
    },
    runId: args.runId ?? null,
    dispositionId: args.dispositionId ?? null,
    at: args.at ?? deps.clock.now(),
  });
}

/** The next covering Review matched no new finding onto the lineage → `discharged` (verifiedBy 're_review'). */
export async function dischargeByNoMatch(exec: SqlExecutor, deps: ObligationDeps, args: DischargeArgs): Promise<void> {
  await applyObligationTransition(exec, deps, {
    obligationId: args.obligationId,
    to: "discharged",
    cause: "no_match",
    byActor: args.byActor,
    dischargedBy: { verifiedBy: "re_review", draftId: args.draftId },
    runId: args.runId ?? null,
    at: args.at ?? deps.clock.now(),
  });
}

/**
 * By-hand discharge with a REQUIRED note — rendered "discharged (unverified)" (the REQ-PROD-11 honesty
 * pattern; verifiedBy 'user'). The note is stored as the closing rationale so the record carries why.
 */
export async function dischargeByHand(
  exec: SqlExecutor,
  deps: ObligationDeps,
  args: DischargeArgs & { readonly note: string },
): Promise<void> {
  if (!(args.note && args.note.trim())) {
    throw new ObligationTransitionError("a by-hand discharge requires a note (rendered 'discharged (unverified)'; REQ-OBJ-3)");
  }
  await applyObligationTransition(exec, deps, {
    obligationId: args.obligationId,
    to: "discharged",
    cause: "user",
    byActor: args.byActor,
    rationale: args.note,
    dischargedBy: { verifiedBy: "user", draftId: args.draftId },
    runId: args.runId ?? null,
    at: args.at ?? deps.clock.now(),
  });
}

/** REQ-DATA-26's `mooted` auto-disposition (a quote no longer resolves after a human revision). */
export async function mootObligation(
  exec: SqlExecutor,
  deps: ObligationDeps,
  args: { obligationId: string; byActor: Actor; runId?: string | null; at?: Date },
): Promise<void> {
  await applyObligationTransition(exec, deps, {
    obligationId: args.obligationId,
    to: "mooted",
    cause: "moot",
    byActor: args.byActor,
    runId: args.runId ?? null,
    at: args.at ?? deps.clock.now(),
  });
}

/**
 * A delivered review matched a NEW finding onto an addressed/discharged/mooted lineage → `reopened`, recording
 * the triggering finding as the regression, and `roundsOpen` increments (REQ-OBJ-4 / REQ-WF-7).
 */
export async function reopenObligation(
  exec: SqlExecutor,
  deps: ObligationDeps,
  args: { obligationId: string; findingId: string; byActor: Actor; runId?: string | null; at?: Date },
): Promise<void> {
  await applyObligationTransition(exec, deps, {
    obligationId: args.obligationId,
    to: "reopened",
    cause: "regression",
    byActor: args.byActor,
    findingId: args.findingId,
    runId: args.runId ?? null,
    at: args.at ?? deps.clock.now(),
  });
  await incrementRoundsOpen(exec, args.obligationId);
}

/** Return a deferred obligation to `open` — the horizon arrived (or a manual pick-up). */
export async function returnDeferredToOpen(
  exec: SqlExecutor,
  deps: ObligationDeps,
  args: { obligationId: string; byActor: Actor; cause?: "horizon" | "user"; runId?: string | null; at?: Date },
): Promise<void> {
  // flip the state FIRST (the deferred-requires-rationale DDL check forbids nulling rationale while deferred),
  // then clear the now-stale horizon + rationale — a snooze is not a burial.
  await applyObligationTransition(exec, deps, {
    obligationId: args.obligationId,
    to: "open",
    cause: args.cause ?? "horizon",
    byActor: args.byActor,
    runId: args.runId ?? null,
    at: args.at ?? deps.clock.now(),
  });
  await exec.query(`update revision_obligations set rationale = null, defer_horizon = null where id = $1`, [args.obligationId]);
}

/** True when a deferred obligation's horizon has arrived in `context` (a review round, or export). */
export function horizonArrived(
  ob: ObligationRow,
  context: { kind: "review" } | { kind: "pre_export" },
): boolean {
  if (ob.state !== "deferred") return false;
  const h = ob.deferHorizon;
  if (!h) return true; // a deferral with no horizon behaves as "next_review"
  if (context.kind === "pre_export") return h.until === "pre_export";
  // a review round: `next_review` arrives now; a rounds countdown arrives when it reaches 0.
  if (h.until === "next_review") return true;
  if (typeof h.rounds === "number") return h.rounds <= 1; // this review is the last remaining round
  return false;
}

/**
 * Sweep a project's deferred obligations whose horizon has arrived and return them to `open` (§11.7 — a snooze
 * re-enters the run sheet / export dialog). At a review round, a rounds-countdown horizon that has NOT yet
 * arrived is decremented (one round consumed). Returns the ids returned to open. Called at a covering-review
 * delivery (`context: 'review'`) and when the export dialog opens (`context: 'pre_export'`).
 */
export async function sweepArrivedDeferrals(
  exec: SqlExecutor,
  deps: ObligationDeps,
  args: { projectId: string; context: "review" | "pre_export"; byActor?: Actor; runId?: string | null; at?: Date },
): Promise<string[]> {
  const actor: Actor = args.byActor ?? { kind: "system" };
  const returned: string[] = [];
  for (const ob of await loadProjectObligations(exec, args.projectId)) {
    if (ob.state !== "deferred") continue;
    const ctx = args.context === "review" ? ({ kind: "review" } as const) : ({ kind: "pre_export" } as const);
    if (horizonArrived(ob, ctx)) {
      await returnDeferredToOpen(exec, deps, { obligationId: ob.id, byActor: actor, cause: "horizon", runId: args.runId ?? null, ...(args.at ? { at: args.at } : {}) });
      // P1.19 — REQ-OBJ-6: a horizon-expired deferral is a Decisions-inbox row ("decide / re-defer /
      // drop"), not a silent re-open — the Inbox needs a row the badge/ordering can see. Idempotent:
      // `createDecisionRequest` re-uses an already-open request for the obligation.
      await createDecisionRequest(exec, deps, {
        obligationId: ob.id,
        runId: args.runId ?? null,
        text: `Deferred ${ob.roundsOpen > 0 ? `${ob.roundsOpen} round${ob.roundsOpen === 1 ? "" : "s"}` : "previously"}, horizon reached: ${ob.title}`,
        options: ["decide", "re-defer", "drop"],
      });
      returned.push(ob.id);
    } else if (args.context === "review" && ob.deferHorizon && typeof ob.deferHorizon.rounds === "number") {
      // consume one round of the countdown (a direct jsonb update — not `state`).
      const next = { ...ob.deferHorizon, rounds: ob.deferHorizon.rounds - 1 };
      await exec.query(`update revision_obligations set defer_horizon = $1 where id = $2`, [JSON.stringify(next), ob.id]);
    }
  }
  return returned;
}

export { loadObligation };
