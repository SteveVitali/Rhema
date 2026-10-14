#!/usr/bin/env node
// deferral-status-normalize.mjs — HYGIENE.1 / REQ-MEM-1: apply the G1 disposition census
// (docs/research/r5_g1_dispositions.md §Full table — normative) to DEFERRALS.md status cells.
//
//   node docs/build/tools/deferral-status-normalize.mjs          # dry run — print planned edits
//   node docs/build/tools/deferral-status-normalize.mjs --apply  # rewrite DEFERRALS.md
//   node docs/build/tools/deferral-status-normalize.mjs --verify # assert post-state
//
// Rules (BM-DEFER-01 — append-only, history grows never shrinks):
//   · only the row's LAST `|`-cell is edited, and only by PREPENDING a dated close note;
//     the entire prior cell survives verbatim after `Original cell:`.
//   · ALREADY-DONE rows   → lead `DONE`    + dated normalization note (G1-ratified).
//   · DROP-class rows     → lead `WONTFIX` + literal `DROPPED <date>:` close line
//     (ratified Q-DROP ruling — dated close lines, never deletions).
//   · every other byte of the file is left untouched.
//
// The G1 ALREADY-DONE rows that already lead DONE need no edit — they are listed under
// `alreadyDoneSkip` and --verify asserts they still read DONE.

import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { lastCell, positionalStatus } from "./deferral-status.mjs";

const ROOT = fileURLToPath(new URL("../../..", import.meta.url)).replace(/\/$/, "");
const DEF = `${ROOT}/docs/tickets/DEFERRALS.md`;
const DATE = "2026-10-14"; // `date -u +%F` at apply time — recorded in the run ledger

// ── The normative row lists (docs/research/r5_g1_dispositions.md §Full table) ──
// ALREADY-DONE — leading token flips to DONE (dated tail preserved verbatim).
const alreadyDone = `
  D-P0.03-2 D-P0.03-3 D-P0.08b-2 D-P0.08b-3 D-P0.09-3
  D-P0.15b-1 D-P0.15b-2 D-P0.15b-3 D-P0.15b-4
  D-P0.15c-2 D-P0.15c-3 D-P0.15c-5 D-P0.15d-2
  D-PRB.04-1 D-PRB.13-1 D-PRB.21-1
  D-P1.07-1 D-P1.15-1 D-P1.22-1
  D-SLO.1-1 D-SLO.1-2 D-SLO.1-3 D-SLO.1-4
  D-DEF.4-1 D-CITE.1-1 D-CITE.1-4
  D-CAP.2-3 D-CAP.3-1 D-CAP.3-2
  D-STB.5a-1 D-STB.5a-2 D-STB.5a-3 D-STB.5b-2
  D-SPA.26-1 D-SPA.27-1 D-OBS.1-2 D-ECON.2-1
`.trim().split(/\s+/);
// D-SPAF.*-1/-2 — the 28 post-deploy marker legs, discharged at ffbb8ad (ARMB.2 deploy).
for (let n = 1; n <= 14; n++) { alreadyDone.push(`D-SPAF.${n}-1`, `D-SPAF.${n}-2`); }

// DROP (mooted) — leading token flips to WONTFIX + literal dated DROPPED close.
const dropped = [];
for (let n = 1; n <= 14; n++) { dropped.push(`D-SPAF.${n}-3`, `D-SPAF.${n}-4`); }
for (let n = 12; n <= 24; n++) dropped.push(`D-SPA.${n}-2`); // preview rollback drills

const DROP_REASON_SPAF =
  "the Arm-B election (GATE DECISIONS 2026-10-14, INTEGRATION_PLAN §R4.11) discharged the " +
  "pacing/rollback arms — rollback is `git revert` + redeploy, no rollback arm remains to drill";
const DROP_REASON_DRILL =
  "preview rollback drill mooted — no flag exists post-SPA.28; rollback is `git revert` + " +
  "redeploy (Arm-B election, GATE DECISIONS 2026-10-14)";

const DONE_NOTE =
  `**DONE (${DATE} — HYGIENE.1/REQ-MEM-1 cell normalization):** ratified ALREADY-DONE by the ` +
  "G1 disposition census (`docs/research/r5_g1_dispositions.md` §Full table) — the dated tail " +
  "records the discharge; the leading token is normalized to the ratified disposition. " +
  "Original cell: ";
