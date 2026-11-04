// `editors-letter.md` → a typed letter (R2 §5 `letter.ts`; REQ-CONV-7): the verdict word, the
// `**The one thing:**` paragraph, strengths, majors with all four parts, minors, line notes,
// roadmap items, considered-and-rejected (with lead-in-paragraph origins), and the scorecard
// table. Pure parse — no findings semantics; `findings.ts`/`rubric.ts` consume this shape.
//
// R2 §1 letter variants absorbed: majors appear either as `### n. title` headings under a
// `## Major issues` section or top-level (the fixture's form); problem labels vary (`The
// problem, part one (…)` — every bullet that is not Where/Why/Direction is problem text);
// lists mix `- ` and `1. `; considered-and-rejected bullets inherit their origin from lead-in
// paragraphs ("From the second read, evaluated and not adopted:" vs "From my own
// deliberation…").

import type { RubricDimension } from "@rhema/contracts";
import { headingSections, preamble, tables } from "./md/sections.js";
import { warn, type Diagnostic } from "./result.js";

/** One verbatim list item (`- ` or `n. `): `raw` is the exact source slice after the marker
 *  (continuation lines kept, newline+indent intact), so emitted bodies stay source substrings. */
export interface VerbatimItem {
  readonly label: string | null;
  /** Single-spaced text for matching/labels (not for emission). */
  readonly text: string;
  /** The exact source slice after the marker through the item's last line. */
  readonly raw: string;
  readonly line: number;
  readonly end: number;
}

const ITEM_HEAD = /^(\s*(?:-|\d+\.)\s+)(.*)$/;
const BOLD_LEAD = /^\*\*(.+?)\*\*\s*:?[-–—]?\s*(.*)$/;
const PLAIN_LEAD = /^([A-Z][A-Za-z ()/-]{0,40}?):\s*(.*)$/;

/** List items in a body with verbatim raw slices — the union `- `/`n. ` reader. */
export function verbatimItems(body: string): VerbatimItem[] {
  const out: VerbatimItem[] = [];
  let cur:
    | { -readonly [K in keyof VerbatimItem]: VerbatimItem[K] }
    | null = null;
  body.split("\n").forEach((line, i) => {
    const m = ITEM_HEAD.exec(line);
    if (m) {
      const rest = m[2] ?? "";
      const label =
        BOLD_LEAD.exec(rest.trim())?.[1]?.replace(/[:.]$/, "").trim() ??
        PLAIN_LEAD.exec(rest.trim())?.[1]?.trim() ??
        null;
      cur = { label, text: rest.trim(), raw: rest, line: i + 1, end: i + 1 };
      out.push(cur);
    } else if (cur && /^\s+\S/.test(line)) {
      cur.text += " " + line.trim();
      cur.raw += "\n" + line;
      cur.end = i + 1;
    } else if (line.trim() === "" || /^\S/.test(line) || /^[#>]/.test(line)) {
      cur = null;
    }
  });
  return out;
}

/** A `**Bold lead:** rest` / `Plain lead: rest` split for titles (null when no lead). */
export function leadSplit(text: string): { title: string | null; rest: string } {
  const m = BOLD_LEAD.exec(text.trim()) ?? PLAIN_LEAD.exec(text.trim());
  return m
    ? { title: (m[1] ?? "").replace(/[:.]$/, "").trim(), rest: (m[2] ?? "").trim() }
    : { title: null, rest: text.trim() };
}

// ---- scorecard ----

/** The explicit scorecard-name → canonical-dimension map (R2 §2.3; REQ-CONV-9). Corpus names are
 *  free prose; only names listed here map — anything else fails the conversion (the raw strings
 *  `"Thesis & contribution"`/`"Voice & audience fit"` are R2's negative controls). */
export const RUBRIC_NAME_MAP: Readonly<Record<string, RubricDimension>> = {
  "thesis & contribution": "thesis_contribution",
  "argument rigor": "argument_rigor",
  "rigor & reasoning": "argument_rigor",
  "evidence & accuracy": "evidence_accuracy",
  "originality & situatedness": "originality_situatedness",
  originality: "originality_situatedness",
  structure: "structure",
  prose: "prose",
  "prose & style": "prose",
  "voice & audience fit": "voice_audience_fit",
  "intellectual honesty": "intellectual_honesty",
};

export interface ScorecardDim {
  readonly dimension: RubricDimension;
  readonly score: number;
  readonly basis: string;
  /** Basis states a cap (`cap(ped)?|by rule|rubric cap` — R2 §2.3). */
  readonly capped: boolean;
  /** Major numbers the Basis cites (`Major issue n`/`Major n`/`MI n`). */
  readonly cites: readonly number[];
}

const CAP_RE = /\bcap(?:ped)?\b|by rule|rubric cap/i;
const CITE_RE = /(?:Major issues?|Major|MI)\s*((?:\d+[a-z]?(?:\s*(?:,|and|&)\s*)?)+)/gi;

export interface LetterMajor {
  readonly n: number;
  /** Heading text after `n. ` — verbatim. */
  readonly title: string;
  readonly where: string;
  /** Every non-Where/Why/Direction bullet joined in source order (multi-part labels kept). */
  readonly problem: string;
  readonly why: string;
  readonly direction: string;
  /** The verbatim slice covering all non-Where bullets (the findings `body`). */
  readonly problemBody: string;
  readonly labels: readonly string[];
  readonly line: number;
}

export interface ConsideredItem {
  readonly title: string;
  readonly raw: string;
  /** `second_read` when a lead-in paragraph or the item itself says so (R2 §1). */
  readonly origin: "editor" | "second_read";
}

export interface ParsedLetter {
  readonly verdict: string | null;
  /** The `**The one thing:**` paragraph text after the marker (verbatim slice). */
  readonly oneThing: string | null;
  readonly strengths: readonly VerbatimItem[];
  readonly majors: readonly LetterMajor[];
  readonly minors: readonly VerbatimItem[];
  readonly lineNotes: readonly VerbatimItem[];
  readonly considered: readonly ConsideredItem[];
  /** Roadmap list items; `openQuestion` flags the "Open questions for the writer/author" rows. */
  readonly roadmap: readonly (VerbatimItem & { openQuestion: boolean })[];
  readonly scorecard: readonly ScorecardDim[];
  readonly diagnostics: readonly Diagnostic[];
}

const SEC = {
  strengths: /strength/i,
  minors: /minor/i,
  lineNotes: /line\s*notes?/i,
  considered: /considered/i,
  roadmap: /roadmap|revision/i,
  scorecard: /scorecard|score card/i,
} as const;

const WHERE_RE = /^where/i;
const WHY_RE = /^why/i;
const DIRECTION_RE = /^direction/i;
const MAJOR_HEAD_RE = /^(\d+)[.)]\s+(.+)$/;

