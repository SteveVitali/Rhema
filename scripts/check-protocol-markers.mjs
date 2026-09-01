#!/usr/bin/env node
/**
 * CI `public-safe` protocol-marker gate (spec §13.2; REQ-ARCH-33). Scans public-facing build
 * outputs — client bundles and the generated OpenAPI document — for protocol-IP sentinels. Exits
 * non-zero on any hit. Directories that do not exist yet (no build produced) are skipped: this is
 * the placeholder scan P0.01 ships, wired into the pipeline for later tickets to strengthen.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { findMarkers } from "./lib/protocol-markers.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

// Public-facing targets: web/mobile client bundles and any emitted OpenAPI spec.
const TARGET_DIRS = [
  "apps/web/dist",
  "apps/web/build",
  "apps/mobile/dist",
  "packages/api-client/dist",
];
const TEXT_EXT = new Set([".js", ".mjs", ".cjs", ".json", ".html", ".css", ".map", ".txt", ".yaml", ".yml"]);

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function main() {
  const violations = [];
  let scanned = 0;
  for (const rel of TARGET_DIRS) {
    const abs = resolve(root, rel);
    if (!existsSync(abs)) continue;
    for (const file of walk(abs)) {
      const ext = file.slice(file.lastIndexOf("."));
      if (!TEXT_EXT.has(ext)) continue;
      scanned++;
      const hits = findMarkers(readFileSync(file, "utf8"));
      if (hits.length > 0) violations.push({ file, hits });
    }
  }

  if (violations.length > 0) {
    console.error(`Protocol-marker gate FAILED — leaked markers in ${violations.length} file(s):`);
    for (const v of violations) console.error(`  - ${v.file}: ${v.hits.join(", ")}`);
    process.exit(1);
  }
  console.log(`Protocol-marker gate OK — ${scanned} public-facing file(s) scanned, no markers.`);
}

main();
