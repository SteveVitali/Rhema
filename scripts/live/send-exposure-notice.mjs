#!/usr/bin/env node
// R6CNT.2 — thin runner for the H11-approved RLS-exposure notice (integration/src/exposure-notice.ts;
// GD-EXPOSURE-NOTICE.R6 "Approve as drafted"). Usage:
//   DATABASE_URL=postgres://… node scripts/live/send-exposure-notice.mjs          # dry-run (default): prints recipients + template, writes nothing
//   DATABASE_URL=… RESEND_API_KEY=… EMAIL_FROM="Rhema <security@rhema.tools>" node scripts/live/send-exposure-notice.mjs --send
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const tsx = resolve(repoRoot, "node_modules/.bin/tsx");
const target = resolve(repoRoot, "integration/src/exposure-notice.ts");
const child = spawn(tsx, [target, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
child.on("error", (err) => {
  console.error("[exposure-notice] failed to spawn tsx:", err);
  process.exit(1);
});
