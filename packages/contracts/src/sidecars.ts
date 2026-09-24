import { z } from "zod";
import { isoSchema, urlSchema } from "./ids.js";
import {
  dispositionKindSchema,
  dispositionStatusSchema,
  CLAIM_VERDICTS,
  CLAIM_KINDS,
  CLAIM_SOURCE_CHECKS,
  SEVERITIES,
  FINDING_KINDS,
  RUBRIC_DIMENSIONS,
} from "./enums.js";
import { anchorSchema } from "./domain/anchor.js";
import { claimSourceSchema } from "./domain/claims.js";
import { FINDING_ORIGIN, FINDING_RECONCILIATION, LETTER_SECTIONS } from "./domain/findings.js";

// The six structured-output sidecar schemas (REQ-SPEC-12). Each is the machine-readable twin of a markdown
// deliverable, emitted by the ported skill and validated at commit; the rows come from the sidecar, and a
// markdown↔sidecar mismatch is a validation failure (P0.04 owns the parsers; P0.02 owns only these SCHEMAS).
// A sidecar carries the SKILL's output — no server-assigned ULIDs (the parser assigns ids at insert), so the
// row schemas here are the field subset the skill produces. Every anchor-bearing sidecar embeds `anchorSchema`
// (§11.3 Anchor) VERBATIM (REQ-OBJ-16); the structural-sidecar contract test enforces that.

/**
 * An LLM-tolerant enum for a SIDECAR field (P0.15h, diagnosed live). The sidecar is the skill's structured
 * twin, but the review protocol's human-facing vocabulary is Title Case with spaces ("Contradicted",
 * "Substantially accurate", "Second read"), while the canonical enum is snake_case ("contradicted",
 * "substantially_accurate", "second_read") — so a faithfully-authored ledger's verdicts failed
 * `sidecar_validates` at commit and blocked the phase (D-P0.15h-1). Coerce a string to its canonical enum form
 * (lowercase, spaces/hyphens/slashes → `_`) BEFORE validating; a canonical value passes through unchanged, and
 * anything that does not canonicalize to a member is left as-is so the enum still REJECTS a genuinely wrong
 * value (never masks a real error). Applied only to the LLM-authored sidecar fields — the strict `z.enum`
 * schemas stay strict for machine-authored events / DB writes.
 */
const canon = (s: string) => s.trim().toLowerCase().replace(/[\s\-/]+/g, "_");
function coercedEnum<const T extends readonly [string, ...string[]]>(values: T) {
  const members = new Set<string>(values);
  return z.preprocess((v) => (typeof v === "string" && members.has(canon(v)) ? canon(v) : v), z.enum(values));
}

/**
 * LLM-tolerant numeric literal (same rationale as `coercedEnum`, P0.15h): the skill authors a sidecar by hand,
 * so a `tier`/`score`/`version` field routinely arrives as the STRING "1" rather than the number 1 and failed
 * `sidecar_validates` at commit. Coerce a numeric string to its number BEFORE the literal-union check; a real
 * number passes through, and a non-numeric string is left as-is so the union still REJECTS a genuinely wrong
 * value. Applied only to the LLM-authored sidecar fields.
 */
const coerceNum = (v: unknown) =>
  typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v)) ? Number(v) : v;
const tierField = z.preprocess(coerceNum, z.union([z.literal(1), z.literal(2), z.literal(3)]));
const scoreField = z.preprocess(
  coerceNum,
  z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
);
const capAtField = z.preprocess(
  coerceNum,
  z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4)]),
);

/**
 * Shared header on every sidecar: a version and the sidecar kind, so the parser dispatches on data, not path.
 * Both fields are LLM-tolerant (P0.15h): `sidecar` canonicalizes ("claim-ledger" → "claim_ledger") and `version`
 * coerces the string "1" → 1, so a faithfully-authored-but-loosely-typed envelope still validates.
 */
const envelope = <K extends string>(kind: K) =>
  z.object({
    sidecar: z.preprocess((v) => (typeof v === "string" && canon(v) === kind ? kind : v), z.literal(kind)),
    version: z.preprocess(coerceNum, z.literal(1)),
  });

