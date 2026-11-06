#!/usr/bin/env node
/**
 * CI `public-safe` bundle-budget gate (SPA.1; REQ-SAFE-7, frontend-spa-spec §9 R25 ceilings).
 *
 * Reads `apps/web/public/spa/.vite/manifest.json` (emitted by `vite build` with
 * `build.manifest: true`), gzip-measures every emitted `.js`/`.css` artifact under
 * `apps/web/public/spa/`, and fails hard when a ceiling is breached. Ceilings live in the
 * checked-in `apps/web/spa-budget.json` (the spec's `bundle-budget.json`):
 *
 *   entry graph        ≤ 250 kB gz   (entry chunk + its transitive static `imports[]`)
 *   editor/collab lazy group ≤ 400 kB gz  (matched by the `editor` name patterns)
 *   CodeMirror chunk   ≤ 130 kB gz   (matched by the `codemirror` patterns)
 *   any other async chunk ≤ 150 kB gz (per file)
 *   total JS           ≤ 800 kB gz
 *   total CSS          ≤ 60 kB gz
 *
 * Runs AFTER the SPA build in `public-safe` (REQ-SAFE-9): a missing manifest or output dir
 * fails closed — the gate never passes on absent output. `.map` files are build-time
 * provenance artifacts (REQ-TL-6), never measured.
 *
 * Usage: `pnpm check:spa-budget` · `node scripts/check-spa-budget.mjs [--out <dir>] [--budget <file>]`
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT_DIR = "apps/web/public/spa";
const DEFAULT_BUDGET_FILE = "apps/web/spa-budget.json";
const DEFAULT_BASELINE_FILE = "apps/web/spa-budget-baseline.json";

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) yield* walk(p);
    else yield p;
  }
}

/**
 * Classify an emitted JS file into a budget group. The entry graph is computed separately from the
 * manifest; this classifies ASYNC chunks by name. `codemirror` is tested before `editor` so a chunk
 * named for both lands on the tighter ceiling.
 */
export function classifyAsyncChunk(name, budget) {
  const lower = name.toLowerCase();
  const groups = budget.groups ?? {};
  if ((groups.codemirror ?? []).some((pat) => lower.includes(pat))) return "codemirror";
  if ((groups.editor ?? []).some((pat) => lower.includes(pat))) return "editor";
  return "other";
}

/**
 * Compute the entry-graph file set: the entry record's `file` plus the transitive static
 * `imports[]` of every reachable manifest record (`dynamicImports` are async — never in the graph).
 * Returns { entryFiles: Set<string>, error?: string }.
 */
export function entryGraphFiles(manifest) {
  const records = Object.values(manifest ?? {});
  const entries = records.filter((r) => r && r.isEntry === true && typeof r.file === "string");
  if (entries.length === 0) {
    return { entryFiles: new Set(), error: "manifest has no isEntry record" };
  }
  const files = new Set();
  const seen = new Set();
  const visit = (key) => {
    if (seen.has(key)) return;
    seen.add(key);
    const rec = manifest[key];
    if (!rec || typeof rec.file !== "string") return;
    files.add(rec.file);
    for (const imp of rec.imports ?? []) visit(imp);
  };
  for (const key of Object.keys(manifest)) {
    if (manifest[key]?.isEntry === true) visit(key);
  }
  return { entryFiles: files };
}

/**
 * Evaluate artifacts against the budget.
 * @param manifest parsed .vite/manifest.json
 * @param artifacts Array<{ file: string, gzipBytes: number }> — `file` is the manifest-relative
 *   output name (e.g. "assets/main-abc.js"); maps excluded by the caller.
 * @param budget parsed spa-budget.json
 * @returns {{ ok: boolean, violations: string[], report: string[] }}
 */
