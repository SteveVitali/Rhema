// data.csv ⇄ spec binding (§7.5): the honesty step's `data.csv` is the figure's data of record —
// shown to the user before render, hashed into provenance, and the source the spec binds. A spec
// that names `data.url` ("data.csv") gets the CSV INLINED as `data.values` at render time, so the
// canonical SVG never depends on a fetch (deterministic, REQ-VIZ-8). `d3-dsv`'s csvParse does the
// RFC-4180 quoting the pod's hand-rolled text can't be trusted to get right.

import { csvParse, autoType } from "d3-dsv";

/** Parse a `data.csv` body into row objects, number-typing numeric columns. */
export function parseFigureCsv(csv: string): Record<string, unknown>[] {
  return csvParse(csv, autoType) as unknown as Record<string, unknown>[];
}

/**
 * Return a copy of `spec` with any `data.url` replaced by the CSV's parsed `values` (and nested
 * composition specs recursed). A spec already carrying `data.values` passes through untouched —
// embedding is the preferred form; inlining is the compat leg.
 */
export function inlineCsvData(spec: unknown, csv: string): unknown {
  if (typeof spec !== "object" || spec === null || Array.isArray(spec)) return spec;
  const rows = parseFigureCsv(csv);
  const walk = (node: unknown): unknown => {
    if (typeof node !== "object" || node === null || Array.isArray(node)) return node;
    const rec = { ...(node as Record<string, unknown>) };
    if (rec["data"] != null && typeof rec["data"] === "object" && !Array.isArray(rec["data"])) {
      const d = rec["data"] as Record<string, unknown>;
      if (typeof d["url"] === "string" && d["values"] == null) {
        rec["data"] = { ...d, values: rows };
        delete (rec["data"] as Record<string, unknown>)["url"];
      }
    }
    for (const k of Object.keys(rec)) {
      if (k === "data") continue;
      const v = rec[k];
      if (typeof v === "object" && v !== null) {
        rec[k] = Array.isArray(v) ? v.map(walk) : walk(v);
      }
    }
    return rec;
  };
  return walk(spec);
}
