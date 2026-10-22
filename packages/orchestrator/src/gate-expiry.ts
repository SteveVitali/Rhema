// Gate expiry machinery (§6.4 item 6/7; REQ-RUN-6 amended; REQ-SPEC-18; review 13 F9). P0.08 registered the
// `gate:<id>` job TYPE; this ticket OWNS scheduling and handler semantics: a due deadline runs the kind's
// `onExpiry` as a CONDITIONAL update (act only if still unresolved — one winner), and the handler re-reads
// `deadline_at` on fire and RESCHEDULES itself if the deadline moved. Pause-while-reading and bounded activity
// extensions (+10 min, cap +24 h) and the presence timer (a 10-min shortened auto-proceed deadline for a
// present user) are server-side deadline STATE. Spend/refusal kinds never auto-proceed (AC2), enforced here too.

import { GATE_DEFAULTS, isAutoProceed, type GateKind, type GateOnExpiry } from "@rhema/contracts";
import type { OrchestratorDeps } from "./internal-api.js";
import { applyTransition } from "./transition.js";
import { revokeRunCredentials } from "./credentials.js";
import { reconcileRunSpend } from "./spend.js";
import { RUN_JOBS, scheduleGateExpiry } from "./queue.js";
import { NOTIFY_QUEUE, scheduleGateReminders, scheduleRunTerminalNotification } from "./notifications.js";
import { conditionalResolve, writeDecision, emitGateResolved } from "./gate-resolution.js";
import { publishCommittedEventHighWater } from "./event-store.js";
import type { RunState } from "./state-machine.js";
import type { SqlClient } from "./tx.js";

/** A present user's shortened auto-proceed deadline is 10 min ("proceeding in 9:40 …"; §6.4 item 2). */
export const PRESENCE_TIMER_MS = 10 * 60 * 1000;
/** Each activity ping while reading extends the deadline +10 min … (review 13 F9). */
export const ACTIVITY_EXTENSION_MS = 10 * 60 * 1000;
/** … capped at +24 h from open, so a stuck tab cannot hold a writer lock forever (review 13 F9). */
export const ACTIVITY_EXTENSION_CAP_MS = 24 * 60 * 60 * 1000;

/** onExpiry → the DecisionAction recorded when the timer fires (wait never fires). */
const EXPIRY_ACTION: Record<Exclude<GateOnExpiry, "wait">, "proceed_conservative" | "proceed_as_proposed" | "cancel" | "accept_partial"> = {
  proceed_conservative: "proceed_conservative",
  proceed_as_proposed: "proceed_as_proposed",
  cancel: "cancel",
  accept_partial: "accept_partial",
};

export type GateExpiryOutcome =
  | { readonly action: "resolved"; readonly onExpiry: GateOnExpiry; readonly state: RunState; readonly presence: boolean }
  | { readonly action: "rescheduled"; readonly deadlineAt: Date }
  | { readonly action: "noop"; readonly reason: "not_found" | "already_resolved" | "not_parked" | "wait" | "no_auto_proceed" };

interface ExpiryRow {
  kind: string;
  on_expiry: GateOnExpiry;
  deadline_at: Date | null;
  presence_deadline_at: Date | null;
  resolved_at: Date | null;
  opened_at: Date;
  run_id: string;
  state: RunState;
  current_attempt: number;
  hold_ledger_id: string | null;
  billing_account_id: string;
}

/**
 * The `gate:<id>` expiry job handler. Re-reads the (possibly moved) deadline; reschedules if the deadline is
 * still in the future; otherwise runs the kind's `onExpiry` as a conditional resolve (Decision{by:'timeout'})
 * and transitions the run. A spend/refusal kind never auto-proceeds even if mis-scheduled (defense in depth).
 */
