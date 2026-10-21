// R5OPS.1 (REQ-OPS-3, ratified Q-CDN) — the out-of-band CDN verification driver's contract,
// pinned by source scan. The driver executes at import time, so the arms are asserted on text.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "usercontent-cdn-verify.mjs"),
  "utf8",
);

describe("usercontent-cdn-verify — read-only + fail-closed", () => {
  it("dry-run is the default; --execute requires CDN_VERIFY_ACK=yes", () => {
    expect(SRC).toContain('const dryRun = !args.includes("--execute")');
    expect(SRC).toMatch(/process\.env\.CDN_VERIFY_ACK !== "yes"[\s\S]*?process\.exit\(3\)/);
  });
  it("verifies the deployed config via gcloud (the ratified out-of-band arm)", () => {
    expect(SRC).toContain('"compute", "backend-buckets", "describe"');
    expect(SRC).toContain('"compute", "url-maps", "describe"');
    expect(SRC).toContain("signedUrlKeyNames");
    expect(SRC).toContain("enableCdn");
  });
  it("mints the signed URL out-of-band with rhema-tools-key material from Secret Manager", () => {
    expect(SRC).toContain('"compute", "sign-url"');
    expect(SRC).toContain('KEY_NAME = "rhema-tools-key"');
    expect(SRC).toContain('"secrets", "versions", "access"');
    // key bytes go to a tmpdir deleted in the same run — never printed, never committed.
    expect(SRC).toMatch(/mkdtempSync[\s\S]*?rmSync\(keyDir, \{ recursive: true, force: true \}\)/);
  });
});

describe("usercontent-cdn-verify — the three-probe verdict", () => {
  it("probes unsigned + signed + corrupted-signature and records each status", () => {
    expect(SRC).toContain("evidence.probes = {");
    expect(SRC).toMatch(/unsigned: \{ status/);
    expect(SRC).toMatch(/corrupted_signature: \{ status/);
  });
  it("PASS requires a 2xx with the header contract — a 403 sweep is CONFIG-OK-ORIGIN-DENIED, not green", () => {
    expect(SRC).toContain('s.set_cookie === false');
    expect(SRC).toContain("ALLOWED_TYPES.test(");
    expect(SRC).toContain("CONFIG-OK-ORIGIN-DENIED");
    expect(SRC).toContain("NON-EVIDENCE for the signed-delivery path");
  });
  it("non-PASS verdicts exit 4 — never silently green", () => {
    expect(SRC).toContain('process.exit(evidence.verdict.startsWith("PASS") ? 0 : 4)');
  });
});
