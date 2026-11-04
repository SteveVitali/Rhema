// The `convert-overrides.json` mechanism (R2 §5 `overrides.ts`; REQ-CONV-6). Some mappings are not
// derivable by rule — a summary-level verdict re-score (GM v1 C15), later a reconciliation choice,
// a minor-row→finding map, mixed dispositions, a move map. Those live in a committed per-project
// `corpus/<slug>/convert-overrides.json`: typed rows, EACH citing its source line, with per-row
// consumption tracking so a stale row fails the conversion rather than silently drifting.
//
// This ticket implements the `verdict-rescore` kind; 216/217 add theirs. The file's location is a
// convention for 219's real-corpus authoring — the synthetic fixture reconciles without overrides,
// so the mechanism is exercised by synthesized rows in tests.

import { CLAIM_VERDICTS, DISPOSITION_KINDS, type ClaimVerdict, type DispositionKind } from "@rhema/contracts";

/** Row kinds implemented by the converter so far (217 extends this union additively). */
export type OverrideKind =
  | "verdict-rescore"
  | "reconciliation"
  | "minor-finding"
  | "disposition"
  | "move-link";

/** A summary-level verdict re-score: the heading parse says X, the ledger's own summary re-scored
 *  it to Y (R2 §1 "Summary overrides a heading"). `claim` is the SOURCE id (the labels.json id —
 *  `C15`, `III16`), never the emitted ordinal. */
export interface VerdictRescoreOverride {
  readonly kind: "verdict-rescore";
  /** Source-id of the claim row to re-score. */
  readonly claim: string;
  /** The canonical verdict the summary re-scored the claim to. */
  readonly verdict: ClaimVerdict;
  /** The line that justifies the row — `<file>:<line>` (each row cites its source line). */
  readonly cite: string;
  /** Optional verbatim summary text kept for the record. */
  readonly note?: string;
}

/** A second-read reconciliation ruling (216; REQ-CONV-8): the override file is authoritative
 *  over the overlap heuristic. `objection` is the second-read item's own label (`"1"`, `"2.4"`,
 *  `"(iii)"` without parens). `outcome`: `"merged"` folds the objection into `major` (the
 *  major's finding carries `origin:"both"`, `reconciliation:"kept"`); `"kept"` leaves it a
 *  standalone second-read finding; `"rejected"` marks it rejected-in-the-letter (considered and
 *  rejected). */
export interface ReconciliationOverride {
  readonly kind: "reconciliation";
  /** The second-read objection's label as parsed by `second-read.ts`. */
  readonly objection: string;
  readonly outcome: "merged" | "kept" | "rejected";
  /** The major number the objection merges into — required iff `outcome === "merged"`. */
  readonly major?: number;
  /** The line that justifies the row — `<file>:<line>` (each row cites its source line). */
  readonly cite: string;
  /** Optional verbatim note kept for the record. */
  readonly note?: string;
}

/** A minor-row → finding map (217; REQ-CONV-6 extension): a response-ledger row whose `Source`
 *  cell names a letter minor but whose finding no positional/rule resolution can reach (GM v2's
 *  merged "Minor issues, line notes, and the claim ledger" table is the real-corpus case).
 *  `row` is the ledger row id (`G1`); `finding` is the finding's corpus id or alias in
 *  `labels.json` (`Minor 2`, `The one thing`) — never the emitted ordinal. */
export interface MinorFindingOverride {
  readonly kind: "minor-finding";
  /** The response-ledger row id this mapping is for. */
  readonly row: string;
  /** The labels.json finding id (or alias) the row answers. */
  readonly finding: string;
  /** The line that justifies the row — `<file>:<line>` (each row cites its source line). */
  readonly cite: string;
  /** Optional verbatim note kept for the record. */
  readonly note?: string;
}

/** A mixed/unspecified disposition cell resolution (217; REQ-CONV-6 extension): a cell like
 *  `§3.B accept; the volume point **rebut**` carries more than one disposition keyword, so no
 *  first-keyword rule may pick — only an explicit, cited ruling decides the canonical kind. */
export interface DispositionOverride {
  readonly kind: "disposition";
  /** The response-ledger row id this ruling is for. */
  readonly row: string;
  /** The canonical disposition kind the cell resolves to. */
  readonly disposition: DispositionKind;
  /** The line that justifies the row — `<file>:<line>` (each row cites its source line). */
  readonly cite: string;
  /** Optional verbatim note kept for the record. */
  readonly note?: string;
}

