import { describe, it, expect } from "vitest";
import { MODEL_TIERS, isModelPriceable, CURRENT_RATE_TABLE_VERSION, type ModelTier } from "@rhema/contracts";
import { rosterModelIds, mainModelForTier } from "@rhema/engine";
import { MODELS_BY_TIER, authorRunAllowlist, authorWebToolPolicy, FETCH_MAX_CONTENT_TOKENS, ANTHROPIC_ENDPOINT } from "./allowlist.js";

// F4 — the model-allowlist trap. The proxy admits a request only when `body.model` is EXACTLY on the run's
// allowlist (`MODELS_BY_TIER`, an exact-match includes) AND priceable in the rate table; otherwise it 403s the
// very first inference. So every model id the engine can ask for — the explicit main-context model AND every
// roster subagent model — MUST be on its tier's allowlist and priceable. A dated id (`claude-haiku-4-5-20251001`)
// on the bare-id allowlist was the confirmed pre-P0.15g bug; this test is the standing guard against re-drift.
describe("roster ↔ proxy allowlist ↔ rate table alignment (F4)", () => {
  for (const tier of MODEL_TIERS as readonly ModelTier[]) {
    const allow = new Set(MODELS_BY_TIER[tier]);
    const ids = [mainModelForTier(tier), ...rosterModelIds(tier)];
    for (const id of [...new Set(ids)]) {
      it(`${tier}: '${id}' is on the tier allowlist AND priceable`, () => {
        expect(allow.has(id)).toBe(true);
        expect(isModelPriceable(CURRENT_RATE_TABLE_VERSION, id)).toBe(true);
      });
    }
  }
});

describe("authorRunAllowlist", () => {
  it("always includes the Anthropic endpoint and the tier's model set", () => {
    const a = authorRunAllowlist({ modelTier: "balanced" });
    expect(a.endpoints).toContainEqual(ANTHROPIC_ENDPOINT);
    expect(a.models).toEqual(MODELS_BY_TIER.balanced);
  });
});

describe("authorWebToolPolicy (PRB.22 — the per-run research bound)", () => {
  it("scales the fetch/search budgets with the claim count and pins page truncation", () => {
    const p = authorWebToolPolicy({ claims: 20 });
    expect(p.search).toBe(true);
    expect(p.fetch).toBe(true);
    // 12 + 4×20 = 92 → clamped at the 80 ceiling; searches 8 + 20 = 28.
    expect(p.fetchBudget).toBe(80);
    expect(p.searchBudget).toBe(28);
    expect(p.fetchMaxContentTokens).toBe(FETCH_MAX_CONTENT_TOKENS);
  });

  it("floors the budgets for a claim-less snapshot — a missing count never means unbounded", () => {
    const p = authorWebToolPolicy({});
    expect(p.fetchBudget).toBe(16); // RESEARCH_FETCH_MIN — the floor still allows baseline reading
    expect(p.searchBudget).toBe(8); // RESEARCH_SEARCH_BASE
  });

  it("a small doc gets a small-but-real budget (701 words ≈ 3 claims)", () => {
    const p = authorWebToolPolicy({ claims: 3 });
    expect(p.fetchBudget).toBe(24); // 12 + 4×3
    expect(p.searchBudget).toBe(11); // 8 + 3
  });
});
