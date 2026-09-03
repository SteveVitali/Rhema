import { describe, expect, it } from "vitest";
import { gateFixtures, formatReport } from "./nightly-golden.mjs";

const FLOORS = { materialRecallFloor: 0.8, citedFetched: true, attestationViolationsMax: 0, schemaValid: true };

describe("nightly-golden runner (§13.5; REQ-ARCH-36/REQ-EVAL-17)", () => {
  it("passes when every fixture meets its floors → promotion OK", () => {
    const manifest = {
      fixtures: [
        { fixtureId: "the-politics-of-visibility", floors: FLOORS, scores: { materialRecall: 0.9, citedFetched: true, attestationViolations: 0, schemaValid: true } },
        { fixtureId: "constitution-of-reason", floors: FLOORS, scores: { materialRecall: 0.82, citedFetched: true, attestationViolations: 0, schemaValid: true } },
      ],
    };
    const gate = gateFixtures(manifest);
    expect(gate.blocked).toBe(false);
    expect(gate.results.every((r) => r.passed)).toBe(true);
    expect(formatReport(gate)).toMatch(/Promotion OK/);
  });

  it("BLOCKS promotion when a fixture regresses below a floor (REQ-EVAL-17)", () => {
    const manifest = {
      fixtures: [
        { fixtureId: "structure-of-political-difference", floors: FLOORS, scores: { materialRecall: 0.6, citedFetched: true, attestationViolations: 0, schemaValid: true } },
      ],
    };
    const gate = gateFixtures(manifest);
    expect(gate.blocked).toBe(true);
    expect(gate.failed.map((r) => r.fixtureId)).toEqual(["structure-of-political-difference"]);
    expect(formatReport(gate)).toMatch(/PROMOTION BLOCKED/);
  });

  it("BLOCKS when a required deterministic check was not measured (unrun ≠ pass)", () => {
    const gate = gateFixtures({ fixtures: [{ fixtureId: "fx", floors: FLOORS, scores: { materialRecall: 0.9 } }] });
    expect(gate.blocked).toBe(true);
  });

  it("an empty manifest gates nothing (no promotion block)", () => {
    const gate = gateFixtures({ fixtures: [] });
    expect(gate.blocked).toBe(false);
    expect(gate.results).toEqual([]);
  });
});
