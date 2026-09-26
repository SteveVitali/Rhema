import { describe, expect, it } from "vitest";
import type { RunContext } from "./context.js";
import { meterResponse } from "./metering.js";
import { EMPTY_METERED_USAGE } from "./rates.js";

function ctx(overrides: Partial<RunContext> = {}): RunContext {
  return {
    runId: "run_1",
    attempt: 2,
    agentId: "editor",
    role: "editor",
    workspaceId: "ws_1",
    billingAccountId: "bill_1",
    projectId: "proj_1",
    provider: "anthropic",
    modelTier: "balanced",
    rateTableVersion: 1,
    capCredits: 100000,
    allowlist: { endpoints: [], models: ["claude-opus-5"] },
    urlPolicy: { blockedDomains: [] },
    ...overrides,
  };
}

describe("meterResponse → usage_records{proxy} row (§12.7)", () => {
  it("builds a fully-tagged row with precise list cost and rounded credits", () => {
    const usage = { ...EMPTY_METERED_USAGE, inputTokens: 1_000_000, outputTokens: 1_000_000 };
    const { row, platformCredits, listCostUsd } = meterResponse({
      ctx: ctx(),
      usage,
      model: "claude-opus-5",
      agentId: "second-reader",
      id: "0000000000000000000000000A",
      ts: "2026-09-02T00:00:00.000Z",
    });
    // Opus 5: $5 in + $25 out per MTok → $30 list → $42 platform → 4200 credits.
    expect(listCostUsd).toBeCloseTo(30, 10);
    expect(platformCredits).toBeCloseTo(4200, 10);
    expect(row).toMatchObject({
      id: "0000000000000000000000000A",
      ts: "2026-09-02T00:00:00.000Z",
      runId: "run_1",
      attempt: 2,
      role: "editor",
      subagentLabel: "second-reader",
      provider: "anthropic",
      model: "claude-opus-5",
      modelTier: "balanced",
      rateTableVersion: 1,
      inputTokens: 1_000_000,
      outputTokens: 1_000_000,
      source: "proxy",
      credits: 4200,
      listCostUsd: 30,
    });
    // Optional attribution defaults to null, not undefined (DB-friendly).
    expect(row.personaId).toBeNull();
    expect(row.userId).toBeNull();
  });

  it("meters server_tool_use + cache-write tokens (AC3)", () => {
    const usage = {
      ...EMPTY_METERED_USAGE,
      cacheWriteTokens: 1_000_000,
      webSearchRequests: 10,
    };
    const { row } = meterResponse({
      ctx: ctx(),
      usage,
      model: "claude-opus-5",
      agentId: "editor",
      id: "0000000000000000000000000B",
    });
    // cache write 1.25 × $5 = $6.25 + 10 searches × $0.01 = $0.10 → $6.35 list.
    expect(row.listCostUsd).toBeCloseTo(6.35, 10);
    expect(row.cacheWriteTokens).toBe(1_000_000);
    expect(row.searches).toBe(10);
  });

  it("carries the provider request id (the usage.reconcile join key, REQ-BILL-13), defaulting to null", () => {
    const { row } = meterResponse({
      ctx: ctx(),
      usage: { ...EMPTY_METERED_USAGE, inputTokens: 1000 },
      model: "claude-opus-5",
      agentId: "editor",
      id: "0000000000000000000000000C",
      providerRequestId: "req_0123abc",
    });
    expect(row.providerRequestId).toBe("req_0123abc");
    const without = meterResponse({ ctx: ctx(), usage: EMPTY_METERED_USAGE, model: "claude-opus-5", agentId: "e", id: "0000000000000000000000000D" });
    expect(without.row.providerRequestId).toBeNull();
  });

  it("throws rather than metering an unknown model silently", () => {
    expect(() =>
      meterResponse({ ctx: ctx(), usage: EMPTY_METERED_USAGE, model: "gpt-4", agentId: "e", id: "x" }),
    ).toThrow();
  });
});
