import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryEventWriter, type SqlClient, type TxRunner } from "@rhema/orchestrator";
import { PLATFORM_FAULT_ZERO_COVERAGE, USER_REFUND_REASON, refundQuarterKey } from "@rhema/contracts";
import { SqlHoldLedger } from "./sql-ledger.js";
import { refundPhases } from "./resume.js";
import {
  decideRefundReview,
  refundEligibility,
  requestUserRefund,
  userRefundEpisodeKey,
  type RefundWindowDeps,
} from "./refund-window.js";
import {
  createLedgerTestDb,
  seedProject,
  seedRun,
  seedBalances,
  testEntryDeps,
  readBalances,
  readLedgerRows,
  type LedgerTestDb,
} from "./testing/index.js";

// DEF.4 — the §14.4 user refund window (BL-30; REQ-SPEC-24(6); REQ-IDE-18; REQ-SPEC-30/32). The
// deterministic half of the route's acceptance: eligibility, the per-quarter allowance, the review
// path, idempotent replay, and that platform-fault/failed-run refunds never count.
//
// Fixture clock is 2026-09-03 UTC (testEntryDeps default) → quarter '2026Q3', window ±7 days.

let db: LedgerTestDb;
const WS = "ws_seed";
const BA = "ba_seed";
const USR = "usr_seed";

beforeEach(async () => {
  db = await createLedgerTestDb();
  await seedProject(db, { workspaceId: WS, billingAccountId: BA, userId: USR });
  // one seed for the whole test — `seedBalances` upserts (a second call would RESET the counter),
  // so a multi-run fixture gets one large opening balance (a run's hold+release is net-neutral).
  await seedBalances(db, { billingAccountId: BA, balances: { included: 5000 } });
});
afterEach(() => db.close());

const inTx = <T>(fn: (tx: SqlClient) => Promise<T>) => db.txRunner.run(WS, fn);

function windowDeps(txRunner: TxRunner = db.txRunner): { deps: RefundWindowDeps; eventWriter: InMemoryEventWriter } {
  const entry = testEntryDeps(); // FixedClock 2026-09-03T00:00Z
  const eventWriter = new InMemoryEventWriter();
  return { deps: { txRunner, eventWriter, ids: entry.ids, clock: entry.clock }, eventWriter };
}

/** A terminal run with two committed debits (100+60 on `included`) and the hold already released —
 *  the delivered-run money shape. `ended_at` pins the refund window's terminal timestamp. */
async function seedDeliveredRun(
  runId: string,
  opts: { state?: string; endedAt?: Date | null; entitlement?: boolean } = {},
): Promise<void> {
  await seedRun(db, { runId, workspaceId: WS, state: opts.state ?? "completed", capCredits: 840 });
  await db.pg.query(`insert into steps(id, run_id, phase, ordinal, state) values
    ('s1_${runId}','${runId}','craft',1,'done'), ('s2_${runId}','${runId}','verification',2,'done')`);
  const led = new SqlHoldLedger(testEntryDeps());
  await inTx((tx) => led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId, credits: 840, idempotencyKey: `hold:${runId}` }));
  await inTx((tx) => led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId, phaseId: `s1_${runId}`, credits: 100, idempotencyKey: `debit:${runId}:s1` }));
  await inTx((tx) => led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId, phaseId: `s2_${runId}`, credits: 60, idempotencyKey: `debit:${runId}:s2` }));
  await inTx((tx) => led.release(tx, { billingAccountId: BA, workspaceId: WS, runId, holdLedgerId: "h", idempotencyKey: `release:${runId}` }));
  await db.pg.query("update runs set ended_at = $2 where id = $1", [
    runId,
    opts.endedAt === undefined ? new Date("2026-09-02T12:00:00Z") : opts.endedAt,
  ]);
  if (opts.entitlement) {
    await db.pg.query(
      `insert into trial_entitlements(id, billing_account_id, state, consumed_by_run_id, consumed_at, expires_at)
         values ('ent_${runId}', $1, 'consumed', $2, now(), now() + interval '10 days')`,
      [BA, runId],
    );
    await db.pg.query("update runs set entitlement_id = $2 where id = $1", [runId, `ent_${runId}`]);
  }
}