// ---- findings.json (the object the Margin/triage/rubric/what-changed depend on) ----
export const findingRowSchema = z.object({
  ordinal: z.number().int().nonnegative(),
  kind: coercedEnum(FINDING_KINDS),
  severity: coercedEnum(SEVERITIES), // emitted explicitly, never inferred from prose (REQ-SPEC-4)
  origin: coercedEnum(FINDING_ORIGIN.options),
  reconciliation: coercedEnum(FINDING_RECONCILIATION.options).optional(),
  anchor: anchorSchema.nullable(), // §11.3 Anchor verbatim
  title: z.string(),
  body: z.string().max(4096),
  evidence: z
    .object({
      verdict: coercedEnum(CLAIM_VERDICTS).optional(),
      urls: z.array(z.object({ url: urlSchema, accessed: isoSchema })).default([]),
    })
    .optional(),
  suggestion: z.object({ replacement: z.string() }).optional(),
  rubricDims: z.array(coercedEnum(RUBRIC_DIMENSIONS)).default([]),
  letterSection: coercedEnum(LETTER_SECTIONS.options).optional(),
  /** a re-review declares which open obligation this finding carries (lineage matcher 2 — REQ-OBJ-4). */
  carriesObligationId: z.string().optional(),
});
export const findingsSidecarSchema = envelope("findings").extend({
  findings: z.array(findingRowSchema),
  /**
   * The Editor's own carried/closed/new obligation tally on a re-review (REQ-WF-7 amended). The orchestrator
   * computes the authoritative counts from obligation rows at delivery and RECONCILES against this — a mismatch
   * is a delivery-validation warning, never a failure (§11.7; P0.12 `reconcileCounts`).
   */
  obligationCounts: z
    .object({
      carried: z.number().int().nonnegative(),
      closed: z.number().int().nonnegative(),
      new: z.number().int().nonnegative(),
    })
    .optional(),
});
export type FindingsSidecar = z.infer<typeof findingsSidecarSchema>;

// ---- 01-claim-ledger.json ----
export const claimRowSchema = z.object({
  ordinal: z.number().int().nonnegative(),
  text: z.string(),
  tier: tierField,
  verdict: coercedEnum(CLAIM_VERDICTS),
  kind: coercedEnum(CLAIM_KINDS).optional(),
  url: urlSchema.optional(),
  normalizedUrl: z.string().optional(),
  accessedAt: isoSchema.optional(),
  note: z.string().optional(),
  sources: z.array(claimSourceSchema).optional(),
  sourceCheck: coercedEnum(CLAIM_SOURCE_CHECKS).optional(),
  anchor: anchorSchema.optional(), // §11.3 Anchor verbatim
  humanAdded: z.boolean().default(false),
});
export const claimLedgerSidecarSchema = envelope("claim_ledger").extend({
  claims: z.array(claimRowSchema),
});
export type ClaimLedgerSidecar = z.infer<typeof claimLedgerSidecarSchema>;

// ---- rubric.json (eight dimensions, 1–5, entailment caps; NEVER an aggregate — REQ-IDE-30) ----
export const rubricRowSchema = z.object({
  dimension: coercedEnum(RUBRIC_DIMENSIONS),
  score: scoreField,
  cap: z
    .object({
      at: capAtField,
      reason: z.string(),
      entailedByFindingOrdinal: z.number().int().nonnegative().optional(),
    })
    .optional(),
});
export const rubricSidecarSchema = envelope("rubric").extend({
  dimensions: z.array(rubricRowSchema),
  /** protocols may swap at most one dimension and add at most one (§6.7). */
  swaps: z.array(z.object({ from: z.string(), to: coercedEnum(RUBRIC_DIMENSIONS) })).optional(),
});
export type RubricSidecar = z.infer<typeof rubricSidecarSchema>;

// ---- structure-plan.json (the Drafter's plan; structured fields the user edits at Approve plan) ----
export const structureSectionSchema = z.object({
  ref: z.string(),
  title: z.string(),
  targetWords: z.number().int().nonnegative().optional(),
  purpose: z.string().optional(),
  anchor: anchorSchema.optional(), // §11.3 Anchor verbatim (when the plan reverse-outlines an existing draft)
});
export const structurePlanSidecarSchema = envelope("structure_plan").extend({
  /** the spine: claims the piece must establish, in order (§7.3). */
  spine: z.array(z.string()).default([]),
  sections: z.array(structureSectionSchema),
  alternativesConsidered: z.array(z.string()).optional(),
  gaps: z.array(z.string()).optional(),
});
export type StructurePlanSidecar = z.infer<typeof structurePlanSidecarSchema>;

// ---- response-ledger.json (parsed into finding + disposition rows; frozen at delivery) ----
export const responseLedgerEntrySchema = z.object({
  /** which review finding this responds to (by that review's finding ordinal). */
  findingOrdinal: z.number().int().nonnegative(),
  disposition: z.object({
    kind: dispositionKindSchema,
    status: dispositionStatusSchema,
    rationale: z.string().optional(), // required for rebut/escalate at the row layer above
    adaptedText: z.string().optional(),
    moveOrdinal: z.number().int().optional(),
    applied: z.boolean().optional(),
    /** PRB.05 — rows the human wrote at the gate or in pre-triage carry `actor: "user"`
     *  (REQ-SPEC-9; REQ-IDE-28: the run may add rows but never overrides them). */
    actor: z.enum(["user", "drafter"]).optional(),
  }),
  anchor: anchorSchema.optional(), // §11.3 Anchor verbatim (the move's location in v(N+1))
});
export type ResponseLedgerEntry = z.infer<typeof responseLedgerEntrySchema>;
/**
 * A revision move (§5.8 "Move 3 · …") — the ledger's plan table made machine-readable so the What-changed
 * move cards carry their titles/types without re-parsing markdown. Entries join a move via
 * `disposition.moveOrdinal`; `moots` lists finding ordinals the move mooted.
 */
