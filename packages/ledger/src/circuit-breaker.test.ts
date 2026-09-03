import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { circuitBreakerState, DEFAULT_ABSORBED_THRESHOLD_PCT } from "./circuit-breaker.js";
import { createLedgerTestDb, seedProject, type LedgerTestDb } from "./testing/index.js";

// AC6 (REQ-SPEC-24.5): if absorbed cap-overruns in 24 h exceed X% of gross usage, the new-run cap multiplier
// rises to 2× and on-call is paged.

let db: LedgerTestDb;
const WS = "ws_seed";
const BA = "ba_seed";
const NOW = new Date("2026-09-03T12:00:00Z");

beforeEach(async () => {
  db = await createLedgerTestDb();
  await seedProject(db, { workspaceId: WS, billingAccountId: BA });
});
afterEach(() => db.close());

/** Insert a raw ledger row at time `at` (bypassing the ops — this seeds the breaker's window directly). */
async function ledgerRow(kind: string, credits: number, at: Date, reason?: string): Promise<void> {
  const id = `l_${Math.random().toString(36).slice(2)}`;
  await db.txRunner.run(WS, (tx) =>
    tx.query(
      `insert into credit_ledger(id, workspace_id, billing_account_id, kind, credits, bucket, source, reason, idempotency_key, at)
       values ($1,$2,$3,$4,$5,'included','run',$6,$7,$8)`,
      [id, WS, BA, kind, credits, reason ?? null, id, at],
    ),
  );
}

describe("circuitBreakerState", () => {
  it("stays at 1× when absorbed adjustments are under the threshold", async () => {
    await ledgerRow("debit", 10000, NOW);
    await ledgerRow("adjustment", 100, NOW, "absorbed"); // 100 / 10100 ≈ 1% < 5%
    const s = await circuitBreakerState(db.client, NOW);
    expect(s.ratio).toBeLessThan(DEFAULT_ABSORBED_THRESHOLD_PCT);
    expect(s.tripped).toBe(false);
    expect(s.capMultiplier).toBe(1);
    expect(s.page).toBe(false);
  });

  it("trips to 2× and pages when absorbed crosses the threshold", async () => {
    await ledgerRow("debit", 1000, NOW);
    await ledgerRow("adjustment", 500, NOW, "absorbed"); // 500 / 1500 ≈ 33% > 5%
    const s = await circuitBreakerState(db.client, NOW);
    expect(s.absorbedCredits).toBe(500);
    expect(s.grossCredits).toBe(1500);
    expect(s.tripped).toBe(true);
    expect(s.capMultiplier).toBe(2);
    expect(s.page).toBe(true);
  });

  it("only counts the trailing 24 h window", async () => {
    const old = new Date(NOW.getTime() - 26 * 60 * 60 * 1000); // outside the window
    await ledgerRow("debit", 1000, NOW);
    await ledgerRow("adjustment", 900, old, "absorbed"); // old absorb does not count
    const s = await circuitBreakerState(db.client, NOW);
    expect(s.absorbedCredits).toBe(0);
    expect(s.tripped).toBe(false);
  });

  it("does not trip on an empty ledger (no gross usage)", async () => {
    const s = await circuitBreakerState(db.client, NOW);
    expect(s.ratio).toBe(0);
    expect(s.tripped).toBe(false);
    expect(s.capMultiplier).toBe(1);
  });
});
