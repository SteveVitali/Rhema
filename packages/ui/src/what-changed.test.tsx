import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import {
  buildRubricDelta,
  buildWhatChangedView,
  diffMarkdown,
  type ObligationLineInput,
} from "@rhema/findings-core";
import {
  WhatChangedView,
  RubricDelta,
  type WhatChangedLabels,
  type RubricDeltaLabels,
} from "./index.js";

// PRB.06 — the What-changed golden render (AC1): the §5.8 Inline layout — summary strip, move cards with
// obligation discharge lines + joined hunks, the Unlinked group, and rebutted cards (rationale, NO hunk) —
// plus the per-dimension rubric delta with no aggregate (REQ-IDE-30).

// two changed regions separated by unchanged blocks → two hunks: h1 (the edited pillar, claimed by Move 1's
// evidence anchor) and h2 (the trailing addition no move claims → Unlinked).
const BEFORE = [
  "# Draft",
  "",
  "The pillar stands on the old claim.",
  "",
  "A middle section that stays.",
  "",
  "A digression about method.",
].join("\n");
const AFTER = [
  "# Draft",
  "",
  "The pillar stands on the restated claim.",
  "",
  "A middle section that stays.",
  "",
  "A digression about method.",
  "",
  "A new paragraph the move added.",
].join("\n");

const labels: WhatChangedLabels = {
  heading: "What changed",
  versionLabel: (b, a) => `v${b} → v${a ?? "?"}`,
  stripLabel: (s) => `${s.addressed} obligations addressed · ${s.rebutted} rebutted · ${s.stillOpen} still open`,
  moveHeading: (m) => `Move ${m.moveOrdinal} · ${m.title}`,
  findingLine: (f) => `F-${String(f.findingOrdinal).padStart(2, "0")} · ${f.kind}`,
  dischargeLine: (l) =>
    `discharges ${l.label} ${l.lineage ?? ""}${l.verifiedBy === "gap_check" ? " — verified by gap check" : ""}`,
  hunkKindLabel: (k) => k,
  unlinkedHeading: "Unlinked changes",
  rebuttedHeading: "Rebutted findings",
  rebutLabel: "Rebutted",
  commentLabel: "Comment on this change",
  commentPlaceholder: "A note for the next Revise",
  commentSubmit: "Send",
};

function view() {
  const diff = diffMarkdown(BEFORE, AFTER);
  const discharge: ObligationLineInput = {
    obligationId: "obl_1",
    label: "OBL-1",
    lineage: "(F-01, carried from v2)",
    verifiedBy: "gap_check",
    state: "discharged",
  };
  return buildWhatChangedView(diff, {
    entries: [
      {
        findingOrdinal: 1,
        findingId: "fnd_1",
        title: "weak pillar",
        severity: "major",
        kind: "accept",
        status: "verified",
        moveOrdinal: 1,
        anchor: { blockId: "b2", quote: "restated claim", startOffset: 0, endOffset: 0, confidence: 1 },
      },
      { findingOrdinal: 2, findingId: "fnd_2", title: "digression", severity: "minor", kind: "rebut", rationale: "the digression earns its place" },
    ],
    moves: [{ ordinal: 1, title: "Restate the pillar", type: "argument" }],
    obligationLines: { 1: [discharge] },
    strip: { addressed: 1, rebutted: 1, stillOpen: 2 },
  });
}

describe("WhatChangedView golden render (PRB.06 AC1; §5.8)", () => {
  const html = renderToStaticMarkup(
    <WhatChangedView view={view()} beforeN={2} afterN={3} commentFormAction={(h) => `/x/${h}/comments`} labels={labels} />,
  );

  it("renders the header: heading, version line, and the summary strip", () => {
    expect(html).toContain("What changed");
    expect(html).toContain("v2 → v3");
    expect(html).toContain("1 obligations addressed · 1 rebutted · 2 still open");
  });

  it("renders the move card with its answered finding + obligation discharge line + joined hunk", () => {
    expect(html).toContain('data-move-card="M1"');
    expect(html).toContain("Move 1 · Restate the pillar");
    expect(html).toContain("F-01 · accept");
    expect(html).toContain("discharges OBL-1 (F-01, carried from v2) — verified by gap check");
    // the edited pillar block joined the move via its discharge-evidence anchor.
    expect(html).toContain('data-hunk="h1"');
    expect(html).toContain("The pillar stands on the old claim.");
    expect(html).toContain("The pillar stands on the restated claim.");
  });

  it("groups the unclaimed hunk under Unlinked and renders the rebutted card rationale-only", () => {
    expect(html).toContain('data-unlinked-group');
    expect(html).toContain("Unlinked changes");
    expect(html).toContain("A new paragraph the move added.");
    expect(html).toContain('data-rebutted-finding="2"');
    expect(html).toContain("the digression earns its place");
    // the rebutted card carries NO hunk markup inside its section.
    const start = html.indexOf('data-rebutted-finding="2"');
    const rebutSection = html.slice(start, html.indexOf("</section>", start));
    expect(rebutSection).not.toContain("data-hunk=");
  });

  it("renders a no-JS comment form per hunk (a Guidance row for the next Revise)", () => {
    expect(html).toContain('data-hunk-comment="h1"');
    expect(html).toContain('action="/x/h1/comments"');
    expect(html).toContain('action="/x/h2/comments"');
  });
});

describe("RubricDelta golden render (PRB.06; REQ-IDE-30)", () => {
  const deltaLabels: RubricDeltaLabels = {
    heading: "Rubric delta",
    dimensionLabel: (d) => `dim:${d}`,
    beforeLabel: "v2",
    afterLabel: "v3",
  };
  const view = buildRubricDelta(
    [
      { dimension: "argument_rigor", score: 2 },
      { dimension: "structure", score: 4 },
      { dimension: "craft", score: 3 },
    ],
    [
      { dimension: "argument_rigor", score: 4 },
      { dimension: "structure", score: 4 },
      { dimension: "evidence_accuracy", score: 5 },
    ],
  );
  const html = renderToStaticMarkup(<RubricDelta view={view} labels={deltaLabels} />);

  it("renders one row per dimension with direction markers, incl. new/dropped rows", () => {
    expect(html).toContain('data-rubric-delta-row="argument_rigor" data-direction="up"');
    expect(html).toContain('data-rubric-delta-row="structure" data-direction="same"');
    expect(html).toContain('data-rubric-delta-row="evidence_accuracy" data-direction="new"');
    expect(html).toContain('data-rubric-delta-row="craft" data-direction="dropped"');
  });

  it("exposes NO aggregate — no total/average/overall anywhere in the DOM (REQ-IDE-30)", () => {
    expect(html).not.toMatch(/total|average|overall|aggregate/i);
    // the view model itself carries rows only — no aggregate field exists to render.
    expect(Object.keys(view)).toEqual(["rows"]);
  });
});
