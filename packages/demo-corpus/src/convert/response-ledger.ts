// Response-ledger markdown → `responseLedgerSidecar` + `rows.json` (R2 §2.4; REQ-CONV-10/15/16).
// The author's triage table joins back to the review's findings by `Source` cell: letter majors,
// minors (positional, or the `minor-finding` override where positional cannot reach — GM v2's
// merged minor table), second-read labels through the merged labels' `SR` aliases, open
// questions to roadmap findings. Everything else — claim-ledger, discourse/argument/craft-note,
// self and unknown sources — is unrepresentable: it never becomes an entry and appears only in
// `rows.json` (216's REQ-CONV-16 default `unrepresentedResponseRows: "raw_table_only"`), which
// carries EVERY row verbatim for the raw ledger view.
//
// Dispositions map by first keyword (R2 §2.4): accept|adapt|rebut|defer|escalate plus the
// declared synonyms decline→rebut, constraint→accept, duplicates…/mooted by/covered by→accept;
// `mapping only`/`(causes…)` rows skip; a cell with more than one keyword (or a keyword that is
// not leading) is MIXED and resolves only via a `disposition` override; a cell with no keyword
// on a finding-resolving row fails the conversion. Statuses: done|verified|deferred|escalated
// (incl. awaiting…/escalated (resolved…))|honored; partial|pending|unresolved|open → open;
// resolved…/rebutted → done; mooted → mooted. `rationale` is the verbatim Disposition cell for
// rebut/escalate only. `moveOrdinal` comes from the plan table's `Discharges` column (row ids,
// not finding ordinals — R2 §2.4: moves' discharges/moots are never emitted as ordinals) or a
// `move-link` override; evidence (the `Evidence` column or a `- **Fn:**` discharge-evidence
// bullet) anchors into v(N+1) through the 215 ladder.
//
// One entry per finding: the first-listed row that resolves to a finding is the entry; every
// later row to the same finding stays verbatim in `rows.json` (R2 §2.4's dedup rule).

import type { Anchor, DispositionKind, DispositionStatus, ResponseLedgerSidecar } from "@rhema/contracts";
import { parseSidecar } from "@rhema/protocols";
import { anchorQuote, type AnchorRung } from "./anchor.js";
import { headingSections, preamble, tables } from "./md/sections.js";
import type { FindingLabel } from "./labels.js";
import type {
  DispositionOverride,
  MinorFindingOverride,
  MoveLinkOverride,
  OverrideBook,
} from "./overrides.js";
import { bad, fail, ok, warn, type Conversion, type Diagnostic } from "./result.js";

// ---- source-cell classification (R2 §2.4 `findingOrdinal` column; prototype `resolveSource`) ----

type SourceClass =
  | { readonly type: "major" | "minor" | "second_read" | "roadmap" | "line_note" | "considered" | "strength"; readonly n: number | null; readonly label?: string }
  | { readonly type: "unrepresentable"; readonly n: null };

const INT = (s: string | undefined): number | null =>
  s !== undefined && /^\d+$/.test(s) ? Number(s) : null;

/** Classify a `Source` cell → which letter/second-read object it answers (verbatim R2 §2.4 +
 *  the prototype grammar). Anything not in the letter vocabulary is unrepresentable — those rows
 *  answer dossier notes (claim ledger, discourse report, argument/craft notes, self, reception,
 *  scorecard) and are raw-table-only, never findings (REQ-CONV-16). */
export function classifySource(cell: string): SourceClass {
  const s = cell.replace(/\*/g, "").trim();
  let m: RegExpExecArray | null;
  if ((m = /(?:Letter|L)\s*(?:§\s*)?(?:Major|MI)\s*(\d+)/i.exec(s)))
    return { type: "major", n: Number(m[1]) };
  if ((m = /(?:Letter|L)\s*(?:§\s*)?[Mm]inor(?:\s+(\d+))?/.exec(s)) ?? /^[Mm]inor\b\s*(\d+)?/.exec(s))
    return { type: "minor", n: INT(m?.[1]) };
  if ((m = /(?:second read|2nd read|SR)\s*(?:Obj(?:ection)?\s*)?\(?([ivx]+|\d+(?:\.\d+)?)\)?/i.exec(s)))
    return { type: "second_read", n: null, label: (m[1] ?? "").trim() };
  if (/the one thing|^one thing/i.test(s)) return { type: "major", n: null };
  if ((m = /open q(?:uestions?)?\.?\s*(\d+)?|\bOQ\s*(\d+)|roadmap|\bRM\s*(\d+)/i.exec(s)))
    return { type: "roadmap", n: INT(m[1] ?? m[2] ?? m[3]) };
  if ((m = /line notes?\s*(\d+)?/i.exec(s)))
    return { type: "line_note", n: INT(m[1]) };
  if ((m = /considered(?:\s+and\s+rejected)?\s*(\d+)?/i.exec(s)))
    return { type: "considered", n: INT(m[1]) };
  if ((m = /strengths?\s*(\d+)?/i.exec(s))) return { type: "strength", n: INT(m[1]) };
  return { type: "unrepresentable", n: null };
}

