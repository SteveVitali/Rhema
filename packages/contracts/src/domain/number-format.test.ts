import { describe, expect, it } from "vitest";
import {
  bucketExpiryLine,
  creditsLine,
  estimateLine,
  formatCredits,
  formatRate,
  formatUsd,
  includedCreditsLine,
  MONEY_FMT_INLINE_JS,
} from "./estimate.js";

// R7KIT.3b (REQ-COPY-5; E1, D5) — the ONE number formatter's contract: bounded-precision rates,
// grouped counts, credits+$ pairing on paid surfaces, 0/negative/null handling, the generated D5
// sentences (never "4,000 of 2,000", never "credits credits"), and parity between the canonical
// formatters and `MONEY_FMT_INLINE_JS` (the no-JS sheet's emitted usd/cr).

const FIT = "{remaining} of {monthly} included credits left";
const OVER = "{remaining} credits left — {monthly} monthly plus {extra} more";
const EXPIRY = "{n} {bucket} expire {at}";

/** eval the inline-script source the SSR sheet emits — the no-JS rendering of the same spec. */
function inlineFns(): { usd: (c: number) => string; cr: (c: number) => string } {
  const factory = new Function(`${MONEY_FMT_INLINE_JS};return {usd,cr};`);
  return factory() as { usd: (c: number) => string; cr: (c: number) => string };
}

describe("formatRate — bounded precision (E1)", () => {
  it("renders the audit's exact float noise as a bounded rate", () => {
    expect(formatRate(0.023000000000000003)).toBe("0.023");
  });
  it("renders integers grouped and whole", () => {
    expect(formatRate(40)).toBe("40");
    expect(formatRate(1240)).toBe("1,240");
    expect(formatRate(0)).toBe("0");
    expect(formatRate(-3)).toBe("-3");
  });
  it("bounds every float to ≤4 decimal digits — property sweep", () => {
    // deterministic LCG — no random seed drift between runs.
    let s = 12345;
    const next = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 2000; i++) {
      const r = (next() - 0.5) * 10 ** (next() * 6 - 2);
      const out = formatRate(r);
      if (out === "—" || out === "<0.0001") continue;
      const m = /^-?[\d,]+(\.(\d+))?$/.exec(out);
      expect(m, `formatRate(${r}) → ${out}`).toBeTruthy();
      expect(m![2]?.length ?? 0, `decimals in ${out}`).toBeLessThanOrEqual(4);
      // never scientific notation, never float-noise tails
      expect(out).not.toMatch(/e[+-]/i);
      expect(out).not.toMatch(/0000\d|9999\d/);
    }
  });
  it("handles 0, negatives and non-finite inputs", () => {
    expect(formatRate(0)).toBe("0");
    expect(formatRate(-0.75)).toBe("-0.75");
    expect(formatRate(Number.NaN)).toBe("—");
    expect(formatRate(Number.POSITIVE_INFINITY)).toBe("—");
    expect(formatRate(0.00002)).toBe("<0.0001");
  });
});

describe("the paid-surface pairing (REQ-COPY-5)", () => {
  it("estimateLine pairs ≈$ with the cap; creditsLine pairs credits with cap + balance", () => {
    expect(estimateLine(560, 840)).toBe("≈ $5.60 · never more than $8.40");
    expect(creditsLine(560, 840, 590)).toBe("560 credits · cap 840 · 590 left after the cap");
  });
  it("formatUsd/formatCredits cover 0, negative and null-ish edges", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatCredits(0)).toBe("0");
    expect(formatCredits(-5)).toBe("-5");
    expect(formatCredits(Number.NaN)).toBe("NaN");
    expect(formatCredits(1234567)).toBe("1,234,567");
  });
});

describe("MONEY_FMT_INLINE_JS — the no-JS script renders the same spec", () => {
  it("usd/cr produce byte-identical output to formatUsd/formatCredits over the credit range", () => {
    const { usd, cr } = inlineFns();
    for (const c of [-12345, -150, -5, -1, 0, 1, 5, 99, 100, 560, 840, 1240, 12345, 100000, 1234567]) {
      expect(usd(c), `usd(${c})`).toBe(formatUsd(c));
      expect(cr(c), `cr(${c})`).toBe(formatCredits(c));
    }
  });
  it("the script source itself carries no ad-hoc toFixed/toLocaleString", () => {
    expect(MONEY_FMT_INLINE_JS).not.toMatch(/toFixed|toLocaleString/);
  });
});

describe("includedCreditsLine — D5's '4,000 of 2,000' is impossible", () => {
  it("within the monthly allowance keeps the 'of' phrasing", () => {
    expect(includedCreditsLine({ remaining: 1240, monthly: 2000, fitFmt: FIT, overFmt: OVER })).toBe(
      "1,240 of 2,000 included credits left",
    );
    expect(includedCreditsLine({ remaining: 2000, monthly: 2000, fitFmt: FIT, overFmt: OVER })).toBe(
      "2,000 of 2,000 included credits left",
    );
  });
  it("rollover/top-up over the allowance renders the truthful over-sentence", () => {
    expect(includedCreditsLine({ remaining: 4000, monthly: 2000, fitFmt: FIT, overFmt: OVER })).toBe(
      "4,000 credits left — 2,000 monthly plus 2,000 more",
    );
  });
  it("remaining can never exceed monthly as phrased — property sweep", () => {
    let s = 999;
    const next = () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
    for (let i = 0; i < 500; i++) {
      const monthly = Math.floor(next() * 5000);
      const remaining = Math.floor(next() * 20000);
      const line = includedCreditsLine({ remaining, monthly, fitFmt: FIT, overFmt: OVER });
      const m = /([\d,]+) of ([\d,]+)/.exec(line);
      if (m) {
        expect(Number(m[1]!.replace(/,/g, "")) <= Number(m[2]!.replace(/,/g, "")), line).toBe(true);
      }
    }
  });
  it("handles 0 and null-ish edges", () => {
    expect(includedCreditsLine({ remaining: 0, monthly: 2000, fitFmt: FIT, overFmt: OVER })).toBe(
      "0 of 2,000 included credits left",
    );
  });
});

describe("bucketExpiryLine — D5's 'credits credits' is impossible", () => {
  it("a credit-named bucket prints the noun exactly once", () => {
    expect(
      bucketExpiryLine({ credits: 4000, bucketLabel: "Plan credits", at: "2026-11-25", fmt: EXPIRY }),
    ).toBe("4,000 Plan credits expire 2026-11-25");
    expect(
      bucketExpiryLine({ credits: 500, bucketLabel: "Top-ups", at: "2026-12-01", fmt: EXPIRY }),
    ).toBe("500 Top-ups credits expire 2026-12-01");
  });
  it("never doubles the noun — property sweep over labels", () => {
    for (const label of ["Plan credits", "Top-ups", "Trial credits", "Daily", "promo CREDITS", ""]) {
      const line = bucketExpiryLine({ credits: 10, bucketLabel: label, at: "x", fmt: EXPIRY });
      expect((line.match(/credits/gi) ?? []).length, `${label} → ${line}`).toBe(1);
    }
  });
  it("handles 0 credits", () => {
    expect(
      bucketExpiryLine({ credits: 0, bucketLabel: "Plan credits", at: "x", fmt: EXPIRY }),
    ).toBe("0 Plan credits expire x");
  });
});
