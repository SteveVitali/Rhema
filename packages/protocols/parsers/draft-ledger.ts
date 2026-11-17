// The `04-draft-ledger.md` `## Sections` table parser (P1.10; REQ-WF-4/7). The draft ledger is the
// Drafter's compaction-proof working state — one row per planned section, `planned → drafted →
// seams-read → verified`, `cut`/`deferred` terminal. Two consumers read the same rows:
//   • the `draft_sections_eq_plan` completion predicate (drafted-row count == plan's section count);
//   • the `section.drafted` run events the Page's streaming/budget surface renders — emitted in
//     plan order (the table's `#` order), one per row that has passed `planned`, never from agent
//     text (the machine-generated event is the table row, not prose).
// Keeping the parse here (not in the orchestrator) keeps the §12.2 vocabulary testable next to the
// ported ledger reference it mirrors (`skills/draft-from-outline/references/draft-ledger.md`).

/** One `## Sections` row: the plan-ordinal, the title the event surfaces as `sectionRef`, the
 *  per-section word budget + actual, and the ledger status word. */
export interface DraftLedgerSection {
  /** the plan-order index (the table's `#` cell). */
  readonly ordinal: number;
  /** the section title (trimmed; "(cut) …" titles keep their marker). */
  readonly title: string;
  /** `Budget` cell — the per-section word budget the Page's budget bar fills against. */
  readonly budgetWords?: number;
  /** `Actual` cell — drafted word count (absent while `planned`/`cut`/`deferred`). */
  readonly actualWords?: number;
  /** `Status` cell, lowercased (`planned|drafted|seams-read|verified|cut|deferred`). */
  readonly status: string;
}

/** Statuses that count as "the section was drafted" (past `planned`, not terminal-cut). */
export const DRAFTED_STATUSES: ReadonlySet<string> = new Set(["drafted", "seams-read", "verified"]);

// BL-100 / REQ-CONV-17 (D-R7DEM.2c-1): real ledgers ordinal the `#` column in Roman numerals
// (`I`…`XVIII`) — a `Number()`-only read silently kept 1 of 17–18 rows. The cell accepts either
// form and always yields the integer plan-order index.
const ROMAN_RE = /^M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/;
const ROMAN_VAL: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 };

/** Parse a `#` cell: integer literal or strict Roman numeral → its integer ordinal. */
function parseOrdinalCell(cell: string): number | undefined {
  if (/^\d+$/.test(cell)) return Number(cell);
  if (!ROMAN_RE.test(cell)) return undefined;
  let total = 0;
  for (let i = 0; i < cell.length; i++) {
    const cur = ROMAN_VAL[cell[i]!]!;
    total += i + 1 < cell.length && ROMAN_VAL[cell[i + 1]!]! > cur ? -cur : cur;
  }
  return total;
}

/**
 * Parse the `## Sections` table out of a `04-draft-ledger.md` body. Rows arrive in table order —
 * the ledger writes them in plan order (`#` ascending), which is the emission order the Page's
 * per-section stream expects. A missing/malformed table yields `[]` (never throws — this feeds an
 * oracle leg, which must fail the predicate on absence rather than crash).
 */
export function parseDraftLedgerSections(markdown: string): DraftLedgerSection[] {
  const lines = markdown.split(/\r?\n/);
  const start = lines.findIndex((l) => /^##\s+Sections\b/i.test(l));
  if (start < 0) return [];
  const rows: DraftLedgerSection[] = [];
  let tableStarted = false;
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (line.startsWith("#")) break; // next heading ends the table
    if (line === "") {
      if (tableStarted) break; // a blank line AFTER the table ends it (the upstream layout leaves one after `## Sections`)
      continue;
    }
    if (!line.startsWith("|")) continue; // the "Status vocabulary:" note line, etc.
    tableStarted = true;
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    // header (`| # | Section | …`) and the `|---|` rule carry no ordinal cell — skip them.
    const ordinal = parseOrdinalCell(cells[0] ?? "");
    if (ordinal === undefined) continue;
    const num = (v: string | undefined): number | undefined => {
      const n = Number((v ?? "").replace(/,/g, ""));
      return Number.isFinite(n) && (v ?? "") !== "" && (v ?? "") !== "—" ? n : undefined;
    };
    rows.push({
      ordinal,
      title: (cells[1] ?? "").trim(),
      ...(num(cells[3]) != null ? { budgetWords: num(cells[3]) } : {}),
      ...(num(cells[4]) != null ? { actualWords: num(cells[4]) } : {}),
      status: (cells[5] ?? "").trim().toLowerCase(),
    });
  }
  return rows.sort((a, b) => a.ordinal - b.ordinal);
}

/** The count of rows that have been drafted (status past `planned`, not `cut`/`deferred`). */
export function draftedSectionCount(markdown: string): number {
  return parseDraftLedgerSections(markdown).filter((s) => DRAFTED_STATUSES.has(s.status)).length;
}
