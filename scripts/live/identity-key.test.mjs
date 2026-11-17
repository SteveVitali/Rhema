// BL-115 — the identity-key helper's refusal + secrecy contract. Pure-function legs only:
// stage classification, the secret-name mapping, and a source pin that the fetched value can
// never become an argv element or a log line (env injection / stdout-substitution only).

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyStage, identitySecretName, IDENTITY_KEY_STAGES } from "./identity-key.mjs";

const SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "identity-key.mjs"),
  "utf8",
);

describe("identity-key — stage classification", () => {
  it("accepts the non-prod shim stages (dev, pr-<n>)", () => {
    expect(classifyStage("dev")).toBe("ok");
    expect(classifyStage("pr-1")).toBe("ok");
    expect(classifyStage("pr-407")).toBe("ok");
  });

  it("refuses prod — the shim is never armed there", () => {
    expect(classifyStage("prod")).toMatch(/never armed on prod/);
  });

  it("refuses unknown stage names", () => {
    for (const s of ["staging", "main", "dev2", "pr-", "pr-x", ""]) {
      expect(classifyStage(s)).toMatch(/^refused:/);
    }
  });

  it("maps a stage to its Secret Manager id", () => {
    expect(identitySecretName("dev")).toBe("rhema-dev-identity-headers-key");
    expect(identitySecretName("pr-407")).toBe("rhema-pr-407-identity-headers-key");
    expect(IDENTITY_KEY_STAGES.test("prod")).toBe(false);
  });
});

describe("identity-key — the value can never reach argv or a log line", () => {
  it("fetches via gcloud capture only (no argv passthrough of a caller-supplied value)", () => {
    // the gcloud call carries only the secret NAME — never a value.
    expect(SRC).toContain('"secrets", "versions", "access", "latest", "--secret", secret');
    expect(SRC).not.toMatch(/gcloud\([^)]*value/);
  });

  it("hands the value on only via env injection or stdout — never as a child argv element", () => {
    expect(SRC).toContain('env = { ...process.env, [varName ?? "RHEMA_IDENTITY_KEY"]: value }');
    // the child spawn receives argv from the operator's own `-- <cmd>` tail only.
    expect(SRC).toContain("spawnSync(child[0], child.slice(1)");
    expect(SRC).toContain("process.stdout.write(value");
    // and nothing writes the value to stderr or a file (bare `value` argument — message
    // strings that merely mention the word are fine).
    expect(SRC).not.toMatch(/console\.(error|log)\(\s*[^`'"]*\bvalue\b/);
    expect(SRC).not.toMatch(/writeFileSync|appendFileSync/);
  });
});
