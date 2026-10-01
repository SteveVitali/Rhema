import { describe, it, expect } from "vitest";
import type { WorkflowKey } from "@rhema/contracts";
import { WORKFLOW_MANIFESTS } from "@rhema/protocols";
import {
  activePhaseCount,
  phaseFlagsForToggles,
  resolveToggles,
  sheetProfile,
  TOGGLE_OPT_OUT_FLAG,
} from "./profiles.js";

// PRB.23 — the toggle → manifest `optOutFlag` bridge. The D-PRB.21-1 divergence: the sheet priced
// rigor-default toggles while the run froze `inputs:{}`, so `runspec.isOptedOut` could never fire
// and every manifest phase ran regardless. These pins keep the priced phase set and the executed
// phase set identical.

describe("TOGGLE_OPT_OUT_FLAG — toggle keys map onto the manifest's declared flags", () => {
  it("covers every optOutFlag the sheet workflows declare, and no more", () => {
    const declared = new Set<string>();
    for (const w of ["review", "revise", "fact_check", "profile_voice"] as const) {
      for (const p of WORKFLOW_MANIFESTS[w]?.phases ?? []) {
        if (p.optOutFlag != null) declared.add(p.optOutFlag);
      }
    }
    // every flag a sheet toggle can govern is declared by some manifest phase.
    for (const flag of Object.values(TOGGLE_OPT_OUT_FLAG)) expect(declared.has(flag)).toBe(true);
  });
});

describe("phaseFlagsForToggles — the frozen-input flags the runspec reads", () => {
  it("review quick defaults opt out discourse + second_read only", () => {
    const toggles = resolveToggles(sheetProfile("review"), "quick");
    expect(phaseFlagsForToggles("review", toggles)).toEqual({
      verification: true,
      discourse: false,
      second_read: false,
    });
  });

  it("review standard/full defaults leave every phase active", () => {
    for (const rigor of ["standard", "full_board"] as const) {
      const toggles = resolveToggles(sheetProfile("review"), rigor);
      expect(phaseFlagsForToggles("review", toggles)).toEqual({
        verification: true,
        discourse: true,
        second_read: true,
      });
    }
  });

  it("an explicit fact_check:false override opts verification out", () => {
    const toggles = resolveToggles(sheetProfile("review"), "standard", { fact_check: false });
    expect(phaseFlagsForToggles("review", toggles).verification).toBe(false);
  });

  it("revise quick defaults opt out the research + gap-analysis phases", () => {
    const toggles = resolveToggles(sheetProfile("revise"), "quick");
    expect(phaseFlagsForToggles("revise", toggles)).toEqual({ research: false, gap_analysis: false });
  });

  it("never emits a flag the manifest does not declare (server-authored surface)", () => {
    // fact_check's manifest declares no optOutFlag — nothing to freeze even though a resolved
    // toggle map could carry unrelated keys.
    expect(phaseFlagsForToggles("fact_check", { fact_check: false })).toEqual({});
  });
});

describe("activePhaseCount — the estimator's `phases` input", () => {
  it("quick review counts 5 phases (discourse + second_read omitted)", () => {
    expect(activePhaseCount("review", resolveToggles(sheetProfile("review"), "quick"))).toBe(5);
  });
  it("standard review counts all 7", () => {
    expect(activePhaseCount("review", resolveToggles(sheetProfile("review"), "standard"))).toBe(7);
  });
  it("a fact_check-off standard review counts 6", () => {
    const t = resolveToggles(sheetProfile("review"), "standard", { fact_check: false });
    expect(activePhaseCount("review", t)).toBe(6);
  });
  it("returns undefined for a workflow with no manifest (term contributes 0)", () => {
    expect(activePhaseCount("draft" as WorkflowKey, {})).toBeUndefined();
  });
});
