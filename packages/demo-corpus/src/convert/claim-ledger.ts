// Claim-ledger markdown → `claimLedgerSidecar` (R2 §1 heading grammar + §2.1 field mapping;
// REQ-CONV-2/3/4/5/11). Input is the SANITIZED ledger plus ctx; output is pure
// `{sidecar, labels, meta}` + diagnostics — no I/O, no clock, no randomness, stable ordinals.
//
// Field rules (R2 §2.1, normative): `ordinal` is 0-based document order with the source id kept in
// `labels.json`; `text` is the joined `>` quote lines with the trailing locator stripped (verbatim
// otherwise); `tier` is the FINAL tier when the heading escalates; the verdict's leading keyword is
// canonicalized by the explicit table and the remainder is preserved in `note`; `kind` and
// `sourceCheck` are OMITTED (nothing in the markdown declares them); every evidence link, a
// `(reused note: slug)` URL recovered through the source-note index, and an `as in <ID>`
// back-reference becomes a `sources[]` row at the verdict-determining stance (`contextualizes` when
// the verdict has none) — `url`/`normalizedUrl`/`accessedAt` then equal `sources[0]`, so the real
// parser's REQ-OBJ-18 check holds by construction. `accessedAt` is the ledger's declared check
// session date at T00:00:00Z — a declared approximation (R2 §7 R2), never a fetch timestamp.

import type { Anchor, ClaimLedgerSidecar, ClaimSource, ClaimVerdict } from "@rhema/contracts";
import { normalizeUrl } from "@rhema/contracts";
import { parseSidecar, verdictDeterminingStance } from "@rhema/protocols";
import { anchorQuote, type AnchorRung } from "./anchor.js";
import { headingSections, labelBullets, links, preamble } from "./md/sections.js";
import { lineHintOf, stripLocator } from "./md/quotes.js";
import type { OverrideBook } from "./overrides.js";
import type { SourceNote } from "./source-note.js";
import { bad, fail, ok, warn, type Conversion, type Diagnostic } from "./result.js";

// The R2 §1 heading grammar: `### ID (paren) · Tier n (qualifier) · Verdict text`. Absorbs
// section-style ids (`III16`, `VII3-scope`, `P4`, `X11`), lettered sub-claims (`C23a`),
// parentheticals (`(reuse C2, fix checked)`) and tier qualifiers (`Tier 2, escalated to Tier 1`,
// `Tier 2 (escalated: reputationally protective)`, `Tier 1 (epigraph)`).
const HEAD_RE = /^([A-Z]+\d+[a-z]?(?:-[a-z]+)?)\s*(\([^)]*\))?\s*·\s*Tier\s+(\d)([^·]*)·\s*(.+)$/;

// Non-claim H3s the grammar legitimately does not cover — appendices rendered raw (R2 §1/§6).
const APPENDIX_H3_RE = /^(skipped|reference checks|references checked|reuse confirmations)$/i;

/** The explicit verdict table (REQ-CONV-3): leading keyword → canonical verdict. Anchored at the
 *  start so "the first keyword wins" for mixed free text; the remainder is the qualifier. Ordered —
 *  a genuine multi-keyword conflict is decided by position in the text, not this list. */
const VERDICT_RULES: readonly [RegExp, ClaimVerdict][] = [
  [/^substantially accurate\b/i, "substantially_accurate"],
  // Longest keyword first: "Misleading in context" consumes the full phrase so the qualifier
  // remainder is not a spurious "in context".
  [/^misleading in context\b/i, "misleading_in_context"],
  [/^misleading\b/i, "misleading_in_context"],
  [/^unsupported\b/i, "unsupported"],
  [/^contradicted\b/i, "contradicted"],
  [/^unverifiable\b/i, "unverifiable"],
  [/^verified\b/i, "verified"],
  // Non-verdicts map to `unverifiable` (R2 §1, the fixture precedent CoR C37).
  [/^skipped\b/i, "unverifiable"],
  [/^\(not scored[^)]*\)/i, "unverifiable"],
];

