// apps/web/src/billing-copy.ts — the billing surface's shared COPY projections (SPA.16 —
// REQ-SAFE-10 leaf-scan shape, the `approval-settings.ts`/`state-map.ts` precedent). The
// ?notice= code→copy map lives here so the SSR document path (server.ts) and the React
// twin (spa/surfaces/billing.tsx) can never drift on which string a code lands — one
// mapper, both renderers (design/22 F10). `billingFailureCode` stays server-side — it
// inspects `ApiError` instances, a value-level api-client import the SPA bundle must
// never carry.

import { COPY } from "./copy.js";

/**
 * BILL.3 (REQ-BILL-16) — map a billing POST failure's stable api code to truthful copy. The generic
 * "temporarily unavailable" line is now ONLY the genuinely-transient answer (Stripe unreachable,
 * or an unknown failure); every classified refusal gets its own sentence so the user knows what
 * actually happened. Unknown codes fall back to the generic note — never a blank page.
 */
export function billingNoticeFor(code: string | undefined): string {
  switch (code) {
    case "purchase_closed":
      return COPY.billing.purchasePausedNote;
    case "topups_require_plan":
      return COPY.billing.topupRequiresPlanNote;
    case "first_month_cap":
      return COPY.billing.firstMonthCapNote;
    case "plan_waitlisted":
      return COPY.billing.planWaitlistedNote;
    case "no_stripe_customer":
      return COPY.billing.noStripeCustomerNote;
    case "stripe_rejected":
      return COPY.billing.stripeRejectedNote;
    case "stripe_unconfigured":
    case "stripe_credentials_unconfigured":
      return COPY.billing.stripeUnconfiguredNote;
    case "change":
      return COPY.billing.changeFailedNote;
    case "cancel":
      return COPY.billing.cancelFailedNote;
    case "autoreload":
      return COPY.billing.autoReloadFailedNote;
    case "waitlist":
      return COPY.billing.waitlistFailedNote;
    case "checkout":
    case "portal":
    case "stripe_unavailable":
    default:
      return COPY.billing.stripeDownNote;
  }
}
