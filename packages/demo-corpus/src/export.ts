/**
 * REQ-CORPUS-11 — the deterministic exporter. `exportCorpus` walks each source project dir under
 * `sourceRoot`, classifies every file (allowlist-only), sanitizes markdown and PNGs through the same
 * recorded path, writes one output file per source artifact under `corpus/<slug>/` (mirroring the
 * source layout) plus per-slug `index.json` / `versions.json` / `excluded-refs.json`, then writes
 * `corpus/PROVENANCE.md` and `corpus/export-manifest.json`.
 *
 * Determinism: no clock (the export date is a recorded input), files written in sorted order, and a
 * byte-stable re-run over byte-stable input. The real corpus never passes through here — this is
 * proven on `fixtures/synthetic/` only (REQ-CORPUS-14; the real export is 214b's LOCAL job).
 */
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";
import { allowlistCounts, classifyFile } from "./allowlist.js";
import { gateDir, loadPatterns } from "./denylist.js";
import { sanitizePng } from "./png.js";
import { readCorpusRules, type CorpusRules } from "./rules.js";
import { sanitizeMarkdown, type Redaction } from "./sanitize.js";
import {
  extractTitle,
  parsePublished,
  publishedNode,
  WRITER_DIRECTED_LABEL,
  type PublishedEntry,
  type VersionEntry,
  type VersionIndex,
} from "./versions.js";

export interface ExportOptions {
  /** Dir containing one subdir per project slug. */
  readonly sourceRoot: string;
  /** Corpus root: receives `<slug>/`, `PROVENANCE.md`, `export-manifest.json`; holds `_rules/` input. */
  readonly corpusRoot: string;
  readonly slugs: readonly string[];
  /** Recorded input — the only date the export may write (determinism: no clock reads). */
  readonly exportDate: string;
}

export interface ExcludedFile {
  readonly file: string;
  readonly reason: string;
}

export interface ExcludedRef {
  readonly file: string;
  readonly line: number;
  readonly excluded: string;
}

export interface SlugReport {
  readonly slug: string;
  readonly kept: readonly { relPath: string; ruleId: string; reason: string }[];
  readonly excluded: readonly ExcludedFile[];
  readonly redactions: readonly Redaction[];
  readonly excludedRefs: readonly ExcludedRef[];
  readonly sourceTreeDigest: string;
  readonly published: PublishedEntry | null;
}

export class ExportError extends Error {}

