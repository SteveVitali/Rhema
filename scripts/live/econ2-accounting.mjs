#!/usr/bin/env node
// ECON.2 — thin runner for the $0 offline accounting pass (integration/src/econ2-accounting.ts).
// Mandatory BEFORE any paid Stage-B leg (ADR-087 §measurement protocol): computes the modeled
// savings ceiling per lever arm on the committed 6,000-word fixture at Standard/Base — no
// provider calls, no DB, no network. Usage:
//   node scripts/live/econ2-accounting.mjs
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const tsx = resolve(repoRoot, "node_modules/.bin/tsx");
const target = resolve(repoRoot, "integration/src/econ2-accounting.ts");
const child = spawn(tsx, [target], { stdio: "inherit", env: process.env });
child.on("exit", (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
child.on("error", (err) => { console.error("[econ2-accounting] failed to spawn tsx:", err); process.exit(1); });
