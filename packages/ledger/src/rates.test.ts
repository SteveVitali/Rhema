import { describe, expect, it } from "vitest";
import { buildRatesPublication } from "./rates.js";

// REQ-BILL-2/19: `/pricing/rates` publishes current + previous rate tables with effective dates and the 1.4
// platform rate; every run report links to its version. The full page is PRB.8 / P1.16 — this is the data stub.

describe("buildRatesPublication", () => {
  it("publishes the platform rate, the credit peg, and the current table", () => {
    const pub = buildRatesPublication();
    expect(pub.platformRate).toBe(1.4);
    expect(pub.usdPerCredit).toBe(0.01);
    expect(pub.currentVersion).toBe(1);
    expect(pub.tables.length).toBeGreaterThanOrEqual(1);
    const current = pub.tables.find((t) => t.current)!;
    expect(current.version).toBe(1);
    expect(current.effectiveDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(current.models["claude-opus-5"]).toEqual({ inputUsdPerMTok: 5, outputUsdPerMTok: 25 });
    expect(current.webSearchUsdPerRequest).toBeCloseTo(0.01, 10);
  });

  it("orders tables newest-first and flags exactly one current", () => {
    const pub = buildRatesPublication();
    const versions = pub.tables.map((t) => t.version);
    expect([...versions]).toEqual([...versions].sort((a, b) => b - a));
    expect(pub.tables.filter((t) => t.current)).toHaveLength(1);
  });
});
