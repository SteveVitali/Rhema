// The `expire` op (REQ-BILL-15; §14.6): unspent credits past their bucket's expiry are removed from
// `available`. This module owns the PRIMITIVE; the rollover POLICY (included ≤ 2× monthly, reset timing, the
// 7-day warning) is P1.16's billing-flows work. Held credits are never expired — a hold moves them out of
// `available`, so this sweep cannot touch a reservation (REQ-SPEC-24.3).

import type { SqlClient } from "@rhema/orchestrator";
import { applyLedgerEntry, type EntryDeps } from "./entries.js";
import type { HoldBucket } from "./buckets.js";

/**
 * Expire up to `credits` from one (account, bucket), clamped to the currently-available balance so the
 * `check(available >= 0)` constraint is never violated. Returns the amount actually expired. Idempotent on
 * `idempotencyKey`.
 */
export async function expireCredits(
  tx: SqlClient,
  deps: EntryDeps,
  args: {
    workspaceId: string;
    billingAccountId: string;
    bucket: HoldBucket;
    credits: number;
    idempotencyKey: string;
    reason?: string;
  },
): Promise<number> {
  const balanceRow = (
    await tx.query(
      "select coalesce(available, 0)::int as a from credit_balances where billing_account_id = $1 and bucket = $2",
      [args.billingAccountId, args.bucket],
    )
  ).rows[0] as { a: number } | undefined;
  const available = Number(balanceRow?.a ?? 0);
  const amount = Math.min(Math.max(0, Math.trunc(args.credits)), available);
  if (amount <= 0) return 0;
  await applyLedgerEntry(tx, deps, {
    workspaceId: args.workspaceId,
    billingAccountId: args.billingAccountId,
    kind: "expire",
    credits: amount,
    bucket: args.bucket,
    source: "system",
    reason: args.reason ?? "expired",
    idempotencyKey: args.idempotencyKey,
  });
  return amount;
}
