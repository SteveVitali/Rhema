# R7DEM.2c — Converter: response ledgers, structure plan, what-changed, pipeline + golden harness

Ticket: `docs/tickets/217_R7DEM.2c__convert-ledgers-diffs.md` (manifest row 217).
Base: `stevevitali/r7dem-2b-letters` (chainTip — stack rides unmerged PRs #240–#248; `mergePolicy: OPERATOR`).

## What changed

**`src/convert/` extensions (@rhema/demo-corpus, pure functions — never I/O, never schema forks):**

- `overrides.ts` — three new typed, cited, consumption-tracked kinds (REQ-CONV-6 extension):
  `minor-finding` (minor-row → finding where positional cannot reach), `disposition` (mixed-cell
  ruling), `move-link` (row → move only where a source table already states linkage — never a
  hand-authored move map).
- `response-ledger.ts` — R2 §2.4 verbatim: `Source`-cell classification (majors / minors
  positional-or-override / `SR` labels through 216's merged labels / `OQ` → roadmap; claim-ledger,
  discourse, argument/craft notes, self, reception, scorecard unrepresentable), first-keyword
  disposition map (accept|adapt|rebut|defer|escalate + decline/constraint/duplicates/mooted by/
  covered by synonyms; `mapping only`/`(causes…)` skip; mixed → override-only; unmapped on a
  resolvable row fails), status map, verbatim `rationale` on rebut/escalate, `moveOrdinal` from
  the plan table's `Discharges` column or a `move-link` override, evidence anchors into v(N+1)
  through the 215 ladder, one entry per finding (first-listed row wins), **every** row verbatim
  in `rows.json` (216's REQ-CONV-16 `raw_table_only` default consumed — never restated).
- `structure-plan.ts` — R2 §2.5: spine + section-map rows → `structurePlanSidecar`; no anchors;
  Entry→exit/Material/Promise-payoff/Apparatus/Cut-list stay raw.
- `draft-ledger.ts` — row-indexed `## Sections` rows for the raw view. Never imports
  `parseDraftLedgerSections` (the Roman-numeral bug is deferred — `D-R7DEM.2c-1` → BL-100, owner
  `253_R7REC.1`; REQ-CONV-17).
- `what-changed.ts` — build-time artifact: `diffMarkdown` (vN→vN+1, sanitized drafts) +
  `buildWhatChangedView`/`traceRevisionMoves` over the round's entries/moves → deterministic JSON
  218 projects. A hunk links only through an entry carrying `moveOrdinal`+anchor; rounds without
  `Discharges` show every hunk `Unlinked` — never fabricated (REQ-CONV-15).
- `index.ts` — `convertProject(files, overrides)`: the single per-project pipeline (claim ledger
  → findings → rubric → labels per review round; response ledgers + rows; structure plans +
  draft-ledger rows; what-changed per adjacent draft pair; rung histograms). Any error-level
  diagnostic or failed `parseSidecar` → `ok:false` + **empty** outputs (REQ-CONV-2); every
  override row consumed or the run fails (REQ-CONV-6). File I/O stays with the caller so 219
  points the same pipeline at real projects unchanged.

**Fixture (synthetic only — REQ-CORPUS-14; additive):** `v1-response-ledger.md` gained a
`## Discharge evidence` section (F1/F2/F5 quotes verbatim from `drafts/v2.md`; `source/` +
regenerated `corpus/`, index.json, PROVENANCE, manifest); new
`overrides/the-borrowed-commons/convert-overrides.json` (one `minor-finding` row: G1 →
"The one thing" — lives outside `corpus/` because that tree is the exporter's own golden);
COVERAGE.md dated amendment.

**Tests:** `response-ledger.test.ts` (classification/map tables, dedup, rationale, moves,
anchors, rows.json, override semantics — mixed-cell, stale-override, move-link, unmapped,
skip) + `pipeline.test.ts` (parseSidecar re-validate on every emitted sidecar, planted-invalid
abort with no partial output, stale-override fail, zero-unmapped lists, what-changed linkage
rounds, draft-ledger raw rows + the `parseDraftLedgerSections` import pin, canonical-JSON golden
byte-equality + re-run determinism). 17 files / 196 tests in the package (was 15/125).

## Acceptance criteria

- Response-ledger + structure-plan sidecars `parseStatus:"ok"`; a planted invalid sidecar aborts
  the pipeline with no output — **fixture-verified** (`pipeline.test.ts`).
- Disposition/status mapping: zero unmapped on the fixture; mixed cells resolve only via
  override; unconsumed override fails — **fixture-verified**.
- Raw-only rows appear in `rows.json`, never as sidecar entries — **fixture-verified** (F7/F8/F9,
  G2/G3 verbatim).
- What-changed: v1→v2 (Discharges) links hunks h3 under M1+M3 (coarse — real); v2→v3 (no
  Discharges) shows every hunk Unlinked; no fabricated link — **fixture-verified**.
- No `parseDraftLedgerSections` under `src/convert/**` — **engineered** (source-scan test).
- `D-R7DEM.2c-1` opened (owner 253_R7REC.1, opened 2026-11-04, BL-100 xref, unblock "closed to
  BACKLOG by 253", verification + proxy stated) — **engineered**.
- Golden harness green and byte-stable on re-run — **fixture-verified**.
- Optional real-export smoke — **not run**: the withheld export is never a Stage-A input
  (REQ-CORPUS-14); real-corpus rates are 219's evidence.

## Verification

- `pnpm turbo build lint typecheck` — 138/138.
- `pnpm test` — 6,472 pass / 6 skip / 0 fail (544 files).
- `pnpm exec vitest run packages/demo-corpus` — 196 pass (17 files).
- `pnpm check:demo-corpus` — 0 violations.
- Stage A only ($0); no preview (GD-PREVIEW.R7); synthetic fixture only (S-12).

Requirement ids: REQ-CONV-2, REQ-CONV-6, REQ-CONV-10, REQ-CONV-12, REQ-CONV-15, REQ-CONV-16
(consumer), REQ-CONV-17, REQ-CORPUS-14.

## Deferrals

- Opened: `D-R7DEM.2c-1` (REQ-CONV-17 parser bug → BL-100; owner `253_R7REC.1`).
- Closed: none (no round-7 OPEN row unblocked by a Stage-A converter ticket).