// ---- disposition + status maps (R2 §2.4, verbatim) ----

const SKIP_DISP_RE = /^\**(mapping only|\(causes)/i;
const KIND_LEAD: readonly [RegExp, DispositionKind][] = [
  [/^\**accept/i, "accept"],
  [/^\**adapt/i, "adapt"],
  [/^\**rebut/i, "rebut"],
  [/^\**defer/i, "defer"],
  [/^\**escalat/i, "escalate"],
  [/^\**decline/i, "rebut"], // POV F-d5
  [/^\**constraint/i, "accept"], // SPD F23
  [/^\**duplicates?/i, "accept"],
  [/^\**mooted\b/i, "accept"],
  [/^\**covered by/i, "accept"],
];
const ANY_KEYWORD =
  /\b(accept|adapt|rebut|defer|escalat\w*|decline|constraint|duplicates?|mooted|covered)\b/i;

const STATUS_LEAD: readonly [RegExp, DispositionStatus][] = [
  [/^\**done/i, "done"],
  [/^\**verified/i, "verified"],
  [/^\**deferred/i, "deferred"],
  [/^\**(escalated|awaiting)/i, "escalated"],
  [/^\**honou?red/i, "honored"],
  [/^\**mooted/i, "mooted"],
  [/^\**proposed/i, "proposed"],
  [/^\**(partial|pending|unresolved|open)/i, "open"],
  [/^\**(resolved|rebutted)/i, "done"],
];

type DispositionMap =
  | { readonly mapped: "skip" }
  | { readonly mapped: "kind"; readonly kind: DispositionKind }
  | { readonly mapped: "mixed" }
  | { readonly mapped: "unmapped" };

export function mapDisposition(cell: string): DispositionMap {
  const t = cell.trim();
  if (SKIP_DISP_RE.test(t)) return { mapped: "skip" };
  const k = KIND_LEAD.find(([re]) => re.test(t));
  if (k) return { mapped: "kind", kind: k[1] };
  return ANY_KEYWORD.test(t) ? { mapped: "mixed" } : { mapped: "unmapped" };
}

export function mapStatus(cell: string): DispositionStatus | null {
  const t = cell.trim();
  const s = STATUS_LEAD.find(([re]) => re.test(t));
  return s ? s[1] : null;
}

// ---- table + list readers ----

interface LedgerRow {
  /** The row's own id (`F1`, `G2`) — the `Discharges` cell and rows.json name it. */
  readonly id: string;
  readonly source: string;
  readonly disposition: string;
  readonly status: string;
  readonly note?: string;
  /** The `Evidence` column cell when the table carries one (GM v2's 6th column). */
  readonly evidence?: string;
  /** The section heading the row's table sits under (`Findings`, `Self-identified`, preamble). */
  readonly section: string;
  readonly line: number;
}

interface ParsedMove {
  readonly ordinal: number;
  readonly title: string;
  readonly type?: string;
  readonly status?: string;
  /** Row ids the move's `Discharges`/`Moots` cells list (never emitted as ordinals, R2 §2.4). */
  readonly discharges: readonly string[];
  readonly moots: readonly string[];
}

const col = (head: readonly string[], re: RegExp) => head.findIndex((h) => re.test(h.trim()));
const cellAt = (row: readonly string[], i: number) =>
  i >= 0 ? (row[i] ?? "").trim() : "";

const ROW_ID_RE = /^[A-Z][A-Za-z0-9-]*$/;

/** Row ids out of a `Discharges`/`Moots` cell (`F1, F3`; `—` and parenthetical tails dropped). */
function dischargeIds(cell: string): string[] {
  return cell
    .split(/[,;]\s*/)
    .map((x) => x.trim().replace(/\s*\(.*\)$/, ""))
    .filter((x) => ROW_ID_RE.test(x) && x !== "—");
}

/** Every `Disposition`-headed table is a findings row table — under `## Findings`/`
 *  ## Findings added`/`## Self-identified` sections or, in the synthetic shape, the preamble. */
function rowTables(markdown: string): { rows: LedgerRow[]; diagnostics: Diagnostic[] } {
  const rows: LedgerRow[] = [];
  const diagnostics: Diagnostic[] = [];
  const regions: { section: string; body: string; line: number }[] = [
    { section: "(preamble)", body: preamble(markdown, 2), line: 1 },
    ...headingSections(markdown, 2).map((s) => ({
      section: s.heading,
      body: s.body,
      line: s.line,
    })),
  ];
  for (const region of regions) {
    for (const t of tables(region.body)) {
      const [head, ...body] = t;
      if (head === undefined) continue;
      const iDisp = col(head, /^disposition/i);
      const iId = col(head, /^(row|id)$/i);
      if (iDisp < 0 || iId < 0) continue; // not a findings table
      const iSrc = col(head, /^source/i);
      const iStat = col(head, /^status/i);
      const iEvid = col(head, /^evidence/i);
      const iNote = col(head, /^note/i);
      for (const r of body) {
        const id = cellAt(r, iId);
        if (id === "" || id === "—") continue;
        rows.push({
          id,
          source: cellAt(r, iSrc),
          disposition: cellAt(r, iDisp),
          status: cellAt(r, iStat),
          ...(cellAt(r, iNote) !== "" ? { note: cellAt(r, iNote) } : {}),
          ...(cellAt(r, iEvid) !== "" ? { evidence: cellAt(r, iEvid) } : {}),
          section: region.section,
          line: region.line,
        });
      }
    }
  }
  if (rows.length === 0)
    diagnostics.push(
      fail("no_row_table", "response ledger carries no `Disposition`-headed row table"),
    );
  return { rows, diagnostics };
}

/** `- **F1:** …` / `- **F1 / F73** — …` bullets under an /evidence|discharge/ heading → per-row
 *  discharge-evidence text (R2 §2.4 `anchor` column). */
function dischargeEvidence(markdown: string): Map<string, string> {
  const out = new Map<string, string>();
  const secs = [
    ...headingSections(markdown, 2),
    ...headingSections(markdown, 3),
  ].filter((s) => /evidence|discharge/i.test(s.heading));
  const ITEM = /^-\s+\*\*([^*]+?)\*\*\s*[:—–-]?\s*(.*)$/;
  for (const sec of secs)
    for (const line of sec.body.split("\n")) {
      const m = ITEM.exec(line.trim());
      if (!m) continue;
      for (const id of (m[1] ?? "").replace(/:$/, "").split(/\s*[/,]\s*/)) {
        const key = id.trim();
        if (key !== "" && !out.has(key)) out.set(key, (m[2] ?? "").trim());
      }
    }
  return out;
}

const MOVE_HEAD_RE = /^\**(M\d+)\s*(.*?)\**$/;
const PLAN_HEADING_RE = /revision plan|move plan|^moves$|plan of attack/i;

/** The `## Revision plan` table → typed moves. `Discharges`/`Moots` cells keep ROW ids. A prose
 *  plan (`M1–M11 all executed (…)`) yields moves with no discharges (R2 §4 — CoR's shape). */
function parseMoves(markdown: string): ParsedMove[] {
  const secs = headingSections(markdown, 2).filter((s) => PLAN_HEADING_RE.test(s.heading));
  const moves: ParsedMove[] = [];
  for (const sec of secs) {
    for (const t of tables(sec.body)) {
      const [head, ...body] = t;
      if (head === undefined) continue;
      const iM = col(head, /^move/i);
      if (iM < 0) continue;
      const iT = col(head, /^title/i);
      const iTy = col(head, /^type/i);
      const iS = col(head, /^status/i);
      const iD = col(head, /^discharges/i);
      const iMo = col(head, /^moots/i);
      const iDesc = col(head, /^(description|notes)/i);
      for (const r of body) {
        const mm = MOVE_HEAD_RE.exec(cellAt(r, iM));
        if (!mm) continue;
        const title = (cellAt(r, iT) !== "" ? cellAt(r, iT) : (mm[2] ?? cellAt(r, iDesc))).trim();
        moves.push({
          ordinal: Number(mm[1]!.slice(1)),
          title: title === "" ? `Move ${mm[1]!.slice(1)}` : title.slice(0, 200),
          ...(cellAt(r, iTy) !== "" ? { type: cellAt(r, iTy) } : {}),
          ...(cellAt(r, iS) !== "" ? { status: cellAt(r, iS) } : {}),
          discharges: iD >= 0 ? dischargeIds(cellAt(r, iD)) : [],
          moots: iMo >= 0 ? dischargeIds(cellAt(r, iMo)) : [],
        });
      }
    }
  }
  if (moves.length === 0 && secs.length > 0) {
    // Prose form (R2 §4 — CoR): `M1–M11 all executed (M1 opening case/signals; M2 …)`.
    for (const sec of secs)
      for (const m of sec.body.matchAll(/\bM(\d+)\s+([^;)\n]+)/g))
        moves.push({
          ordinal: Number(m[1]),
          title: (m[2] ?? "").trim().slice(0, 200),
          discharges: [],
          moots: [],
        });
  }
  return moves.sort((a, b) => a.ordinal - b.ordinal);
}

