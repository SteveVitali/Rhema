// Letter + second read → `findingsSidecar` (R2 §2.2, normative; REQ-CONV-7/8/14/16). Every
// severity, kind, origin and reconciliation below is a DECLARED rule from the §2.2 table —
// the corpus never states severity, so each of those fields is an import-rule assignment and
// carries the `labels.json` marker (labels.ts). `body`/`title` are verbatim source slices;
// the only rewriting is the declared 4096 truncation (`slice(0,4093) + "…"`).
//
// §2.2 table implemented verbatim:
//   one thing        → kind of the major it restates | major    | editor      | one_thing
//   majors           → first citing scorecard dim → kind; else keyword | major | both+kept when
//                      a second-read objection reconciles, else editor | major | anchor = Where
//   strengths        → craft    | note  | editor (`both` if the text says "second read") | strength
//   minors           → claim if it cites `Ledger Cn`/`ref [n]`/quote hygiene, else craft | minor | editor
//   line notes       → craft    | note  | editor
//   SR objection, not reconciled → argument | minor | second_read+kept | anchor = its quoted lines
//   SR objection rejected in CaR → argument | note  | second_read+rejected | considered_rejected
//   editor's own CaR             → argument | note  | editor | considered_rejected
//   roadmap open questions       → argument | note  | editor | roadmap | anchor null
//
// `suggestion` is never emitted; `evidence.verdict` only on claim-kind minors citing one ledger
// row; `rubricDims` = every dimension whose Basis cites the major.

import type {
  Anchor,
  ClaimVerdict,
  FindingKind,
  FindingsSidecar,
  RubricDimension,
  Severity,
} from "@rhema/contracts";
import { parseSidecar } from "@rhema/protocols";
import { anchorQuote, type AnchorRung } from "./anchor.js";
import { links } from "./md/sections.js";
import { lineHintOf } from "./md/quotes.js";
import { parseLetter, type LetterMajor, type ParsedLetter } from "./letter.js";
import { parseSecondRead } from "./second-read.js";
import { reconcileSecondRead, textOverlap } from "./reconcile.js";
import { DEMO_DEFAULTS } from "./demo-defaults.js";
import type { FindingLabel } from "./labels.js";
import type { OverrideBook } from "./overrides.js";
import { bad, fail, ok, warn, type Conversion, type Diagnostic } from "./result.js";

/** The declared truncation rule (R2 §2.2/§7 R8): bodies over the 4096 schema cap are cut at
 *  4093 chars plus "…" — the raw letter is always the full record. */
export const BODY_CAP = 4096;
export const TRUNCATED_LEN = 4093;
const truncate = (body: string): string =>
  body.length > BODY_CAP ? body.slice(0, TRUNCATED_LEN) + "…" : body;

/** dimension → finding kind (R2 §2.2): thesis/rigor/honesty→argument, evidence→claim,
 *  originality→discourse, structure→structure, prose→craft, voice→voice. */
const DIM_KIND: Readonly<Record<RubricDimension, FindingKind>> = {
  thesis_contribution: "argument",
  argument_rigor: "argument",
  evidence_accuracy: "claim",
  originality_situatedness: "discourse",
  structure: "structure",
  prose: "craft",
  voice_audience_fit: "voice",
  intellectual_honesty: "argument",
  timeliness: "argument",
  decision_readiness: "argument",
  scope_discipline: "argument",
};

/** Keyword fallback for a major no scorecard Basis cites (R2 §2.2's else-branch). */
const KIND_FALLBACK: readonly [FindingKind, RegExp][] = [
  ["claim", /contradicted|misleading|ledger [a-z]*\d|wrong at|count of what/i],
  [
    "discourse",
    /conversation|predecessor|uncited|situat|field it does not know|cit(e|ation)/i,
  ],
  ["structure", /too long|proportion|length|genre|manual|structure|front-loaded/i],
  ["craft", /aphorism|cadence|prose/i],
  ["argument", /./],
];

