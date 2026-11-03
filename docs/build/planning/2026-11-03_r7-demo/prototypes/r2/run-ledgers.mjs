import { writeFileSync } from "node:fs";
import { read, join, CORPUS, ROUNDS, parsers, wc, ls } from "./lib.mjs";
import { blocksOf, anchorFor } from "./anchor.mjs";
import { parseResponseLedger } from "./ledger.mjs";
import { parseLetter } from "./letter.mjs";

const OUT = new URL("./out/", import.meta.url).pathname;
const out = [];
for (const r of ROUNDS) {
  const lpath = join(CORPUS, r.slug, "agents", "author", "ledgers", `${r.round}-response-ledger.md`);
  const P = parseResponseLedger(read(lpath));
  const letter = parseLetter(read(join(CORPUS, r.slug, "correspondence", `${r.round}-review`, "editors-letter.md")));
  const findings = JSON.parse(read(join(OUT, `${r.slug}.${r.round}.findings.json`))).findings;
  const before = read(join(CORPUS, r.slug, "drafts", `${r.reviewed}.md`));
  const after = read(join(CORPUS, r.slug, "drafts", `${r.next}.md`));
  const afterBlocks = blocksOf(after);
  // ordinal lookup by letter object
  const majorOrd = (n) => findings.find((f) => f.letterSection === "major" && f.title === letter.majors.find((m) => m.n === n)?.title)?.ordinal;
  const minorOrds = findings.filter((f) => f.severity === "minor" && f.origin === "editor").map((f) => f.ordinal);
  let minorCursor = 0;
  const moveOf = new Map();
  for (const mv of P.moves) for (const id of mv.discharges ?? []) if (!moveOf.has(id)) moveOf.set(id, mv.ordinal);
  const entries = [];
  const srcTypes = {}, kindExact = { exact: 0, firstKeyword: 0, skip: 0, unmapped: 0 }, statusExact = { exact: 0, mapped: 0, unmapped: 0 };
  const evidenceAnchors = {};
  const unmapped = [];
  for (const row of P.rows) {
    srcTypes[row.src.type] = (srcTypes[row.src.type] ?? 0) + 1;
    if (row.skip) { kindExact.skip++; continue; }
    if (!row.kind) { kindExact.unmapped++; unmapped.push(`${row.id}: ${row.dispositionRaw}`); continue; }
    row.exact ? kindExact.exact++ : kindExact.firstKeyword++;
    if (!row.status) { statusExact.unmapped++; unmapped.push(`${row.id} status: ${row.statusRaw}`); }
    else row.exact ? statusExact.exact++ : statusExact.mapped++;
    let ord;
    if (row.src.type === "major") ord = majorOrd(row.src.n);
    else if (row.src.type === "minor") ord = minorOrds[minorCursor++];
    // evidence quote → anchor in v(N+1)
    const evText = row.evidence ?? P.evid.get(row.id) ?? [...P.evid.entries()].find(([k]) => k.startsWith(row.id + " ") || k === row.id)?.[1];
    let anchor;
    if (evText) {
      const a = anchorFor(evText.replace(/“|”/g, '"'), afterBlocks);
      evidenceAnchors[a.method] = (evidenceAnchors[a.method] ?? 0) + 1;
      if (a.anchor) anchor = a.anchor;
    } else evidenceAnchors.no_evidence = (evidenceAnchors.no_evidence ?? 0) + 1;
    if (ord == null) continue; // not representable: no findings.json ordinal
    entries.push({ findingOrdinal: ord, disposition: { kind: row.kind, status: row.status ?? "open",
      ...(/^(rebut|escalate)$/.test(row.kind) ? { rationale: row.dispositionRaw } : {}), ...(moveOf.has(row.id) ? { moveOrdinal: moveOf.get(row.id) } : {}) },
      ...(anchor ? { anchor } : {}) });
  }
  // de-dup: one entry per finding ordinal (first wins)
  const seen = new Set();
  const dedup = entries.filter((e) => (seen.has(e.findingOrdinal) ? false : seen.add(e.findingOrdinal)));
  const moves = P.moves.map((m) => ({ ordinal: m.ordinal, title: m.title || `Move ${m.ordinal}`, ...(m.type ? { type: m.type } : {}), ...(m.status ? { status: m.status } : {}) }));
  const sidecar = { sidecar: "response_ledger", version: 1, entries: dedup, ...(moves.length ? { moves } : {}) };
  const v = parsers.parseSidecar("response-ledger.json", { json: sidecar });
  writeFileSync(join(OUT, `${r.slug}.${r.round}.response-ledger.json`), JSON.stringify(sidecar, null, 1));
  // diff + trace
  const diff = wc.diffMarkdown(before, after);
  const kinds = {};
  for (const h of diff.hunks) kinds[h.kind] = (kinds[h.kind] ?? 0) + 1;
  const trace = wc.traceRevisionMoves(diff, { entries: dedup.map((e) => ({ findingOrdinal: e.findingOrdinal, kind: e.disposition.kind, moveOrdinal: e.disposition.moveOrdinal, anchor: e.anchor ?? null })), moves });
  // upper bound: trace ALL rows (incl. unrepresentable) with synthetic ordinals
  const allEntries = P.rows.filter((x) => x.kind).map((x, i) => {
    const evText = x.evidence ?? P.evid.get(x.id);
    const a = evText ? anchorFor(evText.replace(/“|”/g, '"'), afterBlocks).anchor : null;
    return { findingOrdinal: 1000 + i, kind: x.kind, moveOrdinal: moveOf.get(x.id) ?? 1, anchor: a };
  });
  const traceAll = wc.traceRevisionMoves(diff, { entries: allEntries, moves });
  const linked = (t) => t.filter((x) => x.moveId).reduce((s, x) => s + x.hunkCount, 0);
  out.push({ key: `${r.slug}/${r.round}`, rows: P.rows.length, cols: [...new Set(P.rows.map((x) => x.cols))], srcTypes, kindExact, statusExact, unmapped: unmapped.slice(0, 6),
    representable: entries.length, entries: dedup.length, moves: P.moves.length, movesWithDischarges: P.moves.filter((m) => m.discharges).length,
    rowsWithMove: P.rows.filter((x) => moveOf.has(x.id)).length, evidenceLists: P.evid.size, evidenceAnchors, schema: v.parseStatus, errs: v.errors?.slice(0, 3), fails: P.fails.slice(0, 4),
    diff: { hunks: diff.hunks.length, kinds, unchanged: diff.unchanged, before: diff.beforeBlocks.length, after: diff.afterBlocks.length },
    traceLinkedHunks: linked(trace), traceAllRowsLinkedHunks: linked(traceAll), traceMoves: trace.filter((x) => x.moveId).length });
}
console.log(JSON.stringify(out, null, 1));
