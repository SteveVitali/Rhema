// CAP.1 — docs/build/COVERAGE_MATRIX.csv completeness + integrity gate (REQ-SPEC-29).
// Deterministically proves: (1) the CSV header is exactly the required eleven columns; (2) exactly
// one matrix row exists per requirement id matching REQ-[A-Z]+-[0-9]+ in the authoritative spec —
// no missing, no extras, no duplicates; (3) every row's verdict is a valid BM-VERDICT-01 verdict
// (the bare name, plus the parameterized forms MET-DIFFERENTLY(ADR-nnn), MET-ENGINEERED(D-id),
// WAIVED(ADR-nnn) — ADR-109); (4) MET, MET-DIFFERENTLY and MET-ENGINEERED rows carry nonblank evidence;
// (5) file-path-shaped refs cited in the evidence/tests columns resolve on disk, `deferral:` refs
// exist in docs/tickets/DEFERRALS.md, and `journey:` refs are registered steps in
// packages/journeys/src/registry.ts.
import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
// SPACAP.1 — the authoritative inventory is the union of the product design spec and the
// frontend SPA spec (its Appendix A emits the REQ-INV/ISL/DAT/TST/FW/TL/BFF/ED/UX/NAV/BND/VFY/
// SAFE/SEQ families — namespaces the design spec never uses, so the sets are disjoint except for
// the product ids the SPA spec legitimately cites inline, which the Set dedupes).
const SPEC =
  readFileSync(`${ROOT}/docs/rhema-design-spec.md`, "utf8") +
  "\n" +
  readFileSync(`${ROOT}/docs/frontend-spa-spec.md`, "utf8");
const MATRIX_PATH = `${ROOT}/docs/build/COVERAGE_MATRIX.csv`;
const MATRIX = readFileSync(MATRIX_PATH, "utf8");
const DEFERRALS = readFileSync(`${ROOT}/docs/tickets/DEFERRALS.md`, "utf8");
const REGISTRY = readFileSync(`${ROOT}/packages/journeys/src/registry.ts`, "utf8");

const HEADER =
  "id,level,spec_section,class,verdict,evidence,owning_tickets,tests,adrs,routing,note";
// ADR-109 — the verdict cell validates against the BM-VERDICT-01 grammar: a bare base name, or a
// parameterized form `NAME(params)` for the three names that carry them. The previous
// five-bare-value set predated the parameterized verdicts and forced dishonest MET rows when a
// requirement's engineering was done but a live leg was still owed (MAINT.3's REQ-SPEC-31 revert).
const VERDICTS = new Set([
  "MET",
  "MET-DIFFERENTLY",
  "MET-ENGINEERED",
  "PARTIAL",
  "MISSING",
  "AT-RISK-INTEGRATION",
  "WAIVED",
  "N/A-RATIONALE",
]);
const PARAMETERIZED_VERDICTS = new Set([
  "MET-DIFFERENTLY",
  "MET-ENGINEERED",
  "WAIVED",
]);

/** Split a verdict cell into its BM-VERDICT-01 base name and optional `(...)` parameters. */
function verdictParts(cell) {
  const i = cell.indexOf("(");
  if (i === -1) return { base: cell.trim(), params: null };
  return {
    base: cell.slice(0, i).trim(),
    params: cell.slice(i + 1).replace(/\)\s*$/, ""),
    closed: /\)\s*$/.test(cell),
  };
}
// References in evidence/tests that are not filesystem paths.
const NON_PATH = /^(journey|deferral|live|spec|ci|docs|ADR)-?/;

/** Minimal RFC-4180 field parser for the quoted-fields CSV we write. */
function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      field = "";
      rows.push(row);
      row = [];
    } else if (ch !== "\r") field += ch;
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

const specIds = new Set(SPEC.match(/REQ-[A-Z]+-\d+/g) ?? []);
// The SPA spec cites whole families by range (`REQ-BFF-1..30`); expand every range so the
// index-only ids count as authoritative too.
for (const m of SPEC.matchAll(/REQ-([A-Z]+)-(\d+)\.\.(\d+)/g)) {
  for (let n = Number(m[2]); n <= Number(m[3]); n++)
    specIds.add(`REQ-${m[1]}-${n}`);
}
const sortedSpecIds = [...specIds].sort();

