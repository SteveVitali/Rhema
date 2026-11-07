import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectHomeList, type ProjectRowView } from "./project-list.js";

// R7HOME.1 (REQ-HOME-1; ADR-128) — the flat, always-expanded list: no collapsed group, no
// QUIET/Unfiled/Sheet labels, attention sections only when non-empty.

const LEGEND = { running: "run", needs_you: "needs", ready: "ready", quiet: "quiet", failed: "failed" };
const row = (over: Partial<ProjectRowView> = {}): ProjectRowView => ({
  id: "p_quiet",
  title: "A quiet project",
  href: "/p/a-quiet-project",
  indicator: "quiet",
  stateLabel: "Draft",
  menuTriggerLabel: "Project actions",
  statusDotLegend: LEGEND,
  menu: [],
  ...over,
});

describe("ProjectHomeList — the flat list (REQ-HOME-1)", () => {
  it("renders every row expanded with no collapsed group and no retired labels", () => {
    const html = renderToStaticMarkup(
      <ProjectHomeList
        sections={[{ key: "needs_you", label: "Waiting on you", rows: [row({ id: "p_n", indicator: "needs_you" })] }]}
        rows={[row()]}
        emptyTitle="No projects."
      />,
    );
    expect(html).toContain('data-attention="needs_you"');
    expect(html).toContain('data-project-list="true"');
    expect(html).not.toContain("data-collapsed-group");
    expect(html).not.toContain("QUIET");
    expect(html).not.toContain("Unfiled");
    expect(html).toContain("Waiting on you · 1");
    expect(html).toContain("A quiet project");
  });

  it("an empty attention section is absent (not rendered at all)", () => {
    const html = renderToStaticMarkup(<ProjectHomeList sections={[]} rows={[row()]} emptyTitle="None." />);
    expect(html).not.toContain("data-attention");
  });

  it("the EmptyState renders when there is nothing at all", () => {
    const html = renderToStaticMarkup(<ProjectHomeList sections={[]} rows={[]} emptyTitle="No projects." />);
    expect(html).toContain('data-project-empty="true"');
    expect(html).toContain("No projects.");
  });
});
