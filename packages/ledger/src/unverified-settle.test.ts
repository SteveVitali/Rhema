import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryEventWriter, type SqlClient } from "@rhema/orchestrator";
import { PLATFORM_FAULT_ZERO_COVERAGE } from "@rhema/contracts";
import { SqlHoldLedger } from "./sql-ledger.js";
import { settleUnverifiedDelivery } from "./unverified-settle.js";
import { reDebitRefundedPhases } from "./resume.js";
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

// RES.2 (REQ-SPEC-31(3)) — the platform-fault settlement for an Unverified delivery: research-phase
// refunds under `platform_fault:zero_coverage` (never re-debited on resume), the metered residue
// absorbed, the consumed trial entitlement restored exactly once with an audit row, the ops page sent
// once — every leg replay-safe off the `runs.delivery` markers.

let db: LedgerTestDb;
const WS = "ws_seed";
const BA = "ba_seed";
const RUN = "run_uv";

beforeEach(async () => {
  db = await createLedgerTestDb();
  await seedProject(db, { workspaceId: WS, billingAccountId: BA });
});
afterEach(() => db.close());

const inTx = <T>(fn: (tx: SqlClient) => Promise<T>) => db.txRunner.run(WS, fn);

/** A completed run labelled Unverified with two done research steps + their debits. */
async function seedUnverifiedRun(opts: { entitlement?: boolean } = {}): Promise<{ stepIds: string[] }> {
  await seedBalances(db, { billingAccountId: BA, balances: { included: 1000 } });
  await seedRun(db, { runId: RUN, workspaceId: WS, state: "completed", capCredits: 840 });
  await db.pg.query(
    `insert into steps(id, run_id, phase, ordinal, state) values
       ('s_ver','${RUN}','verification',1,'done'),
       ('s_dis','${RUN}','discourse',2,'done')`,
  );
  await inTx((tx) =>
    tx.query(
      `update runs set delivery = $2::jsonb where id = $1`,
      [RUN, JSON.stringify({ label: "unverified", checkableClaims: 16, coveredClaims: 0 })],
    ),
  );
  const led = new SqlHoldLedger(testEntryDeps());
  // the debits draw from the run's own hold (the §14.4 draw path) — hold first, then debit.
  await inTx((tx) => led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId: RUN, credits: 840, idempotencyKey: `hold:${RUN}` }));
  await inTx((tx) => led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: RUN, phaseId: "s_ver", credits: 100, idempotencyKey: "debit:run:ver" }));
  await inTx((tx) => led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: RUN, phaseId: "s_dis", credits: 60, idempotencyKey: "debit:run:dis" }));
  // a non-research debit (the letter phase) must NOT be refunded.
  await db.pg.query(`insert into steps(id, run_id, phase, ordinal, state) values ('s_let','${RUN}','letter',3,'done')`);
  await inTx((tx) => led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: RUN, phaseId: "s_let", credits: 30, idempotencyKey: "debit:run:let" }));
  if (opts.entitlement) {
    await db.pg.query(
      `insert into trial_entitlements(id, billing_account_id, state, consumed_by_run_id, consumed_at, expires_at)
         values ('ent_1', $1, 'consumed', $2, now(), now() + interval '10 days')`,
      [BA, RUN],
    );
    await db.pg.query(`update billing_accounts set trial_state = 'trial_used' where id = $1`, [BA]);
    await db.pg.query(`update runs set entitlement_id = 'ent_1' where id = $1`, [RUN]);
  }
  return { stepIds: ["s_ver", "s_dis"] };
}

function settleDeps(alert?: (a: unknown) => void | Promise<void>) {
  const entry = testEntryDeps();
  const eventWriter = new InMemoryEventWriter();
  return {
    deps: {
      txRunner: db.txRunner,
      ledger: new SqlHoldLedger(testEntryDeps()),
      eventWriter,
      ids: entry.ids,
      clock: entry.clock,
      ...(alert ? { alert } : {}),
    },
    eventWriter,
  };
}

const SETTLE_ARGS = {
  runId: RUN,
  workspaceId: WS,
  billingAccountId: BA,
  phaseKeys: ["verification", "discourse"],
  checkableClaims: 16,
  coveredClaims: 0,
} as const;

