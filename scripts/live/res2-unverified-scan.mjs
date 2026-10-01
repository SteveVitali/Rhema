#!/usr/bin/env node
// RES.2 — thin runner for the historical zero-coverage scan (integration/src/unverified-scan-live.ts).
// Usage:
//   DATABASE_URL=postgres://… node scripts/live/res2-unverified-scan.mjs
// READ-ONLY: lists prior delivered Reviews/fact_checks matching the Unverified predicate + their
// would-be refund totals for the operator decision recorded in docs/build/runs/RES.2.md.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const tsx = resolve(repoRoot, "node_modules/.bin/tsx");
const target = resolve(repoRoot, "integration/src/unverified-scan-live.ts");
const child = spawn(tsx, [target], { stdio: "inherit", env: process.env });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
child.on("error", (err) => { console.error("[res2-scan] failed to spawn tsx:", err); process.exit(1); });
