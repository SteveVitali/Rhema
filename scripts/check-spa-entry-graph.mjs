#!/usr/bin/env node
/**
 * REQ-KIT-5 (225_R7KIT.2; ADR-129) — the SPA entry-graph guard.
 *
 * Dialog / Select / Popover / ContextMenu-class primitives must load in LEAF chunks, never through
 * the shell's entry graph. The guard keys on the `@radix-ui/react-*` package paths recorded in each
 * entry chunk's sourcemap `sources` — so it already covers 225a_R7KIT.2b's wrappers too (any
 * `@radix-ui/react-<primitive>` that is not on the shell's allowance list fails). The shell's
 * allowance list is EXACTLY Tooltip and DropdownMenu.
 *
 * Mechanism: `vite build` emits one `.js.map` per chunk (REQ-TL-6 provenance artifacts — never
 * byte-measured, always present in `public/spa`). For every manifest file in the transitive static
 * entry graph (same traversal as check-spa-budget) the guard reads `<file>.map`, extracts every
 * `sources[]` entry matching `@radix-ui/react-<name>` (pnpm `.pnpm/@radix-ui+react-<name>@…` and
 * bare `node_modules/@radix-ui/react-<name>/` both resolve to that inner path), and fails unless
 * `<name>` is in ALLOWED_IN_ENTRY. A missing map for an entry-graph chunk fails closed — a graph
 * whose provenance can't be read can't be proven clean.
 *
 * Usage: `pnpm check:spa-entry-graph` · `node scripts/check-spa-entry-graph.mjs [--out <dir>]`
 */
import { existsSync, readFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { entryGraphFiles } from "./check-spa-budget.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT_DIR = "apps/web/public/spa";

/** The shell's allowance list — EXACTLY these two primitives (spec §4.6 REQ-KIT-5; 226's AppShell contract). */
export const ALLOWED_IN_ENTRY = new Set(["react-tooltip", "react-dropdown-menu"]);

/**
 * The primitive packages denied in the entry graph: every spec-named Radix primitive minus the
 * allowance — `dialog, select, popover, context-menu` per REQ-KIT-5 plus `tabs, checkbox,
 * radio-group, switch` so 225a's wrappers are covered already (their deps land here, the wrappers
 * land in 225a). Shared internals (`react-popper`, `react-menu`, `react-dismissable-layer`, …) are
 * deliberately NOT denied: the map proves only presence, and the allowed parents legitimately pull
 * them into the entry — a stray internal still implies a denied/allowed parent elsewhere.
 */
export const DENIED_IN_ENTRY = new Set([
  "react-dialog",
  "react-select",
  "react-popover",
  "react-context-menu",
  "react-tabs",
  "react-checkbox",
  "react-radio-group",
  "react-switch",
]);

/** Extract the `@radix-ui/react-<name>` package a source path belongs to, or null. */
export function radixPackageOf(source) {
  const m = /@radix-ui\/(react-[a-z0-9-]+)\//i.exec(source);
  return m ? m[1].toLowerCase() : null;
}

/** All `@radix-ui/react-<name>` packages appearing in a map's `sources[]`. */
export function radixPackagesInMap(map) {
  const found = new Set();
  for (const src of Array.isArray(map?.sources) ? map.sources : []) {
    const pkg = radixPackageOf(String(src));
    if (pkg != null) found.add(pkg);
  }
  return found;
}

/**
 * Evaluate the entry graph of a parsed manifest against the allowance list.
 * `readMap(file)` returns the parsed sourcemap for an emitted entry-graph file (or null).
 * Returns { ok, violations, report, disallowed }.
 */
export function evaluateEntryGraph(manifest, readMap) {
  const violations = [];
  const report = [];
  const disallowed = new Map();
  const { entryFiles, error } = entryGraphFiles(manifest);
  if (error) violations.push(error);

  const scanned = [];
  for (const file of entryFiles) {
    const map = readMap(file);
    if (map == null) {
      violations.push(
        `entry-graph chunk ${file} has no readable sourcemap — provenance gate fails closed (REQ-TL-6)`,
      );
      continue;
    }
    scanned.push(file);
    for (const pkg of radixPackagesInMap(map)) {
      if (DENIED_IN_ENTRY.has(pkg)) {
        if (!disallowed.has(pkg)) disallowed.set(pkg, []);
        disallowed.get(pkg).push(file);
      }
    }
  }
  for (const [pkg, files] of [...disallowed.entries()].sort()) {
    violations.push(
      `@radix-ui/${pkg} reaches the SPA entry graph via ${files.join(", ")} — leaf-chunk it (the shell may carry exactly Tooltip and DropdownMenu; REQ-KIT-5)`,
    );
  }
  report.push(`  entry-graph chunks scanned: ${scanned.length}`);
  report.push(
    disallowed.size === 0
      ? `  denied Radix primitives in entry: none (shell allowance: ${[...ALLOWED_IN_ENTRY].join(", ")})`
      : `  denied Radix primitives in entry: ${[...disallowed.keys()].join(", ")}`,
  );
  return { ok: violations.length === 0, violations, report, disallowed };
}

/** Read the manifest under outDirAbs and evaluate. Exported for tests. */
export function checkSpaEntryGraph(outDirAbs) {
  const manifestPath = join(outDirAbs, ".vite", "manifest.json");
  if (!existsSync(outDirAbs) || !existsSync(manifestPath)) {
    return {
      ok: false,
      violations: [
        `SPA output missing — ${manifestPath} not found (run \`pnpm --filter @rhema/web build:spa\` first; the gate is fail-closed)`,
      ],
      report: [],
      disallowed: new Map(),
    };
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const readMap = (file) => {
    const p = join(outDirAbs, `${file}.map`);
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, "utf8"));
    } catch {
      return null;
    }
  };
  return evaluateEntryGraph(manifest, readMap);
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (flag, dflt) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : dflt;
  };
  const outDir = resolve(root, opt("--out", DEFAULT_OUT_DIR));
  const { ok, violations, report } = checkSpaEntryGraph(outDir);
  console.log(`SPA entry-graph guard (REQ-KIT-5) — ${outDir}:`);
  for (const line of report) console.log(line);
  if (!ok) {
    console.error(`SPA entry-graph guard FAILED — ${violations.length} violation(s):`);
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log("SPA entry-graph guard OK — only Tooltip/DropdownMenu may reach the entry.");
}
