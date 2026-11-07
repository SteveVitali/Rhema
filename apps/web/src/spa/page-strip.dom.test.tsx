// @vitest-environment happy-dom
//
// R7WRITE.1a (REQ-WRITE-6; B4, B5, B11) — the page header strip's DOM contract:
//   - the strip renders the breadcrumb, the version chip (frozen/working badge), the sync pill,
//     the ReadOnlyProject notice and the Run ▾ / Export / ⋯ actions ABOVE `.paper`;
//   - `.paper` itself (the `PageEditor`'s `data-page-root`) contains NO banner, pill or
//     proposal card — they moved out;
//   - a ReadOnlyProject reason withholds every write action before any request can fire.

import { describe, expect, it, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { PageEditor } from "@rhema/ui";
import { pageLabels, pageStripFor, type PageChromeBag } from "../page-chrome.js";
import { COPY } from "../copy.js";

const PAGE = {
  slug: "demo",
  projectId: "proj_1",
  doc: {
    draftId: "d_1",
    draftN: 3,
    origin: "human_revision",
    state: "open",
    baseDraftId: null,
    baseDraftN: null,
    markdown: "x",
    sha256: null,
    lock: null,
    findings: [],
    proposals: [{ id: "p_1", kind: "replace" as const, from: 0, to: 0, markdown: "m", origin: "agent:x", label: "Swap" }],
  },
  docJson: { type: "doc", content: [] },
} as unknown as PageChromeBag;

afterEach(() => cleanup());

describe("R7WRITE.1a — the page header strip (REQ-WRITE-6)", () => {
  it("renders crumb + version chip + sync pill + notice + Run▾/Export/⋯", () => {
    const { container } = render(
      pageStripFor(PAGE, { projectTitle: "Demo Project" }) as JSX.Element,
    );
    const strip = container.querySelector("[data-page-strip]");
    expect(strip).not.toBeNull();
    // the breadcrumb: Project link + the Page tail
    expect(strip?.querySelector("[data-page-breadcrumb]")).not.toBeNull();
    const link = strip?.querySelector("[data-breadcrumb-link]");
    expect(link?.getAttribute("href")).toBe("/p/demo");
    expect(link?.textContent).toBe("Demo Project");
    expect(strip?.textContent).toContain(COPY.pageStrip.pageCrumb);
    // the version chip: v3 + the working badge
    const chip = strip?.querySelector("[data-version-chip]");
    expect(chip?.getAttribute("data-version-state")).toBe("working");
    expect(chip?.textContent).toContain("v3");
    expect(chip?.querySelector("[data-version-badge]")?.textContent).toBe(COPY.pageStrip.workingBadge);
    // the moved sync indicator
    expect(strip?.querySelector("[data-sync-pill]")).not.toBeNull();
    // the actions: Run ▾ (a real menu), Export, ⋯
    const actions = strip?.querySelector("[data-page-actions]");
    expect(actions?.querySelector("[data-run-menu]")).not.toBeNull();
    expect(actions?.querySelector("[data-export-link]")?.getAttribute("href")).toBe("/p/demo/export");
    expect(actions?.querySelector("[data-more-menu]")).not.toBeNull();
    // the moved proposal card lives in the strip
    expect(strip?.querySelector("[data-proposal-card]")).not.toBeNull();
  });

  it("a frozen version shows the frozen badge; a working head shows working", () => {
    const frozen = {
      ...PAGE,
      doc: { ...PAGE.doc, state: "frozen", draftN: 2 },
    } as unknown as PageChromeBag;
    const { container } = render(pageStripFor(frozen, { projectTitle: "D" }) as JSX.Element);
    const chip = container.querySelector("[data-version-chip]");
    expect(chip?.getAttribute("data-version-state")).toBe("frozen");
    expect(chip?.querySelector("[data-version-badge]")?.textContent).toBe(COPY.pageStrip.frozenBadge);
  });

  it("a ReadOnlyProject reason withholds every write action — no affordance to fire (S-3)", () => {
    for (const reason of ["demo", "showcase", "run_lock"] as const) {
      cleanup();
      const { container } = render(
        pageStripFor(PAGE, {
          projectTitle: "D",
          readOnlyReason: reason,
        }) as JSX.Element,
      );
      expect(container.querySelector("[data-page-actions]"), reason).toBeNull();
      // the write surfaces withheld BEFORE any request: proposal buttons disabled w/ the reason
      const accept = container.querySelector("[data-proposal-accept]") as HTMLButtonElement | null;
      expect(accept?.disabled, reason).toBe(true);
      expect(accept?.title).toBe(COPY.readOnly.reason[reason]);
    }
  });

  it(".paper's PageEditor emits NO banner, pill or proposal card (the move-out AC)", () => {
    const { container } = render(
      <PageEditor
        docJson={{ type: "doc", content: [] }}
        docUrl="/p/demo/edit/d_1/doc"
        draftId="d_1"
        draftN={3}
        markdown="x"
        sha256="s"
        findings={[]}
        provenance={null}
        proposals={[]}
        origin="human_revision"
        baseDraftN={null}
        versionLabel="v3"
        versionNote=""
        danglingCites={[]}
        labels={pageLabels}
        lock={null}
      />,
    );
    const root = container.querySelector("[data-page-root]");
    expect(root).not.toBeNull();
    for (const hook of ["data-sync-pill", "data-page-banner", "data-proposal-card", "data-proposals-rail"]) {
      expect(root?.querySelector(`[${hook}]`), hook).toBeNull();
    }
    // the doc itself + the rail + note form remain
    expect(root?.querySelector("[data-page-host]")).not.toBeNull();
  });
});
