import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SqlClient } from "@rhema/orchestrator";
import { SqlHoldLedger } from "./sql-ledger.js";
import { applyLedgerEntry, grant } from "./entries.js";
import { assertBalances, reconcileBalances, type ReconcileBalancesDeps } from "./assertion.js";
import { createLedgerTestDb, seedProject, seedRun, testEntryDeps, type LedgerTestDb } from "./testing/index.js";

// AC3 (REQ-SPEC-24.1): the nightly job rebuilds balances from the ledger and detects any drift. `credit_balances`
// is a maintained TABLE, not a materialized view — this is the safety net that catches a bug in the write path.

let db: LedgerTestDb;
const WS = "ws_seed";
const BA = "ba_seed";

beforeEach(async () => {
  db = await createLedgerTestDb();
  await seedProject(db, { workspaceId: WS, billingAccountId: BA });
  await seedRun(db, { runId: "run1", workspaceId: WS, state: "running", capCredits: 840 });
  const led = new SqlHoldLedger(testEntryDeps());
  const deps = testEntryDeps();
  const inTx = <T>(fn: (tx: SqlClient) => Promise<T>) => db.txRunner.run(WS, fn);
  // Seed the opening balance through the ledger (a grant), so the ledger fully explains credit_balances.
  await inTx((tx) => grant(tx, deps, { workspaceId: WS, billingAccountId: BA, bucket: "included", credits: 1000, idempotencyKey: "grant:included" }));
  await inTx((tx) => grant(tx, deps, { workspaceId: WS, billingAccountId: BA, bucket: "topup", credits: 500, idempotencyKey: "grant:topup" }));
  await inTx((tx) => led.hold(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", credits: 840, idempotencyKey: "hold:run1" }));
  await inTx((tx) => led.debit(tx, { billingAccountId: BA, workspaceId: WS, runId: "run1", phaseId: "p1", credits: 300, idempotencyKey: "debit:run1:p1:1" }));
});
afterEach(() => db.close());

describe("assertBalances (nightly balances = Σ ledger)", () => {
  it("passes when the maintained table matches the ledger", async () => {
    const res = await assertBalances(db.client, { billingAccountId: BA });
    expect(res.ok).toBe(true);
    expect(res.divergences).toEqual([]);
  });

  it("detects a planted divergence (a balance that no ledger row explains)", async () => {
    // Corrupt the maintained table out-of-band (as a write-path bug would).
    await db.pg.query("update credit_balances set available = available + 250 where billing_account_id = $1 and bucket = 'included'", [BA]);

    const res = await assertBalances(db.client, { billingAccountId: BA });
    expect(res.ok).toBe(false);
    const d = res.divergences.find((x) => x.bucket === "included");
    expect(d).toBeDefined();
    expect(d!.actualAvailable - d!.expectedAvailable).toBe(250);
  });

  it("detects a held/available drift too", async () => {
    await db.pg.query("update credit_balances set held = held - 40 where billing_account_id = $1 and bucket = 'included'", [BA]);
    const res = await assertBalances(db.client, { billingAccountId: BA });
    expect(res.ok).toBe(false);
    const d = res.divergences.find((x) => x.bucket === "included")!;
    expect(d.expectedHeld - d.actualHeld).toBe(40);
  });
});

// DEF.2/F4 — the deterministic reconcile path: dry-run reports, --apply repairs (hold backfills for
// unheld debits + counter rewrite + audit row), and the 0044 `check (held >= 0)` makes a negative
// hold an error at the write instead of silent drift.
describe("reconcileBalances + the held>=0 invariant (DEF.2)", () => {
  const reconcileDeps = (actor?: string): ReconcileBalancesDeps => ({
    ...testEntryDeps(),
    runTx: (ws, fn) => db.txRunner.run(ws, fn),
    workspacesForAccount: async (acct) =>
      (
        (
          await db.client.query("select id from workspaces where billing_account_id = $1 order by created_at, id", [acct])
        ).rows as { id: string }[]
      ).map((r) => r.id),
    ...(actor ? { actor } : {}),
  });

  it("a held-decrement with no reservation ERRORS under check(held >= 0) — the drift path is now loud", async () => {
    // The 0044 NOT VALID check enforces new writes: pushing a bucket's held below zero aborts the tx
    // rather than corrupting the counter (the STB.3 −897 state can no longer be written).
    await expect(
      db.pg.query("update credit_balances set held = -5 where billing_account_id = $1 and bucket = 'included'", [BA]),
    ).rejects.toThrow(/credit_balances_held_nonnegative|violates check constraint/);
    // a canonical lone 'debit' (no hold) through applyLedgerEntry hits the same wall at the counter write
    await expect(
      db.txRunner.run(WS, (tx) =>
        applyLedgerEntry(tx, testEntryDeps(), {
          workspaceId: WS,
          billingAccountId: BA,
          kind: "debit",
          credits: 10,
          bucket: "topup",
          source: "system",
          idempotencyKey: "orphan-debit:1",
        }),
      ),
    ).rejects.toThrow(/credit_balances_held_nonnegative|violates check constraint/);
    // nothing was written — the failed debit's ledger row rolled back with the tx
    expect(
      (await db.client.query("select count(*)::int as n from credit_ledger where idempotency_key = 'orphan-debit:1'"))
        .rows[0],
    ).toEqual({ n: 0 });
  });

  it("dry-run reports divergences + planned backfills and writes NOTHING", async () => {
    // Plant the STB.3 shape: an unheld debit row (ledger-side orphan) + a drifted counter.
    await db.pg.query(
      `insert into credit_ledger (id, workspace_id, billing_account_id, kind, credits, bucket, source, reason, idempotency_key, at)
         values ('led_orphan', $1, $2, 'debit', 180, 'topup', 'system', 'unheld debit', 'orphan:debit:1', now())`,
      [WS, BA],
    );
    await db.pg.query("update credit_balances set available = available + 717 where billing_account_id = $1 and bucket = 'topup'", [BA]);

    const res = await reconcileBalances(reconcileDeps(), { billingAccountId: BA });
    expect(res.applied).toBe(false);
    expect(res.backfills).toEqual([{ bucket: "topup", credits: 180, ledgerId: null }]);
    const d = res.divergences.find((x) => x.bucket === "topup")!;
    // post-backfill fold: available 500(grant) − 180(backfill hold) = 320; held 0
    expect(d.expectedAvailable).toBe(320);
    expect(d.expectedHeld).toBe(0);
    // nothing was written
    expect((await db.client.query("select count(*)::int as n from credit_ledger where source = 'reconcile'")).rows[0]).toEqual({ n: 0 });
    expect((await db.client.query("select count(*)::int as n from admin_actions where action = 'balance_recompute'")).rows[0]).toEqual({ n: 0 });
  });

  it("apply repairs the account: backfill hold, counter rewrite, audit — then the assertion is clean", async () => {
    await db.pg.query(
      `insert into credit_ledger (id, workspace_id, billing_account_id, kind, credits, bucket, source, reason, idempotency_key, at)
         values ('led_orphan', $1, $2, 'debit', 180, 'topup', 'system', 'unheld debit', 'orphan:debit:1', now())`,
      [WS, BA],
    );
    await db.pg.query("update credit_balances set available = available + 717 where billing_account_id = $1 and bucket = 'topup'", [BA]);

    const res = await reconcileBalances(reconcileDeps("op_test"), { billingAccountId: BA, apply: true });
    expect(res.applied).toBe(true);
    expect(res.backfills[0]).toMatchObject({ bucket: "topup", credits: 180 });
    expect(res.backfills[0]!.ledgerId).not.toBeNull();
    const bal = (
      await db.client.query("select available::int as a, held::int as h from credit_balances where billing_account_id = $1 and bucket = 'topup'", [BA])
    ).rows[0] as { a: number; h: number };
    expect(bal).toEqual({ a: 320, h: 0 });
    const audit = (
      await db.client.query("select actor, action from admin_actions where action = 'balance_recompute'", [])
    ).rows as { actor: string; action: string }[];
    expect(audit).toEqual([{ actor: "op_test", action: "balance_recompute" }]);
    // REQ-SPEC-24.1 — the nightly assertion now reconciles cleanly.
    const post = await assertBalances(db.client, { billingAccountId: BA });
    expect(post.ok).toBe(true);

    // A repeat apply is a no-op repair: nothing left divergent, no new backfill rows.
    const again = await reconcileBalances(reconcileDeps("op_test"), { billingAccountId: BA, apply: true });
    expect(again.divergences).toEqual([]);
    expect(again.backfills).toEqual([]);
    expect(
      (await db.client.query("select count(*)::int as n from credit_ledger where source = 'reconcile'")).rows[0],
    ).toEqual({ n: 1 }); // still just the one backfill
  });

  // DEF.4 / D-DEF.2-1 — prod's exact F4 shape: a counter at held −897 against a ledger fold of
  // held −180, under an ACTIVE `credit_balances_held_nonnegative` check. The pre-fix ordering routed
  // the backfill hold through `applyLedgerEntry`, whose incremental counter write landed held
  // −897 + 180 = −717 — the check fired and the repair could never apply. The fix appends the
  // backfill ledger rows untouched by a counter write, then lands each counter at its post-backfill
  // fold in one upsert. To plant the prod shape the constraint is dropped, the negative counter is
  // seeded, and the NOT VALID check re-added — writes stay enforced (the CHECK fires on every new
  // write under NOT VALID) while the planted row escapes the scan.
  it("repairs the prod F4 shape under an ACTIVE held>=0 check (no intermediate negative write)", async () => {
    // 1. give the account a topup ledger whose fold nets available 380 / held −180: hold 120 → a
    //    300-credit debit that never had its reservation (the prod in-tree bypass shape — run_id
    //    NULL so the REQ-BILL-3 cap trigger doesn't engage on the fixture's bookkeeping row).
    //    Direct inserts keep the fold exact (a SqlHoldLedger.hold would draw cross-bucket).
    await db.pg.query(
      `insert into credit_ledger (id, workspace_id, billing_account_id, kind, credits, bucket, source, reason, idempotency_key, at)
         values
           ('led_f4_hold', $1, $2, 'hold', 120, 'topup', 'system', 'fixture hold', 'f4:hold', now()),
           ('led_f4_orphan', $1, $2, 'debit', 300, 'topup', 'system', 'unheld debit', 'f4:orphan', now())`,
      [WS, BA],
    );

    // 2. plant the drifted counter under the constraint's blind spot: drop the check, write the
    //    prod numbers (available 2,235 / held −897), re-add it NOT VALID — enforced on new writes
    //    exactly as it was when DEF.2's repair failed.
    await db.pg.query("alter table credit_balances drop constraint credit_balances_held_nonnegative");
    await db.pg.query(
      "update credit_balances set available = 2235, held = -897 where billing_account_id = $1 and bucket = 'topup'",
      [BA],
    );
    await db.pg.query(
      "alter table credit_balances add constraint credit_balances_held_nonnegative check (held >= 0) not valid",
    );
    // the check is active — an arbitrary negative write is refused (the pre-fix intermediate dies here);
    // the rejected write left the planted row untouched at held −897.
    await expect(
      db.pg.query("update credit_balances set held = held + 180 where billing_account_id = $1 and bucket = 'topup'", [BA]),
    ).rejects.toThrow(/credit_balances_held_nonnegative|violates check constraint/);

    // 3. the repair applies WITH THE CHECK ACTIVE — no DDL, one atomic tx.
    const res = await reconcileBalances(reconcileDeps("op_def4"), { billingAccountId: BA, apply: true });
    expect(res.applied).toBe(true);
    expect(res.backfills).toHaveLength(1);
    expect(res.backfills[0]).toMatchObject({ bucket: "topup", credits: 180 });
    expect(res.backfills[0]!.ledgerId).not.toBeNull();

    // the counter landed at the post-backfill fold in one write: available 380 − 180 = 200, held 0.
    const bal = (
      await db.client.query(
        "select available::int as a, held::int as h from credit_balances where billing_account_id = $1 and bucket = 'topup'",
        [BA],
      )
    ).rows[0] as { a: number; h: number };
    expect(bal).toEqual({ a: 200, h: 0 });
    const audit = (
      await db.client.query("select actor, action from admin_actions where action = 'balance_recompute'", [])
    ).rows as { actor: string; action: string }[];
    expect(audit).toEqual([{ actor: "op_def4", action: "balance_recompute" }]);

    // 4. the nightly assertion is clean AND the constraint validates — the repair leaves the exact
    //    state prod's manual re-validation reached.
    const post = await assertBalances(db.client, { billingAccountId: BA });
    expect(post.ok).toBe(true);
    await db.pg.query("alter table credit_balances validate constraint credit_balances_held_nonnegative");
    const convalidated = (
      await db.client.query(
        "select convalidated from pg_constraint where conname = 'credit_balances_held_nonnegative'",
      )
    ).rows[0] as { convalidated: boolean } | undefined;
    expect(convalidated?.convalidated).toBe(true);
  });
});