/** Minors: `claim` iff the text cites `Ledger Cn` / `ref [n]` / quote hygiene (R2 §2.2). */
const MINOR_CLAIM_RE = /ledger\s+[a-z]*\d|ref\s*\[\d+\]|\([a-z]*\d+\)|quot(e|ation)|cit(e|ation)/i;
const LEDGER_REF_RE = /ledger\s+([A-Z]+\d+[a-z]?(?:-[a-z]+)?)/i;

export interface FindingsContext {
  /** The sanitized draft this review read — anchors resolve against it. Omit for no anchors. */
  readonly draftMarkdown?: string;
  /** `05-second-read.md` when the round has one. */
  readonly secondReadMarkdown?: string;
  /** The review date (ISO `YYYY-MM-DD`) — `evidence.urls[].accessed` at T00:00:00Z. */
  readonly reviewDate?: string;
  /** Claim source-id → verdict (from the converted claim ledger + its labels), for
   *  `evidence.verdict` on claim-kind minors that cite one ledger row. */
  readonly claimVerdicts?: ReadonlyMap<string, ClaimVerdict>;
  /** The per-project overrides; `reconciliation` rows are consumed here (REQ-CONV-6/8). */
  readonly overrides?: OverrideBook;
}

export interface FindingsMeta {
  readonly counts: Readonly<Record<string, number>>;
  readonly anchorRungs: Readonly<Record<AnchorRung, number>>;
}

export interface FindingsOutput {
  readonly sidecar: FindingsSidecar;
  readonly labels: readonly FindingLabel[];
  readonly meta: FindingsMeta;
}

interface Row {
  readonly ordinal: number;
  readonly id: string;
  readonly aliases: readonly string[];
  readonly anchor: Anchor | null;
  readonly anchorText?: string;
  readonly lineHint?: number;
  readonly fields: Record<string, unknown>;
}

/** kind of a major: the first citing scorecard dimension → kind, else the keyword fallback. */
function majorKind(m: LetterMajor, letter: ParsedLetter): {
  kind: FindingKind;
  rubricDims: readonly RubricDimension[];
  via: "scorecard" | "keyword";
} {
  const dims = letter.scorecard.filter((d) => d.cites.includes(m.n)).map((d) => d.dimension);
  if (dims.length > 0) return { kind: DIM_KIND[dims[0]!]!, rubricDims: dims, via: "scorecard" };
  const t = m.title + " " + m.problem;
  return {
    kind: KIND_FALLBACK.find(([, re]) => re.test(t))![0],
    rubricDims: [],
    via: "keyword",
  };
}

/** The one thing restates a major when the overlap is decisive; else the declared default. */
function oneThingKind(text: string, majors: readonly LetterMajor[], letter: ParsedLetter): FindingKind {
  const scored = majors
    .map((m) => ({ m, s: textOverlap(text, m.title + " " + m.problem) }))
    .sort((a, b) => b.s - a.s);
  const best = scored[0];
  if (best && best.s >= 0.15 && best.s >= 2 * (scored[1]?.s ?? 0))
    return majorKind(best.m, letter).kind;
  return "argument";
}

/** Convert the letter (+ optional second read) into a validated `findingsSidecar`. Any failure —
 *  a `parseSidecar` `failed`, an unconsumed `reconciliation` override — aborts with `ok:false`
 *  and no partial output (REQ-CONV-2). */
