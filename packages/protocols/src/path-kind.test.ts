import { describe, it, expect } from "vitest";
import { artifactKindSchema } from "@rhema/contracts";
import { pathToKind, pathToNamespace, PATH_KIND_RULES } from "./path-kind.js";

// Path→kind map (ledger F11) for the harvester.

describe("path→kind map (F11)", () => {
  it("every rule maps to a real ArtifactKind", () => {
    for (const r of PATH_KIND_RULES) expect(() => artifactKindSchema.parse(r.kind)).not.toThrow();
  });

  it.each([
    ["correspondence/v2-review/editors-letter.md", "editors_letter"],
    ["correspondence/v2-review/00-piece-brief.md", "piece_brief"],
    ["correspondence/v2-review/01-claim-ledger.md", "claim_ledger"],
    ["correspondence/v2-review/02-discourse-report.md", "discourse_report"],
    ["correspondence/v2-review/05-second-read.md", "second_read"],
    ["correspondence/v2-response.md", "response_letter"],
    ["agents/author/ledgers/v2-response-ledger.md", "response_ledger"],
    ["agents/author/drafting/v1/02-structure-plan.md", "structure_plan"],
    ["drafts/v3.md", "draft"],
    ["persona/sjs/profile/voice-print.md", "voice_print"],
    ["persona/sjs/profile/corpus/HOLDOUT-abc.md", "holdout_note"],
    ["persona/sjs/profile/corpus/some-essay.md", "corpus_note"],
    ["PERSONA.md", "persona_seed"],
    ["persona/sjs/docs/samples/item1.md", "sample"], // PRB.16b F18 — operator corpus under docs/
    ["docs/samples/item1.md", "sample"],
    ["correspondence/v2-review/.rhema/findings.json", "sidecar"],
    ["correspondence/v2-review/.rhema/rubric.json", "sidecar"],
  ])("classifies %s → %s", (path, kind) => {
    expect(pathToKind(path)).toBe(kind);
  });

  it("returns null for the project manifest (no artifact kind)", () => {
    expect(pathToKind("manifest.md")).toBeNull();
  });

  it("derives the namespace from the path (§11.1)", () => {
    expect(pathToNamespace("agents/editor/notes.md")).toBe("agent:editor");
    expect(pathToNamespace("agents/author/voice-charter.md")).toBe("agent:author");
    expect(pathToNamespace("correspondence/v2-response.md")).toBe("shared");
    expect(pathToNamespace("persona/sjs/profile/index.md")).toBe("persona");
    expect(pathToNamespace("persona/sjs/docs/samples/item1.md")).toBe("persona"); // F18
    expect(pathToNamespace("docs/essay.md")).toBe("persona");
  });
});
