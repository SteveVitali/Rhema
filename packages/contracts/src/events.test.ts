import { describe, expect, it } from "vitest";
import {
  INTERNAL_EVENT_TYPES,
  RUN_EVENTS,
  RUN_EVENT_TYPES,
  boundedText,
  isUserVisible,
  parseRunEvent,
  summaryText,
} from "./events.js";

// §12.5 run events: the visibility split (REQ-ARCH-12) and the 280-char free-text bound (REQ-DATA-37).

describe("event free-text bound (REQ-DATA-37)", () => {
  it("bounds user free text at 280 chars", () => {
    expect(() => boundedText.parse("x".repeat(280))).not.toThrow();
    expect(() => boundedText.parse("x".repeat(281))).toThrow();
  });

  it("allows artifact.written.summary up to 600 chars, and nothing longer", () => {
    expect(() => summaryText.parse("x".repeat(600))).not.toThrow();
    expect(() => summaryText.parse("x".repeat(601))).toThrow();
  });

  it("artifact.written accepts a ≤600 summary but a >280 reason on run.state_changed is rejected", () => {
    expect(() =>
      parseRunEvent("artifact.written", {
        kind: "draft",
        mirrorPath: "drafts/v1.md",
        versionId: "01JQ00000000000000000000AF",
        words: 5000,
        summary: "s".repeat(600),
      }),
    ).not.toThrow();
    expect(() =>
      parseRunEvent("run.state_changed", {
        from: "running",
        to: "waiting_gate",
        reason: "r".repeat(281),
      }),
    ).toThrow();
  });
});

describe("visibility split (REQ-ARCH-12)", () => {
  it("classifies the internal-only types as internal", () => {
    expect(new Set(INTERNAL_EVENT_TYPES)).toEqual(
      new Set([
        "tool.audit",
        "search.result",
        "engine.error",
        "egress.denied",
        "boundary.violation",
        // CITE.1 — the per-run completeness record is internal telemetry (REQ-VIS-9; ADR-084):
        // counts + normalized-url ids the platform reports on, never a card the run UI renders.
        "run.citation_completeness",
      ]),
    );
    for (const t of INTERNAL_EVENT_TYPES) expect(isUserVisible(t)).toBe(false);
  });

  it("the vast majority of the catalogue is user-visible", () => {
    const userCount = RUN_EVENT_TYPES.filter(isUserVisible).length;
    expect(userCount).toBeGreaterThan(RUN_EVENT_TYPES.length - INTERNAL_EVENT_TYPES.length - 1);
  });

  it("every event def declares a visibility and a payload schema", () => {
    for (const t of RUN_EVENT_TYPES) {
      expect(["user", "internal"]).toContain(RUN_EVENTS[t].visibility);
      expect(RUN_EVENTS[t].payload).toBeTruthy();
    }
  });

  it("parseRunEvent rejects an unknown type", () => {
    expect(() => parseRunEvent("run.exploded", {})).toThrow();
  });
});
