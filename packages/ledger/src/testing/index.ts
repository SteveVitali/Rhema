// Test-support surface for @rhema/ledger. Reuses the orchestrator's PGlite harness (the chain's deterministic
// DB-test pattern — real Postgres in WASM, RLS + triggers live) and adds ledger-specific seeds: per-bucket
// balances and the id/clock DI bundle. Imported by ledger + app tests via `@rhema/ledger/testing` (never by
// production code — it pulls the PGlite devDependency).

import { FixedClock } from "@rhema/orchestrator";
import {
  createOrchestratorTestDb,
  seedProject,
  seedRun,
  type OrchestratorTestDb,
} from "@rhema/orchestrator/testing";
import type { EntryDeps } from "../entries.js";
import type { HoldBucket } from "../buckets.js";

export { createOrchestratorTestDb, seedProject, seedRun };
export type { OrchestratorTestDb };
export type LedgerTestDb = OrchestratorTestDb;

/** A fresh in-process DB with all migrations applied — an alias of the orchestrator harness for ledger tests. */
export const createLedgerTestDb = createOrchestratorTestDb;

// A process-global monotonic counter so ids stay unique even across several `SqlHoldLedger` instances in one
// test (a per-instance sequence would collide on `credit_ledger.id`).
let idSeq = 0;

/** Deterministic id + clock DI for the ledger write path. The clock is fixed at `at` and drivable by the test. */
export function testEntryDeps(at: Date = new Date("2026-09-03T00:00:00Z")): EntryDeps & { clock: FixedClock } {
  return { ids: (prefix = "led") => `${prefix}_${String(++idSeq).padStart(9, "0")}`, clock: new FixedClock(at) };
}

/** Seed a billing account's per-bucket balances directly (credit_balances is not RLS-scoped). */
export async function seedBalances(
  db: OrchestratorTestDb,
  args: { billingAccountId: string; balances: Partial<Record<HoldBucket, number>> },
): Promise<void> {
  await db.pg.query(`insert into billing_accounts(id) values ($1) on conflict (id) do nothing`, [
    args.billingAccountId,
  ]);
  for (const [bucket, available] of Object.entries(args.balances)) {
    await db.pg.query(
      `insert into credit_balances(billing_account_id, bucket, available, held)
         values ($1,$2,$3,0)
         on conflict (billing_account_id, bucket) do update set available = excluded.available`,
      [args.billingAccountId, bucket, available ?? 0],
    );
  }
}

/** Pin a run's `hold_bucket` (P0.08's `run-creation` sets it from the hold; tests set it directly). */
export async function setHoldBucket(db: OrchestratorTestDb, runId: string, workspaceId: string, bucket: HoldBucket): Promise<void> {
  await db.txRunner.run(workspaceId, (tx) => tx.query("update runs set hold_bucket = $2 where id = $1", [runId, bucket]));
}

/** Read every ledger row for a run (assertion helper). */
export async function readLedgerRows(
  db: OrchestratorTestDb,
  runId: string,
): Promise<{ kind: string; credits: number; bucket: string; phase_id: string | null; reason: string | null }[]> {
  return (
    await db.client.query(
      "select kind, credits, bucket, phase_id, reason from credit_ledger where run_id = $1 order by at, id",
      [runId],
    )
  ).rows as { kind: string; credits: number; bucket: string; phase_id: string | null; reason: string | null }[];
}

/** Read a billing account's per-bucket balances (assertion helper). */
export async function readBalances(
  db: OrchestratorTestDb,
  billingAccountId: string,
): Promise<Record<string, { available: number; held: number }>> {
  const rows = (
    await db.client.query(
      "select bucket, available::int as available, held::int as held from credit_balances where billing_account_id = $1",
      [billingAccountId],
    )
  ).rows as { bucket: string; available: number; held: number }[];
  const out: Record<string, { available: number; held: number }> = {};
  for (const r of rows) out[r.bucket] = { available: Number(r.available), held: Number(r.held) };
  return out;
}
