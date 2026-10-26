// R5OPS.1 (REQ-OPS-7; BL-36; D-P0.15-4) + R6GLD.1 (REQ-DISC-3; GD-GOLDEN-CAP.R6) — the
// golden-validation driver's budget gate + honesty contract, pinned by source scan.
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const SRC = readFileSync(
  resolve(dirname(fileURLToPath(import.meta.url)), "nightly-golden-driver.mjs"),
  "utf8",
);

describe("nightly-golden-driver — the budget ruling is fail-closed", () => {
  it("dry-run is the default and touches nothing", () => {
    expect(SRC).toContain('const dryRun = !args.includes("--execute") && !DISPATCH');
    expect(SRC).toMatch(/if \(dryRun\)[\s\S]*?process\.exit\(0\)/);
  });
  it("paid modes refuse without GOLDEN_BUDGET_RULING=approved (the ⚑ item)", () => {
    expect(SRC).toMatch(/process\.env\.GOLDEN_BUDGET_RULING !== "approved"[\s\S]*?process\.exit\(3\)/);
    expect(SRC).toContain("GD-GOLDEN-CAP.R6");
  });
  it("never fabricates a manifest — no measured --scores file, no write", () => {
    expect(SRC).toMatch(/!SCORES_FILE[\s\S]*?never fabricate|manifest without measured scores is fabrication/i);
    expect(SRC).toMatch(/scores\.fixtures[\s\S]*?length === 0[\s\S]*?process\.exit\(2\)/);
  });
});

describe("nightly-golden-driver — R6GLD.1 the minimal cohort", () => {
  it("--cohort minimal selects one protocol golden per seeded protocol via minimalCohort()", () => {
    expect(SRC).toContain('COHORT = flag("--cohort")');
    expect(SRC).toContain("P.minimalCohort()");
    expect(SRC).toMatch(/COHORT !== "minimal"[\s\S]*?process\.exit\(2\)/);
  });
  it("--estimate is committed BEFORE dispatch and >cap pauses (deliverable 3 verbatim)", () => {
    expect(SRC).toMatch(/ESTIMATE_ONLY[\s\S]*?cohortEstimate\(\)/);
    expect(SRC).toMatch(/!est\.withinCap[\s\S]*?PAUSE[\s\S]*?process\.exit\(4\)/);
    // the dispatch re-checks the estimate — a stale committed artifact can never arm a spend.
    expect(SRC).toMatch(/dispatch[\s\S]*?withinCap[\s\S]*?PAUSE/);
  });
  it("--execute --cohort minimal refuses a partial cohort (never gate on a subset)", () => {
    expect(SRC).toMatch(/missing measured leg for/);
    expect(SRC).toMatch(/exactly one measured leg per protocol/);
  });
  it("the dispatch proves the launch-candidate SHA before spending (--expect-sha vs healthz)", () => {
    expect(SRC).toContain('flag("--expect-sha")');
    expect(SRC).toMatch(/gitSha\.startsWith\(EXPECT_SHA\)/);
    expect(SRC).toMatch(/launch-candidate SHA/);
  });
  it("--dispatch-tag is required and joins the run idempotency key (reruns can't dedupe stale)", () => {
    expect(SRC).toContain('flag("--dispatch-tag")');
    expect(SRC).toMatch(/!DISPATCH_TAG[\s\S]*?process\.exit\(2\)/);
    expect(SRC).toContain("golden-${leg.fixture.id}-${EXPECT_SHA}-${DISPATCH_TAG}");
    // a rerun at the same SHA is the rerun rule's core case — the tag MUST be in the key.
    expect(SRC).toMatch(/dispatchTag:\s*DISPATCH_TAG/);
  });
  it("the dispatch refuses a non-test workspace and measures spend from the meter of record", () => {
    expect(SRC).toMatch(/ws\.is_test !== true[\s\S]*?flagged test tenants only/);
    expect(SRC).toContain("sum(list_cost_usd)");
    expect(SRC).toContain("GOLDEN_SESSION_COOKIE");
    expect(SRC).toContain("GOLDEN_MINT_SESSION");
    // a minted session only ever for a pinned test identity — the journeys seam's own guard.
    expect(SRC).toContain("assertTestIdentity");
  });
  it("the dispatch stops at the cap and writes partial spend honestly", () => {
    expect(SRC).toMatch(/CAP TRIP[\s\S]*?cumulative[\s\S]*?break/);
    expect(SRC).toMatch(/out\.length < cohortLegs\.length[\s\S]*?process\.exit\(5\)/);
  });
});

describe("nightly-golden-driver — the manifest → gate seam", () => {
  it("writes evals/fixtures/nightly-manifest.json then invokes gateFixtures", () => {
    expect(SRC).toContain("evals/fixtures/nightly-manifest.json");
    expect(SRC).toContain('import("../nightly-golden.mjs")');
    expect(SRC).toMatch(/gateFixtures\(manifest\)/);
    expect(SRC).toMatch(/process\.exit\(gate\.blocked \? 1 : 0\)/);
  });
  it("labels the absent-manifest exit-0 as NON-EVIDENCE verbatim", () => {
    expect(SRC).toContain("exit 0 on an absent manifest is NON-EVIDENCE");
  });
});
