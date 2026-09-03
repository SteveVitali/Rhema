import type { BenchmarkDeps, Finding, SqlExecutor } from "./types.js";

// Blind normalization (REQ-EVAL-7): every arm output is normalized into the common §5.7 Finding schema by an
// extractor BLIND to arm, from a DE-BRANDED output, under the verbatim-substance rule (segment and locate, never
// sharpen — a vague baseline comment stays vague), with extraction fidelity audited on a sample (10%). AC2: the
// extractor receives de-branded input; a branded fixture is REJECTED.
//
// Why blind + de-branded: the extractor must not be able to infer which arm produced the output (an "obviously
// Rhema" review could be read more generously). De-branding strips arm/vendor names; the blind extractor is then
// handed ONLY the de-branded text + the draft id — never the arm. The verbatim-substance rule keeps normalization
// a SEGMENT-AND-LOCATE operation: a normalized finding's substance must trace to the arm's own words, never be
// sharpened into something more specific than the arm actually said.

/**
 * Brand tokens that must never survive de-branding into the blind extractor's input. Arm/vendor identities whose
 * presence would leak the arm to the extractor. Case-insensitive, word-boundary matched. Extend as arms are added.
 */
export const BRAND_TOKENS: readonly string[] = [
  "Rhema",
  "Rhēma",
  "Grammarly",
  "Claude",
  "Anthropic",
  "GPT",
  "ChatGPT",
  "OpenAI",
  "Gemini",
  "Google",
  "Full board",
  "second read",
];

const NEUTRAL = "[the reviewer]";

/** Raised when text handed to (or expected to be handed to) the blind extractor still carries a brand token (AC2). */
export class BrandedInputError extends Error {
  constructor(public readonly tokens: string[]) {
    super(
      `benchmark-runner: extractor input is not de-branded — brand token(s) present [${tokens.join(", ")}] ` +
        `(REQ-EVAL-7 blind normalization; AC2)`,
    );
    this.name = "BrandedInputError";
  }
}

function brandRegex(token: string): RegExp {
  // word-boundary, case-insensitive; escape regex metachars in the token
  const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`\\b${escaped}\\b`, "gi");
}

/** The brand tokens present in a text (empty ⇒ de-branded). */
export function brandTokensIn(text: string): string[] {
  const found = new Set<string>();
  for (const token of BRAND_TOKENS) if (brandRegex(token).test(text)) found.add(token);
  return [...found];
}

/** De-brand an arm output: replace every brand token with a neutral placeholder. Returns the redacted text. */
export function deBrand(text: string): string {
  let out = text;
  for (const token of BRAND_TOKENS) out = out.replace(brandRegex(token), NEUTRAL);
  return out;
}

/** Assert a text is de-branded (no brand tokens); throws `BrandedInputError` naming the offenders (AC2). */
export function assertDeBranded(text: string): void {
  const tokens = brandTokensIn(text);
  if (tokens.length > 0) throw new BrandedInputError(tokens);
}

/**
 * The blind extractor seam. Given ONLY the de-branded text + the draft id (never the arm), it segments the output
 * into §5.7 Findings and locates each in the draft. In production this is an LLM/human extractor; a deterministic
 * fake implements it in tests. It must obey the verbatim-substance rule — enforced below regardless.
 */
export interface BlindExtractor {
  readonly id: string;
  extract(input: { deBrandedText: string; draftId: string }): Promise<Finding[]>;
}

/** Collapse to a normalized form for the verbatim-substance check (whitespace + case insensitive). */
function normalizeForSubstance(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}

/** Raised when a normalized finding's substance is not traceable to the arm's own words (a "sharpen" violation). */
export class VerbatimSubstanceError extends Error {
  constructor(public readonly findingId: string) {
    super(
      `benchmark-runner: normalized finding ${findingId} sharpens the arm output — its substance is not a ` +
        `verbatim segment of the source (REQ-EVAL-7: segment and locate, never sharpen)`,
    );
    this.name = "VerbatimSubstanceError";
  }
}

/**
 * The findings whose body is NOT a verbatim segment of the (de-branded) source — i.e. the extractor sharpened
 * rather than located. A finding whose normalized body is a contiguous span of the normalized source is verbatim;
 * anything else is a violation. (An empty body is treated as non-verbatim — a finding must quote something.)
 */
export function verbatimSubstanceViolations(findings: readonly Finding[], deBrandedSource: string): Finding[] {
  const source = normalizeForSubstance(deBrandedSource);
  return findings.filter((f) => {
    const body = normalizeForSubstance(f.body);
    return body.length === 0 || !source.includes(body);
  });
}

