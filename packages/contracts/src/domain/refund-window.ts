// DEF.4 — the §14.4 user refund window's shared vocabulary (BL-30; REQ-SPEC-24(6); REQ-IDE-18;
// REQ-SPEC-30). One module owns: the fail-closed feature flag, the ledger `reason` code for the
// user-refund class (distinct from RES.2's `platform_fault:*`), the request-state vocabulary the
// `user_refund_requests` CHECK mirrors, the eligible run-state set, and the UTC calendar-quarter key
// the per-account allowance counts against (ADR-07x).

import { z } from "zod";

// ---- the feature flag (refundWindow) ----------------------------------------------------------------

/**
 * `off` (default on every stage until the product ruling flips it) ⇒ `POST /runs/:id/refund`
 * refuses `refund_closed` and the report carries no refund affordance. `test_tenants` admits only
 * JOURNEY.1-flagged workspaces (`workspaces.is_test` — server-set, never client-forgeable) so the
 * R9 journey can walk the real surface while production stays closed. `open` admits everyone.
 * Fail-closed: an unknown/absent value parses to `off` — a deploy typo can never silently open it
 * (the same posture as `parsePurchaseMode`).
 */
export const REFUND_WINDOW_MODES = ["off", "test_tenants", "open"] as const;
export type RefundWindowMode = (typeof REFUND_WINDOW_MODES)[number];

/** Parse a stage-config/env value (`REFUND_WINDOW_MODE`); unknown or unset ⇒ `off` (fail-closed). */
export function parseRefundWindowMode(raw: string | undefined | null): RefundWindowMode {
  return raw === "open" ? "open" : raw === "test_tenants" ? "test_tenants" : "off";
}

// ---- the refund class -------------------------------------------------------------------------------

/**
 * The §14.4 fairness window: a user-requested refund lands within this many days of the run's
 * terminal timestamp (`runs.ended_at` — `finished_at` does not exist; PR-O1).
 */
export const REFUND_WINDOW_DAYS = 7 as const;

/**
 * The ledger-row `reason` for the user-requested refund class — stamped on every `refund` row the
 * window writes (and the `cost.refunded` event's reason). A flat code, never `platform_fault:*`:
 * REQ-SPEC-32's named classes keep user refunds out of the platform-fault count, out of the
 * failed-run class, and out of the operator-adjustment class — each refund is one named kind.
 */
export const USER_REFUND_REASON = "user_window" as const;

/** True when a credit_ledger row is a user-window refund (the REQ-SPEC-24(6) re-debit class — a
 *  refunded phase re-charges if the run could resume). Platform-fault rows return false here AND
 *  under `isPlatformFaultRefund` — the classes are disjoint by construction. */
export function isUserWindowRefund(entry: { readonly kind: string; readonly reason?: string | null }): boolean {
  return entry.kind === "refund" && entry.reason === USER_REFUND_REASON;
}

// ---- the request vocabulary (mirrors the 0055 CHECK) ------------------------------------------------

export const USER_REFUND_REQUEST_STATES = ["refunded", "pending_review", "denied"] as const;
export type UserRefundRequestState = (typeof USER_REFUND_REQUEST_STATES)[number];

export const USER_REFUND_DECISIONS = ["auto_allowance", "admin_approve", "admin_deny"] as const;
export type UserRefundDecision = (typeof USER_REFUND_DECISIONS)[number];

/**
 * The run states a user refund may touch (ADR-07x): `completed` and `completed_partial` are
 * delivered; `cancelled` covers the stop-with-partials half of REQ-IDE-18 (a stopped run keeps its
 * committed phase debits until the user refunds them — REQ-DATA-34). `failed` is deliberately
 * absent: a failed run's credits settle through the platform's own refund paths (the failed-run
 * refund, `platform_fault:*`), never the user's allowance. Every state here is TERMINAL — a
 * refunded run provably cannot resume, so REQ-SPEC-24(6)'s re-debit rule is discharged by the
 * state machine (no outgoing edge), not by a code path.
 */
export const USER_REFUNDABLE_RUN_STATES = ["completed", "completed_partial", "cancelled"] as const;
export type UserRefundableRunState = (typeof USER_REFUNDABLE_RUN_STATES)[number];

/**
 * The allowance's quarter key — the UTC CALENDAR quarter of the request, `YYYYQn` (ADR-07x —
 * calendar, not rolling): "one automatic refund per billing account per quarter" reads
 * `count(state='refunded' where billing_account_id and quarter=key)`. `decision` records HOW a
 * refunded request resolved (auto-allowance vs admin-approved review) without widening the count.
 */
export function refundQuarterKey(at: Date): string {
  return `${at.getUTCFullYear()}Q${Math.floor(at.getUTCMonth() / 3) + 1}`;
}

// ---- wire shapes -------------------------------------------------------------------------------------

/** `POST /runs/:id/refund` → the response DTO the report's control renders (`state` the request
 *  landed in: refunded = the credits returned; pending_review = "sent for review"). */
export const userRefundResponseSchema = z.object({
  status: z.enum(["refunded", "pending_review"]),
  requestId: z.string(),
  credits: z.number().int().nonnegative(),
});
export type UserRefundResponse = z.infer<typeof userRefundResponseSchema>;

/** `GET /runs/:id/report` → `refundWindow` — present ONLY when the flag admits the caller's
 *  workspace; absent ⇒ the surface renders no refund affordance at all. `credits` is the refundable
 *  figure while `eligible`, else the refunded/requested amount. */
export const refundWindowBlockSchema = z.object({
  state: z.enum(["eligible", "refunded", "pending_review", "denied", "ineligible"]),
  credits: z.number().int().nonnegative(),
});
export type RefundWindowBlock = z.infer<typeof refundWindowBlockSchema>;
