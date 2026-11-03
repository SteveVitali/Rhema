import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement } from "react";
import { IdeShell, RunCard, TimelinePane } from "@rhema/ui";
import { buildRunCardView, type RunSummaryView, type TimelineRun } from "@rhema/findings-core";
import { COPY } from "../copy.js";

// R7COPY.0 (REQ-SYNC-1; R5 C4) — a completed run's state, credits and phase marks are IDENTICAL on
// the Timeline card, the dossier's embedded card, and the status-bar run state: all three mount
// facts from the ONE RunSummaryView (one query, one SQL-fact assembly — the dossier's old
// event-derived card could lag the Timeline's, and the generated walkthrough is gone per ADR-130).

const summary: RunSummaryView = {
  runId: "run_1",
  workflow: "review",
  state: "completed",
  createdAt: "2026-11-01T12:00:00Z",
  card: buildRunCardView({
    runId: "run_1",
    state: "completed",
    phases: [
      { key: "reading_the_piece", ordinal: 1, status: "done" },
      {
        key: "checking_claims",
        ordinal: 2,
        status: "done",
        counters: [{ key: "claims", value: 56, of: 56 }],
      },
      { key: "second_read", ordinal: 3, status: "off" },
    ],
    spentCredits: 412,
    capCredits: 840,
    deliverables: [
      { key: "letter" },
      { key: "findings", count: 5 },
      { key: "strengths", count: 1 },
      { key: "claims", count: 6 },
    ],
    delivered: {
      verdict: "The draft holds up.",
      counts: { findings: 5, strengths: 1, claims: 6 },
      links: ["dossier", "letter", "ledger"],
    },
    deliveryLabel: "verified",
  }),
};

const timelineRun: TimelineRun = { ...summary, subjectN: 1, producedN: null };

const CARD_LABELS = {
  phaseLabel: (k: string) => k,
  stateLabel: (s: string) => s,
  creditsLabel: (spent: number, cap: number) => `${spent} / ${cap} cr`,
  offLabel: "off",
  creditLabel: (c: number) => `${c} cr`,
  deliveredHeading: COPY.steer.deliveredHeading,
  deliveredCountsLabel: (c: { findings: number; strengths: number; claims: number }) =>
    `${c.findings} findings · ${c.strengths} strength · ${c.claims} claims`,
  deliveredLinkLabel: (key: string) =>
    ({ dossier: "Dossier", letter: "Letter", ledger: "Claims ledger" })[key] ?? key,
};

const TIMELINE_LABELS = {
  nextStepLabel: () => "Revise",
  versionLabel: (n: number) => `v${n}`,
  workflowLabel: (w: string) => w,
  arrow: "→",
  originChipLabel: () => "Imported draft",
  emptyText: "No runs yet",
};

const values = (html: string, attr: string): string[] =>
  [...html.matchAll(new RegExp(`${attr}="([^"]*)"`, "g"))].map((m) => m[1]!);

describe("R7COPY.0 — one RunSummaryView across the three run-state displays (REQ-SYNC-1)", () => {
  it("a completed run's state/credits/phases read identically on the card, dossier card, and status bar", () => {
    const timeline = renderToStaticMarkup(
      createElement(TimelinePane, {
        view: {
          nextStep: { verb: "revise", label: null, estimateCredits: null, headDraftN: 2 },
          rounds: [
            {
              n: 1,
              anchor: { draftId: "d1", n: 1, origin: "imported" },
              runs: [timelineRun],
              producedN: null,
              summary: { kind: "round" as never },
              parts: [],
            },
          ],
          ungrouped: [],
          originChip: null,
        },
        labels: TIMELINE_LABELS,
        cardLabels: CARD_LABELS,
        hrefs: {
          deliveredLinkHref: (runId: string, key: string) =>
            key === "letter"
              ? `/p/x/review/${runId}#letter`
              : key === "ledger"
                ? `/p/x/review/${runId}#claims`
                : `/p/x/review/${runId}`,
        },
      }),
    );
    const dossierCard = renderToStaticMarkup(
      createElement(RunCard, {
        view: summary.card,
        labels: CARD_LABELS,
        hrefs: {
          report: "/p/x/r/run_1#report",
          deliverable: "/p/x/review/run_1",
          deliveredLink: (k: string) =>
            k === "letter"
              ? "/p/x/review/run_1#letter"
              : k === "ledger"
                ? "/p/x/review/run_1#claims"
                : "/p/x/review/run_1",
        },
      }),
    );
    const shell = renderToStaticMarkup(
      createElement(IdeShell, {
        project: { slug: "x", title: "X" },
        userId: "u1",
        projectId: "p-x",
        findings: [],
        activeRun: { runId: summary.runId, state: summary.state },
        labels: {
          ...COPY.ide,
          viewMenu: { ...COPY.ide.viewMenu, advanced: COPY.runSheet.advanced },
        },
      }),
    );

    // REQ-SYNC-1 — one state on every display.
    expect(values(timeline, "data-run-state")).toEqual(["completed"]);
    expect(values(dossierCard, "data-run-state")).toEqual(["completed"]);
    expect(values(shell, "data-run-state")).toEqual(["completed"]);

    // one credit figure + one set of phase marks on the two cards.
    expect(values(timeline, "data-credits")).toEqual(values(dossierCard, "data-credits"));
    expect(timeline).toContain("412"); // spent credits — same figure both cards
    expect(dossierCard).toContain("412");
    expect(values(timeline, "data-phase-status")).toEqual(values(dossierCard, "data-phase-status"));
    expect(values(timeline, "data-phase-status")).toEqual(["done", "done", "off"]);

    // REQ-COPY-4 — both cards compose the same "What it delivered" block, verbatim verdict included.
    for (const html of [timeline, dossierCard]) {
      expect(html).toContain("data-delivered-summary");
      expect(html).toContain("data-delivered-verdict");
      expect(html).toContain("data-delivered-counts");
      expect(html).toContain("data-delivered-links");
      expect(html).toContain("data-delivered-link");
      expect(html).toContain("The draft holds up.");
      expect(html).toContain("5 findings · 1 strength · 6 claims");
      expect(html).not.toContain("data-walkthrough");
    }
  });
});
