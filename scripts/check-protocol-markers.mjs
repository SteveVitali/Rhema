#!/usr/bin/env node
/**
 * CI `public-safe` protocol-marker gate (spec §13.2; REQ-ARCH-33) — repaired by SPA.8
 * (REQ-SAFE-1/2, REQ-TL-14, REQ-FW-9; design/28 F1/F2). Scans public-facing build outputs —
 * client bundles and the generated OpenAPI document — for protocol-IP sentinels and for
 * sourcemap provenance leaks. Exits non-zero on any hit.
 *
 * Three layers, ordered by strength (spec §9):
 *   1. import-boundary lint — `no-restricted-imports` on `apps/web/src/spa` + `src/client`
 *      (eslint.config.js) bans `@rhema/protocols`/`@rhema/evals`/value imports of `@rhema/api-client`.
 *   2. bundle provenance scan — every emitted `.map`'s `sources[]` is checked here; a source path
 *      under a banned fragment (protocols/evals/server-only packages) is a deterministic leak.
 *   3. the marker substring scan below — armed by the planted sentinel constants in
 *      `packages/protocols/src/` (SENTINEL_* exports).
 *
 * Non-vacuity, both directions (the A4 audit found the old gate vacuous twice over — TARGET_DIRS
 * that never existed AND zero planted sentinels):
 *   - REQUIRED_DIRS fail closed when absent or empty — a dropped build step can never silently
 *     unscan the output again;
 *   - the sentinel armed-check fails if any marker is missing from `packages/protocols` sources —
 *     the tripwire proves it has live ammunition before scanning for leaks.
 *
 * Usage: `pnpm check:protocol-markers` · `node scripts/check-protocol-markers.mjs [--root <dir>]`
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { dirname } from "node:path";
import { findMarkers, findProvenanceLeaks, DEFAULT_MARKERS } from "./lib/protocol-markers.mjs";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

/** Public-facing targets: web/mobile client bundles and any emitted OpenAPI spec.
 *  `apps/web/public` covers BOTH the esbuild islands (REQ-TL-14 closes the pre-existing
 *  unscanned-artifact gap) and the Vite SPA output under `public/spa`. */
const TARGET_DIRS = [
  "apps/web/public",
  "apps/web/dist",
  "apps/web/build",
  "apps/mobile/dist",
  "packages/api-client/dist",
];

/** Targets that MUST exist and contain scannable files — the scan never silently skips these. */
const REQUIRED_DIRS = ["apps/web/public/spa", "packages/api-client/dist"];

/** The protocol-IP source roots the sentinels are planted in (the armed-check's scan set). */
const SENTINEL_SOURCE_DIRS = ["packages/protocols"];

/** Never armed/leak evidence: dependency installs, build output, caches, and the vendored pin
 *  (upstream-pin is the read-only baseline — sentinels live in `src/`, and a hit there would mask
 *  a source-side deletion). */
const SENTINEL_EXCLUDE_DIRS = new Set(["node_modules", "dist", ".turbo", "upstream-pin"]);

const TEXT_EXT = new Set([".js", ".mjs", ".cjs", ".json", ".html", ".css", ".map", ".txt", ".yaml", ".yml"]);

/** `apps/web/src/*` sources allowed inside the SPA bundle graph (shared leaf modules the client
 *  imports by design — COPY table, doc meta, the DOM-contract manifest, the boot wire shape, the
 *  SPA.11 gate-card composition shared SSR↔SPA, the SPA.12 approval-settings composition shared
 *  SSR↔SPA, the SPA.14 FilesPane label bag + the ONB.1 hold-store island/SPA shared).
 *  Anything else under apps/web/src (server.ts, data.ts, pages.tsx, render.tsx, client islands…)
 *  reaching a `public/spa` map is server/island code bundled for the browser — a violation. */
const SPA_WEB_SRC_ALLOW =
  /apps\/web\/src\/(spa\/|copy\.|doc-meta\.|dom-contract\.|spa-boot\.|gate-card\.|approval-settings\.|files-labels\.|client\/hold-store\.|state-map\.)/;

/** Extra provenance bans applied only inside the SPA bundle's maps (REQ-FW-9's emitted-graph leg):
 *  `@rhema/api-client` is `import type`-only in the client — any dist file in the map means a
 *  value import dragged the runtime surface into the bundle. */
const SPA_MAP_EXTRA_BANS = [
  { re: /packages\/api-client\//, label: "@rhema/api-client (REQ-FW-9 — import type only)" },
  { re: /@rhema[+/]api-client/, label: "@rhema/api-client (REQ-FW-9 — import type only)" },
];

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else yield p;
  }
}

function* walkExcluding(dir, excludeDirs) {
  for (const entry of readdirSync(dir)) {
    if (excludeDirs.has(entry)) continue;
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) yield* walkExcluding(p, excludeDirs);
    else yield p;
  }
}

/** The `sources[]` of one `.map` file — throws on unparseable JSON (fail-closed caller). */
function mapSources(text) {
  const parsed = JSON.parse(text);
  return Array.isArray(parsed?.sources) ? parsed.sources : [];
}

/**
 * The armed check: every marker must appear in the protocol-IP sources at least once.
 * @returns {string[]} violations (empty = armed)
 */
