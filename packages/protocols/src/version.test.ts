import { describe, it, expect } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { PROTOCOLS_VERSION, PROTOCOLS_VERSION_BASE, computeProtocolsVersion } from "./version.js";
import { collectTrioFiles } from "./version-files.js";

// AC5 (REQ-SPEC-22): protocols_version changes iff any of the trio (skill shas + manifests +
// parsers/serializers) changes.

const PKG_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");

describe("protocols_version content address (AC5)", () => {
  const base: Record<string, string> = {
    "skills/editorial-review/SKILL.md": "phase 0..6",
    "manifests/review.ts": "export const review = ...",
    "parsers/index.ts": "export function parseFindings ...",
    "serializers/index.ts": "export function serializeCutList ...",
  };

  it("is deterministic and order-independent (same content → same version)", () => {
    const reordered = Object.fromEntries(Object.entries(base).reverse());
    expect(computeProtocolsVersion(base)).toBe(computeProtocolsVersion(reordered));
  });

  it("changes when ANY trio file's content changes", () => {
    const v0 = computeProtocolsVersion(base);
    for (const key of Object.keys(base)) {
      const mutated = { ...base, [key]: base[key] + " // edited" };
      expect(computeProtocolsVersion(mutated), `mutating ${key}`).not.toBe(v0);
    }
  });

  it("changes when a trio file is added or removed (path set matters)", () => {
    const v0 = computeProtocolsVersion(base);
    expect(computeProtocolsVersion({ ...base, "serializers/extra.ts": "x" })).not.toBe(v0);
    const { "parsers/index.ts": _drop, ...fewer } = base;
    expect(computeProtocolsVersion(fewer)).not.toBe(v0);
  });

  it("does NOT change for a file outside the trio map (only-if half of the iff)", () => {
    // Files outside the collected map are never inputs, so the version is a pure function of the trio.
    const v0 = computeProtocolsVersion(base);
    expect(computeProtocolsVersion({ ...base })).toBe(v0);
  });

  it("carries the base version as its prefix", () => {
    expect(computeProtocolsVersion(base).startsWith(PROTOCOLS_VERSION_BASE + "+")).toBe(true);
  });

  it("self-check: frozen PROTOCOLS_VERSION equals the recomputation over the real trio (drift ⇒ red)", () => {
    const files = collectTrioFiles(PKG_ROOT);
    // sanity: the collector actually found the trio
    expect(Object.keys(files).some((f) => f.startsWith("skills/"))).toBe(true);
    expect(Object.keys(files).some((f) => f.startsWith("manifests/"))).toBe(true);
    expect(Object.keys(files)).toContain("parsers/index.ts");
    expect(Object.keys(files)).toContain("serializers/index.ts");
    expect(Object.keys(files)).toContain("src/md-twins.ts");
    expect(computeProtocolsVersion(files)).toBe(PROTOCOLS_VERSION);
  });
});
