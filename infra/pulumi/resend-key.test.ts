// MAINT.6 (D-OPS.1-1; REQ-ARCH-30/REQ-ARCH-38) — the non-prod real-Resend-key path's contract,
// reshaped by RH-29 (271_R6SEC.3): `rhema:nonprodResendVersion` (a plain version-number config)
// binds the shared nonprod secret BY REFERENCE; the value-carrying `rhema:resendApiKey` /
// `rhema:stripeSecret` configs are refused on every stage (prod keeps its operator-seeded
// versions). index.ts/compute.ts are Pulumi programs (not pure functions), so the consumed
// halves are structural assertions over the source — the same style as compute.test.ts.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  NONPROD_OPERATOR_PLACEHOLDER_IDS,
  NONPROD_RESEND_SECRET_NAME,
  NONPROD_RESEND_SENDER,
  NONPROD_STRIPE_SECRET_NAME,
  PROD_RESEND_SENDER,
  resendVersionPlan,
} from "./resend-key.js";

const INDEX_SRC = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8");
const COMPUTE_SRC = readFileSync(fileURLToPath(new URL("./compute.ts", import.meta.url)), "utf8");
const PULL_SRC = readFileSync(
  fileURLToPath(new URL("../../scripts/live/preview-stack.mjs", import.meta.url)),
  "utf8",
);

const plan = (kind: "prod" | "preview" | "dev", opts: { valueSet: boolean; versionSet: boolean }) =>
  resendVersionPlan(kind, opts);

describe("resendVersionPlan — the stage-kind × config matrix (RH-29)", () => {
  it("prod + anything set ⇒ 'refused' — fail-closed before any resource", () => {
    expect(plan("prod", { valueSet: true, versionSet: false })).toBe("refused");
    expect(plan("prod", { valueSet: false, versionSet: true })).toBe("refused");
    expect(plan("prod", { valueSet: true, versionSet: true })).toBe("refused");
  });
  it("prod + unset ⇒ 'operator' — the operator-seeded version stands, nothing written", () => {
    expect(plan("prod", { valueSet: false, versionSet: false })).toBe("operator");
  });
  it("non-prod + VALUE config set ⇒ 'copied' — refused on every stage (values never enter state)", () => {
    expect(plan("preview", { valueSet: true, versionSet: false })).toBe("copied");
    expect(plan("dev", { valueSet: true, versionSet: true })).toBe("copied");
  });
  it("non-prod + version config ⇒ 'shared' — the pinned shared-secret reference mounts", () => {
    expect(plan("preview", { valueSet: false, versionSet: true })).toBe("shared");
    expect(plan("dev", { valueSet: false, versionSet: true })).toBe("shared");
  });
  it("non-prod + unset ⇒ 'placeholder' — today's OPS.1 posture, mail.send stays a no-op", () => {
    expect(plan("preview", { valueSet: false, versionSet: false })).toBe("placeholder");
    expect(plan("dev", { valueSet: false, versionSet: false })).toBe("placeholder");
  });
});

describe("NONPROD_OPERATOR_PLACEHOLDER_IDS — the OPS.1 placeholder set, verbatim", () => {
  it("is exactly the eight operator-secret ids OPS.1 placeholders", () => {
    expect([...NONPROD_OPERATOR_PLACEHOLDER_IDS].sort()).toEqual(
      [
        "anthropic-admin-key",
        "anthropic-api-key",
        "google-oauth-client-secret",
        "ops-alert-webhook-url",
        "resend-api-key",
        "stripe-secret",
        "stripe-webhook-secret",
        "user-content-signing-key",
      ].sort(),
    );
  });
});

