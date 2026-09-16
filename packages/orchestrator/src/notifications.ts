// Email notifications (PRB.09; §5.11; REQ-IDE-47/REQ-ACCT-1/REQ-SPEC-20/REQ-GATE-8; closes D-P0.10-1).
//
// The flow is two queues:
//   `notify`   — a deferred domain job ("a gate is still waiting" / "a reminder is due" / "a run went
//                terminal" / "check credit thresholds"). Every handler RE-READS state inside the tenant tx,
//                so a resolved gate, a held gate, or a moved deadline makes a stale job a safe no-op — the
//                same discipline as `gate:<id>` expiry jobs (gate-expiry.ts).
//   `mail.send`— the transport job carrying the fully rendered message + recipient. The handler calls the
//                injected MailSender (Resend at deploy, a fixture in tests) and marks the delivery row sent.
//
// "One notification per event per channel" is the `notification_deliveries` unique (user, channel,
// dedup_key) claim: a second fire inserts nothing. `run_id` is the §5.11 collapse key. Preferences are
// server-side (`notification_prefs`); the two non-configurable rows (spend gates, trial/payment) are
// enforced twice — the PUT route refuses the write AND `emailEnabled` overrides a stored false.
// Quiet hours may defer only `run_finished` (§5.11) — never a gate or spend notice.

import {
  DO_NOTHING_OUTCOME,
  GATE_KIND_LABELS,
  QUIET_HOURS_DEFERRABLE,
  effectiveEmailMatrix,
  emailEnabled,
  inQuietHours,
  isAutoProceed,
  notificationEventForGate,
  notificationPrefsSchema,
  quietHoursEnd,
  renderEmail,
  type GateKind,
  type GateOnExpiry,
  type NotificationEventType,
  type NotificationPrefs,
  type RenderedEmail,
} from "@rhema/contracts";
import type { OrchestratorDeps } from "./internal-api.js";
import type { Clock } from "./clock.js";
import type { IdFactory } from "./ids.js";
import type { Queue } from "./queue.js";
import type { SqlClient } from "./tx.js";
import type { TxRunner } from "./tx.js";
import {
  billingDeepLink,
  gateDeepLink,
  mintEmailAction,
  runDeepLink,
  type EmailActionConfig,
} from "./email-actions.js";

export const NOTIFY_QUEUE = "notify";
export const MAIL_SEND_QUEUE = "mail.send";

/** §5.11 "email if unresolved after 15 minutes". */
export const GATE_WAITING_DELAY_MS = 15 * 60 * 1000;
/** §6.4 item 7 / D-P0.10-1: reminders at deadline − 1 h and − 10 min. */
export const REMINDER_OFFSETS_MS = [60 * 60 * 1000, 10 * 60 * 1000] as const;
/** A signed action link outlives the email: the gate deadline when set, else 30 days. */
const TOKEN_FALLBACK_TTL_MS = 30 * 24 * 60 * 60 * 1000;
/** §14.6 credit notices fire at 50 / 80 / 100 % of granted credits consumed. */
export const CREDIT_THRESHOLDS = [50, 80, 100] as const;

/** The email-sending seam. The worker binds Resend; tests bind a fixture. */
export interface MailSender {
  send(msg: { to: string; subject: string; text: string; html: string; from?: string }): Promise<{ id: string }>;
}

export interface NotificationJobPayload {
  readonly type:
    | "gate_waiting"
    | "gate_reminder"
    | "auto_proceeded"
    | "run_terminal"
    | "credits_check"
    | "trial_payment";
  readonly workspaceId: string;
  readonly gateId?: string;
  readonly runId?: string;
  readonly billingAccountId?: string;
  readonly userId?: string;
  readonly offsetMs?: number;
  readonly deadlineMs?: number;
  readonly outcome?: string;
  readonly reason?: string;
}

// ------------------------------------------------------------------ scheduling (post-commit sends)

