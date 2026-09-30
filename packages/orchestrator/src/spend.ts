// `runs.spent_credits` reconciliation (PRB.16b — the PRB.16 carry-over finding). The field accumulates
// each committed step's credits (`commitStep`), so a run that reaches a terminal state MID-phase — a
// cancel, a cap-402, a terminal failure — leaves the row at its last committed figure (0 when nothing
// committed) while `usage_records` already holds the real spend. Every terminal settle reconciles the
// field from the usage rows of record: the proxy's `{source:'proxy'}` rows are the meter of record
// (§12.7); `sdk_estimate` (the crosscheck's SDK side) stands in next, then the display rows
// (`sdk_stream`, `provider_report`) — never summed together, they measure the same tokens. `greatest()`
// makes the write monotone — a reconciled figure is never lowered by a second settle and a mid-flight
// call can only fold usage IN.

import type { SqlClient } from "./tx.js";

/**
 * Fold the run's recorded usage into `runs.spent_credits` and return the reconciled figure. Safe to
 * call inside any tenant-scoped terminal transaction; idempotent and monotone (greatest).
 */
export async function reconcileRunSpend(exec: SqlClient, runId: string): Promise<number> {
  const sums = (
    await exec.query(
      `select source, coalesce(sum(credits), 0) as credits
         from usage_records where run_id = $1 group by source`,
      [runId],
    )
  ).rows as { source: string; credits: number | string }[];
  let proxy = 0;
  let estimate = 0;
  let other = 0;
  for (const r of sums) {
    const n = Number(r.credits);
    if (r.source === "proxy") proxy += n;
    else if (r.source === "sdk_estimate") estimate += n;
    else other += n;
  }
  // the meter of record wins; the SDK figure of record (`sdk_estimate` — the crosscheck's SDK side)
  // stands in next, then the display rows (`sdk_stream`/`provider_report`). Never sum the SDK twins —
  // stream and estimate measure the same phase's tokens.
  const usage = proxy > 0 ? proxy : estimate > 0 ? estimate : other;
  const res = await exec.query(
    "update runs set spent_credits = greatest(spent_credits, $2) where id = $1 returning spent_credits",
    [runId, usage],
  );
  return (res.rows[0] as { spent_credits: number } | undefined)?.spent_credits ?? 0;
}
