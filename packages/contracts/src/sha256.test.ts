import { describe, it, expect } from "vitest";
import { createHash } from "node:crypto";
import { sha256Hex } from "./sha256.js";

// The isomorphic sha256 must be byte-identical to node:crypto's — it's swapped into content-hash paths
// (markdown front-matter, voice seeds) so that browser bundles carry no node: imports.

describe("sha256Hex (isomorphic)", () => {
  const cases = [
    "",
    "abc",
    "hello world",
    "# Title\n\nA paragraph with *emphasis* and a cite [@key].\n",
    "unicode — Rhēma · κείμενο · 文本",
    "x".repeat(55), // padding boundary: 55+9 = 64 exactly
    "x".repeat(56),
    "x".repeat(64),
    "x".repeat(1000),
  ];

  for (const input of cases) {
    it(`matches node:crypto for ${JSON.stringify(input.slice(0, 24))} (len ${input.length})`, () => {
      const expected = createHash("sha256").update(input, "utf8").digest("hex");
      expect(sha256Hex(input)).toBe(expected);
      expect(sha256Hex(new TextEncoder().encode(input))).toBe(expected);
    });
  }
});