describe("settleUnverifiedDelivery (RES.2)", () => {
  it("refunds the research phases under platform_fault:zero_coverage, emits cost.refunded, marks the blob, pages ops once", async () => {
    await seedUnverifiedRun();
    const alerts: unknown[] = [];
    const { deps, eventWriter } = settleDeps((a) => { alerts.push(a); });

    const res = await settleUnverifiedDelivery(deps, SETTLE_ARGS);
    expect(res.settled).toBe(true);
    expect(res.refundedCredits).toBe(160); // 100 + 60 — the letter debit is untouched
    expect(res.alerted).toBe(true);

    const rows = await readLedgerRows(db, RUN);
    const refunds = rows.filter((r) => r.kind === "refund");
    expect(refunds.every((r) => r.reason === PLATFORM_FAULT_ZERO_COVERAGE)).toBe(true);
    expect(refunds.reduce((s, r) => s + r.credits, 0)).toBe(160);
    // the refunded bucket is back at full — the letter debit stays spent.
    expect((await readBalances(db, BA)).included).toMatchObject({ available: 320, held: 650 });

    const ev = eventWriter.forRun(RUN).find((e) => e.type === "cost.refunded");
    expect(ev?.payload).toMatchObject({ credits: 160 });

    const run = (await db.client.query("select delivery from runs where id=$1", [RUN])).rows[0] as {
      delivery: { platformFaultSettledAt?: string; refundedCredits?: number; alerted?: boolean };
    };
    expect(run.delivery.platformFaultSettledAt).toBeTruthy();
    expect(run.delivery.refundedCredits).toBe(160);
    expect(run.delivery.alerted).toBe(true);

    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({
      kind: "unverified_delivery",
      runId: RUN,
      workspaceId: WS,
      checkableClaims: 16,
      coveredClaims: 0,
      refundedCredits: 160,
    });
  });

  it("a replay is a strict no-op — no second refund, no second alert", async () => {
    await seedUnverifiedRun();
    const alerts: unknown[] = [];
    const { deps } = settleDeps((a) => { alerts.push(a); });
    await settleUnverifiedDelivery(deps, SETTLE_ARGS);
    const before = (await readLedgerRows(db, RUN)).length;
    const again = await settleUnverifiedDelivery(deps, SETTLE_ARGS);
    expect(again.settled).toBe(true);
    expect((await readLedgerRows(db, RUN)).length).toBe(before);
    expect(alerts).toHaveLength(1); // `alerted` marked — no re-page
    expect((await readBalances(db, BA)).included.available).toBe(320);
  });

  it("a non-Unverified run is a no-op (the persisted label is the guard)", async () => {
    await seedBalances(db, { billingAccountId: BA, balances: { included: 1000 } });
    await seedRun(db, { runId: RUN, workspaceId: WS, state: "completed" });
    const alerts: unknown[] = [];
    const { deps } = settleDeps((a) => { alerts.push(a); });
    const res = await settleUnverifiedDelivery(deps, SETTLE_ARGS);
    expect(res.settled).toBe(false);
    expect((await readLedgerRows(db, RUN)).length).toBe(0);
    expect(alerts).toHaveLength(0);
  });

  it("a consumed trial entitlement restores exactly once, with the audit row", async () => {
    await seedUnverifiedRun({ entitlement: true });
    const { deps } = settleDeps(() => {});
    const res = await settleUnverifiedDelivery(deps, SETTLE_ARGS);
    expect(res.trialRestored).toBe(true);

    const ent = (await db.client.query("select state, consumed_by_run_id from trial_entitlements where id='ent_1'")).rows[0] as {
      state: string;
      consumed_by_run_id: string | null;
    };
    expect(ent.state).toBe("unused");
    expect(ent.consumed_by_run_id).toBeNull();
    const audit = (await db.client.query("select run_id, entitlement_id from trial_restorations")).rows as {
      run_id: string;
      entitlement_id: string;
    }[];
    expect(audit).toHaveLength(1);
    expect(audit[0]).toMatchObject({ run_id: RUN, entitlement_id: "ent_1" });
    const acct = (await db.client.query("select trial_state from billing_accounts where id=$1", [BA])).rows[0] as { trial_state: string };
    expect(acct.trial_state).toBe("trial_active");

    // exactly once — the replay cannot re-restore nor re-audit.
    const again = await settleUnverifiedDelivery(deps, SETTLE_ARGS);
    expect(again.trialRestored).toBe(true); // reported from the marker, not a second restore
    expect((await db.client.query("select count(*)::int n from trial_restorations")).rows[0]).toMatchObject({ n: 1 });
  });

  it("a throwing alert sink leaves `alerted` unset for the sweep's retry (send-then-mark)", async () => {
    await seedUnverifiedRun();
    const { deps } = settleDeps(() => {
      throw new Error("webhook down");
    });
    await expect(settleUnverifiedDelivery(deps, SETTLE_ARGS)).rejects.toThrow("webhook down");
    const run = (await db.client.query("select delivery->>'alerted' as alerted, delivery->>'platformFaultSettledAt' as settled_at from runs where id=$1", [RUN])).rows[0] as {
      alerted: string | null;
      settled_at: string | null;
    };
    expect(run.alerted).toBeNull(); // unmarked → leg E retries the page
    expect(run.settled_at).toBeTruthy(); // the money legs still committed

    // the sweep's retry (a healthy sink) pages once and marks.
    const alerts: unknown[] = [];
    const { deps: deps2 } = settleDeps((a) => { alerts.push(a); });
    await settleUnverifiedDelivery(deps2, SETTLE_ARGS);
    expect(alerts).toHaveLength(1);
    const after = (await db.client.query("select delivery->>'alerted' as alerted from runs where id=$1", [RUN])).rows[0] as { alerted: string | null };
    expect(after.alerted).toBe("true");
    // and the money legs did NOT replay.
    const rows = await readLedgerRows(db, RUN);
    expect(rows.filter((r) => r.kind === "refund")).toHaveLength(2);
  });

  it("platform-fault refunds are never re-debited on resume", async () => {
    await seedUnverifiedRun();
    const { deps } = settleDeps(() => {});
    await settleUnverifiedDelivery(deps, SETTLE_ARGS);
    // resume semantics: reDebitRefundedPhases sees ONLY user-class refunds — the platform-fault
    // rows refund nothing back out of the user's pocket on a re-run.
    const redebited = await inTx((tx) =>
      reDebitRefundedPhases(tx, new SqlHoldLedger(testEntryDeps()), {
        workspaceId: WS,
        billingAccountId: BA,
        runId: RUN,
        idempotencyKey: `redebit:${RUN}:2`,
      }),
    );
    expect(redebited.every((r) => r.credits === 0)).toBe(true);
    expect((await readBalances(db, BA)).included.available).toBe(320); // unchanged
  });
});
