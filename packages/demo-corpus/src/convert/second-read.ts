// `05-second-read.md` → objections / strengths / verdict (R2 §5 `second-read.ts`; REQ-CONV-7).
// Objections carry their own labels (`### 1. …`, `### Objection 2 …`, `### (iii) …`, `### 2.4 …`)
// — the response ledger's `SR n` refs and the reconciliation join read them. Second-read
// strengths are parsed for completeness but are never findings (R2 §2.2 — they render raw).

import { headingSections } from "./md/sections.js";
import { leadSplit, verbatimItems, type VerbatimItem } from "./letter.js";

export interface SecondReadObjection {
  /** The item's own label — `"1"`, `"2.4"`, `"iii"`. */
  readonly label: string;
  /** Heading text after the label — verbatim. */
  readonly title: string;
  /** The H3 body (verbatim slice, trimmed). */
  readonly body: string;
  readonly line: number;
}

export interface ParsedSecondRead {
  readonly objections: readonly SecondReadObjection[];
  /** `## Strengths` items — raw only; NEVER findings (R2 §2.2). */
  readonly strengths: readonly VerbatimItem[];
  /** `## Verdict` body first line / bold lead — raw. */
  readonly verdict: string | null;
  /** Objection headings whose label grammar failed (R2 §1: 0 unlabeled in corpus). */
  readonly unlabeled: readonly string[];
}

// `### 1. …` · `### Objection 2 …` · `### 2.4 …` · `### (iii) …` — R2 §1 second-read labels.
// GM v2's real file uses section-numbered headings `### 2.1 The …` — a dotted label with no
// trailing `.`/`)`.
const OBJ_HEAD = [
  /^(?:objection|obj)\s+(\d+(?:\.\d+)?)\s*[:.–-]?\s*(.*)$/i,
  /^(\d+(?:\.\d+)?)[.)]\s+(.+)$/,
  /^\(([ivx]+)\)\s*(.+)$/i,
  /^(\d+\.\d+)\s+(.+)$/,
];

/** Parse a second-read file. `markdown` may be absent (no 05 file for the round). */
export function parseSecondRead(markdown: string): ParsedSecondRead {
  const h2s = headingSections(markdown, 2);
  const h3s = headingSections(markdown, 3);
  const find = (re: RegExp) => h2s.find((s) => re.test(s.heading));

  const objSec = find(/objection/i);
  const objections: SecondReadObjection[] = [];
  const unlabeled: string[] = [];
  if (objSec) {
    const nextH2 = h2s.find((s) => s.line > objSec.line);
    for (const s of h3s.filter(
      (h) => h.line > objSec.line && (nextH2 === undefined || h.line < nextH2.line),
    )) {
      const m = OBJ_HEAD.map((re) => re.exec(s.heading)).find(Boolean);
      if (!m) {
        unlabeled.push(s.heading);
        continue;
      }
      objections.push({
        label: (m[1] ?? "").trim(),
        title: (m[2] ?? s.heading).trim(),
        body: s.body.trim(),
        line: s.line,
      });
    }
  }

  const strSec = find(/strength|strongest/i);
  const strengths = strSec ? verbatimItems(strSec.body) : [];

  const verSec = find(/verdict/i);
  const verdict = verSec
    ? (leadSplit(verSec.body.split("\n").find((l) => l.trim() !== "") ?? "").rest ||
      verSec.body.trim().split("\n")[0] ||
      null)
    : null;

  return { objections, strengths, verdict, unlabeled };
}