export const responseLedgerMoveSchema = z.object({
  ordinal: z.number().int().positive(),
  title: z.string(),
  type: z.string().optional(), // structure | argument | craft (skill-authored label)
  status: z.string().optional(), // done | pending | …
  discharges: z.array(z.number().int().nonnegative()).optional(),
  moots: z.array(z.number().int().nonnegative()).optional(),
});
export type ResponseLedgerMove = z.infer<typeof responseLedgerMoveSchema>;
export const responseLedgerSidecarSchema = envelope("response_ledger").extend({
  entries: z.array(responseLedgerEntrySchema),
  /** the revision plan's moves (the move cards' titles); optional for older ledgers — cards fall back to
   *  "Move N". */
  moves: z.array(responseLedgerMoveSchema).optional(),
});
export type ResponseLedgerSidecar = z.infer<typeof responseLedgerSidecarSchema>;

// ---- cut-list.json (cut to length; reasons + protect toggles; restorable) ----
export const cutRowSchema = z.object({
  ordinal: z.number().int().nonnegative(),
  anchor: anchorSchema, // §11.3 Anchor verbatim (the span to cut)
  words: z.number().int().nonnegative(),
  reason: z.string(),
  protect: z.boolean().optional(),
});
export const cutListSidecarSchema = envelope("cut_list").extend({
  targetWords: z.number().int().nonnegative().optional(),
  cuts: z.array(cutRowSchema),
});
export type CutListSidecar = z.infer<typeof cutListSidecarSchema>;

// ---- turn-result.json (P1.11 — a chat_turn's structured outcome; the phase-result's typed twin) ----
export const turnResultSidecarSchema = envelope("turn_result").extend({
  status: z.enum(["done", "blocked", "replan"]),
  /** a ≤600-char abstract of the reply (the reply TEXT itself is never a sidecar field — REQ-DATA-37). */
  replySummary: z.string().max(600).optional(),
  /** the metered-shape counters the turn reports (the strip's truth is metered rows; this is the agent's own count). */
  searches: z.number().int().nonnegative().optional(),
  fetches: z.number().int().nonnegative().optional(),
  artifactReads: z.number().int().nonnegative().optional(),
  /** refs the reply relied on (typed read_artifact refs + source-note paths). */
  refs: z.array(z.string().max(280)).optional(),
});
export type TurnResultSidecar = z.infer<typeof turnResultSidecarSchema>;

// ---- research-result.json (P1.11 — a research_burst's distilled output contract) ----
export const researchResultSidecarSchema = envelope("research_result").extend({
  status: z.enum(["done", "blocked", "replan"]),
  /** the distilled research note's mirror path under agents/assistant/research/. */
  notePath: z.string().max(280),
  /** the source cards written this run (each is its own agents/assistant/research/ note). */
  sources: z
    .array(
      z.object({
        url: urlSchema,
        title: z.string().max(280).optional(),
        notePath: z.string().max(280).optional(),
        /** true when the fetch failed and the card carries the [unverified] mark (§7.1). */
        unverified: z.boolean().optional(),
      }),
    )
    .default([]),
  /** fetched tokens the estimator's `0.002·fetched_tokens` term priced (the run's own count). */
  fetchedTokens: z.number().int().nonnegative().optional(),
});
export type ResearchResultSidecar = z.infer<typeof researchResultSidecarSchema>;

/**
 * The sidecar registry: canonical filename → schema, and whether the sidecar is anchor-bearing (REQ-OBJ-16).
 * P0.04's parsers dispatch on this; the structural-sidecar contract test iterates the anchor-bearing set.
 */
export const SIDECAR_REGISTRY = {
  "findings.json": { schema: findingsSidecarSchema, anchorBearing: true },
  "01-claim-ledger.json": { schema: claimLedgerSidecarSchema, anchorBearing: true },
  // The Drafter's grounding ledger (P1.10) — the same `claim_ledger` envelope as the Editor's
  // `01-claim-ledger.json`, at the upstream `draft-from-outline` filename so the dossier path
  // names its provenance (grounding phase 3, `agents/author/drafting/v<N>/03-claim-ledger.md`).
  "03-claim-ledger.json": { schema: claimLedgerSidecarSchema, anchorBearing: true },
  "rubric.json": { schema: rubricSidecarSchema, anchorBearing: false },
  "structure-plan.json": { schema: structurePlanSidecarSchema, anchorBearing: true },
  "response-ledger.json": { schema: responseLedgerSidecarSchema, anchorBearing: true },
  "cut-list.json": { schema: cutListSidecarSchema, anchorBearing: true },
  // P1.11 — the Assistant's structured outcomes (never anchor-bearing: a chat turn / research burst
  // cites refs but authors no draft anchors).
  "turn-result.json": { schema: turnResultSidecarSchema, anchorBearing: false },
  "research-result.json": { schema: researchResultSidecarSchema, anchorBearing: false },
} as const;

