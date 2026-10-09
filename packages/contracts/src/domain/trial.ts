// P1.16 — the trial entitlement state machine + unlock/abuse contracts (§14.3; REQ-GROWTH-10/15).
// The account-level trial_state machine is distinct from the entitlement row's own `state` enum
// (the entitlement is the instrument; the account machine is the lifecycle). Both are validated
// here so the api/worker/admin-cli agree on the vocabulary.

/** Account-level trial lifecycle (§14.3): pending → active|denied → used → free. */
export const TRIAL_ACCOUNT_STATES = [
  "trial_pending", // signed up; entitlement locked until the first run claims it (identity-before-spend)
  "trial_active", // unlocked: entitlement usable, pocket granted, 14-day clock running
  "trial_denied", // unlock refused by abuse controls (fingerprint reuse / over the daily ceiling)
  "trial_used", // entitlement consumed; still inside the 14-day window
  "free", // window closed (expired or converted to a paid plan → the plan is the state now)
] as const;
export type TrialAccountState = (typeof TRIAL_ACCOUNT_STATES)[number];

/** The entitlement row's own state — widened by migration 0036 for locked/revoked/converted. */
export const TRIAL_ENTITLEMENT_STATES = [
  "locked", // created at signup; cannot hold until the unlock gate passes
  "unused", // unlocked and claimable
  "consumed", // claimed by a run (the free Review)
  "expired", // window closed unspent
  "revoked", // voided by the workspace kill switch
  "converted", // traded for the 800-credit promo grant on upgrade
] as const;
export type TrialEntitlementState = (typeof TRIAL_ENTITLEMENT_STATES)[number];

/**
 * ACT.1 — the trial go-live audience (pricing.json `trial.audience`): `off` (the claim and the
 * first-spend unlock serve nobody), `test_tenants` (JOURNEY.1's flagged `is_test` workspaces only —
 * the flag is operator-set, never user-settable), `everyone` (the operator's launch flip).
 */
export const TRIAL_AUDIENCES = ["off", "test_tenants", "everyone"] as const;
export type TrialAudience = (typeof TRIAL_AUDIENCES)[number];

/** The unlock decision recorded in trial_unlock_checks (REQ-GROWTH-10: every decision auditable). */
export const TRIAL_UNLOCK_DECISIONS = ["allow", "challenge", "deny", "paused"] as const;
export type TrialUnlockDecision = (typeof TRIAL_UNLOCK_DECISIONS)[number];

/** What the unlock gate evaluated — logged as a row per first-spend attempt. */
export interface TrialUnlockEvidence {
  readonly billingAccountId: string;
  readonly userId?: string;
  readonly emailDomain?: string;
  readonly disposableDomain: boolean;
  readonly fingerprintHash?: string;
  /** Accounts already bound to this fingerprint (one trial per fingerprint). Default 0 — the gate fills it. */
  readonly fingerprintSeen?: number;
  /** Injectable ASN/IP risk score in [0,1] — the api supplies the scorer. */
  readonly asnRisk?: number;
}

export interface TrialUnlockResult {
  readonly decision: TrialUnlockDecision;
  /** Human-readable reason for the audit row (e.g. "fingerprint_seen", "disposable_domain"). */
  readonly reason: string;
}

/**
 * Pure unlock decision (§14.3 abuse controls): identity-before-spend. Deny when the fingerprint was
 * already trialed or the domain is disposable; challenge when the risk score clears the threshold;
 * `paused` when the GLOBAL daily trial-spend ceiling is exhausted (retryable — not a denial).
 */
export function decideTrialUnlock(
  ev: TrialUnlockEvidence,
  opts: { riskThreshold: number; ceilingExhausted: boolean },
): TrialUnlockResult {
  if ((ev.fingerprintSeen ?? 0) > 0) return { decision: "deny", reason: "fingerprint_seen" };
  if (ev.disposableDomain) return { decision: "deny", reason: "disposable_domain" };
  if (opts.ceilingExhausted) return { decision: "paused", reason: "daily_ceiling" };
  if ((ev.asnRisk ?? 0) >= opts.riskThreshold) return { decision: "challenge", reason: "risk_threshold" };
  return { decision: "allow", reason: "ok" };
}
