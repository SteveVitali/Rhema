import { describe, expect, it } from "vitest";
import { JOURNEY_SEED_USAGE_REQUEST_PREFIX } from "@rhema/db";
import {
  CapOverrunError,
  checkWeeklySpendCap,
  FLAGGED_PROXY_SPEND_SCOPE,
  SEED_SPEND_EXCLUSION_SQL,
  WEEKLY_PAID_CAP_USD,
  type SpendDb,
} from "./spend-guard.js";

// JOURNEY.1 — the weekly $5 spend guard: reads flagged-tenant usage for the ISO week, fails the
// paid run before dispatch when the cap is spent.

function fakeDb(usd: number, capture?: { sql?: string; params?: unknown[] }, bypassRls = true): SpendDb {
  return {
    async query(sql, params) {
      if (sql.includes("pg_roles")) {
        return { rows: [{ bypass_rls: bypassRls }] };
      }
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
  it("ECON.1 D-A: sums only the proxy meter — sdk/provider twins never inflate the weekly figure", async () => {
    const capture: { sql?: string; params?: unknown[] } = {};
    await checkWeeklySpendCap({ db: fakeDb(0, capture) });
    expect(capture.sql).toContain("u.source = 'proxy'");
  });
  it("no DB seam ⇒ reports unknown spend (the caller attests a fresh leg)", async () => {
    const r = await checkWeeklySpendCap({});
    expect(r.weeklyMeteredUsd).toBeNull();
    expect(r.withinCap).toBe(true);
    expect(r.reason).toContain("no-db");
  });
  // D-STB.5b-1 (CAP.3): the prod reading — JOURNEY_DATABASE_URL bound the app-login role, FORCE
  // RLS filtered usage_records to zero rows, and the guard greenlit a paid leg over a $58.08 week.
  it("a non-RLS-bypassing pool fails CLOSED — a blind $0 is not a measurement", async () => {
    const r = await checkWeeklySpendCap({ db: fakeDb(0, undefined, false) });
    expect(r.withinCap).toBe(false);
    expect(r.weeklyMeteredUsd).toBeNull();
    expect(r.reason).toContain("system DSN");
  });
  it("the meter query never runs under an untrusted role (the read itself is refused)", async () => {
    const capture: { sql?: string } = {};
    await checkWeeklySpendCap({ db: fakeDb(999, capture, false) });
    expect(capture.sql).toBeUndefined();
  });
});

// R5ECON.1 (REQ-ECON-6, B3-F3) — seeded fixture rows must never count as spend: every guard
// query shares the one scope fragment, which carries the `req_jrn_` marker exclusion.
describe("REQ-ECON-6 — the seed-row exclusion", () => {
  it("the shared scope pins flagged tenants + the meter of record + the req_jrn_ marker", () => {
    expect(FLAGGED_PROXY_SPEND_SCOPE).toContain("w.is_test = true");
    expect(FLAGGED_PROXY_SPEND_SCOPE).toContain("u.source = 'proxy'");
    expect(FLAGGED_PROXY_SPEND_SCOPE).toContain(JOURNEY_SEED_USAGE_REQUEST_PREFIX);
    expect(SEED_SPEND_EXCLUSION_SQL).toContain("provider_request_id");
    expect(SEED_SPEND_EXCLUSION_SQL).toContain("not like");
    // REQ-ECON-13 (Q-ECON.d, ratified): the scope is bucket-blind — entitlement/Included proxy
    // spend counts; no credit-bucket predicate may narrow the guard.
    expect(FLAGGED_PROXY_SPEND_SCOPE).not.toContain("bucket");
    expect(FLAGGED_PROXY_SPEND_SCOPE).not.toContain("included");
  });
  it("the weekly query consumes the shared scope (seeded req_jrn_* rows are excluded)", async () => {
    const capture: { sql?: string } = {};
    await checkWeeklySpendCap({ db: fakeDb(0, capture) });
    expect(capture.sql).toContain(FLAGGED_PROXY_SPEND_SCOPE);
    expect(capture.sql).toContain("req_jrn_");
  });
});

// R5ECON.1 (REQ-ECON-7) — the distinct overrun verdict the runner classifies.
describe("CapOverrunError", () => {
  it("names the step, the metered figure, the cap, and the verdict", () => {
    const e = new CapOverrunError("B16", 6.25, 1);
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe("CapOverrunError");
    expect(e.stepId).toBe("B16");
    expect(e.meteredUsd).toBe(6.25);
    expect(e.capUsd).toBe(1);
    expect(e.message).toContain("cap_overrun");
    expect(e.message).toContain("$6.25");
    expect(e.message).toContain("$1.00");
  });
});
