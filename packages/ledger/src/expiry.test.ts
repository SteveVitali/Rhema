import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SqlClient } from "@rhema/orchestrator";
import { grant } from "./entries.js";
import { expireCredits } from "./expiry.js";
import { drawFromBuckets } from "./buckets.js";
import { createLedgerTestDb, seedProject, testEntryDeps, readBalances, type LedgerTestDb } from "./testing/index.js";

// AC4 (incl. expiries): expired credits are removed from `available` (the `expire` op) before consumption, so
// the consumption order draws only from what remains. The rollover POLICY (2× cap, reset timing) is P1.16.

let db: LedgerTestDb;
const WS = "ws_seed";
const BA = "ba_seed";
const inTx = <T>(fn: (tx: SqlClient) => Promise<T>) => db.txRunner.run(WS, fn);
const deps = () => testEntryDeps();

beforeEach(async () => {
  db = await createLedgerTestDb();
  await seedProject(db, { workspaceId: WS, billingAccountId: BA });
});
afterEach(() => db.close());

describe("expireCredits", () => {
  it("removes unspent credits from a bucket, clamped to available (never below 0)", async () => {
    await inTx((tx) => grant(tx, deps(), { workspaceId: WS, billingAccountId: BA, bucket: "trial_pocket", credits: 150, idempotencyKey: "grant:tp" }));
    const expired = await inTx((tx) => expireCredits(tx, deps(), { workspaceId: WS, billingAccountId: BA, bucket: "trial_pocket", credits: 999, idempotencyKey: "expire:tp:day14" }));
    expect(expired).toBe(150); // clamped to the 150 available, not 999
    expect((await readBalances(db, BA)).trial_pocket).toEqual({ available: 0, held: 0 });
  });

  it("expiry integrates with consumption order — an expired bucket is skipped when spending", async () => {
    await inTx((tx) => grant(tx, deps(), { workspaceId: WS, billingAccountId: BA, bucket: "trial_pocket", credits: 100, idempotencyKey: "grant:tp" }));
    await inTx((tx) => grant(tx, deps(), { workspaceId: WS, billingAccountId: BA, bucket: "included", credits: 500, idempotencyKey: "grant:inc" }));
    // day-14 expiry of the trial pocket
    await inTx((tx) => expireCredits(tx, deps(), { workspaceId: WS, billingAccountId: BA, bucket: "trial_pocket", credits: 100, idempotencyKey: "expire:tp" }));

    const bal = await readBalances(db, BA);
    // consumption order would take trial_pocket first, but it is now empty → a 300 draw comes entirely from included.
    const draw = drawFromBuckets({ trial_pocket: bal.trial_pocket?.available ?? 0, included: bal.included.available }, 300);
    expect(draw.draws).toEqual([{ bucket: "included", credits: 300 }]);
  });

  it("is idempotent — a repeated expiry with the same key does not double-remove", async () => {
    await inTx((tx) => grant(tx, deps(), { workspaceId: WS, billingAccountId: BA, bucket: "included", credits: 500, idempotencyKey: "grant:inc" }));
    await inTx((tx) => expireCredits(tx, deps(), { workspaceId: WS, billingAccountId: BA, bucket: "included", credits: 200, idempotencyKey: "expire:inc:1" }));
    await inTx((tx) => expireCredits(tx, deps(), { workspaceId: WS, billingAccountId: BA, bucket: "included", credits: 200, idempotencyKey: "expire:inc:1" }));
    expect((await readBalances(db, BA)).included).toEqual({ available: 300, held: 0 });
  });
});
