// The parked-resume re-price (P1.16; §14.6 "rate-table change while parked"). A run parks with a frozen
// `rate_table_version`; when it resumes AFTER a newer table exists, the estimate is recomputed under the
// current table and the DELTA gates through the normal spend-gate path (the orchestrator's
// `scopeExceedsCap` consent). This module owns the pricing math + the row stamp; the steering resume path
// calls it and decides whether the run re-queues or parks for consent.

import type { SqlClient } from "@rhema/orchestrator";
import { CURRENT_RATE_TABLE_VERSION } from "@rhema/contracts";

export interface RepriceResult {
  readonly changed: boolean;
  readonly fromVersion: number;
  readonly toVersion: number;
  /** re-estimated credits under the current table (same frozen scope — estimator output is out of scope). */
  readonly newEstimateCredits: number;
  readonly newCapCredits: number;
  /** newCap − oldCap: positive ⇒ the delta needs the spend gate before resume. */
  readonly deltaCredits: number;
}

/**
 * Re-price a parked run against the CURRENT rate table. `reestimate` is injected — the orchestrator's
 * estimate path (frozen scope → credits under a table version) is its own module; the ledger owns the
 * ledger-side facts (the stamp + the delta the gate compares). Returns `changed:false` when the run's
 * table is already current.
 */
export async function repriceParkedRun(
  tx: SqlClient,
  args: {
    runId: string;
    reestimate: (run: {
      id: string;
      estimateCredits: number;
      capCredits: number;
      rateTableVersion: number;
      /** the run's model tier — the api scales the estimate by the tier's rate ratio between tables. */
      modelTier: string;
    }) => Promise<{ estimateCredits: number; capCredits: number }>;
  },
): Promise<RepriceResult> {
  const run = (
    await tx.query(
      "select estimate_credits, cap_credits, rate_table_version, model_tier from runs where id = $1 for update",
      [args.runId],
    )
  ).rows[0] as
    | { estimate_credits: number; cap_credits: number; rate_table_version: number; model_tier: string }
    | undefined;
  if (!run) throw new Error(`reprice: unknown run ${args.runId}`);
  const fromVersion = Number(run.rate_table_version);
  if (fromVersion === CURRENT_RATE_TABLE_VERSION) {
    return {
      changed: false,
      fromVersion,
      toVersion: fromVersion,
      newEstimateCredits: Number(run.estimate_credits),
      newCapCredits: Number(run.cap_credits),
      deltaCredits: 0,
    };
  }
  const next = await args.reestimate({
    id: args.runId,
    estimateCredits: Number(run.estimate_credits),
    capCredits: Number(run.cap_credits),
    rateTableVersion: fromVersion,
    modelTier: run.model_tier,
  });
  await tx.query(
    `update runs set estimate_credits=$2, cap_credits=$3, rate_table_version=$4,
        repriced_at=now(), repriced_from_version=$5 where id=$1`,
    [args.runId, next.estimateCredits, next.capCredits, CURRENT_RATE_TABLE_VERSION, fromVersion],
  );
  return {
    changed: true,
    fromVersion,
    toVersion: CURRENT_RATE_TABLE_VERSION,
    newEstimateCredits: next.estimateCredits,
    newCapCredits: next.capCredits,
    deltaCredits: next.capCredits - Number(run.cap_credits),
  };
}
