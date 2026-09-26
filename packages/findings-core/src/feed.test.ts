import { describe, it, expect } from "vitest";
import { filterFeed, feedIncludes } from "./feed.js";

// REQ-IDE-14 — the live feed's density split: Summary (phase cards only), Details (default), Verbose (Advanced).
// Internal events NEVER appear (REQ-ARCH-12).

const events = [
  { type: "step.finished", payload: {} }, // summary
  { type: "source.read", payload: {} }, // normal
  { type: "claim.checked", payload: {} }, // normal
  { type: "search.performed", payload: {} }, // verbose
  { type: "tool.audit", payload: {} }, // internal — never shown
  { type: "not.a.real.event", payload: {} }, // unknown — fail closed
];

describe("filterFeed (§5.5)", () => {
  it("Summary shows only summary-density events", () => {
    expect(filterFeed(events, "summary").map((e) => e.type)).toEqual(["step.finished"]);
  });

  it("Details shows summary + normal, not verbose or internal", () => {
    expect(filterFeed(events, "details").map((e) => e.type)).toEqual(["step.finished", "source.read", "claim.checked"]);
  });

  it("Verbose shows summary + normal + verbose, still never internal or unknown", () => {
    expect(filterFeed(events, "verbose").map((e) => e.type)).toEqual([
      "step.finished",
      "source.read",
      "claim.checked",
      "search.performed",
    ]);
  });

  it("never includes an internal-visibility event at any density (REQ-ARCH-12)", () => {
    for (const density of ["summary", "details", "verbose"] as const) {
      expect(feedIncludes("tool.audit", density)).toBe(false);
      expect(feedIncludes("boundary.violation", density)).toBe(false);
    }
  });

  it("fails closed on an un-catalogued event type", () => {
    expect(feedIncludes("not.a.real.event", "verbose")).toBe(false);
  });
});
