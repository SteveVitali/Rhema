import { describe, expect, it } from "vitest";
import {
  EMPTY_METERED_USAGE,
  isModelPriceable,
  listCostUsd,
  PLATFORM_RATE,
  platformCredits,
  rateForModel,
  rateTableFor,
  RATE_TABLE_V1,
  UnknownModelError,
  UnknownRateTableError,
  type MeteredUsage,
} from "./rates.js";

describe("rate table lookup", () => {
  it("resolves each named model to its §12.7 price", () => {
    expect(rateForModel(RATE_TABLE_V1, "claude-sonnet-5")).toEqual({ inputUsdPerMTok: 2, outputUsdPerMTok: 10 });
    expect(rateForModel(RATE_TABLE_V1, "claude-opus-5")).toEqual({ inputUsdPerMTok: 5, outputUsdPerMTok: 25 });
    expect(rateForModel(RATE_TABLE_V1, "claude-fable-5")).toEqual({ inputUsdPerMTok: 10, outputUsdPerMTok: 50 });
  });

  it("matches a dated model id to its family by prefix", () => {
    expect(rateForModel(RATE_TABLE_V1, "claude-fable-5-1")).toEqual({ inputUsdPerMTok: 10, outputUsdPerMTok: 50 });
    expect(rateForModel(RATE_TABLE_V1, "claude-sonnet-5-20260101")).toEqual({
      inputUsdPerMTok: 2,
      outputUsdPerMTok: 10,
    });
  });

  it("throws (never meters silently) for an unknown model or table version", () => {
    expect(() => rateForModel(RATE_TABLE_V1, "gpt-4")).toThrow(UnknownModelError);
    expect(() => rateTableFor(999)).toThrow(UnknownRateTableError);
    expect(isModelPriceable(1, "claude-sonnet-5")).toBe(true);
    expect(isModelPriceable(1, "gpt-4")).toBe(false);
    expect(isModelPriceable(999, "claude-sonnet-5")).toBe(false);
  });
});

describe("list cost (§12.7 prices)", () => {
  it("prices plain input + output tokens", () => {
    const usage: MeteredUsage = { ...EMPTY_METERED_USAGE, inputTokens: 1_000_000, outputTokens: 1_000_000 };
    // Sonnet 5: $2 in + $10 out per MTok.
    expect(listCostUsd(usage, RATE_TABLE_V1, "claude-sonnet-5")).toBeCloseTo(12, 10);
  });

  it("prices cache reads at 0.1x and cache writes at 1.25x of input (AC3)", () => {
    const usage: MeteredUsage = {
      ...EMPTY_METERED_USAGE,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 1_000_000,
    };
    // Sonnet input $2/MTok → cache read 0.2, cache write 2.5 → 2.7.
    expect(listCostUsd(usage, RATE_TABLE_V1, "claude-sonnet-5")).toBeCloseTo(2.7, 10);
  });

  it("prices web search at $10/1k and ignores web_fetch count (AC3)", () => {
    const usage: MeteredUsage = { ...EMPTY_METERED_USAGE, webSearchRequests: 3, webFetchRequests: 5 };
    expect(listCostUsd(usage, RATE_TABLE_V1, "claude-opus-5")).toBeCloseTo(0.03, 10);
  });

  it("sums a full mixed usage block", () => {
    const usage: MeteredUsage = {
      inputTokens: 500_000,
      outputTokens: 200_000,
      cacheReadTokens: 1_000_000,
      cacheWriteTokens: 400_000,
      webSearchRequests: 2,
      webFetchRequests: 0,
    };
    // Opus 5: in 5, out 25. 0.5*5 + 0.2*25 + 1.0*(5*0.1) + 0.4*(5*1.25) + 2*0.01
    // = 2.5 + 5 + 0.5 + 2.5 + 0.02 = 10.52
    expect(listCostUsd(usage, RATE_TABLE_V1, "claude-opus-5")).toBeCloseTo(10.52, 10);
  });
});

describe("platform credits (§14.1)", () => {
  it("applies the 1.4 platform rate and the $0.01 credit peg, unrounded", () => {
    // $10 list → $14 platform → 1400 credits.
    expect(platformCredits(10)).toBeCloseTo(1400, 10);
    expect(PLATFORM_RATE).toBe(1.4);
    // A fractional list stays fractional (rounding happens once per run at debit, not here).
    expect(platformCredits(0.0123)).toBeCloseTo((0.0123 * 1.4) / 0.01, 10);
  });
});
