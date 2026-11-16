// MAINT.6 (D-OPS.1-1; REQ-ARCH-30/REQ-ARCH-38) — the non-prod real-Resend-key path's pure decision,
// reshaped by RH-29 (271_R6SEC.3): previews bind the shared operator-seeded nonprod secret BY
// REFERENCE at a pinned version, never by copying its VALUE into Pulumi stack state.
// `preview-stack.mjs resend-pull` resolves the newest ENABLED version of
// `rhema-nonprod-resend-api-key` and writes PLAIN `rhema:nonprodResendVersion` config (a version
// number is not a secret); the program mounts `projects/<p>/secrets/<shared>/versions/<n>` on the
// worker (`RESEND_API_KEY_SECRET`) and grants its SA accessor on the shared container — the key
// material lives only in Secret Manager, exactly like the generated DSN set.
//
// The `rhema:resendApiKey` SECRET config (the copy-into-state path) is REMOVED: a value config on
// any stage is refused fail-loud — prod because prod's key stays operator-seeded out of band,
// non-prod because the shared-secret reference replaced it. `rhema:stripeSecret` has the same
// contract via `rhema:nonprodStripeVersion` (R6POST.2's pull).
//
// Pure module — index.ts consumes the plan; `resend-key.test.ts` pins the matrix.

import type { StageKind } from "../config/stages";

/** The shared, operator-seeded nonprod containers the preview pulls reference. Keep byte-identical
 *  to NONPROD_RESEND_SECRET / NONPROD_STRIPE_SECRET in scripts/live/preview-stack.mjs — the
 *  `.mjs` script can't import this module, so resend-key.test.ts pins the literals in its source. */
export const NONPROD_RESEND_SECRET_NAME = "rhema-nonprod-resend-api-key";
export const NONPROD_STRIPE_SECRET_NAME = "rhema-nonprod-stripe-secret";

/**
 * RH-29 — the prod sender identity a non-prod stack must never mount as its From address.
 * `hello@rhema.tools` is prod's committed sender (Pulumi.prod.yaml); previews send as
 * `previews@rhema.tools` — the Resend account key stays shared (a verified-domain constraint)
 * but no preview mail impersonates the prod sender.
 */
export const PROD_RESEND_SENDER = "hello@rhema.tools";
export const NONPROD_RESEND_SENDER = "previews@rhema.tools";

/**
 * The operator-secret ids that get deliberately-invalid placeholder versions on non-prod (OPS.1,
 * F-OPS.1-9 — a versionless secret named by a service env crash-loops it). Under the RH-29
 * shared-reference plan the placeholder version still stands on every container — the consumers
 * simply mount the shared secret's pinned version INSTEAD, so the placeholders are never read.
 */
export const NONPROD_OPERATOR_PLACEHOLDER_IDS = [
  "anthropic-api-key",
  "anthropic-admin-key",
  "resend-api-key",
  "ops-alert-webhook-url",
  "stripe-secret",
  "stripe-webhook-secret",
  "google-oauth-client-secret",
  "user-content-signing-key",
] as const;

/** Which mail/stripe secret mount the program wires for a stage kind × config posture. */
export type ResendVersionPlan =
  | "refused" // prod + either config set — the caller throws before any resource is created
  | "copied" // non-prod + the VALUE config set — refused too (RH-29: values never enter state)
  | "operator" // prod + unset — the operator-seeded version stands (the program writes nothing)
  | "shared" // non-prod + version config — mount the shared secret's pinned version by reference
  | "placeholder"; // non-prod + unset — the OPS.1 placeholder stands (mail.send no-ops)

export function resendVersionPlan(
  kind: StageKind,
  opts: { valueSet: boolean; versionSet: boolean },
): ResendVersionPlan {
  if (kind === "prod") return opts.valueSet || opts.versionSet ? "refused" : "operator";
  if (opts.valueSet) return "copied";
  return opts.versionSet ? "shared" : "placeholder";
}
