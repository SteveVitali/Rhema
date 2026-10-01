import { describe, it, expect } from "vitest";
import { buildRunCardView, deriveRunCardInput, etaBandForPhases, CARD_EVENT_TYPES, type RunEventLike } from "./run-card.js";

// AC2 — the run card renders ONLY orchestrator-emitted state/counters; a stream carrying agent-authored
// progress text contributes NONE of it (REQ-IDE-11). REQ-IDE-12 — opt-out phases render "off".

const AGENT_PROSE = "I think the draft is weak and the thesis is unconvincing";

const events: RunEventLike[] = [
  { type: "run.started", payload: { modelTier: "balanced" } },
  { type: "run.state_changed", payload: { from: "queued", to: "running" } },
  { type: "step.started", payload: { phase: "reading_the_piece", ordinal: 1, of: 7 } },
  { type: "step.finished", payload: { phase: "reading_the_piece", ordinal: 1, of: 7, credits: 120, durationMs: 60000 } },
  { type: "step.started", payload: { phase: "checking_claims", ordinal: 2, of: 7 } },
  { type: "claim.progress", payload: { checked: 23, of: 56, verified: 20 } },
  // agent-authored text the card MUST NOT render (REQ-IDE-11):
  { type: "agent.note", payload: { template: "tool", text: AGENT_PROSE } },
  { type: "finding.emitted", payload: { findingOrdinal: 3, kind: "argument", severity: "blocking", anchorHash: "abc" } },
  { type: "artifact.written", payload: { kind: "editors_letter", mirrorPath: "x", versionId: "v_1", summary: AGENT_PROSE } },
  { type: "source.read", payload: { url: "https://x.test", title: AGENT_PROSE, agentLabel: "Editor" } },
  { type: "usage.tick", payload: { spentCredits: 412, capCredits: 1860 } },
];

const PHASES = ["reading_the_piece", "checking_claims", "mapping_the_field", "second_read", "editors_letter"];

describe("deriveRunCardInput (REQ-IDE-11)", () => {
  it("builds the card from orchestrator facts only — no agent-authored text anywhere in the derived input", () => {
    const input = deriveRunCardInput("run_1", events, { phaseKeys: PHASES, offPhases: ["mapping_the_field"], capCredits: 1860 });
    const json = JSON.stringify(input);
    expect(json).not.toContain(AGENT_PROSE);
    // no free-text/prose leaked: the only strings are phase keys, the run state, and counter keys.
    expect(input.state).toBe("running");
    expect(input.spentCredits).toBe(412);
    expect(input.capCredits).toBe(1860);
  });

  it("reflects phase status ✓/◐/○ and greys opt-out phases 'off' (REQ-IDE-12)", () => {
    const input = deriveRunCardInput("run_1", events, { phaseKeys: PHASES, offPhases: ["mapping_the_field"] });
    const byKey = Object.fromEntries(input.phases.map((p) => [p.key, p.status]));
    expect(byKey["reading_the_piece"]).toBe("done");
    expect(byKey["checking_claims"]).toBe("running");
    expect(byKey["mapping_the_field"]).toBe("off"); // opt-out disabled by the rigor notch
    expect(byKey["second_read"]).toBe("pending");
  });

  it("carries the claim counter (23/56) as numbers on the running phase", () => {
    const input = deriveRunCardInput("run_1", events, { phaseKeys: PHASES });
    const checking = input.phases.find((p) => p.key === "checking_claims");
    expect(checking?.counters?.[0]).toEqual({ key: "claims", value: 23, of: 56 });
  });

  it("ignores every event type that is not a whitelisted card event", () => {
    // a stream of ONLY agent-text-bearing events yields an empty/created card.
    const onlyProse: RunEventLike[] = [
      { type: "agent.note", payload: { template: "t", text: AGENT_PROSE } },
      { type: "finding.emitted", payload: { findingOrdinal: 1, kind: "claim", severity: "note" } },
    ];
    const input = deriveRunCardInput("run_1", onlyProse, {});
    expect(input.state).toBe("created");
    expect(input.phases).toHaveLength(0);
    expect(CARD_EVENT_TYPES).not.toContain("agent.note");
    expect(CARD_EVENT_TYPES).not.toContain("finding.emitted");
  });
});

describe("buildRunCardView", () => {
  it("computes done/running/total and the clamped credit fraction", () => {
    const input = deriveRunCardInput("run_1", events, { phaseKeys: PHASES, offPhases: ["mapping_the_field"], capCredits: 1860 });
    const view = buildRunCardView(input);
    expect(view.done).toBe(1);
    expect(view.running).toBe(1);
    expect(view.total).toBe(PHASES.length);
    expect(view.creditFraction).toBeCloseTo(412 / 1860, 5);
  });

  it("never lets the credit fraction exceed 1", () => {
    const view = buildRunCardView({ runId: "r", state: "running", phases: [], spentCredits: 3000, capCredits: 1000 });
    expect(view.creditFraction).toBe(1);
  });
});

