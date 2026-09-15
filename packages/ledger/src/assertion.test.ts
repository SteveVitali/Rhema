import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SqlClient } from "@rhema/orchestrator";
import { SqlHoldLedger } from "./sql-ledger.js";
import { grant } from "./entries.js";
import { assertBalances } from "./assertion.js";
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
