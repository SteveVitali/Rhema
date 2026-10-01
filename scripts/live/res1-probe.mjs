#!/usr/bin/env node
// RES.1 — thin runner for the ≤$1 planted-error research probe (integration/src/research-probe.ts).
// Usage:
//   API_BASE_URL=https://api.<stage>.rhema… DATABASE_URL=postgres://… \
//   PROBE_USER_ID=… PROBE_WORKSPACE_ID=… PROBE_BILLING_ACCOUNT_ID=… PROBE_PROJECT_ID=… \
//   node scripts/live/res1-probe.mjs
// The project must already hold the planted-error excerpt draft (packages/journeys/fixtures/
// planted-error-excerpt.md). The driver launches a bounded `fact_check` run, polls to terminal via
// the DB seam, then evaluates the proxy's own evidence (usage_records / fetch_log / claims).
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const tsx = resolve(repoRoot, "node_modules/.bin/tsx");
const target = resolve(repoRoot, "integration/src/research-probe-live.ts");
const child = spawn(tsx, [target], { stdio: "inherit", env: process.env });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
child.on("error", (err) => { console.error("[res1-probe] failed to spawn tsx:", err); process.exit(1); });
