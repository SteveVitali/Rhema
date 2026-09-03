import { describe, it, expect } from "vitest";
import {
  listCostUsd,
  platformCredits,
  RATE_TABLE_V1,
  CURRENT_RATE_TABLE_VERSION,
  type MeteredUsage,
} from "@rhema/contracts";
import type { UsageSnapshot } from "@rhema/engine";
import { createRateTableCreditRenderer, rateTableCreditRenderer, TIER_MODEL } from "./credit-renderer.js";

const usage: UsageSnapshot = {
  inputTokens: 1_000_000,
  outputTokens: 500_000,
  cacheReadTokens: 2_000_000,
  cacheCreationTokens: 100_000,
  webSearchRequests: 3,
  webFetchRequests: 1,
  costUsd: 0,
};

// The independently-computed expected credits for `usage` at the base tier (sonnet-5) under v1.
const expectedMetered: MeteredUsage = {
  inputTokens: 1_000_000,
  outputTokens: 500_000,
  cacheReadTokens: 2_000_000,
  cacheWriteTokens: 100_000, // cacheCreation → cacheWrite
  webSearchRequests: 3,
  webFetchRequests: 1,
};

describe("createRateTableCreditRenderer (D-P0.08-2)", () => {
  it("prices the in-flight usage under the pinned table at the tier's model, then applies the platform peg", () => {
    const credits = rateTableCreditRenderer(usage, "base", CURRENT_RATE_TABLE_VERSION);
    const expected = platformCredits(listCostUsd(expectedMetered, RATE_TABLE_V1, "claude-sonnet-5"));
    expect(credits).toBeCloseTo(expected, 10);
    expect(credits).toBeGreaterThan(0);
  });

  it("maps cacheCreationTokens onto cacheWriteTokens (they are billed at the write multiplier)", () => {
    const withWrite = rateTableCreditRenderer({ ...usage, cacheCreationTokens: 1_000_000 }, "base", 1);
    const withoutWrite = rateTableCreditRenderer({ ...usage, cacheCreationTokens: 0 }, "base", 1);
    expect(withWrite).toBeGreaterThan(withoutWrite);
  });

  it("prices frontier higher than base for the same usage (fable-5 > sonnet-5)", () => {
    expect(rateTableCreditRenderer(usage, "frontier", 1)).toBeGreaterThan(rateTableCreditRenderer(usage, "base", 1));
    expect(TIER_MODEL.frontier).toBe("claude-fable-5");
  });

  it("falls back to the current table when the pinned version is unknown", () => {
    expect(rateTableCreditRenderer(usage, "base", 9999)).toBeCloseTo(rateTableCreditRenderer(usage, "base", CURRENT_RATE_TABLE_VERSION), 10);
  });

  it("an unknown tier falls through as a model id (prefix-matched by the rate table)", () => {
    const r = createRateTableCreditRenderer({});
    // "claude-opus-5" is not in TIER_MODEL keys but IS a rate-table family — passed through as the model.
    expect(r(usage, "claude-opus-5", 1)).toBeGreaterThan(0);
  });

  it("empty usage renders zero credits", () => {
    const empty: UsageSnapshot = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, webSearchRequests: 0, webFetchRequests: 0, costUsd: 0 };
    expect(rateTableCreditRenderer(empty, "base", 1)).toBe(0);
  });
});
