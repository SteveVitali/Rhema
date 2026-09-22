#!/usr/bin/env node
// Thin runner for the LIVE migrate + seed (P0.15c Stage B). Usage:
//
//   DATABASE_URL=postgres://… node scripts/live/migrate-seed.mjs
//
// The real logic lives in integration/src/live-migrate-seed.ts (`runMigrateSeed` + `main`). `@rhema/db`
// (main → dist/index.js) and `pg` are pnpm-isolated to the integration package, so a plain repo-root `.mjs`
// cannot import them; this runner spawns tsx on that TypeScript entry, where the workspace deps resolve.
// It forwards the environment (DATABASE_URL), streams the child's output, and mirrors its exit code.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const tsx = resolve(repoRoot, "node_modules/.bin/tsx");
const target = resolve(repoRoot, "integration/src/live-migrate-seed.ts");

const child = spawn(tsx, [target], { stdio: "inherit", env: process.env });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
child.on("error", (err) => {
  console.error("[migrate-seed] failed to spawn tsx:", err);
  process.exit(1);
});
