import { describe, it, expect } from "vitest";
import { AGENT_TYPE_KEYS, WORKFLOW_KEYS, LAUNCHED_WORKFLOW_KEYS, SIDECAR_REGISTRY } from "@rhema/contracts";
import { WORKFLOW_MANIFESTS, review, revise, draft } from "./index.js";
import type { PhaseManifest, WorkflowManifest } from "./manifest-types.js";

// P0.03 AC2 (index order = the skill's own fallback order) and AC3 (judge-class allowsSubagents:false;
// every back-edge declared). §12.2.

const all = Object.values(WORKFLOW_MANIFESTS) as WorkflowManifest[];
const JUDGE_SEATS = new Set(AGENT_TYPE_KEYS);
const KNOWN_SIDECARS = new Set(Object.keys(SIDECAR_REGISTRY));

// The expected phase order per workflow — the skill's OWN fallback order (AC2). Review's fallback is
// 0,4,1,2,5,3,6; the others are linear; the two subsets keep their relative order.
const EXPECTED: Record<string, { keys: string[]; skillPhases: string[] }> = {
  draft: {
    keys: ["intake", "voice", "plan", "grounding", "draft", "consolidation", "audit", "delivery"],
    skillPhases: ["0", "1", "2", "3", "4", "5", "6", "7"],
  },
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
  // P1.11 — the Rhema-owned Assistant workflows (authored, not ported): burst = plan→fetch→distill
  // (§12.2 Research row); a chat turn is one answer phase.
  research_burst: { keys: ["plan", "fetch", "distill"], skillPhases: ["0", "1", "2"] },
  chat_turn: { keys: ["answer"], skillPhases: ["0"] },
  // P1.12 — the promotion run (§7.3): harvest → classify → spine → gaps, gated on approve_outline.
  outline: { keys: ["harvest", "classify", "spine", "gaps"], skillPhases: ["0", "1", "2", "3"] },
  // P1.13 — the Figure run (§7.5/§6.2): data(honesty) → spec → render(request) → caption.
  figure: { keys: ["data", "spec", "render", "caption"], skillPhases: ["0", "1", "2", "3"] },
  // P1.14 — the adopt hatch's optional reseed (§9.6): one Rhema-owned phase (`phase=reseed`).
  reseed_charter: { keys: ["reseed"], skillPhases: ["reseed"] },
};

describe("phase manifests (§12.2)", () => {
  it("ships exactly the twelve Phase-1 workflows", () => {
    expect(Object.keys(WORKFLOW_MANIFESTS).sort()).toEqual(
      [
        "calibrate_voice",
        "chat_turn",
        "draft",
        "fact_check",
        "figure",
        "outline",
        "profile_voice",
        "refresh_voice",
        "research_burst",
        "reseed_charter",
        "review",
        "revise",
      ].sort(),
    );
  });

  it("UX.1 (ADR-061) — the shipped manifests ARE the launched-workflow list, one for one", () => {
    // @rhema/contracts' LAUNCHED_WORKFLOW_KEYS is the single source every surface reads; a manifest
    // added or pulled here without the contracts row updating fails this build.
    expect(Object.keys(WORKFLOW_MANIFESTS).sort()).toEqual([...LAUNCHED_WORKFLOW_KEYS].sort());
  });

  for (const m of all) {
    describe(m.workflow, () => {
      it("is a valid workflow key with a real skill and valid seats/classes", () => {
        expect(WORKFLOW_KEYS).toContain(m.workflow);
        expect(m.skill).toMatch(
          /^(editorial-review|respond-to-review|bootstrap-persona|draft-from-outline|research-burst|chat-turn|outline-from-research|figure)$/,
        );
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

      it("F15 — a workflow that declares sidecars passes `sidecar: true` in defaultInputs", () => {
        // the ported skills gate `.rhema/<name>.json` + `.rhema/phase-result.json` emission on the
        // `sidecar` input; an oracle `sidecar_validates` must never demand what the skill wasn't asked
        // to emit (PRB.16b F15 — revise declared response-ledger.json with no defaultInputs at all).
        const declares = m.phases.some((p) => p.sidecars.length > 0);
        if (declares) expect(m.defaultInputs?.sidecar).toBe(true);
      });
    });
  }

  it("AC3 — the ONLY declared back-edges are revise → triage and draft grounding → plan (§12.2)", () => {
    const withBackEdges: { workflow: string; phase: PhaseManifest }[] = [];
    for (const m of all) for (const p of m.phases) if (p.backEdges?.length) withBackEdges.push({ workflow: m.workflow, phase: p });
    expect(withBackEdges).toHaveLength(2);
    const edge = (w: string) => withBackEdges.find((x) => x.workflow === w)!;
    expect(edge("revise").phase.key).toBe("revise");
    expect(edge("revise").phase.backEdges).toEqual(["triage"]);
    // REQ-WF-5: a grounding failure re-runs the structure plan with the failure as input.
    expect(edge("draft").phase.key).toBe("grounding");
    expect(edge("draft").phase.backEdges).toEqual(["plan"]);
    // and they are present exactly on the manifests' phases
    expect(revise.phases.find((p) => p.key === "revise")!.backEdges).toEqual(["triage"]);
    expect(draft.phases.find((p) => p.key === "grounding")!.backEdges).toEqual(["plan"]);
  });

  it("gates land where §6.4 says: review→approve_scope, revise→approve_triage, profile→approve_sample, draft→approve_plan", () => {
    expect(review.phases.find((p) => p.key === "intake")!.gateAfter).toBe("approve_scope");
    expect(revise.phases.find((p) => p.key === "triage")!.gateAfter).toBe("approve_triage");
    expect(WORKFLOW_MANIFESTS.profile_voice!.phases.find((p) => p.key === "census")!.gateAfter).toBe("approve_sample");
    // REQ-GATE-5/6 plan half: Approve plan binds + edits the real 02-structure-plan artifact.
    const plan = draft.phases.find((p) => p.key === "plan")!;
    expect(plan.gateAfter).toBe("approve_plan");
    expect(plan.gateArtifact).toBe("agents/author/drafting/v(N+1)/02-structure-plan.md");
  });

  it("P1.12 — the outline run's LAST phase gates on approve_outline bound to the slug'd artifact", () => {
    const m = WORKFLOW_MANIFESTS.outline!;
    const last = m.phases[m.phases.length - 1]!;
    expect(last.key).toBe("gaps");
    expect(last.gateAfter).toBe("approve_outline");
    expect(last.gateArtifact).toBe("agents/author/outline/<slug>.md");
    // every phase is the Assistant seat (the sanctioned author-outline conduit is the only author write).
    for (const p of m.phases) expect(p.seat).toBe("assistant");
    // the sidecar the oracle + the card read is declared on the gated phase.
    expect(last.sidecars).toContain("outline.json");
    const bound = last.completionPredicates.find((p) => p.kind === "outline_spine_bound");
    expect(bound).toMatchObject({ kind: "outline_spine_bound", min: 5, max: 12 });
  });
});