describe("index.ts — the RH-29 reference path + refusals (structural)", () => {
  it("reads the pinned versions as PLAIN config (a version number is not a secret)", () => {
    expect(INDEX_SRC).toContain('rhemaConfig.get("nonprodResendVersion")');
    expect(INDEX_SRC).toContain('rhemaConfig.get("nonprodStripeVersion")');
    expect(INDEX_SRC).not.toMatch(/rhemaConfig\.getSecret\(["']nonprod/);
  });
  it("refuses a non-numeric pin — `latest` or a resource name fails closed", () => {
    expect(INDEX_SRC).toMatch(/\^\\d\+\$/);
  });
  it("refuses the VALUE configs on every stage — prod (operator-seeded) AND the copied arm", () => {
    expect(INDEX_SRC).toContain('resendPlan === "refused"');
    expect(INDEX_SRC).toContain('resendPlan === "copied"');
    expect(INDEX_SRC).toContain('stripePlan === "refused"');
    expect(INDEX_SRC).toContain('stripePlan === "copied"');
    expect(INDEX_SRC.indexOf('resendPlan === "refused"')).toBeLessThan(
      INDEX_SRC.indexOf("createNetwork("),
    );
  });
  it("no SecretVersion is ever written from a pulled config value", () => {
    expect(INDEX_SRC).not.toContain("secretData: resendApiKey");
    expect(INDEX_SRC).not.toContain("secretData: stripeSecretConfig");
    expect(INDEX_SRC).not.toContain("resend-api-key-v1");
    expect(INDEX_SRC).not.toContain("stripe-secret-v1");
  });
  it("mounts the shared secrets' pinned versions + grants the consumer SAs accessor on them", () => {
    // index.ts composes the pinned resources from the exported NAME constants (the literal
    // container names live in resend-key.ts — preview-stack.mjs parity is pinned below).
    expect(INDEX_SRC).toContain("NONPROD_RESEND_SECRET_NAME");
    expect(INDEX_SRC).toContain("NONPROD_STRIPE_SECRET_NAME");
    expect(INDEX_SRC).toContain(`/versions/\${nonprodResendVersion}`);
    expect(INDEX_SRC).toContain(`/versions/\${nonprodStripeVersion}`);
    expect(INDEX_SRC).toContain("roles/secretmanager.secretAccessor");
    expect(INDEX_SRC).toContain("worker-reads-shared-resend");
    expect(INDEX_SRC).toContain("-reads-shared-stripe");
  });
  it("refuses prod's sender identity on non-prod stages (the nonprod-only sender arm)", () => {
    expect(INDEX_SRC).toContain("PROD_RESEND_SENDER");
    expect(INDEX_SRC).toContain("NONPROD_RESEND_SENDER");
    expect(INDEX_SRC).toMatch(/is refused on non-prod/);
    expect(PROD_RESEND_SENDER).toBe("hello@rhema.tools");
    expect(NONPROD_RESEND_SENDER).toBe("previews@rhema.tools");
  });
});

describe("compute.ts — the shared-reference mounts (structural)", () => {
  it("the shared ref wins over requires() on both consumers' env mounts", () => {
    expect(COMPUTE_SRC).toContain("args.resendSecretVersion");
    expect(COMPUTE_SRC).toContain("args.stripeSecretVersion");
    expect(COMPUTE_SRC).toContain("RESEND_API_KEY_SECRET");
    expect(COMPUTE_SRC).toContain("STRIPE_SECRET_KEY_NAME");
    // the arg arm precedes the requires() arm in both mount expressions
    expect(COMPUTE_SRC.indexOf("args.resendSecretVersion")).toBeLessThan(
      COMPUTE_SRC.indexOf('requires("resend-api-key")'),
    );
    expect(COMPUTE_SRC.indexOf("args.stripeSecretVersion")).toBeLessThan(
      COMPUTE_SRC.indexOf('requires("stripe-secret")'),
    );
    // index.ts passes the refs under the shared plan
    expect(INDEX_SRC).toContain("resendSecretVersion: sharedResendRef");
    expect(INDEX_SRC).toContain("stripeSecretVersion: sharedStripeRef");
  });
});

describe("preview-stack.mjs parity — the pull no longer copies secret values", () => {
  it("names the same shared containers resend-key.ts exports", () => {
    expect(PULL_SRC).toContain(`"${NONPROD_RESEND_SECRET_NAME}"`);
    expect(PULL_SRC).toContain(`"${NONPROD_STRIPE_SECRET_NAME}"`);
  });
  it("never `secrets versions access`es (metadata only) and never writes --secret config", () => {
    expect(PULL_SRC).not.toContain('"versions", "access"');
    expect(PULL_SRC).not.toContain("versions access");
    expect(PULL_SRC).not.toContain("config\", \"set\", \"--secret");
    expect(PULL_SRC).not.toContain("rhema:resendApiKey");
    expect(PULL_SRC).not.toContain("rhema:stripeSecret");
  });
  it("sets the plain version configs + the nonprod sender", () => {
    expect(PULL_SRC).toContain("rhema:nonprodResendVersion");
    expect(PULL_SRC).toContain("rhema:nonprodStripeVersion");
    expect(PULL_SRC).toContain(`"${NONPROD_RESEND_SENDER}"`);
  });
});
