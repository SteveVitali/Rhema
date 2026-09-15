import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { buildRunSheetView } from "@rhema/run-sheet";
import { RunSheet, RunButton, Paywall, type RunSheetLabels } from "./run-sheet.js";

const LABELS: RunSheetLabels = {
  rigorLegend: "Rigor",
  runLabel: "Run review",
  confirmLabel: "Confirm and run",
  askLabel: "Ask a question first",
  changeLabel: "Change",
  whyPrefix: "Why this estimate?",
  advancedLegend: "Advanced",
  toggleLabels: { fact_check: "Fact-check", discourse: "Map the field", second_read: "Second read" },
};

function view(over: Partial<Parameters<typeof buildRunSheetView>[0]> = {}) {
  return buildRunSheetView({
    workflow: "review",
    targetVersion: "v2",
    rigor: "standard",
    modelTier: "balanced",
    inputs: { words: 5180 },
    scope: { protocol: "Essay", venue: "LRB", stage: "near-final", voice: "S. J. Sebastian" },
    spendableCredits: 100000,
    idempotencyKey: "idem_1",
    insufficientMode: "beta",
    ...over,
  });
}

describe("RunSheet (§5.6 launcher)", () => {
  it("renders the title line, dollars-first estimate box and credits second line", () => {
    const html = renderToStaticMarkup(<RunSheet view={view()} labels={LABELS} runAction="/p/x/run" />);
    expect(html).toContain("Review v2 · 5,180 words · 21 claims");
    expect(html).toContain("≈ $"); // dollars first
    expect(html).toContain("never more than");
    expect(html).toContain("credits"); // second line
    expect(html).toContain("Essay · LRB · near-final · Balanced · S. J. Sebastian");
    expect(html).toContain('data-paywall="run-sheet"'); // the single paywall mount
    expect(html).not.toMatch(/token/i); // AC6: tokens nowhere
  });

  it("shows 'Confirm and run' and a consent flag when the estimate crosses the threshold", () => {
    const html = renderToStaticMarkup(
      <RunSheet view={view({ rigor: "full_board", modelTier: "frontier", inputs: { words: 8000, claims: 45 } })} labels={LABELS} runAction="/p/x/run" />,
    );
    expect(html).toContain("Confirm and run");
    expect(html).toContain('data-needs-consent="true"');
  });

  it("becomes the resolution panel (three sentences) and disables Run when the cap exceeds spendable", () => {
    const html = renderToStaticMarkup(<RunSheet view={view({ spendableCredits: 40 })} labels={LABELS} runAction="/p/x/run" />);
    expect(html).toContain('data-insufficient="true"');
    expect(html).toContain("more than your spendable balance");
    expect(html).toContain("Or ask for more credits.");
    expect(html).toContain("disabled"); // Run button blocked
  });

  it("shows the Advanced per-phase toggles with signed deltas and the obligation scope line", () => {
    const html = renderToStaticMarkup(
      <RunSheet view={view({ scopeLine: "4 open obligations will be checked" })} labels={LABELS} runAction="/p/x/run" />,
    );
    expect(html).toContain("Fact-check");
    expect(html).toMatch(/[−+]\d/); // a signed delta
    expect(html).toContain("4 open obligations will be checked");
  });

  it("RunButton renders its estimate (REQ-GROWTH-16) and the consent label when needed", () => {
    const html = renderToStaticMarkup(
      <RunButton estimate={{ estimateCredits: 600, capCredits: 900 }} label="Run review" confirmLabel="Confirm and run" needsSecondClick />,
    );
    expect(html).toContain("Confirm and run");
    expect(html).toContain('data-estimate-credits="600"');
  });

  it("embeds the inline recompute enhancement with the per-rigor table (§5.6 item 2; progressive enhancement)", () => {
    const html = renderToStaticMarkup(<RunSheet view={view()} labels={LABELS} runAction="/p/x/run" />);
    expect(html).toContain("addEventListener");
    expect(html).toContain("byRigor");
    // the run/confirm labels are on the button for the script to swap.
    expect(html).toContain('data-run-label="Run review"');
    expect(html).toContain('data-confirm-label="Confirm and run"');
    // the estimate box carries the hooks the script targets.
    expect(html).toContain("data-dollars-line");
    expect(html).toContain("data-credits-line");
  });

  it("Paywall wraps its children with the single-mount marker", () => {
    const html = renderToStaticMarkup(<Paywall>x</Paywall>);
    expect((html.match(/data-paywall="run-sheet"/g) ?? []).length).toBe(1);
  });
});