describe("the refund line (PRB.08; REQ-BETA-18)", () => {
  it("aggregates every whitelisted cost.refunded event into the card's refunded total", () => {
    const stream: RunEventLike[] = [
      ...events,
      { type: "cost.refunded", payload: { credits: 212, runId: "run_1" } },
      { type: "cost.refunded", payload: { credits: 100, runId: "run_1" } },
    ];
    const input = deriveRunCardInput("run_1", stream, { phaseKeys: PHASES });
    expect(input.refundedCredits).toBe(312);
    expect(buildRunCardView(input).refundedCredits).toBe(312);
    // whitelisted: the card reads ONLY the numeric credits field — no agent text can ride the refund event.
    expect(CARD_EVENT_TYPES).toContain("cost.refunded");
  });

  it("a card with no refunds reports 0", () => {
    const input = deriveRunCardInput("run_1", events, { phaseKeys: PHASES });
    expect(input.refundedCredits).toBe(0);
    expect(buildRunCardView(input).refundedCredits).toBe(0);
  });
});

// -------------------------------------------------------------------------------------------------------------------
// P1.05 — the six §5.5 card states + the derived primary-action table (REQ-IDE-18 steering affordances).

import { runCardActions, type RunCardInput } from "./run-card.js";

const base = (over: Partial<RunCardInput> = {}): RunCardInput => ({
  runId: "r",
  state: "running",
  phases: [],
  spentCredits: 0,
  capCredits: 100,
  ...over,
});

describe("the six §5.5 card states → primary actions", () => {
  it("queued/created → cancel only (with queue position when supplied)", () => {
    const view = buildRunCardView(base({ state: "queued", queuePosition: 3 }));
    expect(view.actions).toEqual(["cancel"]);
    expect(view.queuePosition).toBe(3);
  });

  it("running → pause / stop / note / live_feed", () => {
    expect(buildRunCardView(base({ state: "running" })).actions).toEqual([
      "pause",
      "stop",
      "note",
      "live_feed",
    ]);
  });

  it("waiting_gate + paused → resume / stop (the steering park, not an approval)", () => {
    const view = buildRunCardView(base({ state: "waiting_gate", paused: true }));
    expect(view.paused).toBe(true);
    expect(view.actions).toEqual(["resume", "stop"]);
  });

  it("waiting_gate WITHOUT paused → a real gate: the approval owns actions, the card offers the feed", () => {
    const view = buildRunCardView(
      base({ state: "waiting_gate", waitingGate: { kind: "approve_plan", deadlineAt: null } }),
    );
    expect(view.paused).toBe(false);
    expect(view.actions).toEqual(["live_feed"]);
    expect(view.waitingGate?.kind).toBe("approve_plan");
  });

  it("`paused` is ignored off waiting_gate — a running run can never render the paused variant", () => {
    const view = buildRunCardView(base({ state: "running", paused: true }));
    expect(view.paused).toBe(false);
    expect(view.actions).toContain("pause");
  });

  it("completed → open_deliverable (when chips exist) + report; a failed walkthrough adds retry", () => {
    const view = buildRunCardView(
      base({ state: "completed", deliverables: [{ key: "letter" }, { key: "findings", count: 41 }] }),
    );
    expect(view.actions).toEqual(["open_deliverable", "report"]);

    const failed = buildRunCardView(
      base({ state: "completed", deliverables: [{ key: "letter" }], walkthrough: { status: "failed" } }),
    );
    expect(failed.actions).toEqual(["open_deliverable", "report", "retry_walkthrough"]);

    const noDeliverables = buildRunCardView(base({ state: "completed" }));
    expect(noDeliverables.actions).toEqual(["report"]);
  });

  it("failed/cancelled/completed_partial → resume (when resumable) + report", () => {
    for (const state of ["failed", "cancelled", "completed_partial"] as const) {
      expect(buildRunCardView(base({ state, resumable: true })).actions).toEqual(["resume", "report"]);
      expect(buildRunCardView(base({ state, resumable: false })).actions).toEqual(["report"]);
    }
    const failedView = buildRunCardView(base({ state: "failed", failureCode: "cap_exceeded" }));
    expect(failedView.failureCode).toBe("cap_exceeded");
  });

  it("runCardActions is pure: provisioning (not in the §5.5 table) falls through to no actions", () => {
    expect(
      runCardActions({ state: "provisioning", paused: false, resumable: false, hasDeliverable: false, walkthroughFailed: false }),
    ).toEqual([]);
  });
});

describe("etaBandForPhases (ledger K4 — the running card's ≈ low–high min band)", () => {
  const phases = (statuses: string[]) =>
    statuses.map((s, i) => ({ key: `p${i}`, ordinal: i + 1, status: s as "done" | "running" | "pending" | "off" }));

  it("projects the mean committed-step duration over the phases still to run — band [0.8×, 1.5×]", () => {
    // 2 committed steps at 10 min each, 3 phases remaining → 10 min × 3 = 30 min → [24, 45].
    const band = etaBandForPhases(phases(["done", "done", "running", "pending", "pending"]), [
      { durationMs: 10 * 60 * 1000 },
      { durationMs: 10 * 60 * 1000 },
    ]);
    expect(band).toEqual({ lowMin: 24, highMin: 45 });
  });

  it("uses the flat 5-min/phase prior when no step has committed yet", () => {
    // 2 remaining → prior 5 min × 2 = 10 min → [8, 15].
    expect(etaBandForPhases(phases(["running", "pending"]), [])).toEqual({ lowMin: 8, highMin: 15 });
  });

  it("is null once nothing remains — and 'off' phases never count", () => {
    expect(etaBandForPhases(phases(["done", "done", "off"]), [{ durationMs: 60000 }])).toBeNull();
  });
});
