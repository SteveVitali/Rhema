// 249_R7GUARD.1 (REQ-GUARD-1…4; spec §4.16 + §1 "R7b done") — the four-guard wiring check.
// The round-7 defects cannot quietly return because CI enforces four guards; this test is
// the committed assertion that each guard's carrier RUNS on the required full path and that
// `docs/ci.md` names each guard's job:
//
//   GUARD-1 no raw controls   — `rhema/no-raw-controls` at `error` over the scope, run by the
//                               `pnpm turbo build lint typecheck` leg;
//   GUARD-2 no internal vocab — the copy lint (`lintInternalTerms` + the eslint `bannedPatterns`
//                               block) + the rendered-key DOM guard (`expectNoInternalKeys`),
//                               run by lint + `pnpm test`;
//   GUARD-3 no reload         — the no-document-reload walk harness (`noreload.ts`), run by
//                               `pnpm test` (its Stage-A fixture walk is a browser leg, so the
//                               chromium install must precede it);
//   GUARD-4 no occlusion      — `u3ProbePage` + `u3UnscrimmedViolation` over the five REQ-PANE-4
//                               sizes, run by `pnpm test` after the same chromium install.
//
// A step without the `mode == 'full'` gate would let a fast-path head skip a guard — the same
// rule ci.yml's header states for every leg. A missing carrier file, a narrowed lint scope,
// or a ci.md that stops naming a guard fails here.

import { describe, expect, test } from "vitest";
import { readFileSync, existsSync } from "node:fs";

const ci = readFileSync(new URL("../../.github/workflows/ci.yml", import.meta.url), "utf8");
const ciDocs = readFileSync(new URL("../../docs/ci.md", import.meta.url), "utf8");
const eslintConfig = readFileSync(new URL("../../eslint.config.js", import.meta.url), "utf8");

/** The `run:` step's block (from the run line to the next step/job), for gate assertions. */
function runStepBlock(cmd) {
  const idx = ci.indexOf(`- run: ${cmd}`);
  if (idx === -1) return null;
  const rest = ci.slice(idx);
  const end = rest.search(/\n {6}- (run|name|uses):/);
  return end === -1 ? rest : rest.slice(0, end);
}