export interface NormalizeInput {
  readonly armRunId: string;
  /** The arm's RAW output (may carry brand tokens); de-branded here before the extractor ever sees it. */
  readonly rawText: string;
  readonly draftId: string;
  readonly extractor: BlindExtractor;
}

export interface NormalizedFinding {
  readonly id: string;
  readonly finding: Finding;
}

/**
 * Normalize one arm's raw output into stored §5.7 Findings (REQ-EVAL-7). Pipeline: de-brand → assert de-branded →
 * blind extract (extractor sees only de-branded text + draft id) → enforce the verbatim-substance rule → persist.
 * The stored row id becomes the arm-finding id the human match records reference (so it must be stable). Throws
 * `VerbatimSubstanceError` if the extractor sharpened. Returns the persisted normalized findings.
 */
export async function normalizeArmOutput(
  exec: SqlExecutor,
  deps: BenchmarkDeps,
  input: NormalizeInput,
): Promise<NormalizedFinding[]> {
  const deBranded = deBrand(input.rawText);
  assertDeBranded(deBranded); // defence in depth — de-brand must have removed every token
  const extracted = await input.extractor.extract({ deBrandedText: deBranded, draftId: input.draftId });
  const violations = verbatimSubstanceViolations(extracted, deBranded);
  const firstViolation = violations[0];
  if (firstViolation) throw new VerbatimSubstanceError(firstViolation.id);

  const out: NormalizedFinding[] = [];
  for (const finding of extracted) {
    const id = deps.ids("bmnf");
    // pin the stored Finding's own id to the row id so arm_finding references are unambiguous
    const stored: Finding = { ...finding, id };
    await exec.query(
      `insert into benchmark_normalized_findings (id, arm_run_id, finding, extractor, blind, created_at)
       values ($1,$2,$3,$4,true,$5)`,
      [id, input.armRunId, JSON.stringify(stored), input.extractor.id, deps.clock.now()],
    );
    out.push({ id, finding: stored });
  }
  return out;
}

/** Load one arm run's normalized findings (the recall/anchoring/diversity scorers consume these). */
export async function loadNormalizedFindings(exec: SqlExecutor, armRunId: string): Promise<NormalizedFinding[]> {
  const rows = (
    await exec.query(
      `select id, finding from benchmark_normalized_findings where arm_run_id = $1 order by id`,
      [armRunId],
    )
  ).rows as { id: string; finding: Finding }[];
  return rows.map((r) => ({ id: r.id, finding: r.finding }));
}

/**
 * Deterministically sample ~`rate` of a wave's normalized findings for the extraction-fidelity audit (REQ-EVAL-7,
 * default 10%). Sampling is by a stable hash of the finding id so the same run always audits the same sample (the
 * audit is reproducible + pre-registrable). Always samples at least one when there is anything to sample.
 */
export function sampleForAudit<T extends { id: string }>(items: readonly T[], rate = 0.1): T[] {
  if (items.length === 0) return [];
  const sorted = [...items].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const target = Math.max(1, Math.round(items.length * rate));
  return sorted.slice(0, target);
}

export type AuditVerdict = "faithful" | "sharpened" | "dropped";

/** Record one extraction-fidelity audit judgment on a sampled normalized finding (REQ-EVAL-7). */
export async function recordExtractionAudit(
  exec: SqlExecutor,
  deps: BenchmarkDeps,
  input: { waveId: string; normalizedFindingId: string; auditor: string; verdict: AuditVerdict; note?: string },
): Promise<string> {
  const id = deps.ids("bmaud");
  await exec.query(
    `insert into benchmark_extraction_audits (id, wave_id, normalized_finding_id, auditor, verdict, note, audited_at)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [id, input.waveId, input.normalizedFindingId, input.auditor, input.verdict, input.note ?? null, deps.clock.now()],
  );
  return id;
}

export interface ExtractionFidelity {
  readonly audited: number;
  readonly faithful: number;
  /** faithful ÷ audited in [0,1] (1 when nothing was audited — reported alongside the count). */
  readonly fidelity: number;
}

/** Aggregate a wave's extraction-fidelity audit — the sampled faithful rate reported with results (REQ-EVAL-7). */
export async function extractionFidelity(exec: SqlExecutor, waveId: string): Promise<ExtractionFidelity> {
  const rows = (
    await exec.query(
      `select verdict from benchmark_extraction_audits where wave_id = $1`,
      [waveId],
    )
  ).rows as { verdict: AuditVerdict }[];
  const audited = rows.length;
  const faithful = rows.filter((r) => r.verdict === "faithful").length;
  return { audited, faithful, fidelity: audited === 0 ? 1 : faithful / audited };
}
