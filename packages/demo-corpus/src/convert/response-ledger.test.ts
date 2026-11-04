import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { parseSidecar } from "@rhema/protocols";
import {
  classifySource,
  convertResponseLedger,
  mapDisposition,
  mapStatus,
} from "./response-ledger.js";
import { OverrideBook, readConvertOverrides } from "./overrides.js";
import type { FindingLabel } from "./labels.js";

// REQ-CONV-10/15/16 — the response-ledger converter on the synthetic fixture: Source resolution
// (majors/minors/SR aliases/OQ, unrepresentable → raw-table-only), the disposition/status maps,
// Discharges → moveOrdinal, discharge-evidence anchors into v(N+1), one entry per finding, and
// every row verbatim in rows.json.

const PKG = fileURLToPath(new URL("../../", import.meta.url));
const CORPUS = join(PKG, "fixtures/synthetic/corpus/the-borrowed-commons");
const read = (p: string) => readFileSync(join(CORPUS, p), "utf8");

// The v1 finding labels as 216 emits them (labels.json golden).
const V1_LABELS: FindingLabel[] = [
  { ordinal: 0, id: "The one thing" },
  { ordinal: 1, id: "Major 1", aliases: ["SR 1"] },
  { ordinal: 2, id: "Major 2", aliases: ["SR 2"] },
  { ordinal: 3, id: "Strength 1" },
  { ordinal: 4, id: "Strength 2" },
  { ordinal: 5, id: "Strength 3" },
  { ordinal: 6, id: "Strength 4" },
  { ordinal: 7, id: "Strength 5" },
  { ordinal: 8, id: "Minor 1" },
  { ordinal: 9, id: "Minor 2" },
  { ordinal: 10, id: "Line note 1" },
  { ordinal: 11, id: "Line note 2" },
  { ordinal: 12, id: "CaR 1" },
  { ordinal: 13, id: "OQ 1" },
];
const V2_LABELS: FindingLabel[] = [{ ordinal: 0, id: "The one thing" }];

const v1 = convertResponseLedger(read("agents/author/ledgers/v1-response-ledger.md"), {
  findingLabels: V1_LABELS,
  nextDraftMarkdown: read("drafts/v2.md"),
});
const OVERRIDES = readConvertOverrides(
  JSON.parse(
    readFileSync(
      join(PKG, "fixtures/synthetic/overrides/the-borrowed-commons/convert-overrides.json"),
      "utf8",
    ),
  ),
);
const v2 = convertResponseLedger(read("agents/author/ledgers/v2-response-ledger.md"), {
  findingLabels: V2_LABELS,
  nextDraftMarkdown: read("drafts/v3.md"),
  ...(OVERRIDES.ok ? { overrides: OverrideBook.from(OVERRIDES.value) } : {}),
});

describe("source classification (R2 §2.4)", () => {
  it.each([
    ["L Major 1", { type: "major", n: 1 }],
    ["Letter §Major 6(a)", { type: "major", n: 6 }],
    ["L Minor 2", { type: "minor", n: 2 }],
    ["L Minor", { type: "minor", n: null }],
    ["SR 1", { type: "second_read", label: "1" }],
    ["2nd read Obj 2.4", { type: "second_read", label: "2.4" }],
    ["OQ 1", { type: "roadmap", n: 1 }],
    ["Open question 3", { type: "roadmap", n: 3 }],
    ["Line note 2", { type: "line_note", n: 2 }],
  ])("%s → %j", (cell, expected) => {
    expect(classifySource(cell)).toMatchObject(expected);
  });
  it.each(["CL C7b", "CL VII3-scope", "DR §2", "self", "argument notes", "reception", "scorecard", "weird"])(
    "%s is unrepresentable (raw-table-only, REQ-CONV-16)",
    (cell) => expect(classifySource(cell).type).toBe("unrepresentable"),
  );
});

