#!/usr/bin/env node
// The nightly golden runner (P0.15; §13.5 "evals in CI"; REQ-ARCH-36; REQ-EVAL-17). §13.5: nightly golden runs of
// all workflows on the default tier; deterministic scorers first; "a nightly score below a fixture's floor blocks
// promotion of protocols or engine changes." This is the RUNNER + PROMOTION GATE + growth hook. The live golden RUN
// (execute each workflow on the three real projects at ~$150–300/night, produce the scores) needs a live engine +
// proxy (H0-deferred); this harness consumes the fixtures-with-scores manifest that run produces, gates on the
// per-fixture floors, and — the growth hook — copies each green dossier's validated sidecars into the parser corpus.
//
// Deterministic core (`gateFixtures`/`formatReport`) is unit-tested; the live run is the deferred leg.

import { readFileSync, readdirSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { assertScoreFloors, promotionBlocked } from "../packages/benchmark/dist/index.js";
import { growParserFixtures } from "./lib/parser-fixture-growth.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * Gate every fixture in a nightly manifest against its pinned deterministic floors (§13.5; REQ-ARCH-36).
 * @param {{ fixtures: {fixtureId:string, floors:object, scores:object}[] }} manifest
 * @returns {{ results: object[], blocked: boolean, failed: object[] }}
 */
export function gateFixtures(manifest) {
  const fixtures = manifest.fixtures ?? [];
  const results = fixtures.map((f) => assertScoreFloors(f.fixtureId, f.floors ?? {}, f.scores ?? {}));
  const { blocked, failed } = promotionBlocked(results);
  return { results, blocked, failed };
}

/** Format a human-readable nightly report (the promotion decision + per-fixture lines). */
export function formatReport({ results, blocked }) {
  const lines = [`Nightly golden — ${results.length} fixture(s)`];
  for (const r of results) {
    lines.push(`  ${r.passed ? "PASS" : "FAIL"}  ${r.fixtureId}  (${r.checked} floor check(s))`);
    for (const f of r.failures) lines.push(`        ✗ ${f.metric}: ${f.reason} (expected ${JSON.stringify(f.expected)}, got ${JSON.stringify(f.actual)})`);
  }
  lines.push(blocked ? "PROMOTION BLOCKED — a fixture scored below its floor (REQ-ARCH-36/REQ-EVAL-17)." : "Promotion OK — all fixtures green.");
  return lines.join("\n");
}

// ---- CLI ----
async function main() {
  const args = process.argv.slice(2);
  const manifestArg = args[args.indexOf("--manifest") + 1];
  const growArg = args.includes("--grow") ? args[args.indexOf("--grow") + 1] : null;

  const manifestPath = manifestArg
    ? resolve(process.cwd(), manifestArg)
    : resolve(root, "evals/fixtures/nightly-manifest.json");

  if (!existsSync(manifestPath)) {
    // The live nightly manifest is produced by the golden RUN (evals/, private + H0-deferred). Absent it, there is
    // nothing to gate — report that honestly and succeed (an empty gate is not a promotion block).
    console.log(`nightly-golden: no manifest at ${manifestPath} (the live golden run is H0-deferred); nothing to gate.`);
    return 0;
  }

  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const gate = gateFixtures(manifest);
  console.log(formatReport(gate));

  // growth hook: copy each GREEN dossier's validated sidecars into the parser corpus (ledger F10). Only runs on an
  // explicit --grow <deliveredRunsDir>; each subdir is `<slug>/.rhema/*.json`.
  if (growArg) {
    const { parseSidecar } = await import("../packages/protocols/dist/parsers/index.js");
    const validate = (filename, jsonText) => {
      try {
        return parseSidecar(filename, { json: JSON.parse(jsonText) }).parseStatus;
      } catch {
        return "failed";
      }
    };
    const fixturesRoot = resolve(root, "packages/protocols/fixtures");
    const deliveredRoot = resolve(process.cwd(), growArg);
    for (const slug of readdirSync(deliveredRoot)) {
      const sourceDir = join(deliveredRoot, slug, ".rhema");
      if (!existsSync(sourceDir)) continue;
      const g = growParserFixtures({ sourceDir, fixturesRoot, projectSlug: slug, validate });
      console.log(`grow ${slug}: +${g.grown.length} grown, ${g.skippedExisting.length} kept, ${g.rejected.length} rejected`);
    }
  }

  return gate.blocked ? 1 : 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().then((code) => process.exit(code)).catch((e) => {
    console.error(e);
    process.exit(2);
  });
}
