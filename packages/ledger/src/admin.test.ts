import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { AccountSuspendedError, type SqlClient } from "@rhema/orchestrator";
import { SqlHoldLedger } from "./sql-ledger.js";
import {
  grantHouseCredits,
  voidHouseCredits,
  suspendAccount,
  reinstateAccount,
  ClawbackDebtError,
} from "./admin.js";
import { recordAnalyticsEvent } from "./analytics.js";
import {
  createLedgerTestDb,
  seedProject,
  seedRun,
  seedBalances,
  testEntryDeps,
  readBalances,
  type LedgerTestDb,
} from "./testing/index.js";

// PRB.08 — the operator billing primitives (REQ-BETA-14): house-credit grant/void as ORDINARY ledger rows
// (promo bucket, admin source, audited), account suspend/reinstate, and the analytics sink's opt-out
// discipline (REQ-PROD-15). PGlite + the real schema (0020) — deterministic.

let db: LedgerTestDb;
// the analytics envelope validates user_id/workspace_id as ULIDs at the write boundary — use ULID-shaped ids.
const WS = "01JQ0000000000000000000WS1";
const BA = "ba_seed";
const USER = "01JQ0000000000000000000MB1";

beforeEach(async () => {
  db = await createLedgerTestDb();
  await seedProject(db, { workspaceId: WS, billingAccountId: BA, userId: USER });
  await db.pg.query("insert into workspace_members(workspace_id, user_id, role) values ($1,$2,'admin')", [WS, USER]);
});
afterEach(() => db.close());

function inTx<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
  return db.txRunner.run(WS, fn);
}
const deps = () => testEntryDeps();

async function adminActionRows() {
  return (await db.client.query("select actor, action, credits, ledger_id from admin_actions order by at, id")).rows as {
    actor: string; action: string; credits: number | null; ledger_id: string | null;
  }[];
}
async function analyticsRows() {
  return (await db.client.query("select event, props, user_id from analytics_events order by at, id")).rows as {
    event: string; props: Record<string, unknown>; user_id: string;
  }[];
}
async function ledgerRowsFor(billingAccountId: string = BA) {
  return (
    await db.client.query(
      "select kind, bucket, source, reason, credits, stripe_ref, expires_at from credit_ledger where billing_account_id = $1 order by at, id",
      [billingAccountId],
    )
  ).rows as { kind: string; bucket: string; source: string; reason: string | null; credits: number; stripe_ref: string | null; expires_at: string | null }[];
}

