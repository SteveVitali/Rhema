import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  consumeEmailAction,
  handleGateExpiry,
  handleMailSendJob,
  handleNotifyJob,
  holdGate,
  mintEmailAction,
  scheduleGateNotifications,
  GATE_WAITING_DELAY_MS,
  MAIL_SEND_QUEUE,
  NOTIFY_QUEUE,
  REMINDER_OFFSETS_MS,
  type EmailActionConfig,
  type MailSender,
  type NotificationJobPayload,
} from "./index.js";
import { conditionalResolve, writeDecision } from "./gate-resolution.js";
import {
  createOrchestratorTestDb,
  makeDeps,
  seedGate,
  seedProject,
  seedRun,
  type OrchestratorTestDb,
  type SeededProject,
  type TestDeps,
} from "./testing/index.js";

// PRB.09 deterministic coverage (AC1/AC3/AC5 + the §5.11 delivery rules). Everything runs in-process:
// PGlite + the in-memory queue + a recording MailSender — no live Resend call, ever.

const CONFIG: EmailActionConfig = {
  actionSecret: "test-action-secret",
  apiBaseUrl: "https://api.test",
  appBaseUrl: "https://app.test",
};

let db: OrchestratorTestDb;
let deps: TestDeps;
let seed: SeededProject;
const sent: { to: string; subject: string; text: string; html: string }[] = [];
const mailer: MailSender = {
  send: (m) => {
    sent.push(m);
    return Promise.resolve({ id: `rs_${sent.length}` });
  },
};

const T0 = new Date("2026-09-02T12:00:00Z");

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = { ...makeDeps(db, { now: T0 }), notifications: CONFIG };
  seed = await seedProject(db);
  sent.length = 0;
  deliveredJobs = 0;
  seedCounter = 0;
});
afterEach(() => db.close());

let seedCounter = 0;
async function seedWaitingRun(kind = "approve_plan", deadlineMs: number | null = 2 * 60 * 60 * 1000, onExpiry = "proceed_conservative") {
  const n = ++seedCounter;
  const runId = `run_n${n}`;
  await seedRun(db, { runId, workspaceId: seed.workspaceId, projectId: seed.projectId, state: "waiting_gate" });
  const deadlineAt = deadlineMs == null ? null : new Date(T0.getTime() + deadlineMs);
  const gateId = await seedGate(db, {
    gateId: `gate_n${n}`,
    runId,
    kind,
    onExpiry,
    openedAt: T0,
    deadlineAt,
  });
  return { runId, gateId, deadlineAt };
}

/** Fire every queued notify job whose startAfterMs has elapsed, advancing nothing — tests control the clock. */
async function fireDue(offsetMs = 0) {
  deps.clock.advance(offsetMs);
  const due = deps.queue.ofName(NOTIFY_QUEUE).filter((j) => (j.startAfterMs ?? 0) <= elapsed());
  for (const j of due) await handleNotifyJob(deps, j.payload as unknown as NotificationJobPayload);
}
let openedAt = 0;
function elapsed() {
  return deps.clock.now().getTime() - openedAt;
}
function markOpen() {
  openedAt = deps.clock.now().getTime();
}

