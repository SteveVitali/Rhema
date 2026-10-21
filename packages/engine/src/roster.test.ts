import { describe, it, expect } from "vitest";
import { buildAgentRoster, mainModelForTier, routeModelForPhaseClass, PHASE_CLASS_MODELS, TEST_CHEAP_ROUTE_MODEL } from "./roster.js";

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

  it("gives the researcher no client web tools (server-side, proxy-guaranteed) and marks it in-query fan-out", () => {
    const r = buildAgentRoster({ tier: "base" });
    // both client web tools dropped (P0.15i AC1): server-side search/fetch is proxy-guaranteed, and a client
    // WebSearch would pre-empt the injected server tool (no server search executes). Research = server tools.
    expect(r.researcher.tools).toEqual(["Read"]);
    expect(r.researcher.inputScoped).toBe(false);
  });

  it("PRB.24 — the researcher's description carries the bounded-scope/compact-return contract", () => {
    // `toSdkAgents` synthesizes the subagent's system `prompt` from this description, so the
    // intra-phase transcript bound must live HERE to reach the subagent's own context: verify
    // only the assigned batch, return compact verdicts — never pasted page text (which would
    // re-inflate the seat's transcript).
    const r = buildAgentRoster({ tier: "base" });
    const d = r.researcher.description;
    expect(d).toContain("ONLY the items");
    expect(d).toContain("verdict");
    expect(d).toContain("never raw page text");
  });

  it("routes research subagents to Haiku at Base and judges to Sonnet (§12.3)", () => {
    const r = buildAgentRoster({ tier: "base" });
    // bare family id (F4) — must match the proxy allowlist + rate table exactly, not a dated id.
    expect(r.researcher.model).toBe("claude-haiku-4-5");
    expect(r["second-reader"].model).toBe("claude-sonnet-5");
  });

  it("lifts models by tier (Balanced → Opus judges)", () => {
    const r = buildAgentRoster({ tier: "balanced" });
    expect(r["second-reader"].model).toBe("claude-opus-5");
  });

  // R5ECON.2 (REQ-ECON-1) — the testCheapRoute arm: judge cells reroute to Haiku, the researcher
  // keeps its per-tier model (already Haiku at base; its bounded-batch contract is costed apart).
  it("cheapRoute reroutes the four judge cells to TEST_CHEAP_ROUTE_MODEL, researcher unchanged", () => {
    const r = buildAgentRoster({ tier: "balanced", cheapRoute: true });
    for (const role of ["second-reader", "fidelity-auditor", "gap-analyst", "holdout-calibrator"]) {
      expect(r[role].model).toBe(TEST_CHEAP_ROUTE_MODEL);
    }
    expect(r.researcher.model).toBe("claude-sonnet-5");
    // off ⇒ the tier's judge cell is untouched (the arm is strictly additive).
    expect(buildAgentRoster({ tier: "balanced", cheapRoute: false })["second-reader"].model)
      .toBe("claude-opus-5");
    expect(TEST_CHEAP_ROUTE_MODEL).toBe("claude-haiku-4-5");
  });
});

// ECON.2 L3 (ADR-087; REQ-ARCH-9) — the §12.3 per-phaseClass routing table. Every cell resolves to
// the §12.3 row's model for that tier; Base has no cheaper in-table route (every class → Sonnet).
describe("routeModelForPhaseClass (§12.3 verbatim)", () => {
  const CLASSES = ["research", "judge", "generate", "package"] as const;
  const EXPECTED: Record<string, Record<string, string>> = {
    base:     { research: "claude-sonnet-5", judge: "claude-sonnet-5", generate: "claude-sonnet-5", package: "claude-sonnet-5" },
    balanced: { research: "claude-sonnet-5", judge: "claude-opus-5",   generate: "claude-opus-5",   package: "claude-sonnet-5" },
    frontier: { research: "claude-opus-5",   judge: "claude-fable-5",  generate: "claude-fable-5",  package: "claude-opus-5" },
  };
  for (const tier of ["base", "balanced", "frontier"] as const) {
    for (const cls of CLASSES) {
      it(`${tier}/${cls} resolves to its §12.3 cell (${EXPECTED[tier][cls]})`, () => {
        expect(routeModelForPhaseClass(tier, cls)).toBe(EXPECTED[tier][cls]);
        expect(PHASE_CLASS_MODELS[tier][cls]).toBe(EXPECTED[tier][cls]);
      });
    }
  }
  it("judge/generate cells equal mainModelForTier — the classes the flat model already ran", () => {
    for (const tier of ["base", "balanced", "frontier"] as const) {
      expect(routeModelForPhaseClass(tier, "judge")).toBe(mainModelForTier(tier));
      expect(routeModelForPhaseClass(tier, "generate")).toBe(mainModelForTier(tier));
    }
  });
  it("Base resolves no class cheaper than its main model (the table leaves no in-table win)", () => {
    for (const cls of CLASSES) {
      expect(routeModelForPhaseClass("base", cls)).toBe(mainModelForTier("base"));
    }
  });
});