describe("grantHouseCredits (AC1 — house credits are ordinary ledger grants, REQ-BETA-14)", () => {
  it("writes a grant(promo, admin, house_credit) row + the audit row, and the balance is spendable", async () => {
    const res = await inTx((tx) =>
      grantHouseCredits(tx, deps(), {
        actor: "op_steve",
        workspaceId: WS,
        billingAccountId: BA,
        credits: 200_000,
        expiresAt: new Date("2026-12-31T00:00:00Z"),
        note: "beta onboarding",
        idempotencyKey: "admin:grant:1",
      }),
    );
    expect(res.applied).toBe(true);
    expect((await readBalances(db, BA)).promo).toEqual({ available: 200_000, held: 0 });

    const [row] = await ledgerRowsFor();
    expect(row).toMatchObject({ kind: "grant", bucket: "promo", source: "admin", reason: "house_credit", credits: 200_000 });
    expect(row!.expires_at).not.toBeNull(); // house credits always expire (never a silent subsidy)

    const audits = await adminActionRows();
    expect(audits).toHaveLength(1);
    expect(audits[0]).toMatchObject({ actor: "op_steve", action: "house_credit_grant", credits: 200_000, ledger_id: res.ledgerId });
  });

  it("is idempotent — a replayed key grants nothing and writes no second audit row", async () => {
    const args = {
      actor: "op_steve",
      workspaceId: WS,
      billingAccountId: BA,
      credits: 200_000,
      expiresAt: new Date("2026-12-31T00:00:00Z"),
      idempotencyKey: "admin:grant:dup",
    };
    const a = await inTx((tx) => grantHouseCredits(tx, deps(), args));
    const b = await inTx((tx) => grantHouseCredits(tx, deps(), args));
    expect(a.applied).toBe(true);
    expect(b.applied).toBe(false);
    expect(b.auditId).toBeNull();
    expect((await readBalances(db, BA)).promo.available).toBe(200_000);
    expect(await adminActionRows()).toHaveLength(1);
  });

  it("the granted balance drives the REAL ledger path: hold → debit → release", async () => {
    await inTx((tx) =>
      grantHouseCredits(tx, deps(), {
        actor: "op_steve", workspaceId: WS, billingAccountId: BA, credits: 1000,
        expiresAt: new Date("2026-12-31T00:00:00Z"), idempotencyKey: "admin:grant:2",
      }),
    );
    await seedRun(db, { runId: "run1", workspaceId: WS, state: "queued", capCredits: 600 });
    const led = new SqlHoldLedger(deps());
    await inTx((tx) => led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", credits: 600, idempotencyKey: "hold:run1" }));
    // promo is LAST in consumption order — a promo-only balance still holds.
    expect((await readBalances(db, BA)).promo).toEqual({ available: 400, held: 600 });
    await inTx((tx) => led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", phaseId: "p1", credits: 250, idempotencyKey: "debit:run1:p1" }));
    await inTx((tx) => led.release(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", holdLedgerId: "h", idempotencyKey: "release:run1" }));
    expect((await readBalances(db, BA)).promo).toEqual({ available: 750, held: 0 }); // spent 250 of 1000
  });
});

describe("voidHouseCredits", () => {
  beforeEach(async () => {
    await inTx((tx) =>
      grantHouseCredits(tx, deps(), {
        actor: "op_steve", workspaceId: WS, billingAccountId: BA, credits: 500,
        expiresAt: new Date("2026-12-31T00:00:00Z"), idempotencyKey: "admin:grant:pre",
      }),
    );
  });

  it("removes promo balance via an expire row (never a direct balance write) + audits", async () => {
    const res = await inTx((tx) =>
      voidHouseCredits(tx, deps(), { actor: "op_steve", workspaceId: WS, billingAccountId: BA, credits: 200, idempotencyKey: "admin:void:1" }),
    );
    expect(res.voided).toBe(200);
    expect((await readBalances(db, BA)).promo.available).toBe(300);
    const rows = await ledgerRowsFor();
    const voidRow = rows.find((r) => r.reason === "house_credit_void");
    expect(voidRow).toMatchObject({ kind: "expire", bucket: "promo", credits: 200 });
    expect((await adminActionRows()).some((a) => a.action === "house_credit_void" && a.credits === 200)).toBe(true);
  });

  it("clamps to the available promo balance — a void can never take the balance negative", async () => {
    const res = await inTx((tx) =>
      voidHouseCredits(tx, deps(), { actor: "op_steve", workspaceId: WS, billingAccountId: BA, credits: 999_999, idempotencyKey: "admin:void:2" }),
    );
    expect(res.voided).toBe(500);
    expect((await readBalances(db, BA)).promo.available).toBe(0);
  });
});

describe("suspendAccount / reinstateAccount (REQ-SPEC-24.7)", () => {
  it("suspend is idempotent and blocks NEW holds (existing holds may still debit)", async () => {
    const r1 = await inTx((tx) => suspendAccount(tx, deps(), { actor: "op_steve", billingAccountId: BA, workspaceId: WS }));
    const r2 = await inTx((tx) => suspendAccount(tx, deps(), { actor: "op_steve", billingAccountId: BA, workspaceId: WS }));
    expect(r1.suspended).toBe(true);
    expect(r2.suspended).toBe(false); // already suspended — no second audit
    expect((await adminActionRows()).filter((a) => a.action === "account_suspend")).toHaveLength(1);

    await seedBalances(db, { billingAccountId: BA, balances: { included: 1000 } });
    await seedRun(db, { runId: "run_new", workspaceId: WS, state: "queued", capCredits: 100 });
    const led = new SqlHoldLedger(deps());
    await expect(
      inTx((tx) => led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId: "run_new", credits: 100, idempotencyKey: "hold:new" })),
    ).rejects.toBeInstanceOf(AccountSuspendedError);
  });

  it("reinstate refuses while clawback debt remains; clears delivery-withhold markers when clean", async () => {
    await inTx((tx) => suspendAccount(tx, deps(), { actor: "op_steve", billingAccountId: BA, workspaceId: WS }));
    await seedRun(db, { runId: "run_w", workspaceId: WS, state: "finalizing" });
    await db.txRunner.run(WS, (tx) => tx.query("update runs set delivery_withheld_at = now() where id = 'run_w'"));
    await db.pg.query("update billing_accounts set clawback_debt = 40 where id = $1", [BA]);

    await expect(
      inTx((tx) => reinstateAccount(tx, deps(), { actor: "op_steve", billingAccountId: BA, workspaceId: WS })),
    ).rejects.toBeInstanceOf(ClawbackDebtError);

    await db.pg.query("update billing_accounts set clawback_debt = 0 where id = $1", [BA]);
    const res = await inTx((tx) => reinstateAccount(tx, deps(), { actor: "op_steve", billingAccountId: BA, workspaceId: WS }));
    expect(res.reinstated).toBe(true);
    // the un-withheld runs are handed back so the caller enqueues the run.deliver re-drive.
    expect(res.withheldRuns).toEqual([{ runId: "run_w", workspaceId: WS }]);
    const acct = (await db.client.query("select suspended_at from billing_accounts where id = $1", [BA])).rows[0] as { suspended_at: string | null };
    expect(acct.suspended_at).toBeNull();
    const run = (await db.client.query("select delivery_withheld_at from runs where id = 'run_w'")).rows[0] as { delivery_withheld_at: string | null };
    expect(run.delivery_withheld_at).toBeNull(); // the run.deliver re-drive can now complete
  });
});

describe("recordAnalyticsEvent (REQ-BETA-12; REQ-PROD-15 opt-out)", () => {
  it("persists a catalogue event with the envelope lifted to columns", async () => {
    const id = await inTx((tx) =>
      recordAnalyticsEvent(tx, deps(), {
        userId: USER, workspaceId: WS,
        event: "credits.exhausted_prompt",
        props: { action_taken: "shown" },
      }),
    );
    expect(id).not.toBeNull();
    const rows = await analyticsRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.event).toBe("credits.exhausted_prompt");
    expect(rows[0]!.props).toEqual({ action_taken: "shown" });
    expect(rows[0]!.user_id).toBe(USER);
  });

  it("an opted-out user produces NO row at all (the absence is the honor)", async () => {
    await db.pg.query('update "user" set analytics_opt_out = true where id = $1', [USER]);
    const id = await inTx((tx) =>
      recordAnalyticsEvent(tx, deps(), { userId: USER, workspaceId: WS, event: "wtp.recorded", props: { source: "interview", amount: 49 } }),
    );
    expect(id).toBeNull();
    expect(await analyticsRows()).toHaveLength(0);
  });

  it("rejects an unknown event name — a bad emitter is a bug, never a silent drop", async () => {
    await expect(
      inTx((tx) =>
        recordAnalyticsEvent(tx, deps(), { userId: USER, workspaceId: WS, event: "not.an.event" as never, props: {} }),
      ),
    ).rejects.toThrow();
    expect(await analyticsRows()).toHaveLength(0);
  });
});
