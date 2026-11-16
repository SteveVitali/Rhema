// 267_R6SEC.2 (RH-8) — the `ci-pass anchor` required-check honesty pin.
//
// The bug: `ci-anchor` needed all six legs but had no `if: always()`, so a red leg left the job
// `skipped` — and GitHub counts a skipped REQUIRED check as PASSED. A fully red pipeline could
// merge. The fix has two halves, both pinned here:
//   1. the job carries `if: always()` and a gate step (assert-needs-green.mjs) runs BEFORE the
//      anchor payload write;
//   2. the gate exits non-zero unless every `needs.*.result` is exactly "success" — failure,
//      skip, and cancellation all fail the anchor.
// The wiring assertions fail on the pre-fix workflow (no `if: always()`, no gate step).

import { describe, expect, test } from "vitest";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const ci = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
const GATE = new URL("./assert-needs-green.mjs", import.meta.url).pathname;

/** The `ci-anchor:` job block (to the next top-level job or EOF). */
const anchorBlock = (() => {
  const start = ci.indexOf("  ci-anchor:");
  expect(start, "ci.yml carries the ci-anchor job").toBeGreaterThan(-1);
  const rest = ci.slice(start);
  const next = rest.search(/\n {2}\S[^\n]*:\n {4}name:/);
  return next === -1 ? rest : rest.slice(0, next);
})();

const SIX_LEGS = [
  "fast-path",
  "typecheck-lint-unit",
  "contracts",
  "integration",
  "images",
  "public-safe",
];

describe("ci-anchor is an honest required check (RH-8)", () => {
  test("the job needs all six legs and runs unconditionally", () => {
    for (const leg of SIX_LEGS) {
      expect(anchorBlock, `ci-anchor needs ${leg}`).toContain(leg);
    }
    // Job-level `if: always()` — a job-if line (4-space indent), not a step gate.
    expect(anchorBlock).toMatch(/\n {4}if: always\(\)\n/);
  });

  test("the needs-result gate runs BEFORE any anchor payload write or upload", () => {
    const gate = anchorBlock.indexOf("node scripts/ci/assert-needs-green.mjs");
    expect(gate, "ci-anchor carries the needs-result gate step").toBeGreaterThan(-1);
    const write = anchorBlock.indexOf("write ci-pass payload");
    const upload = anchorBlock.indexOf("actions/upload-artifact");
    expect(write).toBeGreaterThan(-1);
    expect(gate).toBeLessThan(write);
    expect(gate).toBeLessThan(upload);
    // the gate reads the needs context — not a hardcoded list that can drift.
    const gateStep = anchorBlock.slice(gate - 400, gate);
    expect(gateStep).toContain("toJSON(needs)");
  });

  test("a fast-path head still never writes an anchor (the full-mode gate is intact)", () => {
    expect(anchorBlock).toContain("if: needs.fast-path.outputs.mode == 'full'");
  });
});

describe("assert-needs-green.mjs — the gate itself", () => {
  const run = (needsJson) =>
    spawnSync(process.execPath, [GATE], {
      env: { ...process.env, NEEDS_JSON: needsJson },
      encoding: "utf8",
    });

  const allGreen = JSON.stringify(
    Object.fromEntries(SIX_LEGS.map((l) => [l, { result: "success" }])),
  );

  test("exits 0 when every needed leg concluded success", () => {
    const r = run(allGreen);
    expect(r.status, r.stderr).toBe(0);
  });

  test.each([
    ["failure", { integration: { result: "failure" } }],
    ["skipped", { images: { result: "skipped" } }],
    ["cancelled", { contracts: { result: "cancelled" } }],
  ])("exits 1 when a leg is %s — the RH-8 hole stays closed", (_label, over) => {
    const needs = JSON.parse(allGreen);
    Object.assign(needs, over);
    const r = run(JSON.stringify(needs));
    expect(r.status, r.stdout).toBe(1);
    expect(r.stderr).toContain("non-green legs");
  });

  test.each([
    ["empty", ""],
    ["empty object", "{}"],
    ["not json", "no{json"],
  ])("fails closed on %s NEEDS_JSON", (_label, value) => {
    expect(run(value).status).toBe(1);
  });
});
