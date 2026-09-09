#!/usr/bin/env node
/**
 * Compute (and optionally freeze) the content-addressed `protocols_version` over the trio — the ported
 * skills, the phase manifests, and the parsers/serializers (REQ-SPEC-22; ticket P0.04 AC5). The digest
 * changes iff any trio file changes, so protocol drift can never ship silently and CI's deploy-provenance
 * record (REQ-ARCH-39) and every run stamp the exact skill+manifest+parser text they ran on.
 *
 * Usage:
 *   node scripts/compute-protocols-version.mjs          # print the current computed version
 *   node scripts/compute-protocols-version.mjs --write   # freeze it into src/version.ts PROTOCOLS_VERSION
 *
 * Env: RHEMA_PROTOCOLS_PATH (the private checkout; default packages/protocols under the repo root). When
 * unset and the default is absent (a public clone) it is a no-op success — there is nothing private to
 * hash.
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const WRITE = process.argv.includes("--write");
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pkgRoot = process.env.RHEMA_PROTOCOLS_PATH
  ? resolve(process.env.RHEMA_PROTOCOLS_PATH)
  : resolve(repoRoot, "packages/protocols");

if (!existsSync(pkgRoot) || !existsSync(resolve(pkgRoot, "manifests"))) {
  console.log("compute-protocols-version: no private @rhema/protocols checkout — nothing to hash (no-op).");
  process.exit(0);
}

const distFiles = resolve(pkgRoot, "dist/src/version-files.js");
const distVersion = resolve(pkgRoot, "dist/src/version.js");
if (!existsSync(distFiles) || !existsSync(distVersion)) {
  console.error("compute-protocols-version: build @rhema/protocols first (`pnpm -C packages/protocols run build`).");
  process.exit(1);
}
const { collectTrioFiles } = await import(pathToFileURL(distFiles).href);
const { PROTOCOLS_VERSION } = await import(pathToFileURL(distVersion).href);
// The pure hash lives in the public lib; the private package's copy is kept in lockstep by its self-check.
const { computeProtocolsVersion } = await import(pathToFileURL(resolve(repoRoot, "scripts/lib/protocols-version.mjs")).href);

const files = collectTrioFiles(pkgRoot);
const version = computeProtocolsVersion(files);
console.log(`protocols_version = ${version}  (${Object.keys(files).length} trio files)`);

if (WRITE) {
  const versionTs = resolve(pkgRoot, "src/version.ts");
  const src = readFileSync(versionTs, "utf8");
  const next = src.replace(
    /export const PROTOCOLS_VERSION = "[^"]*" as const;/,
    `export const PROTOCOLS_VERSION = "${version}" as const;`,
  );
  if (next === src && !src.includes(`"${version}"`)) {
    console.error("compute-protocols-version: could not find the PROTOCOLS_VERSION line to rewrite.");
    process.exit(1);
  }
  writeFileSync(versionTs, next);
  console.log(`Froze PROTOCOLS_VERSION = ${version} into ${versionTs}`);
} else if (PROTOCOLS_VERSION !== version) {
  console.error(
    `\nDRIFT: frozen PROTOCOLS_VERSION (${PROTOCOLS_VERSION}) != computed (${version}).\n` +
      "Run `node scripts/compute-protocols-version.mjs --write` to re-freeze after a trio change.",
  );
  process.exit(1);
}
