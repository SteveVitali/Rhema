// CAP.1 — docs/build/COVERAGE_MATRIX.csv completeness + integrity gate (REQ-SPEC-29).
// Deterministically proves: (1) the CSV header is exactly the required eleven columns; (2) exactly
// one matrix row exists per requirement id matching REQ-[A-Z]+-[0-9]+ in the authoritative spec —
// no missing, no extras, no duplicates; (3) every row's verdict is one of the five allowed values;
// (4) MET and MET-DIFFERENTLY rows carry nonblank evidence; (5) file-path-shaped refs cited in the
// evidence/tests columns resolve on disk, `deferral:` refs exist in docs/tickets/DEFERRALS.md, and
// `journey:` refs are registered steps in packages/journeys/src/registry.ts.
import { test } from "vitest";
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SPEC = readFileSync(`${ROOT}/docs/rhema-design-spec.md`, "utf8");
const MATRIX_PATH = `${ROOT}/docs/build/COVERAGE_MATRIX.csv`;
const MATRIX = readFileSync(MATRIX_PATH, "utf8");
const DEFERRALS = readFileSync(`${ROOT}/docs/tickets/DEFERRALS.md`, "utf8");
const REGISTRY = readFileSync(`${ROOT}/packages/journeys/src/registry.ts`, "utf8");

const HEADER =
  "id,level,spec_section,class,verdict,evidence,owning_tickets,tests,adrs,routing,note";
const VERDICTS = new Set([
  "MET",
  "MET-DIFFERENTLY",
  "PARTIAL",
  "MISSING",
  "AT-RISK-INTEGRATION",
]);
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

const specIds = [
  ...new Set(SPEC.match(/REQ-[A-Z]+-\d+/g) ?? []),
].sort();

const rows = parseCsv(MATRIX);
const header = rows[0];
const data = rows.slice(1);

test("matrix header is exactly the required eleven columns", () => {
  assert.deepEqual(header, HEADER.split(","));
});

test("spec yields the authoritative requirement inventory", () => {
  assert.ok(
    specIds.length >= 400,
    `expected a large requirement inventory, got ${specIds.length}`,
  );
});

test("exactly one matrix row per spec requirement id — no missing, extras, or duplicates", () => {
  const matrixIds = data.map((r) => r[0]);
  const seen = new Set();
  const dupes = matrixIds.filter((id) => (seen.has(id) ? true : (seen.add(id), false)));
  assert.deepEqual(dupes, [], `duplicate rows: ${dupes.join(", ")}`);
  const specSet = new Set(specIds);
  const missing = specIds.filter((id) => !seen.has(id));
  const extras = matrixIds.filter((id) => !specSet.has(id));
  assert.deepEqual(missing, [], `spec ids missing from matrix: ${missing.join(", ")}`);
  assert.deepEqual(extras, [], `matrix rows not in spec: ${extras.join(", ")}`);
  assert.equal(data.length, specIds.length);
});

test("every row has a valid verdict and eleven populated columns", () => {
  for (const r of data) {
    assert.equal(r.length, 11, `${r[0]} has ${r.length} columns`);
    assert.ok(VERDICTS.has(r[4]), `${r[0]} verdict '${r[4]}' is not allowed`);
    for (const [i, name] of ["id", "level", "spec_section", "class"].entries())
      assert.notEqual(r[i].trim(), "", `${r[0]} blank ${name}`);
  }
});

test("MET and MET-DIFFERENTLY rows carry nonblank evidence", () => {
  for (const r of data) {
    if (r[4] === "MET" || r[4] === "MET-DIFFERENTLY") {
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
