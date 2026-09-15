import { describe, it, expect } from "vitest";
import { gateDeadlineState, remainingParts, AMBER_MS } from "./deadline.js";

// Gate deadline math (§6.4; REQ-SPEC-18).

const now = new Date("2026-09-16T12:00:00.000Z");

describe("gateDeadlineState", () => {
  it("returns no timer for an absent deadline ('waiting for you')", () => {
    expect(gateDeadlineState(null, now)).toEqual({ deadlineAt: null, remainingMs: null, expired: false, amber: false });
  });

  it("computes remaining time and marks expired past the deadline", () => {
    const past = new Date(now.getTime() - 1000).toISOString();
    const s = gateDeadlineState(past, now);
    expect(s.expired).toBe(true);
    expect(s.remainingMs).toBeLessThanOrEqual(0);
  });

  it("goes amber within 5 minutes but not before", () => {
    const in3 = new Date(now.getTime() + 3 * 60 * 1000).toISOString();
    const in9 = new Date(now.getTime() + 9 * 60 * 1000).toISOString();
    expect(gateDeadlineState(in3, now).amber).toBe(true);
    expect(gateDeadlineState(in9, now).amber).toBe(false);
    expect(AMBER_MS).toBe(300000);
  });
});

describe("remainingParts", () => {
  it("splits into hours/minutes and flags under-a-minute", () => {
    expect(remainingParts(125 * 60 * 1000)).toMatchObject({ hours: 2, minutes: 5, underAMinute: false, expired: false });
    expect(remainingParts(30 * 1000)).toMatchObject({ hours: 0, minutes: 0, underAMinute: true });
    expect(remainingParts(0)).toMatchObject({ expired: true });
    expect(remainingParts(null)).toMatchObject({ expired: false });
  });
});
