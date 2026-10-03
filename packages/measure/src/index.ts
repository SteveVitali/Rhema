// @rhema/measure — Deterministic TS prose metrics (P1.14; §9.4 Voice measures; REQ-PERSONA-6/8/9).
//
// The feature set the persona skill's voice-print table names (sentence-length distribution,
// paragraph length, per-1,000-word feature rates incl. em-dash, apparatus, sentence openings,
// type-token ratio), computed in pure TS with no model calls and no randomness: the same text
// always produces the same numbers. Two consumers: the calibration comparison table on the
// voice detail page's Profile tab (target / prediction / real within-one-band rows), and the
// Assistant's `measure` tool (P1.11's preparatory tool — the service, never a run).
//
// Deliberately simple segmentation — deterministic beats clever here: paragraphs split on blank
// lines, sentences on terminal punctuation followed by whitespace or end-of-text, words on a
// conservative token regex. The contract (`@rhema/contracts` `domain/measure`) owns the shape;
// this module owns the counting.

import {
  withinOneBand,
  type CorpusMeasures,
  type Distribution,
  type MeasureFeature,
  type ProseMeasures,
  type VoiceMeasureRow,
} from "@rhema/contracts";

// The measure contract shapes are this package's surface — consumers (the API's calibration table,
// the assistant's measure tool) import them from here, not from contracts directly.
export type { CorpusMeasures, Distribution, MeasureFeature, ProseMeasures, VoiceMeasureRow } from "@rhema/contracts";
export { withinOneBand } from "@rhema/contracts";

const WORD_RE = /[A-Za-zÀ-ÖØ-öø-ÿ0-9]+(?:['’-][A-Za-zÀ-ÖØ-öø-ÿ0-9]+)*/g;

const FIRST_PERSON = new Set(["i", "me", "my", "mine", "we", "us", "our", "ours"]);
const SECOND_PERSON = new Set(["you", "your", "yours", "yourself", "yourselves"]);
const OPENING_CONJUNCTIONS = new Set(["and", "but", "so", "yet", "or", "nor", "for"]);
const OPENING_SUBORDINATES = new Set([
  "because", "although", "though", "while", "if", "when", "since", "after", "before",
  "unless", "until", "as", "whereas", "once", "whether", "despite", "given",
]);

function words(text: string): string[] {
  return text.match(WORD_RE) ?? [];
}

/** Paragraphs: non-empty blocks split on blank lines (≥1 empty line), markdown-resilient. */
export function paragraphs(text: string): string[] {
  return text
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p !== "");
}

/**
 * Sentences: split on terminal punctuation (. ! ? …) followed by whitespace or end of text.
 * Markdown syntax (headers, list markers, footnote refs) is stripped first so a `# Heading` line
 * or `- item` bullet counts as prose, not apparatus noise; abbreviation-free input is assumed —
 * the measure is a deterministic surface statistic, not an NLP model.
 */
export function sentences(text: string): string[] {
  const cleaned = text
    // ATX headers keep their text but terminate the segment — a heading is not part of the
    // sentence that follows it.
    .replace(/^\s*#{1,6}\s+([^\n.!?]*)$/gm, (_m, t: string) => `${t}.`)
    .replace(/^\s*[-*+]\s+/gm, "") // unordered list markers
    .replace(/^\s*\d+\.\s+/gm, "") // ordered list markers
    .replace(/^\s*>\s?/gm, "") // blockquote markers
    .replace(/\[\^[^\]]+\]/g, "") // footnote references/definitions
    .replace(/!?\[[^\]]*\]\([^)]*\)/g, "") // links/images → drop
    .replace(/\|/g, " "); // table pipes
  const out: string[] = [];
  let buf = "";
  for (let i = 0; i < cleaned.length; i++) {
    const ch = cleaned[i];
    buf += ch;
    if ((ch === "." || ch === "!" || ch === "?" || ch === "…") && /[\s\n]|$/.test(cleaned[i + 1] ?? "")) {
      // A '.' inside a number ("3.5") or an ellipsis "..." is not a terminator.
      if (ch === "." && /\d$/.test(buf.slice(0, -1).trimEnd()) && /\d/.test(cleaned[i + 1] ?? "")) continue;
      if (ch === "." && cleaned[i - 1] === "." ) { buf = buf.trim(); if (buf) { out.push(buf); buf = ""; } continue; }
      const s = buf.trim();
      if (s !== "") out.push(s);
      buf = "";
    }
  }
  const tail = buf.trim();
  if (tail !== "") out.push(tail);
  return out;
}

