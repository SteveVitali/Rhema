#!/usr/bin/env node
// R6MNY.1 — thin runner for the prod read-only money-flip readiness reads
// (integration/src/money-flip-readiness.ts): cap_calibration_reports preconditions 1–2,
// the measured what-it-covers recompute, and the cost_card_cells cross-check.
// Usage:
//   DATABASE_URL=postgres://…@127.0.0.1:15433/rhema node scripts/live/money-flip-readiness.mjs
// The DSN must be the system role (never the app login — RLS reads the money tables empty).
// Nothing here writes; the notice send + every flip stay operator-owned (docs/ops/launch-flips.md).
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const tsx = resolve(repoRoot, "node_modules/.bin/tsx");
const target = resolve(repoRoot, "integration/src/money-flip-readiness.ts");
const child = spawn(tsx, [target, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
child.on("error", (err) => {
  console.error("[money-flip-readiness] failed to spawn tsx:", err);
  process.exit(1);
});
