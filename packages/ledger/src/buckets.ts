// Bucket vocabulary + consumption order (REQ-BILL-15; §14.6) and the pure draw helper the hold/debit/release
// paths share. Kept free of SQL so the consumption-order property (AC4) is a deterministic unit test.

export type HoldBucket = "included" | "topup" | "trial_pocket" | "daily" | "promo";

/**
 * The five credit buckets, in the order credits are consumed (REQ-BILL-15; §14.6):
 * trial/daily → promo → included (rolled-over then this cycle's, ordered by expiry) → top-up. `credit_balances`
 * collapses rolled-over and this-cycle `included` into one bucket (one `available` figure), so expiry WITHIN a
 * bucket is realized by the `expire` sweep (`expireCredits`) reducing `available` before consumption, never by a
 * sub-bucket split — the order below is the between-bucket order, front-loading the soonest-expiring buckets.
 */
export const CONSUMPTION_ORDER: readonly HoldBucket[] = [
  "trial_pocket",
  "daily",
  "promo",
  "included",
  "topup",
] as const;

export const ALL_BUCKETS: readonly HoldBucket[] = CONSUMPTION_ORDER;

export function isHoldBucket(v: string): v is HoldBucket {
  return (ALL_BUCKETS as readonly string[]).includes(v);
}

/** One bucket's contribution to a draw. */
export interface BucketDraw {
  readonly bucket: HoldBucket;
  readonly credits: number;
}

export interface DrawResult {
  /** Per-bucket amounts to take, in consumption order (only buckets that contributed a positive amount). */
  readonly draws: readonly BucketDraw[];
  /** Total taken across all buckets (= `amount` unless there was a shortfall). */
  readonly drawn: number;
  /** How much of `amount` could NOT be covered (> 0 ⇒ insufficient). */
  readonly shortfall: number;
}

/**
 * Draw `amount` credits from `available` (a per-bucket map) in consumption order (REQ-BILL-15). A hold draws
 * from `available`, a debit/release draws from a run's per-bucket `held` — the ordering is identical, so both
 * go through here. Pure and total: negative or missing bucket amounts count as 0; `amount ≤ 0` draws nothing.
 */
export function drawFromBuckets(
  available: Partial<Record<HoldBucket, number>>,
  amount: number,
): DrawResult {
  const draws: BucketDraw[] = [];
  let remaining = Math.max(0, Math.trunc(amount));
  for (const bucket of CONSUMPTION_ORDER) {
    if (remaining <= 0) break;
    const have = Math.max(0, Math.trunc(available[bucket] ?? 0));
    const take = Math.min(remaining, have);
    if (take > 0) {
      draws.push({ bucket, credits: take });
      remaining -= take;
    }
  }
  const target = Math.max(0, Math.trunc(amount));
  return { draws, drawn: target - remaining, shortfall: remaining };
}