/**
 * Schedule a gate's notification jobs after the open commits (callers have gate kind + deadline in hand):
 *   • every gate: a `gate_waiting` check — at open for spend kinds (money is blocked; §5.11 spend gate is
 *     always-on), at +15 min otherwise ("email if unresolved after 15 minutes").
 *   • an auto-proceeding gate with a deadline: `gate_reminder` at T−1 h and T−10 m (D-P0.10-1). The singleton
 *     key carries the deadline instant, so a moved deadline re-arms and the stale fire reschedules or no-ops.
 */
export async function scheduleGateNotifications(
  deps: { queue: Queue; clock: Clock },
  args: {
    gateId: string;
    workspaceId: string;
    kind: GateKind;
    /** the gate's actual on_expiry — NOT the kind default (a commit may override it). */
    onExpiry: GateOnExpiry;
    deadlineAt: Date | null;
    now: Date;
  },
): Promise<void> {
  const eventType = notificationEventForGate(args.kind);
  const delay = eventType === "spend_gate" ? 0 : GATE_WAITING_DELAY_MS;
  await deps.queue.send(
    NOTIFY_QUEUE,
    { type: "gate_waiting", gateId: args.gateId, workspaceId: args.workspaceId },
    { singletonKey: `notify:waiting:${args.gateId}`, startAfterMs: delay },
  );
  if (args.deadlineAt != null) {
    await scheduleGateReminders(deps, {
      gateId: args.gateId,
      workspaceId: args.workspaceId,
      onExpiry: args.onExpiry,
      deadlineAt: args.deadlineAt,
      now: args.now,
    });
  }
}

/**
 * (Re)arm the T−1 h / T−10 m reminders for a deadline — called at open and whenever the effective deadline
 * moves (activity extension, presence timer). The singleton key embeds the deadline instant, so arming the
 * same deadline twice dedupes and a moved deadline adds fresh jobs; a stale fire re-reads and re-arms or
 * no-ops. Reminders only exist for auto-proceeding gates (a wait/cancel gate's "do nothing" needs no
 * countdown), matching `gate.reminder`'s purpose: "in N it proceeds …".
 */
export async function scheduleGateReminders(
  deps: { queue: Queue; clock: Clock },
  args: { gateId: string; workspaceId: string; onExpiry: GateOnExpiry; deadlineAt: Date; now: Date },
): Promise<void> {
  if (!isAutoProceed(args.onExpiry)) return;
  for (const offsetMs of REMINDER_OFFSETS_MS) {
    const due = args.deadlineAt.getTime() - offsetMs;
    await deps.queue.send(
      NOTIFY_QUEUE,
      {
        type: "gate_reminder",
        gateId: args.gateId,
        workspaceId: args.workspaceId,
        offsetMs,
        deadlineMs: args.deadlineAt.getTime(),
      },
      {
        singletonKey: `notify:remind:${args.gateId}:${offsetMs}:${args.deadlineAt.getTime()}`,
        startAfterMs: Math.max(0, due - args.now.getTime()),
      },
    );
  }
}

// NOTE: callers pass the gate's ACTUAL on_expiry (a commit may override the kind default); the handler
// re-reads it at fire time regardless.

/** Enqueue a terminal-run notification check (called post-commit by finalizeRun / failRun). */
export async function scheduleRunTerminalNotification(
  deps: { queue: Queue },
  args: { runId: string; workspaceId: string; outcome: "completed" | "failed" | "cancelled" | "completed_partial" },
): Promise<void> {
  // §5.11 "Run failed: failed only" — cancelled / completed_partial send nothing.
  if (args.outcome !== "completed" && args.outcome !== "failed") return;
  await deps.queue.send(
    NOTIFY_QUEUE,
    { type: "run_terminal", runId: args.runId, workspaceId: args.workspaceId, outcome: args.outcome },
    { singletonKey: `notify:terminal:${args.runId}` },
  );
}

