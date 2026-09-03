import { describe, expect, it } from "vitest";
import { CONSUMPTION_ORDER, drawFromBuckets, type HoldBucket } from "./buckets.js";

// AC4 (consumption order, REQ-BILL-15): credits are consumed trial/daily → promo → included → top-up. This
// is the pure core the hold/debit/release paths share; the SQL wiring (incl. expiries via `expireCredits`) is
// exercised in sql-ledger.test.ts.

// A tiny seeded LCG so the property test is deterministic (no external dep).
function lcg(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

describe("consumption order (REQ-BILL-15)", () => {
  it("orders the five buckets trial_pocket → daily → promo → included → topup", () => {
    expect([...CONSUMPTION_ORDER]).toEqual(["trial_pocket", "daily", "promo", "included", "topup"]);
  });

  it("draws from earlier buckets before later ones, exhausting each in turn", () => {
    const draw = drawFromBuckets(
      { included: 500, topup: 500, trial_pocket: 100, daily: 50, promo: 200 },
      700,
    );
    // 100 (trial) + 50 (daily) + 200 (promo) + 350 (included) = 700; topup untouched.
    expect(draw.draws).toEqual([
      { bucket: "trial_pocket", credits: 100 },
      { bucket: "daily", credits: 50 },
      { bucket: "promo", credits: 200 },
      { bucket: "included", credits: 350 },
    ]);
    expect(draw.drawn).toBe(700);
    expect(draw.shortfall).toBe(0);
  });

  it("reports the shortfall when the total balance cannot cover the amount", () => {
    const draw = drawFromBuckets({ included: 100, topup: 50 }, 300);
    expect(draw.drawn).toBe(150);
    expect(draw.shortfall).toBe(150);
  });

  it("draws nothing for a non-positive amount and skips empty/negative buckets", () => {
    expect(drawFromBuckets({ included: 100 }, 0).draws).toEqual([]);
    expect(drawFromBuckets({ included: -5, topup: 40 }, 30).draws).toEqual([{ bucket: "topup", credits: 30 }]);
  });

  it("property: draws strictly in consumption order and never over-draws (1000 random cases)", () => {
    const rand = lcg(20260903);
    for (let i = 0; i < 1000; i++) {
      const balances: Partial<Record<HoldBucket, number>> = {};
      let total = 0;
      for (const b of CONSUMPTION_ORDER) {
        const v = Math.floor(rand() * 400);
        balances[b] = v;
        total += v;
      }
      const amount = Math.floor(rand() * 1600);
      const draw = drawFromBuckets(balances, amount);

      // 1. total drawn = min(amount, total available)
      expect(draw.drawn).toBe(Math.min(amount, total));
      expect(draw.drawn + draw.shortfall).toBe(amount);

      // 2. draws appear in consumption order, each ≤ its bucket balance
      const seen = draw.draws.map((d) => d.bucket);
      const orderIdx = seen.map((b) => CONSUMPTION_ORDER.indexOf(b));
      expect(orderIdx).toEqual([...orderIdx].sort((a, b) => a - b));
      for (const d of draw.draws) expect(d.credits).toBeLessThanOrEqual(balances[d.bucket]!);

      // 3. a later bucket is only touched once every earlier bucket is fully drained
      for (const d of draw.draws) {
        const idx = CONSUMPTION_ORDER.indexOf(d.bucket);
        for (let j = 0; j < idx; j++) {
          const earlier = CONSUMPTION_ORDER[j]!;
          const drawnFromEarlier = draw.draws.find((x) => x.bucket === earlier)?.credits ?? 0;
          if (d.credits > 0) expect(drawnFromEarlier).toBe(balances[earlier]!);
        }
      }
    }
  });
});