export function evaluateSpaBudget(manifest, artifacts, budget) {
  const violations = [];
  const report = [];
  const c = budget.ceilings;
  const kb = (n) => `${(n / 1024).toFixed(1)} kB`;

  const { entryFiles, error } = entryGraphFiles(manifest);
  if (error) violations.push(error);

  // Manifest key → emitted file, for classification by source path as well as chunk name.
  const fileToKeys = new Map();
  for (const [key, rec] of Object.entries(manifest ?? {})) {
    if (rec && typeof rec.file === "string") {
      if (!fileToKeys.has(rec.file)) fileToKeys.set(rec.file, []);
      fileToKeys.get(rec.file).push(key);
    }
  }

  const js = artifacts.filter((a) => a.file.endsWith(".js"));
  const css = artifacts.filter((a) => a.file.endsWith(".css"));

  // Entry graph: sum of unique entry files.
  let entryGz = 0;
  const entryListed = [];
  for (const a of js) {
    if (entryFiles.has(a.file)) {
      entryGz += a.gzipBytes;
      entryListed.push(a);
    }
  }
  // An entry file missing from the measured set means the manifest lies — fail closed.
  const measured = new Set(js.map((a) => a.file));
  for (const f of entryFiles) {
    if (!measured.has(f)) violations.push(`entry-graph file missing from output: ${f}`);
  }

  // Async chunks: classify + check.
  let editorGz = 0;
  let codemirrorGz = 0;
  for (const a of js) {
    if (entryFiles.has(a.file)) continue;
    const keys = (fileToKeys.get(a.file) ?? []).join(" ");
    const group = classifyAsyncChunk(`${keys} ${a.file}`, budget);
    if (group === "codemirror") {
      codemirrorGz += a.gzipBytes;
    } else if (group === "editor") {
      editorGz += a.gzipBytes;
    } else if (a.gzipBytes > c.otherAsyncGzipBytes) {
      violations.push(`async chunk ${a.file} is ${kb(a.gzipBytes)} > ${kb(c.otherAsyncGzipBytes)} (other-async ceiling)`);
    }
    report.push(`  async ${a.file}: ${kb(a.gzipBytes)} [${group}]`);
  }

  let totalJs = 0;
  for (const a of js) totalJs += a.gzipBytes;
  let totalCss = 0;
  for (const a of css) totalCss += a.gzipBytes;

  if (entryGz > c.entryGzipBytes)
    violations.push(`entry graph ${kb(entryGz)} > ${kb(c.entryGzipBytes)}`);
  if (editorGz > c.editorLazyGzipBytes)
    violations.push(`editor/collab lazy group ${kb(editorGz)} > ${kb(c.editorLazyGzipBytes)}`);
  if (codemirrorGz > c.codemirrorGzipBytes)
    violations.push(`CodeMirror chunk(s) ${kb(codemirrorGz)} > ${kb(c.codemirrorGzipBytes)}`);
  if (totalJs > c.totalJsGzipBytes)
    violations.push(`total JS ${kb(totalJs)} > ${kb(c.totalJsGzipBytes)}`);
  if (totalCss > c.totalCssGzipBytes)
    violations.push(`total CSS ${kb(totalCss)} > ${kb(c.totalCssGzipBytes)}`);

  report.unshift(
    `  entry graph: ${kb(entryGz)} / ${kb(c.entryGzipBytes)}`,
    `  editor/collab group: ${kb(editorGz)} / ${kb(c.editorLazyGzipBytes)}`,
    `  codemirror group: ${kb(codemirrorGz)} / ${kb(c.codemirrorGzipBytes)}`,
    `  total JS: ${kb(totalJs)} / ${kb(c.totalJsGzipBytes)}`,
    `  total CSS: ${kb(totalCss)} / ${kb(c.totalCssGzipBytes)}`,
  );

  return {
    ok: violations.length === 0,
    violations,
    report,
    measured: { entryGz, editorGz, codemirrorGz, totalJs, totalCss },
  };
}

/**
 * REQ-KIT-5 (225_R7KIT.2) — the entry-delta report. Stream-U tickets declare a per-ticket
 * entry-graph allowance of ≤ 15 kB gz against the committed tip baseline
 * (`apps/web/spa-budget-baseline.json`, measured at `04a4e98b` before the ADR-129 stack landed)
 * and state the printed actual in their PR. The report is informational — the hard gate stays the
 * `entryGzipBytes` ceiling (no ceiling is raised without an operator ruling) — but an
 * over-allowance delta is flagged loudly so it cannot slide past review.
 *
 * @param measured the `measured` block evaluateSpaBudget returns
 * @param baseline parsed spa-budget-baseline.json
 * @returns {string[]} report lines
 */
