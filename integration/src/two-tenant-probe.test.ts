import { describe, expect, it } from "vitest";
import { runDeterministicProbe } from "./two-tenant-probe.js";

// SEC.1 (REQ-SPEC-30; journey step X1's API half) — the deterministic two-tenant probe: every
// tenant-scoped GET route over the real api, as each tenant with the OTHER tenant's ids, under the
// prod-shaped user-serving role (`rhema_app_login` — the harness binds it). Zero foreign ids/nonce
// may appear; each tenant must still see its own rows (fail-closed ≠ empty); the route census fails
// when a new GET lands unprobed.

describe("SEC.1 — the two-tenant probe over the real api surface", () => {
  it("no tenant-scoped GET leaks the other tenant's ids or marker rows", async () => {
    const report = await runDeterministicProbe();
    if (!report.passed) console.error(JSON.stringify(report, null, 2));
    expect(report.routesProbed).toBeGreaterThan(50); // the surface is big — a silent empty probe is a fail
    expect(report.writesProbed).toBeGreaterThan(0); // DEF.4 — the refund write route is probed too
    expect(report.ownDataSanity).toEqual([]);
    expect(report.findings).toEqual([]);
  }, 120_000);
});