// ---- the converter ----

export interface ResponseLedgerContext {
  /** The SAME round's `labels.findings` (id/alias → ordinal) from `convertFindings` — the join
   *  vocabulary the `Source` cells resolve against. */
  readonly findingLabels: readonly FindingLabel[];
  /** The sanitized v(N+1) draft — discharge evidence anchors resolve into it. Omit for no
   *  anchors. */
  readonly nextDraftMarkdown?: string;
  /** The per-project overrides; `minor-finding`, `disposition` and `move-link` rows are consumed
   *  here (REQ-CONV-6). */
  readonly overrides?: OverrideBook;
}

/** `rows.json` — every findings-table row verbatim plus its resolution, for the raw ledger view
 *  (REQ-CONV-10/16; 218 renders it). */
export interface ResponseLedgerRows {
  readonly version: 1;
  readonly rows: readonly {
    readonly id: string;
    readonly source: string;
    readonly disposition: string;
    readonly status: string;
    readonly note?: string;
    readonly evidence?: string;
    readonly findingOrdinal: number | null;
    readonly moveOrdinal?: number;
    readonly entry: boolean;
    readonly skip?: string;
  }[];
}

export interface ResponseLedgerMeta {
  readonly rows: number;
  readonly entries: number;
  readonly moves: number;
  /** Row ids whose finding resolved more than once (first-listed won — R2 §2.4 dedup). */
  readonly duplicates: number;
  /** Disposition/status cells that failed to map on finding-resolving rows (target: []). */
  readonly unmappedDispositions: readonly string[];
  readonly unmappedStatuses: readonly string[];
  /** Anchor-rung histogram over resolved evidence anchors. */
  readonly anchorRungs: Readonly<Record<AnchorRung, number>>;
}