export async function handleGateExpiry(
  deps: OrchestratorDeps,
  args: { gateId: string; workspaceId: string },
): Promise<GateExpiryOutcome> {
  const now = deps.clock.now();
  const box: {
    job: { name: string; payload: Record<string, unknown> } | null;
    autoProceeded: boolean;
    terminalOutcome: "cancelled" | "completed_partial" | null;
    runId: string | null;
  } = {
    job: null,
    autoProceeded: false,
    terminalOutcome: null,
    runId: null,
  };

  const outcome = await deps.txRunner.run(args.workspaceId, async (tx): Promise<GateExpiryOutcome> => {
    const gr = (
      await tx.query(
        `select g.kind, g.on_expiry, g.deadline_at, g.presence_deadline_at, g.resolved_at, g.opened_at,
                g.run_id, r.state, r.current_attempt, r.hold_ledger_id, w.billing_account_id
           from gates g join runs r on r.id = g.run_id join workspaces w on w.id = r.workspace_id
          where g.id = $1 for update`,
        [args.gateId],
      )
    ).rows[0] as ExpiryRow | undefined;
    if (!gr) return { action: "noop", reason: "not_found" };
    if (gr.resolved_at != null) return { action: "noop", reason: "already_resolved" };
    if (gr.state !== "waiting_gate" && gr.state !== "awaiting_consent") return { action: "noop", reason: "not_parked" };

    // The presence timer (if set) is the effective deadline for a present user; else the long deadline.
    const usingPresence = gr.presence_deadline_at != null;
    const effective = gr.presence_deadline_at ?? gr.deadline_at;
    if (effective == null) return { action: "noop", reason: "wait" }; // a held / wait gate never expires

    // The deadline moved later (an activity extension): reschedule and do not resolve.
    if (effective.getTime() > now.getTime()) {
      await scheduleGateExpiry(deps, { gateId: args.gateId, workspaceId: args.workspaceId, deadlineAt: effective, now });
      // PRB.09 (D-P0.10-1): re-arm the T−1 h / T−10 m reminders against the NEW deadline.
      await scheduleGateReminders(deps, {
        gateId: args.gateId,
        workspaceId: args.workspaceId,
        onExpiry: gr.on_expiry,
        deadlineAt: effective,
        now,
      });
      return { action: "rescheduled", deadlineAt: effective };
    }

    const onExpiry = gr.on_expiry;
    if (onExpiry === "wait") return { action: "noop", reason: "wait" };
    // Spend/refusal kinds never auto-proceed under any timer (REQ-SPEC-1) — refuse a mis-scheduled proceed.
    if (GATE_DEFAULTS[gr.kind as GateKind].neverAutoProceed && isAutoProceed(onExpiry)) {
      return { action: "noop", reason: "no_auto_proceed" };
    }

    if (!(await conditionalResolve(tx, args.gateId, now))) return { action: "noop", reason: "already_resolved" };

    const action = EXPIRY_ACTION[onExpiry];
    await writeDecision(tx, now, { gateId: args.gateId, by: "timeout", action, presence: usingPresence });
    await deps.eventWriter.append(tx, { runId: gr.run_id, type: "gate.expired", payload: { kind: gr.kind, action }, at: now });
    await emitGateResolved(tx, deps, gr.run_id, action, "timeout", now);

    if (isAutoProceed(onExpiry)) {
      const nextAttempt = gr.current_attempt + 1;
      await applyTransition(tx, deps, { runId: gr.run_id, from: "waiting_gate", to: "queued", reason: "expired", fields: { currentAttempt: nextAttempt } });
      box.job = { name: RUN_JOBS.resume, payload: { runId: gr.run_id, workspaceId: args.workspaceId, attempt: nextAttempt, fromStep: "next" } };
      box.autoProceeded = true; // PRB.09: the decision+cost email (§5.11 auto-proceed row)
      return { action: "resolved", onExpiry, state: "queued", presence: usingPresence };
    }

    // cancel / accept_partial: terminal; settle the hold + revoke the credential. P1.19 — the §5.11
    // in-app row rides the same post-commit seam (a system cancel lands `run_cancelled_recovered`; a
    // kept partial lands the run_finished Inbox row, mail-suppressed).
    const to: RunState = onExpiry === "cancel" ? "cancelled" : "completed_partial";
    await applyTransition(tx, deps, { runId: gr.run_id, from: gr.state, to, reason: "expired" });
    await settleTerminal(deps, tx, { runId: gr.run_id, workspaceId: args.workspaceId, billingAccountId: gr.billing_account_id, holdLedgerId: gr.hold_ledger_id, now });
    box.terminalOutcome = onExpiry === "cancel" ? "cancelled" : "completed_partial";
    box.runId = gr.run_id;
    return { action: "resolved", onExpiry, state: to, presence: usingPresence };
  });

  if (outcome.action === "resolved" && box.job) {
    await deps.queue.send(box.job.name, box.job.payload, { singletonKey: String(box.job.payload.runId) });
  }
  if (box.autoProceeded) {
    // the "Auto-proceeded decision: email decision and cost" row — the handler re-reads gate+decision+spend.
    await deps.queue.send(
      NOTIFY_QUEUE,
      { type: "auto_proceeded", gateId: args.gateId, workspaceId: args.workspaceId },
      { singletonKey: `notify:auto:${args.gateId}` },
    );
  }
  if (box.terminalOutcome && box.runId) {
    // REQ-ENG-2 — republish the committed high-water so the terminal batch wakes the SSE tail.
    await publishCommittedEventHighWater(deps, args.workspaceId, box.runId);
    await scheduleRunTerminalNotification(deps, {
      runId: box.runId,
      workspaceId: args.workspaceId,
      outcome: box.terminalOutcome,
    });
  }
  return outcome;
}

