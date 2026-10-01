import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  handleMailSendJob,
  handleNotifyJob,
  MAIL_SEND_QUEUE,
  type EmailActionConfig,
  type MailSender,
} from "./index.js";
import {
  createOrchestratorTestDb,
  makeDeps,
  seedProject,
  seedRun,
  type OrchestratorTestDb,
  type SeededProject,
  type TestDeps,
} from "./testing/index.js";

// HOT.1 — the hourly run-finished digest (§5.11 "Digest — optional hourly") shipped querying a column
// that never existed (`r.finished_at`) with no workspace predicate. These tests run the REAL handler
// through `txRunner` — the `rhema_app_login` user-serving role — so a dead column, a missing grant, or
// a cross-tenant row all turn red. The SQL-prepare guard lives in notifications.sql-guard.test.ts.

const CONFIG: EmailActionConfig = {
  actionSecret: "test-action-secret",
  apiBaseUrl: "https://api.test",
  appBaseUrl: "https://app.test",
};

let db: OrchestratorTestDb;
let deps: TestDeps;
let seed: SeededProject;
const T0 = new Date("2026-10-01T12:00:00Z");
const sentCopy: string[] = [];
const recordingMailer: MailSender = {
  send: (m) => {
    sentCopy.push(m.subject);
    return Promise.resolve({ id: `rs_${sentCopy.length}` });
  },
};

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = { ...makeDeps(db, { now: T0 }), notifications: CONFIG };
  seed = await seedProject(db);
  sentCopy.length = 0;
});
afterEach(() => db.close());

/** Opt a user into the hourly digest. */
async function optInHourly(userId: string) {
  await db.pg.query(
    `insert into notification_prefs(user_id, prefs) values ($1, $2::jsonb)
     on conflict (user_id) do update set prefs = $2::jsonb`,
    [userId, JSON.stringify({ digest: { run_finished: "hourly" } })],
  );
}

/** A completed run owned by `projectId`'s owner, `ended_at` minutes before T0. */
async function finishedRun(args: {
  runId: string;
  workspaceId: string;
  projectId: string;
  minutesAgo: number;
}) {
  await seedRun(db, {
    runId: args.runId,
    workspaceId: args.workspaceId,
    projectId: args.projectId,
    workflow: "review",
    state: "completed",
  });
  await db.pg.query(`update runs set ended_at = $1 where id = $2`, [
    new Date(T0.getTime() - args.minutesAgo * 60_000),
    args.runId,
  ]);
}

const digestPayload = { type: "run_digest" as const, workspaceId: "ws_seed" };

describe("run_digest — the hourly run-finished digest (HOT.1, REQ-SPEC-30)", () => {
  it("mails the opted-in owner once for the trailing hour's completed runs — as the user-serving role", async () => {
    await optInHourly(seed.userId);
    await finishedRun({ runId: "run_in", workspaceId: seed.workspaceId, projectId: seed.projectId, minutesAgo: 30 });

    const out = await handleNotifyJob(deps, digestPayload);
    expect(out).toMatchObject({ action: "mailed", eventType: "run_finished" });

    const mails = deps.queue.ofName(MAIL_SEND_QUEUE);
    expect(mails).toHaveLength(1);
    const job = mails[0]!.payload as { to: string; subject: string; text: string };
    expect(job.to).toBe("usr_seed@example.test");
    expect(job.text + job.subject).toContain("Seed project");
  });

  it("ignores runs outside the window, non-completed runs, and non-digest prefs", async () => {
    await optInHourly(seed.userId);
    await finishedRun({ runId: "run_old", workspaceId: seed.workspaceId, projectId: seed.projectId, minutesAgo: 90 }); // outside the hour
    await seedRun(db, { runId: "run_live", workspaceId: seed.workspaceId, projectId: seed.projectId, state: "running" });
    await db.pg.query(`update runs set ended_at = $1 where id = 'run_live'`, [T0]); // ended_at but not completed
    const out = await handleNotifyJob(deps, digestPayload);
    expect(out).toMatchObject({ action: "noop" });
    expect(deps.queue.ofName(MAIL_SEND_QUEUE)).toHaveLength(0);
  });

  it("never digests another workspace's runs — the predicate is IN the SQL, not just RLS", async () => {
    // a second tenant with a completed run in the window and an opted-in owner
    const other = await seedProject(db, {
      userId: "usr_other",
      billingAccountId: "ba_other",
      workspaceId: "ws_other",
      projectId: "prj_other",
    });
    await optInHourly(other.userId);
    await finishedRun({ runId: "run_other", workspaceId: other.workspaceId, projectId: other.projectId, minutesAgo: 10 });
    // and our own workspace's run just outside the window, so a missing predicate is the only way ws_other leaks in
    await finishedRun({ runId: "run_edge", workspaceId: seed.workspaceId, projectId: seed.projectId, minutesAgo: 61 });

    const out = await handleNotifyJob(deps, digestPayload);
    expect(out).toMatchObject({ action: "noop" }); // nothing in-window for ws_seed
    expect(deps.queue.ofName(MAIL_SEND_QUEUE)).toHaveLength(0);

    // and running the sweep for ws_other DOES pick it up — the predicate isn't just deny-all.
    const out2 = await handleNotifyJob(deps, { type: "run_digest", workspaceId: "ws_other" });
    expect(out2).toMatchObject({ action: "mailed" });
    const job = deps.queue.ofName(MAIL_SEND_QUEUE)[0]!.payload as { to: string };
    expect(job.to).toBe("usr_other@example.test");
  });

  it("dedupes: a second sweep in the same hour re-finds nothing new once the first mail went out", async () => {
    await optInHourly(seed.userId);
    await finishedRun({ runId: "run_in", workspaceId: seed.workspaceId, projectId: seed.projectId, minutesAgo: 5 });
    await handleNotifyJob(deps, digestPayload);
    // emulate pg-boss delivering the queued mail.send job (marks the delivery row sent)
    for (const j of deps.queue.ofName(MAIL_SEND_QUEUE)) {
      await handleMailSendJob(
        { txRunner: db.txRunner, mailer: recordingMailer, clock: deps.clock },
        j.payload as Parameters<typeof handleMailSendJob>[1],
      );
    }
    const out = await handleNotifyJob(deps, digestPayload);
    expect(out).toMatchObject({ action: "noop" });
    // and only ONE delivery row exists for the hour — the dedup key held.
    const n = (
      await db.pg.query(
        `select count(*)::int n from notification_deliveries where dedup_key like 'digest:run:%'`,
      )
    ).rows[0] as { n: number };
    expect(n.n).toBe(1);
    expect(sentCopy).toHaveLength(1);
  });
});
