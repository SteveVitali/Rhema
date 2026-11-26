import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { diffMarkdown } from "@rhema/findings-core";
import { CompareView, type CompareLabels } from "./compare.js";
import type { WhatChangedLabels } from "./what-changed.js";

// 333_R7UX.10 (BL-88) — the compare view's word-level marks: inside a changed paragraph the
// inserted/deleted WORDS get the stronger mark (<ins>/<del> `data-diff-word`) while the paragraph
// cell keeps its tint; unchanged paragraphs and wholesale remove+add pairs get no word marks.

const moves: WhatChangedLabels = {
  heading: "What changed",
  versionLabel: (b, a) => `v${b} → v${a ?? "?"}`,
  stripLabel: () => "0 addressed · 0 rebutted · 0 open",
  moveHeading: (m) => `Move ${m.moveOrdinal}`,
  findingLine: (f) => `F-${f.findingOrdinal} · ${f.kind}`,
  dischargeLine: (l) => `discharges ${l.label}`,
  hunkKindLabel: (k) => k,
  unlinkedHeading: "Unlinked changes",
  rebuttedHeading: "Rebutted findings",
  rebutLabel: "Rebutted",
  commentLabel: "Comment on this change",
  commentPlaceholder: "A note for the next Revise",
  commentSubmit: "Send",
};

const labels: CompareLabels = {
  heading: "Compare versions",
  versionLabel: (b, a) => `v${b} → v${a ?? "?"}`,
  layouts: { side: "Side by side", inline: "Inline", moves: "What changed" },
  beforeCol: "Before",
  afterCol: "After",
  unchangedFmt: (n) => `${n} unchanged`,
  hunkKindLabel: (k) => k,
  unlinkedNote: "edits not tied to a finding (coherence read)",
  noChanges: "No changes",
  commentLabel: "Comment on this change",
  commentPlaceholder: "A note for the next Revise",
  commentSubmit: "Send",
  moves,
};

// an edited paragraph pair (word-level change), a wholesale remove+add pair (below the pairing
// floor), a pure addition, and an unchanged paragraph that collapses into the count line.
const BEFORE = [
  "The pillar stands on the old claim.",
  "",
  "Alpha beta gamma delta epsilon zeta.",
  "",
  "This paragraph survives the revision untouched.",
].join("\n\n");
const AFTER = [
  "The pillar stands on the restated claim.",
  "",
  "One two three four five six.",
  "",
  "This paragraph survives the revision untouched.",
  "",
  "A brand new paragraph the revision added.",
].join("\n\n");

const EMPTY_VIEW = {
  strip: { addressed: 0, rebutted: 0, stillOpen: 0, moves: 0, hunks: 0 },
  moves: [],
  unlinked: { hunks: [], entries: [] },
  rebutted: [],
} as never;

function renderCompare(layout: "side" | "inline") {
  return renderToStaticMarkup(
    <CompareView
      beforeN={6}
      afterN={7}
      layout={layout}
      diff={diffMarkdown(BEFORE, AFTER)}
      view={EMPTY_VIEW}
      linked={false}
      layoutHref={(l) => `/p/x/v/6/diff/7?layout=${l}`}
      labels={labels}
    />,
  );
}

describe("compare view word marks (BL-88)", () => {
  it("side layout: the edited pair marks deleted/inserted words inside the tinted cells", () => {
    const html = renderCompare("side");
    expect(html).toContain('data-diff-word="deleted"');
    expect(html).toContain('data-diff-word="inserted"');
    // the marked spans carry exactly the changed words.
    expect(html).toMatch(/<del[^>]*data-diff-word="deleted"[^>]*>old<\/del>/);
    expect(html).toMatch(/<ins[^>]*data-diff-word="inserted"[^>]*>restated<\/ins>/);
    // the paragraph cells still carry the block tint classes.
    expect(html).toContain("ui-d-cell--del");
    expect(html).toContain("ui-d-cell--add");
    // unchanged context collapses to the count line — never renders word marks.
    expect(html).toContain("1 unchanged");
    expect(html).not.toContain("survives the revision");
  });

  it("side layout: a below-floor pair and a pure addition get no word marks", () => {
    const html = renderCompare("side");
    // the wholesale replace pair renders as plain tinted cells — no <del>/<ins> marks inside.
    const alphaCell = /<div[^>]*ui-d-cell--del[^>]*>Alpha beta[\s\S]*?<\/div>/.exec(html);
    expect(alphaCell?.[0]).not.toContain("data-diff-word");
    const oneCell = /<div[^>]*ui-d-cell--add[^>]*>One two[\s\S]*?<\/div>/.exec(html);
    expect(oneCell?.[0]).not.toContain("data-diff-word");
    const addedCell = /<div[^>]*ui-d-cell--add[^>]*>A brand new[\s\S]*?<\/div>/.exec(html);
    expect(addedCell?.[0]).not.toContain("data-diff-word");
  });

  it("inline layout: the same word marks nest inside the sequential hunk list", () => {
    const html = renderCompare("inline");
    expect(html).toContain('data-compare-layout="inline"');
    expect(html).toMatch(/<del[^>]*data-diff-word="deleted"[^>]*>old<\/del>/);
    expect(html).toMatch(/<ins[^>]*data-diff-word="inserted"[^>]*>restated<\/ins>/);
  });
});
