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
  digestMode,
  effectiveEmailMatrix,
  emailEnabled,
  inAppEnabled,
  inQuietHours,
  inboxCollapseKey,
  isAutoProceed,
  notificationEventForGate,
  notificationPrefsSchema,
  quietHoursEnd,
  renderDigest,
  renderEmail,
  renderInboxCopy,
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
import { loadVoiceStatus } from "./voice-status.js";

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
    | "trial_payment"
    // P1.19 — the in-app channel + the deferred §5.11 email rows.
    | "run_progress"     // per-PROJECT Advanced opt-in (step.finished → the run's Inbox row updates)
    | "voice_digest"    // the weekly stale-voice sweep (in-app rows + the digest email)
    | "trial_ending"    // the daily day-12 sweep (trial_payment mail + in-app row)
    | "run_digest"      // the hourly run-finished digest for digest-pref users
    | "product_update"; // email only, off by default
  readonly workspaceId: string;
  readonly gateId?: string;
  readonly runId?: string;
  readonly billingAccountId?: string;
  readonly userId?: string;
  readonly offsetMs?: number;
  readonly deadlineMs?: number;
  readonly outcome?: string;
  readonly reason?: string;
  // run_progress fields (the committed phase the row narrates).
  readonly phase?: string;
  readonly ordinal?: number;
  readonly of?: number;
  // product_update fields.
  readonly subject?: string;
  readonly summary?: string;
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

/**
 * Enqueue a terminal-run notification check (called post-commit by finalizeRun / failRun / the
 * gate-expiry cancel + accept_partial arms). The handler owns the §5.11 channel split: completed/failed
 * mail; cancelled-by-the-system / partial / recovered land as in-app rows only.
 */
export async function scheduleRunTerminalNotification(
  deps: { queue: Queue },
  args: {
    runId: string;
    workspaceId: string;
    outcome: "completed" | "failed" | "cancelled" | "completed_partial" | "recovered";
  },
): Promise<void> {
  await deps.queue.send(
    NOTIFY_QUEUE,
    { type: "run_terminal", runId: args.runId, workspaceId: args.workspaceId, outcome: args.outcome },
    { singletonKey: `notify:terminal:${args.runId}:${args.outcome}` },
  );
}

/**
 * P1.19 — enqueue the Advanced `run_progress` check at a committed phase boundary (called post-commit by
 * commitStep). The handler short-circuits unless the project opted in (§5.11 "off — Advanced opt-in"),
 * so the send is unconditional and cheap.
 */
