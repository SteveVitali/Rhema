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
export const responseLedgerSidecarSchema = envelope("response_ledger").extend({
  entries: z.array(responseLedgerEntrySchema),
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

/**
 * The sidecar registry: canonical filename → schema, and whether the sidecar is anchor-bearing (REQ-OBJ-16).
 * P0.04's parsers dispatch on this; the structural-sidecar contract test iterates the anchor-bearing set.
 */
export const SIDECAR_REGISTRY = {
  "findings.json": { schema: findingsSidecarSchema, anchorBearing: true },
  "01-claim-ledger.json": { schema: claimLedgerSidecarSchema, anchorBearing: true },
  "rubric.json": { schema: rubricSidecarSchema, anchorBearing: false },
  "structure-plan.json": { schema: structurePlanSidecarSchema, anchorBearing: true },
  "response-ledger.json": { schema: responseLedgerSidecarSchema, anchorBearing: true },
  "cut-list.json": { schema: cutListSidecarSchema, anchorBearing: true },
} as const;

export type SidecarFilename = keyof typeof SIDECAR_REGISTRY;