async function settleTerminal(
  deps: OrchestratorDeps,
  tx: SqlClient,
  args: { runId: string; workspaceId: string; billingAccountId: string; holdLedgerId: string | null; now: Date },
): Promise<void> {
  if (args.holdLedgerId) {
    await deps.ledger.release(tx, {
      billingAccountId: args.billingAccountId,
      workspaceId: args.workspaceId,
      runId: args.runId,
      holdLedgerId: args.holdLedgerId,
      idempotencyKey: `release:${args.runId}`,
    });
  }
  await reconcileRunSpend(tx, args.runId); // PRB.16b — the terminal settle owns the spend figure
  await revokeRunCredentials(tx, args.runId, args.now);
}

// ---------------------------------------------------------------------------- deadline STATE (item 1/2)

/**
 * "Wait for me" (§6.4 item 1; `hold`): remove the deadline for this card, without resolving it. Sets `held`,
 * clears both the long and presence deadlines; the scheduled expiry job then fires as a no-op (wait). Only
 * meaningful while the gate is open + unresolved.
 */
export async function holdGate(
  deps: Pick<OrchestratorDeps, "txRunner">,
  args: { gateId: string; workspaceId: string },
): Promise<{ held: boolean }> {
  return deps.txRunner.run(args.workspaceId, async (tx) => {
    const res = await tx.query(
      "update gates set held = true, deadline_at = null, presence_deadline_at = null where id = $1 and resolved_at is null returning id",
      [args.gateId],
    );
    return { held: (res.rows as unknown[]).length === 1 };
  });
}

export type GateActivity = "reading" | "present" | "blur";

export interface RecordGateActivityResult {
  readonly deadlineAt: Date | null;
  readonly presenceDeadlineAt: Date | null;
}

/**
 * Record activity on an open gate (§6.4 items 1–2; REQ-RUN-6 amended; REQ-SPEC-18) as server-side deadline
 * state:
 *   • `reading` — the user has the artifact open (activity within 60 s): pause the countdown by extending the
 *     deadline +10 min, capped at +24 h from open; reschedules the expiry.
 *   • `present` — a focused tab, not reading the artifact: a gate that WOULD auto-proceed gets a 10-min presence
 *     deadline (never beyond the long deadline); wait gates never get one. Reschedules the expiry to fire early.
 *   • `blur` — closing/blurring reverts the card to its long deadline (clears the presence deadline).
 * A no-op on a resolved or held gate. Auto-proceed gates only for the presence timer.
 */