function sha256(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

function* walkRel(root: string): Generator<string> {
  for (const abs of walk(root)) yield relative(root, abs).split("\\").join("/");
}

/** Detect references to excluded files so the renderer can draw a "not published" non-link. */
function findExcludedRefs(
  relPath: string,
  text: string,
  excluded: readonly ExcludedFile[],
): ExcludedRef[] {
  const needles = new Map<string, RegExp>();
  for (const e of excluded) {
    const base = e.file.split("/").pop()!;
    needles.set(
      e.file,
      new RegExp(`(^|[^\\w-])${e.file.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\w-]|$)`),
    );
    if (!needles.has(base)) {
      needles.set(
        base,
        new RegExp(`(^|[^\\w-])${base.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^\\w-]|$)`),
      );
    }
  }
  const refs: ExcludedRef[] = [];
  text.split("\n").forEach((line, i) => {
    for (const [needle, re] of needles) {
      if (re.test(line)) {
        refs.push({ file: relPath, line: i + 1, excluded: needle });
        break; // one marker row per line is enough for the renderer
      }
    }
  });
  return refs;
}

function write(root: string, rel: string, bytes: Uint8Array): string {
  const abs = join(root, rel);
  mkdirSync(join(abs, ".."), { recursive: true });
  writeFileSync(abs, bytes);
  return rel;
}

function exportSlug(
  projectDir: string,
  slug: string,
  rules: CorpusRules,
  corpusRoot: string,
): SlugReport {
  if (!statSync(projectDir, { throwIfNoEntry: false })?.isDirectory()) {
    throw new ExportError(`source project dir missing: ${projectDir}`);
  }
  const facts = rules.facts[slug] ?? null;
  const kept: { relPath: string; ruleId: string; reason: string }[] = [];
  const excluded: ExcludedFile[] = [];
  const unruled: string[] = [];

  const all = [...walkRel(projectDir)].sort();
  for (const rel of all) {
    const ruling = classifyFile(rel);
    if (ruling.ruling === "keep")
      kept.push({ relPath: rel, ruleId: ruling.ruleId, reason: ruling.reason });
    else if (ruling.ruling === "exclude") excluded.push({ file: rel, reason: ruling.reason });
    else unruled.push(rel);
  }
  if (unruled.length > 0) {
    throw new ExportError(
      `un-ruled files under ${slug} (allowlist-only ingest fails closed): ${unruled.join(", ")}`,
    );
  }
  excluded.sort((a, b) => a.file.localeCompare(b.file));

  const sourceTreeDigest = sha256(
    new TextEncoder().encode(
      kept
        .map((k) => `${sha256(readFileSync(join(projectDir, k.relPath)))}  ${k.relPath}`)
        .join("\n"),
    ),
  );

  const redactions: Redaction[] = [];
  const excludedRefs: ExcludedRef[] = [];
  const artifacts: { path: string; bytes: number; sha256: string; kind: string }[] = [];
  const versions: VersionEntry[] = [];
  let published: PublishedEntry | null = null;

  for (const k of kept) {
    const raw = readFileSync(join(projectDir, k.relPath));
    if (k.relPath.endsWith(".png")) {
      const png = sanitizePng(raw);
      write(join(corpusRoot, slug), k.relPath, png.bytes);
      if (png.dropped.length > 0) {
        redactions.push({
          rule: "png-strip",
          file: k.relPath,
          line: 0,
          to: `dropped: ${png.dropped.join(",")}`,
          reason:
            "EXIF/XMP/tEXt and non-render chunks stripped (REQ-CORPUS-5); bytes copied, xattrs never travel",
        });
      }
      artifacts.push({
        path: k.relPath,
        bytes: png.bytes.length,
        sha256: sha256(png.bytes),
        kind: "image",
      });
      continue;
    }
    const { text, redactions: reds } = sanitizeMarkdown(
      k.relPath,
      raw.toString("utf8"),
      rules.rewrites,
      slug,
    );
    redactions.push(...reds);
    excludedRefs.push(...findExcludedRefs(k.relPath, text, excluded));
    const bytes = new TextEncoder().encode(text);
    write(join(corpusRoot, slug), k.relPath, bytes);
    artifacts.push({
      path: k.relPath,
      bytes: bytes.length,
      sha256: sha256(bytes),
      kind: "markdown",
    });

    const draft = /^drafts\/(v[0-9]+)\.md$/.exec(k.relPath);
    if (draft) {
      const { title, subtitle } = extractTitle(text);
      const wd = facts?.writerDirected.includes(draft[1]!) ?? false;
      versions.push({
        version: draft[1]!,
        file: k.relPath,
        label: draft[1]!,
        title,
        subtitle,
        origin: "source",
        ...(wd ? { writerDirected: true, provenanceLabel: WRITER_DIRECTED_LABEL } : {}),
      });
    }
    if (k.relPath === "published.md") {
      const rawDoc = parsePublished(raw.toString("utf8"));
      if (sha256(new TextEncoder().encode(rawDoc.body)) !== rawDoc.sha256) {
        throw new ExportError(
          `${slug}/published.md: declared sha256 does not match the stored body`,
        );
      }
      published = publishedNode(rawDoc);
    }
  }

  const index = {
    slug,
    artifacts: artifacts.sort((a, b) => a.path.localeCompare(b.path)),
  };
  const versionIndex: VersionIndex = { slug, versions, published };
  write(
    join(corpusRoot, slug),
    "index.json",
    new TextEncoder().encode(JSON.stringify(index, null, 2) + "\n"),
  );
  write(
    join(corpusRoot, slug),
    "versions.json",
    new TextEncoder().encode(JSON.stringify(versionIndex, null, 2) + "\n"),
  );
  write(
    join(corpusRoot, slug),
    "excluded-refs.json",
    new TextEncoder().encode(
      JSON.stringify(
        { refs: excludedRefs.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line) },
        null,
        2,
      ) + "\n",
    ),
  );

  return { slug, kept, excluded, redactions, excludedRefs, sourceTreeDigest, published };
}

