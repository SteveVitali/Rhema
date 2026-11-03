/**
 * Typed reader for `corpus/_rules/` — the redaction/policy DATA the exporter consumes (REQ-CORPUS-3,
 * REQ-CORPUS-2). Rule data is never quoted private text: line-allowlist entries name file:line only,
 * and rewrite rows apply a declared pattern at a declared file:line (a stale row fails the export —
 * the table and the corpus can never silently drift apart).
 *
 * This ticket owns the schema; 214b authors the real rows, 219 commits them.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** A file-targeted rewrite: replace `pattern` (a literal phrase, never a bare token) at file:line. */
export interface FileRewrite {
  readonly id: string;
  /** Project-relative source path, e.g. `correspondence/v1-review/editors-letter.md`. */
  readonly file: string;
  /** 1-based line in the source file (sanitizer rewrites are intra-line, so numbers stay stable). */
  readonly line: number;
  readonly pattern: string;
  readonly replacement: string;
  readonly reason: string;
}

/** A denylist line-allowlist row: names file:line only — no quoted text (S-11 credit lines). */
export interface AllowlistEntry {
  readonly id: string;
  /** Corpus-root-relative output path, e.g. `the-essay/published.md`. */
  readonly file: string;
  readonly line: number;
  readonly reason: string;
}

/** Per-slug export facts — the only facts PROVENANCE/S-9 may cite; anything absent is "not recorded". */
export interface SlugFacts {
  readonly sourceCommit: string;
  readonly writerDirected: readonly string[];
  readonly approvals: readonly {
    readonly round: string;
    readonly decision: string;
    readonly note?: string;
  }[];
}

export interface CorpusRules {
  readonly rewrites: readonly FileRewrite[];
  readonly lineAllowlist: readonly AllowlistEntry[];
  readonly facts: Readonly<Record<string, SlugFacts>>;
}

function fail(msg: string): never {
  throw new Error(`corpus _rules: ${msg}`);
}

function str(v: unknown, what: string): string {
  if (typeof v !== "string" || v.length === 0) fail(`${what} must be a non-empty string`);
  return v as string;
}

function int(v: unknown, what: string): number {
  if (typeof v !== "number" || !Number.isInteger(v) || v < 1)
    fail(`${what} must be a positive integer`);
  return v as number;
}

function rows(v: unknown, file: string): Record<string, unknown>[] {
  if (!Array.isArray(v)) fail(`${file}: top-level array missing`);
  return v.map((row, i) => {
    if (typeof row !== "object" || row === null || Array.isArray(row))
      fail(`${file}[${i}]: not an object`);
    return row as Record<string, unknown>;
  });
}

function readJson(dir: string, name: string): unknown {
  const p = join(dir, name);
  if (!existsSync(p)) return null;
  try {
    return JSON.parse(readFileSync(p, "utf8")) as unknown;
  } catch {
    fail(`${name}: invalid JSON`);
  }
}

/** Read `<corpusRoot>/_rules/`; every file is optional and absent means "no rows". */
export function readCorpusRules(corpusRoot: string): CorpusRules {
  const dir = join(corpusRoot, "_rules");
  const rawRewrites = readJson(dir, "rewrites.json") as { rewrites?: unknown } | null;
  const rewrites: FileRewrite[] = rows(rawRewrites?.rewrites ?? [], "rewrites.json").map(
    (r, i) => ({
      id: str(r.id, `rewrites[${i}].id`),
      file: str(r.file, `rewrites[${i}].file`),
      line: int(r.line, `rewrites[${i}].line`),
      pattern: str(r.pattern, `rewrites[${i}].pattern`),
      replacement:
        typeof r.replacement === "string"
          ? r.replacement
          : fail(`rewrites[${i}].replacement must be a string`),
      reason: str(r.reason, `rewrites[${i}].reason`),
    }),
  );

  const rawAllow = readJson(dir, "line-allowlist.json") as { entries?: unknown } | null;
  const lineAllowlist: AllowlistEntry[] = rows(rawAllow?.entries ?? [], "line-allowlist.json").map(
    (r, i) => ({
      id: str(r.id, `line-allowlist[${i}].id`),
      file: str(r.file, `line-allowlist[${i}].file`),
      line: int(r.line, `line-allowlist[${i}].line`),
      reason: str(r.reason, `line-allowlist[${i}].reason`),
    }),
  );

  const rawFacts = readJson(dir, "facts.json") as { slugs?: Record<string, unknown> } | null;
  const facts: Record<string, SlugFacts> = {};
  for (const [slug, raw] of Object.entries(rawFacts?.slugs ?? {})) {
    const f = raw as Record<string, unknown>;
    facts[slug] = {
      sourceCommit: str(f.sourceCommit, `facts.${slug}.sourceCommit`),
      writerDirected: Array.isArray(f.writerDirected)
        ? f.writerDirected.map((v, i) => str(v, `facts.${slug}.writerDirected[${i}]`))
        : [],
      approvals: Array.isArray(f.approvals)
        ? rows(f.approvals, `facts.${slug}.approvals`).map((a, i) => ({
            round: str(a.round, `facts.${slug}.approvals[${i}].round`),
            decision: str(a.decision, `facts.${slug}.approvals[${i}].decision`),
            note: typeof a.note === "string" ? a.note : undefined,
          }))
        : [],
    };
  }
  return { rewrites, lineAllowlist, facts };
}
