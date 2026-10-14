import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildRunSheetView } from "@rhema/run-sheet";
import { ConversionPreview } from "./conversion.js";
import { ProjectGroupList, type ProjectGroupView, type ProjectRowView } from "./project-list.js";
import { RunSheet, type RunSheetLabels } from "./run-sheet.js";

// SPA.6 — the renderer-agnostic hooks the journey probes key on (REQ-VFY-4; design/27 §probe
// re-specs). These are the removal-catching tests: dropping `data-conversion-form`, the
// `data-estimate-matrix` embed, or `data-menu-form=<key>` breaks the --surface gates the legs run.

describe("ConversionPreview — the conversion hooks (N3/createDraftProject)", () => {
  const html = renderToStaticMarkup(
    <ConversionPreview
      sourceLabel="Original.md"
      sourceText="# src"
      convertedMarkdown="# converted"
      countLine="3 blocks"
      warnings={[]}
      actions={{
        formAction: "/app/new/create",
        createLabel: "Create project",
        fixNowLabel: "Fix now",
        hiddenFields: { qk: "quarantine/k" },
      }}
      labels={{
        sourceHeading: "Source",
        convertedHeading: "Converted",
        warningsHeading: "Warnings",
        noWarnings: "No warnings.",
        fixNowNote: "note",
      }}
    />,
  );
  it("the action form + both verbs carry the renderer-agnostic hooks", () => {
    expect(html).toContain('data-conversion-form="true"');
    expect(html).toContain('data-conversion-action="create"');
    expect(html).toContain('data-conversion-action="fix_now"');
    // the hidden replay fields still post verbatim
    expect(html).toContain('name="qk"');
    expect(html).toContain('value="quarantine/k"');
  });
});

describe("RunSheet — the typed estimate embed (N4's Included-variant read)", () => {
  const LABELS: RunSheetLabels = {
    rigorLegend: "Rigor",
    runLabel: "Run review",
    confirmLabel: "Confirm and run",
    askLabel: "Ask a question first",
    changeLabel: "Change",
    whyPrefix: "Why this estimate?",
    advancedLegend: "Advanced",
    toggleLabels: {},
  };
  const html = renderToStaticMarkup(
    <RunSheet
      view={buildRunSheetView({
        workflow: "review",
        targetVersion: "v2",
        rigor: "standard",
        modelTier: "balanced",
        inputs: { words: 5180 },
        scope: { protocol: "Essay", venue: "LRB", stage: "near-final", voice: "S." },
        spendableCredits: 100000,
        idempotencyKey: "idem_1",
        insufficientMode: "beta",
      })}
      labels={LABELS}
      runAction="/p/x/run"
    />,
  );
  it("embeds the lever matrix as typed JSON (data-estimate-matrix) alongside the var R= script", () => {
    const m = /<script type="application\/json" data-estimate-matrix="true">(.*?)<\/script>/s.exec(html);
    expect(m, "the estimate-matrix embed").toBeTruthy();
    const R = JSON.parse(m![1]!) as { cells?: Record<string, unknown>; modelTier?: string };
    expect(R.cells && Object.keys(R.cells).length, "the cells map").toBeGreaterThan(0);
    expect(typeof R.modelTier).toBe("string");
    // the no-bundle progressive enhancement is unchanged
    expect(html).toContain("var R=");
    expect(html).toContain('data-run-sheet="review"');
  });
});

describe("ProjectRow menu — the keyed action hooks (T6/T7 delete)", () => {
  const row: ProjectRowView = {
    id: "p_1",
    title: "A project",
    href: "/p/a-project",
    pill: { label: "Draft", tone: "neutral" },
    actions: [
      { key: "open", label: "Open", href: "/p/a-project" },
      { key: "delete", label: "Delete", formAction: "/p/a-project/delete" },
    ],
  };
  const groups: ProjectGroupView[] = [
    { key: "unfiled", label: "Unfiled", rows: [row] },
  ];
  const html = renderToStaticMarkup(<ProjectGroupList groups={groups} emptyLabel="None." />);
  it("a formAction menu item carries data-menu-form/data-menu-action keyed by the item", () => {
    expect(html).toContain('data-menu-form="delete"');
    expect(html).toContain('data-menu-action="delete"');
    // link items never claim the form hook
    expect(html).not.toContain('data-menu-form="open"');
  });
});
