// `04-draft-ledger.md` → row-indexed `## Sections` rows for the raw view (R2 §5 `draft-ledger.ts`;
// REQ-CONV-17). The demo renders draft ledgers RAW — there is no draft-ledger sidecar — and this
// reader deliberately does NOT call `parseDraftLedgerSections` (the upstream parser skips
// non-integer `#` cells, reading 1 of 17–18 real rows on Roman-numeral ledgers; the fix is
// deferred — `D-R7DEM.2c-1` → BL-100). `ordinal` is the table-row index (0-based, plan order);
// every cell is kept verbatim so Roman `#` cells (`I`, `II`, …) survive untouched.

import { headingSections, tables } from "./md/sections.js";

export interface DraftLedgerRow {
  /** 0-based table-row index — position, never the `#` cell's parsed value. */
  readonly ordinal: number;
  /** The `#` cell verbatim (`I`, `7`, `III-2` — kept raw; the parser bug is exactly about this). */
  readonly hash: string;
  readonly title: string;
  readonly budget?: number;
  readonly actual?: number;
  readonly note?: string;
}

export interface DraftLedgerRows {
  readonly version: 1;
  readonly rows: readonly DraftLedgerRow[];
}

const NUM = (v: string | undefined): number | undefined => {
  const t = (v ?? "").replace(/,/g, "").trim();
  if (t === "" || t === "—") return undefined;
  const n = Number(t);
  return Number.isFinite(n) ? n : undefined;
};

/** The `## Sections` table → row-indexed rows. A missing table yields an empty row set — the
 *  raw view renders the markdown regardless, and the pipeline emits the (possibly empty) file
 *  only when the ledger exists. */
export function draftLedgerRows(markdown: string): DraftLedgerRows {
  const sec = headingSections(markdown, 2).find((s) => /^sections\b/i.test(s.heading));
  const rows: DraftLedgerRow[] = [];
  if (sec) {
    for (const t of tables(sec.body)) {
      const [head, ...body] = t;
      if (head === undefined) continue;
      const iHash = head.findIndex((h) => /^#$/.test(h.trim()));
      if (iHash < 0) continue;
      const iTitle = head.findIndex((h) => /^(§|section|title)/i.test(h.trim()));
      const iBudget = head.findIndex((h) => /^budget/i.test(h.trim()));
      const iActual = head.findIndex((h) => /^actual/i.test(h.trim()));
      const iNote = head.findIndex((h) => /^(note|status)/i.test(h.trim()));
      for (const r of body) {
        const hash = (r[iHash] ?? "").trim();
        if (hash === "") continue;
        rows.push({
          ordinal: rows.length,
          hash,
          title: ((r[iTitle] ?? "") || "").replace(/\*\*([^*]+)\*\*/g, "$1").trim(),
          ...(NUM(r[iBudget]) !== undefined ? { budget: NUM(r[iBudget]) } : {}),
          ...(NUM(r[iActual]) !== undefined ? { actual: NUM(r[iActual]) } : {}),
          ...(((r[iNote] ?? "") || "").trim() !== "" ? { note: (r[iNote] ?? "").trim() } : {}),
        });
      }
    }
  }
  return { version: 1, rows };
}