export interface ResponseLedgerOutput {
  readonly sidecar: ResponseLedgerSidecar;
  readonly rows: ResponseLedgerRows;
  readonly meta: ResponseLedgerMeta;
}

/** Convert one `<round>-response-ledger.md` into a validated `responseLedgerSidecar` + `rows`.
 *  Fails closed (REQ-CONV-2): a missing row table, an unmapped disposition/status on a
 *  finding-resolving row, a mixed cell without its `disposition` override, an unconsumed
 *  override of this pass's kinds, or a `parseSidecar` `failed` aborts with no partial output. */
export function convertResponseLedger(
  markdown: string,
  ctx: ResponseLedgerContext,
): Conversion<ResponseLedgerOutput> {
  const diagnostics: Diagnostic[] = [];
  const { rows, diagnostics: tableDiags } = rowTables(markdown);
  diagnostics.push(...tableDiags);
  const moves = parseMoves(markdown);
  const evidenceById = dischargeEvidence(markdown);

  // The join vocabulary: labels.json finding ids AND their aliases (`SR 1` rides its major).
  const byLabel = new Map<string, number>();
  for (const l of ctx.findingLabels) {
    byLabel.set(l.id, l.ordinal);
    for (const a of l.aliases ?? []) byLabel.set(a, l.ordinal);
  }
  const findOrdinal = (id: string): number | null => byLabel.get(id) ?? null;

  // Positional counters: the k-th bare `Minor`/open-question/line-note/considered source row in
  // document order maps to `Minor k`/`OQ k`/`Line note k`/`CaR k` (R2 §2.4 positional rule).
  const positional = new Map<string, number>();
  const POSITIONAL_ID: Record<string, string> = {
    minor: "Minor",
    roadmap: "OQ",
    line_note: "Line note",
    considered: "CaR",
  };
  const nextPositional = (type: string): number => {
    const n = (positional.get(type) ?? 0) + 1;
    positional.set(type, n);
    return n;
  };

  const dischargeByRow = new Map<string, number>();
  for (const m of moves) for (const id of m.discharges) {
    if (!dischargeByRow.has(id)) dischargeByRow.set(id, m.ordinal);
  }

  const unmappedDispositions: string[] = [];
  const unmappedStatuses: string[] = [];
  const anchorRungs: Record<AnchorRung, number> = {
    exact: 0,
    "exact-multi": 0,
    normalized: 0,
    fuzzy: 0,
    line: 0,
    section: 0,
    none: 0,
  };

  interface Resolved {
    readonly row: LedgerRow;
    readonly findingOrdinal: number | null;
    readonly kind?: DispositionKind;
    readonly status?: DispositionStatus;
    readonly moveOrdinal?: number;
    readonly anchor?: Anchor;
    readonly skip?: string;
  }
  const resolved: Resolved[] = [];

  for (const row of rows) {
    const src = classifySource(row.source);
    let findingOrdinal: number | null = null;

    if (src.type !== "unrepresentable") {
      // Rule resolution first; the `minor-finding` override is the escape for minors positional
      // matching cannot reach (the override names the labels.json id/alias, never an ordinal).
      let targetId: string | null = null;
      if (src.type === "major") targetId = src.n === null ? "The one thing" : `Major ${src.n}`;
      else if (src.type === "second_read") targetId = `SR ${src.label ?? ""}`;
      else {
        const n = src.n ?? nextPositional(src.type);
        targetId = `${POSITIONAL_ID[src.type]} ${n}`;
      }
      findingOrdinal = findOrdinal(targetId);
      if (findingOrdinal === null) {
        const ov = ctx.overrides?.take(
          "minor-finding",
          (r) => (r as MinorFindingOverride).row === row.id,
        ) as MinorFindingOverride | undefined;
        if (ov) {
          findingOrdinal = findOrdinal(ov.finding);
          if (findingOrdinal === null)
            diagnostics.push(
              fail(
                "override_target_missing",
                `minor-finding override for row ${row.id} names "${ov.finding}", which is not a labels.json id/alias (cite ${ov.cite})`,
              ),
            );
        }
      }
    }

    if (findingOrdinal === null) {
      // Unrepresentable or unresolved — raw-table-only (REQ-CONV-16 default). The disposition
      // cell is never canonicalized: it renders verbatim in rows.json.
      resolved.push({ row, findingOrdinal: null });
      continue;
    }

    // Disposition: skip rows stay raw-only even when the source resolves.
    const disp = mapDisposition(row.disposition);
    if (disp.mapped === "skip") {
      resolved.push({ row, findingOrdinal, skip: "mapping" });
      continue;
    }
    let kind: DispositionKind;
    if (disp.mapped === "kind") kind = disp.kind;
    else if (disp.mapped === "mixed") {
      const ov = ctx.overrides?.take(
        "disposition",
        (r) => (r as DispositionOverride).row === row.id,
      ) as DispositionOverride | undefined;
      if (!ov) {
        unmappedDispositions.push(row.id);
        diagnostics.push(
          fail(
            "disposition_mixed",
            `row ${row.id}: mixed disposition cell "${row.disposition}" resolves only via a disposition override (none found)`,
          ),
        );
        continue;
      }
      kind = ov.disposition;
    } else {
      unmappedDispositions.push(row.id);
      diagnostics.push(
        fail(
          "disposition_unmapped",
          `row ${row.id}: no canonical disposition for "${row.disposition}"`,
        ),
      );
      continue;
    }

    const status = mapStatus(row.status);
    if (status === null) {
      unmappedStatuses.push(row.id);
      diagnostics.push(
        fail("status_unmapped", `row ${row.id}: no canonical status for "${row.status}"`),
      );
      continue;
    }

    // moveOrdinal: first move whose `Discharges` lists the row id; `move-link` override only
    // where a source table already states linkage (never a hand-authored map — REQ-CONV-15).
    let moveOrdinal = dischargeByRow.get(row.id);
    const link = ctx.overrides?.take(
      "move-link",
      (r) => (r as MoveLinkOverride).row === row.id,
    ) as MoveLinkOverride | undefined;
    if (link) moveOrdinal = link.move;

    // Evidence → anchor into v(N+1) (R2 §2.4 `anchor`; §3 ladder).
    const evidenceText = row.evidence ?? evidenceById.get(row.id);
    let anchor: Anchor | undefined;
    let rung: AnchorRung = "none";
    if (evidenceText !== undefined && ctx.nextDraftMarkdown !== undefined) {
      const res = anchorQuote(evidenceText, ctx.nextDraftMarkdown);
      rung = res.rung;
      anchor = res.anchor ?? undefined;
      if (!anchor)
        diagnostics.push(
          warn("anchor_unresolved", `row ${row.id}: evidence did not anchor into the next draft`),
        );
    }
    anchorRungs[rung] += 1;

    resolved.push({ row, findingOrdinal, kind, status, moveOrdinal, anchor });
  }

  // One entry per finding — the first-listed resolved row wins (R2 §2.4 dedup rule).
  const seen = new Set<number>();
  const entries: ResponseLedgerSidecar["entries"][number][] = [];
  const outRows: ResponseLedgerRows["rows"][number][] = [];
  let duplicates = 0;
  for (const r of resolved) {
    let entry = false;
    if (r.findingOrdinal !== null && r.skip === undefined && r.kind !== undefined) {
      if (!seen.has(r.findingOrdinal)) {
        seen.add(r.findingOrdinal);
        entry = true;
        entries.push({
          findingOrdinal: r.findingOrdinal,
          disposition: {
            kind: r.kind,
            status: r.status ?? "open",
            ...(r.kind === "rebut" || r.kind === "escalate"
              ? { rationale: r.row.disposition }
              : {}),
            ...(r.moveOrdinal !== undefined ? { moveOrdinal: r.moveOrdinal } : {}),
          },
          ...(r.anchor !== undefined ? { anchor: r.anchor } : {}),
        });
      } else duplicates += 1;
    }
    outRows.push({
      id: r.row.id,
      source: r.row.source,
      disposition: r.row.disposition,
      status: r.row.status,
      ...(r.row.note !== undefined ? { note: r.row.note } : {}),
      ...(r.row.evidence !== undefined ? { evidence: r.row.evidence } : {}),
      findingOrdinal: r.findingOrdinal,
      ...(r.moveOrdinal !== undefined ? { moveOrdinal: r.moveOrdinal } : {}),
      entry,
      ...(r.skip !== undefined ? { skip: r.skip } : {}),
    });
  }

  // REQ-CONV-6: an unconsumed override row scoped to a row THIS ledger carries fails the
  // conversion (kind- + row-scoped so one OverrideBook flows through the pipeline's ledgers —
  // a row meant for another ledger's pass is not this pass's to judge; the pipeline's
  // end-of-run check still fails any row no pass consumed).
  const rowIds = new Set(rows.map((r) => r.id));
  for (const u of ctx.overrides?.unconsumed() ?? [])
    if (
      (u.kind === "minor-finding" || u.kind === "disposition" || u.kind === "move-link") &&
      rowIds.has(u.row)
    )
      diagnostics.push(
        fail("override_unconsumed", `stale override row (cite ${u.cite}) was never consumed`),
      );

  if (diagnostics.some((d) => d.severity === "error")) return bad(diagnostics);

  const sidecarJson = {
    sidecar: "response_ledger",
    version: 1,
    entries,
    ...(moves.length > 0
      ? {
          moves: moves.map((m) => ({
            ordinal: m.ordinal,
            title: m.title,
            ...(m.type !== undefined ? { type: m.type } : {}),
            ...(m.status !== undefined ? { status: m.status } : {}),
          })),
        }
      : {}),
  };
  const gate = parseSidecar("response-ledger.json", { json: sidecarJson });
  if (gate.parseStatus === "failed") {
    for (const e of gate.errors) diagnostics.push(fail("sidecar_failed", e));
    return bad(diagnostics);
  }

  return ok(
    {
      sidecar: gate.value as ResponseLedgerSidecar,
      rows: { version: 1, rows: outRows },
      meta: {
        rows: rows.length,
        entries: entries.length,
        moves: moves.length,
        duplicates,
        unmappedDispositions,
        unmappedStatuses,
        anchorRungs,
      },
    },
    diagnostics,
  );
}