const DONE_NOTE_SPAF =
  `**DONE (${DATE} — HYGIENE.1/REQ-MEM-1 cell normalization):** ratified ALREADY-DONE — ` +
  "discharged at `ffbb8ad` on the deployed Arm-B tip (G1 disposition census, " +
  "`docs/research/r5_g1_dispositions.md` §Full table). Original cell: ";
const DROP_NOTE = (reason) =>
  `**WONTFIX (${DATE} — HYGIENE.1/REQ-MEM-1):** DROPPED ${DATE}: ${reason} ` +
  "(ratified Q-DROP close — dated close line, never a deletion; " +
  "`docs/research/r5_g1_dispositions.md` §Full table). Original cell: ";

function plan() {
  const lines = readFileSync(DEF, "utf8").split("\n");
  const edits = [];
  const seen = new Set();
  lines.forEach((line, i) => {
    const m = line.match(/^\|\s*(D-[A-Za-z0-9.-]+)\s*\|/);
    if (!m) return;
    const id = m[1];
    const isDone = alreadyDone.includes(id);
    const isDrop = dropped.includes(id);
    if (!isDone && !isDrop) return;
    if (seen.has(id)) throw new Error(`duplicate target ${id}`);
    seen.add(id);
    const cell = lastCell(line);
    if (cell.includes("\\")) throw new Error(`${id}: escaped pipe inside the status cell — handle by hand`);
    if (line.includes(DATE)) throw new Error(`${id}: row already carries ${DATE} — dated-flip check would fail`);
    const cur = positionalStatus(cell);
    let note;
    if (isDone) {
      if (cur === "DONE") { edits.push({ id, i, kind: "skip-done" }); return; }
      if (cur !== "OPEN" && cur !== "PARTIAL") throw new Error(`${id}: unexpected lead ${cur}`);
      note = id.startsWith("D-SPAF.") ? DONE_NOTE_SPAF : DONE_NOTE;
    } else {
      if (cur !== "OPEN" && cur !== "PARTIAL") throw new Error(`${id}: unexpected lead ${cur}`);
      note = DROP_NOTE(id.startsWith("D-SPAF.") ? DROP_REASON_SPAF : DROP_REASON_DRILL);
    }
    // Replace exactly the last `…<cell> |` segment; the row's every other byte is verbatim.
    const tail = ` ${note}${cell.trim()} `;
    const nl = line.replace(/\|[^|]*\|\s*$/, `|${tail}|`);
    if (nl === line) throw new Error(`${id}: last-cell substitution failed`);
    edits.push({ id, i, kind: isDone ? "done" : "dropped", from: cur, nl });
  });
  return { lines, edits, seen };
}

if (process.argv.includes("--verify")) {
  const bad = [];
  for (const line of readFileSync(DEF, "utf8").split("\n")) {
    const m = line.match(/^\|\s*(D-[A-Za-z0-9.-]+)\s*\|/);
    if (!m) continue;
    const id = m[1];
    const st = positionalStatus(lastCell(line));
    if (alreadyDone.includes(id) && st !== "DONE") bad.push(`${id}: ${st} != DONE`);
    if (dropped.includes(id)) {
      if (st !== "WONTFIX") bad.push(`${id}: ${st} != WONTFIX`);
      if (!line.includes(`DROPPED ${DATE}:`)) bad.push(`${id}: missing literal "DROPPED ${DATE}:"`);
    }
  }
  console.log(`verify: ${alreadyDone.length + dropped.length} G1 rows checked — ${bad.length} bad`);
  bad.forEach((b) => console.log("  " + b));
  process.exit(bad.length ? 1 : 0);
}

const { lines, edits, seen } = plan();
const flips = edits.filter((e) => e.kind !== "skip-done");
const skips = edits.filter((e) => e.kind === "skip-done");
console.log(`planned: ${flips.length} status-cell flips (${edits.filter((e) => e.kind === "done").length} → DONE, ${edits.filter((e) => e.kind === "dropped").length} → WONTFIX/DROPPED); ${skips.length} ALREADY-DONE rows already lead DONE (verified)`);
const missing = [...alreadyDone, ...dropped].filter((id) => !seen.has(id));
if (missing.length) console.log(`MISSING ROWS: ${missing.join(" ")}`);
if (process.argv.includes("--apply")) {
  flips.forEach((e) => { lines[e.i] = e.nl; });
  writeFileSync(DEF, lines.join("\n"));
  console.log(`applied ${flips.length} edits to ${DEF}`);
}