export function spaDeltaReport(measured, baseline) {
  const kb = (n) => `${(n / 1024).toFixed(1)} kB`;
  const sign = (n) => `${n < 0 ? "−" : "+"}${kb(Math.abs(n))}`;
  const allowance = baseline.entryDeltaAllowanceGzipBytes ?? 15360;
  const entryDelta = measured.entryGz - baseline.entryGzipBytes;
  const lines = [
    `  entry delta vs baseline ${String(baseline.sha).slice(0, 8)} (${baseline.measuredAt}): ${sign(entryDelta)} of the ≤ ${kb(allowance)} per-ticket allowance (REQ-KIT-5 — state this in the PR)`,
    `  total JS delta: ${sign(measured.totalJs - baseline.totalJsGzipBytes)} · total CSS delta: ${sign(measured.totalCss - baseline.totalCssGzipBytes)}`,
  ];
  if (entryDelta > allowance) {
    lines.push(
      `  WARN: entry delta exceeds the ≤ ${kb(allowance)} per-ticket allowance — reduce or record an operator ruling`,
    );
  }
  return lines;
}

/**
 * Load manifest + measure artifacts under outDirAbs and evaluate. When a committed
 * REQ-KIT-5 baseline file exists (baselinePath), the result carries `delta` — the
 * informational entry-delta report lines (absent ⇒ `delta: []`, never a violation).
 * Exported for tests.
 */
export function checkSpaBudget(outDirAbs, budgetPath, baselinePath = null) {
  const budget = JSON.parse(readFileSync(budgetPath, "utf8"));
  const manifestPath = join(outDirAbs, ".vite", "manifest.json");
  if (!existsSync(outDirAbs) || !existsSync(manifestPath)) {
    return {
      ok: false,
      violations: [
        `SPA output missing — ${manifestPath} not found (run \`pnpm --filter @rhema/web build:spa\` first; the gate is fail-closed)`,
      ],
      report: [],
      delta: [],
    };
  }
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  const artifacts = [];
  for (const file of walk(outDirAbs)) {
    if (file.endsWith(".map")) continue; // provenance artifacts — never measured (REQ-TL-6)
    if (!file.endsWith(".js") && !file.endsWith(".css")) continue;
    const rel = file.slice(outDirAbs.length + 1);
    artifacts.push({ file: rel, gzipBytes: gzipSync(readFileSync(file)).length });
  }
  const result = evaluateSpaBudget(manifest, artifacts, budget);
  let delta = [];
  if (baselinePath != null && existsSync(baselinePath)) {
    try {
      delta = spaDeltaReport(result.measured, JSON.parse(readFileSync(baselinePath, "utf8")));
    } catch (err) {
      delta = [`  WARN: baseline unreadable (${err.message}) — entry-delta report skipped`];
    }
  }
  return { ...result, delta };
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const args = process.argv.slice(2);
  const opt = (flag, dflt) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : dflt;
  };
  const outDir = resolve(root, opt("--out", DEFAULT_OUT_DIR));
  const budgetFile = resolve(root, opt("--budget", DEFAULT_BUDGET_FILE));
  const baselineFile = resolve(root, opt("--baseline", DEFAULT_BASELINE_FILE));
  const { ok, violations, report, delta } = checkSpaBudget(outDir, budgetFile, baselineFile);
  if (report.length > 0) {
    console.log(`SPA bundle budget (gzip) — ${outDir}:`);
    for (const line of report) console.log(line);
  }
  if (delta.length > 0) {
    for (const line of delta) console.log(line);
  }
  if (!ok) {
    console.error(`SPA bundle budget FAILED — ${violations.length} violation(s):`);
    for (const v of violations) console.error(`  - ${v}`);
    process.exit(1);
  }
  console.log("SPA bundle budget OK — all ceilings held.");
}