export function convertFindings(
  letterMarkdown: string,
  ctx: FindingsContext = {},
): Conversion<FindingsOutput> {
  const letter = parseLetter(letterMarkdown);
  const diagnostics: Diagnostic[] = [...letter.diagnostics];
  const secondRead = ctx.secondReadMarkdown
    ? parseSecondRead(ctx.secondReadMarkdown)
    : { objections: [], strengths: [], verdict: null, unlabeled: [] };
  const rec = reconcileSecondRead(letter, secondRead, ctx.overrides);
  diagnostics.push(...rec.diagnostics);

  const rows: Row[] = [];
  const push = (
    id: string,
    fields: Record<string, unknown>,
    anchorText?: string,
    opts: { aliases?: readonly string[]; lineHint?: number } = {},
  ): void => {
    rows.push({
      ordinal: rows.length,
      id,
      aliases: opts.aliases ?? [],
      anchorText,
      lineHint: opts.lineHint,
      anchor: null,
      fields,
    });
  };

  // 1. The one thing (REQ-CONV-16: major + one_thing, never blocking).
  if (letter.oneThing !== null)
    push(
      "The one thing",
      {
        kind: oneThingKind(letter.oneThing, letter.majors, letter),
        severity: DEMO_DEFAULTS.oneThing.severity,
        origin: "editor",
        title: "The one thing",
        body: truncate(letter.oneThing),
        letterSection: DEMO_DEFAULTS.oneThing.letterSection,
        rubricDims: [],
      },
      letter.oneThing,
    );
  else diagnostics.push(fail("no_one_thing", "letter carries no `**The one thing:**` paragraph"));

  // 2. Majors — merged second-read objections flip origin to `both`+`kept` and ride the label.
  for (const m of letter.majors) {
    const k = majorKind(m, letter);
    const mergedLabels = rec.mergedInto.get(m.n) ?? [];
    const urls = links(m.problem + " " + m.direction).map((l) => ({
      url: l.url,
      ...(ctx.reviewDate ? { accessed: `${ctx.reviewDate}T00:00:00Z` } : {}),
    }));
    push(
      `Major ${m.n}`,
      {
        kind: k.kind,
        severity: "major" as Severity,
        origin: mergedLabels.length > 0 ? "both" : "editor",
        ...(mergedLabels.length > 0 ? { reconciliation: "kept" } : {}),
        title: m.title,
        body: truncate(m.problemBody),
        rubricDims: k.rubricDims,
        letterSection: "major",
        ...(urls.length > 0 && ctx.reviewDate ? { evidence: { urls } } : {}),
      },
      m.where,
      { aliases: mergedLabels.map((l) => `SR ${l}`), lineHint: lineHintOf(m.where) },
    );
  }

  // 3. Strengths — `note` rows under `strength` (REQ-CONV-16).
  letter.strengths.forEach((b, i) =>
    push(
      `Strength ${i + 1}`,
      {
        kind: DEMO_DEFAULTS.strength.kind,
        severity: DEMO_DEFAULTS.strength.severity,
        origin: /second read/i.test(b.text) ? "both" : "editor",
        title: b.text.slice(0, 200),
        body: truncate(b.raw.trim()),
        letterSection: DEMO_DEFAULTS.strength.letterSection,
        rubricDims: [],
      },
      b.text,
    ),
  );

  // 4. Minors — claim kind iff the text cites a ledger row / ref / quote hygiene.
  letter.minors.forEach((b, i) => {
    const claimKind = MINOR_CLAIM_RE.test(b.text);
    const ref = LEDGER_REF_RE.exec(b.text)?.[1];
    const verdict =
      claimKind && ref !== undefined ? ctx.claimVerdicts?.get(ref) : undefined;
    push(
      `Minor ${i + 1}`,
      {
        kind: claimKind ? "claim" : "craft",
        severity: "minor" as Severity,
        origin: "editor",
        title: b.text.slice(0, 200),
        body: truncate(b.raw.trim()),
        rubricDims: [],
        ...(verdict !== undefined ? { evidence: { urls: [], verdict } } : {}),
      },
      b.text,
    );
  });

  // 5. Line notes.
  letter.lineNotes.forEach((b, i) =>
    push(
      `Line note ${i + 1}`,
      {
        kind: "craft" as FindingKind,
        severity: "note" as Severity,
        origin: "editor",
        title: b.text.slice(0, 200),
        body: truncate(b.raw.trim()),
        rubricDims: [],
      },
      b.text,
    ),
  );

  // 6. Considered and rejected — editor items are findings; second-read rejected items are
  //    represented by their objection rows (below) so nothing emits twice.
  letter.considered.forEach((c, i) => {
    if (c.origin === "second_read") return; // emitted via the objection row
    push(`CaR ${i + 1}`, {
      kind: "argument" as FindingKind,
      severity: "note" as Severity,
      origin: "editor",
      title: c.title,
      body: truncate(c.raw),
      letterSection: "considered_rejected",
      rubricDims: [],
    });
  });

  // 7. Roadmap open questions — what `escalate` rows answer (anchor null by rule).
  letter.roadmap
    .filter((b) => b.openQuestion)
    .forEach((b, i) =>
      push(`OQ ${i + 1}`, {
        kind: "argument" as FindingKind,
        severity: "note" as Severity,
        origin: "editor",
        title: b.text.slice(0, 200),
        body: truncate(b.raw.trim()),
        letterSection: "roadmap",
        rubricDims: [],
      }),
    );

  // 8. Second-read objections that did not merge: standalone `kept` minors, or `rejected`
  //    notes under considered_rejected. SR strengths are never findings.
  for (const o of secondRead.objections) {
    const outcome = rec.outcomes.get(o.label) ?? { kind: "kept" as const };
    if (outcome.kind === "merged") continue;
    if (outcome.kind === "rejected") {
      push(`SR ${o.label}`, {
        kind: "argument" as FindingKind,
        severity: "note" as Severity,
        origin: "second_read",
        reconciliation: "rejected",
        title: o.title.slice(0, 200),
        body: truncate(o.body),
        letterSection: "considered_rejected",
        rubricDims: [],
      });
    } else {
      push(
        `SR ${o.label}`,
        {
          kind: "argument" as FindingKind,
          severity: "minor" as Severity,
          origin: "second_read",
          reconciliation: "kept",
          title: o.title.slice(0, 200),
          body: truncate(o.body),
          rubricDims: [],
        },
        o.body,
      );
    }
  }
  // Anchors through the 215 ladder; `anchor: null` where nothing resolves (never `unanchored`).
  const anchorRungs: Record<AnchorRung, number> = {
    exact: 0,
    "exact-multi": 0,
    normalized: 0,
    fuzzy: 0,
    line: 0,
    section: 0,
    none: 0,
  };
  const findings = rows.map((r) => {
    let anchor: Anchor | null = null;
    if (r.anchorText !== undefined && ctx.draftMarkdown !== undefined) {
      const res = anchorQuote(r.anchorText, ctx.draftMarkdown, { lineHint: r.lineHint });
      anchorRungs[res.rung] += 1;
      anchor = res.anchor;
      if (!anchor)
        diagnostics.push(
          warn("anchor_unresolved", `${r.id}: quote did not anchor into the draft`),
        );
    } else anchorRungs.none += 1;
    return { ...r.fields, ordinal: r.ordinal, anchor };
  });

  // REQ-CONV-6/8: an unconsumed reconciliation override fails the conversion (kind-scoped; the
  // shared book's other kinds belong to their own passes).
  for (const row of ctx.overrides?.unconsumed() ?? [])
    if (row.kind === "reconciliation")
      diagnostics.push(
        fail("override_unconsumed", `stale override row (cite ${row.cite}) was never consumed`),
      );

  if (diagnostics.some((d) => d.severity === "error")) return bad(diagnostics);

  const sidecarJson = { sidecar: "findings", version: 1, findings };
  const gate = parseSidecar("findings.json", { json: sidecarJson });
  if (gate.parseStatus === "failed") {
    for (const e of gate.errors) diagnostics.push(fail("sidecar_failed", e));
    return bad(diagnostics);
  }

  return ok(
    {
      sidecar: gate.value as FindingsSidecar,
      labels: rows.map((r) => ({
        ordinal: r.ordinal,
        id: r.id,
        ...(r.aliases.length > 0 ? { aliases: r.aliases } : {}),
      })),
      meta: {
        counts: countBy(
          findings.map(
            (f) => String((f as Record<string, unknown>).letterSection ?? "other"),
          ),
        ),
        anchorRungs,
      },
    },
    diagnostics,
  );
}

function countBy(vals: readonly string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const v of vals) out[v] = (out[v] ?? 0) + 1;
  return out;
}