/** Leading-keyword canonicalization; `remainder` is whatever followed the keyword, verbatim. */
export function canonicalizeVerdict(text: string): {
  verdict: ClaimVerdict | null;
  remainder: string;
} {
  const t = text.trim();
  for (const [re, verdict] of VERDICT_RULES) {
    const m = re.exec(t);
    if (m) return { verdict, remainder: t.slice(m[0].length).trim() };
  }
  return { verdict: null, remainder: t };
}

const INVENTORY_RE = /Claims inventoried:\s*(\d+)/i;
const CHECK_DATE_RE = /(?:Verified|Checked)\s+(\d{4}-\d{2}-\d{2})/;
const ISO_DATE_RE = /\b(20\d\d-\d\d-\d\d)\b/;

/** The ledger's declared check date: `Checked|Verified YYYY-MM-DD`, else the first ISO date in the
 *  header preamble (R2 §1 "Dates" — CoR's only date is the session-opened line). */
export function ledgerCheckDate(markdown: string): string | null {
  const head = preamble(markdown, 3);
  const m = CHECK_DATE_RE.exec(head) ?? ISO_DATE_RE.exec(head.split("\n").slice(0, 12).join("\n"));
  return m ? (m[1] ?? null) : null;
}

/** `Claims inventoried: N` from the header — goes to `inventoryCount` verbatim (it legitimately
 *  differs from the headed-row count, R2 §2.1). */
export function ledgerInventoryCount(markdown: string): number | null {
  const m = INVENTORY_RE.exec(preamble(markdown, 3));
  return m ? Number(m[1]) : null;
}

// Note-keeping rules (R2 §2.1): `Fix:` first, then `Finding:`, then other labels, verbatim;
// `Source:`/`Evidence:` bullets are consumed as evidence, not note text.
const FIX_LABEL_RE = /^fix\b/i;
const FINDING_LABEL_RE = /^finding\b/i;
const NOTE_EXCLUDED = /^(source|evidence)\b/i;

const REUSED_NOTE_RE = /reused notes?:\s*([a-z0-9\-;,\s]+)/gi;
const AS_IN_RE = /\bas in\s+([A-Z]+\d+[a-z]?(?:-[a-z]+)?)\b/;
const REF_CLAIM_RE = /^Ref\s*\[\d+\]/;

export interface ClaimLedgerContext {
  /** The sanitized draft this review read — anchors resolve against it. Omit to emit no anchors. */
  readonly draftMarkdown?: string;
  /** The source-note index (for `(reused note: slug)` evidence recovery). */
  readonly sourceNotes?: ReadonlyMap<string, SourceNote>;
  /** The per-project overrides; `verdict-rescore` rows are consumed here (REQ-CONV-6). */
  readonly overrides?: OverrideBook;
}

/** `labels.json` — the source-id side-table (REQ-CONV-4): 0-based emitted ordinal ↔ the markdown's
 *  own id (`C23a`, `III16`, `VII3-scope`), kept for display. 216 extends entries additively with
 *  import-rule field markers. */
export interface ClaimLedgerLabels {
  readonly version: 1;
  readonly claims: readonly { ordinal: number; id: string }[];
}

export interface ClaimLedgerMeta {
  readonly checkDate: string | null;
  /** The header's declared inventory count (≠ entries where appendices hold extra rows). */
  readonly inventoryCount: number | null;
  /** Claim-shaped H3 headings seen. */
  readonly headings: number;
  /** Claims emitted. */
  readonly entries: number;
  /** Headings that parsed but whose verdict text was unmapped (target: []). */
  readonly unmappedVerdicts: readonly string[];
  /** Anchor-rung histogram over emitted claims (the golden-pinned signal). */
  readonly anchorRungs: Readonly<Record<AnchorRung, number>>;
  /** Summary-vs-parsed verdict reconciliation: true/false when the ledger declares a Summary, null
   *  when it does not. */
  readonly summaryReconciled: boolean | null;
  /** The parsed Summary counts (verdict → n), for the raw view. */
  readonly summaryCounts: Readonly<Record<string, number>>;
}

