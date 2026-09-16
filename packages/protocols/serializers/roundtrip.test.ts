import { describe, it, expect } from "vitest";
import {
  cutListSidecarSchema,
  responseLedgerSidecarSchema,
  structurePlanSidecarSchema,
} from "@rhema/contracts";
import { serializeResponseLedger, serializeStructurePlan, serializeCutList } from "./index.js";
import { parseResponseLedger, parseStructurePlan, parseCutList } from "../parsers/index.js";
import { projects, loadJson, hasFixture } from "../fixtures/load.js";

// AC1 (REQ-SPEC-9): round-trip goldens `parse(serialize(rows)) ≡ rows` for the three write-back artifacts
// on all three real projects. The serializer emits {markdown, json}; the parser reads them back (json
// authoritative, markdown cross-checked) and must reproduce the exact rows.

const KINDS = [
  {
    file: "response-ledger.json",
    schema: responseLedgerSidecarSchema,
    serialize: serializeResponseLedger,
    parse: parseResponseLedger,
  },
  {
    file: "structure-plan.json",
    schema: structurePlanSidecarSchema,
    serialize: serializeStructurePlan,
    parse: parseStructurePlan,
  },
  { file: "cut-list.json", schema: cutListSidecarSchema, serialize: serializeCutList, parse: parseCutList },
] as const;

describe("serializer round-trip goldens (AC1, REQ-SPEC-9)", () => {
  const projs = projects();
  it("covers all three real projects", () => {
    expect(projs).toEqual(
      ["constitution-of-reason", "structure-of-political-difference", "the-politics-of-visibility"].sort(),
    );
  });

  for (const project of projs) {
    for (const kind of KINDS) {
      const present = hasFixture(project, kind.file);
      it(`${project} / ${kind.file}: parse(serialize(rows)) ≡ rows`, () => {
        expect(present).toBe(true); // every project carries every write-back fixture
        const rows = kind.schema.parse(loadJson(project, kind.file));
        const { markdown, json } = kind.serialize(rows as never);

        // JSON side is the canonical authoritative twin.
        expect(JSON.parse(json)).toEqual(rows);

        // Full round-trip through both markdown and json (markdown cross-checked against json).
        const result = kind.parse(JSON.parse(json), markdown);
        expect(result.parseStatus).toBe("ok");
        if (result.parseStatus === "ok") expect(result.value).toEqual(rows);

        // json-only parse also reproduces the rows (the sidecar is the authoritative twin).
        const jsonOnly = kind.parse(JSON.parse(json));
        expect(jsonOnly.parseStatus).toBe("ok");
        if (jsonOnly.parseStatus === "ok") expect(jsonOnly.value).toEqual(rows);
      });
    }
  }

  it("a user-authored row's actor survives serialize→parse (PRB.05; REQ-SPEC-9)", () => {
    const rows = {
      sidecar: "response_ledger",
      version: 1,
      entries: [
        { findingOrdinal: 1, disposition: { kind: "rebut", status: "proposed", rationale: "the stat is fine", actor: "user" } },
        { findingOrdinal: 2, disposition: { kind: "accept", status: "proposed" } },
      ],
    };
    const { markdown, json } = serializeResponseLedger(rows as never);
    expect(markdown).toContain("disposition.actor");
    const result = parseResponseLedger(JSON.parse(json), markdown);
    expect(result.parseStatus).toBe("ok");
    if (result.parseStatus === "ok") {
      const entries = (result.value as { entries: { disposition: { actor?: string } }[] }).entries;
      expect(entries[0]!.disposition.actor).toBe("user");
      expect(entries[1]!.disposition.actor).toBeUndefined();
    }
  });

  // PRB.06 — the response ledger's `moves` table round-trips through BOTH twins (markdown + json): the
  // What-changed move cards read titles/types from these rows, so a dropped move is a lost card.
  it("the moves table + entry moveOrdinal survive serialize→parse on both twins (PRB.06)", () => {
    const rows = responseLedgerSidecarSchema.parse({
      sidecar: "response_ledger",
      version: 1,
      entries: [
        { findingOrdinal: 1, disposition: { kind: "accept", status: "verified", moveOrdinal: 1, actor: "drafter" } },
        { findingOrdinal: 2, disposition: { kind: "rebut", status: "done", rationale: "load-bearing" } },
      ],
      moves: [
        { ordinal: 1, title: "Restate the pillar", type: "argument", status: "done", discharges: [1] },
        { ordinal: 2, title: "Cut the digression", type: "structure", moots: [4] },
      ],
    });
    const { markdown, json } = serializeResponseLedger(rows);
    expect(markdown).toContain("## Moves");
    expect(markdown).toContain("### Move 1");
    // both twins reproduce the rows exactly — moves, moots/discharges lists, and the entry→move link.
    const both = parseResponseLedger(JSON.parse(json), markdown);
    expect(both.parseStatus).toBe("ok");
    if (both.parseStatus === "ok") expect(both.value).toEqual(rows);
    const jsonOnly = parseResponseLedger(JSON.parse(json));
    expect(jsonOnly.parseStatus).toBe("ok");
    if (jsonOnly.parseStatus === "ok") expect(jsonOnly.value).toEqual(rows);
  });

  it("a corrupted markdown twin fails the cross-check (markdown ↔ sidecar mismatch, REQ-SPEC-12)", () => {
    const rows = responseLedgerSidecarSchema.parse(loadJson("the-politics-of-visibility", "response-ledger.json"));
    const { markdown, json } = serializeResponseLedger(rows);
    const corrupted = markdown.replace('"done"', '"open"'); // flip a status only in the markdown
    expect(corrupted).not.toEqual(markdown);
    const result = parseResponseLedger(JSON.parse(json), corrupted);
    expect(result.parseStatus).toBe("failed");
    if (result.parseStatus === "failed") expect(result.errors.join(" ")).toMatch(/mismatch/i);
  });
});
