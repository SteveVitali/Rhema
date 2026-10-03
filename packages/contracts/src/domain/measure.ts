import { z } from "zod";

// The prose-measurement contract (§9.4 Voice measures; REQ-PERSONA-6/8/9). `@rhema/measure` is the
// deterministic service that emits these shapes — pure TS, no model calls, same text ⇒ same numbers —
// and this schema is what the calibration comparison table ("10 of 14 measures within one band") and
// the Profile tab's Voice-measures section render. The feature set mirrors the persona skill's
// voice-print measured-features table (`bootstrap-persona/references/voice-print.md` §1.1): every
// feature the profile names has a field here, and the calibration verdict compares prediction vs
// real on exactly these numbers.

/** A distribution summary: median + quartiles + extremes (the "median, IQR, max" recording form). */
export const distributionSchema = z.object({
  median: z.number(),
  q1: z.number(),
  q3: z.number(),
  min: z.number(),
  max: z.number(),
  mean: z.number(),
});
export type Distribution = z.infer<typeof distributionSchema>;

/** Per-1,000-words rates for the counted surface features (first person, em-dash, …). */
export const measureRatesSchema = z.object({
  firstPerson: z.number().nonnegative(),
  secondPerson: z.number().nonnegative(),
  questions: z.number().nonnegative(),
  emDash: z.number().nonnegative(),
  colonSemicolon: z.number().nonnegative(),
  parentheses: z.number().nonnegative(),
  quotationMarks: z.number().nonnegative(),
});
export type MeasureRates = z.infer<typeof measureRatesSchema>;

/** Markdown apparatus counts, per piece (headers, lists, tables, footnotes — §1.1's apparatus row). */
export const measureApparatusSchema = z.object({
  headers: z.number().nonnegative(),
  lists: z.number().nonnegative(),
  tables: z.number().nonnegative(),
  footnotes: z.number().nonnegative(),
});
export type MeasureApparatus = z.infer<typeof measureApparatusSchema>;

/** The sentence-opening distribution (shares summing to 1 — subject-first, conjunction, …). */
export const sentenceOpeningsSchema = z.object({
  subjectFirst: z.number().nonnegative(),
  conjunction: z.number().nonnegative(),
  subordinate: z.number().nonnegative(),
  itThere: z.number().nonnegative(),
  other: z.number().nonnegative(),
});
export type SentenceOpenings = z.infer<typeof sentenceOpeningsSchema>;

/** One piece's (or one corpus's) full measured feature set. */
export const proseMeasuresSchema = z.object({
  /** the text extent these measures were computed over. */
  words: z.number().nonnegative(),
  sentences: z.number().nonnegative(),
  paragraphs: z.number().nonnegative(),
  /** sentence length in words: median/IQR/max + mean (the profile's headline row). */
  sentenceLength: distributionSchema,
  /** paragraph length in sentences + the one-sentence-paragraph share (0–1). */
  paragraphSentences: distributionSchema,
  oneSentenceParagraphShare: z.number().nonnegative(),
  /** markdown-section stats: median words per section and sections per piece (0 when unheaded). */
  sectionWordsMedian: z.number().nonnegative(),
  sectionsCount: z.number().nonnegative(),
  /** the per-1,000-words feature rates. */
  rates: measureRatesSchema,
  /** apparatus counts (per piece when measured on one piece). */
  apparatus: measureApparatusSchema,
  /** sentence-opening form distribution (shares). */
  openings: sentenceOpeningsSchema,
  /** lexical: type-token ratio over the piece (unique words / total words). */
  typeTokenRatio: z.number().nonnegative(),
});
export type ProseMeasures = z.infer<typeof proseMeasuresSchema>;

/** A corpus's aggregate: the corpus-level measures + each piece's own (the ranges beside the means). */
export const corpusMeasuresSchema = z.object({
  corpus: proseMeasuresSchema,
  pieces: z.array(proseMeasuresSchema),
  /** median + range of piece lengths in words (the "Piece length — median and range" row). */
  pieceLength: distributionSchema,
});
export type CorpusMeasures = z.infer<typeof corpusMeasuresSchema>;

// ---------------------------------------------------------------------------- the calibration table

/** The measured features a calibration row can compare (the table's Feature column). */
export const MEASURE_FEATURES = [
  "sentence_length_median",
  "paragraph_sentences_median",
  "first_person_per_1k",
  "second_person_per_1k",
  "questions_per_1k",
  "em_dash_per_1k",
  "colon_semicolon_per_1k",
  "parentheses_per_1k",
  "type_token_ratio",
] as const;
export type MeasureFeature = (typeof MEASURE_FEATURES)[number];

/**
 * "Within one band" — the §16.3 #10 comparison tolerance per feature (resolved P1.14: a relative
 * band of ±25% around the profile target, floored at the feature's absolute step so tiny targets
 * still admit a real band). A feature whose |actual − target| ≤ the band counts toward the
 * "N of 14 within one band" line; the whole-profile `tested-badly-off` verdict fires when fewer
 * than half the compared features land in band OR the blind check picked the prediction.
 */
export const MEASURE_BANDS: Readonly<Record<MeasureFeature, { relative: number; floor: number }>> = {
  sentence_length_median: { relative: 0.25, floor: 3 },
  paragraph_sentences_median: { relative: 0.25, floor: 1 },
  first_person_per_1k: { relative: 0.5, floor: 0.5 },
  second_person_per_1k: { relative: 0.5, floor: 0.5 },
  questions_per_1k: { relative: 0.5, floor: 0.5 },
  em_dash_per_1k: { relative: 0.5, floor: 1 },
  colon_semicolon_per_1k: { relative: 0.5, floor: 1 },
  parentheses_per_1k: { relative: 0.5, floor: 0.5 },
  type_token_ratio: { relative: 0.1, floor: 0.03 },
};

/** True when the real value lands within one band of the profile target. */
export function withinOneBand(feature: MeasureFeature, target: number, actual: number): boolean {
  const band = Math.max(MEASURE_BANDS[feature].floor, Math.abs(target) * MEASURE_BANDS[feature].relative);
  return Math.abs(actual - target) <= band;
}

/** One row of the calibration comparison table (§9.4): target / prediction / real / verdict. */
export const voiceMeasureRowSchema = z.object({
  feature: z.enum(MEASURE_FEATURES),
  target: z.number(),
  prediction: z.number().nullable(),
  actual: z.number(),
  withinBand: z.boolean(),
});
export type VoiceMeasureRow = z.infer<typeof voiceMeasureRowSchema>;

/** The calibration verdict folded onto `persona_profiles.calibration_status` (§16.3 #10, P1.14). */
export const CALIBRATION_STATUSES = ["tested", "untested", "tested-badly-off", "pending"] as const;
export type CalibrationStatus = (typeof CALIBRATION_STATUSES)[number];

/**
 * The §16.3 #10 resolution (P1.14, recorded in the run ledger): `badly_off` iff fewer than half of
 * the compared features are within one band, OR the blind check picked the prediction as the
 * author's. `blindCheckPickedPrediction` is the calibration report's recorded blind-check verdict.
 */
export function calibrationVerdict(args: {
  readonly rows: readonly { readonly withinBand: boolean }[];
  readonly blindCheckPickedPrediction?: boolean;
}): "tested" | "tested-badly-off" {
  if (args.blindCheckPickedPrediction === true) return "tested-badly-off";
  if (args.rows.length === 0) return "tested";
  const within = args.rows.filter((r) => r.withinBand).length;
  return within * 2 < args.rows.length ? "tested-badly-off" : "tested";
}
