// Debit admission mode (ECON.1; REQ-SPEC-32(a); ADR-031 burn classification). `committed` = the launched
// semantics — a phase commit debits max(pod claim, metered catch-up) and the terminal settle only tops up;
// `metered` = "charge what we meter" — every charging path settles to exactly `min(Σ proxy-metered, cap)`:
// commits debit the metered remainder only, a completed run's over-debit refunds (`metered_over_debit`),
// and a user-cancelled run settles to metered instead of release-only. Failed runs are identical in both
// modes (net debits refund; the whole metered burn absorbs as platform COGS).
//
// Fail-closed to `committed`: an unknown/absent value parses to `committed` — a deploy typo can never
// silently switch the platform to metered billing (the same posture as `parsePurchaseMode`).

export const DEBIT_MODES = ["committed", "metered"] as const;
export type DebitMode = (typeof DEBIT_MODES)[number];

/** Parse a stage-config/env value; unknown or unset ⇒ `committed` (the launched default). */
export function parseDebitMode(raw: string | undefined | null): DebitMode {
  return raw === "metered" ? "metered" : "committed";
}
