import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { RunCard, runStateTone, type RunCardLabels } from "./run-card.js";
import { buildRunCardView, type GateDecisionView } from "@rhema/findings-core";
import { RUN_STATES } from "@rhema/contracts";

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
    expect(renderToStaticMarkup(<RunCard view={clean} labels={LABELS} />)).not.toContain(
      "data-refund",
    );
  });
});

// -------------------------------------------------------------------------------------------------------------------
// P1.05 — the six §5.5 card states render their specified chrome (AC1, deterministic): queue position,
// the credit meter + ETA band, the steering park vs the approval wait, deliverable chips + the
// record-composed delivered block (R7COPY.0 — the generated walkthrough is retired, ADR-130),
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
  deliveredHeading: "Delivered",
  deliveredCountsLabel: (c) =>
    `${c.findings} findings${c.strengths > 0 ? ` · ${c.strengths} strength` : ""} · ${c.claims} claims`,
  deliveredLinkLabel: (key) =>
    ({ dossier: "Dossier", letter: "Letter", ledger: "Claims ledger" })[key] ?? key,
  reportLabel: "Run report",
};

const PHASES = [
  { key: "intake", ordinal: 1, status: "done" as const },
  {
    key: "checking_claims",
    ordinal: 2,
    status: "running" as const,
    counters: [{ key: "claims", value: 23, of: 56 }],
  },
  { key: "second_read", ordinal: 3, status: "pending" as const },
  { key: "mapping", ordinal: 4, status: "off" as const },
];

const view = (over: Parameters<typeof buildRunCardView>[0]) =>
  buildRunCardView({ runId: "r", phases: PHASES, spentCredits: 412, capCredits: 1860, ...over });

describe("RunCard — the six §5.5 states (P1.05; REQ-IDE-11/12)", () => {
  it("queued renders the position line; running renders counters + credits + ETA; off phases render 'off'", () => {
    const q = renderToStaticMarkup(
      <RunCard view={view({ state: "queued", queuePosition: 2 })} labels={P105_LABELS} />,
    );
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
        view={view({
          state: "waiting_gate",
          waitingGate: { kind: "approve_plan", deadlineAt: null },
        })}
        labels={P105_LABELS}
        hrefs={{ gate: "/p/x" }}
      />,
    );
    expect(gated).toContain("Waiting on you — approve_plan");
    expect(gated).not.toContain('data-paused="1"');
  });

  it("completed renders deliverable chips + the record-composed block + actual-vs-estimate; partial renders the partial line", () => {
    const done = renderToStaticMarkup(
      <RunCard
        view={view({
          state: "completed",
          estimateCredits: 1240,
          deliverables: [{ key: "letter" }, { key: "findings", count: 49 }],
          delivered: {
            verdict: "The draft holds up.",
            counts: { findings: 5, strengths: 1, claims: 49 },
            links: ["dossier", "letter", "ledger"],
          },
        })}
        labels={P105_LABELS}
        hrefs={{
          deliverable: "/d",
          report: "/r",
          deliveredLink: (k) => `/p/x/review/r${k === "dossier" ? "" : `#${k}`}`,
        }}
      />,
    );
    expect(done).toContain('data-deliverable="findings"');
    expect(done).toContain("data-delivered-summary");
    expect(done).toContain("The draft holds up.");
    expect(done).toContain("5 findings · 1 strength · 49 claims");
    expect(done).toContain('data-delivered-link="ledger"');
    expect(done).toContain("412 cr spent · est. 1240");
    // ADR-130 — no model-written prose surface remains on the card.
    expect(done).not.toContain("data-walkthrough");

    const partial = renderToStaticMarkup(
      <RunCard
        view={view({ state: "completed_partial", resumable: true })}
        labels={P105_LABELS}
        hrefs={{ resume: "/r", report: "/rep" }}
      />,
    );
    expect(partial).toContain("partial (1/4 phases)");
    expect(partial).toContain('data-run-action="resume"');
  });

  it("a delivered record with no verdict section composes counts+links with no quote line", () => {
    const html = renderToStaticMarkup(
      <RunCard
        view={view({
          state: "completed",
          deliverables: [{ key: "letter" }],
          delivered: {
            verdict: null,
            counts: { findings: 2, strengths: 0, claims: 3 },
            links: ["dossier"],
          },
        })}
        labels={P105_LABELS}
        hrefs={{ deliveredLink: () => "/p/x/review/r" }}
      />,
    );
    expect(html).toContain("data-delivered-summary");
    expect(html).not.toContain("data-delivered-verdict");
    expect(html).toContain("2 findings · 3 claims");
    // and the retired walkthrough retry affordance is gone entirely
    expect(html).not.toContain("retry_walkthrough");
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
    deliveryLabel: () =>
      `Unverified — research could not check the claims; research credits refunded`,
  };

  it("renders the persisted label above the state line", () => {
    const html = renderToStaticMarkup(
      <RunCard
        view={view({
          state: "completed",
          deliveryLabel: "unverified",
          deliverables: [{ key: "letter" }],
        })}
        labels={LABELLED_LABELS}
      />,
    );
    expect(html).toContain('data-delivery-label="unverified"');
    // the label sits ABOVE the state row — its markup precedes the rendered state text in the output.
    expect(html.indexOf("data-delivery-label")).toBeLessThan(html.indexOf("STATE:completed"));
  });

  it("no label → no banner (and the state row still renders)", () => {
    const html = renderToStaticMarkup(
      <RunCard view={view({ state: "completed" })} labels={LABELLED_LABELS} />,
    );
    expect(html).not.toContain("data-delivery-label");
    expect(html).toContain("STATE:completed");
  });
});

