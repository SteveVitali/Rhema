import { describe, expect, it } from "vitest";
import {
  ANALYTICS_EVENTS,
  ANALYTICS_EVENT_NAMES,
  REASON_CODES,
  parseAnalyticsEvent,
} from "./analytics.js";

// design/9 §7.2 catalogue + §3.5 additions + REQ-BETA-6…12 event shapes. Fixture-validated (the manifest's
// "event fixture" AC per REQ-BETA row).

const ENV = {
  user_id: "01JQ00000000000000000000AA",
  workspace_id: "01JQ00000000000000000000AB",
  tier: "writer",
  surface: "web" as const,
};

describe("analytics catalogue — envelope + additions", () => {
  it("includes the §3.5 additions", () => {
    for (const name of [
      "run.estimated",
      "finding.applied",
      "triage.mode_entered",
      "gate.presence_timer_shown",
      "trial.entitlement_consumed",
    ]) {
      expect(ANALYTICS_EVENT_NAMES).toContain(name);
    }
  });

  it("validates a run.estimated event with the envelope", () => {
    const e = parseAnalyticsEvent("run.estimated", ENV, {
      kind: "review",
      rigor: "standard",
      estimate: 560,
      cap: 840,
      levers_shown: true,
    });
    expect(e.event).toBe("run.estimated");
    expect(e.surface).toBe("web");
  });

  it("rejects an unknown event name and a bad envelope", () => {
    expect(() => parseAnalyticsEvent("run.imagined", ENV, {})).toThrow();
    expect(() => parseAnalyticsEvent("landing.viewed", { ...ENV, surface: "fax" }, {})).toThrow();
  });
});

describe("REQ-BETA-6…12 event shapes", () => {
  it("carries the one-tap reason code enum (REQ-BETA-6)", () => {
    expect([...REASON_CODES]).toEqual([
      "wrong",
      "stylistic_disagreement",
      "already_knew",
      "too_costly",
      "not_this_round",
      "other",
    ]);
    expect(() =>
      ANALYTICS_EVENTS["finding.disposed"].parse({ disposition: "rebut", reason_code: "wrong" }),
    ).not.toThrow();
  });

  it("validates each REQ-BETA-7…12 event fixture", () => {
    expect(() =>
      ANALYTICS_EVENTS["revision.move_traced"].parse({
        finding_id: "01JQ00000000000000000000AC",
        move_id: "01JQ00000000000000000000AD",
        hunk_count: 3,
        chars_changed: 412,
      }),
    ).not.toThrow();
    expect(() =>
      ANALYTICS_EVENTS["rereview.lineage"].parse({ carried: 4, closed: 9, new: 2, reopened: 1 }),
    ).not.toThrow();
    expect(() =>
      ANALYTICS_EVENTS["round.completed"].parse({
        ordinal: 2,
        manuscript_id: "01JQ00000000000000000000AE",
        important: true,
      }),
    ).not.toThrow();
    expect(() =>
      ANALYTICS_EVENTS["surface.dwell"].parse({ surface: "dossier", ms: 42000 }),
    ).not.toThrow();
    expect(() =>
      ANALYTICS_EVENTS["draft.imported"].parse({
        origin: "upload",
        is_new_manuscript: true,
        venue_set: false,
      }),
    ).not.toThrow();
    expect(() =>
      ANALYTICS_EVENTS["wtp.recorded"].parse({ source: "interview", amount: 25 }),
    ).not.toThrow();
    expect(() =>
      ANALYTICS_EVENTS["credits.exhausted_prompt"].parse({ action_taken: "topup" }),
    ).not.toThrow();
  });
});
