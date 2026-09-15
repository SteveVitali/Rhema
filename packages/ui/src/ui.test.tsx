import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ProjectList, type ProjectRowView } from "./project-list.js";
import { DossierView, honorsContradictedTierOneRule, type DossierClaim, type DossierLabels } from "./dossier.js";

// Presentational contracts for the beta primitives (SSR markup). The AC-level render assertions (with the
// app's copy + sample data) live in apps/web; these lock the component behaviour.

describe("ProjectList", () => {
  it("renders a row's title, pill, and primary action from the view", () => {
    const rows: ProjectRowView[] = [
      {
        title: "The Politics of Visibility",
        href: "/p/the-politics-of-visibility",
        pill: { label: "Edited by you", tone: "attention" },
        action: { label: "Revise using your edits", href: "/p/the-politics-of-visibility" },
      },
    ];
    const html = renderToStaticMarkup(<ProjectList rows={rows} emptyLabel="No projects yet" />);
    expect(html).toContain("The Politics of Visibility");
    expect(html).toContain("Edited by you");
    expect(html).toContain("Revise using your edits");
  });

  it("shows the empty label with no rows", () => {
    expect(renderToStaticMarkup(<ProjectList rows={[]} emptyLabel="No projects yet" />)).toContain(
      "No projects yet",
    );
  });
});

const labels: DossierLabels = {
  letterHeading: "The Editor's letter",
  claimsHeading: "Claims",
  findingsHeading: "Findings",
  readOnlyNote: "A read-only sample.",
  fetchedLabel: "fetched",
  tierLabel: (t) => `Tier ${t}`,
  contradictedTierOneLabel: "Contradicted Tier-1",
};

describe("DossierView (REQ-POS-3)", () => {
  const claims: DossierClaim[] = [
    {
      ordinal: 12,
      text: "The program cut violent crime by a third in its first year.",
      tier: 1,
      verdict: "contradicted",
      verdictLabel: "Contradicted",
      note: "The cited evaluation reports no significant change.",
      fetched: [{ url: "https://www.ojp.gov/report", host: "ojp.gov" }],
    },
    {
      ordinal: 13,
      text: "A supporting factual claim.",
      tier: 2,
      verdict: "verified",
      verdictLabel: "Verified",
      fetched: [{ url: "https://example.org/x", host: "example.org" }],
    },
  ];

  it("renders read-only, with the contradicted Tier-1 claim + its fetched URL chip visible", () => {
    const html = renderToStaticMarkup(
      <DossierView title="Sample" letter={["One paragraph."]} claims={claims} findings={[]} labels={labels} />,
    );
    expect(html).toContain('data-readonly="true"');
    expect(html).toContain("Contradicted Tier-1");
    expect(html).toContain('data-contradicted-tier1="true"');
    // the fetched-URL chip is present and marked fetched
    expect(html).toContain('data-fetched="true"');
    expect(html).toContain("ojp.gov");
    expect(html).toContain("fetched");
    // read-only: no form controls / buttons
    expect(html).not.toContain("<button");
    expect(html).not.toContain("<form");
  });

  it("honorsContradictedTierOneRule detects a contradicted Tier-1 claim with a fetched URL", () => {
    expect(honorsContradictedTierOneRule(claims)).toBe(true);
    expect(honorsContradictedTierOneRule([{ ...claims[0]!, fetched: [] }])).toBe(false);
    expect(honorsContradictedTierOneRule([{ ...claims[0]!, tier: 2 }])).toBe(false);
  });
});
