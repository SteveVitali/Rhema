// R5OPS.1 (REQ-OPS-7; BL-36; D-P0.15-4) — the nightly-golden driver's budget gate + honesty
// contract, pinned by source scan.
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
    expect(SRC).toContain('const dryRun = !args.includes("--execute")');
    expect(SRC).toMatch(/if \(dryRun\)[\s\S]*?process\.exit\(0\)/);
  });
  it("--execute refuses without GOLDEN_BUDGET_RULING=approved (the ⚑ item)", () => {
    expect(SRC).toMatch(/process\.env\.GOLDEN_BUDGET_RULING !== "approved"[\s\S]*?process\.exit\(3\)/);
    expect(SRC).toContain("~$150–300/night");
  });
  it("never fabricates a manifest — no measured --scores file, no write", () => {
    expect(SRC).toMatch(/!SCORES_FILE[\s\S]*?never fabricate|manifest without measured scores is fabrication/i);
    expect(SRC).toMatch(/scores\.fixtures[\s\S]*?length === 0[\s\S]*?process\.exit\(2\)/);
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
