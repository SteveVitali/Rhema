// MAINT.6 (D-OPS.1-1; REQ-ARCH-30/REQ-ARCH-38) — the non-prod real-Resend-key path's contract:
// `rhema:resendApiKey` becomes a real SecretVersion on non-prod, prod refuses the config
// fail-closed, and the placeholder-vs-real swap is pinned end to end. index.ts/compute.ts are
// Pulumi programs (not pure functions), so the consumed halves are structural assertions over
// the source — the same style as compute.test.ts.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { NONPROD_OPERATOR_PLACEHOLDER_IDS, resendVersionPlan } from "./resend-key.js";

const INDEX_SRC = readFileSync(fileURLToPath(new URL("./index.ts", import.meta.url)), "utf8");
const COMPUTE_SRC = readFileSync(fileURLToPath(new URL("./compute.ts", import.meta.url)), "utf8");

describe("resendVersionPlan — the stage-kind × config matrix", () => {
  it("prod + config set ⇒ 'refused' — fail-closed, the program must throw before any resource", () => {
    expect(resendVersionPlan("prod", true)).toBe("refused");
  });
  it("prod + unset ⇒ 'operator' — the operator-seeded version stands, nothing written", () => {
    expect(resendVersionPlan("prod", false)).toBe("operator");
  });
  it("non-prod + set ⇒ 'real' — the config value replaces the placeholder version", () => {
    expect(resendVersionPlan("preview", true)).toBe("real");
    expect(resendVersionPlan("dev", true)).toBe("real");
  });
  it("non-prod + unset ⇒ 'placeholder' — today's OPS.1 posture, mail.send stays a no-op", () => {
    expect(resendVersionPlan("preview", false)).toBe("placeholder");
    expect(resendVersionPlan("dev", false)).toBe("placeholder");
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
  it("carries resend-api-key (the one the real config replaces) and never system-database-url", () => {
    expect(NONPROD_OPERATOR_PLACEHOLDER_IDS).toContain("resend-api-key");
    expect(NONPROD_OPERATOR_PLACEHOLDER_IDS).not.toContain("system-database-url");
  });
});

describe("index.ts — the config read + prod refusal + real-version write (structural)", () => {
  it("reads rhema:resendApiKey as a SECRET config (never the plaintext get)", () => {
    expect(INDEX_SRC).toContain('rhemaConfig.getSecret("resendApiKey")');
    expect(INDEX_SRC).not.toMatch(/rhemaConfig\.get\(["']resendApiKey/);
  });
  it("refuses the config on prod via pulumi.RunError before resources exist", () => {
    expect(INDEX_SRC).toContain('resendPlan === "refused"');
    expect(INDEX_SRC).toContain("pulumi.RunError");
    expect(INDEX_SRC).toMatch(/resendApiKey is refused on prod/);
    // the refusal runs before createNetwork — the throw is placed above the first resource call
    expect(INDEX_SRC.indexOf('resendPlan === "refused"')).toBeLessThan(
      INDEX_SRC.indexOf("createNetwork("),
    );
  });
  it("writes the real version in place of the placeholder (never both)", () => {
    expect(INDEX_SRC).toContain('id === "resend-api-key" && resendPlan === "real"');
    expect(INDEX_SRC).toContain(`rhema-\${stack}-resend-api-key-v1`);
    expect(INDEX_SRC).toContain("secretData: resendApiKey");
  });
  it("keeps the placeholder path inside the non-prod-only block (the `!isProd` guard)", () => {
    const nonProdBlock = INDEX_SRC.slice(INDEX_SRC.indexOf("if (!isProd)"));
    expect(nonProdBlock).toContain("NONPROD_OPERATOR_PLACEHOLDER_IDS");
    // prod's hand-seeded path is untouched — no resend write outside the guard
    expect(INDEX_SRC.slice(0, INDEX_SRC.indexOf("if (!isProd)"))).not.toContain(
      "resend-api-key-v1",
    );
  });
});

describe("compute.ts — the worker RESEND_API_KEY_SECRET mount gate (structural)", () => {
  it("wires the env when required OR resendSecretWired — the placeholder is never mounted", () => {
    expect(COMPUTE_SRC).toContain('requires("resend-api-key") || args.resendSecretWired === true');
    expect(COMPUTE_SRC).toContain("RESEND_API_KEY_SECRET");
    expect(COMPUTE_SRC).toContain("resendSecretWired?: boolean");
  });
  it("index.ts passes resendSecretWired only on the 'real' plan", () => {
    expect(INDEX_SRC).toContain('resendPlan === "real" ? { resendSecretWired: true }');
  });
});
