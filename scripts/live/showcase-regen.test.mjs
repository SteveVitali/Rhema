// R6CNT.3 — the Showcase regeneration driver's fail-closed contract, pinned by source scan. The
// driver executes at import time (it IS the paid-dispatch shell), so the arms are asserted on the
// file text — each pin fails if its check is removed.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "showcase-regen.mjs"),
  "utf8",
);

describe("showcase-regen — the ≤$40 budget gate is fail-closed", () => {
  it("the paid leg refuses without REGEN_BUDGET_RULING=approved", () => {
    expect(SRC).toMatch(/REGEN_BUDGET_RULING !== "approved"[\s\S]*?process\.exit\(3\)/);
    expect(SRC).toContain("GD-REMAINING.R6");
  });
  it("--estimate refuses past the bound and exits 4 before any dispatch", () => {
    expect(SRC).toMatch(/!est\.withinBound[\s\S]*?process\.exit\(4\)/);
    expect(SRC).toContain("withinBound: base.capUsdList <= USD_BOUND");
  });
  it("an unfunded workspace refuses — the house-grant seam is named, never silently run", () => {
    expect(SRC).toMatch(/bal\.available < baseLeg\.capCredits[\s\S]*?process\.exit\(4\)/);
    expect(SRC).toContain("admin-cli house-grant");
  });
  it("a measured spend past the bound exits non-zero (6) — never a quiet overrun", () => {
    expect(SRC).toMatch(/usd > USD_BOUND[\s\S]*?process\.exit\(6\)/);
  });
});

describe("showcase-regen — provenance + tenant + attempt safety", () => {
  it("refuses a wrong deployed SHA before any spend", () => {
    expect(SRC).toMatch(/!gitSha\.startsWith\(EXPECT_SHA\)[\s\S]*?process\.exit\(3\)/);
  });
  it("refuses a non-is_test workspace — the regeneration never touches a real tenant", () => {
    expect(SRC).toMatch(/ws\.is_test !== true[\s\S]*?process\.exit\(3\)/);
  });
  it("requires --dispatch-tag so a same-tag re-invocation dedupes instead of double-spending", () => {
    expect(SRC).toContain("requires --dispatch-tag <attempt-name>");
    expect(SRC).toContain("showcase-regen-${EXPECT_SHA}-${DISPATCH_TAG}");
  });
  it("the dispatch ingests the committed fixture text — the run reviews what the showcase shows", () => {
    expect(SRC).toContain("SHOWCASE_FIXTURE_V1_MD");
  });
});

describe("showcase-regen — never retries; the export reads the delivered rows", () => {
  it("a non-terminal timeout is recorded, not relaunched", () => {
    expect(SRC).toContain("NOT relaunched");
  });
  it("a failed terminal run exits non-zero (5) — the scores file is the honest record", () => {
    expect(SRC).toMatch(
      /row\.state !== "completed" && row\.state !== "completed_partial"[\s\S]*?process\.exit\(5\)/,
    );
  });
  it("--export refuses a non-delivered run — no fabricated bundle", () => {
    expect(SRC).toMatch(/only a delivered run exports a bundle/);
    expect(SRC).toMatch(/delivered no review correspondence/);
  });
  it("--emit only consumes a delivered export bundle — hand-written content refuses", () => {
    expect(SRC).toMatch(/--emit/);
    expect(SRC).toMatch(/emit only consumes[\s\S]*?a delivered --export bundle/);
    expect(SRC).toMatch(/showcase-run-fixture\.ts/);
  });
  it("measured spend comes from usage_records (the meter of record)", () => {
    expect(SRC).toMatch(/sum\(list_cost_usd\)[\s\S]*?from usage_records where run_id/);
  });
});