describe("disposition + status maps (R2 §2.4)", () => {
  it.each([
    ["accept", "accept"],
    ["adapt", "adapt"],
    ["rebut with evidence", "rebut"],
    ["decline", "rebut"],
    ["constraint", "accept"],
    ["duplicates F33", "accept"],
    ["mooted by F33", "accept"],
    ["covered by F54", "accept"],
    ["defer", "defer"],
    ["escalate", "escalate"],
  ])("%s → kind %s", (cell, kind) => {
    expect(mapDisposition(cell)).toEqual({ mapped: "kind", kind });
  });
  it.each(["mapping only", "(causes are F1, F3)"])("%s skips", (cell) => {
    expect(mapDisposition(cell).mapped).toBe("skip");
  });
  it.each(["§3.B accept; the volume point **rebut**", "the volume point rebut"])(
    "%s is mixed (override-only)",
    (cell) => expect(mapDisposition(cell).mapped).toBe("mixed"),
  );
  it.each(["operational", "no change needed"])("%s is unmapped", (cell) => {
    expect(mapDisposition(cell).mapped).toBe("unmapped");
  });
  it.each([
    ["done", "done"],
    ["verified", "verified"],
    ["deferred", "deferred"],
    ["escalated", "escalated"],
    ["awaiting the writer", "escalated"],
    ["escalated (resolved)", "escalated"],
    ["honored", "honored"],
    ["partial", "open"],
    ["pending", "open"],
    ["unresolved", "open"],
    ["open", "open"],
    ["resolved", "done"],
    ["rebutted", "done"],
    ["mooted", "mooted"],
  ])("status %s → %s", (cell, status) => {
    expect(mapStatus(cell)).toBe(status);
  });
});

