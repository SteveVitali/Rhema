/**
 * REQ-CORPUS-2 (amended) — hard-fail denylist over every corpus-derived output (corpus, goldens,
 * snapshots; real and synthetic). Patterns live in `denylist-patterns.json` at the package root —
 * the single source shared with `tools/demo-corpus/check-corpus.mjs` (the always-run CI checker);
 * `denylist.test.ts` pins parity between the two implementations.
 *
 * Bare `Steven` / `Desktop` / `claude` / `operator` / `@example.com` are NOT gated (R1 §2 — they
 * are content). A hit is excused only by a `_rules/line-allowlist.json` entry naming that exact
 * file:line (S-11 Published credit lines); every allowlist row must cover a real hit — a stale row
 * fails the gate.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { AllowlistEntry } from "./rules.js";

export interface DenyPattern {
  readonly id: string;
  readonly re: string;
  readonly flags?: string;
  readonly reason: string;
}

export function loadPatterns(): readonly DenyPattern[] {
  const url = new URL("../denylist-patterns.json", import.meta.url);
  const parsed = JSON.parse(readFileSync(fileURLToPath(url), "utf8")) as {
    patterns: DenyPattern[];
  };
  return parsed.patterns;
}

export interface DenyHit {
  readonly file: string;
  readonly line: number;
  readonly ruleId: string;
}

export interface GateResult {
  /** Hits NOT covered by a line-allowlist entry — each is a gate failure. */
  readonly violations: DenyHit[];
  /** Allowlist rows that matched no hit at their file:line — each is a gate failure. */
  readonly stale: readonly AllowlistEntry[];
  readonly ok: boolean;
}

function scanLines(file: string, text: string, patterns: readonly DenyPattern[]): DenyHit[] {
  const compiled = patterns.map((p) => ({ id: p.id, re: new RegExp(p.re, p.flags ?? "") }));
  const hits: DenyHit[] = [];
  text.split("\n").forEach((line, i) => {
    for (const { id, re } of compiled) {
      if (re.test(line)) hits.push({ file, line: i + 1, ruleId: id });
    }
  });
  return hits;
}

/**
 * Binary artifacts are never line-scanned: a `.png` in any corpus dir is exporter output — bytes
 * re-encoded by the sanitizer, where text patterns only false-fire on image data (2026-11-04
 * real-data fix: `~/` byte pairs inside PNG IDAT). Markdown/JSON/text stay scanned.
 */
const BINARY_EXT = /\.png$/i;

/** Scan one preloaded file list (the unit-test + in-export path). */
export function gateFiles(
  files: readonly { relPath: string; text: string }[],
  patterns: readonly DenyPattern[],
  allowlist: readonly AllowlistEntry[],
): GateResult {
  const hits = files
    .filter((f) => !BINARY_EXT.test(f.relPath))
    .flatMap((f) => scanLines(f.relPath, f.text, patterns));
  const allowed = new Set(allowlist.map((a) => `${a.file}:${a.line}`));
  const hitLines = new Set(hits.map((h) => `${h.file}:${h.line}`));
  const violations = hits.filter((h) => !allowed.has(`${h.file}:${h.line}`));
  const stale = allowlist.filter((a) => !hitLines.has(`${a.file}:${a.line}`));
  return { violations, stale, ok: violations.length === 0 && stale.length === 0 };
}

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) yield* walk(p);
    else yield p;
  }
}

/**
 * Scan a corpus root on disk (`corpus/`, `snapshots/`, a fixture's `corpus/`). `_rules/**` is
 * policy data, not corpus output, and is never scanned; the same dir's
 * `_rules/line-allowlist.json` supplies the entries.
 */
export function gateDir(root: string, patterns: readonly DenyPattern[]): GateResult {
  const files: { relPath: string; text: string }[] = [];
  for (const abs of walk(root)) {
    const rel = relative(root, abs).split("\\").join("/");
    if (rel.startsWith("_rules/") || rel === "export-manifest.json") continue;
    files.push({ relPath: rel, text: readFileSync(abs).toString("latin1") });
  }
  let allowlist: AllowlistEntry[] = [];
  try {
    const raw = JSON.parse(readFileSync(join(root, "_rules", "line-allowlist.json"), "utf8")) as {
      entries?: AllowlistEntry[];
    };
    allowlist = raw.entries ?? [];
  } catch {
    /* no allowlist file — every hit is a violation */
  }
  return gateFiles(files, patterns, allowlist);
}
