import { describe, expect, it } from "vitest";
import { InMemoryCapAccountant, isOverCap } from "./cap.js";

describe("cap accounting (§12.7, AC2)", () => {
  it("is over cap only once Σ metered credits reach the cap", () => {
    expect(isOverCap(0, 100)).toBe(false);
    expect(isOverCap(99.9, 100)).toBe(false);
    expect(isOverCap(100, 100)).toBe(true);
    expect(isOverCap(120, 100)).toBe(true);
  });

  it("accumulates precise (unrounded) platform credits per run", () => {
    const acc = new InMemoryCapAccountant();
    expect(acc.spentCredits("run1")).toBe(0);
    acc.record("run1", 40.4);
    acc.record("run1", 30.3);
    expect(acc.spentCredits("run1")).toBeCloseTo(70.7, 10);
    // isolated per run
    expect(acc.spentCredits("run2")).toBe(0);
  });

  it("can be seeded from a run's committed Σ", () => {
    const acc = new InMemoryCapAccountant({ run1: 250 });
    expect(acc.spentCredits("run1")).toBe(250);
  });
});
