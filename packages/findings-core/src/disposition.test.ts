import { describe, it, expect } from "vitest";
import type { Actor } from "@rhema/contracts";
import {
  validateDisposition,
  rationaleRequired,
  canDispose,
  applyDisposition,
  freezeDisposition,
  isFrozen,
  DEFER_DEFAULT_RATIONALE,
  DISPOSITION_VERBS,
  type DispositionState,
} from "./disposition.js";

// AC1 — disposition rules: rationale required for rebut/escalate ONLY; freeze behavior.

const user: Actor = { kind: "user", userId: "u_1" };
const clock = { now: () => new Date("2026-09-16T00:00:00.000Z") };

describe("disposition rationale rules (§5.7)", () => {
  it("has exactly the five verbs", () => {
    expect([...DISPOSITION_VERBS]).toEqual(["accept", "adapt", "rebut", "defer", "escalate"]);
  });

  it("requires a rationale for rebut and escalate ONLY", () => {
    expect(rationaleRequired("rebut")).toBe(true);
    expect(rationaleRequired("escalate")).toBe(true);
    expect(rationaleRequired("accept")).toBe(false);
    expect(rationaleRequired("adapt")).toBe(false);
    expect(rationaleRequired("defer")).toBe(false);
  });

  it("rejects rebut/escalate with no rationale, accepts them with one", () => {
    expect(validateDisposition({ kind: "rebut" }).ok).toBe(false);
    expect(validateDisposition({ kind: "escalate", rationale: "  " }).ok).toBe(false);
    expect(validateDisposition({ kind: "rebut", rationale: "the source does support it" }).ok).toBe(true);
  });

  it("accepts accept/adapt with no text, and applies the defer default", () => {
    expect(validateDisposition({ kind: "accept" }).ok).toBe(true);
    expect(validateDisposition({ kind: "adapt" }).ok).toBe(true);
    const d = validateDisposition({ kind: "defer" });
    expect(d.ok).toBe(true);
    expect(d.normalized.rationale).toBe(DEFER_DEFAULT_RATIONALE);
  });

  it("Apply (accept · applied) never requires text", () => {
    const d = validateDisposition({ kind: "accept", applied: true });
    expect(d.ok).toBe(true);
    expect(d.normalized.applied).toBe(true);
  });
});

describe("freeze semantics (§5.7)", () => {
  const live: DispositionState = { kind: "accept", by: user, at: "2026-09-16T00:00:00.000Z", frozen: false };

  it("applyDisposition records a live (unfrozen) row", () => {
    const d = applyDisposition(undefined, { kind: "accept" }, user, clock);
    expect(d.frozen).toBe(false);
    expect(d.by).toEqual(user);
    expect(d.at).toBe("2026-09-16T00:00:00.000Z");
  });

  it("freezeDisposition locks the row and links its move; is idempotent", () => {
    const frozen = freezeDisposition(live, "2026-09-16T01:00:00.000Z", "move_7");
    expect(frozen.frozen).toBe(true);
    expect(frozen.moveId).toBe("move_7");
    expect(isFrozen(frozen)).toBe(true);
    expect(freezeDisposition(frozen, "later", "move_9")).toBe(frozen); // unchanged once frozen
  });

  it("applyDisposition throws on a frozen row (cards lock at delivery)", () => {
    const frozen = freezeDisposition(live, "2026-09-16T01:00:00.000Z");
    expect(() => applyDisposition(frozen, { kind: "adapt" }, user, clock)).toThrow(/frozen/);
  });
});

describe("canDispose — provisional and frozen cards are read-only (REQ-IDE-15, §5.7)", () => {
  it("is false while provisional (no controls on a streaming card)", () => {
    expect(canDispose({ provisional: true })).toBe(false);
  });
  it("is false once frozen at delivery", () => {
    expect(canDispose({ provisional: false, disposition: { kind: "accept", by: user, at: "", frozen: true } })).toBe(false);
  });
  it("is true for a delivered, unfrozen finding", () => {
    expect(canDispose({ provisional: false })).toBe(true);
  });
});
