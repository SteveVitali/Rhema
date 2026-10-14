#!/usr/bin/env node
// deferral-status-census.mjs — the REQ-MEM-2 scripted pre-census over DEFERRALS.md.
//
// Prints, per `| D-…` row, the positional status (the ratified reading — first canonical
// token in the status cell, matching check-backlog.sh and post-HYGIENE.1
// check-build-memory.sh), the legacy priority-scan reading, and every status-shaped trailing
// token (canonical words after the lead + non-canonical status words like "DROPPED",
// "RE-DEFERRED", "DONE-code"). Rows where the two parsers disagree are the drifted corpus;
// the summary counts match the research classes (docs/research/r5_e_memory-hygiene.md F4).
//
// Usage:
//   node docs/build/tools/deferral-status-census.mjs [path/to/DEFERRALS.md] [--json PATH]
//        [--owed]            # --owed: print only rows reading OPEN/PARTIAL (the parser-owed set)
//        [--disagree]        # --disagree: only rows where positional != priority reading
//
// Read-only. Exit 0 always (this is a report, not a gate).

import { readFileSync, writeFileSync } from "node:fs";
import { censusFile, censusRow, isDeferralRow } from "./deferral-status.mjs";

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith("--")) ?? "docs/tickets/DEFERRALS.md";
const jsonOut = args.includes("--json") ? args[args.indexOf("--json") + 1] : null;
const onlyOwed = args.includes("--owed");
const onlyDisagree = args.includes("--disagree");

const rows = censusFile(readFileSync(file, "utf8"));

// Summary classes (r5_e_memory-hygiene F4 vocabulary).
const cls = (r) => {
  const tail = new Set(r.trailingCanonical);
  const out = [];
  if (!r.positional) out.push("orphan");
  if (r.positional !== r.priority) out.push("PARSER-DISAGREE");
  if (r.positional === "DONE" && tail.has("OPEN")) out.push("DONE-before-OPEN");
  if (r.positional === "DONE" && tail.has("PARTIAL")) out.push("DONE-before-PARTIAL");
  if (r.positional === "PARTIAL" && tail.has("OPEN")) out.push("PARTIAL-before-OPEN");
  if (r.positional === "OPEN" && tail.has("DONE")) out.push("OPEN-before-DONE");
  if (r.positional === "PARTIAL" && tail.has("DONE")) out.push("PARTIAL-and-DONE");
  if (tail.has("OPEN") && tail.has("PARTIAL")) out.push("trailing-OPEN+PARTIAL");
  if (r.trailingNonCanonical.length) out.push("noncanonical-tail");
  return out;
};

const shown = rows.filter(
  (r) =>
    (!onlyOwed || r.positional === "OPEN" || r.positional === "PARTIAL") &&
    (!onlyDisagree || r.positional !== r.priority)
);

console.log(`deferral-status-census: ${file}`);
console.log(`${rows.length} rows · showing ${shown.length}`);
console.log("");
console.log("id\tpositional\tpriority\ttrailing-canonical\ttrailing-noncanonical");
for (const r of shown) {
  console.log(
    `${r.id}\t${r.positional || "—"}\t${r.priority || "—"}\t${r.trailingCanonical.join(",") || "—"}\t${r.trailingNonCanonical.join(",") || "—"}`
  );
}

const counts = {};
for (const r of rows) for (const c of cls(r)) counts[c] = (counts[c] ?? 0) + 1;
const byPos = {};
for (const r of rows) byPos[r.positional || "—"] = (byPos[r.positional || "—"] ?? 0) + 1;

console.log("\nsummary:");
console.log(`  positional status: ${JSON.stringify(byPos)}`);
for (const [k, v] of Object.entries(counts).sort()) console.log(`  ${k}: ${v}`);
const disagree = rows.filter((r) => r.positional !== r.priority);
console.log(`  parser disagreements (priority-scan != positional): ${disagree.length}`);
if (disagree.length)
  console.log(`    ${disagree.map((r) => `${r.id}(${r.positional}->${r.priority})`).join(" ")}`);

if (jsonOut) {
  writeFileSync(
    jsonOut,
    JSON.stringify({ file, rows: rows.map((r) => ({ ...r, classes: cls(r) })), counts, byPos }, null, 2) + "\n"
  );
  console.log(`  JSON: ${jsonOut}`);
}
