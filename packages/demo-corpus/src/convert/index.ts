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
  type DispositionOverride,
  type MinorFindingOverride,
  type MoveLinkOverride,
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
export {
  convertResponseLedger,
  classifySource,
  mapDisposition,
  mapStatus,
  type ResponseLedgerContext,
  type ResponseLedgerMeta,
  type ResponseLedgerOutput,
  type ResponseLedgerRows,
} from "./response-ledger.js";
export {
  convertStructurePlan,
  type StructurePlanMeta,
  type StructurePlanOutput,
} from "./structure-plan.js";
export {
  draftLedgerRows,
  type DraftLedgerRow,
  type DraftLedgerRows,
} from "./draft-ledger.js";
export {
  buildWhatChangedArtifact,
  type WhatChangedArtifact,
  type WhatChangedHunkView,
} from "./what-changed.js";
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

// ---------------------------------------------------------------------------------------------
// The pipeline (R2 §5 `index.ts`; REQ-CONV-2/6/10/12/15): every pass, per project dir, in order —
// claim ledger → findings → rubric → labels (per review round), response ledger + rows (per
// ledger), structure plan + draft-ledger rows (per drafting dir), what-changed (per adjacent
// draft pair). Every emitted sidecar went through `parseSidecar` inside its converter; ANY
// error-level diagnostic, a failed conversion or an unconsumed override aborts the whole run
// with NO partial output (`ok:false` + an empty outputs map). File I/O stays with the caller —
// the pipeline sees a `files` map and returns a canonical-JSON `outputs` map.
// ---------------------------------------------------------------------------------------------

import type { ClaimVerdict, ResponseLedgerSidecar } from "@rhema/contracts";
import { convertClaimLedger } from "./claim-ledger.js";
import { draftLedgerRows } from "./draft-ledger.js";
import { convertFindings } from "./findings.js";
import { reviewLabels } from "./labels.js";
import { OverrideBook, type ConvertOverridesFile } from "./overrides.js";
import { convertResponseLedger } from "./response-ledger.js";
import { convertRubric } from "./rubric.js";
import { convertStructurePlan } from "./structure-plan.js";
import { sourceNoteIndex } from "./source-note.js";
import { buildWhatChangedArtifact } from "./what-changed.js";
import type { FindingLabel } from "./labels.js";
import type { AnchorRung } from "./anchor.js";
import { fail, type Diagnostic } from "./result.js";

export interface ConvertProjectInput {
  /** corpus-relative path → file text (the sanitized `corpus/<slug>/` tree). */
  readonly files: ReadonlyMap<string, string>;
  /** The parsed `convert-overrides.json` (already through `readConvertOverrides`), or absent. */
  readonly overrides?: ConvertOverridesFile;
}

export interface ConvertProjectMeta {
  /** Zero-unmapped lists the golden harness asserts on. */
  readonly unmapped: {
    readonly verdicts: readonly string[];
    readonly dispositions: readonly string[];
    readonly statuses: readonly string[];
  };
  /** Summary-count reconciliation per review round (null = no Summary section). */
  readonly summaryReconciled: Readonly<Record<string, boolean | null>>;
}

export type ConvertProjectResult =
  | {
      readonly ok: true;
      /** output-relative path → canonical-JSON bytes (the golden set). */
      readonly outputs: ReadonlyMap<string, string>;
      readonly diagnostics: readonly Diagnostic[];
      readonly meta: ConvertProjectMeta;
    }
  | { readonly ok: false; readonly diagnostics: readonly Diagnostic[] };

const ROUND_RE = /^correspondence\/([A-Za-z0-9-]+)-review\//;
const LEDGER_RE = /^agents\/[^/]+\/ledgers\/([A-Za-z0-9-]+)-response-ledger\.md$/;
const SRC_NOTE_RE = /^agents\/[^/]+\/research\/sources\/[^/]+\.md$/;
const PLAN_RE = /^(agents\/[^/]+\/drafting\/[^/]+\/)02-structure-plan\.md$/;
const DRAFT_LEDGER_RE = /^(agents\/[^/]+\/drafting\/[^/]+\/)04-draft-ledger\.md$/;

interface VersionsFile {
  readonly versions?: readonly { readonly version?: string; readonly file?: string }[];
}

/** Run every converter pass over one project dir (REQ-CONV-2/6). `files` keys are corpus-relative
 *  paths; `outputs` keys are golden-relative paths (the same tree 219 uses on real projects). */
