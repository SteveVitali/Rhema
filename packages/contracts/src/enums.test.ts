import { describe, expect, it } from "vitest";
import {
  CLAIM_VERDICTS,
  GATE_KINDS,
  NEVER_AUTOPROCEED_GATES,
  RUN_STATES,
  SEVERITIES,
  WORKFLOW_KEYS,
  claimVerdictSchema,
} from "./enums.js";

// Structural-enum invariants, including the REQ-OBJ-17 frozen ClaimVerdict golden (AC6) and the REQ-IDE-50
// renames.

describe("ClaimVerdict — frozen seven-value enum (REQ-OBJ-17)", () => {
  // PINNED GOLDEN: any change to this exact list is a protocol version bump, never a rename-in-place. A drift
  // (adding/removing/renaming a verdict) breaks this test — the AC6 drift guard.
  const GOLDEN = [
    "verified",
    "substantially_accurate",
    "misleading_in_context",
    "unsupported",
    "contradicted",
    "unverifiable",
    "verified_against_user_source",
  ];

  it("is exactly the seven golden values, in order", () => {
    expect([...CLAIM_VERDICTS]).toEqual(GOLDEN);
    expect(CLAIM_VERDICTS.length).toBe(7);
  });

  it("rejects a value outside the frozen set", () => {
    expect(() => claimVerdictSchema.parse("mostly_true")).toThrow();
    expect(claimVerdictSchema.parse("misleading_in_context")).toBe("misleading_in_context");
  });
});

describe("REQ-IDE-50 renames and enum shapes", () => {
  it("GateKind is the twelve kinds", () => {
    expect(GATE_KINDS.length).toBe(12);
    expect(GATE_KINDS).toContain("confirm_cost");
    expect(GATE_KINDS).toContain("refusal");
  });

  it("the spend/refusal gates never auto-proceed", () => {
    expect([...NEVER_AUTOPROCEED_GATES].sort()).toEqual(
      ["confirm_cost", "refusal", "resume_partial", "spend_overrun"].sort(),
    );
  });

  it("RunState drops 'estimating' (estimation is stateless — REQ-SPEC-16)", () => {
    expect(RUN_STATES as readonly string[]).not.toContain("estimating");
    expect(RUN_STATES).toContain("awaiting_consent");
    expect(RUN_STATES).toContain("completed_partial");
  });

  it("Severity is blocking/major/minor/note (REQ-SPEC-4)", () => {
    expect(SEVERITIES).toEqual(["blocking", "major", "minor", "note"]);
  });

  it("WorkflowKey uses 'review'/'revise' (Run.verb → workflow rename)", () => {
    expect(WORKFLOW_KEYS).toContain("review");
    expect(WORKFLOW_KEYS).toContain("revise");
    expect(WORKFLOW_KEYS as readonly string[]).not.toContain("editorial_review");
  });
});