/** Parse the letter into the typed shape. Missing optional sections emit warnings, never
 *  errors — a letter without majors (the v2 variant) still parses. An absent "the one thing"
 *  is an error-level absence the caller decides on (R2 §1: 5/5 letters carry one). */
export function parseLetter(markdown: string): ParsedLetter {
  const diagnostics: Diagnostic[] = [];
  const h2s = headingSections(markdown, 2);
  const pre = preamble(markdown, 2);
  const find = (re: RegExp) => h2s.find((s) => re.test(s.heading));

  // Verdict word: a `- Verdict: …` header bullet, or a `## Verdict` section's bold lead / first line.
  let verdict: string | null = null;
  const verdictBullet = verbatimItems(pre).find(
    (b) => b.label !== null && /^verdict$/i.test(b.label),
  );
  if (verdictBullet) {
    verdict = verdictBullet.raw.split("\n")[0]?.replace(/^.*?verdict\s*:\s*/i, "").trim() ?? null;
  }
  const verdictSec = find(/^verdict/i);
  if (verdict === null && verdictSec) {
    const line = verdictSec.body.split("\n").find((l) => l.trim() !== "") ?? "";
    verdict = leadSplit(line.replace(/^[-*]\s*/, "")).title ?? line.trim() ?? null;
  }

  // The one thing — `**The one thing:**` paragraph in the preamble or any section (e.g. `## Verdict`).
  let oneThing: string | null = null;
  const haystacks = [pre, ...h2s.map((s) => s.body)];
  for (const hay of haystacks) {
    const m = /\*\*The one thing:?\*\*:?\s*/.exec(hay);
    if (!m) continue;
    const rest = hay.slice(m.index + m[0].length);
    oneThing = rest.split(/\n\s*\n|\n(?=\s*(?:-|\d+\.|#))/)[0]?.trim() ?? null;
    break;
  }
  if (oneThing === null)
    diagnostics.push(warn("no_one_thing", "letter carries no `**The one thing:**` paragraph"));

  // Majors: every `### n. title` heading (under `## Major issues` or top-level).
  const majors: LetterMajor[] = [];
  for (const sec of headingSections(markdown, 3)) {
    const hm = MAJOR_HEAD_RE.exec(sec.heading);
    if (!hm) continue;
    const items = verbatimItems(sec.body);
    const where = items.filter((b) => b.label !== null && WHERE_RE.test(b.label));
    const why = items.filter((b) => b.label !== null && WHY_RE.test(b.label));
    const direction = items.filter((b) => b.label !== null && DIRECTION_RE.test(b.label));
    const others = items.filter(
      (b) =>
        !(
          b.label !== null &&
          (WHERE_RE.test(b.label) || WHY_RE.test(b.label) || DIRECTION_RE.test(b.label))
        ),
    );
    for (const [name, list] of [
      ["where", where],
      ["why", why],
      ["direction", direction],
    ] as const)
      if (list.length === 0)
        diagnostics.push(
          warn(
            "major_part_missing",
            `major ${hm[1]}: no ${name} bullet (line ${sec.line})`,
          ),
        );
    // body = the contiguous verbatim slice covering all non-Where bullets (R2 §2.2:
    // Problem + Why + Direction, bold labels kept).
    const bodyLines = sec.body.split("\n");
    const nonWhere = items.filter(
      (b) => !(b.label !== null && WHERE_RE.test(b.label)),
    );
    const problemBody =
      nonWhere.length > 0
        ? bodyLines
            .slice(nonWhere[0]!.line - 1, nonWhere[nonWhere.length - 1]!.end)
            .join("\n")
            .trim()
        : "";
    majors.push({
      n: Number(hm[1]),
      title: (hm[2] ?? "").trim(),
      where: where.map((b) => b.raw.trim()).join("\n\n"),
      problem: others.map((b) => b.raw.trim()).join("\n\n"),
      why: why.map((b) => b.raw.trim()).join("\n\n"),
      direction: direction.map((b) => b.raw.trim()).join("\n\n"),
      problemBody,
      labels: items.map((b) => b.label).filter((l): l is string => l !== null),
      line: sec.line,
    });
  }

  const items = (re: RegExp) => {
    const s = find(re);
    return s ? verbatimItems(s.body) : [];
  };
  const strengths = items(SEC.strengths);
  const minors = items(SEC.minors);
  const lineNotes = items(SEC.lineNotes);

  // Considered and rejected — bullets inherit their origin from lead-in paragraphs.
  const considered: ConsideredItem[] = [];
  const carSec = find(SEC.considered);
  if (carSec) {
    let mode: "editor" | "second_read" | null = null;
    const leadIns = carSec.body.split(/\n\s*\n/).filter((p) => !ITEM_HEAD.test(p.trim()));
    if (leadIns.some((p) => /second read/i.test(p))) mode = "second_read";
    else if (leadIns.some((p) => /own deliberation|not raised as a finding/i.test(p)))
      mode = "editor";
    for (const b of verbatimItems(carSec.body)) {
      const own = /^second read/i.test(b.text) ? "second_read" : null;
      const split = leadSplit(b.text);
      considered.push({
        title: split.title ?? b.text,
        raw: b.raw.trim(),
        origin: own ?? mode ?? "editor",
      });
    }
  }

  const roadmap = items(SEC.roadmap).map((b) => ({
    ...b,
    openQuestion: /^open questions?\b/i.test(b.text),
  }));

  // Scorecard: `| Dimension | Score | Basis |` — the declared-name map, cites and cap flag.
  const scorecard: ScorecardDim[] = [];
  const scSec = find(SEC.scorecard);
  if (scSec) {
    for (const t of tables(scSec.body))
      for (const row of t.slice(1)) {
        const [name, scoreCell, basis] = [row[0] ?? "", row[1] ?? "", row[2] ?? ""];
        const dimension = RUBRIC_NAME_MAP[name.trim().toLowerCase()];
        if (!dimension) {
          diagnostics.push(
            warn("dimension_unmapped", `scorecard row "${name}" is not a mapped dimension`),
          );
          continue;
        }
        const cites = [
          ...new Set(
            [...basis.matchAll(CITE_RE)].flatMap((x) =>
              (x[1] ?? "")
                .split(/\s*(?:,|and|&)\s*/)
                .map((n) => parseInt(n, 10))
                .filter(Number.isFinite),
            ),
          ),
        ];
        scorecard.push({
          dimension,
          score: Number(scoreCell.trim()),
          basis: basis.trim(),
          capped: CAP_RE.test(basis),
          cites,
        });
      }
  } else diagnostics.push(warn("no_scorecard", "letter carries no `## Scorecard` table"));

  return {
    verdict,
    oneThing,
    strengths,
    majors,
    minors,
    lineNotes,
    considered,
    roadmap,
    scorecard,
    diagnostics,
  };
}
