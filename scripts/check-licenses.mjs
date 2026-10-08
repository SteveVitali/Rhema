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
import { evaluateAll, missingRequired } from "./lib/license-policy.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/**
 * REQ-SAFE-9 non-vacuity (SPA.8): packages the enumeration MUST cover. These are the SPA/client
 * dependency set landed by the round-4 migration — if `pnpm licenses list` silently dropped to a
 * prod/dev-only subset or an empty graph the licence gate would be green over nothing (the same
 * vacuity class the A4 audit found in the marker gate). Fail loudly instead.
 */
const REQUIRED_PACKAGES = [
  "react",
  "react-dom",
  "@tanstack/react-router",
  "@tanstack/react-query",
  "vite",
  "@vitejs/plugin-react",
  "axe-core",
];
/** A real whole-graph enumeration is hundreds of packages; a truncated one is not a green gate. */
const MIN_ENUMERATED = 100;

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

  const missing = missingRequired(packages, REQUIRED_PACKAGES);
  if (packages.length < MIN_ENUMERATED) {
    console.error(
      `Licence enumeration looks truncated (${packages.length} < ${MIN_ENUMERATED} package(s)) — refusing to pass a vacuous gate.`,
    );
    process.exit(2);
  }
  if (missing.length) {
    console.error(
      `Licence enumeration does not cover the SPA dependency set — missing: ${missing.join(", ")}. The gate would be vacuous; fix enumeration, do not allowlist.`,
    );
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