const rows = parseCsv(MATRIX);
const header = rows[0];
const data = rows.slice(1);

test("matrix header is exactly the required eleven columns", () => {
  assert.deepEqual(header, HEADER.split(","));
});

test("spec yields the authoritative requirement inventory", () => {
  assert.ok(
    specIds.size >= 600,
    `expected a large requirement inventory (design + SPA union), got ${specIds.size}`,
  );
});

test("exactly one matrix row per spec requirement id — no missing, extras, or duplicates", () => {
  const matrixIds = data.map((r) => r[0]);
  const seen = new Set();
  const dupes = matrixIds.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
  assert.deepEqual(dupes, [], `duplicate rows: ${dupes.join(", ")}`);
  const specSet = specIds;
  const missing = sortedSpecIds.filter((id) => !seen.has(id));
  const extras = matrixIds.filter((id) => !specSet.has(id));
  assert.deepEqual(missing, [], `spec ids missing from matrix: ${missing.join(", ")}`);
  assert.deepEqual(extras, [], `matrix rows not in spec: ${extras.join(", ")}`);
  assert.equal(data.length, specIds.size);
});

test("every row has a valid verdict and eleven populated columns", () => {
  for (const r of data) {
    assert.equal(r.length, 11, `${r[0]} has ${r.length} columns`);
    const v = verdictParts(r[4]);
    assert.ok(VERDICTS.has(v.base), `${r[0]} verdict '${r[4]}' is not allowed`);
    if (v.params !== null) {
      assert.ok(v.closed !== false, `${r[0]} verdict '${r[4]}' has an unclosed parameter`);
      assert.ok(
        PARAMETERIZED_VERDICTS.has(v.base),
        `${r[0]} verdict '${r[4]}' — only MET-DIFFERENTLY/MET-ENGINEERED/WAIVED carry parameters`,
      );
      assert.ok(v.params.trim() !== "", `${r[0]} verdict '${r[4]}' has an empty parameter`);
    }
    for (const [i, name] of ["id", "level", "spec_section", "class"].entries())
      assert.notEqual(r[i].trim(), "", `${r[0]} blank ${name}`);
  }
});

test("MET, MET-DIFFERENTLY and MET-ENGINEERED rows carry nonblank evidence", () => {
  for (const r of data) {
    const v = verdictParts(r[4]).base;
    if (v === "MET" || v === "MET-DIFFERENTLY" || v === "MET-ENGINEERED") {
      assert.ok(
        r[5].trim() !== "" && r[5].trim() !== "—",
        `${r[0]} is ${r[4]} with blank evidence`,
      );
    }
  }
});

test("cited file paths exist; deferral and journey refs resolve", () => {
  const problems = [];
  for (const r of data) {
    const id = r[0];
    for (const field of [r[5], r[7]]) {
      for (const ref of field.split(";")) {
        const refT = ref.trim();
        if (!refT || refT === "—" || NON_PATH.test(refT)) continue;
        const p = refT.split(":")[0];
        if (/\.(ts|tsx|mjs|md|json|ya?ml)$/.test(p) && !existsSync(`${ROOT}/${p}`))
          problems.push(`${id}: missing file ${p}`);
      }
    }
    for (const col of [r[5], r[9]]) {
      for (const ref of col.split(";")) {
        const refT = ref.trim();
        if (refT.startsWith("deferral:") && !DEFERRALS.includes(refT.slice(9)))
          problems.push(`${id}: unknown deferral row ${refT}`);
        if (refT.startsWith("journey:")) {
          const step = refT.slice(8);
          // SPA.6 — an umbrella id (`journey:P1`, `journey:X1`) resolves when the registry carries
          // either the step itself or any per-surface split member of its family (`P1.project`, …).
          if (!REGISTRY.includes(`id: "${step}"`) && !REGISTRY.includes(`id: "${step}.`))
            problems.push(`${id}: unregistered journey step ${refT}`);
        }
      }
    }
  }
  assert.deepEqual(problems, []);
});
