import { describe, expect, it } from "vitest";
import { convertClaimLedger } from "./claim-ledger.js";
import { parseSecondRead } from "./second-read.js";
import { convertStructurePlan } from "./structure-plan.js";
import { convertResponseLedger } from "./response-ledger.js";
import { readConvertOverrides, OverrideBook } from "./overrides.js";

// REQ-CONV-12 item 9 — the real-data parse variants, exercised on SYNTHESIZED inputs before the
// real corpus ran: the wrapped/annotated `## Summary` line and `Skipped` id-lists (GM/POV/CoR),
// GM v2's `### 2.1` second-read labels, GM's `# | Header` Section-map header + totals row, and
// the authoritative `minor-finding`/`disposition` override semantics (precedence over positional
// resolution, ledger-file-scoped takes).

const DRAFT = `# Draft\n\nLine one of the draft text.\nLine two continues.\n`;

describe("summary counts on real-ledger shapes (R2 §2.1)", () => {
  const LEDGER = `# Claim ledger

- Checked: 2026-09-01

## Summary

- Claims inventoried: 5 (T1: 2 · T2: 1 · T3: 2)
- Checked: 3 — Verified: 1 · Substantially accurate: 0 ·
  Misleading in context: 1 (C2, re-scored by the editor's note; the fix list stands)
  Unsupported: 0 · Contradicted: 0 · Unverifiable: 1 (C3, source unreachable)
- Skipped (with reason): C4 (evaluative, no factual predicate); C5 (metaphor)
- Major-issue escalations: none

### C1 · Tier 1 · Verified

C1 rests on the draft's first line.

> Line one of the draft text.

### C2 · Tier 1 · Misleading in context

C2 rests on the draft's second line.

> Line two continues.

### C3 · Tier 2 · Unverifiable

C3 quotes "the draft text" of the draft.

> the draft text

### C4 · Tier 3 · Skipped

(not scored — evaluative)

> Line one of the draft text.

### C5 · Tier 3 · Skipped

(not scored — metaphor)

> Line two continues.
`;

  it("a wrapped, annotated `·` line counts every verdict item once", () => {
    const r = convertClaimLedger(LEDGER, { draftMarkdown: DRAFT });
    if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
    // emitted: v1·Verified + C2·mic + C3·unverifiable + C4/C5 skipped→unverifiable
    expect(r.value.meta.summaryCounts).toMatchObject({
      verified: 1,
      misleading_in_context: 1,
      unverifiable: 1,
    });
    // the skipped id-list counts C4/C5 into unverifiable because both are emitted headed claims
    expect(r.value.meta.summaryReconciled).toBe(true);
  });

  it("skipped declarations named only in reason prose are not counted", () => {
    const prose = LEDGER.replace(
      "C4 (evaluative, no factual predicate); C5 (metaphor)",
      'pure evaluatives ("the most cited phrase"); predicates checked under C1, C2',
    );
    const r = convertClaimLedger(prose, { draftMarkdown: DRAFT });
    if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
    // C1/C2 are emitted but not skipped — the summary unverifiable stays 1, emitted has 3
    expect(r.value.meta.summaryReconciled).toBe(false);
  });
});

describe("second-read `2.1`-style objection labels (GM v2)", () => {
  it("a bare dotted label parses as the objection's own label", () => {
    const md = `# Second read\n\n## Objections\n\n### 2.1 The lede exhibits a tension\n\nBody one.\n\n### 2.4 Another objection\n\nBody two.\n\n## Verdict\n\nFine.\n`;
    const p = parseSecondRead(md);
    expect(p.unlabeled).toEqual([]);
    expect(p.objections.map((o) => o.label)).toEqual(["2.1", "2.4"]);
    expect(p.objections[0]!.title).toContain("The lede");
  });
});

describe("structure-plan `# | Header` Section-map variant (GM)", () => {
  it("parses #/Header columns and skips the totals row", () => {
    const md = `# Structure plan\n\n## The spine\n\n- first the lede\n- then the body\n\n## Section map\n\n| # | Header | Function (claim) | Entry state | Exit state | Material | Budget |\n|---|---|---|---|---|---|---|\n| §I | Lede | frame | cold | warm | intro | 800 |\n| §II | Body | argue | warm | done | body | 1200 |\n| | | | | | **Total** | **2,000** |\n`;
    const r = convertStructurePlan(md);
    if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
    expect(r.value.sidecar.sections).toHaveLength(2);
    expect(r.value.sidecar.sections[0]).toMatchObject({
      ref: "§I",
      title: "Lede",
      targetWords: 800,
    });
    expect(r.value.sidecar.sections[1]!.ref).toBe("§II");
  });
});

describe("minor-finding / disposition overrides are authoritative and file-scoped", () => {
  const LEDGER = `# Response ledger\n\n| Row | Source | Item | Disposition | Status | Evidence |\n|---|---|---|---|---|---|\n| F1 | Letter minor; ledger X10 | a fix | accept | done | — |\n| F2 | Letter minor | another fix | accept | done | — |\n`;

  const labels = [
    { ordinal: 0, id: "Minor 1", section: "Minor" },
    { ordinal: 1, id: "Minor 2", section: "Minor" },
  ];

  function book(rows: unknown[]) {
    const f = readConvertOverrides({ version: 1, overrides: rows });
    if (!f.ok) throw new Error("bad overrides");
    return OverrideBook.from(f.value);
  }

  it("an override for a minor row wins over the positional assignment", () => {
    // positional would give F1 → Minor 1; the override states it answers Minor 2
    const r = convertResponseLedger(LEDGER, {
      findingLabels: labels,
      overrides: book([
        { kind: "minor-finding", row: "F1", finding: "Minor 2", cite: "x/v9-response-ledger.md:1" },
      ]),
      file: "x/v9-response-ledger.md",
    });
    if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
    const e = r.value.sidecar.entries.find((x) => x.findingOrdinal === 1);
    expect(e).toBeTruthy();
    // F2 positionally joins Minor 1 (the second minor-source row would position to Minor 2,
    // but F1's override consumed the override row — positional is by row order, not usage)
    expect(r.value.sidecar.entries.map((x) => x.findingOrdinal)).toEqual([1, 0]);
  });

  it("a disposition override also resolves an unmapped cell", () => {
    const l = LEDGER.replace(
      "| F2 | Letter minor | another fix | accept | done | — |",
      "| F2 | Letter minor | another fix | awaiting the author | escalated | — |",
    );
    const r = convertResponseLedger(l, {
      findingLabels: labels,
      overrides: book([
        { kind: "disposition", row: "F2", disposition: "defer", cite: "x/v9-response-ledger.md:2" },
      ]),
      file: "x/v9-response-ledger.md",
    });
    if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
    expect(
      r.value.sidecar.entries.find((x) => x.findingOrdinal === 1)?.disposition,
    ).toMatchObject({ kind: "defer", status: "escalated" });
  });

  it("a row-scoped override citing a DIFFERENT ledger file is not this pass's to judge", () => {
    // same row id exists in v1's ledger; the override cites v2 — the v1 pass neither takes it
    // nor fails it unconsumed (the pipeline's end-check still guards staleness)
    const r = convertResponseLedger(LEDGER, {
      findingLabels: labels,
      overrides: book([
        { kind: "minor-finding", row: "F1", finding: "Minor 2", cite: "x/v2-response-ledger.md:1" },
      ]),
      file: "x/v1-response-ledger.md",
    });
    if (!r.ok) throw new Error(JSON.stringify(r.diagnostics));
    expect(r.value.sidecar.entries.map((x) => x.findingOrdinal)).toEqual([0, 1]);
  });
});