export function convertProject(input: ConvertProjectInput): ConvertProjectResult {
  const files = input.files;
  const diagnostics: Diagnostic[] = [];
  const outputs = new Map<string, string>();
  const book = input.overrides ? OverrideBook.from(input.overrides) : OverrideBook.empty();
  const get = (p: string) => files.get(p);
  const paths = [...files.keys()].sort();

  // Layout discovery: versions.json (draft order), review rounds, ledgers, drafting dirs.
  let versions: { version: string; file: string }[] = [];
  const versionsJson = get("versions.json");
  if (versionsJson === undefined) {
    diagnostics.push(fail("no_versions", "project carries no versions.json"));
  } else {
    try {
      const v = JSON.parse(versionsJson) as VersionsFile;
      versions = (v.versions ?? [])
        .filter((x) => typeof x.version === "string" && typeof x.file === "string")
        .map((x) => ({ version: x.version as string, file: x.file as string }));
    } catch (e) {
      diagnostics.push(fail("versions_unparsed", `versions.json: ${String(e)}`));
    }
  }
  const nextDraft = new Map<string, string>();
  for (let i = 0; i + 1 < versions.length; i++)
    nextDraft.set(versions[i]!.version, versions[i + 1]!.file);

  const notes = sourceNoteIndex(
    paths
      .filter((p) => SRC_NOTE_RE.test(p))
      .map((p) => ({ slug: p.split("/").pop()!.replace(/\.md$/, ""), markdown: files.get(p)! })),
  );

  // 1. Review passes — claim ledger → findings → rubric → labels.json, per round.
  const rounds = [
    ...new Set(
      paths.map((p) => ROUND_RE.exec(p)?.[1]).filter((r): r is string => r !== undefined),
    ),
  ].sort();
  const findingLabels = new Map<string, readonly FindingLabel[]>();
  const ledgers = new Map<string, ResponseLedgerSidecar>();
  const claimsHist: Record<string, Readonly<Record<AnchorRung, number>>> = {};
  const findingsHist: Record<string, Readonly<Record<AnchorRung, number>>> = {};
  const responseHist: Record<string, Readonly<Record<AnchorRung, number>>> = {};
  const unmapped = { verdicts: [] as string[], dispositions: [] as string[], statuses: [] as string[] };
  const summaryReconciled: Record<string, boolean | null> = {};

  for (const round of rounds) {
    const dir = `correspondence/${round}-review`;
    const claimsMd = get(`${dir}/01-claim-ledger.md`);
    const letterMd = get(`${dir}/editors-letter.md`);
    const srMd = get(`${dir}/05-second-read.md`);
    const draftMd = get(`drafts/${round}.md`);
    if (claimsMd === undefined || letterMd === undefined) {
      diagnostics.push(
        fail("round_incomplete", `${dir}: needs 01-claim-ledger.md + editors-letter.md`),
      );
      continue;
    }
    const cl = convertClaimLedger(claimsMd, {
      ...(draftMd !== undefined ? { draftMarkdown: draftMd } : {}),
      sourceNotes: notes,
      overrides: book,
    });
    if (!cl.ok) {
      diagnostics.push(...cl.diagnostics);
      continue;
    }
    diagnostics.push(...cl.diagnostics);
    const claimVerdicts = new Map<string, ClaimVerdict>(
      cl.value.labels.claims.map((l) => [l.id, cl.value.sidecar.claims[l.ordinal]!.verdict]),
    );
    const f = convertFindings(letterMd, {
      ...(draftMd !== undefined ? { draftMarkdown: draftMd } : {}),
      ...(srMd !== undefined ? { secondReadMarkdown: srMd } : {}),
      ...(cl.value.meta.checkDate !== null ? { reviewDate: cl.value.meta.checkDate } : {}),
      claimVerdicts,
      overrides: book,
    });
    const r = convertRubric(letterMd);
    if (!f.ok || !r.ok) {
      if (!f.ok) diagnostics.push(...f.diagnostics);
      if (!r.ok) diagnostics.push(...r.diagnostics);
      continue;
    }
    diagnostics.push(...f.diagnostics, ...r.diagnostics);
    findingLabels.set(round, f.value.labels);
    outputs.set(`${dir}/01-claim-ledger.json`, canonicalJson(cl.value.sidecar));
    outputs.set(`${dir}/findings.json`, canonicalJson(f.value.sidecar));
    outputs.set(`${dir}/rubric.json`, canonicalJson(r.value.sidecar));
    outputs.set(
      `${dir}/labels.json`,
      canonicalJson(reviewLabels({ claims: cl.value.labels.claims, findings: f.value.labels })),
    );
    claimsHist[`${dir}/01-claim-ledger.md`] = cl.value.meta.anchorRungs;
    findingsHist[`${dir}/{editors-letter,05-second-read}.md`] = f.value.meta.anchorRungs;
    unmapped.verdicts.push(...cl.value.meta.unmappedVerdicts);
    summaryReconciled[round] = cl.value.meta.summaryReconciled;
  }

  // 2. Response ledgers — resolved against THEIR round's finding labels, anchored into v(N+1).
  for (const p of paths) {
    const m = LEDGER_RE.exec(p);
    if (!m) continue;
    const round = m[1]!;
    const labels = findingLabels.get(round);
    if (labels === undefined) {
      diagnostics.push(
        fail("ledger_round_missing", `${p}: no \`correspondence/${round}-review/\` to join to`),
      );
      continue;
    }
    const nextPath = nextDraft.get(round);
    const nextMd = nextPath !== undefined ? get(nextPath) : undefined;
    const rl = convertResponseLedger(files.get(p)!, {
      findingLabels: labels,
      ...(nextMd !== undefined ? { nextDraftMarkdown: nextMd } : {}),
      overrides: book,
    });
    if (!rl.ok) {
      diagnostics.push(...rl.diagnostics);
      continue;
    }
    diagnostics.push(...rl.diagnostics);
    ledgers.set(round, rl.value.sidecar);
    outputs.set(
      p.replace(/\.md$/, ".json"),
      canonicalJson(rl.value.sidecar),
    );
    outputs.set(
      p.replace(/-response-ledger\.md$/, "-rows.json"),
      canonicalJson(rl.value.rows),
    );
    responseHist[p] = rl.value.meta.anchorRungs;
    unmapped.dispositions.push(...rl.value.meta.unmappedDispositions);
    unmapped.statuses.push(...rl.value.meta.unmappedStatuses);
  }

  // 3. Drafting dossier — structure plan sidecar; draft ledger rows (raw, REQ-CONV-17).
  for (const p of paths) {
    const pm = PLAN_RE.exec(p);
    if (pm) {
      const sp = convertStructurePlan(files.get(p)!);
      if (!sp.ok) diagnostics.push(...sp.diagnostics);
      else {
        diagnostics.push(...sp.diagnostics);
        outputs.set(`${pm[1]}structure-plan.json`, canonicalJson(sp.value.sidecar));
      }
    }
    const dm = DRAFT_LEDGER_RE.exec(p);
    if (dm)
      outputs.set(`${dm[1]}04-draft-ledger.rows.json`, canonicalJson(draftLedgerRows(files.get(p)!)));
  }

  // 4. What-changed — every adjacent draft pair; the round's converted ledger supplies
  //    entries/moves (absent → every hunk Unlinked; REQ-CONV-15).
  for (let i = 0; i + 1 < versions.length; i++) {
    const from = versions[i]!;
    const to = versions[i + 1]!;
    const before = get(from.file);
    const after = get(to.file);
    if (before === undefined || after === undefined) {
      diagnostics.push(fail("draft_missing", `what-changed ${from.version}→${to.version}: draft file missing`));
      continue;
    }
    const ledger = ledgers.get(from.version);
    outputs.set(
      `what-changed/${from.version}-${to.version}.json`,
      canonicalJson(
        buildWhatChangedArtifact(before, after, {
          from: from.version,
          to: to.version,
          ...(ledger !== undefined ? { ledger } : {}),
        }),
      ),
    );
  }

  // REQ-CONV-6 pipeline-wide: every override row in the project file was consumed.
  for (const u of book.unconsumed())
    diagnostics.push(
      fail("override_unconsumed", `stale override row (cite ${u.cite}) was never consumed`),
    );

  if (diagnostics.some((d) => d.severity === "error")) return { ok: false, diagnostics };

  outputs.set(
    "anchor-histogram.json",
    canonicalJson({ version: 1, files: claimsHist }),
  );
  outputs.set(
    "findings-anchor-histogram.json",
    canonicalJson({ version: 1, files: findingsHist }),
  );
  outputs.set(
    "response-anchor-histogram.json",
    canonicalJson({ version: 1, files: responseHist }),
  );
  return {
    ok: true,
    outputs,
    diagnostics,
    meta: { unmapped, summaryReconciled },
  };
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
