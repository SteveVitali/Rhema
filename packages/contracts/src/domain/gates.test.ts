import { describe, it, expect } from "vitest";
import {
  GATE_DEFAULTS,
  WAIT_DEFAULT_GATES,
  approvalOverridesSchema,
  decisionSchema,
  isAutoProceed,
  MIN_ADDED_DEADLINE_MS,
} from "./gates.js";
import { GATE_KINDS, NEVER_AUTOPROCEED_GATES } from "../enums.js";

const HOUR = 60 * 60 * 1000;

describe("GATE_DEFAULTS — the §6.4 R3 table as data (REQ-GATE-1, §16.3 #2)", () => {
  it("covers exactly the twelve gate kinds", () => {
    expect(Object.keys(GATE_DEFAULTS).sort()).toEqual([...GATE_KINDS].sort());
  });

  it("carries the R3 numbers verbatim (telemetry-revisable defaults, not code constants)", () => {
    expect(GATE_DEFAULTS.approve_plan).toMatchObject({ deadlineMs: 24 * HOUR, onExpiry: "proceed_conservative" });
    expect(GATE_DEFAULTS.approve_cutlist).toMatchObject({ deadlineMs: 2 * HOUR, onExpiry: "proceed_as_proposed" });
    expect(GATE_DEFAULTS.approve_sample).toMatchObject({ deadlineMs: 24 * HOUR, onExpiry: "proceed_as_proposed" });
    expect(GATE_DEFAULTS.confirm_cost).toMatchObject({ deadlineMs: 7 * 24 * HOUR, onExpiry: "cancel" });
    expect(GATE_DEFAULTS.resume_partial).toMatchObject({ deadlineMs: 30 * 24 * HOUR, onExpiry: "accept_partial" });
    expect(GATE_DEFAULTS.refusal).toMatchObject({ deadlineMs: 7 * 24 * HOUR, onExpiry: "cancel" });
  });

  it("approve_scope is informational (blocking:false) by default (REQ-SPEC-17)", () => {
    expect(GATE_DEFAULTS.approve_scope.blocking).toBe(false);
  });

  it("the wait-default kinds wait (no deadline) and are the add-eligible set", () => {
    for (const k of WAIT_DEFAULT_GATES) {
      expect(GATE_DEFAULTS[k].deadlineMs).toBeNull();
      expect(GATE_DEFAULTS[k].onExpiry).toBe("wait");
      expect(GATE_DEFAULTS[k].waitDefault).toBe(true);
    }
    expect([...WAIT_DEFAULT_GATES].sort()).toEqual(["approve_outline", "approve_triage", "choose_thesis"]);
  });

  it("spend/refusal kinds never auto-proceed (onExpiry is never a proceed_*)", () => {
    for (const k of NEVER_AUTOPROCEED_GATES) {
      expect(GATE_DEFAULTS[k].neverAutoProceed).toBe(true);
      expect(isAutoProceed(GATE_DEFAULTS[k].onExpiry)).toBe(false);
    }
  });
});

describe("approvalOverridesSchema — REQ-SPEC-1 override rules (AC3)", () => {
  it("accepts adding 2 h to approve_triage (a wait-default kind)", () => {
    const parsed = approvalOverridesSchema.parse({ approve_triage: 2 * HOUR });
    expect(parsed.approve_triage).toBe(2 * HOUR);
    expect(MIN_ADDED_DEADLINE_MS).toBe(2 * HOUR);
  });

  it("accepts removing a deadline (null = wait) on a non-spend kind", () => {
    expect(approvalOverridesSchema.parse({ approve_plan: null }).approve_plan).toBeNull();
  });

  it("accepts lengthening a defaulted deadline (approve_plan 24 h → 48 h)", () => {
    expect(approvalOverridesSchema.parse({ approve_plan: 48 * HOUR }).approve_plan).toBe(48 * HOUR);
  });

  it("REJECTS shortening a defaulted deadline (approve_plan 24 h → 1 h)", () => {
    const r = approvalOverridesSchema.safeParse({ approve_plan: 1 * HOUR });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/shorten/);
  });

  it("REJECTS any override on a spend/refusal kind", () => {
    for (const k of NEVER_AUTOPROCEED_GATES) {
      expect(approvalOverridesSchema.safeParse({ [k]: null }).success).toBe(false); // even remove
      expect(approvalOverridesSchema.safeParse({ [k]: 8 * 24 * HOUR }).success).toBe(false);
    }
  });

  it("REJECTS adding a sub-2 h deadline to a wait-default kind", () => {
    const r = approvalOverridesSchema.safeParse({ approve_outline: 1 * HOUR });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/≥ 2 h/);
  });

  it("REJECTS adding a deadline to a non-wait-default kind whose default is already a deadline is fine, but a non-add kind with null default is rejected", () => {
    // approve_scope has a null default but is NOT add-eligible → adding is rejected.
    const r = approvalOverridesSchema.safeParse({ approve_scope: 3 * HOUR });
    expect(r.success).toBe(false);
    if (!r.success) expect(r.error.issues[0].message).toMatch(/not a wait-default kind/);
  });
});

describe("decisionSchema — every resolution names its mechanism (REQ-SPEC-1)", () => {
  const GATE = "01JQ00000000000000000000G1";
  const AV1 = "01JQ00000000000000000000A1";
  const AV2 = "01JQ00000000000000000000A2";

  it("accepts a user edit decision with overlay versions", () => {
    const d = decisionSchema.parse({
      gateId: GATE,
      by: "user",
      action: "edit",
      changes: 3,
      overlayVersionIds: [AV1, AV2],
      at: "2026-09-03T12:00:00.000Z",
    });
    expect(d.by).toBe("user");
    expect(d.overlayVersionIds).toHaveLength(2);
  });

  it("accepts a presence-timer timeout decision", () => {
    const d = decisionSchema.parse({ gateId: GATE, by: "timeout", action: "proceed_as_proposed", presence: true, at: "2026-09-03T12:00:00.000Z" });
    expect(d.presence).toBe(true);
  });

  it("accepts a policy-skip decision (REQ-DATA-36)", () => {
    const d = decisionSchema.parse({ gateId: GATE, by: "policy", action: "skipped", at: "2026-09-03T12:00:00.000Z" });
    expect(d.action).toBe("skipped");
  });

  it("rejects an unknown mechanism", () => {
    expect(decisionSchema.safeParse({ gateId: GATE, by: "vibes", action: "approve", at: "2026-09-03T12:00:00.000Z" }).success).toBe(false);
  });
});
