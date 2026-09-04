#!/usr/bin/env node
// Thin runner for the LIVE fixture prep (P0.15f Stage B): fund bill_seed + draft-content fixup. Usage:
//   DATABASE_URL=postgres://… OBJECTS_BUCKET=rhema-dev-artifacts node scripts/live/prepare-fixture.mjs
// Spawns tsx on integration/src/live-prepare-fixture.ts (where @rhema/mirror + pg resolve), like migrate-seed.mjs.
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const tsx = resolve(repoRoot, "node_modules/.bin/tsx");
const target = resolve(repoRoot, "integration/src/live-prepare-fixture.ts");
const child = spawn(tsx, [target], { stdio: "inherit", env: process.env });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
child.on("error", (err) => { console.error("[prepare-fixture] failed to spawn tsx:", err); process.exit(1); });
