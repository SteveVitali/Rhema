// The corpus→sidecar converter modules (R2 §5; REQ-CONV-1). Everything here is a pure function —
// `(markdown, ctx) → {sidecar, labels, diagnostics}` — with no I/O, no clock and no randomness, so
// byte-stable input yields byte-stable output and the committed goldens can assert it. File
// reading/writing lives in the callers (tests now; the 216/217 pipeline + 219's real-corpus run).
//
// Shared pieces this module owns for 216/217: the markdown readers (`md/`), the quote-fragment +
// anchor ladder (`anchor.ts`), the source-note index (`source-note.ts`), the `labels.json`
// side-table (`claim-ledger.ts`) and the `convert-overrides.json` mechanism (`overrides.ts`) — the
// later tickets extend them; they do not fork them (215 Notes).

export * from "./result.js";
export {
  headingSections,
  preamble,
  boldBullets,
  labelBullets,
  listItems,
  tables,
  splitTableRow,
  links,
  type HeadingSection,
  type BulletItem,
  type TextLink,
} from "./md/sections.js";
export { quoteFragments, stripLocator, lineHintOf, wordCount } from "./md/quotes.js";
export {
  anchorQuote,
  splitAtReferences,
  ANCHOR_CONFIDENCE,
  FUZZY_COVERAGE_FLOOR,
  type AnchorOptions,
  type AnchorResolution,
  type AnchorRung,
} from "./anchor.js";
export {
  convertClaimLedger,
  canonicalizeVerdict,
  ledgerCheckDate,
  ledgerInventoryCount,
  type ClaimLedgerContext,
  type ClaimLedgerLabels,
  type ClaimLedgerMeta,
  type ClaimLedgerOutput,
} from "./claim-ledger.js";
export { indexSourceNote, sourceNoteIndex, type SourceNote } from "./source-note.js";
export {
  readConvertOverrides,
  OverrideBook,
  type ConvertOverride,
  type ConvertOverridesFile,
  type OverrideKind,
  type OverridesParse,
  type ReconciliationOverride,
  type VerdictRescoreOverride,
} from "./overrides.js";
export {
  parseLetter,
  verbatimItems,
  leadSplit,
  RUBRIC_NAME_MAP,
  type ConsideredItem,
  type LetterMajor,
  type ParsedLetter,
  type ScorecardDim,
  type VerbatimItem,
} from "./letter.js";
export {
  parseSecondRead,
  type ParsedSecondRead,
  type SecondReadObjection,
} from "./second-read.js";
export {
  reconcileSecondRead,
  textOverlap,
  OVERLAP_FLOOR,
  MARGIN_RATIO,
  type Reconciliation,
  type ReconciliationOutcome,
} from "./reconcile.js";
export {
  convertFindings,
  BODY_CAP,
  TRUNCATED_LEN,
  type FindingsContext,
  type FindingsMeta,
  type FindingsOutput,
} from "./findings.js";
export { convertRubric, type RubricContext, type RubricOutput } from "./rubric.js";
export { DEMO_DEFAULTS } from "./demo-defaults.js";
export { RAW_ONLY, isRawOnly } from "./raw-only.js";
export {
  reviewLabels,
  lintGeneratedLabels,
  CONVERTER_ASSIGNED_FIELDS,
  IMPORT_RULE_NOTE,
  ROLES,
  type FindingLabel,
  type ReviewLabels,
} from "./labels.js";

/**
 * The canonical-JSON writer the goldens compare byte-for-byte (REQ-CONV-12): object keys sorted
 * recursively, array order preserved (ordinals are meaningful), one-space indent, trailing
 * newline. Determinism is a requirement, not a format — the same input must always emit the same
 * bytes.
 */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value), null, 1) + "\n";
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys);
  if (typeof value === "object" && value !== null) {
    const obj = value as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(obj)
        .sort((a, b) => a.localeCompare(b))
        .map((k) => [k, sortKeys(obj[k])]),
    );
  }
  return value;
}
