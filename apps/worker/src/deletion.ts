// Deletion & retention decision logic (REQ-ARCH-28/29; REQ-ACCT-4), pure and unit-tested.
// P0.01 owns the *policy*; the worker job handlers in jobs.ts invoke it. The deletion UI is P1.20;
// audit is P1.22.
//
//  - Project deletion: tombstone -> 30-day purge -> S3 lifecycle delete.
//  - Account deletion: 14-day grace, then hard-delete content + PII, RETAINING anonymized ledger
//    rows and the Stripe customer per tax law.

const DAY_MS = 24 * 60 * 60 * 1000;

export const PROJECT_PURGE_AFTER_DAYS = 30;
export const ACCOUNT_GRACE_DAYS = 14;

/** Whole days elapsed between two instants (floored, never negative). */
export function daysBetween(earlier: Date, later: Date): number {
  return Math.max(0, Math.floor((later.getTime() - earlier.getTime()) / DAY_MS));
}

/**
 * A tombstoned project purges once it has sat tombstoned for the full grace window.
 * @param tombstonedAt when the project was tombstoned
 * @param now clock (injectable so tests can advance it)
 */
export function shouldPurgeProject(
  tombstonedAt: Date,
  now: Date,
  purgeAfterDays: number = PROJECT_PURGE_AFTER_DAYS,
): boolean {
  return daysBetween(tombstonedAt, now) >= purgeAfterDays;
}

export type AccountDeletionPhase = "grace" | "hard-delete";

export interface AccountDeletionPlan {
  phase: AccountDeletionPhase;
  /** What survives a hard delete (tax/audit law) — everything else is destroyed. */
  retain: ReadonlyArray<"anonymized-ledger-rows" | "stripe-customer">;
}

/** Decide whether an account under deletion is still in grace or ready to hard-delete. */
export function accountDeletionPlan(
  deletionRequestedAt: Date,
  now: Date,
  graceDays: number = ACCOUNT_GRACE_DAYS,
): AccountDeletionPlan {
  const phase: AccountDeletionPhase =
    daysBetween(deletionRequestedAt, now) >= graceDays ? "hard-delete" : "grace";
  return { phase, retain: ["anonymized-ledger-rows", "stripe-customer"] };
}
