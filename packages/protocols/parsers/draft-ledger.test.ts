import { describe, it, expect } from "vitest";
import { parseDraftLedgerSections, draftedSectionCount } from "./draft-ledger.js";

const TABLE = (ords: string[]): string => `# Draft ledger

## Sections

| # | Section | Function (from plan) | Budget | Actual | Status | Claim rows used | Deviation |
|---|---------|----------------------|--------|--------|--------|-----------------|-----------|
${ords.map((o, i) => `| ${o} | Sec ${i + 1} | f | 500 | ${i % 2 === 0 ? "600" : "—"} | ${i % 2 === 0 ? "drafted" : "planned"} | — | — |`).join("\n")}

Status vocabulary: planned → drafted → seams-read → verified; cut / deferred terminal.
`;

describe("parseDraftLedgerSections (BL-100 / REQ-CONV-17)", () => {
  it("parses integer-ordinaled rows", () => {
    const rows = parseDraftLedgerSections(TABLE(["1", "2", "3"]));
    expect(rows.map((r) => r.ordinal)).toEqual([1, 2, 3]);
    expect(draftedSectionCount(TABLE(["1", "2", "3"]))).toBe(2);
  });

  it("parses Roman-numeral `#` cells — every row, integer-ordinaled (D-R7DEM.2c-1)", () => {
    const ords = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV", "XVI", "XVII", "XVIII"];
    const md = TABLE(ords);
    const rows = parseDraftLedgerSections(md);
    expect(rows).toHaveLength(18);
    expect(rows.map((r) => r.ordinal)).toEqual(ords.map((_, i) => i + 1));
    expect(rows[8]!.title).toBe("Sec 9"); // IX → 9, not dropped
    // draftedSectionCount agrees — the completion predicate reads the full row set.
    expect(draftedSectionCount(md)).toBe(9);
  });

  it("mixed/invalid `#` cells still skip non-ordinal lines without dropping real rows", () => {
    const md = TABLE(["1", "II", "III"]);
    expect(parseDraftLedgerSections(md).map((r) => r.ordinal)).toEqual([1, 2, 3]);
    // strict Roman only — a non-numeral cell is not a row
    expect(parseDraftLedgerSections(TABLE(["N/A", "2"])).map((r) => r.ordinal)).toEqual([2]);
  });
});
