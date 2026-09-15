import { describe, expect, it } from "vitest";
import { createApp } from "./index.js";

// REQ-BILL-19 (§14.6): `/pricing/rates` is a PUBLIC endpoint (no orchestrator deps needed) — every run report
// links to its version. Full pricing page is PRB.8/P1.16.

describe("GET /pricing/rates", () => {
  it("publishes the current rate table, platform rate, and credit peg without auth", async () => {
    const app = createApp(); // no deps
    const res = await app.request("/pricing/rates");
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      platformRate: number;
      usdPerCredit: number;
      currentVersion: number;
      tables: { version: number; current: boolean }[];
    };
    expect(body.platformRate).toBe(1.4);
    expect(body.usdPerCredit).toBe(0.01);
    expect(body.tables.some((t) => t.current && t.version === body.currentVersion)).toBe(true);
  });
});
