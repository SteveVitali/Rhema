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

// -------------------------------------------------------------------------------------------------------------------
// P1.05 — the six §5.5 card states render their specified chrome (AC1, deterministic): queue position,
// the credit meter + ETA band, the steering park vs the approval wait, deliverable chips + walkthrough,
// the partial line, and the state-specific actions.

const P105_LABELS: RunCardLabels = {
  ...LABELS,
  etaLabel: (lo, hi) => `~${lo}–${hi} min`,
  queueLabel: (pos) => `${pos} in line`,
  estimateLabel: (a, e) => `${a} cr spent · est. ${e}`,
  pausedLabel: (done, total) => `Paused after phase ${done} of ${total}`,
  partialLabel: (done, total) => `partial (${done}/${total} phases)`,
  waitingGateLabel: (kind) => `Waiting on you — ${kind}`,
  queuedNotesLabel: (n) => `${n} note(s) queued`,
  deliverableLabel: (key, count) => (count != null ? `${count} ${key}` : key),
  actionLabel: (a) => a,
  walkthroughHeading: "What it delivered",
  walkthroughPendingLabel: "Writing…",
  walkthroughFailedLabel: "Could not write it",
  reportLabel: "Run report",
};

const PHASES = [
  { key: "intake", ordinal: 1, status: "done" as const },
  { key: "checking_claims", ordinal: 2, status: "running" as const, counters: [{ key: "claims", value: 23, of: 56 }] },
  { key: "second_read", ordinal: 3, status: "pending" as const },
  { key: "mapping", ordinal: 4, status: "off" as const },
];

const view = (over: Parameters<typeof buildRunCardView>[0]) =>
  buildRunCardView({ runId: "r", phases: PHASES, spentCredits: 412, capCredits: 1860, ...over });

describe("RunCard — the six §5.5 states (P1.05; REQ-IDE-11/12)", () => {
  it("queued renders the position line; running renders counters + credits + ETA; off phases render 'off'", () => {
    const q = renderToStaticMarkup(<RunCard view={view({ state: "queued", queuePosition: 2 })} labels={P105_LABELS} />);
    expect(q).toContain("2 in line");
    expect(q).toContain('data-run-state="queued"');

    const r = renderToStaticMarkup(
      <RunCard
        view={view({ state: "running", etaBand: { lowMin: 4, highMin: 9 }, elapsedMs: 60000 })}
        labels={P105_LABELS}
        hrefs={{ pause: "/p/x/r/r/pause", stop: "/p/x/r/r/stop", note: "/p/x/r/r/note" }}
      />,
    );
    expect(r).toContain("data-credit-meter");
    expect(r).toContain("~4–9 min");
    expect(r).toContain('data-counter="claims"');
    expect(r).toContain('data-phase-status="off"');
    // steering affordances on the running card
    for (const a of ["pause", "stop"]) expect(r).toContain(`data-run-action="${a}"`);
    expect(r).toContain("data-run-note"); // the note field is its own form
  });

  it("waiting_gate distinguishes the steering park (paused → Resume/Stop) from a real gate wait", () => {
    const parked = renderToStaticMarkup(
      <RunCard
        view={view({ state: "waiting_gate", paused: true })}
        labels={P105_LABELS}
        hrefs={{ resume: "/r/resume", stop: "/r/stop" }}
      />,
    );
    expect(parked).toContain('data-paused="1"');
    expect(parked).toContain("Paused after phase");
    expect(parked).toContain('data-run-action="resume"');

    const gated = renderToStaticMarkup(
      <RunCard
        view={view({ state: "waiting_gate", waitingGate: { kind: "approve_plan", deadlineAt: null } })}
        labels={P105_LABELS}
        hrefs={{ gate: "/p/x" }}
      />,
    );
    expect(gated).toContain("Waiting on you — approve_plan");
    expect(gated).not.toContain('data-paused="1"');
  });

  it("completed renders deliverable chips + the walkthrough + actual-vs-estimate; partial renders the partial line", () => {
    const done = renderToStaticMarkup(
      <RunCard
        view={view({
          state: "completed",
          estimateCredits: 1240,
          deliverables: [{ key: "letter" }, { key: "findings", count: 49 }],
          walkthrough: { status: "ready", text: "A letter and a claims ledger." },
        })}
        labels={P105_LABELS}
        hrefs={{ deliverable: "/d", report: "/r" }}
      />,
    );
    expect(done).toContain('data-deliverable="findings"');
    expect(done).toContain('data-walkthrough="ready"');
    expect(done).toContain("A letter and a claims ledger.");
    expect(done).toContain("412 cr spent · est. 1240");

    const partial = renderToStaticMarkup(
      <RunCard view={view({ state: "completed_partial", resumable: true })} labels={P105_LABELS} hrefs={{ resume: "/r", report: "/rep" }} />,
    );
    expect(partial).toContain("partial (1/4 phases)");
    expect(partial).toContain('data-run-action="resume"');
  });

  it("a failed walkthrough surfaces the retry affordance", () => {
    const html = renderToStaticMarkup(
      <RunCard
        view={view({ state: "completed", deliverables: [{ key: "letter" }], walkthrough: { status: "failed" } })}
        labels={P105_LABELS}
        hrefs={{ retryWalkthrough: "/retry" }}
      />,
    );
    expect(html).toContain("Could not write it");
    expect(html).toContain('data-run-action="retry_walkthrough"');
  });
});

// -------------------------------------------------------------------------------------------------------------------
// RES.2 (REQ-SPEC-31(3)) — the persisted run-level delivery label renders ABOVE the verdict/state line
// (the same slot the dossier banner + delivery email carry), read off `view.deliveryLabel` — never
// recomputed. The claim verdicts below stay `unverifiable` (a different word, a different row).

describe("RunCard — the Unverified label (RES.2)", () => {
  const LABELLED_LABELS: RunCardLabels = {
    ...P105_LABELS,
    // a distinctive state string so "above the verdict" is assertable as markup order
    // (`data-run-state="…"` is a section attribute and precedes children — never the anchor).
    stateLabel: (s) => `STATE:${s}`,
    deliveryLabel: () => `Unverified — research could not check the claims; research credits refunded`,
  };

  it("renders the persisted label above the state line", () => {
    const html = renderToStaticMarkup(
      <RunCard
        view={view({ state: "completed", deliveryLabel: "unverified", deliverables: [{ key: "letter" }] })}
        labels={LABELLED_LABELS}
      />,
    );
    expect(html).toContain('data-delivery-label="unverified"');
    // the label sits ABOVE the state row — its markup precedes the rendered state text in the output.
    expect(html.indexOf('data-delivery-label')).toBeLessThan(html.indexOf("STATE:completed"));
  });

  it("no label → no banner (and the state row still renders)", () => {
    const html = renderToStaticMarkup(
      <RunCard view={view({ state: "completed" })} labels={LABELLED_LABELS} />,
    );
    expect(html).not.toContain("data-delivery-label");
    expect(html).toContain("STATE:completed");
  });
});
