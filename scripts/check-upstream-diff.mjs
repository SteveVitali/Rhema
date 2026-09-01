#!/usr/bin/env node
/**
 * Upstream-diff gate (REQ-ARCH-5 amended; spec §12.2; ticket P0.03 AC1). The ported skills in
 * `packages/protocols/{skills,conventions}` must equal the pinned upstream + ONLY the sanctioned deltas:
 * the six harness inputs, the `.rhema/phase-result.json` output, the `sidecar: true` emission, the Q-11
 * edits (REQ-ARCH-8) and the persona-resolution edit.
 *
 * The pinned upstream is VENDORED (read-only) at `packages/protocols/upstream-pin/`, so this check is
 * self-contained — it runs in normal CI with no external repo and no env. It reconstructs each ported
 * file from `pin + the transforms` declared in the private manifest and compares byte-for-byte, so
 * undeclared drift fails (REQ-SPEC-22); every transform's `category` must be in SANCTIONED_CATEGORIES
 * (the sanctioned set is closed by construction).
 *
 * Usage:
 *   node scripts/check-upstream-diff.mjs           # verify (CI); exit 1 on drift
 *   node scripts/check-upstream-diff.mjs --write    # regenerate ported files from pin + manifest
 */
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { resolve, join, relative, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { applyOps, SANCTIONED_CATEGORIES } from "./lib/upstream-port.mjs";

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PORTED_ROOT = resolve(REPO, "packages/protocols");
const PIN_ROOT = resolve(PORTED_ROOT, "upstream-pin");
const WRITE = process.argv.includes("--write");
// Pin-local files that are not upstream content (they describe the pin itself).
const PIN_META = new Set(["COMMIT", "README.md"]);

function fail(msg) {
  console.error(`upstream-diff: FAIL — ${msg}`);
  process.exit(1);
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}
const relOf = (abs) => relative(PIN_ROOT, abs).split("\\").join("/");

async function main() {
  if (!existsSync(PIN_ROOT)) fail(`no vendored upstream pin at ${PIN_ROOT}`);
  const manifestPath = join(PORTED_ROOT, "skills/upstream-port.manifest.mjs");
  if (!existsSync(manifestPath)) fail(`no port manifest at ${manifestPath}`);
  const { upstreamCommit, files } = await import(pathToFileURL(manifestPath).href);

  // The pin's COMMIT marker must match the manifest's declared commit — otherwise the baseline is stale.
  const pinCommit = readFileSync(join(PIN_ROOT, "COMMIT"), "utf8").trim();
  if (pinCommit !== upstreamCommit)
    fail(`pin COMMIT ${pinCommit} != manifest upstreamCommit ${upstreamCommit}`);

  // 1) Every declared op must be sanctioned.
  for (const [rel, ops] of Object.entries(files))
    for (const op of ops)
      if (!SANCTIONED_CATEGORIES.includes(op.category))
        fail(`${rel}: op category "${op.category}" is not sanctioned`);

  // 2) Every pinned upstream file must be reproduced in the port (verbatim or via its transforms).
  const problems = [];
  const pinRels = new Set();
  let checked = 0;
  for (const abs of walk(PIN_ROOT)) {
    const rel = relOf(abs);
    if (PIN_META.has(rel)) continue;
    pinRels.add(rel);
    const upstreamText = readFileSync(abs, "utf8");
    const expected = files[rel] ? applyOps(upstreamText, files[rel]) : upstreamText;
    const portPath = join(PORTED_ROOT, rel);
    if (WRITE) {
      writeFileSync(portPath, expected);
      checked++;
      continue;
    }
    if (!existsSync(portPath)) {
      problems.push(`${rel}: missing from packages/protocols`);
      continue;
    }
    if (readFileSync(portPath, "utf8") !== expected) {
      problems.push(`${rel}: undeclared drift vs pin + sanctioned edits (REQ-SPEC-22)`);
    }
    checked++;
  }

  // 3) A manifest entry for a file the pin does not have is a mistake.
  for (const rel of Object.keys(files))
    if (!pinRels.has(rel)) problems.push(`manifest names ${rel}, absent from the pin`);

  if (problems.length) fail(`\n  - ${problems.join("\n  - ")}`);
  const cats = [
    ...new Set(
      Object.values(files)
        .flat()
        .map((o) => o.category),
    ),
  ]
    .sort()
    .join(", ");
  console.log(
    `${WRITE ? "upstream-diff: wrote" : "upstream-diff: OK —"} ${checked} ported file(s) reconcile with the vendored pin (${upstreamCommit.slice(0, 8)}) + only sanctioned edits (${cats}).`,
  );
}

main().catch((e) => fail(e.stack || String(e)));
