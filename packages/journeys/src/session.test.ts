import { describe, expect, it } from "vitest";
import { assertTestIdentity, freshIdentity, stableIdentity } from "./session.js";
import { journeyNonce, testIdentity, marker } from "./nonce.js";
import { provenanceMatch } from "./provenance.js";

// JOURNEY.1 — the session guard + identity shapes + provenance compare (deterministic halves).

describe("assertTestIdentity — the session-minting guard", () => {
  it("accepts the base and plus-tag forms only", () => {
    expect(() => assertTestIdentity("test@rhema.tools")).not.toThrow();
    expect(() => assertTestIdentity("test+jrn-a@rhema.tools")).not.toThrow();
    expect(() => assertTestIdentity("test+j1nv@rhema.tools")).not.toThrow();
  });
  it("refuses every real/lookalike address — the harness cannot mint real-user sessions", () => {
    for (const bad of [
      "steve@rhema.tools",
      "test@evil.tools",
      "test@rhema.tools.evil",
      "tesseract@rhema.tools",
      "attacker+test@rhema.tools.evil",
      "",
      "not-an-email",
    ]) {
      expect(() => assertTestIdentity(bad), bad).toThrow(/test identities/);
    }
  });
});

describe("identity + nonce shapes", () => {
  it("freshIdentity is nonce-namespaced and unique per run", () => {
    const n1 = journeyNonce();
    const n2 = journeyNonce();
    expect(n1).not.toBe(n2);
    expect(freshIdentity(n1, "nv")).toBe(`test+j${n1}nv@rhema.tools`);
    expect(freshIdentity(n1, "nv")).not.toBe(freshIdentity(n2, "nv"));
  });
  it("stableIdentity is cache-stable across runs", () => {
    expect(stableIdentity("a")).toBe("test+jrn-a@rhema.tools");
    expect(stableIdentity("a")).toBe(stableIdentity("a"));
  });
  it("testIdentity + marker namespace artifacts", () => {
    expect(testIdentity("abc123", "tA")).toBe("test+jabc123ta@rhema.tools");
    expect(marker("deadbeef", "proj")).toBe("JRN-DEADBEEF-PROJ");
  });
});

describe("provenanceMatch — the deploy-provenance compare", () => {
  it("matches full and short SHAs in either direction", () => {
    const full = "e6c91039e66ac3c42e97b6a8ce67150516a67ddf";
    expect(provenanceMatch(full, { web: full, api: full })).toBe(true);
    expect(provenanceMatch("e6c9103", { web: full })).toBe(true);
    expect(provenanceMatch(full, { web: "e6c9103" })).toBe(true);
  });
  it("fails closed on absent/unknown/mismatched SHAs", () => {
    const full = "e6c91039e66ac3c42e97b6a8ce67150516a67ddf";
    expect(provenanceMatch(full, { web: null })).toBe(false);
    expect(provenanceMatch(full, { web: "unknown" })).toBe(false);
    expect(provenanceMatch(full, { web: full, api: "deadbeef" + full.slice(8) })).toBe(false);
    expect(provenanceMatch("", { web: full })).toBe(false);
  });
});
