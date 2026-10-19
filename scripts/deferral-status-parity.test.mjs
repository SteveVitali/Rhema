// deferral-status-parity.test.mjs — HYGIENE.1 / REQ-MEM-3 fixture: the two DEFERRALS status
// parsers must agree on every row.
//
//   · parseAsBacklog     transliterates check-backlog.sh's DEFERRALS awk verbatim
//     (~/agent-skills/skills/reconcile-build/scripts/check-backlog.sh — the last non-empty
//     `|`-field, toupper, [^A-Z-]+ separators, first canonical token wins).
//   · parseAsBuildMemory transliterates check-build-memory.sh post-HYGIENE.1 verbatim
//     (~/agent-skills/skills/build-memory/scripts/check-build-memory.sh — trailing `|` stripped,
//     awk $NF, same tokenization, first canonical token in token order wins).
//
// Pre-HYGIENE.1, check-build-memory.sh used a candidate-ordered priority scan (OPEN won
// anywhere in the cell) — 78 of 320 rows drifted apart (the committed pre-census report is
// docs/build/reports/2026-10-14_deferral-census.json). The fixture asserts the post-fix
// scripts read identically over (a) the live file and (b) synthetic cells exercising every
// drift class, including the canonical never-flip row shape ("DONE-code … open … DONE").
import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const DEFERRALS = readFileSync(`${ROOT}/docs/tickets/DEFERRALS.md`, "utf8");

const CANON = new Set(["OPEN", "PARTIAL", "DONE", "WONTFIX", "ACCEPTED-SKELETON"]);

// ── check-backlog.sh :85-90 ──
//   last = last non-empty field (awk -F'|'); toupper; [^A-Z-]+ → " "; split on " ";
//   first T[i] ~ /^(OPEN|PARTIAL|DONE|WONTFIX|ACCEPTED-SKELETON)$/
function parseAsBacklog(row) {
  const fields = row.split("|");
  let last = "";
  for (const f of fields) if (f.replace(/[ \t]/g, "") !== "") last = f;
  const toks = last.toUpperCase().replace(/[^A-Z-]+/g, " ").split(" ").filter(Boolean);
  return toks.find((t) => CANON.has(t)) ?? "";
}

// ── check-build-memory.sh (post-HYGIENE.1) ──
//   lastcell = row sans trailing ` |`, awk $NF, tr a-z→A-Z; toks = [^A-Z-]+ → " " wrapped;
//   status = first whole-word canonical token in token order (was: candidate-ordered scan).
function parseAsBuildMemory(row) {
  const lastcell = row.replace(/[ \t]*\|[ \t]*$/, "").split("|").pop().toUpperCase();
  const toks = ` ${lastcell.replace(/[^A-Z-]+/g, " ")} `
    .trim().split(/ +/).filter(Boolean);
  return toks.find((t) => CANON.has(t)) ?? "";
}

// ── pre-fix semantics, retained to prove the drift is understood (not asserted equal) ──
function parseLegacyPriority(row) {
  const fields = row.split("|");
  let last = "";
  for (const f of fields) if (f.replace(/[ \t]/g, "") !== "") last = f;
  const toks = new Set(last.toUpperCase().replace(/[^A-Z-]+/g, " ").split(" ").filter(Boolean));
  for (const c of ["OPEN", "PARTIAL", "DONE", "WONTFIX", "ACCEPTED-SKELETON"])
    if (toks.has(c)) return c;
  return "";
}

const ROWS = DEFERRALS.split("\n").filter((l) => /^\|\s*D-[A-Za-z0-9.-]+\s*\|/.test(l));
const rowId = (r) => r.match(/^\|\s*(D-[A-Za-z0-9.-]+)\s*\|/)[1];

test("every DEFERRALS row reads identically under both scripts' parse", () => {
  const disagree = ROWS.filter((r) => parseAsBacklog(r) !== parseAsBuildMemory(r))
    .map((r) => `${rowId(r)}: backlog=${parseAsBacklog(r)} buildmem=${parseAsBuildMemory(r)}`);
  assert.deepEqual(disagree, [], `${disagree.length} rows disagree:\n${disagree.join("\n")}`);
});

