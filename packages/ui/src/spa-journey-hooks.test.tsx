// @vitest-environment happy-dom
import { StrictMode } from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";
import { fireEvent } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildRunSheetView } from "@rhema/run-sheet";
import { ConversionPreview } from "./conversion.js";
import { ProjectHomeList, type ProjectRowView } from "./project-list.js";
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
    indicator: "quiet",
    stateLabel: "Draft",
    menuTriggerLabel: "Project actions",
    statusDotLegend: { running: "r", needs_you: "n", ready: "y", quiet: "q", failed: "f" },
    menu: [
      { key: "open", label: "Open", href: "/p/a-project" },
      { key: "delete", label: "Delete", formAction: "/p/a-project/delete" },
    ],
  };
  it("a formAction menu item carries data-menu-form/data-menu-action keyed by the item", async () => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    const el = document.createElement("div");
    document.body.appendChild(el);
    const root = createRoot(el);
    await act(async () => {
      root.render(
        <StrictMode>
          <ProjectHomeList sections={[]} rows={[row]} emptyTitle="None." />
        </StrictMode>,
      );
    });
    // The Radix menu renders its items in a portal when opened — the hooks ride the items.
    const trigger = el.querySelector<HTMLElement>("[data-row-menu]")!;
    await act(async () => {
      fireEvent.click(trigger);
      fireEvent.keyDown(trigger, { key: "ArrowDown" });
    });
    expect(document.querySelector('[data-menu-form="delete"]')).not.toBeNull();
    expect(document.querySelector('[data-menu-action="delete"]')).not.toBeNull();
    // link items never claim the form hook
    expect(document.querySelector('[data-menu-form="open"]')).toBeNull();
    await act(async () => {
      root.unmount();
    });
    el.remove();
  });
});
