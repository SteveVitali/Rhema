import { describe, it, expect } from "vitest";
import { AGENT_TYPE_KEYS, WORKFLOW_KEYS, SIDECAR_REGISTRY } from "@rhema/contracts";
import { WORKFLOW_MANIFESTS, review, revise } from "./index.js";
import type { PhaseManifest, WorkflowManifest } from "./manifest-types.js";

// P0.03 AC2 (index order = the skill's own fallback order) and AC3 (judge-class allowsSubagents:false;
// every back-edge declared). §12.2.

const all = Object.values(WORKFLOW_MANIFESTS) as WorkflowManifest[];
const JUDGE_SEATS = new Set(AGENT_TYPE_KEYS);
const KNOWN_SIDECARS = new Set(Object.keys(SIDECAR_REGISTRY));

// The expected phase order per workflow — the skill's OWN fallback order (AC2). Review's fallback is
// 0,4,1,2,5,3,6; the others are linear; the two subsets keep their relative order.
const EXPECTED: Record<string, { keys: string[]; skillPhases: string[] }> = {
  review: {
    keys: ["intake", "craft", "verification", "discourse", "second_read", "argument", "letter"],
    skillPhases: ["0", "4", "1", "2", "5", "3", "6"],
  },
  revise: {
    keys: ["bootstrap", "research", "triage", "revise", "verify", "gap_analysis", "deliver"],
    skillPhases: ["0", "1", "2", "3", "4", "5", "6"],
  },
  fact_check: { keys: ["inventory", "verification"], skillPhases: ["0", "1"] },
  profile_voice: {
    keys: ["census", "close_reading", "voice", "substance", "calibration", "package"],
    skillPhases: ["0", "1", "2", "3", "4", "5"],
  },
  refresh_voice: {
    keys: ["census", "close_reading", "voice", "substance", "calibration", "package"],
    skillPhases: ["0", "1", "2", "3", "4", "5"],
  },
  calibrate_voice: { keys: ["calibration", "package"], skillPhases: ["4", "5"] },
};

describe("phase manifests (§12.2)", () => {
  it("ships exactly the six Phase-0 workflows", () => {
    expect(Object.keys(WORKFLOW_MANIFESTS).sort()).toEqual(
      ["calibrate_voice", "fact_check", "profile_voice", "refresh_voice", "review", "revise"].sort(),
    );
  });

  for (const m of all) {
    describe(m.workflow, () => {
      it("is a valid workflow key with a real skill and valid seats/classes", () => {
        expect(WORKFLOW_KEYS).toContain(m.workflow);
        expect(m.skill).toMatch(/^(editorial-review|respond-to-review|bootstrap-persona)$/);
        for (const p of m.phases) {
          expect(JUDGE_SEATS.has(p.seat)).toBe(true);
          expect(["research", "judge", "generate", "package"]).toContain(p.phaseClass);
          for (const s of p.sidecars) expect(KNOWN_SIDECARS.has(s)).toBe(true); // sidecars validate vs P0.02 schemas
        }
      });

      it("AC2 — index order equals the skill's own fallback order", () => {
        const exp = EXPECTED[m.workflow];
        expect(exp).toBeTruthy();
        // indices are contiguous 0..n-1 (execution order)
        expect(m.phases.map((p) => p.index)).toEqual(m.phases.map((_, i) => i));
        // and, in that order, the keys and native skill phases match the fallback order
        expect(m.phases.map((p) => p.key)).toEqual(exp.keys);
        expect(m.phases.map((p) => p.skillPhase)).toEqual(exp.skillPhases);
      });

      it("AC3 — every judge-class phase declares allowsSubagents: false", () => {
        for (const p of m.phases) if (p.phaseClass === "judge") expect(p.allowsSubagents).toBe(false);
      });

      it("research phases fan out (allowsSubagents: true); generate/package do not", () => {
        for (const p of m.phases) {
          if (p.phaseClass === "research") expect(p.allowsSubagents).toBe(true);
          if (p.phaseClass === "generate" || p.phaseClass === "package") expect(p.allowsSubagents).toBe(false);
        }
      });

      it("budgetShare sums to 1", () => {
        const sum = m.phases.reduce((a, p) => a + p.budgetShare, 0);
        expect(sum).toBeCloseTo(1, 9);
      });
    });
  }

  it("AC3 — the ONLY declared back-edge is revise → triage (§12.2)", () => {
    const withBackEdges: { workflow: string; phase: PhaseManifest }[] = [];
    for (const m of all) for (const p of m.phases) if (p.backEdges?.length) withBackEdges.push({ workflow: m.workflow, phase: p });
    expect(withBackEdges).toHaveLength(1);
    expect(withBackEdges[0]!.workflow).toBe("revise");
    expect(withBackEdges[0]!.phase.key).toBe("revise");
    expect(withBackEdges[0]!.phase.backEdges).toEqual(["triage"]);
    // and it is present exactly on the revise manifest's revise phase
    expect(revise.phases.find((p) => p.key === "revise")!.backEdges).toEqual(["triage"]);
  });

  it("gates land where §6.4 says: review→approve_scope, revise→approve_triage, profile→approve_sample", () => {
    expect(review.phases.find((p) => p.key === "intake")!.gateAfter).toBe("approve_scope");
    expect(revise.phases.find((p) => p.key === "triage")!.gateAfter).toBe("approve_triage");
    expect(WORKFLOW_MANIFESTS.profile_voice!.phases.find((p) => p.key === "census")!.gateAfter).toBe("approve_sample");
  });
});