/** An explicit row → move linkage (217; REQ-CONV-6/15). Sanctioned ONLY where a source table
 *  already states the linkage (a `Discharges`/`Moots` cell, or a plan-table correction the cite
 *  documents) — it is never a hand-authored move map: rounds without source-stated linkage stay
 *  Unlinked (ticket 217 item 2; R2 §4 option (b)). */
export interface MoveLinkOverride {
  readonly kind: "move-link";
  /** The response-ledger row id this linkage is for. */
  readonly row: string;
  /** The move ordinal (positive int) the row joins. */
  readonly move: number;
  /** The line that justifies the row — `<file>:<line>` (each row cites its source line). */
  readonly cite: string;
  /** Optional verbatim note kept for the record. */
  readonly note?: string;
}

export type ConvertOverride =
  | VerdictRescoreOverride
  | ReconciliationOverride
  | MinorFindingOverride
  | DispositionOverride
  | MoveLinkOverride;

export interface ConvertOverridesFile {
  readonly version: 1;
  readonly overrides: readonly ConvertOverride[];
}

const KNOWN_KINDS = new Set<string>([
  "verdict-rescore",
  "reconciliation",
  "minor-finding",
  "disposition",
  "move-link",
]);
const CITE_RE = /:\d+$/;

export type OverridesParse =
  | { readonly ok: true; readonly value: ConvertOverridesFile }
  | { readonly ok: false; readonly errors: string[] };