export type SidecarFilename = keyof typeof SIDECAR_REGISTRY;

/**
 * A compact, human-authored contract hint per sidecar — the exact envelope + required fields the
 * `sidecar: true` skill input must emit (PRB.16b F15). The ported skills' docs say only "emits the
 * structured-output twin to `.rhema/<name>.json`" — nothing names the envelope or its REQUIRED array
 * field, so a live agent guessed `rows` for `entries` and failed `sidecar_validates` on every attempt
 * (prod run `01M2SH38…`, triage ×4). These hints ride into the phase prompt via `inputs.sidecar_contract`
 * (`runspec.ts`), so the agent sees the contract on attempt 1. Keep each hint terse and field-exact —
 * it is a writing contract, not prose. The zod schemas above remain the authority; a hint that drifts
 * from its schema fails `sidecar_validates` just the same.
 */
export const SIDECAR_CONTRACT_HINTS: Record<SidecarFilename, string> = {
  "findings.json":
    '{"sidecar":"findings","version":1,"findings":[{"ordinal":<int>,"kind","severity","origin","anchor"|<null>,"title","body","evidence"?{"verdict"?,"urls"?[{url,accessed}]},"suggestion"?{replacement},"rubricDims"?[],"letterSection"?,"carriesObligationId"?}]} — the array field is "findings".',
  "01-claim-ledger.json":
    '{"sidecar":"claim_ledger","version":1,"claims":[{"ordinal":<int>,"text","tier","verdict","kind"?,"url"?,"normalizedUrl"?,"accessedAt"?,"note"?,"sources"?[],"sourceCheck"?,"anchor"?,"humanAdded"?}]} — the array field is "claims".',
  "03-claim-ledger.json":
    '{"sidecar":"claim_ledger","version":1,"claims":[{"ordinal":<int>,"text","tier","verdict","kind"?,"url"?,"normalizedUrl"?,"accessedAt"?,"note"?,"sources"?[],"sourceCheck"?,"anchor"?,"humanAdded"?}]} — the array field is "claims"; the "note" carries the drafting instruction (use as-is / rescoped / with attribution / do not use).',
  "rubric.json":
    '{"sidecar":"rubric","version":1,"dimensions":[{"dimension","score":<1-5>,"cap"?{"at":<1-4>,"reason","entailedByFindingOrdinal"?}}],"swaps"?[{from,to}]} — the array field is "dimensions"; NEVER an aggregate score.',
  "structure-plan.json":
    '{"sidecar":"structure_plan","version":1,"spine":<string[]>,"sections":[{"ref","title","targetWords"?,"purpose"?,"anchor"?}],"alternativesConsidered"?<string[]>,"gaps"?<string[]>} — the array fields are "spine" + "sections".',
  "response-ledger.json":
    '{"sidecar":"response_ledger","version":1,"entries":[{"findingOrdinal":<int — the findings.json ordinal this row answers>,"disposition":{"kind":"accept"|"adapt"|"rebut"|"defer"|"escalate","status":"proposed"|"open"|"done"|"verified"|"mooted"|"deferred"|"escalated"|"honored","rationale"?,"adaptedText"?,"moveOrdinal"?,"applied"?,"actor"?},"anchor"?}],"moves"?[{"ordinal","title","type"?,"status"?,"discharges"?[],"moots"?[]}]} — the array field is "entries" (NOT "rows"); exactly one entry per finding in the review\'s findings.json.',
  "cut-list.json":
    '{"sidecar":"cut_list","version":1,"targetWords"?<int>,"cuts":[{"ordinal":<int>,"anchor","words":<int>,"reason","protect"?}]} — the array field is "cuts".',
  "turn-result.json":
    '{"sidecar":"turn_result","version":1,"status":"done"|"blocked"|"replan","replySummary"?,"searches"?<int>,"fetches"?<int>,"artifactReads"?<int>,"refs"?<string[]>} — no reply TEXT, only the abstract + counters.',
  "research-result.json":
    '{"sidecar":"research_result","version":1,"status":"done"|"blocked"|"replan","notePath","sources":[{url,"title"?,"notePath"?,"unverified"?}],"fetchedTokens"?<int>} — the array field is "sources".',
};
