#!/usr/bin/env node
// CITE.1 — thin runner for the $0 citation-completeness baseline scan
// (integration/src/citation-scan-live.ts). Usage:
//   DATABASE_URL=postgres://… OBJECTS_BUCKET=rhema-prod-artifacts node scripts/live/cite1-citation-scan.mjs
// READ-ONLY: scores every delivered Review/fact_check's pre-strip claim ledger against its fetch_log,
// classifying misses normalization-only / search-result-only / truly-unretrieved, for the run-ledger
// baseline recorded in docs/build/runs/CITE.1.md.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const tsx = resolve(repoRoot, "node_modules/.bin/tsx");
const target = resolve(repoRoot, "integration/src/citation-scan-live.ts");
const child = spawn(tsx, [target], { stdio: "inherit", env: process.env });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
child.on("error", (err) => { console.error("[cite-scan] failed to spawn tsx:", err); process.exit(1); });
