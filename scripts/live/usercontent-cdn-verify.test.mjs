// R6UCD.1 (REQ-POST-7, ADR-113) — the API-minted usercontent verification driver's contract,
// pinned by source scan. The driver executes at import time, so the arms are asserted on text.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "usercontent-cdn-verify.mjs"),
  "utf8",
);

describe("usercontent-cdn-verify — read-only + fail-closed (the minted contract)", () => {
  it("dry-run is the default; --execute requires CDN_VERIFY_ACK=yes", () => {
    expect(SRC).toContain('const dryRun = !args.includes("--execute")');
    expect(SRC).toMatch(/process\.env\.CDN_VERIFY_ACK !== "yes"[\s\S]*?process\.exit\(3\)/);
  });
  it("the CDN edge-signing mechanism is gone: no Secret Manager read, no gcloud compute sign-url, no key tmpfile", () => {
    expect(SRC).not.toContain('"secrets", "versions", "access"');
    expect(SRC).not.toContain('"compute", "sign-url"');
    expect(SRC).not.toContain("mkdtempSync");
    expect(SRC).not.toContain("SECRET");
    expect(SRC).not.toContain("KEY_NAME");
  });
  it("mints through the SAME signBlob primitive the api uses — gcloud storage sign-url impersonating the api SA", () => {
    expect(SRC).toContain('"storage", "sign-url"');
    expect(SRC).toContain('"--impersonate-service-account", API_SA');
    expect(SRC).toContain("rhema-${STACK}-api@");
    // the §13.3 serve contract is bound into the signature as the signed response-* params
    expect(SRC).toContain("response-content-disposition=attachment");
    expect(SRC).toContain("response-content-type=application/octet-stream");
  });
  it("and can mint through the REAL route when a session cookie is supplied", () => {
    expect(SRC).toContain('/usercontent/sign?key=');
    expect(SRC).toContain('"--cookie"');
    expect(SRC).toContain("`Cookie: ${COOKIE}`");
  });
});

describe("usercontent-cdn-verify — the denial + signed probes", () => {
  it("probes the session-gated mint route (401), the unsigned object read (403), and the signed fetch", () => {
    expect(SRC).toContain("api_mint_unauthenticated");
    expect(SRC).toContain("probes.unsigned = { status");
    expect(SRC).toContain("mintUnauth.status === 401");
    expect(SRC).toContain("unsigned.status === 403");
  });
  it("probes tampered-signature + expired-lifetime — both must deny", () => {
    expect(SRC).toContain("tampered_signature");
    expect(SRC).toContain("expired_lifetime");
    expect(SRC).toMatch(/tampered\.status >= 400/);
    expect(SRC).toMatch(/expired\.status >= 400/);
  });
  it("PASS requires the §13.3 header contract verbatim — attachment + octet-stream + no Set-Cookie", () => {
    expect(SRC).toContain('s.content_disposition === "attachment"');
    expect(SRC).toContain('s.content_type === "application/octet-stream"');
    expect(SRC).toContain("s.set_cookie === false");
    // a uniform-denied sweep is a FAIL, never a pass-through verdict
    expect(SRC).not.toContain("CONFIG-OK-ORIGIN-DENIED");
  });
  it("non-PASS verdicts exit 4 — never silently green", () => {
    expect(SRC).toContain('process.exit(evidence.verdict.startsWith("PASS") ? 0 : 4)');
  });
});
