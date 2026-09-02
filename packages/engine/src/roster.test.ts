import { describe, it, expect } from "vitest";
import { buildAgentRoster } from "./roster.js";

// The subagent roster from the model profile (§12.2, §12.3). Input-scoped roles carry tools:["Read"] and are
// launched by the orchestrator; only `researcher` fans out in-query with search/fetch.

describe("buildAgentRoster (§12.2/§12.3)", () => {
  it("scopes the four input-scoped roles to Read only, marked input-scoped", () => {
    const r = buildAgentRoster({ tier: "base" });
    for (const role of ["second-reader", "fidelity-auditor", "gap-analyst", "holdout-calibrator"]) {
      expect(r[role].tools).toEqual(["Read"]);
      expect(r[role].inputScoped).toBe(true);
    }
  });

  it("gives the researcher search + fetch and marks it in-query fan-out", () => {
    const r = buildAgentRoster({ tier: "base" });
    expect(r.researcher.tools).toEqual(["Read", "WebSearch", "WebFetch"]);
    expect(r.researcher.inputScoped).toBe(false);
  });

  it("routes research subagents to Haiku at Base and judges to Sonnet (§12.3)", () => {
    const r = buildAgentRoster({ tier: "base" });
    expect(r.researcher.model).toBe("claude-haiku-4-5-20251001");
    expect(r["second-reader"].model).toBe("claude-sonnet-5");
  });

  it("lifts models by tier (Balanced → Opus judges)", () => {
    const r = buildAgentRoster({ tier: "balanced" });
    expect(r["second-reader"].model).toBe("claude-opus-5");
  });
});