describe("requestUserRefund — the §14.4 window (REQ-SPEC-24(6))", () => {
  it("the first eligible request refunds every committed phase: per-phase user_window rows, the request row, cost.refunded — balance moves by exactly N", async () => {
    await seedDeliveredRun("run_a");
    const before = (await readBalances(db, BA)).included!;
    const { deps, eventWriter } = windowDeps();

    const res = await requestUserRefund(deps, { runId: "run_a", workspaceId: WS, userId: USR });
    expect(res).toMatchObject({ kind: "refunded", credits: 160 });

    // balance moved by exactly the refund amount; the refund rows carry the user-window reason,
    // one per (phase, bucket), drawn back into the bucket the debit took.
    const after = (await readBalances(db, BA)).included!;
    expect(after.available - before.available).toBe(160);
    const refunds = (await readLedgerRows(db, "run_a")).filter((r) => r.kind === "refund");
    expect(refunds.map((r) => [r.phase_id, r.bucket, r.credits]).sort()).toEqual([
      ["s1_run_a", "included", 100],
      ["s2_run_a", "included", 60],
    ]);
    for (const r of refunds) expect(r.reason).toBe(USER_REFUND_REASON);

    const req = (
      await db.client.query("select state, decision, quarter, decided_at is not null as decided from user_refund_requests where run_id = 'run_a'")
    ).rows[0] as { state: string; decision: string; quarter: string; decided: boolean };
    expect(req).toEqual({ state: "refunded", decision: "auto_allowance", quarter: "2026Q3", decided: true });

    const ev = eventWriter.forRun("run_a").find((e) => e.type === "cost.refunded");
    expect(ev?.payload).toMatchObject({ credits: 160, reason: USER_REFUND_REASON });
  });

  it("completed_partial and cancelled runs are eligible; failed and in-flight runs are not", async () => {
    for (const [runId, state, want] of [
      ["run_cp", "completed_partial", true],
      ["run_cx", "cancelled", true],
      ["run_f", "failed", false],
      ["run_r", "running", false],
    ] as const) {
      await seedDeliveredRun(runId, { state });
      const elig = await inTx((tx) =>
        refundEligibility(tx, { runId, workspaceId: WS, now: testEntryDeps().clock.now() }),
      );
      expect(elig !== "not_found" && elig.eligible, `${state} eligibility`).toBe(want);
    }
  });

  it("replaying the request is a no-op — same verdict, no new ledger rows, no second event", async () => {
    await seedDeliveredRun("run_re");
    const { deps, eventWriter } = windowDeps();
    await requestUserRefund(deps, { runId: "run_re", workspaceId: WS, userId: USR });
    const rowsBefore = (await readLedgerRows(db, "run_re")).length;
    const again = await requestUserRefund(deps, { runId: "run_re", workspaceId: WS, userId: USR });
    expect(again.kind).toBe("refunded");
    expect((await readLedgerRows(db, "run_re")).length).toBe(rowsBefore);
    expect(eventWriter.forRun("run_re").filter((e) => e.type === "cost.refunded")).toHaveLength(1);
    expect((await db.client.query("select count(*)::int n from user_refund_requests where run_id = 'run_re'")).rows[0]).toEqual({ n: 1 });
  });

  it("the second eligible request in the quarter lands pending_review — no refund rows, no event", async () => {
    await seedDeliveredRun("run_q1");
    await seedDeliveredRun("run_q2");
    const { deps } = windowDeps();
    const first = await requestUserRefund(deps, { runId: "run_q1", workspaceId: WS, userId: USR });
    expect(first.kind).toBe("refunded");

    const second = await requestUserRefund(deps, { runId: "run_q2", workspaceId: WS, userId: USR });
    expect(second).toMatchObject({ kind: "pending_review", credits: 160 });
    // nothing moved — the request parked; no refund row, no event.
    expect((await readLedgerRows(db, "run_q2")).some((r) => r.kind === "refund")).toBe(false);
    const req = (
      await db.client.query("select state, decision, quarter from user_refund_requests where run_id = 'run_q2'")
    ).rows[0] as { state: string; decision: string | null; quarter: string };
    expect(req).toEqual({ state: "pending_review", decision: null, quarter: "2026Q3" });
    // a replay of the pending request stays pending (no decision yet).
    const replay = await requestUserRefund(deps, { runId: "run_q2", workspaceId: WS, userId: USR });
    expect(replay.kind).toBe("pending_review");
  });

  it("a request in the NEXT quarter is a fresh allowance", async () => {
    await seedDeliveredRun("run_xq1");
    const { deps } = windowDeps();
    expect((await requestUserRefund(deps, { runId: "run_xq1", workspaceId: WS, userId: USR })).kind).toBe("refunded");
    // wind the clock into 2026Q4 and request again — a new quarter's allowance (the run ended
    // 2026-09-28, inside the new clock's 7-day window; the quarter keys on the REQUEST date).
    await seedDeliveredRun("run_xq2", { endedAt: new Date("2026-09-28T12:00:00Z") });
    const entry2 = testEntryDeps(new Date("2026-10-02T00:00:00Z"));
    const deps2: RefundWindowDeps = { txRunner: db.txRunner, eventWriter: new InMemoryEventWriter(), ids: entry2.ids, clock: entry2.clock };
    const second = await requestUserRefund(deps2, { runId: "run_xq2", workspaceId: WS, userId: USR });
    expect(second.kind).toBe("refunded");
    const req = (await db.client.query("select quarter from user_refund_requests where run_id = 'run_xq2'")).rows[0] as { quarter: string };
    expect(req.quarter).toBe("2026Q4");
    expect(refundQuarterKey(new Date("2026-10-02T00:00:00Z"))).toBe("2026Q4");
  });

  it("day 8 is refused — the window anchors ended_at + REFUND_WINDOW_DAYS", async () => {
    await seedDeliveredRun("run_old", { endedAt: new Date("2026-08-25T12:00:00Z") }); // 9 days before the 09-03 clock
    const { deps } = windowDeps();
    const res = await requestUserRefund(deps, { runId: "run_old", workspaceId: WS, userId: USR });
    expect(res).toEqual({ kind: "ineligible", reason: "window_expired" });
    expect((await readLedgerRows(db, "run_old")).some((r) => r.kind === "refund")).toBe(false);
  });

  it("an entitlement run and a never-debited run are ineligible", async () => {
    await seedDeliveredRun("run_ent", { entitlement: true });
    const { deps } = windowDeps();
    expect(await requestUserRefund(deps, { runId: "run_ent", workspaceId: WS, userId: USR })).toEqual({
      kind: "ineligible", reason: "entitlement",
    });
    // never debited: a completed run with no ledger debit rows at all.
    await seedRun(db, { runId: "run_nd", workspaceId: WS, state: "completed" });
    await db.pg.query("update runs set ended_at = $2 where id = $1", ["run_nd", new Date("2026-09-02T12:00:00Z")]);
    expect(await requestUserRefund(deps, { runId: "run_nd", workspaceId: WS, userId: USR })).toEqual({
      kind: "ineligible", reason: "nothing_to_refund",
    });
    expect(await requestUserRefund(deps, { runId: "run_missing", workspaceId: WS, userId: USR })).toEqual({ kind: "not_found" });
  });

  it("a platform-fault refund and a failed-run refund on the account leave the quarterly allowance untouched", async () => {
    // RES.2's class — a platform-fault refund on run_pf carries no request row and must not count.
    await seedDeliveredRun("run_pf");
    await inTx((tx) =>
      refundPhases(tx, testEntryDeps(), {
        workspaceId: WS, billingAccountId: BA, runId: "run_pf",
        phaseIds: [`s1_run_pf`], idempotencyKey: "platform-fault:run_pf",
        reason: PLATFORM_FAULT_ZERO_COVERAGE,
      }),
    );
    // and an ordinary run-level refund (the failed-run class — reason null).
    await seedDeliveredRun("run_failed");
    await inTx((tx) =>
      refundPhases(tx, testEntryDeps(), {
        workspaceId: WS, billingAccountId: BA, runId: "run_failed",
        phaseIds: [`s1_run_failed`], idempotencyKey: "failed:run_failed",
      }),
    );

    const { deps } = windowDeps();
    await seedDeliveredRun("run_user");
    const res = await requestUserRefund(deps, { runId: "run_user", workspaceId: WS, userId: USR });
    // still the FIRST user refund — the other classes never touched the allowance.
    expect(res.kind).toBe("refunded");
  });
});

