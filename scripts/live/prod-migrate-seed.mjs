#!/usr/bin/env node
// Thin runner for the LIVE PROD migrate + seed (PRB.15 Stage B — operator-gated). Usage:
//
//   DATABASE_URL=postgres://postgres:<pw>@<alloydb-ip>:5432/rhema \
//     node scripts/live/prod-migrate-seed.mjs
//
// Applies the forward-only migrations (`applyMigrations`) then the protocol seed (`seedProtocols` —
// the Essay protocol) against the PRODUCTION AlloyDB. Never runs `seedRealProjects` (dev sample data
// must not land on prod). The real logic lives in integration/src/live-prod-bringup.ts; `@rhema/db`,
// `@rhema/protocols`, and `pg` are pnpm-isolated to the integration package, so this runner spawns tsx
// on that TypeScript entry, where the workspace deps resolve. Requires `pnpm build` first.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const tsx = resolve(repoRoot, "node_modules/.bin/tsx");
const target = resolve(repoRoot, "integration/src/live-prod-bringup.ts");

const child = spawn(tsx, [target], { stdio: "inherit", env: process.env });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
child.on("error", (err) => {
  console.error("[prod-migrate-seed] failed to spawn tsx:", err);
  process.exit(1);
});
