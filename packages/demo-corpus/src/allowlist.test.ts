import { describe, expect, it } from "vitest";
import { cpSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { classifyFile } from "./allowlist.js";
import { exportCorpus, ExportError } from "./export.js";

// REQ-CORPUS-1/11: allowlist-only ingest — every fixture decoy excluded with its recorded reason,
// and an un-ruled file fails the export (fail closed).

const SOURCE = fileURLToPath(
  new URL("../fixtures/synthetic/source/the-borrowed-commons", import.meta.url),
);

const EXPECTED_EXCLUSIONS: Record<string, string> = {
  "manifest.md": "round log",
  ".ds-store": "dotfile",
  "agents/editor/notes.md": "private notes",
  "agents/author/voice-charter.md": "persona internals",
  "agents/author/outline/01-outline.md": "deep-research outline",
  "agents/author/drafting/v1/draft-part1.md": "working fragment",
  "agents/author/drafting/v1/ledger-sliceA.md": "working fragment",
  "agents/author/research/index-sliceA.md": "working fragment",
  "correspondence/v2-review/01-claim-ledger-A.md": "merged ledger is canonical",
  "correspondence/v2-review/01-claim-ledger-B.md": "merged ledger is canonical",
  "drafts/figures/values-table.png": "unreferenced screenshots",
  "drafts/short-v1.md": "a different piece",
};

describe("allowlist ingest (REQ-CORPUS-1, REQ-CORPUS-11)", () => {
  it("every decoy is excluded with its reason", () => {
    for (const [file, reasonPart] of Object.entries(EXPECTED_EXCLUSIONS)) {
      const r = classifyFile(file);
      expect(r.ruling, file).toBe("exclude");
      expect(r.reason, file).toContain(reasonPart);
    }
  });

  it("the ruling-table keeps hold: taxonomy sheet, merged ledger, published.md, figure png", () => {
    for (const file of [
      "drafts/taxonomy_reference_sheet.md",
      "correspondence/v2-review/01-claim-ledger.md",
      "published.md",
      "drafts/figures/figure_1_signal_map.png",
      "agents/author/research/sources/x.md",
      "agents/editor/research/index.md",
    ]) {
      expect(classifyFile(file).ruling, file).toBe("keep");
    }
  });

  it("an un-ruled file fails the export", () => {
    const src = mkdtempSync(join(tmpdir(), "corpus-src-"));
    const out = mkdtempSync(join(tmpdir(), "corpus-out-"));
    cpSync(SOURCE, join(src, "the-borrowed-commons"), { recursive: true });
    writeFileSync(join(src, "the-borrowed-commons", "no-ruling-for-this.md"), "unruled\n");
    expect(() =>
      exportCorpus({
        sourceRoot: src,
        corpusRoot: out,
        slugs: ["the-borrowed-commons"],
        exportDate: "2026-11-03",
      }),
    ).toThrow(ExportError);
    try {
      exportCorpus({
        sourceRoot: src,
        corpusRoot: out,
        slugs: ["the-borrowed-commons"],
        exportDate: "2026-11-03",
      });
    } catch (e) {
      expect((e as Error).message).toContain("un-ruled");
      expect((e as Error).message).toContain("no-ruling-for-this.md");
    }
  });
});
