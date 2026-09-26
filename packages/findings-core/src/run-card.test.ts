import { describe, it, expect } from "vitest";
import { buildRunCardView, deriveRunCardInput, CARD_EVENT_TYPES, type RunEventLike } from "./run-card.js";

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