export async function recordGateActivity(
  deps: Pick<OrchestratorDeps, "txRunner" | "clock" | "queue">,
  args: { gateId: string; workspaceId: string; activity: GateActivity },
): Promise<RecordGateActivityResult | { readonly deadlineAt: null; readonly presenceDeadlineAt: null; readonly noop: true }> {
  const now = deps.clock.now();
  let reschedule: Date | null = null;
  let gateOnExpiry: GateOnExpiry | null = null;

  const out = await deps.txRunner.run(args.workspaceId, async (tx) => {
    const gr = (
      await tx.query(
        "select kind, on_expiry, deadline_at, presence_deadline_at, opened_at, resolved_at, held from gates where id = $1 for update",
        [args.gateId],
      )
    ).rows[0] as
      | { kind: GateKind; on_expiry: GateOnExpiry; deadline_at: Date | null; presence_deadline_at: Date | null; opened_at: Date; resolved_at: Date | null; held: boolean }
      | undefined;
    if (!gr || gr.resolved_at != null || gr.held) return { deadlineAt: null, presenceDeadlineAt: null, noop: true as const };
    gateOnExpiry = gr.on_expiry;

    const autoProceed = isAutoProceed(gr.on_expiry);

    if (args.activity === "blur") {
      await tx.query("update gates set presence_deadline_at = null where id = $1", [args.gateId]);
      return { deadlineAt: gr.deadline_at, presenceDeadlineAt: null };
    }

    if (args.activity === "present") {
      // only an auto-proceeding gate with a long deadline gets a presence timer; never a wait gate.
      if (!autoProceed || gr.deadline_at == null) return { deadlineAt: gr.deadline_at, presenceDeadlineAt: gr.presence_deadline_at };
      const presence = new Date(Math.min(now.getTime() + PRESENCE_TIMER_MS, gr.deadline_at.getTime()));
      await tx.query("update gates set presence_deadline_at = $2 where id = $1", [args.gateId, presence]);
      reschedule = presence;
      return { deadlineAt: gr.deadline_at, presenceDeadlineAt: presence };
    }

    // reading: pause the countdown by pushing an AUTO-PROCEED deadline FORWARD — never shortening it (a `max`
    // with the current deadline). The activity-driven target is `now+10 min`, itself bounded to `open+24 h` so a
    // stuck tab cannot hold the writer lock forever (review 13 F9). Non-auto-proceed gates (wait / spend /
    // refusal) have no auto-proceed countdown to pause and no short window a slow reader could trip — a no-op on
    // their (long or absent) deadline, so reading a `confirm_cost`/`refusal`/`resume_partial` card can NEVER
    // shorten its multi-day cancel/accept window.
    if (!autoProceed || gr.deadline_at == null) return { deadlineAt: gr.deadline_at, presenceDeadlineAt: gr.presence_deadline_at };
    const target = Math.min(now.getTime() + ACTIVITY_EXTENSION_MS, gr.opened_at.getTime() + ACTIVITY_EXTENSION_CAP_MS);
    const extended = new Date(Math.max(gr.deadline_at.getTime(), target)); // never below the current deadline
    // reading also clears any presence timer (the user IS reading the artifact) and pauses the countdown.
    await tx.query("update gates set deadline_at = $2, presence_deadline_at = null, paused_while_reading = true where id = $1", [args.gateId, extended]);
    reschedule = extended;
    return { deadlineAt: extended, presenceDeadlineAt: null };
  });

  if (reschedule) {
    await scheduleGateExpiry(deps, { gateId: args.gateId, workspaceId: args.workspaceId, deadlineAt: reschedule, now });
    // PRB.09 (D-P0.10-1): an activity/presence move re-arms the reminders too (singleton keys carry the
    // new deadline instant; a stale fire re-reads and re-arms or no-ops).
    if (gateOnExpiry) {
      await scheduleGateReminders(deps, {
        gateId: args.gateId,
        workspaceId: args.workspaceId,
        onExpiry: gateOnExpiry,
        deadlineAt: reschedule,
        now,
      });
    }
  }
  return out;
}
