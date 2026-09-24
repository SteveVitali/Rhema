import { describe, it, expect } from "vitest";
import { feedLabelMaps, feedRowsFor, feedTemplateCoverage } from "./feed-labels.js";
import type { FeedEventRow } from "./data.js";

// P1.05 — the feed's label maps (§5.5; REQ-IDE-14): every user-visible event type has a template (the
// coverage assertion the copy table must keep green), SSR rows filter by density, and an event with no
// template drops out — fail-closed, never raw.

const ev = (over: Partial<FeedEventRow> & { seq: number; type: string }): FeedEventRow => ({
  payload: {},
  density: "summary",
  at: "2026-09-02T12:00:00Z",
  ...over,
});

describe("feed template coverage", () => {
  it("every user-visible §12.5 event type has a copy-table template", () => {
    const uncovered = feedTemplateCoverage().filter((r) => !r.covered).map((r) => r.type);
    expect(uncovered).toEqual([]);
  });
});

describe("feedRowsFor — the SSR feed rows", () => {
  // contract densities (§12.5): state_changed/step.started = summary, claim.checked = normal,
  // search.performed = verbose; the row's own `density` field is what the api stamped at write time.
  const EVENTS: FeedEventRow[] = [
    ev({ seq: 1, type: "run.state_changed", payload: { to: "running" }, density: "summary" }),
    ev({ seq: 2, type: "step.started", payload: { phase: "checking_claims", ordinal: 2, of: 6 }, density: "summary" }),
    ev({ seq: 3, type: "claim.checked", payload: { claimOrdinal: 7, verdict: "verified" }, density: "normal" }),
    ev({ seq: 4, type: "search.performed", payload: { query: "visibility politics" }, density: "verbose" }),
    ev({ seq: 5, type: "un.catalogued_debug", payload: { x: 1 }, density: "summary" }),
  ];

  it("filters by the event TYPE's contract density (Summary ⊂ Details ⊂ Verbose)", () => {
    expect(feedRowsFor(EVENTS, "summary").map((r) => r.type)).toEqual([
      "run.state_changed",
      "step.started",
    ]);
    expect(feedRowsFor(EVENTS, "details").map((r) => r.type)).toEqual([
      "run.state_changed",
      "step.started",
      "claim.checked",
    ]);
    expect(feedRowsFor(EVENTS, "verbose")).toHaveLength(4);
  });

  it("renders through the copy templates — labels and the ' — ' detail split", () => {
    const details = feedRowsFor(EVENTS, "details");
    expect(details[0]!.label).toContain("Run");
    expect(details[1]!.label).toContain("started");
    const claim = details.find((r) => r.type === "claim.checked")!;
    expect(claim.label).toBe("Claim 7");
    expect(claim.detail).toBe("Verified"); // the enum map words the verdict
    const search = feedRowsFor(EVENTS, "verbose").find((r) => r.type === "search.performed")!;
    expect(search.detail).toBe("visibility politics");
  });

  it("carries the CONTRACT density on each row (the island re-filters on tab switch)", () => {
    const rows = feedRowsFor(EVENTS, "verbose");
    expect(rows.map((r) => r.density)).toEqual(["summary", "summary", "normal", "verbose"]);
  });

  it("an un-catalogued event type drops out at EVERY density — nothing renders raw", () => {
    for (const d of ["summary", "details", "verbose"] as const) {
      expect(feedRowsFor(EVENTS, d).some((r) => r.type === "un.catalogued_debug")).toBe(false);
    }
  });
});

describe("feedLabelMaps — the island's embedded maps", () => {
  it("serializes templates + enum maps identically for SSR and the island", () => {
    const maps = feedLabelMaps();
    expect(maps.t["run.state_changed"]).toBe("Run {to}");
    expect(maps.enums["to"]?.["running"]).toBeTruthy();
    expect(maps.enums["phase"]).toBeTruthy();
    // JSON-round-trippable (it embeds as data-feed-labels)
    expect(() => JSON.stringify(maps)).not.toThrow();
  });
});
