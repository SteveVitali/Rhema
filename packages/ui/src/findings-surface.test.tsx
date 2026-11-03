import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { Anchor, FindingView } from "@rhema/contracts";
import { groupFindingsForList, marginItems, sectionedTriageQueue } from "@rhema/findings-core";
import { MarginSurface } from "./margin.js";
import { FindingsDesk, type FindingsDeskLabels } from "./findings-desk.js";
import type { MarginLabels } from "./margin.js";

// P1.07 — the Margin surface + the Desk findings tab render the shared derivations verbatim:
// cards/chips per `marginItems`, the sectioned triage queue + progress pill, the filter bar echoing
// the URL's GET params, linked-selection data attributes, and the Apply affordance's anchor.

const user = { kind: "user", userId: "u_1" } as const;

function view(over: Partial<FindingView>): FindingView {
  return {
    id: "f_1",
    correspondenceId: "c_1",
    draftId: "d_1",
    kind: "argument",
    severity: "major",
    origin: "editor",
    anchor: null,
    title: "t",
    body: "b",
    rubricDims: [],
    provisional: false,
    ...over,
  };
}

const anchorAt = (blockId: string): Anchor => ({
  blockId,
  startOffset: 0,
  endOffset: 4,
  quote: "the ",
  confidence: 1,
});

const marginLabels: MarginLabels = {
  kindLabel: (k) => k,
  severityLabel: (s) => s,
  provisionalLabel: "streaming…",
  chipLabel: (counts, top, topCount) =>
    `${counts.findings} findings${counts.strengths > 0 ? ` · ${counts.strengths} strength` : ""} · ${topCount} ${top}`,
  chipAria: (count) => `${count} findings stacked`,
};

const deskLabels: FindingsDeskLabels = {
  table: { finding: "Finding", severity: "Severity", kind: "Kind", status: "Status", actions: "" },
  empty: "No findings on this round.",
  filters: { severity: "Severity", kind: "Kind", status: "Status", apply: "Filter", clear: "Clear", allLabel: "All" },
  severityLabel: (s) => s,
  kindLabel: (k) => k,
  statusLabel: (v) => (v.disposition ? v.disposition.kind : "undecided"),
  progressFmt: (d, t) => `${d} of ${t} decided`,
  triageExit: "Exit triage",
};

describe("MarginSurface (§5.7 — cards beside passages, chips for crowds)", () => {
  it("renders a card per lone finding and a <details> chip per crowded paragraph", () => {
    const views = [
      view({ id: "a", anchor: anchorAt("p1"), severity: "minor" }),
      view({ id: "b", anchor: anchorAt("p1"), severity: "blocking" }),
      view({ id: "c", anchor: anchorAt("p2") }),
    ];
    const html = renderToStaticMarkup(
      <MarginSurface items={marginItems(views)} labels={marginLabels} />,
    );
    expect(html).toContain('data-margin-surface="true"');
    // p1's pair collapsed to a chip; p2's lone finding is a card.
    expect(html).toContain('data-margin-chip="p1"');
    expect(html).toContain("2 findings · 1 blocking");
    expect(html.match(/data-margin-card="true"/g)).toHaveLength(3); // 2 inside the chip + 1 lone
    expect(html).toContain('id="finding-c"');
  });

  it("marks suggestion-carrying cards + the linked-selection id", () => {
    const views = [view({ id: "s", anchor: anchorAt("p"), suggestion: { replacement: "x" } })];
    const html = renderToStaticMarkup(
      <MarginSurface items={marginItems(views)} labels={marginLabels} selectedId="s" />,
    );
    expect(html).toContain('data-suggestion="1"');
    expect(html).toContain('data-selected="true"');
  });
});

describe("FindingsDesk (§5.7 — the screen-reader landmark, one model)", () => {
  it("renders the grouped table with section headers, row anchors, and obligation chips", () => {
    const views = [
      view({ id: "w", anchor: null, severity: "note", title: "whole-piece note" }),
      view({ id: "p", anchor: anchorAt("p1"), title: "para finding" }),
    ];
    const html = renderToStaticMarkup(
      <FindingsDesk
        groups={groupFindingsForList(views)}
        labels={deskLabels}
        obligationFor={(v) => (v.id === "p" ? { state: "open", label: "Open" } : undefined)}
      />,
    );
    expect(html).toContain('data-findings-desk="true"');
    expect(html).toContain("Whole piece");
    expect(html).toContain('data-desk-row="p"');
    expect(html).toContain('href="#finding-p"');
    expect(html).toContain("Open");
  });

  it("renders the filter bar echoing the GET params", () => {
    const html = renderToStaticMarkup(
      <FindingsDesk
        groups={groupFindingsForList([view({ id: "x" })])}
        labels={deskLabels}
        filterAction="/p/slug/review/run_1"
        filters={{ severity: "major" }}
        severityOptions={[{ value: "major", label: "Major" }]}
      />,
    );
    expect(html).toContain('data-findings-filters="true"');
    expect(html).toContain('name="sev"');
    expect(html).toContain('value="major" selected'); // defaultValue → selected attr in SSR
  });

  it("triage mode renders the sectioned queue + progress pill + decided status", () => {
    const views = [
      view({ id: "a", severity: "minor", letterSection: "strength" }),
      view({ id: "b", severity: "blocking", letterSection: "strength", title: "the blocking one" }),
      view({ id: "c", severity: "note", disposition: { kind: "accept", by: user, at: "t", frozen: false } }),
    ];
    const q = sectionedTriageQueue(views);
    const html = renderToStaticMarkup(
      <FindingsDesk groups={groupFindingsForList(views)} labels={deskLabels} triage={q} />,
    );
    expect(html).toContain('data-triage-mode="true"');
    expect(html).toContain("1 of 3 decided");
    expect(html).toContain('data-triage-section="strength"');
    expect(html).toContain('data-triage-section="whole"');
    // within the section, blocking precedes minor.
    const iB = html.indexOf('data-desk-row="b"');
    const iA = html.indexOf('data-desk-row="a"');
    expect(iB).toBeLessThan(iA);
  });

  it("the empty state + bulk action slot render", () => {
    const html = renderToStaticMarkup(
      <FindingsDesk groups={[]} labels={deskLabels} bulkActions={<button>Apply all notes</button>} />,
    );
    expect(html).toContain('data-findings-empty="true"');
    expect(html).toContain("Apply all notes");
  });
});