export function checkSentinelsArmed(rootDir, sourceDirs = SENTINEL_SOURCE_DIRS, markers = DEFAULT_MARKERS) {
  const corpus = [];
  let files = 0;
  for (const rel of sourceDirs) {
    const abs = resolve(rootDir, rel);
    if (!existsSync(abs)) return [`sentinel source dir missing: ${rel}`];
    for (const file of walkExcluding(abs, SENTINEL_EXCLUDE_DIRS)) {
      files++;
      corpus.push(readFileSync(file, "utf8"));
    }
  }
  if (files === 0) return [`sentinel source dirs empty: ${sourceDirs.join(", ")}`];
  const body = corpus.join("\n");
  return markers
    .filter((m) => !body.includes(m))
    .map((m) => `sentinel ${JSON.stringify(m)} absent from ${sourceDirs.join(", ")} — the marker tripwire is unarmed (planted constants live in packages/protocols/src/*; deleting them must fail this gate)`);
}

/**
 * Scan one emitted file: marker substring hits + (for `.map`s) provenance leaks.
 * @param {string} file absolute path
 * @param {string} rootDir repo root (for display paths + SPA-map scoping)
 * @returns {string[]} violations for this file
 */
export function scanEmittedFile(file, rootDir = root) {
  const ext = file.slice(file.lastIndexOf("."));
  const rel = file.startsWith(rootDir) ? file.slice(rootDir.length + 1) : file;
  const violations = [];
  const text = readFileSync(file, "utf8");
  const markerHits = findMarkers(text);
  if (markerHits.length > 0) violations.push(`${rel}: leaked sentinel(s) ${markerHits.join(", ")}`);
  if (ext === ".map") {
    let sources;
    try {
      sources = mapSources(text);
    } catch {
      violations.push(`${rel}: unparseable sourcemap (fail-closed)`);
      return violations;
    }
    // Bundlers emit sources relative to the map's location (Vite: `../../../src/spa/…`),
    // pnpm-store paths, or package-name forms — resolve each against the map dir so a source
    // ALWAYS reads as its repo-relative path before the ban/allow rules run.
    const mapDir = dirname(file);
    const isSpaMap = rel.split("\\").join("/").startsWith("apps/web/public/spa/");
    for (const src of sources) {
      if (typeof src !== "string") continue;
      const raw = src.split("\\").join("/");
      const clean = raw.split("?")[0]; // `…?tsr-split=component` virtual-marker suffixes
      const resolvedRel = relative(rootDir, resolve(mapDir, clean)).split("\\").join("/");
      for (const hit of findProvenanceLeaks([raw, resolvedRel])) violations.push(`${rel}: ${hit}`);
      if (isSpaMap) {
        if (resolvedRel.startsWith("apps/web/src/") && !SPA_WEB_SRC_ALLOW.test(resolvedRel)) {
          violations.push(
            `${rel}: non-client-safe web module in the SPA graph: ${resolvedRel} (sources allowed in the bundle: src/spa/** + the shared leaf modules copy/doc-meta/dom-contract/spa-boot/gate-card/approval-settings/files-labels/client/hold-store/state-map)`,
          );
        }
        for (const ban of SPA_MAP_EXTRA_BANS) {
          if (ban.re.test(resolvedRel) || ban.re.test(raw))
            violations.push(`${rel}: ${resolvedRel} [${ban.label}]`);
        }
      }
    }
  }
  return violations;
}

/**
 * The full gate. @returns {{ ok: boolean, violations: string[], scanned: number, armed: boolean }}
 */
export function checkProtocolMarkers(rootDir = root) {
  const violations = [];
  let scanned = 0;
  const requiredHits = new Map(REQUIRED_DIRS.map((d) => [d, 0]));

  const armedViolations = checkSentinelsArmed(rootDir);
  violations.push(...armedViolations);
  const armed = armedViolations.length === 0;

  for (const rel of TARGET_DIRS) {
    const abs = resolve(rootDir, rel);
    if (!existsSync(abs)) continue; // opportunistic target — only REQUIRED_DIRS fail closed
    for (const file of walk(abs)) {
      const ext = file.slice(file.lastIndexOf("."));
      if (!TEXT_EXT.has(ext)) continue;
      scanned++;
      const relPath = file.startsWith(rootDir) ? file.slice(rootDir.length + 1) : file;
      const relNorm = relPath.split("\\").join("/");
      for (const req of REQUIRED_DIRS) {
        if (relNorm === req || relNorm.startsWith(`${req}/`))
          requiredHits.set(req, (requiredHits.get(req) ?? 0) + 1);
      }
      violations.push(...scanEmittedFile(file, rootDir));
    }
  }

  for (const req of REQUIRED_DIRS) {
    if (!existsSync(resolve(rootDir, req))) {
      violations.push(`required scan target missing: ${req} (build the client output first — this gate is fail-closed)`);
    } else if ((requiredHits.get(req) ?? 0) === 0) {
      violations.push(`required scan target produced no scannable artifacts: ${req} (the gate is fail-closed)`);
    }
  }

  return { ok: violations.length === 0, violations, scanned, armed };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { ok, violations, scanned } = checkProtocolMarkers(root);
  if (!ok) {
    console.error(`Protocol-marker gate FAILED — ${violations.length} violation(s):`);
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log(
    `Protocol-marker gate OK — sentinels armed in packages/protocols, ${scanned} public-facing file(s) scanned, no markers, no provenance leaks.`,
  );
}