// -------------------------------------------------------------------------------------------------------------------
// R7UX.2 (BL-93) — the timeline's differentiated scroll: every run state carries a distinguishable,
// non-shouty treatment (a tone pill + a left accent, never colour-only), the delivered block's heading
// is a quiet label (no hard-caps string remains — case-insensitive), and approval decisions render as
// structured rows (kind badge + the composed line + a per-kind hook).

const GATE_KIND_LABELS: Record<string, string> = {
  approve_triage: "Approve triage",
  spend_overrun: "Spend overrun",
};

const UX_LABELS: RunCardLabels = {
  ...P105_LABELS,
  decisionLabel: (d) => `${d.action} by ${d.byActor} at ${d.at.slice(11, 16)}`,
  decisionKindLabel: (kind) => GATE_KIND_LABELS[kind] ?? kind,
};

const DECISIONS: readonly GateDecisionView[] = [
  {
    id: "dec_1",
    gateId: "gate_1",
    kind: "approve_triage",
    action: "approve",
    byActor: "user",
    presence: false,
    at: "2026-11-20T14:32:00Z",
    changes: 3,
  },
  {
    id: "dec_2",
    gateId: "gate_2",
    kind: "spend_overrun",
    action: "auto",
    byActor: "timeout",
    presence: false,
    at: "2026-11-21T09:05:00Z",
  },
];

