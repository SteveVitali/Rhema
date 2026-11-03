import { describe, expect, it } from "vitest";
import {
  composeDeliveredSummary,
  deliveredRecordCounts,
  parseLetterSections,
  SLOT_PATTERNS,
} from "./delivered-summary.js";

// R7COPY.0 (REQ-COPY-4; REQ-SYNC-2; ADR-130) — the record-composed "What it delivered" and the ONE
// count rule, pure fixtures. The composer's contract: verdict quoted VERBATIM from the letter's
// one_thing/Verdict slot, absent when the record has no such section; counts by the single
// findings-vs-strengths rule; links echoed as the caller resolved them. Nothing is generated.

const LETTER = `# The Editor's letter

## Verdict

The draft holds up under every check we could run.

A second paragraph that is never the quote.

## Major findings

Finding one.

## Revision roadmap

Next steps.
`;

describe("parseLetterSections + the verdict slot", () => {
  it("splits on ## headings, skips the H1 title, keeps paragraph bodies", () => {
    const sections = parseLetterSections(LETTER);
    expect(sections.map((s) => s.title)).toEqual(["Verdict", "Major findings", "Revision roadmap"]);
    expect(sections[0]!.paragraphs[0]).toBe("The draft holds up under every check we could run.");
  });

  it("the one_thing slot matches 'Verdict' and 'one thing' headings, first match wins", () => {
    expect(SLOT_PATTERNS.one_thing!.some((p) => p.test("Verdict"))).toBe(true);
    expect(SLOT_PATTERNS.one_thing!.some((p) => p.test("The one thing to take away"))).toBe(true);
    expect(SLOT_PATTERNS.one_thing!.some((p) => p.test("Major findings"))).toBe(false);
  });
});

describe("deliveredRecordCounts — the ONE rule (REQ-SYNC-2)", () => {
  it("a strength-slot row is a strength, never a finding — '5 findings + 1 strength' (R5 C5)", () => {
    const counts = deliveredRecordCounts({
      findings: [
        { letterSection: "major" },
        { letterSection: "major" },
        { letterSection: "roadmap" },
        { letterSection: null },
        { letterSection: "major" },
        { letterSection: "strength" },
      ],
      claims: 6,
    });
    expect(counts).toEqual({ findings: 5, strengths: 1, claims: 6 });
  });

  it("no strengths and no findings produce zeros — never an invented figure", () => {
    expect(deliveredRecordCounts({ findings: [], claims: 0 })).toEqual({
      findings: 0,
      strengths: 0,
      claims: 0,
    });
  });
});

describe("composeDeliveredSummary — the record-composed card block (REQ-COPY-4)", () => {
  const sections = parseLetterSections(LETTER);

  it("quotes the verdict line verbatim (the one_thing slot's first paragraph)", () => {
    const s = composeDeliveredSummary({
      letterSections: sections,
      findings: [{ letterSection: "major" }, { letterSection: "strength" }],
      claims: 3,
      links: ["dossier", "letter", "ledger"],
    });
    expect(s.verdict).toBe("The draft holds up under every check we could run.");
    expect(s.counts).toEqual({ findings: 1, strengths: 1, claims: 3 });
    expect(s.links).toEqual(["dossier", "letter", "ledger"]);
  });

  it("no verdict section ⇒ verdict is null — the card shows no line, never a paraphrase", () => {
    const noVerdict = parseLetterSections(`# L\n\n## Major findings\n\nBody.\n`);
    const s = composeDeliveredSummary({ letterSections: noVerdict, findings: [], claims: 0 });
    expect(s.verdict).toBeNull();
  });

  it("an unread letter (null sections) still composes counts + links without a quote", () => {
    const s = composeDeliveredSummary({
      letterSections: null,
      findings: [{ letterSection: "major" }],
      claims: 2,
      links: ["dossier"],
    });
    expect(s.verdict).toBeNull();
    expect(s.counts).toEqual({ findings: 1, strengths: 0, claims: 2 });
    expect(s.links).toEqual(["dossier"]);
  });

  it("never touches stored walkthrough text — the composer has no input for it", () => {
    // REQ-COPY-4: the composed output is a function of the delivered record only; a historical
    // runs.walkthrough blob (kept, unread, per ADR-130) has no slot in the signature.
    const s = composeDeliveredSummary({ letterSections: sections, findings: [], claims: 0 });
    expect(JSON.stringify(s)).not.toContain("A letter and a claims ledger were delivered.");
  });
});
