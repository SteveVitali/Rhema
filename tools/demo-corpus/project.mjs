#!/usr/bin/env node
/**
 * REQ-CORPUS-9 — the snapshot regeneration command (corpus → convert → project; 218a extends it,
 * 219 reuses it for the real data commit):
 *
 *   node tools/demo-corpus/project.mjs --corpus <root> --snapshots <dir> --slug <slug> [--slug ...]
 *       [--overrides-dir <dir>] [--manifest <export-manifest.json>]
 *
 * Reads <corpus>/<slug>/ (plus PROVENANCE.md + export-manifest.json at the corpus root), runs
 * `convertProject` (fails closed on any error diagnostic), then `projectEssay`, and writes
 * <snapshots>/<slug>/ chunks + index.json and <snapshots>/projects.json. All projection logic is
 * in `@rhema/demo-corpus`; this script only does file I/O.
 */
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { convert, project } from "@rhema/demo-corpus";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

function arg(name, all = false) {
  const out = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === `--${name}`) out.push(process.argv[++i]);
  }
  return all ? out : out[0];
}

const corpus = arg("corpus") ?? resolve(ROOT, "packages/demo-corpus/corpus");
const snapshots = arg("snapshots") ?? resolve(ROOT, "packages/demo-corpus/snapshots");
const slugs = arg("slug", true);
const overridesDir = arg("overrides-dir");
const manifestPath = arg("manifest") ?? join(corpus, "export-manifest.json");

if (slugs.length === 0) {
  console.error(
    "usage: project.mjs --corpus <root> --snapshots <dir> --slug <slug> [--slug ...] [--overrides-dir <dir>]",
  );
  process.exit(2);
}

function* walk(dir) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const exportDate = manifest.exportDate;
const provenance = readFileSync(join(corpus, "PROVENANCE.md"), "utf8");

const rows = [];
for (const slug of slugs) {
  const root = join(corpus, slug);
  const files = new Map();
  for (const p of walk(root)) files.set(relative(root, p).replace(/\\/g, "/"), readFileSync(p, "utf8"));

  let overrides;
  if (overridesDir !== undefined) {
    const ov = JSON.parse(readFileSync(join(overridesDir, slug, "convert-overrides.json"), "utf8"));
    const parsed = convert.readConvertOverrides(ov);
    if (!parsed.ok) throw new Error(`${slug}: overrides failed to parse`);
    overrides = parsed.value;
  }

  const conv = convert.convertProject({ files, ...(overrides ? { overrides } : {}) });
  if (!conv.ok) {
    console.error(`${slug}: convertProject failed closed`, conv.diagnostics);
    process.exit(1);
  }
  const errors = conv.diagnostics.filter((d) => d.severity === "error");
  if (errors.length > 0) {
    console.error(`${slug}: error diagnostics`, errors);
    process.exit(1);
  }

  const result = project.projectEssay({
    essay: slug,
    files,
    convert: conv,
    exportDate,
    provenance,
  });

  const essayRoot = join(snapshots, slug);
  for (const [rel, bytes] of result.outputs) {
    const dest = join(essayRoot, rel);
    mkdirSync(resolve(dest, ".."), { recursive: true });
    writeFileSync(dest, bytes);
  }
  rows.push(result.row);
  console.log(`${slug}: ${result.outputs.size} chunks written`);
}

mkdirSync(snapshots, { recursive: true });
writeFileSync(
  join(snapshots, "projects.json"),
  convert.canonicalJson({ format: 1, kind: "projects", essay: "*", key: "projects", dto: rows }),
);
console.log(`projects.json: ${rows.length} rows`);