describe("R7UX.2 — differentiated timeline treatments (BL-93)", () => {
  it("runStateTone maps every canonical RunState to a tone (in-flight / waiting / delivered / failed / quiet)", () => {
    expect(runStateTone("running")).toBe("running");
    expect(runStateTone("waiting_gate")).toBe("needs_you");
    expect(runStateTone("awaiting_consent")).toBe("needs_you");
    expect(runStateTone("completed")).toBe("ready");
    expect(runStateTone("failed")).toBe("attention");
    expect(runStateTone("orphaned")).toBe("attention");
    for (const s of ["created", "queued", "completed_partial", "cancelled"] as const) {
      expect(runStateTone(s)).toBe("neutral");
    }
    // total — every canonical state resolves, never throws.
    for (const s of RUN_STATES) expect(() => runStateTone(s)).not.toThrow();
  });

  it("delivered / failed / in-flight / waiting rows carry distinguishable state treatments", () => {
    const tones = new Map<string, string>();
    for (const [state, tone] of [
      ["completed", "ready"],
      ["failed", "attention"],
      ["running", "running"],
      ["waiting_gate", "needs_you"],
      ["cancelled", "neutral"],
    ] as const) {
      const html = renderToStaticMarkup(
        <RunCard view={view({ state })} labels={UX_LABELS} />,
      );
      expect(html).toContain(`data-state-tone="${tone}"`);
      expect(html).toContain("ui-pill"); // the state pill — text + dot, never colour-only
      tones.set(state, tone);
    }
    // the three headline treatments are pairwise distinct.
    expect(new Set([tones.get("completed"), tones.get("failed"), tones.get("running")]).size).toBe(3);
    // the card's left accent differs per tone — a failed card and a delivered card never look alike.
    const failedHtml = renderToStaticMarkup(
      <RunCard view={view({ state: "failed" })} labels={UX_LABELS} />,
    );
    const doneHtml = renderToStaticMarkup(
      <RunCard view={view({ state: "completed" })} labels={UX_LABELS} />,
    );
    expect(failedHtml).toContain("border-left:3px solid var(--sev-major)");
    expect(doneHtml).toContain("border-left:3px solid var(--state-ready)");
    expect(failedHtml).toContain("ui-pill--attention");
    expect(doneHtml).toContain("ui-pill--ready");
  });

  it("the delivered block's heading is a quiet label — no hard-caps string remains (case-insensitive)", () => {
    const html = renderToStaticMarkup(
      <RunCard
        view={view({
          state: "completed",
          deliverables: [{ key: "letter" }],
          delivered: {
            verdict: "The draft holds up.",
            counts: { findings: 5, strengths: 1, claims: 6 },
            links: ["dossier", "letter", "ledger"],
          },
        })}
        labels={UX_LABELS}
        hrefs={{ deliveredLink: (k) => `/p/x/review/r#${k}` }}
      />,
    );
    expect(html).toContain("data-delivered-summary");
    // the retired "WHAT IT DELIVERED" treatment: no caps class on the block, and no
    // case-insensitive match of the old heading text anywhere in the markup.
    const block = html.slice(html.indexOf("data-delivered-summary"));
    expect(block).not.toContain("ui-d-cap");
    expect(html).not.toMatch(/what it delivered/i);
    expect(html).toContain("Delivered");
  });

  it("approval decisions render as structured rows — kind badge + composed line + a data-hook per kind", () => {
    const html = renderToStaticMarkup(
      <RunCard view={view({ state: "completed", decisions: DECISIONS })} labels={UX_LABELS} />,
    );
    expect(html).toContain("data-run-decisions");
    expect(html).toContain('data-decision="dec_1"');
    expect(html).toContain('data-kind="approve_triage"');
    expect(html).toContain('data-kind="spend_overrun"');
    // each row carries the kind badge (a static Chip) plus the composed action/actor/time line.
    expect(html).toContain("Approve triage");
    expect(html).toContain("Spend overrun");
    expect(html).toContain("approve by user at 14:32");
    expect(html).toContain("auto by timeout at 09:05");
    expect(html.match(/ui-chip/g)!.length).toBeGreaterThanOrEqual(2);
  });

  it("a pre-R7UX.2 labels bag (no decisionKindLabel) keeps the bare decision line, no crash", () => {
    const { decisionKindLabel: _drop, ...legacy } = UX_LABELS;
    const html = renderToStaticMarkup(
      <RunCard view={view({ state: "completed", decisions: DECISIONS })} labels={legacy} />,
    );
    expect(html).toContain('data-kind="approve_triage"');
    expect(html).not.toContain("ui-chip");
    expect(html).toContain("approve by user at 14:32");
  });
});
