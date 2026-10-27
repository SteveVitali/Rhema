import { describe, expect, it } from "vitest";
import {
  ANALYTICS_EVENTS,
  ANALYTICS_EVENT_NAMES,
  BETA_GATE_THRESHOLDS,
  CLIENT_ANALYTICS_EVENTS,
  CLIENT_ANALYTICS_EVENT_NAMES,
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

describe("F-R6H11B-1 — user_id is an opaque auth id, not a ULID", () => {
  // The prod topup that motivated R6FIX.5: a Better Auth user id (`generateId(32)`, [a-zA-Z0-9])
  // failed `idSchema`'s 26-char ULID check inside `recordAnalyticsEvent` and rolled back the whole
  // grant tx. `authIdSchema` accepts BOTH live auth-id shapes while the entity fields stay ULID-only.
  const BETTER_AUTH_ID = "fX3QvxfHSOajReFRMpe2VpaX0gQqOc7y"; // a real nanoid-shape user.id (H11B evidence)

  it("accepts the ULID and the Better Auth id shapes on user_id", () => {
    const ulid = parseAnalyticsEvent("landing.viewed", ENV, {});
    expect(ulid.user_id).toBe(ENV.user_id);
    const nanoid = parseAnalyticsEvent("landing.viewed", { ...ENV, user_id: BETTER_AUTH_ID }, {});
    expect(nanoid.user_id).toBe(BETTER_AUTH_ID);
  });

  it("still rejects non-id garbage on user_id — and entity ids stay ULID-only", () => {
    for (const bad of ["", "short", "has spaces !!", "x".repeat(65), "id/with*seps"]) {
      expect(() => parseAnalyticsEvent("landing.viewed", { ...ENV, user_id: bad }, {})).toThrow();
    }
    // The widen is scoped to the auth-id field: workspace/project/run ids keep the ULID contract.
    expect(() =>
      parseAnalyticsEvent("landing.viewed", { ...ENV, workspace_id: BETTER_AUTH_ID }, {}),
    ).toThrow();
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

describe("REQ-PROD-15 — every run event carries cost_actual / cost_estimate / rigor", () => {
  it("all run.* catalogue schemas declare the three economics keys (AC1)", () => {
    const runEvents = ANALYTICS_EVENT_NAMES.filter((n) => n.startsWith("run."));
    expect(runEvents.length).toBeGreaterThan(5);
    for (const name of runEvents) {
      const shape = (ANALYTICS_EVENTS[name] as { shape: Record<string, unknown> }).shape;
      for (const key of ["cost_actual", "cost_estimate", "rigor"]) {
        expect(shape, `${name} missing ${key}`).toHaveProperty(key);
      }
    }
  });

  it("a run event parses with all three economics fields populated", () => {
    const e = parseAnalyticsEvent("run.completed", ENV, {
      verdict: "strong",
      cost_actual: 512,
      cost_estimate: 560,
      rigor: "standard",
    });
    expect(e.props).toMatchObject({ cost_actual: 512, cost_estimate: 560, rigor: "standard" });
  });
});

describe("client intake whitelist (PRB.12)", () => {
  it("is a strict subset of the catalogue (only view/dwell/timer signals a server can't see)", () => {
    for (const name of CLIENT_ANALYTICS_EVENTS) {
      expect(ANALYTICS_EVENT_NAMES).toContain(name);
    }
    // server-owned facts must never be client-mintable (spend events stay forgery-proof)
    for (const serverOnly of [
      "topup.purchased",
      "credits.granted",
      "run.launched",
      "finding.disposed",
      "wtp.recorded",
    ]) {
      expect(CLIENT_ANALYTICS_EVENT_NAMES.has(serverOnly)).toBe(false);
    }
  });
});

describe("REQ-BETA-18 gate registry (pre-registered thresholds)", () => {
  it("registers all nine gate metrics with the verbatim REQ-BETA-18 values", () => {
    expect(BETA_GATE_THRESHOLDS).toMatchObject({
      repeatCycleRate: { value: 0.5, direction: "floor", clause: "proceed" },
      acceptAdaptShare: { value: 0.55, direction: "floor", clause: "proceed" },
      secondManuscriptImport: { value: 0.6, direction: "floor", clause: "proceed" },
      paidConversion: { value: 0.4, direction: "floor", clause: "proceed" },
      round2Rate: { value: 0.2, direction: "floor", clause: "stop" },
      medianStatedWtp: { value: 20, direction: "floor", clause: "stop" },
      autoProceedShare: { value: 0.4, direction: "ceiling", clause: "stop" },
      cancelRate: { value: 0.08, direction: "ceiling", clause: "stop" },
      boundaryAttestationFailures: { value: 0, direction: "exact", clause: "stop" },
    });
  });
});
