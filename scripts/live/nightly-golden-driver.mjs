#!/usr/bin/env node
// R5OPS.1 (REQ-OPS-7; BL-36; D-P0.15-4) — the nightly-golden DRIVER skeleton, gated on the
// recorded budget ruling. §13.5 / REQ-ARCH-36 / REQ-EVAL-17: "nightly golden runs of all
// workflows on the default tier; a nightly score below a fixture's floor blocks promotion."
//
// The live RUN (dispatch every workflow over the three fixture projects on a live engine, produce
// measured scores — the ~$150–300/night line item) is an operator-ruling spend leg. This driver
// is the deterministic machinery around it:
//   • --dry-run (default): prints the leg plan — cohort enumeration, the manifest shape
//     `gateFixtures` consumes, and the gate invocation. Touches nothing.
//   • --execute --scores <file>: REFUSES unless GOLDEN_BUDGET_RULING=approved is in the env (the
//     ⚑ Q-register ruling recorded in docs/build/LEDGER.md GATE DECISIONS). With the ruling it
//     consumes the measured per-fixture scores the live dispatch produced, writes
//     evals/fixtures/nightly-manifest.json, and invokes the gate. It NEVER fabricates scores —
//     no --scores file, no manifest.
//
// Score file shape (the dispatch's output, checked structurally before it is trusted):
//   { "fixtures": [{ "fixtureId": "…", "floors": {…}, "scores": {…} }, …] }
// `floors` are the pinned per-fixture minima the run measured against; `scores` the observed
// values. The gate (`nightly-golden.mjs` → @rhema/benchmark assertScoreFloors) is authoritative.
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MANIFEST_PATH = resolve(root, "evals/fixtures/nightly-manifest.json");
const BUDGET_NOTE = "~$150–300/night — operator ruling required (⚑ Q-register)";

const args = process.argv.slice(2);
const dryRun = !args.includes("--execute");
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const SCORES_FILE = flag("--scores");

function legPlan() {
  return {
    req: "REQ-OPS-7",
    budget: BUDGET_NOTE,
    legs: [
      "enumerate the golden cohort (all workflows on the default tier × the three fixture projects)",
      "dispatch each fixture leg on the live engine (the deferred paid half — H0/ops + ruling)",
      "collect per-fixture scores → --scores file",
      `write ${MANIFEST_PATH}`,
      "node scripts/nightly-golden.mjs → gateFixtures → PROMOTION BLOCKED / Promotion OK",
    ],
    honest_marker:
      "nightly-golden.mjs exit 0 on an absent manifest is NON-EVIDENCE — no live golden run occurred",
  };
}

if (dryRun) {
  console.log(JSON.stringify({ dry_run: true, plan: legPlan() }, null, 1));
  process.exit(0);
}

// ---- fail-closed budget gate: the driver never runs paid legs without the recorded ruling ----
if (process.env.GOLDEN_BUDGET_RULING !== "approved") {
  console.error(
    `refusing: --execute requires GOLDEN_BUDGET_RULING=approved (${BUDGET_NOTE}); the ruling is ` +
      `recorded in docs/build/LEDGER.md GATE DECISIONS — absent it, no golden spend`,
  );
  process.exit(3);
}
if (!SCORES_FILE) {
  console.error(
    "refusing: --execute requires --scores <file> — the measured per-fixture scores from the live " +
      "dispatch. A manifest without measured scores is fabrication; none is written.",
  );
  process.exit(3);
}

const scores = JSON.parse(readFileSync(resolve(process.cwd(), SCORES_FILE), "utf8"));
if (!Array.isArray(scores.fixtures) || scores.fixtures.length === 0) {
  console.error("refusing: --scores file must carry a non-empty fixtures[] — never write an empty manifest");
  process.exit(2);
}
for (const f of scores.fixtures) {
  if (!f.fixtureId || typeof f.scores !== "object" || typeof f.floors !== "object") {
    console.error(`refusing: malformed fixture entry (needs fixtureId + floors + scores): ${JSON.stringify(f)}`);
    process.exit(2);
  }
}

const manifest = {
  generated_at: new Date().toISOString(),
  budget_ruling: "approved (GOLDEN_BUDGET_RULING)",
  fixtures: scores.fixtures,
};
mkdirSync(dirname(MANIFEST_PATH), { recursive: true });
writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
console.log(`nightly-golden-driver: wrote ${MANIFEST_PATH} (${manifest.fixtures.length} fixture(s)); invoking the gate`);

const { gateFixtures, formatReport } = await import("../nightly-golden.mjs");
const gate = gateFixtures(manifest);
console.log(formatReport(gate));
process.exit(gate.blocked ? 1 : 0);