function mailJobs() {
  return deps.queue.ofName(MAIL_SEND_QUEUE);
}
let deliveredJobs = 0;
async function deliverAll() {
  const jobs = mailJobs().slice(deliveredJobs); // pg-boss delivers each job once; emulate that
  deliveredJobs = mailJobs().length;
  for (const j of jobs) {
    await handleMailSendJob(
      { txRunner: db.txRunner, mailer, clock: deps.clock },
      j.payload as Parameters<typeof handleMailSendJob>[1],
    );
  }
}
function holdTokenFrom(html: string): string {
  const m = html.match(/\/api\/action\/([A-Za-z0-9._-]+)"[^>]*>Wait for me</);
  expect(m, "a signed Wait-for-me link is rendered").toBeTruthy();
  return m![1]!;
}
function openTokenFrom(html: string): string {
  const m = html.match(/\/api\/action\/([A-Za-z0-9._-]+)"[^>]*>Open</);
  expect(m, "a signed Open link is rendered").toBeTruthy();
  return m![1]!;
}

describe("AC1 — the gate lifecycle fixture", () => {
  it("open → unresolved at +15 min → one signed Wait-for-me/Open email; single-use; reminders at T−1h/T−10m; resolution cancels", async () => {
    const { gateId, deadlineAt } = await seedWaitingRun();
    markOpen();
    await scheduleGateNotifications(deps, {
      gateId,
      workspaceId: seed.workspaceId,
      kind: "approve_plan",
      onExpiry: "proceed_conservative",
      deadlineAt,
      now: deps.clock.now(),
    });

    // scheduling: the +15 min waiting check + both reminders (deadline−1h, deadline−10m).
    const jobs = deps.queue.ofName(NOTIFY_QUEUE);
    const waiting = jobs.find((j) => j.payload.type === "gate_waiting")!;
    expect(waiting.startAfterMs).toBe(GATE_WAITING_DELAY_MS);
    const reminders = jobs.filter((j) => j.payload.type === "gate_reminder");
    expect(reminders.map((j) => j.payload.offsetMs).sort((a, b) => Number(a) - Number(b))).toEqual([...REMINDER_OFFSETS_MS].sort((a, b) => a - b));
    expect(reminders.map((j) => j.startAfterMs).sort((a, b) => a! - b!)).toEqual([
      deadlineAt!.getTime() - REMINDER_OFFSETS_MS[0] - T0.getTime(),
      deadlineAt!.getTime() - REMINDER_OFFSETS_MS[1] - T0.getTime(),
    ]);

    // the waiting check fires early (job still pending per the queue) — simulate the +15 min fire.
    await fireDue(GATE_WAITING_DELAY_MS);
    expect(mailJobs()).toHaveLength(1);
    const payload = mailJobs()[0]!.payload as { to: string; subject: string; text: string; html: string; deliveryId: string };
    expect(payload.to).toBe("usr_seed@example.test");
    expect(payload.subject).toContain("Plan approval");
    await deliverAll();
    expect(sent).toHaveLength(1);

    // a SECOND fire of the same job dedups (one notification per event per channel).
    await handleNotifyJob(deps, waiting.payload as unknown as NotificationJobPayload);
    expect(mailJobs()).toHaveLength(1);

    // the signed Wait-for-me link: consume → gate held, deadline cleared; the replay fails. The Open link
    // is signed the same way and binds action "open".
    const openToken = openTokenFrom(sent[0]!.html);
    expect(
      await db.txRunner.run(seed.workspaceId, async (tx) =>
        tx.query("select action from email_action_tokens where id = $1", [
          JSON.parse(Buffer.from(openToken.split(".")[0]!, "base64url").toString("utf8")).tid,
        ]),
      ),
    ).toMatchObject({ rows: [{ action: "open" }] });
    const holdToken = holdTokenFrom(sent[0]!.html);
    const first = await consumeEmailAction({ txRunner: db.txRunner, clock: deps.clock, config: CONFIG }, holdToken);
    expect(first).toMatchObject({ ok: true, action: "hold", gateId, userId: seed.userId, workspaceId: seed.workspaceId });
    const held = await holdGate(deps, { gateId, workspaceId: seed.workspaceId });
    expect(held.held).toBe(true);
    const gate = (await db.client.query("select deadline_at, held from gates where id = $1", [gateId])).rows[0] as {
      deadline_at: Date | null;
      held: boolean;
    };
    expect(gate.held).toBe(true);
    expect(gate.deadline_at).toBeNull();
    const replay = await consumeEmailAction({ txRunner: db.txRunner, clock: deps.clock, config: CONFIG }, holdToken);
    expect(replay.ok).toBe(false);

    // reminders fire once each — the held gate makes both pending reminder jobs no-op on re-read.
    for (const j of deps.queue.ofName(NOTIFY_QUEUE).filter((x) => x.payload.type === "gate_reminder")) {
      const out = await handleNotifyJob(deps, j.payload as unknown as NotificationJobPayload);
      expect(out.action).toBe("noop"); // held ⇒ cancelled
    }
    expect(mailJobs()).toHaveLength(1);
  });

  it("reminder fires at its offset with a gate.reminder event + the do-nothing outcome; resolution cancels the rest", async () => {
    const { runId, gateId, deadlineAt } = await seedWaitingRun();
    markOpen();
    await scheduleGateNotifications(deps, {
      gateId,
      workspaceId: seed.workspaceId,
      kind: "approve_plan",
      onExpiry: "proceed_conservative",
      deadlineAt,
      now: deps.clock.now(),
    });
    const reminder60 = deps.queue.ofName(NOTIFY_QUEUE).find((j) => j.payload.offsetMs === REMINDER_OFFSETS_MS[0])!;
    const reminder10 = deps.queue.ofName(NOTIFY_QUEUE).find((j) => j.payload.offsetMs === REMINDER_OFFSETS_MS[1])!;

    // the +15 min waiting notice mails first.
    const waiting = deps.queue.ofName(NOTIFY_QUEUE).find((j) => j.payload.type === "gate_waiting")!;
    expect(await handleNotifyJob(deps, waiting.payload as unknown as NotificationJobPayload)).toMatchObject({
      action: "mailed",
      eventType: "approval_waiting",
    });

    // fire the T−1h reminder — the email + the run event land.
    const out = await handleNotifyJob(deps, reminder60.payload as unknown as NotificationJobPayload);
    expect(out).toMatchObject({ action: "mailed", eventType: "gate_reminder" });
    await deliverAll();
    const reminderMail = sent.find((m) => m.subject.includes("1 hour"));
    expect(reminderMail).toBeTruthy();
    expect(reminderMail!.text).toContain("proceeds conservatively");
    const ev = deps.eventWriter.events.find((e) => e.type === "gate.reminder");
    expect(ev).toMatchObject({ runId, type: "gate.reminder" });
    expect((ev!.payload as { offsetMinutes: number }).offsetMinutes).toBe(60);

    // resolving the gate cancels the pending T−10m reminder: the stale job re-reads and no-ops.
    await db.txRunner.run(seed.workspaceId, async (tx) => {
      await conditionalResolve(tx, gateId, deps.clock.now());
      await writeDecision(tx, deps.clock.now(), { gateId, by: "user", action: "proceed_as_proposed" });
    });
    const out10 = await handleNotifyJob(deps, reminder10.payload as unknown as NotificationJobPayload);
    expect(out10).toMatchObject({ action: "noop", reason: "resolved" });
    // exactly two mails total (waiting + the one reminder); nothing more was claimed.
    expect(mailJobs()).toHaveLength(2);
  });

  it("a moved deadline re-arms the reminder against the new instant and the stale fire reschedules", async () => {
    const { gateId } = await seedWaitingRun("approve_plan", 2 * 60 * 60 * 1000);
    markOpen();
    await scheduleGateNotifications(deps, {
      gateId,
      workspaceId: seed.workspaceId,
      kind: "approve_plan",
      onExpiry: "proceed_conservative",
      deadlineAt: new Date(T0.getTime() + 2 * 60 * 60 * 1000),
      now: deps.clock.now(),
    });
    // move the deadline +30 min (an activity extension); the T−1h job keyed to the OLD deadline now fires stale.
    const moved = new Date(T0.getTime() + 2.5 * 60 * 60 * 1000);
    await db.client.query("update gates set deadline_at = $2 where id = $1", [gateId, moved]);
    const stale = deps.queue.ofName(NOTIFY_QUEUE).find((j) => j.payload.type === "gate_reminder" && j.payload.offsetMs === REMINDER_OFFSETS_MS[0])!;
    const out = await handleNotifyJob(deps, stale.payload as unknown as NotificationJobPayload);
    expect(out).toMatchObject({ action: "rescheduled" });
    // the re-armed job carries the NEW deadline and fires at moved−1h.
    const rearmed = deps.queue.ofName(NOTIFY_QUEUE).filter((j) => j.payload.type === "gate_reminder" && j.payload.offsetMs === REMINDER_OFFSETS_MS[0]);
    const latest = rearmed[rearmed.length - 1]!;
    expect(latest.payload.deadlineMs).toBe(moved.getTime());
    expect(latest.startAfterMs).toBe(moved.getTime() - REMINDER_OFFSETS_MS[0] - deps.clock.now().getTime());
    // firing the re-armed job mails once.
    expect(await handleNotifyJob(deps, latest.payload as unknown as NotificationJobPayload)).toMatchObject({ action: "mailed" });
    expect(mailJobs()).toHaveLength(1);
  });
});

describe("AC5 — signed link security", () => {
  it("expiry, tamper, and cross-gate/cross-account binding all fail closed", async () => {
    const { gateId, runId } = await seedWaitingRun();
    const other = await seedWaitingRun("approve_sample"); // a second gate on a second run

    const minted = await db.txRunner.run(seed.workspaceId, (tx) =>
      mintEmailAction(tx, { ids: deps.ids, config: CONFIG }, {
        workspaceId: seed.workspaceId,
        gateId,
        runId,
        userId: seed.userId,
        action: "hold",
        expiresAt: new Date(T0.getTime() + 60 * 60 * 1000),
      }),
    );
    // tamper: re-sign nothing — a forged payload (the OTHER gate's id) carries no valid signature.
    const forgedPayload = Buffer.from(JSON.stringify({ tid: "eat_forged", ws: seed.workspaceId })).toString("base64url");
    const forged = `${forgedPayload}.${minted.token.split(".")[1]}`; // reused sig over a different payload
    expect(await consumeEmailAction({ txRunner: db.txRunner, clock: deps.clock, config: CONFIG }, forged)).toMatchObject({
      ok: false,
      reason: "bad_signature",
    });
    // a token minted under a DIFFERENT secret never verifies (cross-environment).
    expect(
      await consumeEmailAction(
        { txRunner: db.txRunner, clock: deps.clock, config: { ...CONFIG, actionSecret: "other-secret" } },
        minted.token,
      ),
    ).toMatchObject({ ok: false, reason: "bad_signature" });

    // the binding: consume succeeds and reports THIS gate / THIS account — never the other gate's.
    const ok = await consumeEmailAction({ txRunner: db.txRunner, clock: deps.clock, config: CONFIG }, minted.token);
    expect(ok).toMatchObject({ ok: true, gateId, runId, userId: seed.userId, action: "hold" });
    if (ok.ok) {
      expect(ok.gateId).not.toBe(other.gateId);
      const untouched = (await db.client.query("select held from gates where id = $1", [other.gateId])).rows[0] as { held: boolean };
      expect(untouched.held).toBe(false);
    }

    // expired: a token past expires_at fails.
    const expiring = await db.txRunner.run(seed.workspaceId, (tx) =>
      mintEmailAction(tx, { ids: deps.ids, config: CONFIG }, {
        workspaceId: seed.workspaceId,
        gateId,
        runId,
        userId: seed.userId,
        action: "open",
        expiresAt: new Date(T0.getTime() + 1000),
      }),
    );
    deps.clock.advance(2000);
    expect(await consumeEmailAction({ txRunner: db.txRunner, clock: deps.clock, config: CONFIG }, expiring.token)).toMatchObject({
      ok: false,
      reason: "expired_or_consumed",
    });
  });
});

describe("AC3 — the auto-proceeded email (decision + cost, on by default)", () => {
  it("a timed-out auto-proceed mails the decision and the cost", async () => {
    const { runId, gateId } = await seedWaitingRun("approve_sample", 60 * 60 * 1000, "proceed_as_proposed");
    // expiry resolves it (the real path): decision by timeout + the auto_proceeded notify job.
    deps.clock.advance(61 * 60 * 1000);
    const out = await handleGateExpiry(deps, { gateId, workspaceId: seed.workspaceId });
    expect(out).toMatchObject({ action: "resolved", onExpiry: "proceed_as_proposed" });
    const autoJob = deps.queue.ofName(NOTIFY_QUEUE).find((j) => j.payload.type === "auto_proceeded")!;
    expect(autoJob).toBeTruthy();
    const res = await handleNotifyJob(deps, autoJob.payload as unknown as NotificationJobPayload);
    expect(res).toMatchObject({ action: "mailed", eventType: "auto_proceeded" });
    await deliverAll();
    expect(sent[0]!.text).toContain("proceed as proposed");
    expect(sent[0]!.text).toContain("credits");
    expect(sent[0]!.html).toContain(`/review/${runId}`);
    void runId;
  });
});

describe("§5.11 delivery rules", () => {
  it("a disabled configurable row suppresses the mail; the spend-gate row cannot be suppressed", async () => {
    const { gateId } = await seedWaitingRun();
    markOpen();
    // P1.19 — prefs are per-channel: `email: false` alone still lands the Inbox row; both channels
    // must be off for a full noop. spend_gate is non-configurable — its stored false is ignored.
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query("insert into notification_prefs(user_id, prefs) values ($1,$2)", [
        seed.userId,
        JSON.stringify({ email: { approval_waiting: false, spend_gate: false }, inApp: { spend_gate: false } }),
      ]),
    );
    await scheduleGateNotifications(deps, {
      gateId,
      workspaceId: seed.workspaceId,
      kind: "approve_plan",
      onExpiry: "proceed_conservative",
      deadlineAt: null,
      now: deps.clock.now(),
    });
    const waiting = deps.queue.ofName(NOTIFY_QUEUE).find((j) => j.payload.type === "gate_waiting")!;
    expect(await handleNotifyJob(deps, waiting.payload as unknown as NotificationJobPayload)).toMatchObject({
      action: "inbox",
      eventType: "approval_waiting",
    });
    expect(mailJobs()).toHaveLength(0); // the mail leg was suppressed — the row still landed

    // with the in-app leg also off, nothing happens at all.
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query("update notification_prefs set prefs = prefs || $2 where user_id = $1", [
        seed.userId,
        JSON.stringify({ inApp: { approval_waiting: false } }),
      ]),
    );
    const bothOff = await seedWaitingRun();
    await scheduleGateNotifications(deps, {
      gateId: bothOff.gateId,
      workspaceId: seed.workspaceId,
      kind: "approve_plan",
      onExpiry: "proceed_conservative",
      deadlineAt: null,
      now: deps.clock.now(),
    });
    const waiting2 = deps.queue
      .ofName(NOTIFY_QUEUE)
      .find((j) => j.payload.type === "gate_waiting" && j.payload.gateId === bothOff.gateId)!;
    expect(await handleNotifyJob(deps, waiting2.payload as unknown as NotificationJobPayload)).toMatchObject({
      action: "noop",
      reason: "disabled",
    });

    // spend_gate ignores the stored false (defense in depth — the API also refuses the write).
    const spend = await seedWaitingRun("confirm_cost", null, "cancel");
    await scheduleGateNotifications(deps, {
      gateId: spend.gateId,
      workspaceId: seed.workspaceId,
      kind: "confirm_cost",
      onExpiry: "cancel",
      deadlineAt: null,
      now: deps.clock.now(),
    });
    const spendJob = deps.queue
      .ofName(NOTIFY_QUEUE)
      .find((j) => j.payload.type === "gate_waiting" && j.payload.gateId === spend.gateId)!;
    expect(spendJob.startAfterMs).toBe(0); // money is blocked — the notice is immediate, not +15 min
    expect(await handleNotifyJob(deps, spendJob.payload as unknown as NotificationJobPayload)).toMatchObject({
      action: "mailed",
      eventType: "spend_gate",
    });
  });

  it("run_terminal mails finished/failed only, and run_finished defers inside quiet hours", async () => {
    const { runId } = await seedWaitingRun();
    // quiet hours around now → the finished notice reschedules to the window's end.
    await db.txRunner.run(seed.workspaceId, (tx) =>
      tx.query("insert into notification_prefs(user_id, prefs) values ($1,$2)", [
        seed.userId,
        JSON.stringify({ quietHours: { startMinutesUtc: 11 * 60, endMinutesUtc: 13 * 60 } }), // 11:00–13:00 UTC; now = 12:00
      ]),
    );
    await db.client.query("update runs set state = 'completed' where id = $1", [runId]);
    const res = await handleNotifyJob(deps, {
      type: "run_terminal",
      runId,
      workspaceId: seed.workspaceId,
      outcome: "completed",
    });
    expect(res).toMatchObject({ action: "rescheduled" });
    const deferred = deps.queue.ofName(NOTIFY_QUEUE).find((j) => j.singletonKey?.includes("quiet"))!;
    expect(deferred.startAfterMs).toBe(60 * 60 * 1000); // ends 13:00

    // a FAILED run still mails immediately — quiet hours never delay it (only run_finished defers).
    await db.client.query("update runs set state = 'failed' where id = $1", [runId]);
    expect(
      await handleNotifyJob(deps, { type: "run_terminal", runId, workspaceId: seed.workspaceId, outcome: "failed" }),
    ).toMatchObject({ action: "mailed", eventType: "run_failed" });
    await deliverAll();
    expect(sent.some((m) => m.subject === "Run failed on “Seed project”")).toBe(true);
    // cancelled/completed_partial send no MAIL — but P1.19 lands the in-app row
    // (run_cancelled_recovered / run_finished are Inbox events, §5.11).
    await db.client.query("update runs set state = 'cancelled' where id = $1", [runId]);
    expect(
      await handleNotifyJob(deps, { type: "run_terminal", runId, workspaceId: seed.workspaceId, outcome: "cancelled" }),
    ).toMatchObject({ action: "inbox", eventType: "run_cancelled_recovered" });
  });

  it("RES.2 — an Unverified-labelled run's finished mail + Inbox row lead with the run-level label", async () => {
    const { runId } = await seedWaitingRun();
    // the persisted label is the ONLY source — the notify path never recomputes coverage.
    await db.client.query(
      `update runs set state = 'completed',
         delivery = '{"label":"unverified","checkableClaims":16,"coveredClaims":0}'::jsonb
       where id = $1`,
      [runId],
    );
    expect(
      await handleNotifyJob(deps, {
        type: "run_terminal", runId, workspaceId: seed.workspaceId, outcome: "completed",
      }),
    ).toMatchObject({ action: "mailed", eventType: "run_finished" });
    await deliverAll();
    const mail = sent.find((m) => m.subject.includes("Run finished"))!;
    expect(mail).toBeTruthy();
    // the run-level label is the FIRST body line — above the deliverable line, the same slot it holds
    // above the verdict on the run card + dossier. It never reads the claim verdict "unverifiable".
    expect(mail.text.startsWith("Unverified — research could not check the claims")).toBe(true);
    expect(mail.text).toContain("research-phase credits were refunded");
    expect(mail.text).not.toContain("unverifiable");
    // the Inbox row's templated copy carries the label above the project title too.
    const inbox = (
      await db.client.query("select payload from inbox_items where run_id = $1", [runId])
    ).rows[0] as { payload: { type: string; title: string; body?: string } };
    expect(inbox.payload.type).toBe("run_finished");
    expect(inbox.payload.body).toContain("Unverified — claims could not be checked; research credits refunded.");
    expect(inbox.payload.body).not.toContain("unverifiable");
  });

  it("credits thresholds mail at 50/80/100, once each", async () => {
    const { runId } = await seedWaitingRun();
    await db.client.query("update runs set cap_credits = 5000 where id = $1", [runId]); // headroom for the debits
    await db.client.query("insert into workspace_members(workspace_id, user_id, role) values ($1,$2,'admin')", [
      seed.workspaceId,
      seed.userId,
    ]);
    const grant = async (credits: number, key: string) =>
      db.client.query(
        "insert into credit_ledger(id, workspace_id, billing_account_id, kind, credits, bucket, source, idempotency_key) values ($1,$2,$3,'grant',$4,'included','test',$5)",
        [`lg_${key}`, seed.workspaceId, seed.billingAccountId, credits, `g_${key}`],
      );
    const debit = async (credits: number, key: string) =>
      db.client.query(
        "insert into credit_ledger(id, workspace_id, billing_account_id, kind, credits, bucket, source, idempotency_key, run_id) values ($1,$2,$3,'debit',$4,'included','test',$5,$6)",
        [`ld_${key}`, seed.workspaceId, seed.billingAccountId, credits, `d_${key}`, runId],
      );
    await grant(1000, "a");
    await debit(550, "a"); // 55%
    const out = await handleNotifyJob(deps, {
      type: "credits_check",
      billingAccountId: seed.billingAccountId,
      workspaceId: seed.workspaceId,
    });
    expect(out).toMatchObject({ action: "mailed", eventType: "credits_threshold" });
    await deliverAll();
    expect(sent[0]!.subject).toContain("50%");

    // 90% → the 80 notice (the 50 dedup row is already claimed).
    await debit(350, "b");
    await handleNotifyJob(deps, { type: "credits_check", billingAccountId: seed.billingAccountId, workspaceId: seed.workspaceId });
    await deliverAll();
    expect(sent[1]!.subject).toContain("80%");

    // a repeat check sends no new MAIL (every crossed level is already claimed) — the Inbox upsert
    // re-lands idempotently on its `billing:<acct>:<pct>` collapse key.
    const again = await handleNotifyJob(deps, { type: "credits_check", billingAccountId: seed.billingAccountId, workspaceId: seed.workspaceId });
    expect(again).toMatchObject({ action: "inbox", eventType: "credits_threshold" });
    expect(mailJobs()).toHaveLength(2);
  });
});

