// RES.2 (REQ-SPEC-31(3); ADR-015) — the run-level delivery label and its platform-fault accounting class.
// A Review whose verification ends with ZERO coverage — no Tier-1/2 ("checkable") claim carrying a source
// that actually fetched — while its inventory held ≥1 checkable claim delivers *Unverified*: the label sits
// above the verdict on the run card, dossier and delivery email; its verification + discourse debits refund
// under the platform-fault class; the run never counts as a success; a consumed trial entitlement restores.
//
//   *Unverified* is a RUN-level delivery label — distinct from the claim verdict `unverifiable`
//   (Appendix D.2). Every claim in an Unverified Review is still `unverifiable`; the run-level label says
//   WHY (the platform could not fetch any source), and it is computed here on server-owned facts — the
//   delivered claim rows AFTER the Path-B citation strip (a cited url absent from the proxy fetch log is
//   already dropped) — never from narrative text or model assertions.

import { z } from "zod";

/** The run-level delivery labels. v1 has exactly one; the class leaves room for later fault labels. */
export const DELIVERY_LABEL_UNVERIFIED = "unverified" as const;
export type DeliveryLabel = typeof DELIVERY_LABEL_UNVERIFIED;

/** Display copy for the label — surfaces render THIS string above the verdict (D.2 reserved vocabulary). */
export const DELIVERY_LABEL_DISPLAY: Record<DeliveryLabel, string> = {
  unverified: "Unverified",
};

/** The persisted shape of `runs.delivery` (migration 0047) — write-once classification plus the
 *  platform-fault settlement markers merged in after the delivery transaction commits, so a retried
 *  settlement is exactly-once (ADR-024). `refundedCredits`/`platformFaultSettledAt` gate the refund
 *  replay, `trialRestoredAt` gates the entitlement restore, `alerted` gates the ops page. */
export const runDeliverySchema = z.object({
  label: z.literal(DELIVERY_LABEL_UNVERIFIED),
  /** Tier-1/2 claims in the delivered inventory (the "checkable" denominator). */
  checkableClaims: z.number().int().nonnegative(),
  /** Checkable claims carrying ≥1 source that fetched (post-strip `claim_sources` truth). */
  coveredClaims: z.number().int().nonnegative(),
  refundedCredits: z.number().int().nonnegative().optional(),
  platformFaultSettledAt: z.string().optional(),
  trialRestoredAt: z.string().optional(),
  alerted: z.boolean().optional(),
});
export type RunDelivery = z.infer<typeof runDeliverySchema>;

/**
 * Read the persisted run-level label off `runs.delivery` (migration 0047). Every surface calls THIS —
 * the label is write-once and read, never recomputed (invariant 6). Returns null for an unlabelled
 * (ordinary) or malformed row.
 */
export function deliveryLabelFromRow(delivery: unknown): DeliveryLabel | null {
  if (delivery == null) return null;
  let raw: unknown = delivery;
  if (typeof delivery === "string") {
    try {
      raw = JSON.parse(delivery) as unknown;
    } catch {
      return null;
    }
  }
  const parsed = runDeliverySchema.safeParse(raw);
  return parsed.success ? parsed.data.label : null;
}

/** The coverage counts the predicate runs on. */
export interface VerificationCoverage {
  readonly checkableClaims: number;
  readonly coveredClaims: number;
}

/** Tier-1 (empirical) / Tier-2 (external-consistency) claims are the checkable inventory (§12.8). */
export function isCheckableClaimTier(tier: number | null | undefined): boolean {
  return tier === 1 || tier === 2;
}

/** The REQ-SPEC-31(3) predicate: zero coverage AND a non-empty checkable inventory. A Review with no
 *  Tier-1/2 claim at all is NOT Unverified — nothing was checkable, so nothing failed to check. */
export function isUnverifiedDelivery(coverage: VerificationCoverage): boolean {
  return coverage.checkableClaims > 0 && coverage.coveredClaims === 0;
}

/**
 * The one success predicate every accounting surface shares (requirement 5): a run counts as a success
 * iff it completed AND carries no Unverified label. The SLO numerator, the estimator-refit sample, the
 * `run.completed` analytics emission, and claims/success accounting all read this — an Unverified run is
 * in the denominator (it was attempted and it was a platform fault), never the numerator.
 */
export function isSuccessfulDelivery(input: {
  readonly state: string;
  readonly deliveryLabel?: string | null;
}): boolean {
  return input.state === "completed" && input.deliveryLabel !== DELIVERY_LABEL_UNVERIFIED;
}

// ---- platform-fault refund class (requirement 3) --------------------------------------------------

/**
 * The ledger-row `reason` prefix for the platform-fault refund class. Rows read
 * `platform_fault:<cause>` — e.g. `platform_fault:zero_coverage` (the Unverified refund) and
 * `platform_fault:research_preflight_failed` (RES.1's preflight default refund, folded into the class).
 * The prefix keeps the class greppable and lets `isPlatformFaultRefund` stay a pure predicate.
 */
export const PLATFORM_FAULT_REASON_PREFIX = "platform_fault:";
export const PLATFORM_FAULT_ZERO_COVERAGE = `${PLATFORM_FAULT_REASON_PREFIX}zero_coverage` as const;
export const PLATFORM_FAULT_RESEARCH_PREFLIGHT =
  `${PLATFORM_FAULT_REASON_PREFIX}research_preflight_failed` as const;

export function platformFaultReason(cause: string): string {
  return `${PLATFORM_FAULT_REASON_PREFIX}${cause}`;
}

/**
 * True when a credit_ledger row is a platform-fault refund — the class DEF.4's user-refund window must
 * never count (a platform-fault refund is the platform paying for its own failure, not the user
 * exercising a refund) and resume must never re-debit.
 */
export function isPlatformFaultRefund(entry: {
  readonly kind: string;
  readonly reason?: string | null;
}): boolean {
  return (
    entry.kind === "refund" &&
    typeof entry.reason === "string" &&
    entry.reason.startsWith(PLATFORM_FAULT_REASON_PREFIX)
  );
}
