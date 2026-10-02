#!/usr/bin/env node
// ECON.1 — thin runner for the paid-account metered-flip notice (integration/src/metered-notice.ts).
// Usage:
//   DATABASE_URL=postgres://… EFFECTIVE_DATE=2026-11-02 node scripts/live/send-metered-notice.mjs          # dry-run (default): prints recipients + template, writes nothing
//   DATABASE_URL=… EFFECTIVE_DATE=… RESEND_API_KEY=… EMAIL_FROM=… node scripts/live/send-metered-notice.mjs --send
// The flip itself is a separate operator step — see docs/ops/debit-mode-flip.md.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const tsx = resolve(repoRoot, "node_modules/.bin/tsx");
const target = resolve(repoRoot, "integration/src/metered-notice.ts");
const child = spawn(tsx, [target, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
child.on("error", (err) => {
  console.error("[metered-notice] failed to spawn tsx:", err);
  process.exit(1);
});
