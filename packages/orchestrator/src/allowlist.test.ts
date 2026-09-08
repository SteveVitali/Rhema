import { describe, it, expect } from "vitest";
import { MODEL_TIERS, isModelPriceable, CURRENT_RATE_TABLE_VERSION, type ModelTier } from "@rhema/contracts";
import { rosterModelIds, mainModelForTier } from "@rhema/engine";
import { MODELS_BY_TIER, authorRunAllowlist, ANTHROPIC_ENDPOINT } from "./allowlist.js";

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
