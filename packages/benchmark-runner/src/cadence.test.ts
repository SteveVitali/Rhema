import { describe, it, expect } from "vitest";
import {
  frontierMiniWaveDeadline,
  nextQuarterlyWave,
  shouldEscalateToFullWave,
  frontierTrigger,
  FRONTIER_MINI_WAVE_DAYS,
} from "./cadence.js";

describe("wave cadence hooks (REQ-EVAL-17)", () => {
  it("a major frontier release triggers a mini-wave within 30 days", () => {
    const released = new Date("2026-09-01T00:00:00Z");
    const trig = frontierTrigger({ provider: "openai", model: "gpt-next", releasedAt: released, major: true });
    expect(trig).not.toBeNull();
    expect(trig!.kind).toBe("frontier_mini");
    expect(trig!.deadline).toEqual(frontierMiniWaveDeadline(released));
    expect(trig!.deadline.getTime() - released.getTime()).toBe(FRONTIER_MINI_WAVE_DAYS * 24 * 3600 * 1000);
    // a non-major release creates no obligation
    expect(frontierTrigger({ provider: "openai", model: "gpt-dot", releasedAt: released, major: false })).toBeNull();
  });

  it("escalates a mini-wave to a full wave when the measured gap halves", () => {
    expect(shouldEscalateToFullWave(20, 10)).toBe(true); // exactly halved
    expect(shouldEscalateToFullWave(20, 8)).toBe(true); // more than halved
    expect(shouldEscalateToFullWave(20, 15)).toBe(false); // gap held
    expect(shouldEscalateToFullWave(0, 0)).toBe(false); // no prior lead to halve
  });

  it("schedules the next quarterly wave ~91 days out", () => {
    const last = new Date("2026-09-01T00:00:00Z");
    expect(nextQuarterlyWave(last).getTime() - last.getTime()).toBe(91 * 24 * 3600 * 1000);
  });
});