export interface ClaimLedgerOutput {
  readonly sidecar: ClaimLedgerSidecar;
  readonly labels: ClaimLedgerLabels;
  readonly meta: ClaimLedgerMeta;
}

interface Evidence {
  readonly url: string;
  readonly via: "link" | "note" | "as_in";
}

/** Convert one sanitized `01-claim-ledger.md` into a validated `claimLedgerSidecar` + labels. Any
 *  failure — an unmapped verdict, an unparseable non-appendix heading, an unconsumed override, or a
 *  `parseSidecar` `failed` — aborts with `ok:false` and no partial output (REQ-CONV-2/3/6). */
export function convertClaimLedger(
  markdown: string,
  ctx: ClaimLedgerContext = {},
): Conversion<ClaimLedgerOutput> {
  const diagnostics: Diagnostic[] = [];
  const checkDate = ledgerCheckDate(markdown);
  const inventoryCount = ledgerInventoryCount(markdown);
  const accessedAt = checkDate === null ? undefined : `${checkDate}T00:00:00Z`;
  if (checkDate === null) diagnostics.push(warn("no_check_date", "no `Checked|Verified` date or header ISO date — sources[] omitted"));

  const sections = headingSections(markdown, 3);
  const { counts: summaryCounts, skippedIds: summarySkipped } = parseSummaryCounts(
    markdown,
    diagnostics,
  );

  interface Parsed {
    row: Record<string, unknown>;
    id: string;
    ev: readonly Evidence[];
    rung: AnchorRung;
    verdict: ClaimVerdict;
    /** verdict text was a non-score (`Skipped`, `(not scored …)`) — emits `unverifiable`; the
     *  summary's `- Skipped (with reason): <ids>` declarations count only these ids (a skipped
     *  bullet may name checked claims in its reason prose — POV's `C17–C26, C45, C46`). */
    skipped: boolean;
  }
  const parsed: Parsed[] = [];
  const byId = new Map<string, Parsed>();
  const unmappedVerdicts: string[] = [];
  const anchorRungs: Record<AnchorRung, number> = {
    exact: 0,
    "exact-multi": 0,
    normalized: 0,
    fuzzy: 0,
    line: 0,
    section: 0,
    none: 0,
  };

  for (const sec of sections) {
    if (APPENDIX_H3_RE.test(sec.heading)) continue;
    const m = HEAD_RE.exec(sec.heading);
    if (!m) {
      diagnostics.push(
        fail("heading_unparsed", `H3 does not match the claim grammar (line ${sec.line}): ${sec.heading}`),
      );
      continue;
    }
    const id = m[1] ?? "";
    const paren = m[2] ?? "";
    const tierDeclared = Number(m[3]);
    const tierExtra = (m[4] ?? "").trim().replace(/^,\s*/, "");
    const verdictText = (m[5] ?? "").trim();

    // Final tier wins on escalation (R2 §2.1); the qualifier itself is preserved verbatim in note.
    const escal = /escalated to Tier (\d)/i.exec(tierExtra);
    const tier = escal ? Number(escal[1]) : tierDeclared;

    const { verdict: parsedVerdict, remainder: verdictQualifier } = canonicalizeVerdict(verdictText);
    let verdict = parsedVerdict;
    if (verdict === null) {
      unmappedVerdicts.push(id);
      diagnostics.push(
        fail("verdict_unmapped", `claim ${id}: no canonical verdict for "${verdictText}" (line ${sec.line})`),
      );
      continue;
    }

    // A summary-level re-score overrides the heading parse (REQ-CONV-6; consumption-tracked).
    const rescore = ctx.overrides?.take(
      "verdict-rescore",
      (r) => r.kind === "verdict-rescore" && r.claim === id,
    );
    if (rescore) verdict = rescore.verdict;

    const quoteLines = sec.body
      .split("\n")
      .filter((l) => l.startsWith(">"))
      .map((l) => l.replace(/^>\s?/, ""));
    const quoteRaw = quoteLines.join(" ").trim();
    const text = stripLocator(quoteRaw);
    if (text === "") {
      diagnostics.push(fail("no_quote", `claim ${id}: entry carries no \`>\` quote line (line ${sec.line})`));
      continue;
    }

    // Leading standalone parenthetical body lines (`(not scored — evaluative)`) are qualifiers.
    const bodyHead = sec.body.split("\n").find((l) => l.trim() !== "") ?? "";
    const bodyParen = /^\(.*\)$/.test(bodyHead.trim()) ? bodyHead.trim() : "";

    // Evidence: links + reused-note URLs + `as in <ID>` copies, deduped by url, first wins.
    const noQuote = sec.body
      .split("\n")
      .filter((l) => !l.startsWith(">"))
      .join("\n");
    const ev: Evidence[] = links(noQuote).map((l) => ({ url: l.url, via: "link" }));
    for (const r of noQuote.matchAll(REUSED_NOTE_RE)) {
      for (const s of (r[1] ?? "").split(/[;,]/).map((x) => x.trim()).filter(Boolean)) {
        const url = ctx.sourceNotes?.get(s)?.url;
        if (url) ev.push({ url, via: "note" });
        else
          diagnostics.push(
            warn("note_unresolved", `claim ${id}: reused note "${s}" has no indexed source URL`),
          );
      }
    }
    const asIn = AS_IN_RE.exec(noQuote);
    if (asIn) {
      const ref = byId.get(asIn[1] ?? "");
      if (ref) ev.push(...ref.ev.map((e) => ({ ...e, via: "as_in" as const })));
      else diagnostics.push(warn("as_in_unresolved", `claim ${id}: "as in ${asIn[1]}" has no earlier claim`));
    }
    const seen = new Set<string>();
    const evidence = ev.filter((e) => {
      if (!e.url || seen.has(e.url)) return false;
      seen.add(e.url);
      return true;
    });

    const sources: ClaimSource[] | undefined =
      accessedAt !== undefined && evidence.length > 0
        ? evidence.map((e) => ({
            url: e.url,
            normalizedUrl: normalizeUrl(e.url),
            accessedAt,
            stance: verdictDeterminingStance(verdict) ?? "contextualizes",
          }))
        : undefined;
    if (evidence.length > 0 && accessedAt === undefined)
      diagnostics.push(warn("no_check_date", `claim ${id}: evidence URLs present but no check date — sources[] omitted`));
    if (evidence.length === 0)
      diagnostics.push(warn("no_evidence", `claim ${id}: no evidence URL (link, reused note, or as-in)`));

    // note = heading qualifiers + verdict remainder (verbatim), then Fix / Finding / other bullets.
    const bullets = labelBullets(sec.body);
    const noteBits: string[] = [];
    const headBits = [paren, tierExtra, verdictQualifier, bodyParen].filter(Boolean);
    if (rescore)
      headBits.unshift(`(re-scored ${rescore.verdict} per the ledger summary; cite ${rescore.cite})`);
    if (headBits.length > 0) noteBits.push(headBits.join(" "));
    const noteBullets = [
      ...bullets.filter((b) => b.label !== null && FIX_LABEL_RE.test(b.label)),
      ...bullets.filter((b) => b.label !== null && FINDING_LABEL_RE.test(b.label)),
      ...bullets.filter(
        (b) =>
          b.label !== null &&
          !FIX_LABEL_RE.test(b.label) &&
          !FINDING_LABEL_RE.test(b.label) &&
          !NOTE_EXCLUDED.test(b.label),
      ),
    ];
    for (const b of noteBullets) noteBits.push(`${b.label}: ${b.text}`);
    const note = noteBits.join("\n");

    // The anchor resolves on the sanitized draft (References tail only for `Ref [n]` claims).
    let anchor: Anchor | undefined;
    let rung: AnchorRung = "none";
    if (ctx.draftMarkdown !== undefined) {
      const res = anchorQuote(quoteRaw, ctx.draftMarkdown, {
        lineHint: lineHintOf(quoteRaw),
        referenceClaim: REF_CLAIM_RE.test(text) || REF_CLAIM_RE.test(sec.heading),
      });
      rung = res.rung;
      anchor = res.anchor ?? undefined;
      if (!anchor)
        diagnostics.push(warn("anchor_unresolved", `claim ${id}: quote did not anchor into the draft`));
    }
    anchorRungs[rung] += 1;

    const entry: Parsed = {
      id,
      ev: evidence,
      rung,
      verdict,
      skipped: /^(skipped\b|\(not scored)/i.test(verdictText),
      row: {
        ordinal: parsed.length,
        text,
        tier,
        verdict,
        ...(sources?.[0]
          ? {
              url: sources[0].url,
              normalizedUrl: sources[0].normalizedUrl,
              accessedAt: sources[0].accessedAt,
            }
          : {}),
        ...(note !== "" ? { note } : {}),
        ...(sources ? { sources } : {}),
        ...(anchor ? { anchor } : {}),
        humanAdded: false,
      },
    };
    parsed.push(entry);
    byId.set(id, entry);
  }

  // Summary reconciliation — a diagnostic, never a gate (R2 §2.1 "the summary-count check").
  // Summary zero-counts (`Contradicted: 0`) are stripped for the comparison — emitted maps only
  // carry verdicts that occurred. (`Skipped`-verdict headings emit `unverifiable`, and the
  // summary's own `- Skipped (with reason): <ids>` bullets are counted into `unverifiable` by
  // parseSummaryCounts — both sides count skipped claims the same way.)
  const emittedCounts: Record<string, number> = {};
  for (const p of parsed) emittedCounts[p.verdict] = (emittedCounts[p.verdict] ?? 0) + 1;
  // A skipped declaration counts into `unverifiable` only when its id is an emitted claim whose
  // verdict was itself skipped (headed, like GM's C71/C75 — appendix skipped bullets like CoR's
  // C37/C39 are never emitted, and checked claims named in the reason prose are not skipped).
  const reconciledSummary = { ...summaryCounts };
  for (const id of summarySkipped)
    if (byId.get(id)?.skipped === true)
      reconciledSummary.unverifiable = (reconciledSummary.unverifiable ?? 0) + 1;
  const nonzeroSummary = Object.fromEntries(
    Object.entries(reconciledSummary).filter(([, n]) => n > 0),
  );
  let summaryReconciled: boolean | null = null;
  if (Object.keys(summaryCounts).length > 0) {
    summaryReconciled =
      JSON.stringify(sortedCounts(emittedCounts)) ===
      JSON.stringify(sortedCounts(nonzeroSummary));
    if (!summaryReconciled)
      diagnostics.push(
        warn(
          "summary_mismatch",
          `ledger summary ${JSON.stringify(summaryCounts)} ≠ parsed ${JSON.stringify(emittedCounts)}`,
        ),
      );
  }

  // REQ-CONV-6: an unconsumed override row of THIS pass's kinds fails the conversion. (Kind-
  // scoped so one OverrideBook can flow through the pipeline's passes — 216's findings pass owns
  // the `reconciliation` rows; a book carrying them must not trip this pass. The pipeline's own
  // end-of-run check still fails any row no pass consumed.)
  for (const row of ctx.overrides?.unconsumed() ?? [])
    if (row.kind === "verdict-rescore")
      diagnostics.push(
        fail("override_unconsumed", `stale override row (cite ${row.cite}) was never consumed`),
      );

  if (diagnostics.some((d) => d.severity === "error")) return bad(diagnostics);

  const sidecarJson: Record<string, unknown> = {
    sidecar: "claim_ledger",
    version: 1,
    ...(inventoryCount !== null ? { inventoryCount } : {}),
    claims: parsed.map((p) => p.row),
  };
  const gate = parseSidecar("01-claim-ledger.json", { json: sidecarJson });
  if (gate.parseStatus === "failed") {
    for (const e of gate.errors) diagnostics.push(fail("sidecar_failed", e));
    return bad(diagnostics);
  }

  const labels: ClaimLedgerLabels = {
    version: 1,
    claims: parsed.map((p, i) => ({ ordinal: i, id: p.id })),
  };
  return ok(
    {
      sidecar: gate.value as ClaimLedgerSidecar,
      labels,
      meta: {
        checkDate,
        inventoryCount,
        headings: parsed.length + unmappedVerdicts.length,
        entries: parsed.length,
        unmappedVerdicts,
        anchorRungs,
        summaryReconciled,
        summaryCounts,
      },
    },
    diagnostics,
  );
}

function sortedCounts(counts: Record<string, number>): Record<string, number> {
  return Object.fromEntries(Object.entries(counts).sort(([a], [b]) => a.localeCompare(b)));
}

// A `label: n` (colon form) or `label n` (space form) count candidate inside a `·`-part line.
const COUNT_COLON_RE = /([A-Za-z][A-Za-z ]*?)\s*:\s*(\d+)/g;
const COUNT_SPACE_RE = /([A-Za-z][A-Za-z ]*?)\s+(\d+)/g;

/** `## Summary` → `{verdict: n}` through the same canonicalization table (R2 §5 (ii)). Real
 *  ledgers wrap the `·`-item line before `Verified:`/`Unverifiable:` and annotate counts
 *  (`Misleading in context: 1 (C15, …)`), so each `·`-part is scanned line by line for the FIRST
 *  count candidate whose label canonicalizes — leading non-verdict labels (`Claims inventoried`,
 *  `Checked`, tier counts) are skipped. A part carrying a colon-form candidate no verdict claims
 *  warns (`summary_label_unmapped`). */
function parseSummaryCounts(
  markdown: string,
  diagnostics: Diagnostic[],
): { counts: Record<string, number>; skippedIds: readonly string[] } {
  const summary = headingSections(markdown, 2).find((s) => /^summary\b/i.test(s.heading));
  if (!summary) return { counts: {}, skippedIds: [] };
  const counts: Record<string, number> = {};
  for (const part of summary.body.split("·")) {
    let counted = false;
    let colonCandidate: string | null = null;
    for (const line of part.split("\n")) {
      if (counted) continue; // a `·`-part carries at most one verdict-count item
      for (const re of [COUNT_COLON_RE, COUNT_SPACE_RE]) {
        re.lastIndex = 0;
        let m: RegExpExecArray | null;
        while (!counted && (m = re.exec(line)) !== null) {
          const label = (m[1] ?? "").trim();
          const n = Number(m[2]);
          if (re === COUNT_COLON_RE && colonCandidate === null) colonCandidate = label;
          const { verdict } = canonicalizeVerdict(label);
          if (verdict === null) continue;
          counts[verdict] = (counts[verdict] ?? 0) + n;
          counted = true;
        }
      }
    }
    if (!counted && colonCandidate !== null)
      diagnostics.push(
        warn("summary_label_unmapped", `Summary label "${colonCandidate}" is not a canonical verdict`),
      );
  }
  return { counts, skippedIds: summarySkippedIds(summary.body) };
}

/** `- Skipped (with reason): C71 (…); C75 (…)` — a skipped declaration is an id list (possibly
 *  spanning wrapped lines), not a `label: n` item. The ids are returned for the reconciliation
 *  to count into `unverifiable` ONLY when the id is an emitted (headed) claim: CoR's skipped
 *  claims live in a `### Skipped` appendix and are never emitted, while GM v1's C71/C75 are
 *  headed claims emitted `unverifiable`. */
function summarySkippedIds(body: string): readonly string[] {
  const ids: string[] = [];
  const lines = body.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /skipped[^:：]*:\s*(.+)$/i.exec(lines[i]!);
    if (m === null || /^\s*\d/.test(m[1]!)) continue; // `Skipped: n` stays a normal count item
    let j = i;
    while (j < lines.length && (j === i || /^\s+\S/.test(lines[j]!))) {
      ids.push(...(lines[j]!.match(/\b[A-Z]+\d+[a-z]?\b/g) ?? []));
      j++;
    }
  }
  return ids;
}
