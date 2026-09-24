import { describe, it, expect } from "vitest";
import {
  feedTabForContractDensity,
  feedRowVisible,
  formatFeedRow,
  type FeedLabelMaps,
} from "./feed-row.js";

// P1.05 — the shared feed-row formatter (§5.5; REQ-IDE-14): contract density → the Summary/Details/
// Verbose tabs, the ≤-ranked visibility rule, template interpolation with enum maps, and the
// fail-closed rule (an un-catalogued event type renders nothing).

const MAPS: FeedLabelMaps = {
  t: {
    "run.state_changed": "Run {to}",
    "step.started": "Started {phase}",
    "step.finished": "Finished {phase} — {credits} credits",
    "claim.progress": "Claims {checked} of {of} — {verified} verified",
    "finding.emitted": "Finding {findingOrdinal} — {severity}",
    "artifact.written": "Wrote {kind}",
    "steer.paused": "Paused — {reason}",
  },
  enums: {
    phase: { checking_claims: "checking claims", reading_the_piece: "reading the piece" },
    to: { running: "started", waiting_gate: "paused", completed: "delivered" },
    severity: { blocking: "blocking", major: "major" },
    kind: { editors_letter: "the editor's letter" },
  },
};

describe("feedTabForContractDensity / feedRowVisible (§5.5 densities)", () => {
  it("maps contract densities to user tabs; 'internal' and unknown map to nothing", () => {
    expect(feedTabForContractDensity("summary")).toBe("summary");
    expect(feedTabForContractDensity("normal")).toBe("details");
    expect(feedTabForContractDensity("verbose")).toBe("verbose");
    expect(feedTabForContractDensity("internal")).toBeNull();
    expect(feedTabForContractDensity("bogus")).toBeNull();
  });

  it("a row shows at its tab's rank or coarser; finer tabs hide it; internal never shows", () => {
    expect(feedRowVisible("summary", "summary")).toBe(true);
    expect(feedRowVisible("summary", "verbose")).toBe(true);
    expect(feedRowVisible("normal", "summary")).toBe(false);
    expect(feedRowVisible("normal", "details")).toBe(true);
    expect(feedRowVisible("verbose", "details")).toBe(false);
    expect(feedRowVisible("verbose", "verbose")).toBe(true);
    expect(feedRowVisible("internal", "verbose")).toBe(false);
  });
});

describe("formatFeedRow", () => {
  it("interpolates whitelisted payload fields through the enum maps", () => {
    expect(formatFeedRow("run.state_changed", { to: "running" }, MAPS)).toEqual({ label: "Run started" });
    expect(formatFeedRow("step.started", { phase: "checking_claims" }, MAPS)).toEqual({
      label: "Started checking claims",
    });
  });

  it("splits ' — ' into label + detail", () => {
    expect(formatFeedRow("claim.progress", { checked: 23, of: 56, verified: 20 }, MAPS)).toEqual({
      label: "Claims 23 of 56",
      detail: "20 verified",
    });
    expect(formatFeedRow("finding.emitted", { findingOrdinal: 3, severity: "blocking" }, MAPS)).toEqual({
      label: "Finding 3",
      detail: "blocking",
    });
  });

  it("raw payload values interpolate when no enum entry covers them", () => {
    expect(formatFeedRow("step.finished", { phase: "unknown_phase", credits: 42 }, MAPS)).toEqual({
      label: "Finished unknown_phase",
      detail: "42 credits",
    });
  });

  it("missing payload fields resolve to empty text; a null payload still fills static text", () => {
    expect(formatFeedRow("step.started", {}, MAPS)).toEqual({ label: "Started " });
    expect(formatFeedRow("steer.paused", null, MAPS)).toEqual({ label: "Paused", detail: "" });
  });

  it("FAILS CLOSED — an event type with no template renders nothing (REQ-IDE-14)", () => {
    expect(formatFeedRow("agent.note", { text: "agent prose" }, MAPS)).toBeNull();
    expect(formatFeedRow("run.internal_debug", { x: 1 }, MAPS)).toBeNull();
    expect(formatFeedRow("", {}, MAPS)).toBeNull();
  });
});