function renderProvenance(
  reports: readonly SlugReport[],
  exportDate: string,
  rules: CorpusRules,
): string {
  const out: string[] = [];
  out.push("# Corpus provenance", "");
  out.push(`- Export date: ${exportDate}`);
  out.push(
    "- Exporter: `@rhema/demo-corpus` (`tools/demo-corpus/export.mjs`; deterministic re-run)",
  );
  out.push(
    "- This file is authored, never rendered from excluded manifests (REQ-CORPUS-7 facts half).",
  );
  out.push("");
  for (const r of reports) {
    const facts = rules.facts[r.slug] ?? null;
    out.push(`## ${r.slug}`, "");
    out.push("### Source identity");
    out.push(
      `- Source tree: the untracked agent-discourse scratch projects root, project \`${r.slug}\``,
    );
    out.push(`- agent-discourse HEAD (context): ${facts?.sourceCommit ?? "not recorded"}`);
    out.push(`- Allowlisted input tree digest (sha256): \`${r.sourceTreeDigest}\``);
    out.push(`- Export date: ${exportDate}`, "");
    out.push("### Allowlist (keep rules → admitted files)");
    for (const row of allowlistCounts(
      r.kept.map((k) => ({
        relPath: k.relPath,
        ruling: { ruling: "keep" as const, ruleId: k.ruleId, reason: k.reason },
      })),
    )) {
      out.push(`- \`${row.ruleId}\` (${row.reason}): ${row.count}`);
    }
    out.push("", "### Excluded (file → reason)");
    for (const e of r.excluded) out.push(`- \`${e.file}\` — ${e.reason}`);
    out.push("", "### Redactions applied (rule → replacement, file:line, reason)");
    if (r.redactions.length === 0) out.push("- none");
    for (const red of r.redactions)
      out.push(`- \`${red.rule}\` → ${red.to} — \`${red.file}:${red.line}\` — ${red.reason}`);
    out.push("", "### Published");
    if (r.published) {
      out.push(
        `- \`${r.published.url}\` — fetched ${r.published.fetched} — sha256 \`${r.published.sha256}\``,
      );
    } else out.push("- none (no `published.md` ingested)");
    out.push("", "### Round and approval facts (the only facts S-9 may cite)");
    if (facts && facts.approvals.length > 0) {
      for (const a of facts.approvals) {
        out.push(`- ${a.round}: ${a.decision}${a.note ? ` — ${a.note}` : ""}`);
      }
    } else out.push("- approvals not recorded");
    out.push("");
  }
  return out.join("\n");
}

export function exportCorpus(opts: ExportOptions): { reports: SlugReport[] } {
  const rules = readCorpusRules(opts.corpusRoot);
  const slugs = [...opts.slugs].sort();
  const reports = slugs.map((slug) =>
    exportSlug(join(opts.sourceRoot, slug), slug, rules, opts.corpusRoot),
  );

  const seen = new Set(reports.flatMap((r) => r.redactions.map((x) => x.rule)));
  const unused = rules.rewrites.filter((row) => !seen.has(row.id));
  if (unused.length > 0) {
    throw new ExportError(
      `stale rewrite rows never applied: ${unused.map((r) => r.id).join(", ")}`,
    );
  }

  write(
    opts.corpusRoot,
    "PROVENANCE.md",
    new TextEncoder().encode(renderProvenance(reports, opts.exportDate, rules)),
  );

  // Hard-fail denylist over everything just written (REQ-CORPUS-2) — before the manifest is sealed.
  const gate = gateDir(opts.corpusRoot, loadPatterns());
  if (!gate.ok) {
    const v = gate.violations.map((h) => `${h.file}:${h.line} (${h.ruleId})`);
    const s = gate.stale.map((a) => `${a.id} ${a.file}:${a.line}`);
    throw new ExportError(
      `denylist gate failed — violations: ${v.join(", ") || "none"}; stale allowlist rows: ${s.join(", ") || "none"}`,
    );
  }

  const files: Record<string, { sha256: string; bytes: number }> = {};
  for (const rel of [...walkRel(opts.corpusRoot)].sort()) {
    if (rel === "export-manifest.json") continue;
    const raw = readFileSync(join(opts.corpusRoot, rel));
    files[rel] = { sha256: sha256(raw), bytes: raw.length };
  }
  const digest = sha256(
    new TextEncoder().encode(
      Object.entries(files)
        .map(([p, f]) => `${f.sha256}  ${p}`)
        .join("\n"),
    ),
  );
  write(
    opts.corpusRoot,
    "export-manifest.json",
    new TextEncoder().encode(
      JSON.stringify({ exportDate: opts.exportDate, files, digest }, null, 2) + "\n",
    ),
  );
  return { reports };
}
