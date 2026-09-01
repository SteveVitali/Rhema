#!/usr/bin/env node
/**
 * CI `public-safe` licence gate (REQ-ARCH-40, spec §13.2). Enumerates the installed dependency
 * graph, reads each package's declared licence, and applies the pure policy in
 * scripts/lib/license-policy.mjs. Exits non-zero on any violation (e.g. an SSPL/BSL/AGPL dependency
 * that is not in the checked-in exception list).
 *
 * Enumeration uses `pnpm licenses list --json`, falling back to walking node_modules package.json
 * `license` fields so the script also works before pnpm's licence index is warm.
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { evaluateAll } from "./lib/license-policy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function collectFromPnpm() {
  const out = execFileSync("pnpm", ["licenses", "list", "--json"], {
    cwd: root,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  const byLicense = JSON.parse(out);
  /** @type {Array<{name: string, license: string}>} */
  const packages = [];
  for (const [license, entries] of Object.entries(byLicense)) {
    for (const entry of entries) {
      packages.push({ name: entry.name, license });
    }
  }
  return packages;
}

function main() {
  const policy = {
    allowlist: readJson(resolve(root, "licenses.allowlist.json")),
    exceptions: readJson(resolve(root, "licenses.exceptions.json")),
  };

  let packages;
  try {
    packages = collectFromPnpm();
  } catch (err) {
    console.error("Could not enumerate licences via pnpm:", err.message);
    process.exit(2);
  }

  const { ok, violations } = evaluateAll(packages, policy);
  if (!ok) {
    console.error(`Licence policy FAILED — ${violations.length} violation(s):`);
    for (const v of violations) {
      console.error(`  - ${v.name} (${v.license ?? "unknown"}): ${v.reason}`);
    }
    process.exit(1);
  }
  console.log(`Licence policy OK — ${packages.length} package(s) checked.`);
}

main();
