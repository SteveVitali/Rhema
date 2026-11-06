// R7HOME.2b (REQ-HOME-2) — the Timeline tab's next-step card is dismissible per user per
// project: `dismissed` suppresses it outright; `dismissAction` renders a plain form POST (the
// chrome-host delegated submit re-issues it as the explainers-dismiss JSON write).

import { describe, expect, it } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TimelinePane, type TimelineViewWire } from "./timeline.js";

const LABELS = { nextStepLabel: (verb: string) => `Next: ${verb}` } as never;
const CARD_LABELS = {} as never;

const view = (nextStep: TimelineViewWire["nextStep"]): TimelineViewWire => ({
  nextStep,
  rounds: [],
  ungrouped: [],
});

const card = (nextStep: TimelineViewWire["nextStep"]): string =>
  renderToStaticMarkup(
    createElement(TimelinePane, { view: view(nextStep), labels: LABELS, cardLabels: CARD_LABELS }),
  );

describe("R7HOME.2b — the dismissible next-step card (REQ-HOME-2)", () => {
  it("dismissed ⇒ the card never renders (the dismissal is remembered server-side)", () => {
    const html = card({
      verb: "review",
      label: null,
      estimateCredits: null,
      headDraftN: 1,
      dismissed: true,
      dismissAction: "/p/seed/explainers/next_step_p1/dismiss",
    });
    expect(html).not.toContain('data-next-step="');
    expect(html).not.toContain("data-next-step-dismiss");
  });

  it("a live card renders the dismiss form POSTing the server-authored action", () => {
    const html = card({
      verb: "review",
      label: null,
      estimateCredits: null,
      headDraftN: 1,
      dismissed: false,
      dismissAction: "/p/seed/explainers/next_step_p1/dismiss",
      dismissLabel: "Dismiss",
    });
    expect(html).toContain('data-next-step="review"');
    expect(html).toContain('data-next-step-dismiss="true"');
    expect(html).toContain('action="/p/seed/explainers/next_step_p1/dismiss"');
  });

  it("verb 'none' renders neither the card nor the control", () => {
    const html = card({ verb: "none", label: null, estimateCredits: null, headDraftN: null });
    expect(html).not.toContain('data-next-step="');
    expect(html).not.toContain("data-next-step-dismiss");
  });
});