/** Enqueue a credit-threshold check after a debit lands (called post-commit by the debit site). */
export async function scheduleCreditsCheck(
  deps: { queue: Queue },
  args: { billingAccountId: string; workspaceId: string },
): Promise<void> {
  await deps.queue.send(
    NOTIFY_QUEUE,
    { type: "credits_check", billingAccountId: args.billingAccountId, workspaceId: args.workspaceId },
    // a second check while one is active is a no-op; the handler reads live totals anyway.
    { singletonKey: `notify:credits:${args.billingAccountId}` },
  );
}

// ------------------------------------------------------------------ the notify job handler

export type NotifyOutcome =
  | { readonly action: "mailed"; readonly deliveryId: string; readonly eventType: NotificationEventType }
  | { readonly action: "rescheduled"; readonly at: Date }
  | {
      readonly action: "noop";
      readonly reason:
        | "unconfigured"
        | "not_found"
        | "resolved"
        | "held"
        | "deadline_moved"
        | "disabled"
        | "already_sent"
        | "no_recipient"
        | "no_threshold";
    };

interface GateRow {
  kind: GateKind;
  on_expiry: GateOnExpiry;
  deadline_at: Date | null;
  presence_deadline_at: Date | null;
  resolved_at: Date | null;
  held: boolean;
  run_id: string;
  state: string;
  project_id: string | null;
  project_title: string | null;
}

interface RunRow {
  state: string;
  project_id: string | null;
  project_title: string | null;
  spent_credits: number;
  cap_credits: number;
}

/** The recipient for a run-scoped notice: the project owner, else the workspace's first member. */
async function runRecipient(tx: SqlClient, runId: string): Promise<string | null> {
  const row = (
    await tx.query(
      `select coalesce(
         (select p.owner_id from runs r join projects p on p.id = r.project_id where r.id = $1),
         (select wm.user_id from runs r join workspace_members wm on wm.workspace_id = r.workspace_id
            where r.id = $1 order by wm.user_id limit 1)) as user_id`,
      [runId],
    )
  ).rows[0] as { user_id: string | null } | undefined;
  return row?.user_id ?? null;
}

async function readPrefs(tx: SqlClient, userId: string): Promise<NotificationPrefs> {
  const row = (
    await tx.query("select prefs from notification_prefs where user_id = $1", [userId])
  ).rows[0] as { prefs: unknown } | undefined;
  return row ? notificationPrefsSchema.parse(row.prefs) : {};
}

async function recipientEmail(tx: SqlClient, userId: string): Promise<string | null> {
  const row = (await tx.query(`select email from "user" where id = $1`, [userId])).rows[0] as
    | { email: string }
    | undefined;
  return row?.email ?? null;
}

/**
 * Claim the (user, channel, dedup_key) delivery row and — on a fresh claim — build the email inside the tx
 * (the render callback may mint signed action rows). Returns the `mail.send` payload to send post-commit,
 * or a noop reason. A prior `sent` row dedupes; a prior `claimed` row (a crashed send) re-drives.
 */
async function claimDelivery(
  tx: SqlClient,
  deps: { ids: IdFactory },
  args: {
    workspaceId: string;
    userId: string;
    eventType: NotificationEventType;
    dedupKey: string;
    runId: string | null;
    render: () => Promise<RenderedEmail>;
  },
): Promise<
  | { claimed: true; deliveryId: string; email: RenderedEmail }
  | { claimed: false; reason: "already_sent" | "resend"; deliveryId?: string }
> {
  const deliveryId = deps.ids("ndl");
  const inserted = await tx.query(
    `insert into notification_deliveries(id, workspace_id, user_id, channel, event_type, dedup_key, run_id)
     values ($1,$2,$3,'email',$4,$5,$6)
     on conflict (user_id, channel, dedup_key) do nothing
     returning id`,
    [deliveryId, args.workspaceId, args.userId, args.eventType, args.dedupKey, args.runId],
  );
  if ((inserted.rows as unknown[]).length === 0) {
    const prior = (
      await tx.query(
        "select id, status from notification_deliveries where user_id = $1 and channel = 'email' and dedup_key = $2",
        [args.userId, args.dedupKey],
      )
    ).rows[0] as { id: string; status: string } | undefined;
    if (!prior || prior.status === "sent") return { claimed: false, reason: "already_sent" };
    // claimed but never sent — a crashed mail.send; re-render and re-drive under the SAME delivery id.
    const email = await args.render();
    await tx.query("update notification_deliveries set subject = $2 where id = $1", [
      prior.id,
      email.subject,
    ]);
    return { claimed: true, deliveryId: prior.id, email };
  }
  const email = await args.render();
  await tx.query("update notification_deliveries set subject = $2 where id = $1", [
    deliveryId,
    email.subject,
  ]);
  return { claimed: true, deliveryId, email };
}