test("synthetic drift cells read positionally under both ports", () => {
  const rows = (cell) => `| D-X-1 | item | ${cell} |`;
  const cases = [
    // canonical never-flip shape (D-P0.08b-3): compound DONE-code is not DONE; the
    // mid-cell "open" lands before the dated DONE — positional reads OPEN.
    ["**DONE-code** — 2026-09-25: confirmed open → leg owed. 2026-09-26: landed; DONE.", "OPEN"],
    ["**DONE (2026-10-14):** discharged — prior: **OPEN — 2026-10-01.** still owed then", "DONE"],
    ["**PARTIAL — 2026-10-04:** head DONE; tail legs owed, stays PARTIAL", "PARTIAL"],
    ["**WONTFIX (2026-10-14):** DROPPED 2026-10-14: mooted by Arm-B", "WONTFIX"],
    ["**ACCEPTED-SKELETON (2026-09-10):** thin slice; DONE legs in the tail", "ACCEPTED-SKELETON"],
    ["**OPEN — 2026-10-08.** owed; no later status word", "OPEN"],
    ["migrated cell — no canonical token at all", ""],
  ];
  for (const [cell, want] of cases) {
    const r = rows(cell);
    assert.equal(parseAsBacklog(r), want, `backlog parse of ${JSON.stringify(cell)}`);
    assert.equal(parseAsBuildMemory(r), want, `build-memory parse of ${JSON.stringify(cell)}`);
  }
});

test("the legacy priority scan's disagreement set is understood (regression record)", () => {
  // The 78 pre-normalization disagreements are archived in the committed census report —
  // assert the report exists and matches its recorded shape (normative edit list).
  const rep = JSON.parse(
    readFileSync(`${ROOT}/docs/build/reports/2026-10-14_deferral-census.json`, "utf8"),
  );
  assert.equal(rep.rows.length, 320);
  const pre = rep.rows.filter((r) => r.positional !== r.priority);
  assert.equal(pre.length, 78);
});

// ── REQ-MEM-1: the G1-censused rows read their ratified disposition ──
const G1_DONE = `
  D-P0.03-2 D-P0.03-3 D-P0.08b-2 D-P0.08b-3 D-P0.09-3
  D-P0.15b-1 D-P0.15b-2 D-P0.15b-3 D-P0.15b-4 D-P0.15c-2 D-P0.15c-3 D-P0.15c-5 D-P0.15d-2
  D-PRB.04-1 D-PRB.13-1 D-PRB.21-1 D-P1.07-1 D-P1.15-1 D-P1.22-1
  D-SLO.1-1 D-SLO.1-2 D-SLO.1-3 D-SLO.1-4 D-DEF.4-1 D-CITE.1-1 D-CITE.1-4
  D-CAP.2-3 D-CAP.3-1 D-CAP.3-2 D-STB.5a-1 D-STB.5a-2 D-STB.5a-3 D-STB.5b-2
  D-SPA.26-1 D-SPA.27-1 D-OBS.1-2 D-ECON.2-1
  ${Array.from({ length: 14 }, (_, i) => `D-SPAF.${i + 1}-1 D-SPAF.${i + 1}-2`).join(" ")}
`.trim().split(/\s+/);
const G1_DROPPED = [
  ...Array.from({ length: 14 }, (_, i) => [`D-SPAF.${i + 1}-3`, `D-SPAF.${i + 1}-4`]).flat(),
  ...Array.from({ length: 13 }, (_, i) => `D-SPA.${i + 12}-2`),
];

test("every G1 ALREADY-DONE row positionally reads DONE", () => {
  const bad = ROWS.filter((r) => G1_DONE.includes(rowId(r)) && parseAsBacklog(r) !== "DONE")
    .map(rowId);
  assert.deepEqual(bad, []);
  assert.equal(G1_DONE.length, 65);
});

test("every G1 DROP row positionally reads WONTFIX + carries a literal dated DROPPED close", () => {
  const bad = [];
  for (const r of ROWS) {
    const id = rowId(r);
    if (!G1_DROPPED.includes(id)) continue;
    if (parseAsBacklog(r) !== "WONTFIX") bad.push(`${id}: ${parseAsBacklog(r)}`);
    if (!/DROPPED 2026-10-14:/.test(r)) bad.push(`${id}: no literal "DROPPED 2026-10-14:"`);
  }
  assert.deepEqual(bad, []);
  assert.equal(G1_DROPPED.length, 41);
});

test("no G1 target row survives as a zombie (owed-lead with DONE tail)", () => {
  // On the post-state file, every normalized row leads DONE/WONTFIX — the residual
  // OPEN/PARTIAL rows that still contain trailing DONE words (D-P0.06-3, D-P1.18-1,
  // D-EDIT.1-2, D-STB.5b-5, D-CAP.2-2) are honestly owed: G1 keeps them
  // DEFER/DECOMPOSE-class and their trailing DONE tokens name discharged sub-legs,
  // never the row itself.
  const g1 = new Set([...G1_DONE, ...G1_DROPPED]);
  const zombies = ROWS.filter((r) => {
    const st = parseAsBacklog(r);
    if (!g1.has(rowId(r)) && (st === "OPEN" || st === "PARTIAL")) return false;
    return st === "OPEN" || st === "PARTIAL";
  }).map(rowId);
  assert.deepEqual(zombies, []);
});