describe("decideRefundReview — the admin verb (system pool, workspace predicate; REQ-SPEC-30)", () => {
  it("approving a pending request runs the same refund episode: rows, event, request row decided", async () => {
    await seedDeliveredRun("run_r1");
    await seedDeliveredRun("run_r2");
    const { deps: userDeps } = windowDeps();
    await requestUserRefund(userDeps, { runId: "run_r1", workspaceId: WS, userId: USR });
    const pending = await requestUserRefund(userDeps, { runId: "run_r2", workspaceId: WS, userId: USR });
    expect(pending.kind).toBe("pending_review");
    const requestId = pending.kind === "pending_review" ? pending.requestId : "";

    // the admin verb runs on the SYSTEM pool — the user role has no UPDATE on the request table.
    const { deps: sysDeps, eventWriter } = windowDeps(db.systemTxRunner);
    const decided = await decideRefundReview(sysDeps, {
      requestId, workspaceId: WS, approve: true, actor: "op_test", note: "goodwill",
    });
    expect(decided).toMatchObject({ kind: "approved", credits: 160 });
    // both refunds returned every committed debit — the account is whole again.
    expect((await readBalances(db, BA)).included!.available).toBe(5000);
    const req = (
      await db.client.query(
        "select state, decision, decided_by, note, credits from user_refund_requests where id = $1",
        [requestId],
      )
    ).rows[0] as { state: string; decision: string; decided_by: string; note: string; credits: number };
    expect(req).toEqual({ state: "refunded", decision: "admin_approve", decided_by: "op_test", note: "goodwill", credits: 160 });
    const ev = eventWriter.forRun("run_r2").find((e) => e.type === "cost.refunded");
    expect(ev?.payload).toMatchObject({ credits: 160, reason: USER_REFUND_REASON });
    // a re-decision of a decided row is a no-op.
    expect(await decideRefundReview(sysDeps, { requestId, workspaceId: WS, approve: false, actor: "op_test" }))
      .toMatchObject({ kind: "already_decided", state: "refunded" });
  });

  it("denying closes the request without a refund; a re-decision is already_decided", async () => {
    await seedDeliveredRun("run_d1");
    await seedDeliveredRun("run_d2");
    const { deps: userDeps } = windowDeps();
    await requestUserRefund(userDeps, { runId: "run_d1", workspaceId: WS, userId: USR });
    const pending = await requestUserRefund(userDeps, { runId: "run_d2", workspaceId: WS, userId: USR });
    const requestId = pending.kind === "pending_review" ? pending.requestId : "";

    // SEC.1's boundary is real: the user role cannot decide its own review (no UPDATE grant).
    await expect(
      inTx((tx) =>
        tx.query("update user_refund_requests set state = 'refunded' where id = $1", [requestId]),
      ),
    ).rejects.toThrow();

    const { deps: sysDeps } = windowDeps(db.systemTxRunner);
    const denied = await decideRefundReview(sysDeps, { requestId, workspaceId: WS, approve: false, actor: "op_test" });
    expect(denied).toMatchObject({ kind: "denied" });
    expect((await readLedgerRows(db, "run_d2")).some((r) => r.kind === "refund")).toBe(false);
    const req = (
      await db.client.query("select state, decision, decided_by from user_refund_requests where id = $1", [requestId])
    ).rows[0] as { state: string; decision: string; decided_by: string };
    expect(req).toEqual({ state: "denied", decision: "admin_deny", decided_by: "op_test" });
    const again = await decideRefundReview(sysDeps, { requestId, workspaceId: WS, approve: true, actor: "op_test" });
    expect(again).toMatchObject({ kind: "already_decided", state: "denied" });
    // and the user-facing replay reports the denial.
    const replay = await requestUserRefund(userDeps, { runId: "run_d2", workspaceId: WS, userId: USR });
    expect(replay.kind).toBe("denied");
  });

  it("the episode key is shared: an auto refund and a review approval are the same episode", () => {
    expect(userRefundEpisodeKey("run_x")).toBe("user-refund:run_x");
  });
});
