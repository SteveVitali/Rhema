import { describe, expect, it } from "vitest";
import { checkWeeklySpendCap, WEEKLY_PAID_CAP_USD, type SpendDb } from "./spend-guard.js";

// JOURNEY.1 — the weekly $5 spend guard: reads flagged-tenant usage for the ISO week, fails the
// paid run before dispatch when the cap is spent.

function fakeDb(usd: number, capture?: { sql?: string; params?: unknown[] }): SpendDb {
  return {
    async query(sql, params) {
      if (capture) {
        capture.sql = sql;
        capture.params = params;
      }
      return { rows: [{ usd }] };
    },
  };
}

describe("checkWeeklySpendCap", () => {
  it("defaults to the $5 cap and passes under it", async () => {
    const r = await checkWeeklySpendCap({ db: fakeDb(2.4) });
    expect(r.capUsd).toBe(WEEKLY_PAID_CAP_USD);
    expect(r.weeklyMeteredUsd).toBe(2.4);
    expect(r.withinCap).toBe(true);
  });
  it("refuses over the cap with the measured amount", async () => {
    const r = await checkWeeklySpendCap({ db: fakeDb(5.01) });
    expect(r.withinCap).toBe(false);
    expect(r.reason).toContain("reached");
  });
  it("refuses AT the cap (≥ $5 — zero headroom), per the contract", async () => {
    const r = await checkWeeklySpendCap({ db: fakeDb(5.0) });
    expect(r.withinCap).toBe(false);
  });
  it("scopes the query to flagged workspaces and the ISO-week start", async () => {
    const capture: { sql?: string; params?: unknown[] } = {};
    const now = new Date("2026-10-01T12:00:00Z"); // a Thursday → week starts Mon 2026-09-28
    await checkWeeklySpendCap({ db: fakeDb(0, capture), now });
    expect(capture.sql).toContain("w.is_test = true");
    expect((capture.params?.[0] as Date).toISOString()).toBe("2026-09-28T00:00:00.000Z");
  });
  it("no DB seam ⇒ reports unknown spend (the caller attests a fresh leg)", async () => {
    const r = await checkWeeklySpendCap({});
    expect(r.weeklyMeteredUsd).toBeNull();
    expect(r.withinCap).toBe(true);
    expect(r.reason).toContain("no-db");
  });
});