describe("v1 ledger (Discharges + discharge evidence)", () => {
  it("converts: parseSidecar ok, zero errors, zero unmapped on resolvable rows", () => {
    expect(v1.ok).toBe(true);
    if (!v1.ok) return;
    expect(v1.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(v1.value.meta.unmappedDispositions).toEqual([]);
    expect(v1.value.meta.unmappedStatuses).toEqual([]);
    expect(parseSidecar("response-ledger.json", { json: v1.value.sidecar }).parseStatus).toBe("ok");
  });

  it("emits one entry per finding, first-listed row wins (F3 dedups onto F1)", () => {
    if (!v1.ok) throw new Error("v1 failed");
    const s = v1.value.sidecar;
    expect(s.entries.map((e) => e.findingOrdinal)).toEqual([1, 2, 8, 9, 13]);
    const byFinding = Object.fromEntries(s.entries.map((e) => [e.findingOrdinal, e]));
    expect(byFinding[1]!.disposition).toMatchObject({ kind: "accept", status: "done", moveOrdinal: 1 });
    expect(byFinding[2]!.disposition).toMatchObject({ kind: "adapt", status: "done", moveOrdinal: 3 });
    expect(byFinding[8]!.disposition).toMatchObject({ kind: "rebut", status: "done" });
    expect(byFinding[9]!.disposition).toMatchObject({
      kind: "rebut",
      status: "done",
      moveOrdinal: 2,
      rationale: "decline", // verbatim Disposition cell
    });
    expect(byFinding[13]!.disposition).toMatchObject({
      kind: "escalate",
      status: "escalated",
      rationale: "escalate",
    });
    expect(v1.value.meta.duplicates).toBe(1); // F3 (SR 1) resolved to finding 1 after F1
  });

  it("rebut/escalate carry verbatim rationale; accept/adapt carry none", () => {
    if (!v1.ok) throw new Error("v1 failed");
    for (const e of v1.value.sidecar.entries) {
      if (e.disposition.kind === "rebut" || e.disposition.kind === "escalate")
        expect(e.disposition.rationale).toBeTruthy();
      else expect(e.disposition.rationale).toBeUndefined();
    }
  });

  it("moves table → moves[] (discharges never emitted as ordinals)", () => {
    if (!v1.ok) throw new Error("v1 failed");
    const s = v1.value.sidecar;
    expect(s.moves).toHaveLength(3);
    expect(s.moves![0]).toMatchObject({ ordinal: 1, type: "insert", status: "done" });
    expect(s.moves![0]!.title).toContain("Why the roster, and not the budget");
    for (const m of s.moves!) {
      expect(m).not.toHaveProperty("discharges");
      expect(m).not.toHaveProperty("moots");
    }
  });

  it("discharge evidence anchors into v2 through the ladder (F1/F2/F5)", () => {
    if (!v1.ok) throw new Error("v1 failed");
    const withAnchor = v1.value.sidecar.entries.filter((e) => e.anchor);
    expect(withAnchor.map((e) => e.findingOrdinal).sort()).toEqual([1, 2, 9]);
    expect(v1.value.meta.anchorRungs.exact).toBe(3);
    // F1's evidence lands on v2's new section — inside the added hunk.
    const f1 = v1.value.sidecar.entries.find((e) => e.findingOrdinal === 1)!;
    expect(f1.anchor!.quote).toContain("funding story wearing a grammar");
  });

  it("every row — representable or not — is verbatim in rows.json; raw-only rows are never entries", () => {
    if (!v1.ok) throw new Error("v1 failed");
    const rows = v1.value.rows.rows;
    expect(rows).toHaveLength(9);
    const at = (id: string) => rows.find((r) => r.id === id)!;
    // verbatim cells preserved
    expect(at("F7").disposition).toBe("§3.B accept; the volume point **rebut**");
    expect(at("F8").disposition).toBe("operational");
    // unrepresentable rows: no finding, never an entry (REQ-CONV-16 default)
    for (const id of ["F7", "F8", "F9"]) {
      expect(at(id).findingOrdinal).toBeNull();
      expect(at(id).entry).toBe(false);
    }
    // F3 resolved (SR 1 → alias of Major 1) but deduped — resolved ordinal, entry:false
    expect(at("F3")).toMatchObject({ findingOrdinal: 1, entry: false });
    // skipped rows carry the marker even when the source resolves
    for (const r of rows.filter((r) => r.entry)) expect(r.findingOrdinal).not.toBeNull();
  });
});

describe("v2 ledger (no Discharges; minor-finding override)", () => {
  it("converts: G1 resolves via the override, G2/G3 raw-only", () => {
    expect(OVERRIDES.ok).toBe(true);
    expect(v2.ok).toBe(true);
    if (!v2.ok) return;
    const s = v2.value.sidecar;
    expect(s.entries).toHaveLength(1);
    expect(s.entries[0]).toMatchObject({
      findingOrdinal: 0,
      disposition: { kind: "accept", status: "done" },
    });
    expect(s.entries[0]!.disposition.moveOrdinal).toBeUndefined();
    const rows = v2.value.rows.rows;
    expect(rows).toHaveLength(3);
    expect(rows.find((r) => r.id === "G1")).toMatchObject({ findingOrdinal: 0, entry: true });
    for (const id of ["G2", "G3"]) {
      const r = rows.find((x) => x.id === id)!;
      expect(r.findingOrdinal).toBeNull();
      expect(r.entry).toBe(false);
    }
    expect(s.moves).toHaveLength(3); // plan table still converts
  });

  it("without the override G1 stays raw-table-only (never a synthesized finding)", () => {
    const bare = convertResponseLedger(read("agents/author/ledgers/v2-response-ledger.md"), {
      findingLabels: V2_LABELS,
    });
    expect(bare.ok).toBe(true);
    if (!bare.ok) return;
    expect(bare.value.sidecar.entries).toHaveLength(0);
    expect(bare.value.rows.rows.find((r) => r.id === "G1")!.findingOrdinal).toBeNull();
  });
});

describe("override + failure semantics (REQ-CONV-6)", () => {
  const LEDGER = `# r

| Row | Source | Disposition | Status | Note |
|---|---|---|---|---|
| F1 | L Major 1 | §3.B accept; the volume point **rebut** | done | Mixed. |
| F2 | L Major 2 | accept | done | ok. |

## Revision plan

| Move | Title | Type | Status | Discharges |
|---|---|---|---|---|
| M1 | x | edit | done | F1 |
`;
  const LABELS: FindingLabel[] = [
    { ordinal: 0, id: "The one thing" },
    { ordinal: 1, id: "Major 1" },
    { ordinal: 2, id: "Major 2" },
  ];

  it("a mixed cell on a resolvable row fails without a disposition override", () => {
    const r = convertResponseLedger(LEDGER, { findingLabels: LABELS });
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => d.code === "disposition_mixed")).toBe(true);
  });

  it("the same cell resolves via a disposition override", () => {
    const file = readConvertOverrides({
      version: 1,
      overrides: [
        { kind: "disposition", row: "F1", disposition: "adapt", cite: "l.md:5" },
      ],
    });
    if (!file.ok) throw new Error("bad override");
    const r = convertResponseLedger(LEDGER, {
      findingLabels: LABELS,
      overrides: OverrideBook.from(file.value),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sidecar.entries[0]!.disposition.kind).toBe("adapt");
    expect(r.value.sidecar.entries[0]!.disposition.moveOrdinal).toBe(1);
  });

  it("a stale override of any owned kind fails the conversion", () => {
    // `disposition` on F2 — the row exists but its cell maps cleanly, so the row is never
    // taken → stale → fails (a row meant for another ledger is the pipeline's end-check).
    const file = readConvertOverrides({
      version: 1,
      overrides: [{ kind: "disposition", row: "F2", disposition: "accept", cite: "l.md:6" }],
    });
    if (!file.ok) throw new Error("bad override");
    const r = convertResponseLedger(LEDGER, {
      findingLabels: LABELS,
      overrides: OverrideBook.from(file.value),
    });
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => d.code === "override_unconsumed")).toBe(true);
  });

  it("a move-link override joins a row to a move only when consumed", () => {
    const file = readConvertOverrides({
      version: 1,
      overrides: [
        { kind: "disposition", row: "F1", disposition: "adapt", cite: "l.md:5" },
        { kind: "move-link", row: "F2", move: 1, cite: "l.md:6" },
      ],
    });
    if (!file.ok) throw new Error("bad override");
    const r = convertResponseLedger(LEDGER, {
      findingLabels: LABELS,
      overrides: OverrideBook.from(file.value),
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.sidecar.entries[1]!.disposition.moveOrdinal).toBe(1);
  });

  it("an unmapped disposition or status on a resolvable row fails", () => {
    const md = LEDGER.replace(
      "§3.B accept; the volume point **rebut**",
      "no change needed",
    );
    const r = convertResponseLedger(md, { findingLabels: LABELS });
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => d.code === "disposition_unmapped")).toBe(true);
    const md2 = LEDGER.replace("§3.B accept; the volume point **rebut**", "accept").replace(
      "| done | Mixed.",
      "| wobbling | Mixed.",
    );
    const r2 = convertResponseLedger(md2, { findingLabels: LABELS });
    expect(r2.ok).toBe(false);
    expect(r2.diagnostics.some((d) => d.code === "status_unmapped")).toBe(true);
  });

  it("a skipped row stays raw-only even when its source resolves", () => {
    const md = LEDGER.replace(
      "§3.B accept; the volume point **rebut**",
      "(causes are F2)",
    );
    const r = convertResponseLedger(md, { findingLabels: LABELS });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const f1 = r.value.rows.rows.find((x) => x.id === "F1")!;
    expect(f1).toMatchObject({ findingOrdinal: 1, entry: false, skip: "mapping" });
    expect(r.value.sidecar.entries).toHaveLength(1);
  });
});
