#!/usr/bin/env node
/**
 * REQ-CORPUS-11 — deterministic corpus exporter CLI.
 *
 *   node tools/demo-corpus/export.mjs --source <root> --slug <slug> [--slug <slug>...]
 *       [--corpus <dir>] --date <YYYY-MM-DD>
 *
 * Reads <source>/<slug>/, sanitizes through the recorded allowlist + redaction + denylist path and
 * writes <corpus>/<slug>/, PROVENANCE.md and export-manifest.json. The default corpus dir is the
 * withheld `packages/demo-corpus/corpus/` (never committed — REQ-CORPUS-14). The export date is a
 * recorded input; the exporter itself reads no clock, writes files sorted, and is byte-stable.
 */
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { exportCorpus } from "@rhema/demo-corpus";

const ROOT = resolve(fileURLToPath(new URL(".", import.meta.url)), "../..");

function arg(name, all = false) {
  const out = [];
  for (let i = 0; i < process.argv.length; i++) {
    if (process.argv[i] === `--${name}`) out.push(process.argv[++i]);
  }
  return all ? out : out[0];
}

const source = arg("source") ?? resolve(ROOT, "../agent-discourse/agent-scratch/projects");
const corpus = arg("corpus") ?? resolve(ROOT, "packages/demo-corpus/corpus");
const slugs = arg("slug", true);
const date = arg("date");

if (slugs.length === 0 || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
  console.error(
    "usage: export.mjs --source <root> --slug <slug> [--slug ...] --date <YYYY-MM-DD> [--corpus <dir>]",
  );
  process.exit(2);
}

try {
  const { reports } = exportCorpus({
    sourceRoot: source,
    corpusRoot: corpus,
    slugs,
    exportDate: date,
  });
  for (const r of reports) {
    console.log(
      `${r.slug}: kept ${r.kept.length}, excluded ${r.excluded.length}, redactions ${r.redactions.length}, published ${r.published ? "yes" : "none"}`,
    );
  }
  console.log(`wrote ${corpus}/PROVENANCE.md + export-manifest.json (gate passed)`);
} catch (err) {
  console.error(`export FAILED: ${err instanceof Error ? err.message : String(err)}`);
  process.exit(1);
}