/** Percentile with linear interpolation (the type-7 method); deterministic on sorted input. */
function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  if (sorted.length === 1) return sorted[0]!;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo]!;
  const a = sorted[lo]!;
  return a + (sorted[hi]! - a) * (idx - lo);
}

function distribution(values: readonly number[]): Distribution {
  if (values.length === 0) return { median: 0, q1: 0, q3: 0, min: 0, max: 0, mean: 0 };
  const sorted = [...values].sort((a, b) => a - b);
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return {
    median: percentile(sorted, 0.5),
    q1: percentile(sorted, 0.25),
    q3: percentile(sorted, 0.75),
    min: sorted[0]!,
    max: sorted[sorted.length - 1]!,
    mean,
  };
}

const per1k = (count: number, wordCount: number): number =>
  wordCount > 0 ? (count / wordCount) * 1000 : 0;

/** Count occurrences of any of `chars` in `text`. */
function countChars(text: string, chars: readonly string[]): number {
  let n = 0;
  for (const ch of text) if (chars.includes(ch)) n += 1;
  return n;
}

/** Markdown apparatus counts for one piece (headers, list items, table rows, footnote defs). */
function apparatus(text: string): { headers: number; lists: number; tables: number; footnotes: number } {
  let headers = 0;
  let lists = 0;
  let tables = 0;
  let footnotes = 0;
  for (const line of text.split("\n")) {
    const t = line.trim();
    if (/^#{1,6}\s/.test(t)) headers += 1;
    else if (/^([-*+]|\d+\.)\s/.test(t)) lists += 1;
    else if (/^\|.*\|\s*$/.test(t)) tables += 1;
    else if (/^\[\^[^\]]+\]:/.test(t)) footnotes += 1;
  }
  return { headers, lists, tables, footnotes };
}

