// The one place that maps a ledger entry to its effect on `credit_balances` (§11.4; REQ-SPEC-24). Every write
// path derives its balance upsert from here, and the nightly assertion (`assertBalances`) rebuilds each
// account's balances by summing this over its ledger rows — so the maintained table and the ledger can never
// drift without the assertion catching it (a divergence means a write bypassed this function).

export type LedgerKind = "grant" | "hold" | "debit" | "release" | "expire" | "refund" | "adjustment";

export const LEDGER_KINDS: readonly LedgerKind[] = [
  "grant",
  "hold",
  "debit",
  "release",
  "expire",
  "refund",
  "adjustment",
] as const;

/** Signed deltas a `credits`-positive ledger entry applies to one `credit_balances` (account, bucket) row. */
export interface BalanceDelta {
  readonly availableDelta: number;
  readonly heldDelta: number;
}

/**
 * The balance effect of one ledger entry (its `credits` field is always a positive magnitude; the sign lives
 * here). §14.4 accounting:
 *  - `grant`   +available            (a purchase / plan grant / promo credits enter the balance)
 *  - `hold`    −available +held      (reserve the cap under the account lock; money is not yet spent)
 *  - `debit`   −held                 (a committed phase spends its reservation; total balance falls)
 *  - `release` −held +available      (return the unused reservation at a terminal state)
 *  - `refund`  +available            (give back a debited phase on a failed/refused/cancelled run)
 *  - `expire`  −available            (unspent credits past their bucket's expiry are removed)
 *  - `adjustment(absorbed)` no effect on the user's balance — the platform absorbs the cap overrun into the
 *    variance reserve (REQ-RUN-12); it is a bookkeeping row, not a charge.
 */
export function balanceEffect(kind: LedgerKind, credits: number): BalanceDelta {
  const c = Math.max(0, Math.trunc(credits));
  switch (kind) {
    case "grant":
      return { availableDelta: c, heldDelta: 0 };
    case "hold":
      return { availableDelta: -c, heldDelta: c };
    case "debit":
      return { availableDelta: 0, heldDelta: -c };
    case "release":
      return { availableDelta: c, heldDelta: -c };
    case "refund":
      return { availableDelta: c, heldDelta: 0 };
    case "expire":
      return { availableDelta: -c, heldDelta: 0 };
    case "adjustment":
      return { availableDelta: 0, heldDelta: 0 };
  }
}
