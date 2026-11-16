#!/usr/bin/env node
/**
 * CI `public-safe` merge-conflict-marker gate (RH-1; 271_R6SEC.3). A `git stash pop` conflict was
 * committed to `infra/pulumi/Pulumi.dev.yaml` at 40c3980a (2026-11-15) — `pulumi config --stack dev`
 * could not parse the file until the markers were removed. This gate scans every TRACKED
 * `*.yaml`/`*.yml`/`*.ts`/`*.tsx`/`*.md` file for an unresolved Git conflict marker so the class
 * can never land again:
 *
 *   - `^<<<<<<<`   — the "ours"/"Updated upstream" boundary
 *   - `^=======`   — the mid-conflict separator (7+ `=` at line start)
 *   - `^>>>>>>>`   — the "theirs"/"Stashed changes" boundary
 *   - `^|||||||`   — the diff3-style base boundary (same class)
 *
 * The scan runs over `git ls-files` (tracked files only — node_modules, dist, and scratch are
 * invisible by construction). Files that legitimately quote marker text — fixtures teaching the
 * syntax, or docs reproducing a conflict for evidence — opt out per file with a line matching
 * `conflict-marker-check: allow` ANYWHERE in the file (a doc that quotes the markers for the
 * record carries the opt-out comment beside them).
 *
 * Exits non-zero on any hit. The script itself is a `.mjs` so its own pattern literals are never
 * scanned; the `.test.mjs` fixtures are strings, not files.
 */
import { readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Tracked extensions the gate scans (the RH-1 set: stack YAML + TS + Markdown). */
const EXT = /\.(yaml|yml|ts|tsx|md)$/;

/**
 * The unresolved-marker pattern. `<<<<<<<`/`>>>>>>>`/`|||||||` carry labels, so 7+ chars at
 * column 0 is the marker; git's `=======` separator is always a bare line, so `=` requires one
 * (keeps prose like `======= Results` from tripping the gate).
 */
export const MARKER = /^(<{7}|>{7}|\|{7})|^={7}\s*$/;

/** A file carrying this literal line is skipped entirely (fixture/evidence opt-out). */
export const ALLOW = /conflict-marker-check:\s*allow/;

/** Scan one file's text; returns the marker lines on it (exported for tests). */
export function scanText(text) {
  if (ALLOW.test(text)) return [];
  const hits = [];
  text.split("\n").forEach((line, i) => {
    if (MARKER.test(line)) hits.push({ line: i + 1, text: line.trim().slice(0, 80) });
  });
  return hits;
}

/** Every tracked file under the scanned extensions (injected for tests). */
export function trackedFiles(cwd = root) {
  const out = execFileSync("git", ["ls-files"], { cwd, encoding: "utf8" });
  return out.split("\n").filter((f) => f !== "" && EXT.test(f));
}

function main() {
  const violations = [];
  let scanned = 0;
  for (const rel of trackedFiles()) {
    scanned++;
    for (const hit of scanText(readFileSync(resolve(root, rel), "utf8"))) {
      violations.push({ file: rel, ...hit });
    }
  }

  if (violations.length > 0) {
    console.error(`Conflict-marker gate FAILED (RH-1) — ${violations.length} unresolved marker line(s):`);
    for (const v of violations) console.error(`  - ${v.file}:${v.line} ${v.text}`);
    process.exit(1);
  }
  console.log(`Conflict-marker gate OK (RH-1) — ${scanned} tracked yaml/ts/md file(s) scanned, no unresolved markers.`);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
