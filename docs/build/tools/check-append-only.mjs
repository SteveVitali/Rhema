#!/usr/bin/env node
// check-append-only.mjs — assert that protected build-memory regions only grew since a base ref.
//
// Usage:
//   node docs/build/tools/check-append-only.mjs --base <ref> [--staged] [--selftest]
//
// Asserts, against the working tree (or the index with --staged):
//   1. LEDGER.md `## PHASE LOG` and `## GATE DECISIONS`: every base line is still present, in order,
//      as a prefix of the head section (entries may only be appended).
//   2. DEFERRALS.md: every pre-existing `| D-… |` row id still exists, and every base cell's text is
//      still present in the same-position cell (a status flip may prepend a dated keyword before the
//      untouched original text — the rest of the cell must survive verbatim).
//   3. 00_MANIFEST.md `## Plan extensions`: every base line still exists (the section only appends).
//
// --selftest synthesizes a deleted DEFERRALS row and an edited PHASE LOG line in memory and asserts
// the checker flags both (proves the fixtures actually fail). Exit 0 clean, 1 violations, 2 usage.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const args = process.argv.slice(2);
const base = arg("--base");
const staged = args.includes("--staged");
const selftest = args.includes("--selftest");

function arg(name) {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
}

function read(path, where) {
  if (where === "base") {
    try {
      return execFileSync("git", ["show", `${base}:${path}`], { encoding: "utf8" });
    } catch {
      return null; // file absent at base → nothing to protect
    }
  }
  if (staged) {
    try {
      return execFileSync("git", ["show", `:${path}`], { encoding: "utf8" });
    } catch {
      return null;
    }
  }
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

const norm = (s) => s.replace(/[\\*_`]/g, "").replace(/\s+/g, " ").trim();

// Split a markdown table row into cells, unescaped.
function cells(row) {
  return row
    .replace(/^\s*\|/, "")
    .replace(/\|\s*$/, "")
    .split("|");
}

// Lines of the `## <name>` section of `doc` (heading line excluded).
function section(doc, name) {
  const lines = doc.split("\n");
  const start = lines.findIndex((l) => new RegExp(`^##\\s+${name}`).test(l));
  if (start < 0) return null;
  const out = [];
  for (let i = start + 1; i < lines.length && !/^##\s/.test(lines[i]); i++) out.push(lines[i]);
  return out;
}

function check(baseDocs, headDocs) {
  const violations = [];

  // 1: LEDGER PHASE LOG + GATE DECISIONS — the base section is a strict prefix of head's
  //    (entries append only at the end; no line may be edited in place).
  for (const [file, sec, label] of [
    ["docs/build/LEDGER.md", "PHASE LOG", "phase-log"],
    ["docs/build/LEDGER.md", "GATE DECISIONS", "gate-decisions"],
  ]) {
    const b = baseDocs[file], h = headDocs[file];
    if (b == null) continue;
    if (h == null) {
      violations.push(`${file}: ${label}: file missing at head`);
      continue;
    }
    const bsec = section(b, sec), hsec = section(h, sec);
    if (bsec == null) continue;
    if (hsec == null) {
      violations.push(`${file}: § ${sec} removed at head`);
      continue;
    }
    // A trailing empty element is a file-ending artifact (the text after the last "\n"), not a
    // content line — a legitimate append lands where it stood. Content lines still compare
    // strictly, so an insertion before the last entry still diverges.
    while (bsec.length && bsec[bsec.length - 1].trim() === "") bsec.pop();
    for (let i = 0; i < bsec.length; i++) {
      if (hsec[i] !== bsec[i]) {
        violations.push(
          `${file}: § ${sec} diverged at base line ${i + 1}: ` +
            `was ${JSON.stringify(bsec[i].slice(0, 72))} now ${JSON.stringify((hsec[i] ?? "<eof>").slice(0, 72))}`
        );
        break; // report the first divergence per section
      }
    }
  }

  // 3: manifest § Plan extensions only grew — every base line survives, in order (subsequence).
  {
    const b = baseDocs["docs/tickets/00_MANIFEST.md"];
    const h = headDocs["docs/tickets/00_MANIFEST.md"];
    if (b != null) {
      if (h == null) {
        violations.push("docs/tickets/00_MANIFEST.md: § Plan extensions: file missing at head");
      } else {
        const bsec = section(b, "Plan extensions"), hsec = section(h, "Plan extensions");
        if (bsec == null) {
          // nothing to protect
        } else if (hsec == null) {
          violations.push("docs/tickets/00_MANIFEST.md: § Plan extensions removed at head");
        } else {
          let j = 0;
          for (let i = 0; i < bsec.length; i++) {
            while (j < hsec.length && hsec[j] !== bsec[i]) j++;
            if (j === hsec.length) {
              violations.push(
                `docs/tickets/00_MANIFEST.md: § Plan extensions lost or re-ordered a line ` +
                  `(base line ${i + 1}: ${JSON.stringify(bsec[i].slice(0, 72))})`
              );
              break;
            }
            j++;
          }
        }
      }
    }
  }

  // 2: DEFERRALS rows grow, never lose a cell's text.
  const bDef = baseDocs["docs/tickets/DEFERRALS.md"];
  const hDef = headDocs["docs/tickets/DEFERRALS.md"];
  if (bDef != null) {
    if (hDef == null) {
      violations.push("docs/tickets/DEFERRALS.md: file missing at head");
    } else {
      const headRows = new Map();
      for (const l of hDef.split("\n")) {
        const m = l.match(/^\|\s*(D-[A-Za-z0-9.\-]+)\s*\|/);
        if (m) headRows.set(m[1], l);
      }
      for (const l of bDef.split("\n")) {
        const m = l.match(/^\|\s*(D-[A-Za-z0-9.\-]+)\s*\|/);
        if (!m) continue;
        const id = m[1];
        const nrow = headRows.get(id);
        if (nrow == null) {
          violations.push(`DEFERRALS row ${id}: removed (never delete a row — BM-DEFER-01)`);
          continue;
        }
        const oc = cells(l), nc = cells(nrow);
        for (let i = 0; i < oc.length; i++) {
          let want = norm(oc[i]);
          if (i === oc.length - 1) {
            // status cell: the old leading status keyword may be superseded by a dated prefix;
            // the rest of the original cell text must survive verbatim.
            want = want.replace(/^(OPEN|PARTIAL|DONE|WONTFIX|ACCEPTED-SKELETON|DEFERRED-AGAIN)\s*/i, "");
          }
          if (want && !norm(nc[i] ?? "").includes(want)) {
            violations.push(
              `DEFERRALS row ${id}: cell ${i + 1} text lost or rewritten ` +
                `(missing: ${JSON.stringify(want.slice(0, 72))})`
            );
            break;
          }
        }
      }
    }
  }
  return violations;
}

function main() {
  if (selftest) {
    const files = ["docs/build/LEDGER.md", "docs/tickets/DEFERRALS.md", "docs/tickets/00_MANIFEST.md"];
    const baseDocs = Object.fromEntries(files.map((f) => [f, readFileSync(f, "utf8")]));
    let fails = 0;
    // Fixture A: a deleted DEFERRALS row must fail.
    {
      const head = { ...baseDocs, "docs/tickets/DEFERRALS.md": baseDocs["docs/tickets/DEFERRALS.md"].split("\n").filter((l) => !/^\|\s*D-/.test(l)).join("\n") };
      const v = check(baseDocs, head);
      if (v.some((x) => x.includes("removed"))) console.log("selftest: deleted-row fixture flagged ✓");
      else { console.log("selftest: deleted-row fixture NOT flagged ✗"); fails++; }
    }
    // Fixture B: an edited PHASE LOG line must fail.
    {
      const tampered = baseDocs["docs/build/LEDGER.md"].replace(/^- \d{4}-\d{2}-\d{2}/m, "- 1999-01-01 TAMPERED");
      const head = { ...baseDocs, "docs/build/LEDGER.md": tampered };
      const v = check(baseDocs, head);
      if (v.some((x) => x.includes("PHASE LOG"))) console.log("selftest: edited-PHASE-LOG fixture flagged ✓");
      else { console.log("selftest: edited-PHASE-LOG fixture NOT flagged ✗"); fails++; }
    }
    // Fixture C: untouched files must pass.
    {
      const v = check(baseDocs, baseDocs);
      if (v.length === 0) console.log("selftest: clean fixture passes ✓");
      else { console.log(`selftest: clean fixture flagged ✗ (${v[0]})`); fails++; }
    }
    // Fixture D: appending a PHASE LOG entry at EOF must pass (the base file's trailing newline
    // must not count as protected content).
    {
      const grown = baseDocs["docs/build/LEDGER.md"] + "- 2026-10-02 — **FAKE appended entry**\n";
      const head = { ...baseDocs, "docs/build/LEDGER.md": grown };
      const v = check(baseDocs, head);
      if (v.length === 0) console.log("selftest: appended-entry fixture passes ✓");
      else { console.log(`selftest: appended-entry fixture flagged ✗ (${v[0]})`); fails++; }
    }
    console.log(fails === 0 ? "SELFTEST OK" : `SELFTEST FAILED (${fails})`);
    process.exit(fails === 0 ? 0 : 1);
  }

  if (!base) {
    console.error("usage: check-append-only.mjs --base <ref> [--staged] [--selftest]");
    process.exit(2);
  }
  const files = ["docs/build/LEDGER.md", "docs/tickets/DEFERRALS.md", "docs/tickets/00_MANIFEST.md"];
  const baseDocs = Object.fromEntries(files.map((f) => [f, read(f, "base")]));
  const headDocs = Object.fromEntries(files.map((f) => [f, read(f, "head")]));
  const violations = check(baseDocs, headDocs);
  for (const v of violations) console.log(`VIOLATION ${v}`);
  console.log(
    violations.length === 0
      ? `append-only OK vs ${base}${staged ? " (staged)" : ""}`
      : `append-only FAILED vs ${base}: ${violations.length} violation(s)`
  );
  process.exit(violations.length === 0 ? 0 : 1);
}

main();
