// MAINT.6 (D-OPS.1-1; REQ-ARCH-30/REQ-ARCH-38) — the non-prod real-Resend-key path's pure decision.
// `rhema:resendApiKey` is a Pulumi SECRET config set by `scripts/live/preview-stack.mjs resend-pull`
// (the shared operator secret `rhema-nonprod-resend-api-key`, pulled gcloud→pulumi over stdin — the
// value never enters argv, a log line, or the repo). On a non-prod stack the program writes it as
// the real `resend-api-key` SecretVersion IN PLACE OF the placeholder so the worker's mail.send
// transport can mint real magic links into the pinned test mailbox. Prod refuses the config —
// fail-closed: prod's key stays operator-seeded out of band, and no config path can ever write a
// non-prod key onto prod.
//
// Pure module — index.ts consumes the plan; `resend-key.test.ts` pins the matrix.

import type { StageKind } from "../config/stages";

/**
 * The operator-secret ids that get deliberately-invalid placeholder versions on non-prod (OPS.1,
 * F-OPS.1-9 — a versionless secret named by a service env crash-loops it). `resend-api-key` is
 * removed from the written set when `rhema:resendApiKey` supplies the real key.
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

/** Which `resend-api-key` version the program writes for a stage kind × config presence. */
export type ResendVersionPlan =
  | "refused" // prod + config set — the caller throws before any resource is created
  | "operator" // prod + unset — the operator-seeded version stands (the program writes nothing)
  | "real" // non-prod + set — the config value becomes the SecretVersion
  | "placeholder"; // non-prod + unset — the OPS.1 placeholder stands (mail.send no-ops)

export function resendVersionPlan(kind: StageKind, configSet: boolean): ResendVersionPlan {
  if (kind === "prod") return configSet ? "refused" : "operator";
  return configSet ? "real" : "placeholder";
}
