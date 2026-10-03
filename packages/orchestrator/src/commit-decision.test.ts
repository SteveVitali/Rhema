import { describe, it, expect } from "vitest";
import { WORKFLOW_MANIFESTS, type PhaseManifest } from "@rhema/protocols";
import { decideCommitNext } from "./commit-decision.js";
import type { GatePolicyContext } from "./gate-policy.js";

const review = WORKFLOW_MANIFESTS.review!;
const intake = review.phases.find((p) => p.key === "intake")!; //   index 0, gateAfter approve_scope
const craft = review.phases.find((p) => p.key === "craft")!; //     index 1, no gate
const letter = review.phases[review.phases.length - 1]!; //         last phase, no gate

const ctx = (over: Partial<GatePolicyContext> = {}): GatePolicyContext => ({
  policy: "named",
  now: new Date("2026-09-04T00:00:00Z"),
  ...over,
});

describe("decideCommitNext", () => {
  it("opens the phase's gateAfter as a gate (intake → approve_scope)", () => {
    const next = decideCommitNext({ phase: intake, isLastPhase: false, gate: ctx() });
    expect(next.kind).toBe("gate");
    if (next.kind === "gate") expect(next.gateKind).toBe("approve_scope");
  });

  // RUN.1 (ADR-050) — `then` carries the transition an informational gate's run takes instead of
  // parking: "advance" mid-run, "finalize" after the last phase; a BLOCKING gate carries no `then`.
  it("an informational gate carries then:'advance' mid-run and then:'finalize' on the last phase", () => {
    const mid = decideCommitNext({ phase: intake, isLastPhase: false, gate: ctx() });
    expect(mid).toMatchObject({ kind: "gate", blocking: false, then: "advance" });
    const gatedLast: PhaseManifest = { ...craft, gateAfter: "approve_scope" };
    const last = decideCommitNext({ phase: gatedLast, isLastPhase: true, gate: ctx() });
    expect(last).toMatchObject({ kind: "gate", blocking: false, then: "finalize" });
  });

  it("a blocking gate carries NO then — the run waits for the decision", () => {
    const next = decideCommitNext({ phase: intake, isLastPhase: false, gate: ctx({ scopeBlocking: true }) });
    expect(next).toMatchObject({ kind: "gate", blocking: true });
    if (next.kind === "gate") expect(next.then).toBeUndefined();
  });

  it("a gate skipped by run_to_completion advances instead of gating", () => {
    const next = decideCommitNext({ phase: intake, isLastPhase: false, gate: ctx({ policy: "run_to_completion" }) });
    expect(next.kind).toBe("advance");
  });

  it("a scope-exceeds-cap approve_scope becomes a blocking wait gate", () => {
    const next = decideCommitNext({ phase: intake, isLastPhase: false, gate: ctx({ scopeExceedsCap: true }) });
    expect(next.kind).toBe("gate");
    if (next.kind === "gate") {
      expect(next.blocking).toBe(true);
      expect(next.onExpiry).toBe("wait");
      expect(next.deadlineAt).toBeNull();
    }
  });

  it("a non-gate phase that is not last advances (self-edge)", () => {
    const next = decideCommitNext({ phase: craft, isLastPhase: false, gate: ctx() });
    expect(next).toEqual({ kind: "advance" });
  });

  it("the last active phase finalizes", () => {
    const next = decideCommitNext({ phase: letter, isLastPhase: true, gate: ctx() });
    expect(next).toEqual({ kind: "finalize" });
  });

  it("a gate phase that is also the last phase still gates (gate wins over finalize)", () => {
    const gatedLast: PhaseManifest = { ...craft, gateAfter: "approve_scope" };
    const next = decideCommitNext({ phase: gatedLast, isLastPhase: true, gate: ctx() });
    expect(next.kind).toBe("gate");
  });
});
