import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { themeCss } from "@rhema/tokens";
import { ProjectGroupList, type ProjectGroupView, type ProjectRowView } from "./project-list.js";

// HOT.1 (REQ-IDE-4) — the Quiet group ships collapsed by default AND carries a visible affordance:
// a ▸ marker + a Show/Hide cue (PR-J5's bug was a summary with the native marker suppressed and no
// replacement, so the group looked empty).

const row: ProjectRowView = {
  id: "p_quiet",
  title: "A quiet project",
  href: "/p/a-quiet-project",
  pill: { label: "Quiet", tone: "neutral" },
};

const groups: ProjectGroupView[] = [
  { key: "quiet", label: "Quiet", collapsed: true, summary: "1 Unfiled · 0 with a Voice", rows: [row] },
];

describe("ProjectGroupList — the collapsed Quiet affordance (HOT.1, REQ-IDE-4)", () => {
  const html = renderToStaticMarkup(<ProjectGroupList groups={groups} emptyLabel="No projects." />);

  it("renders the group collapsed (a <details> with no open attribute)", () => {
    expect(html).toContain('data-collapsed-group="quiet"');
    const details = html.match(/<details[^>]*data-collapsed-group="quiet"[^>]*>/)![0];
    expect(details).not.toContain("open");
  });

  it("the summary carries an explicit marker + a Show cue (listStyle:none suppressed the native one)", () => {
    expect(html).toContain('data-collapsed-marker="true"');
    expect(html).toContain("▸");
    expect(html).toContain('data-cue-when-closed="true"');
    expect(html).toContain("· Show");
    expect(html).toContain('data-cue-when-open="true"');
    expect(html).toContain("· Hide");
    // and the sub-counts summary still renders
    expect(html).toContain("Quiet · 1");
    expect(html).toContain("1 Unfiled · 0 with a Voice");
  });

  it("themeCss carries the open-state rules the marker + cues depend on (no-JS state feedback)", () => {
    const css = themeCss();
    expect(css).toContain("[data-collapsed-marker]");
    expect(css).toContain("[data-cue-when-open]");
    expect(css).toContain("[data-cue-when-closed]");
    expect(css).toContain("rotate(90deg)");
  });

  it("the rows still render inside the collapsed details (hidden by the browser, present for no-JS+a11y)", () => {
    expect(html).toContain("A quiet project");
  });
});
