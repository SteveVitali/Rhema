import { describe, it, expect } from "vitest";
import { computeProtocolsVersion } from "./protocols-version.mjs";

// Deterministic PUBLIC coverage of the protocols_version content-address MECHANISM (P0.04 AC5;
// REQ-SPEC-22) — runs in the public typecheck-lint-unit job without the private @rhema/protocols
// checkout. The private package's version.test.ts additionally self-checks the frozen value against the
// real trio and keeps its TS copy of this algorithm in lockstep.

const base = {
  "skills/editorial-review/SKILL.md": "phases 0..6",
  "manifests/review.ts": "export const review = ...",
  "parsers/index.ts": "export function parseFindings ...",
  "serializers/index.ts": "export function serializeCutList ...",
};

describe("computeProtocolsVersion (REQ-SPEC-22 content address)", () => {
  it("is deterministic and order-independent", () => {
    const reordered = Object.fromEntries(Object.entries(base).reverse());
    expect(computeProtocolsVersion(base)).toBe(computeProtocolsVersion(reordered));
  });

  it("changes iff a trio file's content changes", () => {
    const v0 = computeProtocolsVersion(base);
    for (const key of Object.keys(base)) {
      expect(computeProtocolsVersion({ ...base, [key]: base[key] + " // edited" })).not.toBe(v0);
    }
    // unchanged input → unchanged version (only-if half)
    expect(computeProtocolsVersion({ ...base })).toBe(v0);
  });

  it("changes when a trio file is added or removed", () => {
    const v0 = computeProtocolsVersion(base);
    expect(computeProtocolsVersion({ ...base, "serializers/extra.ts": "x" })).not.toBe(v0);
    const { "parsers/index.ts": _drop, ...fewer } = base;
    expect(computeProtocolsVersion(fewer)).not.toBe(v0);
  });

  it("carries the base version as its prefix", () => {
    expect(computeProtocolsVersion(base, "9.9.9").startsWith("9.9.9+")).toBe(true);
  });
});
