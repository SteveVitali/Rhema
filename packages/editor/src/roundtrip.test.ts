import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { normalizeMarkdown } from "@rhema/markdown";
import { markdownToDoc } from "./md-to-pm.js";
import { docToMarkdown } from "./pm-to-md.js";

// The golden round-trip suite (P1.02; REQ-DATA-9(b)/(c) — the halves D-P0.09-2 left for this ticket).
// Each fixture is a project-shaped canonical document (the three seeded dossiers' profile shapes +
// a converted-import sample). For every fixture:
//   (b) canonical md → PM → md is BYTE-STABLE (the serializer emits the canonical form), and
//   (c) PM → md → PM is structurally equal (doc.eq) and re-serializes identically.
// Non-canonical input is normalized FIRST (REQ-DATA-9a is P0.09's landed half — normalization is its
// job); round-trip stability is asserted against the canonical form.

const dir = fileURLToPath(new URL("../test/fixtures/", import.meta.url));
const fixtures = readdirSync(dir).filter((f) => f.endsWith(".md")).sort();

describe("REQ-DATA-9(b)/(c) golden round-trips", () => {
  for (const file of fixtures) {
    describe(file, () => {
      const raw = readFileSync(`${dir}${file}`, "utf8");
      const canonical = normalizeMarkdown(raw);

      it("md→PM→md is byte-stable on the canonical form", () => {
        const doc = markdownToDoc(canonical);
        const out = docToMarkdown(doc);
        if (out !== canonical) {
          console.log(`=== ${file} CANONICAL ===\n${canonical}\n=== OUT ===\n${out}`);
        }
        expect(out).toBe(canonical);
      });

      it("PM→md→PM is structurally equal", () => {
        const doc = markdownToDoc(canonical);
        const md = docToMarkdown(doc);
        const doc2 = markdownToDoc(md);
        expect(doc2.eq(doc)).toBe(true);
        expect(docToMarkdown(doc2)).toBe(md);
      });

      it("a second normalize is a fixed point (the serializer emits canonical form)", () => {
        expect(normalizeMarkdown(docToMarkdown(markdownToDoc(canonical)))).toBe(canonical);
      });
    });
  }
});