/** Typed reader: strict shape, unknown kinds rejected, every row must cite `file:line`. */
export function readConvertOverrides(json: unknown): OverridesParse {
  const errors: string[] = [];
  if (typeof json !== "object" || json === null || Array.isArray(json)) {
    return { ok: false, errors: ["convert-overrides.json must be an object"] };
  }
  const root = json as Record<string, unknown>;
  if (root.version !== 1) errors.push(`version must be 1 (got ${JSON.stringify(root.version)})`);
  const rows = root.overrides;
  if (!Array.isArray(rows)) {
    return { ok: false, errors: [...errors, "overrides must be an array"] };
  }
  const out: ConvertOverride[] = [];
  rows.forEach((row, i) => {
    const at = `overrides[${i}]`;
    if (typeof row !== "object" || row === null || Array.isArray(row)) {
      errors.push(`${at}: must be an object`);
      return;
    }
    const r = row as Record<string, unknown>;
    const kind = r.kind;
    if (typeof kind !== "string" || !KNOWN_KINDS.has(kind)) {
      errors.push(`${at}: unknown kind ${JSON.stringify(kind)}`);
      return;
    }
    if (kind === "verdict-rescore") {
      if (typeof r.claim !== "string" || r.claim === "")
        errors.push(`${at}: verdict-rescore requires a non-empty "claim" (source id)`);
      if (typeof r.verdict !== "string" || !(CLAIM_VERDICTS as readonly string[]).includes(r.verdict))
        errors.push(`${at}: verdict ${JSON.stringify(r.verdict)} is not a canonical claim verdict`);
      if (typeof r.cite !== "string" || !CITE_RE.test(r.cite))
        errors.push(`${at}: "cite" must name its source line as <file>:<line>`);
      if (errors.every((e) => !e.startsWith(at))) {
        out.push({
          kind: "verdict-rescore",
          claim: r.claim as string,
          verdict: r.verdict as ClaimVerdict,
          cite: r.cite as string,
          ...(typeof r.note === "string" ? { note: r.note } : {}),
        });
      }
    }
    if (kind === "reconciliation") {
      const outcome = r.outcome;
      if (typeof r.objection !== "string" || r.objection === "")
        errors.push(`${at}: reconciliation requires a non-empty "objection" label`);
      if (outcome !== "merged" && outcome !== "kept" && outcome !== "rejected")
        errors.push(`${at}: outcome ${JSON.stringify(outcome)} must be merged|kept|rejected`);
      const majorOk =
        outcome === "merged"
          ? typeof r.major === "number" && Number.isInteger(r.major) && r.major > 0
          : r.major === undefined;
      if (!majorOk)
        errors.push(`${at}: "major" (positive int) is required iff outcome is "merged"`);
      if (typeof r.cite !== "string" || !CITE_RE.test(r.cite))
        errors.push(`${at}: "cite" must name its source line as <file>:<line>`);
      if (errors.every((e) => !e.startsWith(at))) {
        out.push({
          kind: "reconciliation",
          objection: r.objection as string,
          outcome: outcome as ReconciliationOverride["outcome"],
          ...(typeof r.major === "number" ? { major: r.major } : {}),
          cite: r.cite as string,
          ...(typeof r.note === "string" ? { note: r.note } : {}),
        });
      }
    }
    if (kind === "minor-finding") {
      if (typeof r.row !== "string" || r.row === "")
        errors.push(`${at}: minor-finding requires a non-empty "row" (ledger row id)`);
      if (typeof r.finding !== "string" || r.finding === "")
        errors.push(`${at}: minor-finding requires a non-empty "finding" (labels.json id/alias)`);
      if (typeof r.cite !== "string" || !CITE_RE.test(r.cite))
        errors.push(`${at}: "cite" must name its source line as <file>:<line>`);
      if (errors.every((e) => !e.startsWith(at))) {
        out.push({
          kind: "minor-finding",
          row: r.row as string,
          finding: r.finding as string,
          cite: r.cite as string,
          ...(typeof r.note === "string" ? { note: r.note } : {}),
        });
      }
    }
    if (kind === "disposition") {
      if (typeof r.row !== "string" || r.row === "")
        errors.push(`${at}: disposition requires a non-empty "row" (ledger row id)`);
      if (
        typeof r.disposition !== "string" ||
        !(DISPOSITION_KINDS as readonly string[]).includes(r.disposition)
      )
        errors.push(
          `${at}: disposition ${JSON.stringify(r.disposition)} is not a canonical disposition kind`,
        );
      if (typeof r.cite !== "string" || !CITE_RE.test(r.cite))
        errors.push(`${at}: "cite" must name its source line as <file>:<line>`);
      if (errors.every((e) => !e.startsWith(at))) {
        out.push({
          kind: "disposition",
          row: r.row as string,
          disposition: r.disposition as DispositionKind,
          cite: r.cite as string,
          ...(typeof r.note === "string" ? { note: r.note } : {}),
        });
      }
    }
    if (kind === "move-link") {
      if (typeof r.row !== "string" || r.row === "")
        errors.push(`${at}: move-link requires a non-empty "row" (ledger row id)`);
      if (typeof r.move !== "number" || !Number.isInteger(r.move) || r.move <= 0)
        errors.push(`${at}: move-link requires "move" (positive int move ordinal)`);
      if (typeof r.cite !== "string" || !CITE_RE.test(r.cite))
        errors.push(`${at}: "cite" must name its source line as <file>:<line>`);
      if (errors.every((e) => !e.startsWith(at))) {
        out.push({
          kind: "move-link",
          row: r.row as string,
          move: r.move as number,
          cite: r.cite as string,
          ...(typeof r.note === "string" ? { note: r.note } : {}),
        });
      }
    }
  });
  return errors.length > 0 ? { ok: false, errors } : { ok: true, value: { version: 1, overrides: out } };
}

/**
 * The consumption tracker handed to converters. `take` finds the first unconsumed row of a kind
 * matching a predicate and marks it; `unconsumed()` lists what is left — a converter fails when
 * that list is non-empty (a stale override would otherwise drift unremarked).
 */
export class OverrideBook {
  private readonly rows: { row: ConvertOverride; consumed: boolean }[];

  constructor(overrides: readonly ConvertOverride[]) {
    this.rows = overrides.map((row) => ({ row, consumed: false }));
  }

  static from(file: ConvertOverridesFile): OverrideBook {
    return new OverrideBook(file.overrides);
  }

  static empty(): OverrideBook {
    return new OverrideBook([]);
  }

  /** Consume the first unconsumed row of `kind` matching `match`; returns it (or undefined). */
  take<K extends OverrideKind>(
    kind: K,
    match: (row: ConvertOverride) => boolean,
  ): Extract<ConvertOverride, { kind: K }> | undefined {
    const hit = this.rows.find((e) => !e.consumed && e.row.kind === kind && match(e.row));
    if (!hit) return undefined;
    hit.consumed = true;
    return hit.row as Extract<ConvertOverride, { kind: K }>;
  }

  /** Rows never claimed by any converter — a non-empty list fails the conversion. */
  unconsumed(): readonly ConvertOverride[] {
    return this.rows.filter((e) => !e.consumed).map((e) => e.row);
  }
}
