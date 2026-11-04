/**
 * REQ-CORPUS-3 (as amended by S-10) — the sanitizer. Rewrites only, every application recorded in
 * the redaction table (rule → replacement, file, line, reason); no blind token replacement and no
 * deletions. Draft prose (`drafts/`) changes only for the SPD `figures/` image-path fix.
 *
 * Order per line: file-targeted `_rules/` rewrites first (authored data; a stale row fails), then
 * the generic committed guards. The URL guards (`[?&]utm_*` strip, `r.jina.ai` unwrap) therefore run
 * before any downstream `normalizeUrl` consumer (R2 §7 R6). Rewrite rows target phrases, never bare
 * tokens — workflow-sense "operator" becomes "the writer" only where a row says so; content-sense
 * lines stay untouched.
 */
import type { FileRewrite } from "./rules.js";

export interface Redaction {
  readonly rule: string;
  readonly file: string;
  /** 1-based line in the exported file. */
  readonly line: number;
  readonly to: string;
  readonly reason: string;
}

export interface SanitizedText {
  readonly text: string;
  readonly redactions: Redaction[];
}

interface GenericRule {
  readonly id: string;
  readonly reason: string;
  readonly to: string;
  /** True when the rule may only run on `drafts/**` prose. */
  readonly draftsOnly?: boolean;
  readonly apply: (line: string) => string;
}

const GENERIC: readonly GenericRule[] = [
  {
    id: "utm-strip",
    reason: "tracking parameters are stripped from URLs (R1 §2 guard)",
    to: "(utm_* stripped)",
    apply: (l) =>
      l
        .replace(/&utm_[A-Za-z0-9_]*=[^&\s)\]]*/gi, "")
        .replace(/\?utm_[A-Za-z0-9_]*=[^&\s)\]]*&/gi, "?")
        .replace(/\?utm_[A-Za-z0-9_]*=[^&\s)\]]*/gi, ""),
  },
  {
    id: "jina-unwrap",
    reason: "reader-proxy prefix unwrapped to the direct URL (R1 §2 guard)",
    to: "(unwrapped URL)",
    apply: (l) => l.replace(/https?:\/\/r\.jina\.ai\/(https?:\/\/[^\s)\]]+)/gi, "$1"),
  },
  {
    id: "persona-path",
    reason: "persona profile path becomes its published label (R1 §2)",
    to: "the persona profile",
    apply: (l) =>
      l.replace(
        /agent-scratch\/personas\/[^\s)\]`'"]*|personas\/[^\s)\]`'"]*/g,
        "the persona profile",
      ),
  },
  {
    id: "persona-slug",
    reason: "persona slug becomes the corpus label (R1 §2)",
    to: "the S. J. Sebastian corpus",
    apply: (l) => l.replace(/\bsjs-substack\b/g, "the S. J. Sebastian corpus"),
  },
  {
    id: "desktop-path",
    reason: "operator-local path becomes its published label (R1 §2, S-10)",
    to: "the writer's Substack package",
    apply: (l) => l.replace(/`?~\/Desktop\/[^\s)\]`'"]*`?/g, "the writer's Substack package"),
  },
  {
    id: "figure-path",
    reason:
      "image links carry the figures/ prefix (R1 §2 normalisation; the only draft-prose change)",
    to: "figures/<name>.png",
    draftsOnly: true,
    apply: (l) => l.replace(/\]\((figure_[^)\s]+\.png)\)/g, "](figures/$1)"),
  },
];

export class SanitizeError extends Error {}

/** Replace `pattern` (literal, all occurrences on the line). Stale row → fail closed. */
function applyRow(lines: string[], row: FileRewrite): void {
  const i = row.line - 1;
  const cur = lines[i];
  if (cur === undefined || !cur.includes(row.pattern)) {
    throw new SanitizeError(`rewrite ${row.id}: pattern not found at ${row.file}:${row.line}`);
  }
  lines[i] = cur.split(row.pattern).join(row.replacement);
}

export function sanitizeMarkdown(
  relPath: string,
  text: string,
  rewrites: readonly FileRewrite[],
  slug?: string,
): SanitizedText {
  const lines = text.split("\n");
  const redactions: Redaction[] = [];

  const targeted = rewrites.filter(
    (r) => r.file === relPath && (r.slug === undefined || r.slug === slug),
  );
  for (const row of targeted) applyRow(lines, row);
  for (const row of targeted) {
    redactions.push({
      rule: row.id,
      file: relPath,
      line: row.line,
      to: row.replacement,
      reason: row.reason,
    });
  }

  const isDraft = relPath.startsWith("drafts/");
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i] as string;
    for (const rule of GENERIC) {
      if (rule.draftsOnly && !isDraft) continue;
      const next = rule.apply(line);
      if (next !== line) {
        redactions.push({
          rule: rule.id,
          file: relPath,
          line: i + 1,
          to: rule.to,
          reason: rule.reason,
        });
        line = next;
      }
    }
    lines[i] = line;
  }
  return { text: lines.join("\n"), redactions };
}