describe("the four recurrence guards are wired on the full path (REQ-GUARD-1…4)", () => {
  test("the three carrier steps exist in ci.yml, each gated mode == 'full'", () => {
    for (const cmd of [
      "pnpm turbo build lint typecheck", // GUARD-1's lint + the build every guard's tests need
      "pnpm --filter @rhema/journeys exec playwright install chromium", // GUARD-3/4's browser legs are never vacuous
      "pnpm test", // GUARD-2's DOM test + GUARD-3/4's local walks
    ]) {
      const block = runStepBlock(cmd);
      expect(block, `ci.yml carries \`${cmd}\``).not.toBeNull();
      expect(block, `\`${cmd}\` must be full-path gated`).toContain(
        "if: needs.fast-path.outputs.mode == 'full'",
      );
    }
  });

  test("GUARD-1 carriers: the rule, the committed exemption list, and the global error block", () => {
    for (const f of [
      "tools/eslint-plugin-rhema/rules/no-raw-controls.js",
      "tools/eslint-plugin-rhema/rules/no-raw-controls-exemptions.js",
      "tools/eslint-plugin-rhema/rules/no-raw-controls.test.ts",
    ]) {
      expect(existsSync(new URL(`../../${f}`, import.meta.url)), f).toBe(true);
    }
    // The scope is the spec's pair of globs with primitives + tests excluded — a narrowed
    // files list or a resurrected `off`/per-file enablement fails this literal pin.
    expect(eslintConfig).toContain('files: ["packages/ui/src/**", "apps/web/src/**/*.tsx"]');
    expect(eslintConfig).toContain(
      'ignores: ["packages/ui/src/primitives/**", "**/*.test.{ts,tsx,mts,mjs}"]',
    );
    expect(eslintConfig).toContain('"rhema/no-raw-controls": "error"');
    expect(eslintConfig).not.toContain('"rhema/no-raw-controls": "off"');
    expect(eslintConfig).not.toContain("NO_RAW_CONTROLS_ENABLED");
  });

  test("GUARD-2 carriers: the copy lint + the DOM key guard", () => {
    for (const f of [
      "packages/contracts/src/vocab-lint.ts",
      "packages/contracts/src/banned-internal-terms.json",
      "apps/web/src/spa/copy-guard.dom.test.tsx",
      "apps/web/src/copy.test.ts",
    ]) {
      expect(existsSync(new URL(`../../${f}`, import.meta.url)), f).toBe(true);
    }
    // the eslint side of the lint: bannedPatterns seeded from the one committed list.
    expect(eslintConfig).toContain("banned-internal-terms.json");
    expect(eslintConfig).toContain("bannedPatterns");
  });

  test("GUARD-3 carriers: the no-reload harness + its Stage-A walk", () => {
    for (const f of [
      "packages/journeys/src/noreload.ts",
      "packages/journeys/src/noreload.local.test.ts",
    ]) {
      expect(existsSync(new URL(`../../${f}`, import.meta.url)), f).toBe(true);
    }
  });

  test("GUARD-4 carriers: the shared probe + its Stage-A walk + the deployed leg", () => {
    for (const f of [
      "packages/journeys/src/u3-probe.ts",
      "packages/journeys/src/u3-occlusion.local.test.ts",
      "packages/journeys/src/r7legs.ts",
      "packages/journeys/src/registry.ts",
    ]) {
      expect(existsSync(new URL(`../../${f}`, import.meta.url)), f).toBe(true);
    }
    const legs = readFileSync(
      new URL("../../packages/journeys/src/r7legs.ts", import.meta.url),
      "utf8",
    );
    // the deployed leg calls the SAME shared assertions the local walk does.
    expect(legs).toContain("u3ProbePage");
    expect(legs).toContain("u3UnscrimmedViolation");
    const registry = readFileSync(
      new URL("../../packages/journeys/src/registry.ts", import.meta.url),
      "utf8",
    );
    expect(registry).toContain('id: "U3.occlusion"');
    expect(registry).toContain('id: "U2.noreload"');
  });

  test("docs/ci.md names each guard and the job it runs in", () => {
    for (const g of ["GUARD-1", "GUARD-2", "GUARD-3", "GUARD-4"]) {
      expect(ciDocs, `docs/ci.md names ${g}`).toContain(g);
    }
    expect(ciDocs).toContain("no-raw-controls");
    expect(ciDocs).toContain("typecheck / lint / unit");
  });
});

describe("the tour-target table the guard walks is the engine's (REQ-PANE-4, 248)", () => {
  test("TOUR_STEPS (r7legs) ≡ DEMO_TOUR_STEPS (demo-tour.ts), ids in order", () => {
    const legs = readFileSync(
      new URL("../../packages/journeys/src/r7legs.ts", import.meta.url),
      "utf8",
    );
    const engine = readFileSync(
      new URL("../../apps/web/src/spa/demo-tour.ts", import.meta.url),
      "utf8",
    );
    const legsList = legs.match(/export const TOUR_STEPS[^[]*\[([\s\S]*?)\];/);
    const engineList = engine.match(/export const DEMO_TOUR_STEPS[^[]*\[([\s\S]*?)\];/);
    expect(legsList, "r7legs exports TOUR_STEPS").not.toBeNull();
    expect(engineList, "demo-tour exports DEMO_TOUR_STEPS").not.toBeNull();
    const ids = (body) => [...body.matchAll(/\bid:\s*"([^"]+)"/g)].map((m) => m[1]);
    expect(ids(legsList[1])).toEqual([
      "published",
      "v1",
      "verdict",
      "one-thing",
      "two-readers",
      "claims",
      "figure",
      "responses",
      "what-changed",
      "writer-edit",
      "cta",
    ]);
    expect(ids(engineList[1])).toEqual(ids(legsList[1]));
  });
});