export async function scheduleRunProgressNotification(
  deps: { queue: Queue },
  args: { runId: string; workspaceId: string; phase: string; ordinal: number; of: number },
): Promise<void> {
  await deps.queue.send(
    NOTIFY_QUEUE,
    {
      type: "run_progress",
      runId: args.runId,
      workspaceId: args.workspaceId,
      phase: args.phase,
      ordinal: args.ordinal,
      of: args.of,
    },
    // one job per committed phase — a duplicate commit (attempt replay) dedupes on the singleton.
    { singletonKey: `notify:progress:${args.runId}:${args.ordinal}` },
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
  /** P1.19 — the event delivered through the in-app channel only (no mail arm, or mail suppressed). */
  | { readonly action: "inbox"; readonly eventType: NotificationEventType }
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
  project_slug: string | null;
}

interface RunRow {
  state: string;
  workflow: string;
  persona_id: string | null;
  project_id: string | null;
  project_title: string | null;
  project_slug: string | null;
  spent_credits: number;
  cap_credits: number;
}

// ---- §4.2 deep links (P1.19) — app-relative paths for the Inbox; absolute for email --------------
//
// The web routes key on the project's SLUG (`/p/:slug/…`); PRB.09's links carried the project id and
// 404'd — every link now derives the slug. A run's landing surface is workflow-shaped (REQ-IDE-48):
// the letter for reviews, "what changed" for revisions, the Page for drafts, the run report otherwise.

/** The workflow → landing-path map the Inbox + the returning-open behavior share. */
export function runLandingPath(args: {
  workflow: string;
  projectSlug: string | null;
  runId: string;
  /** a revise run's response correspondence id (the what-changed route needs it). */
  responseCorrId?: string | null;
  /** a persona-scoped run's voice slug. */
  personaSlug?: string | null;
}): string {
  const slug = args.projectSlug;
  switch (args.workflow) {
    case "review":
    case "fact_check":
      // the letter lives on the dossier (the walkthrough card IS this surface — REQ-IDE-48).
      return slug ? `/p/${slug}/review/${args.runId}` : "/app/inbox";
    case "revise":
      return slug
        ? args.responseCorrId
          ? `/p/${slug}/revisions/${args.responseCorrId}`
          : `/p/${slug}/r/${args.runId}`
        : "/app/inbox";
    case "draft":
    case "outline":
    case "line_edit":
    case "cut_to_length":
    case "titles":
    case "abstract":
      // "v1 on the Page" — the deliverable IS the working head (§4.2 /v/working).
      return slug ? `/p/${slug}/v/working` : "/app/inbox";
    case "figure":
      return slug ? `/p/${slug}/figures` : "/app/inbox";
    case "chat_turn":
      return slug ? `/p/${slug}` : "/app/inbox";
    case "profile_voice":
    case "refresh_voice":
    case "compose_voice":
    case "calibrate_voice":
    case "reseed_charter":
      return args.personaSlug ? `/v/${args.personaSlug}` : "/voices";
    default:
      // research bursts, run_rounds, interviews, steelman, reverse_outline, map_the_field → the run report.
      return slug ? `/p/${slug}/r/${args.runId}` : "/app/inbox";
  }
}

/** The gate-focused deep link (§4.2 `/p/:slug/r/:run/g/:gate` → the dossier's focused card). */
export function gateLandingPath(args: { projectSlug: string | null; runId: string; gateId?: string }): string {
  if (!args.projectSlug) return "/app/inbox";
  const base = `/p/${args.projectSlug}/review/${args.runId}`;
  return args.gateId ? `${base}?gate=${args.gateId}` : base;
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

// ------------------------------------------------------------------ the in-app channel (P1.19)
//
// One `notify` event writes BOTH channels: the mail leg claims a notification_deliveries row; the
// in-app leg upserts `inbox_items` on the §5.11 collapse key (a run's notifications update one row —
// "the collapse key is the run id"). Read state is server-side (`read_at`) so web and the 1.x app see
// the same rows (REQ-MOBILE-19). `visible_at` is the quiet-hours arm: a deferrable event (run_finished
// / chat_reply) written inside the window stays invisible until it ends — approvals and spend gates are
// NEVER deferred.

/**
 * Upsert the §5.11 Inbox row on (user_id, collapse_key): a repeat event re-writes title/body/href in
 * place and re-marks the row unread — collapse means UPDATE, not a second row.
 */
async function upsertInboxItem(
  tx: SqlClient,
  deps: { ids: IdFactory },
  args: {
    userId: string;
    projectId: string | null;
    runId: string | null;
    type: NotificationEventType;
    title: string;
    body?: string | null;
    href: string;
    collapseKey: string;
    visibleAt: Date;
    now: Date;
  },
): Promise<void> {
  const payload = {
    type: args.type,
    title: args.title,
    ...(args.body != null ? { body: args.body } : {}),
    href: args.href,
  };
  await tx.query(
    `insert into inbox_items(id, user_id, project_id, kind, payload, collapse_key, run_id, visible_at, read_at, created_at)
     values ($1,$2,$3,'event',$4::jsonb,$5,$6,$7,null,$8)
     on conflict (user_id, collapse_key) where collapse_key is not null
     do update set payload = excluded.payload, project_id = excluded.project_id, run_id = excluded.run_id,
                   visible_at = excluded.visible_at, read_at = null`,
    [
      deps.ids("ibx"),
      args.userId,
      args.projectId,
      JSON.stringify(payload),
      args.collapseKey,
      args.runId,
      args.visibleAt,
      args.now,
    ],
  );
}

/**
 * The in-app leg of one notify event (P1.19): the pref check + the collapse key + quiet-hours
 * visibility + the templated copy, then the upsert. Returns false when the user has the row off.
 */
async function deliverInApp(
  tx: SqlClient,
  deps: { ids: IdFactory },
  args: {
    workspaceId: string;
    userId: string;
    eventType: NotificationEventType;
    prefs: NotificationPrefs;
    projectId: string | null;
    runId: string | null;
    /** §4.2 app-relative deep link (the api's read endpoint serves it to web and the app alike). */
    href: string;
    /** renderInboxCopy's whitelisted params — ids, counts, bounded labels; never finding/draft text. */
    copy: unknown;
    /** collapse family ids (runId for run rows; personaId/billingAccountId for the others). */
    personaId?: string | null;
    billingAccountId?: string | null;
    tag?: string | null;
    now: Date;
  },
): Promise<boolean> {
  if (!inAppEnabled(args.prefs, args.eventType, args.projectId)) return false;
  const visibleAt =
    QUIET_HOURS_DEFERRABLE.includes(args.eventType) && inQuietHours(args.prefs, args.now)
      ? quietHoursEnd(args.prefs, args.now)
      : args.now;
  const copy = renderInboxCopy(args.eventType, args.copy);
  await upsertInboxItem(tx, deps, {
    userId: args.userId,
    projectId: args.projectId,
    runId: args.runId,
    type: args.eventType,
    title: copy.title,
    ...(copy.body != null ? { body: copy.body } : {}),
    href: args.href,
    collapseKey: inboxCollapseKey(args.eventType, {
      ...(args.runId != null ? { runId: args.runId } : {}),
      ...(args.personaId != null ? { personaId: args.personaId } : {}),
      ...(args.billingAccountId != null ? { billingAccountId: args.billingAccountId } : {}),
      ...(args.tag != null ? { tag: args.tag } : {}),
    }),
    visibleAt,
    now: args.now,
  });
  return true;
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
    if (payload.type === "credits_check") return creditsCheck(tx, deps, config, payload, now, box);
    if (payload.type === "trial_payment") return trialPayment(tx, deps, config, payload, now, box);
    if (payload.type === "run_terminal") return runTerminal(tx, deps, config, payload, now, box);
    if (payload.type === "auto_proceeded") return autoProceeded(tx, deps, config, payload, now, box);
    if (payload.type === "run_progress") return runProgress(tx, deps, payload, now);
    if (payload.type === "voice_digest") return voiceDigest(tx, deps, config, payload, now, box);
    if (payload.type === "trial_ending") return trialEnding(tx, deps, config, payload, now, box);
    if (payload.type === "run_digest") return runDigest(tx, deps, config, payload, now, box);
    if (payload.type === "product_update") return productUpdate(tx, deps, config, payload, now, box);
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
              g.run_id, r.state, r.project_id, p.title as project_title, p.slug as project_slug
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

  // P1.19 — the in-app leg rides the SAME event the mailer consumes (independent of the email toggle):
  // the run's Inbox row upserts on the `run:<id>` collapse key — a reminder rewrites the approval's row.
  const reminder = eventType === "gate_reminder";
  const inboxed = await deliverInApp(tx, deps, {
    workspaceId: payload.workspaceId,
    userId,
    eventType,
    prefs,
    projectId: g.project_id,
    runId: g.run_id,
    href: gateLandingPath({ projectSlug: g.project_slug, runId: g.run_id, gateId: payload.gateId }),
    copy: reminder
      ? {
          gateLabel: GATE_KIND_LABELS[g.kind],
          offsetLabel: (payload.offsetMs ?? 0) >= 3_600_000 ? "1 hour" : "10 minutes",
          doNothing: DO_NOTHING_OUTCOME[g.on_expiry],
          ...(g.project_title ? { projectTitle: g.project_title.slice(0, 140) } : {}),
        }
      : {
          gateLabel: GATE_KIND_LABELS[g.kind],
          ...(g.project_title ? { projectTitle: g.project_title.slice(0, 140) } : {}),
        },
    now,
  });

  if (!emailEnabled(prefs, eventType)) {
    return inboxed
      ? { action: "inbox", eventType }
      : { action: "noop", reason: "disabled" };
  }

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
              r.spent_credits, r.cap_credits, r.project_id, p.title as project_title, p.slug as project_slug
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
        project_slug: string | null;
      }
    | undefined;
  if (!g || g.resolved_at == null) return { action: "noop", reason: "not_found" };
  const userId = await runRecipient(tx, g.run_id);
  if (!userId) return { action: "noop", reason: "no_recipient" };
  const prefs = await readPrefs(tx, userId);
  const actionLabel = (g.decision ?? "proceeded").replace(/_/g, " ");

  // P1.19 — the decision lands in the Inbox whether or not the email arm is on.
  const inboxed = await deliverInApp(tx, deps, {
    workspaceId: payload.workspaceId,
    userId,
    eventType: "auto_proceeded",
    prefs,
    projectId: g.project_id,
    runId: g.run_id,
    href: gateLandingPath({ projectSlug: g.project_slug, runId: g.run_id, gateId: payload.gateId }),
    copy: {
      gateLabel: GATE_KIND_LABELS[g.kind],
      actionLabel,
      spentCredits: g.spent_credits,
      capCredits: g.cap_credits,
      ...(g.project_title ? { projectTitle: g.project_title.slice(0, 140) } : {}),
    },
    now,
  });
  if (!emailEnabled(prefs, "auto_proceeded")) {
    return inboxed ? { action: "inbox", eventType: "auto_proceeded" } : { action: "noop", reason: "disabled" };
  }

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
        actionLabel,
        spentCredits: g.spent_credits,
        capCredits: g.cap_credits,
        openUrl: gateDeepLink(config.appBaseUrl, {
          projectSlug: g.project_slug,
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

/**
 * §5.11's terminal split (P1.19): completed runs (and chat turns) mail + inbox; failed runs mail +
 * inbox; a system-caused cancel, a kept-partial completion, or a recovered hiccup land as in-app rows
 * ONLY (the matrix has no email cell for them). The Inbox row's href is the workflow's §4.2 surface;
 * for a finished run the row IS the unread "return to" marker the rail badge deliberately ignores.
 */
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
      `select r.state, r.workflow, r.persona_id, r.project_id,
              p.title as project_title, p.slug as project_slug,
              ps.slug as persona_slug,
              r.spent_credits, r.cap_credits
         from runs r
         left join projects p on p.id = r.project_id
         left join personas ps on ps.id = r.persona_id
        where r.id = $1`,
      [payload.runId],
    )
  ).rows[0] as (RunRow & { persona_slug: string | null }) | undefined;
  if (!r) return { action: "noop", reason: "not_found" };
  // a later transition supersedes a stale terminal job (e.g. a cancel raced a completion).
  if (r.state !== payload.outcome) {
    const recoveredOk = payload.outcome === "recovered" && (r.state === "queued" || r.state === "running" || r.state === "waiting_gate");
    if (!recoveredOk) return { action: "noop", reason: "not_found" };
  }

  // outcome → matrix row: a chat_turn completion is `chat_reply` (quiet-deferrable); a cancelled or
  // recovered run is the in-app-only `run_cancelled_recovered` row; completed/failed map directly. A
  // `completed_partial` IS a finished deliverable for the Inbox (run_finished row) but the §5.11 email
  // stays completed/failed-only — no mail arm for it.
  const outcome = payload.outcome ?? "";
  const eventType: NotificationEventType =
    outcome === "completed" && r.workflow === "chat_turn"
      ? "chat_reply"
      : outcome === "completed" || outcome === "completed_partial"
        ? "run_finished"
        : outcome === "failed"
          ? "run_failed"
          : "run_cancelled_recovered";
  const variant: "cancelled" | "recovered" | undefined =
    eventType === "run_cancelled_recovered" ? (outcome === "cancelled" ? "cancelled" : "recovered") : undefined;

  const userId = await runRecipient(tx, payload.runId!);
  if (!userId) return { action: "noop", reason: "no_recipient" };
  const prefs = await readPrefs(tx, userId);

  const landing = runLandingPath({
    workflow: r.workflow,
    projectSlug: r.project_slug,
    runId: payload.runId!,
    ...(r.persona_slug != null ? { personaSlug: r.persona_slug } : {}),
  });
  const projectTitle = r.project_title ? r.project_title.slice(0, 140) : undefined;
  const copy =
    eventType === "run_cancelled_recovered"
      ? { variant: variant!, ...(projectTitle ? { projectTitle } : {}) }
      : eventType === "run_finished"
        ? { ...(projectTitle ? { projectTitle } : {}), workflowLabel: r.workflow.replace(/_/g, " ") }
        : { ...(projectTitle ? { projectTitle } : {}) };
  const inAppOnly = eventType === "run_cancelled_recovered" || outcome === "completed_partial";

  // Quiet hours may defer ONLY the §5.11-deferrable classes (run_finished, chat_reply) — and here the
  // deferral applies to the MAIL leg. The Inbox row writes now with `visible_at` = quiet end (the row
  // exists server-side; the rail doesn't surface it until the window ends). Never for gates/spend.
  const quiet = QUIET_HOURS_DEFERRABLE.includes(eventType) && inQuietHours(prefs, now);
  const inboxed = await deliverInApp(tx, deps, {
    workspaceId: payload.workspaceId,
    userId,
    eventType,
    prefs,
    projectId: r.project_id,
    runId: payload.runId!,
    href: landing,
    copy,
    now,
  });

  if (inAppOnly) return inboxed ? { action: "inbox", eventType } : { action: "noop", reason: "disabled" };
  if (!emailEnabled(prefs, eventType)) {
    return inboxed ? { action: "inbox", eventType } : { action: "noop", reason: "disabled" };
  }
  if (quiet) {
    const end = quietHoursEnd(prefs, now);
    box.reschedule = {
      startAfterMs: end.getTime() - now.getTime(),
      singletonKey: `notify:terminal:${payload.runId}:quiet:${end.getTime()}`,
      payload,
    };
    return { action: "rescheduled", at: end };
  }

  // §5.11 "Digest — optional hourly" — a run_finished pref of `digest` skips the per-run mail claim; the
  // hourly `run_digest` job renders the summary instead. The Inbox row above still lands.
  const mode = eventType === "run_finished" ? digestMode(prefs, "run_finished") : null;
  if (mode !== null) {
    return inboxed ? { action: "inbox", eventType } : { action: "noop", reason: "disabled" };
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
        openUrl: runDeepLink(config.appBaseUrl, { projectSlug: r.project_slug, landingPath: landing, runId: payload.runId }),
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
  now: Date,
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
  const emailOn = emailEnabled(prefs, "credits_threshold");
  const to = emailOn ? await recipientEmail(tx, userId) : null;

  // one delivery row per threshold (dedup `credits:<ba>:<pct>`); each newly-claimed level mails once.
  // P1.19 — each newly-crossed level also lands an Inbox row (collapse `billing:<acct>:<pct>`).
  let mailed: { deliveryId: string; pct: number } | null = null;
  let inboxedAny = false;
  for (const t of crossed) {
    if (
      await deliverInApp(tx, deps, {
        workspaceId: payload.workspaceId,
        userId,
        eventType: "credits_threshold",
        prefs,
        projectId: null,
        runId: null,
        href: "/settings/billing",
        copy: { percent: t },
        billingAccountId: payload.billingAccountId ?? null,
        tag: String(t),
        now,
      })
    ) {
      inboxedAny = true;
    }
    if (!emailOn || !to) continue;
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
  if (mailed) return { action: "mailed", deliveryId: mailed.deliveryId, eventType: "credits_threshold" };
  if (!emailOn) {
    return inboxedAny ? { action: "inbox", eventType: "credits_threshold" } : { action: "noop", reason: "disabled" };
  }
  if (!to) return { action: "noop", reason: "no_recipient" };
  return inboxedAny
    ? { action: "inbox", eventType: "credits_threshold" }
    : { action: "noop", reason: "already_sent" };
}

async function trialPayment(
  tx: SqlClient,
  deps: OrchestratorDeps,
  config: EmailActionConfig,
  payload: NotificationJobPayload,
  now: Date,
  box: { mail: MailJob | null },
): Promise<NotifyOutcome> {
  // §5.11 non-configurable row — the trial/day-12 + payment-failed notices can never be switched off;
  // `emailEnabled`/`inAppEnabled` are NOT consulted (the matrix overrides a stored false for these rows).
  // The stored pref is only read for quiet-hours context — and trial rows aren't deferrable anyway.
  const userId = payload.userId ?? null;
  if (!userId) return { action: "noop", reason: "no_recipient" };
  const prefs = await readPrefs(tx, userId);
  const reason = payload.reason ?? "Your trial is ending";

  // the Inbox leg — non-configurable too (a trial/payment row can't lose its notification).
  const inboxed = await deliverInApp(tx, deps, {
    workspaceId: payload.workspaceId,
    userId,
    eventType: "trial_payment",
    prefs: { ...prefs, inApp: {} }, // non-configurable: pretend no overrides exist
    projectId: null,
    runId: null,
    href: "/settings/billing",
    copy: { reason },
    billingAccountId: payload.billingAccountId ?? null,
    tag: reason,
    now,
  });

  const to = await recipientEmail(tx, userId);
  if (!to) return inboxed ? { action: "inbox", eventType: "trial_payment" } : { action: "noop", reason: "no_recipient" };
  const claim = await claimDelivery(tx, deps, {
    workspaceId: payload.workspaceId,
    userId,
    eventType: "trial_payment",
    dedupKey: `trial:${userId}:${payload.reason ?? "notice"}`,
    runId: null,
    render: async () =>
      renderEmail("trial_payment", {
        reason,
        openUrl: billingDeepLink(config.appBaseUrl),
      }),
  });
  if (!claim.claimed) {
    return inboxed ? { action: "inbox", eventType: "trial_payment" } : { action: "noop", reason: "already_sent" };
  }
  box.mail = { deliveryId: claim.deliveryId, workspaceId: payload.workspaceId, to, ...claim.email };
  return { action: "mailed", deliveryId: claim.deliveryId, eventType: "trial_payment" };
}

// ---- P1.19 — the in-app-only + deferred rows --------------------------------------------------

/**
 * §5.11 "run progress — off, Advanced opt-in": a committed phase boundary rewrites the run's ONE Inbox
 * row in place (collapse `run:<id>` — the same row the terminal notice will reuse). Per-PROJECT opt-in:
 * `inAppEnabled` resolves `prefs.project[projectId].run_progress === true`; anything else no-ops.
 */
async function runProgress(
  tx: SqlClient,
  deps: OrchestratorDeps,
  payload: NotificationJobPayload,
  now: Date,
): Promise<NotifyOutcome> {
  const r = (
    await tx.query(
      `select r.state, r.project_id, p.title as project_title, p.slug as project_slug
         from runs r left join projects p on p.id = r.project_id where r.id = $1`,
      [payload.runId],
    )
  ).rows[0] as
    | { state: string; project_id: string | null; project_title: string | null; project_slug: string | null }
    | undefined;
  // a stale progress job after the run went terminal is a no-op — the terminal row owns the collapse key.
  if (!r || !["queued", "provisioning", "running", "waiting_gate"].includes(r.state)) {
    return { action: "noop", reason: "not_found" };
  }
  const userId = await runRecipient(tx, payload.runId!);
  if (!userId) return { action: "noop", reason: "no_recipient" };
  const prefs = await readPrefs(tx, userId);
  const inboxed = await deliverInApp(tx, deps, {
    workspaceId: payload.workspaceId,
    userId,
    eventType: "run_progress",
    prefs,
    projectId: r.project_id,
    runId: payload.runId!,
    href: r.project_slug ? `/p/${r.project_slug}/r/${payload.runId}` : "/app/inbox",
    copy: {
      phase: (payload.phase ?? "phase").slice(0, 80),
      ordinal: payload.ordinal ?? 1,
      of: payload.of ?? 1,
      ...(r.project_title ? { projectTitle: r.project_title.slice(0, 140) } : {}),
    },
    now,
  });
  return inboxed ? { action: "inbox", eventType: "run_progress" } : { action: "noop", reason: "disabled" };
}

/**
 * The weekly voice-stale sweep (§5.11 "voice stale → email digest weekly"): for every persona in the
 * workspace whose derived status is an attention state (seed/samples changed, badly-off, aged — the
 * same §9.3 states the Inbox's group-3 rows sort on), land an in-app row collapsing on `voice:<id>` and
 * collect the digest lines; one `voice_stale` mail per user per sweep covers them all. Status is derived
 * at read time (never persisted) — the sweep reuses the ONE loader the surfaces read.
 */
async function voiceDigest(
  tx: SqlClient,
  deps: OrchestratorDeps,
  config: EmailActionConfig,
  payload: NotificationJobPayload,
  now: Date,
  box: { mail: MailJob | null },
): Promise<NotifyOutcome> {
  const STALE_STATES = new Set(["seed_changed", "samples_changed", "badly_off", "aged"]);
  // personas are WORKSPACE-scoped (no owner column) — the sweep delivers to every member; each member's
  // server-side prefs gate their own rows/mail.
  const personas = (
    await tx.query(`select id from personas where deleted_at is null order by id`, [])
  ).rows as { id: string }[];
  const members = (await tx.query(`select user_id from workspace_members order by user_id`, []))
    .rows as { user_id: string }[];
  const stale: { personaId: string; name: string; pill: string; href: string }[] = [];
  for (const p of personas) {
    const bundle = await loadVoiceStatus(tx, { personaId: p.id, now });
    if (!bundle || !STALE_STATES.has(bundle.status.state)) continue;
    const persona = bundle.persona;
    stale.push({
      personaId: p.id,
      name: (persona.display_name ?? persona.slug ?? "Voice").slice(0, 80),
      pill: bundle.status.pill.label.slice(0, 80),
      href: persona.slug ? `/v/${persona.slug}` : "/voices",
    });
  }
  if (stale.length === 0) return { action: "noop", reason: "not_found" };

  let inboxedAny = false;
  let mailed: string | null = null;
  const dayKey = now.toISOString().slice(0, 10);
  for (const m of members) {
    const prefs = await readPrefs(tx, m.user_id);
    for (const v of stale) {
      inboxedAny =
        (await deliverInApp(tx, deps, {
          workspaceId: payload.workspaceId,
          userId: m.user_id,
          eventType: "voice_stale",
          prefs,
          projectId: null,
          runId: null,
          href: v.href,
          copy: { personaName: v.name, pillLabel: v.pill },
          personaId: v.personaId,
          now,
        })) || inboxedAny;
    }
    // one digest mail per member, deduped on the sweep day (the worker fires the job weekly; a same-day
    // re-fire is idempotent through the dedup claim).
    if (!emailEnabled(prefs, "voice_stale")) continue;
    const to = await recipientEmail(tx, m.user_id);
    if (!to) continue;
    const claim = await claimDelivery(tx, deps, {
      workspaceId: payload.workspaceId,
      userId: m.user_id,
      eventType: "voice_stale",
      dedupKey: `voice:digest:${m.user_id}:${dayKey}`,
      runId: null,
      render: async () =>
        renderEmail("voice_stale", {
          count: stale.length,
          voices: stale.slice(0, 50).map((v) => ({ name: v.name, pill: v.pill })),
          openUrl: `${config.appBaseUrl}/voices`,
        }),
    });
    if (!claim.claimed) continue;
    box.mail = { deliveryId: claim.deliveryId, workspaceId: payload.workspaceId, to, ...claim.email };
    mailed = claim.deliveryId;
  }
  if (mailed) return { action: "mailed", deliveryId: mailed, eventType: "voice_stale" };
  return inboxedAny ? { action: "inbox", eventType: "voice_stale" } : { action: "noop", reason: "not_found" };
}

/**
 * The optional hourly run-finished digest (§5.11 "Digest — optional hourly"): find owners of runs that
 * completed in the trailing window in this workspace whose pref opts into `digest.run_finished='hourly'`;
 * each claims one `digest:run:<uid>:<hour>` delivery covering that hour's finished runs (the individual
 * per-run mails were suppressed by digestMode, so the digest is the ONLY mail — the Inbox rows still
 * landed per run).
 */
async function runDigest(
  tx: SqlClient,
  deps: OrchestratorDeps,
  config: EmailActionConfig,
  payload: NotificationJobPayload,
  now: Date,
  box: { mail: MailJob | null },
): Promise<NotifyOutcome> {
  const windowStart = new Date(now.getTime() - 60 * 60 * 1000);
  const finished = (
    await tx.query(
      `select r.id, r.workflow, r.project_id,
              p.title as project_title, p.slug as project_slug, p.owner_id
         from runs r join projects p on p.id = r.project_id
        where r.state = 'completed' and r.finished_at >= $1 and r.finished_at <= $2
        order by p.owner_id, r.finished_at`,
      [windowStart, now],
    )
  ).rows as {
    id: string;
    workflow: string;
    project_id: string;
    project_title: string | null;
    project_slug: string | null;
    owner_id: string | null;
  }[];
  const byUser = new Map<string, typeof finished>();
  for (const r of finished) {
    if (!r.owner_id) continue;
    const list = byUser.get(r.owner_id) ?? [];
    list.push(r);
    byUser.set(r.owner_id, list);
  }
  let mailed: string | null = null;
  for (const [userId, runs] of byUser) {
    const prefs = await readPrefs(tx, userId);
    if (digestMode(prefs, "run_finished") !== "hourly") continue;
    const to = await recipientEmail(tx, userId);
    if (!to) continue;
    const hourKey = now.toISOString().slice(0, 13); // YYYY-MM-DDTHH — one digest per hour per user
    const claim = await claimDelivery(tx, deps, {
      workspaceId: payload.workspaceId,
      userId,
      eventType: "run_finished",
      dedupKey: `digest:run:${userId}:${hourKey}`,
      runId: null,
      render: async () =>
        renderDigest("run_finished_digest", {
          count: runs.length,
          runs: runs.slice(0, 100).map((r) => ({
            workflowLabel: r.workflow.replace(/_/g, " ").slice(0, 80),
            ...(r.project_title ? { projectTitle: r.project_title.slice(0, 140) } : {}),
            openUrl: runDeepLink(config.appBaseUrl, {
              projectSlug: r.project_slug,
              landingPath: runLandingPath({ workflow: r.workflow, projectSlug: r.project_slug, runId: r.id }),
              runId: r.id,
            }),
          })),
        }),
    });
    if (!claim.claimed) continue;
    box.mail = { deliveryId: claim.deliveryId, workspaceId: payload.workspaceId, to, ...claim.email };
    mailed = claim.deliveryId;
  }
  return mailed ? { action: "mailed", deliveryId: mailed, eventType: "run_finished" } : { action: "noop", reason: "not_found" };
}

/**
 * The day-12 trial sweep: subscriptions whose trial_ends_at lands inside the next 48 h get the §5.11
 * "trial ending" row — non-configurable email + in-app, deduped per (account, day) so the daily sweep
 * is idempotent. Payment-failed rides the same handler via `renewal_failed_at` (the Smart-Retries
 * window P1.16 wrote) with a 72 h look-back.
 */
async function trialEnding(
  tx: SqlClient,
  deps: OrchestratorDeps,
  config: EmailActionConfig,
  payload: NotificationJobPayload,
  now: Date,
  box: { mail: MailJob | null },
): Promise<NotifyOutcome> {
  const horizon = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const trials = (
    await tx.query(
      `select s.billing_account_id, s.trial_ends_at,
              (select wm.user_id from workspaces w join workspace_members wm on wm.workspace_id = w.id
                where w.billing_account_id = s.billing_account_id order by wm.user_id limit 1) as user_id
         from subscriptions s
        where s.trial_ends_at is not null and s.trial_ends_at > $1 and s.trial_ends_at <= $2`,
      [now, horizon],
    )
  ).rows as { billing_account_id: string; trial_ends_at: Date; user_id: string | null }[];
  const failed = (
    await tx.query(
      `select s.billing_account_id, s.renewal_failed_at,
              (select wm.user_id from workspaces w join workspace_members wm on wm.workspace_id = w.id
                where w.billing_account_id = s.billing_account_id order by wm.user_id limit 1) as user_id
         from subscriptions s
        where s.renewal_failed_at is not null and s.renewal_failed_at >= $1`,
      [new Date(now.getTime() - 72 * 60 * 60 * 1000)],
    )
  ).rows as { billing_account_id: string; renewal_failed_at: Date; user_id: string | null }[];

  let mailed: string | null = null;
  let inboxedAny = false;
  const dayKey = now.toISOString().slice(0, 10);
  const emit = async (
    userId: string | null,
    billingAccountId: string,
    reason: string,
    dedupTag: string,
  ): Promise<void> => {
    if (!userId) return;
    const prefs = await readPrefs(tx, userId);
    inboxedAny =
      (await deliverInApp(tx, deps, {
        workspaceId: payload.workspaceId,
        userId,
        eventType: "trial_payment",
        prefs: { ...prefs, inApp: {} },
        projectId: null,
        runId: null,
        href: "/settings/billing",
        copy: { reason },
        billingAccountId,
        tag: dedupTag,
        now,
      })) || inboxedAny;
    const to = await recipientEmail(tx, userId);
    if (!to) return;
    const claim = await claimDelivery(tx, deps, {
      workspaceId: payload.workspaceId,
      userId,
      eventType: "trial_payment",
      dedupKey: `trial:${dedupTag}:${billingAccountId}:${dayKey}`,
      runId: null,
      render: async () =>
        renderEmail("trial_payment", { reason, openUrl: billingDeepLink(config.appBaseUrl) }),
    });
    if (!claim.claimed) return;
    box.mail = { deliveryId: claim.deliveryId, workspaceId: payload.workspaceId, to, ...claim.email };
    mailed = claim.deliveryId;
  };
  for (const t of trials) {
    const days = Math.max(1, Math.ceil((t.trial_ends_at.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
    await emit(t.user_id, t.billing_account_id, `Your trial ends in ${days} day${days === 1 ? "" : "s"}`, "ending");
  }
  for (const f of failed) {
    await emit(f.user_id, f.billing_account_id, "A payment failed — update your card to keep runs going", "payment_failed");
  }
  if (mailed) return { action: "mailed", deliveryId: mailed, eventType: "trial_payment" };
  return inboxedAny ? { action: "inbox", eventType: "trial_payment" } : { action: "noop", reason: "not_found" };
}

/**
 * §5.11 "product updates — email only, off by default": an operator-queued job (subject + summary in
 * the payload) mails every workspace member who opted in. There is NO in-app arm (matrix `inApp: none`)
 * and no in-app row is written.
 */
async function productUpdate(
  tx: SqlClient,
  deps: OrchestratorDeps,
  config: EmailActionConfig,
  payload: NotificationJobPayload,
  now: Date,
  box: { mail: MailJob | null },
): Promise<NotifyOutcome> {
  void now;
  if (!payload.subject) return { action: "noop", reason: "not_found" };
  const members = (
    await tx.query(`select user_id from workspace_members order by user_id`, [])
  ).rows as { user_id: string }[];
  let mailed: string | null = null;
  for (const m of members) {
    const prefs = await readPrefs(tx, m.user_id);
    if (!emailEnabled(prefs, "product_update")) continue; // off by default — opt-in only
    const to = await recipientEmail(tx, m.user_id);
    if (!to) continue;
    const claim = await claimDelivery(tx, deps, {
      workspaceId: payload.workspaceId,
      userId: m.user_id,
      eventType: "product_update",
      dedupKey: `product:${payload.subject}`,
      runId: null,
      render: async () =>
        renderEmail("product_update", {
          subject: payload.subject!,
          summary: payload.summary ?? "",
          openUrl: `${config.appBaseUrl}/app`,
        }),
    });
    if (!claim.claimed) continue;
    box.mail = { deliveryId: claim.deliveryId, workspaceId: payload.workspaceId, to, ...claim.email };
    mailed = claim.deliveryId;
  }
  return mailed ? { action: "mailed", deliveryId: mailed, eventType: "product_update" } : { action: "noop", reason: "disabled" };
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