/** Sentence-opening classification (subject-first / conjunction / subordinate / it-there / other). */
function openings(sentences: readonly string[]): {
  subjectFirst: number;
  conjunction: number;
  subordinate: number;
  itThere: number;
  other: number;
} {
  const counts = { subjectFirst: 0, conjunction: 0, subordinate: 0, itThere: 0, other: 0 };
  if (sentences.length === 0) return counts;
  for (const s of sentences) {
    const first = (words(s)[0] ?? "").toLowerCase();
    if (first === "") {
      counts.other += 1;
    } else if (first === "it" || first === "there") {
      counts.itThere += 1;
    } else if (OPENING_CONJUNCTIONS.has(first)) {
      counts.conjunction += 1;
    } else if (OPENING_SUBORDINATES.has(first)) {
      counts.subordinate += 1;
    } else if (/^[0-9"'“‘([]/.test(s.trim())) {
      counts.other += 1;
    } else {
      counts.subjectFirst += 1;
    }
  }
  const n = sentences.length;
  return {
    subjectFirst: counts.subjectFirst / n,
    conjunction: counts.conjunction / n,
    subordinate: counts.subordinate / n,
    itThere: counts.itThere / n,
    other: counts.other / n,
  };
}

/** Markdown sections: chunks split on ATX headers (a header opens a new section). */
function sectionWordCounts(text: string): number[] {
  const chunks: string[] = [];
  let buf: string[] = [];
  let seenHeader = false;
  for (const line of text.split("\n")) {
    if (/^\s*#{1,6}\s/.test(line)) {
      if (seenHeader) {
        chunks.push(buf.join("\n"));
        buf = [];
      }
      seenHeader = true;
    }
    buf.push(line);
  }
  if (seenHeader) chunks.push(buf.join("\n"));
  return chunks.map((c) => words(c).length);
}

/**
 * Measure one piece of prose. Deterministic: same `text` ⇒ byte-identical result. Markdown
 * apparatus is counted as apparatus and excluded from sentence stats where it would skew them
 * (headers keep their text; list items count as prose lines).
 */
export function measureProse(text: string): ProseMeasures {
  const ws = words(text);
  const wordCount = ws.length;
  const sents = sentences(text);
  const paras = paragraphs(text);
  const sentLengths = sents.map((s) => words(s).length);
  const paraLengths = paras.map((p) => sentences(p).length);

  let firstPerson = 0;
  let secondPerson = 0;
  const types = new Set<string>();
  for (const w of ws) {
    const lw = w.toLowerCase();
    types.add(lw);
    if (FIRST_PERSON.has(lw)) firstPerson += 1;
    if (SECOND_PERSON.has(lw)) secondPerson += 1;
  }

  const questions = sents.filter((s) => s.trimEnd().endsWith("?")).length;
  const emDash = countChars(text, ["—"]) + (text.match(/--/g)?.length ?? 0);
  const colonSemicolon = countChars(text, [":", ";"]);
  const parentheses = countChars(text, ["(", ")"]);
  const quotationMarks = countChars(text, ["\"", "“", "”", "„", "«", "»"]);
  const app = apparatus(text);
  const sections = sectionWordCounts(text);

  return {
    words: wordCount,
    sentences: sents.length,
    paragraphs: paras.length,
    sentenceLength: distribution(sentLengths),
    paragraphSentences: distribution(paraLengths),
    oneSentenceParagraphShare: paras.length > 0 ? paraLengths.filter((n) => n === 1).length / paras.length : 0,
    sectionWordsMedian: distribution(sections).median,
    sectionsCount: sections.length,
    rates: {
      firstPerson: per1k(firstPerson, wordCount),
      secondPerson: per1k(secondPerson, wordCount),
      questions: per1k(questions, wordCount),
      emDash: per1k(emDash, wordCount),
      colonSemicolon: per1k(colonSemicolon, wordCount),
      parentheses: per1k(parentheses, wordCount),
      quotationMarks: per1k(quotationMarks, wordCount),
    },
    apparatus: app,
    openings: openings(sents),
    typeTokenRatio: wordCount > 0 ? types.size / wordCount : 0,
  };
}

/**
 * Measure a corpus: the concatenated corpus measures plus each piece's own measures and the
 * piece-length distribution (the Profile tab's "ranges beside means" rows). Corpus measures
 * are computed over the joined text so rates/distributions are corpus-true, not piece-averaged.
 */
export function measureCorpus(pieces: readonly string[]): CorpusMeasures {
  const measured = pieces.map((p) => measureProse(p));
  return {
    corpus: measureProse(pieces.join("\n\n")),
    pieces: measured,
    pieceLength: distribution(measured.map((m) => m.words)),
  };
}

// ---------------------------------------------------------------------------- the calibration table

/** Pull a `MeasureFeature`'s numeric value out of a `ProseMeasures`. */
export function featureValue(m: ProseMeasures, feature: MeasureFeature): number {
  switch (feature) {
    case "sentence_length_median":
      return m.sentenceLength.median;
    case "paragraph_sentences_median":
      return m.paragraphSentences.median;
    case "first_person_per_1k":
      return m.rates.firstPerson;
    case "second_person_per_1k":
      return m.rates.secondPerson;
    case "questions_per_1k":
      return m.rates.questions;
    case "em_dash_per_1k":
      return m.rates.emDash;
    case "colon_semicolon_per_1k":
      return m.rates.colonSemicolon;
    case "parentheses_per_1k":
      return m.rates.parentheses;
    case "type_token_ratio":
      return m.typeTokenRatio;
  }
}

/**
 * Build the calibration comparison rows (§9.4 "Measured, side by side — N of 14 within one
 * band"): for every measured feature, the profile target, the prediction's value (when a
 * prediction was measured), the hold-out's real value, and the within-band verdict per
 * `MEASURE_BANDS`. The rows feed the Profile tab's table AND the `tested-badly-off` fold
 * (`calibrationVerdict`) at finalize.
 */
export function calibrationRows(
  target: ProseMeasures,
  prediction: ProseMeasures | null,
  actual: ProseMeasures,
): VoiceMeasureRow[] {
  return (
    [
      "sentence_length_median",
      "paragraph_sentences_median",
      "first_person_per_1k",
      "second_person_per_1k",
      "questions_per_1k",
      "em_dash_per_1k",
      "colon_semicolon_per_1k",
      "parentheses_per_1k",
      "type_token_ratio",
    ] as const
  ).map((feature) => {
    const t = featureValue(target, feature);
    const a = featureValue(actual, feature);
    return {
      feature,
      target: t,
      prediction: prediction ? featureValue(prediction, feature) : null,
      actual: a,
      withinBand: withinOneBand(feature, t, a),
    };
  });
}

export const PACKAGE_NAME = "@rhema/measure" as const;

/** Marker export so the package's identity is importable (kept from the skeleton). */
export function packageInfo(): { name: string } {
  return { name: PACKAGE_NAME };
}
