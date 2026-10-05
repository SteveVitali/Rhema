import { describe, expect, it } from "vitest";
import type { StatementFacts } from "./facts.js";
import { templateDef, templateForProtocol } from "./statement.js";
import "./templates.js"; // the registration side-effect index.ts performs for callers

// P1.21 (§8.4/§13.4; REQ-GENRE-5) — the per-protocol AI-use templates. Academic renders the
// ICMJE-shaped disclosure; Op-ed + Memo carry their integrity-row sentences. Every sentence still
// derives from the run record (the generated half) or states the protocol's own contract.

function facts(overrides: Partial<StatementFacts> = {}): StatementFacts {
  return {
    projectId: "proj_1",
    protocolId: "essay",
    venue: null,
    runs: [
      {
        id: "run_1",
        workflow: "review",
        modelTier: "frontier",
        rigor: "standard",
        state: "completed",
        createdAt: new Date("2026-09-10T00:00:00Z"),
      },
    ],
    phases: ["triage", "margin"],
    approvals: [],
    humanRevisionNs: [],
    ...overrides,
  };
}

const NO_OPEN = { openObligations: 0, blockingOpen: 0 };

describe("per-protocol statement templates (REQ-GENRE-5)", () => {
  it("registers icmje for academic, op-ed for op-ed, memo for memo", () => {
    expect(templateForProtocol("academic")).toBe("icmje");
    expect(templateForProtocol("op-ed")).toBe("op-ed");
    expect(templateForProtocol("memo")).toBe("memo");
    expect(templateForProtocol("essay")).toBe("general");
  });

  it("academic's ICMJE template names the tool's role and closes on author responsibility", () => {
    const def = templateDef(templateForProtocol("academic"));
    expect(def.heading).toBe("Declaration of AI-assisted technology");
    const s = def.sentences!(facts({ protocolId: "academic" }), NO_OPEN);
    expect(s[0]).toContain("the tool did not originate results, data, or first-person methodological claims");
    expect(s.at(-1)).toContain("takes full responsibility for the integrity and accuracy");
  });

  it("op-ed's template names the venue and asserts exclusivity", () => {
    const def = templateDef(templateForProtocol("op-ed"));
    const s = def.sentences!(facts({ protocolId: "op-ed", venue: "The Washington Post" }), NO_OPEN);
    expect(s.some((x) => x.includes("The Washington Post"))).toBe(true);
    expect(s.at(-1)).toContain("exclusive to its target outlet");
  });

  it("memo's template asserts the confidentiality row in the author's voice", () => {
    const def = templateDef(templateForProtocol("memo"));
    const s = def.sentences!(facts({ protocolId: "memo" }), NO_OPEN);
    expect(s.at(-1)).toContain("never fetched or searched over the web");
    expect(s.at(-1)).toContain("the author's own");
  });
});