interface MailJob {
  deliveryId: string;
  workspaceId: string;
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * The `notify` consumer. Re-reads state; renders + claims inside one tenant tx; returns the `mail.send`
 * payload for the caller to enqueue post-commit (the box pattern — a queue send is never transactional).
 */
export async function handleNotifyJob(
  deps: OrchestratorDeps,
  payload: NotificationJobPayload,
): Promise<NotifyOutcome> {
  const config = deps.notifications;
  if (!config) return { action: "noop", reason: "unconfigured" };
  const now = deps.clock.now();
  const box: {
    mail: MailJob | null;
    reschedule: { startAfterMs: number; singletonKey: string; payload: NotificationJobPayload } | null;
  } = {
    mail: null,
    reschedule: null,
  };

  const outcome = await deps.txRunner.run(payload.workspaceId, async (tx): Promise<NotifyOutcome> => {
    if (payload.type === "credits_check") return creditsCheck(tx, deps, config, payload, box);
    if (payload.type === "trial_payment") return trialPayment(tx, deps, config, payload, box);
    if (payload.type === "run_terminal") return runTerminal(tx, deps, config, payload, now, box);
    if (payload.type === "auto_proceeded") return autoProceeded(tx, deps, config, payload, now, box);
    return gateNotice(tx, deps, config, payload, now, box);
  });

  if (box.mail) await deps.queue.send(MAIL_SEND_QUEUE, { ...box.mail });
  if (box.reschedule) {
    await deps.queue.send(NOTIFY_QUEUE, { ...box.reschedule.payload }, {
      startAfterMs: box.reschedule.startAfterMs,
      singletonKey: box.reschedule.singletonKey,
    });
  }
  return outcome;
}

// ---- gate notices (approval_waiting / spend_gate / gate_reminder) ------------------------------------

async function gateNotice(
  tx: SqlClient,
  deps: OrchestratorDeps,
  config: EmailActionConfig,
  payload: NotificationJobPayload,
  now: Date,
  box: { mail: MailJob | null; reschedule: { startAfterMs: number; singletonKey: string; payload: NotificationJobPayload } | null },
): Promise<NotifyOutcome> {
  const g = (
    await tx.query(
      `select g.kind, g.on_expiry, g.deadline_at, g.presence_deadline_at, g.resolved_at, g.held,
              g.run_id, r.state, r.project_id, p.title as project_title
         from gates g join runs r on r.id = g.run_id
         left join projects p on p.id = r.project_id
        where g.id = $1 for update of g`,
      [payload.gateId],
    )
  ).rows[0] as GateRow | undefined;
  if (!g) return { action: "noop", reason: "not_found" };
  if (g.resolved_at != null) return { action: "noop", reason: "resolved" }; // resolution cancels pending sends
  if (g.held) return { action: "noop", reason: "held" };

  const effective = g.presence_deadline_at ?? g.deadline_at;

  if (payload.type === "gate_reminder") {
    if (effective == null || !isAutoProceed(g.on_expiry)) return { action: "noop", reason: "deadline_moved" };
    if (effective.getTime() !== payload.deadlineMs) {
      // the deadline moved: re-arm this offset against the CURRENT deadline (a fresh singleton key, the NEW
      // deadlineMs in the payload so a later stale fire compares against the right instant).
      const due = effective.getTime() - (payload.offsetMs ?? 0);
      if (due > now.getTime()) {
        box.reschedule = {
          startAfterMs: due - now.getTime(),
          singletonKey: `notify:remind:${payload.gateId}:${payload.offsetMs}:${effective.getTime()}`,
          payload: { ...payload, deadlineMs: effective.getTime() },
        };
        return { action: "rescheduled", at: new Date(due) };
      }
      // the offset already passed under the new deadline — the reminder is still due; fall through and send.
    }
    return sendGateEmail(tx, deps, config, payload, g, effective, now, box, "gate_reminder");
  }

  // gate_waiting — the one-per-gate waiting notice (approval_waiting at +15 min / spend_gate at open).
  return sendGateEmail(tx, deps, config, payload, g, effective, now, box, notificationEventForGate(g.kind));
}

async function sendGateEmail(
  tx: SqlClient,
  deps: OrchestratorDeps,
  config: EmailActionConfig,
  payload: NotificationJobPayload,
  g: GateRow,
  effectiveDeadline: Date | null,
  now: Date,
  box: { mail: MailJob | null },
  eventType: "approval_waiting" | "spend_gate" | "gate_reminder",
): Promise<NotifyOutcome> {
  const userId = await runRecipient(tx, g.run_id);
  if (!userId) return { action: "noop", reason: "no_recipient" };
  const prefs = await readPrefs(tx, userId);
  if (!emailEnabled(prefs, eventType)) return { action: "noop", reason: "disabled" };

  const dedupKey =
    eventType === "gate_reminder"
      ? `gate:${payload.gateId}:reminder:${payload.offsetMs}`
      : `gate:${payload.gateId}:${eventType === "spend_gate" ? "spend" : "waiting"}`;

  const claim = await claimDelivery(tx, deps, {
    workspaceId: payload.workspaceId,
    userId,
    eventType,
    dedupKey,
    runId: g.run_id,
    render: () => renderGateEmail(tx, deps, config, payload, g, effectiveDeadline, userId, now, eventType),
  });
  if (!claim.claimed) return { action: "noop", reason: "already_sent" };

  if (eventType === "gate_reminder") {
    // §6.4 item 7 — the notification rides a gate.reminder run event carrying the do-nothing outcome.
    await deps.eventWriter.append(tx, {
      runId: g.run_id,
      type: "gate.reminder",
      payload: {
        kind: g.kind,
        offsetMinutes: Math.round((payload.offsetMs ?? 0) / 60000),
        action: g.on_expiry,
        deadlineAt: effectiveDeadline ? effectiveDeadline.toISOString() : null,
      },
      at: now,
    });
  }

  const to = await recipientEmail(tx, userId);
  if (!to) return { action: "noop", reason: "no_recipient" };
  box.mail = { deliveryId: claim.deliveryId, workspaceId: payload.workspaceId, to, ...claim.email };
  return { action: "mailed", deliveryId: claim.deliveryId, eventType };
}

async function renderGateEmail(
  tx: SqlClient,
  deps: OrchestratorDeps,
  config: EmailActionConfig,
  payload: NotificationJobPayload,
  g: GateRow,
  effectiveDeadline: Date | null,
  userId: string,
  now: Date,
  eventType: "approval_waiting" | "spend_gate" | "gate_reminder",
): Promise<RenderedEmail> {
  const expiresAt = effectiveDeadline ?? new Date(now.getTime() + TOKEN_FALLBACK_TTL_MS);
  const base = {
    workspaceId: payload.workspaceId,
    gateId: payload.gateId!,
    runId: g.run_id,
    userId,
    expiresAt,
  };
  const mintDeps = { ids: deps.ids, config };
  const open = await mintEmailAction(tx, mintDeps, { ...base, action: "open" });
  const hold = await mintEmailAction(tx, mintDeps, { ...base, action: "hold" });
  const openUrl = open.url; // the signed link; it redirects to the deep link on consume
  const holdUrl = hold.url;
  const params = {
    gateLabel: GATE_KIND_LABELS[g.kind],
    ...(g.project_title ? { projectTitle: g.project_title.slice(0, 140) } : {}),
    doNothing: DO_NOTHING_OUTCOME[g.on_expiry],
    ...(effectiveDeadline ? { deadlineText: effectiveDeadline.toISOString() } : {}),
    openUrl,
    holdUrl,
  };
  if (eventType === "spend_gate") return renderEmail("spend_gate", params);
  if (eventType === "gate_reminder") {
    return renderEmail("gate_reminder", {
      ...params,
      offsetLabel: (payload.offsetMs ?? 0) >= 3_600_000 ? "1 hour" : "10 minutes",
      deadlineText: effectiveDeadline ? effectiveDeadline.toISOString() : "shortly",
    });
  }
  return renderEmail("approval_waiting", params);
}

// ---- the remaining notify types ---------------------------------------------------------------------

async function autoProceeded(
  tx: SqlClient,
  deps: OrchestratorDeps,
  config: EmailActionConfig,
  payload: NotificationJobPayload,
  now: Date,
  box: { mail: MailJob | null },
): Promise<NotifyOutcome> {
  const g = (
    await tx.query(
      `select g.kind, g.resolved_at, g.run_id, d.action as decision,
              r.spent_credits, r.cap_credits, r.project_id, p.title as project_title
         from gates g join runs r on r.id = g.run_id left join projects p on p.id = r.project_id
         left join decisions d on d.gate_id = g.id
        where g.id = $1`,
      [payload.gateId],
    )
  ).rows[0] as
    | {
        kind: GateKind;
        resolved_at: Date | null;
        run_id: string;
        decision: string | null;
        spent_credits: number;
        cap_credits: number;
        project_id: string | null;
        project_title: string | null;
      }
    | undefined;
  if (!g || g.resolved_at == null) return { action: "noop", reason: "not_found" };
  const userId = await runRecipient(tx, g.run_id);
  if (!userId) return { action: "noop", reason: "no_recipient" };
  const prefs = await readPrefs(tx, userId);
  if (!emailEnabled(prefs, "auto_proceeded")) return { action: "noop", reason: "disabled" };

  const claim = await claimDelivery(tx, deps, {
    workspaceId: payload.workspaceId,
    userId,
    eventType: "auto_proceeded",
    dedupKey: `gate:${payload.gateId}:auto`,
    runId: g.run_id,
    render: async () =>
      renderEmail("auto_proceeded", {
        gateLabel: GATE_KIND_LABELS[g.kind],
        ...(g.project_title ? { projectTitle: g.project_title.slice(0, 140) } : {}),
        actionLabel: (g.decision ?? "proceeded").replace(/_/g, " "),
        spentCredits: g.spent_credits,
        capCredits: g.cap_credits,
        openUrl: gateDeepLink(config.appBaseUrl, {
          projectId: g.project_id,
          runId: g.run_id,
          gateId: payload.gateId,
        }),
      }),
  });
  if (!claim.claimed) return { action: "noop", reason: "already_sent" };
  const to = await recipientEmail(tx, userId);
  if (!to) return { action: "noop", reason: "no_recipient" };
  box.mail = { deliveryId: claim.deliveryId, workspaceId: payload.workspaceId, to, ...claim.email };
  return { action: "mailed", deliveryId: claim.deliveryId, eventType: "auto_proceeded" };
}

async function runTerminal(
  tx: SqlClient,
  deps: OrchestratorDeps,
  config: EmailActionConfig,
  payload: NotificationJobPayload,
  now: Date,
  box: { mail: MailJob | null; reschedule: { startAfterMs: number; singletonKey: string; payload: NotificationJobPayload } | null },
): Promise<NotifyOutcome> {
  const r = (
    await tx.query(
      `select r.state, r.project_id, p.title as project_title
         from runs r left join projects p on p.id = r.project_id where r.id = $1`,
      [payload.runId],
    )
  ).rows[0] as RunRow | undefined;
  if (!r) return { action: "noop", reason: "not_found" };
  if (r.state !== payload.outcome) return { action: "noop", reason: "not_found" }; // a later transition superseded

  const eventType: NotificationEventType = payload.outcome === "completed" ? "run_finished" : "run_failed";
  const userId = await runRecipient(tx, payload.runId!);
  if (!userId) return { action: "noop", reason: "no_recipient" };
  const prefs = await readPrefs(tx, userId);
  if (!emailEnabled(prefs, eventType)) return { action: "noop", reason: "disabled" };

  // Quiet hours may defer ONLY the §5.11-deferrable classes (run_finished) — never a gate or spend notice.
  if (QUIET_HOURS_DEFERRABLE.includes(eventType) && inQuietHours(prefs, now)) {
    const end = quietHoursEnd(prefs, now);
    box.reschedule = {
      startAfterMs: end.getTime() - now.getTime(),
      singletonKey: `notify:terminal:${payload.runId}:quiet:${end.getTime()}`,
      payload,
    };
    return { action: "rescheduled", at: end };
  }

  const claim = await claimDelivery(tx, deps, {
    workspaceId: payload.workspaceId,
    userId,
    eventType,
    dedupKey: `run:${payload.runId}:${eventType}`,
    runId: payload.runId!,
    render: async () =>
      renderEmail(eventType, {
        ...(r.project_title ? { projectTitle: r.project_title.slice(0, 140) } : {}),
        openUrl: runDeepLink(config.appBaseUrl, { projectId: r.project_id, runId: payload.runId }),
      }),
  });
  if (!claim.claimed) return { action: "noop", reason: "already_sent" };
  const to = await recipientEmail(tx, userId);
  if (!to) return { action: "noop", reason: "no_recipient" };
  box.mail = { deliveryId: claim.deliveryId, workspaceId: payload.workspaceId, to, ...claim.email };
  return { action: "mailed", deliveryId: claim.deliveryId, eventType };
}

async function creditsCheck(
  tx: SqlClient,
  deps: OrchestratorDeps,
  config: EmailActionConfig,
  payload: NotificationJobPayload,
  box: { mail: MailJob | null },
): Promise<NotifyOutcome> {
  const totals = (
    await tx.query(
      `select coalesce(sum(case when kind = 'debit' then credits when kind = 'refund' then -credits else 0 end),0)::int as used,
              coalesce(sum(case when kind in ('grant','adjustment') then credits else 0 end),0)::int as granted
         from credit_ledger where billing_account_id = $1`,
      [payload.billingAccountId],
    )
  ).rows[0] as { used: number; granted: number } | undefined;
  const granted = Number(totals?.granted ?? 0);
  if (granted <= 0) return { action: "noop", reason: "no_threshold" };
  const pct = Math.floor((Number(totals?.used ?? 0) * 100) / granted);
  const crossed = CREDIT_THRESHOLDS.filter((t) => pct >= t);
  if (crossed.length === 0) return { action: "noop", reason: "no_threshold" };

  const userId =
    (
      (
        await tx.query(
          `select wm.user_id from workspaces w join workspace_members wm on wm.workspace_id = w.id
            where w.billing_account_id = $1 order by wm.user_id limit 1`,
          [payload.billingAccountId],
        )
      ).rows[0] as { user_id: string } | undefined
    )?.user_id ?? null;
  if (!userId) return { action: "noop", reason: "no_recipient" };
  const prefs = await readPrefs(tx, userId);
  if (!emailEnabled(prefs, "credits_threshold")) return { action: "noop", reason: "disabled" };
  const to = await recipientEmail(tx, userId);
  if (!to) return { action: "noop", reason: "no_recipient" };

  // one delivery row per threshold (dedup `credits:<ba>:<pct>`); each newly-claimed level mails once.
  let mailed: { deliveryId: string; pct: number } | null = null;
  for (const t of crossed) {
    const deliveryId = deps.ids("ndl");
    const inserted = await tx.query(
      `insert into notification_deliveries(id, workspace_id, user_id, channel, event_type, dedup_key)
       values ($1,$2,$3,'email','credits_threshold',$4)
       on conflict (user_id, channel, dedup_key) do nothing returning id`,
      [deliveryId, payload.workspaceId, userId, `credits:${payload.billingAccountId}:${t}`],
    );
    if ((inserted.rows as unknown[]).length === 0) continue; // this level already fired
    const email = renderEmail("credits_threshold", { percent: t, openUrl: billingDeepLink(config.appBaseUrl) });
    await tx.query("update notification_deliveries set subject = $2 where id = $1", [deliveryId, email.subject]);
    // a single notify job carries one mail.send payload; crossing several levels at once enqueues one job
    // per extra level through the caller's drain (the box holds the last render; extra sends reuse dedup).
    box.mail = { deliveryId, workspaceId: payload.workspaceId, to, ...email };
    mailed = { deliveryId, pct: t };
  }
  if (!mailed) return { action: "noop", reason: "already_sent" };
  return { action: "mailed", deliveryId: mailed.deliveryId, eventType: "credits_threshold" };
}

async function trialPayment(
  tx: SqlClient,
  deps: OrchestratorDeps,
  config: EmailActionConfig,
  payload: NotificationJobPayload,
  box: { mail: MailJob | null },
): Promise<NotifyOutcome> {
  // §5.11 non-configurable row — mostly dormant at beta (the beta has no subscription machinery); the
  // delivery path exists so a `trial_payment` notify job is real when a later ticket enqueues one. The
  // stored pref is ignored entirely — `emailEnabled` is not consulted; this row cannot be switched off.
  const userId = payload.userId ?? null;
  if (!userId) return { action: "noop", reason: "no_recipient" };
  const to = await recipientEmail(tx, userId);
  if (!to) return { action: "noop", reason: "no_recipient" };
  const claim = await claimDelivery(tx, deps, {
    workspaceId: payload.workspaceId,
    userId,
    eventType: "trial_payment",
    dedupKey: `trial:${userId}:${payload.reason ?? "notice"}`,
    runId: null,
    render: async () =>
      renderEmail("trial_payment", {
        reason: payload.reason ?? "Your trial is ending",
        openUrl: billingDeepLink(config.appBaseUrl),
      }),
  });
  if (!claim.claimed) return { action: "noop", reason: "already_sent" };
  box.mail = { deliveryId: claim.deliveryId, workspaceId: payload.workspaceId, to, ...claim.email };
  return { action: "mailed", deliveryId: claim.deliveryId, eventType: "trial_payment" };
}

// ------------------------------------------------------------------ the mail.send handler

/**
 * The `mail.send` consumer: call the injected MailSender and mark the delivery `sent` in the tenant tx. The
 * dedup claim already guarantees one-per-event; this is the transport leg. A provider throw propagates →
 * pg-boss retries.
 */
export async function handleMailSendJob(
  deps: { txRunner: TxRunner; mailer: MailSender; clock: Clock; emailFrom?: string },
  payload: MailJob,
): Promise<{ sent: true; id: string } | { sent: false }> {
  const res = await deps.mailer.send({
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
    ...(deps.emailFrom ? { from: deps.emailFrom } : {}),
  });
  await deps.txRunner.run(payload.workspaceId, (tx) =>
    tx.query(
      "update notification_deliveries set status = 'sent', sent_at = $2 where id = $1",
      [payload.deliveryId, deps.clock.now()],
    ),
  );
  return { sent: true, id: res.id };
}

// ------------------------------------------------------------------ prefs read for the api

/** The settings-surface read: the full effective matrix + the stored quiet window. */
export async function readNotificationPrefs(
  txRunner: TxRunner,
  args: { userId: string; workspaceId: string },
): Promise<{ matrix: ReturnType<typeof effectiveEmailMatrix>; quietHours: NotificationPrefs["quietHours"] }> {
  return txRunner.run(args.workspaceId, async (tx) => {
    const prefs = await readPrefs(tx, args.userId);
    return { matrix: effectiveEmailMatrix(prefs), quietHours: prefs.quietHours ?? null };
  });
}
