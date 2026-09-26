import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RunCard, type RunCardLabels } from "./run-card.js";
import { buildRunCardView } from "@rhema/findings-core";

// PRB.08 — the run card's refund line (REQ-BETA-18): "refunded 312 credits; partial results kept" renders
// when a run's debits came back (failed/refused/cancelled run, or a silent reconciliation refund).

const LABELS: RunCardLabels = {
  phaseLabel: (k) => k,
  stateLabel: (s) => s,
  creditsLabel: (spent, cap) => `${spent} / ${cap} cr`,
  offLabel: "off",
  refundLabel: (credits) => `refunded ${credits} credits; partial results kept`,
};

const VIEW = buildRunCardView({
  runId: "run_1",
  state: "completed",
  phases: [],
  spentCredits: 1548,
  capCredits: 2486,
  refundedCredits: 312,
});

describe("RunCard — the refund line (PRB.08; REQ-BETA-18)", () => {
  it("renders the refund line when credits came back", () => {
    const html = renderToStaticMarkup(<RunCard view={VIEW} labels={LABELS} />);
    expect(html).toContain("data-refund");
    expect(html).toContain("refunded 312 credits; partial results kept");
  });

  it("renders no refund line when nothing was refunded", () => {
    const clean = buildRunCardView({ ...VIEW, refundedCredits: 0 });
    expect(renderToStaticMarkup(<RunCard view={clean} labels={LABELS} />)).not.toContain("data-refund");
  });
});