describe("BILL.3 — the tagged pending-checkout trial_payment leg", () => {
  it("keys the delivery by checkout:<sessionId>, sends exactly one mail, and deep-links back to returnTo", async () => {
    const payload: NotificationJobPayload = {
      type: "trial_payment",
      workspaceId: seed.workspaceId,
      userId: seed.userId,
      billingAccountId: seed.billingAccountId,
      reason: "Your top-up landed — the credits are in",
      tag: "checkout:cs_pending_1",
      openPath: "/p/my-project/run",
    };
    expect(await handleNotifyJob(deps, payload)).toMatchObject({
      action: "mailed",
      eventType: "trial_payment",
    });
    expect(mailJobs()).toHaveLength(1);
    await deliverAll();
    expect(sent).toHaveLength(1);
    expect(sent[0]!.text).toContain("Your top-up landed — the credits are in");
    expect(sent[0]!.html).toContain("https://app.test/p/my-project/run");

    // A replayed notify job hits the same notification_deliveries dedup key — no second mail. The Inbox
    // leg is deliberately an idempotent upsert (a repeated event can refresh the collapsed row).
    expect(await handleNotifyJob(deps, payload)).toMatchObject({ action: "inbox", eventType: "trial_payment" });
    expect(mailJobs()).toHaveLength(1);

    const inbox = (
      await db.client.query(
        "select payload from inbox_items where user_id = $1 and payload->>'type' = 'trial_payment' order by created_at desc limit 1",
        [seed.userId],
      )
    ).rows[0] as { payload: { type: string; href: string } };
    expect(inbox.payload.href).toBe("/p/my-project/run");
    expect(inbox.payload.type).toBe("trial_payment");
  });

  it("honors only an in-app openPath — an external value falls back to the billing deep link", async () => {
    const payload: NotificationJobPayload = {
      type: "trial_payment",
      workspaceId: seed.workspaceId,
      userId: seed.userId,
      billingAccountId: seed.billingAccountId,
      reason: "Your plan is active — the checkout finished",
      tag: "checkout:cs_external",
      openPath: "https://evil.example/pay",
    };
    expect(await handleNotifyJob(deps, payload)).toMatchObject({ action: "mailed" });
    await deliverAll();
    expect(sent[0]!.html).toContain("https://app.test/settings/billing");
    expect(sent[0]!.html).not.toContain("evil.example");
  });
});
