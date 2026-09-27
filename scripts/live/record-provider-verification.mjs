#!/usr/bin/env node
// Thin runner for the LIVE provider-verification write (D-P0.13-2 — PRB.15 Stage B, operator-gated).
// Usage:
//
//   DATABASE_URL=postgres://… PROVIDER=anthropic \
//   TERMS_REF="https://www.anthropic.com/legal/commercial-terms — attested <YYYY-MM-DD> by <name>" \
//   VERIFIED_AT="<ISO timestamp the human verified the terms>" \
//     node scripts/live/record-provider-verification.mjs
//
// Records the operator's WRITTEN attestation into `benchmark_provider_verifications` on prod, then
// asserts `providerTransmissible("anthropic", now)` — the REQ-EVAL-3 gate ("nothing is transmitted
// until the terms are verified in writing") must hold before any corpus draft reaches a provider.
// The terms reference comes from the human's HUMAN-H6 act; this script never fabricates it.
// The real logic lives in integration/src/record-provider-verification.ts; @rhema/benchmark + pg are
// pnpm-isolated to the integration package, so this runner spawns tsx on that entry.

import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const tsx = resolve(repoRoot, "node_modules/.bin/tsx");
const target = resolve(repoRoot, "integration/src/record-provider-verification.ts");

const child = spawn(tsx, [target], { stdio: "inherit", env: process.env });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
child.on("error", (err) => {
  console.error("[record-provider-verification] failed to spawn tsx:", err);
  process.exit(1);
});
