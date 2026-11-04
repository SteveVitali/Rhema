#!/usr/bin/env node
/**
 * REQ-CORPUS-2 — the denylist gate, self-contained (node builtins only, no workspace deps) so
 * `pnpm check:demo-corpus` can run on EVERY head in CI's public-safe job, including fast-path heads
 * with no `pnpm install`. Scans every corpus-derived output dir under packages/demo-corpus —
 * `corpus/`, `snapshots/`, `goldens/` (real, withheld) and the same names under fixture dirs —
 * skipping `_rules/**` policy data and honoring each root's `_rules/line-allowlist.json`
 * (file:line entries only; a stale entry fails). Patterns come from
 * `packages/demo-corpus/denylist-patterns.json`, shared with the exporter's TS gate;
 * `packages/demo-corpus/src/denylist.test.ts` pins parity.
 *
 * Usage: check-corpus.mjs [--dir <path> ...]   (default: the package's corpus-derived dirs)
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");
const PKG = join(ROOT, "packages/demo-corpus");
const SCAN_NAMES = new Set(["corpus", "snapshots", "goldens"]);

const dirs = [];
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === "--dir") dirs.push(resolve(process.argv[++i]));
}
if (dirs.length === 0) {
  // Discover scan roots: top-level withheld dirs plus fixture copies of the same layout.
  const candidates = [join(PKG, "corpus"), join(PKG, "snapshots"), join(PKG, "goldens")];
  const fixtures = join(PKG, "fixtures");
  if (statSync(fixtures, { throwIfNoEntry: false })?.isDirectory()) {
    for (const f of readdirSync(fixtures)) {
      for (const name of SCAN_NAMES) candidates.push(join(fixtures, f, name));
    }
  }
  for (const c of candidates)
    if (statSync(c, { throwIfNoEntry: false })?.isDirectory()) dirs.push(c);
}

const { patterns } = JSON.parse(readFileSync(join(PKG, "denylist-patterns.json"), "utf8"));
const compiled = patterns.map((p) => ({ id: p.id, re: new RegExp(p.re, p.flags ?? "") }));

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

let hits = 0;
let stale = 0;
for (const root of dirs) {
  let allow = [];
  try {
    allow =
      JSON.parse(readFileSync(join(root, "_rules/line-allowlist.json"), "utf8")).entries ?? [];
  } catch {
    /* no allowlist file */
  }
  const allowed = new Set(allow.map((a) => `${a.file}:${a.line}`));
  const hitLines = new Set();
  for (const abs of walk(root)) {
    const rel = relative(root, abs).split("\\").join("/");
    if (rel.startsWith("_rules/") || rel === "export-manifest.json") continue;
    const text = readFileSync(abs).toString("latin1");
    text.split("\n").forEach((line, i) => {
      for (const { id, re } of compiled) {
        if (re.test(line)) {
          hitLines.add(`${rel}:${i + 1}`);
          if (!allowed.has(`${rel}:${i + 1}`)) {
            hits++;
            console.error(`DENYLIST ${rel}:${i + 1} (${id})`);
          }
        }
      }
    });
  }
  for (const a of allow) {
    if (!hitLines.has(`${a.file}:${a.line}`)) {
      stale++;
      console.error(`STALE-ALLOWLIST ${a.id} ${a.file}:${a.line}`);
    }
  }
}

if (hits > 0 || stale > 0) {
  console.error(
    `check:demo-corpus FAILED — ${hits} denylist violation(s), ${stale} stale allowlist row(s)`,
  );
  process.exit(1);
}
console.log(`check:demo-corpus clean — ${dirs.length} corpus dir(s) scanned, 0 violations`);
