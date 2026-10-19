# HYGIENE.1 — build-memory hygiene + status-cell normalization

Manifest row 151 — the first dispatchable round-5 row · stacks on `stevevitali/r5-synthesis`
(PR chain tip `27f8672`) · merge policy **OPERATOR** — do not merge from the build
environment · docs/tooling-only, **$0**, no live stage, nothing deployed, zero prod writes.

## What lands

The two DEFERRALS status parsers finally read the same truth, and the G1 disposition
census's ratified rows stop lying about their state.

- **Scripted pre-census first** (REQ-MEM-2): `docs/build/tools/deferral-status.mjs` (the
  shared status-cell parse — positional + legacy-priority ports) +
  `deferral-status-census.mjs` prints, per row, the positional status, the priority-scan
  status, every trailing canonical + non-canonical status token. Ran before any edit;
  output committed at `docs/build/reports/2026-10-14_deferral-census.{txt,json}`:
  **320 rows, 78 parser disagreements** (the research estimate said ~50 — the scripted
  count is the normative one), 260 non-canonical tails.
- **Parser alignment** (REQ-MEM-3): upstream `~/agent-skills` commit `e981ec5` (pushed to
  `SteveVitali/agent-skills@main`) flips `check-build-memory.sh` to positional
  first-canonical-token semantics at all three status consumers — the §5 status parse, the
  kind-P rule-5 warning, and the passed-gate check — matching `check-backlog.sh` exactly.
  New upstream fixture `v2-positional-status` surfaces each script's owed set through
  observable output (rule-5 warnings vs backlog `missing` issues) and asserts them equal;
  `run-tests.sh` 18/18 PASS. No vendored copy exists in-repo.
- **Cell normalization** (REQ-MEM-1): `deferral-status-normalize.mjs` applied 96 flips —
  55 G1-table ALREADY-DONE rows → `DONE` (incl. all 28 `D-SPAF.*-1/-2` discharged at
  `ffbb8ad`), 41 DROP rows → `WONTFIX` with literal dated `DROPPED 2026-10-14:` close
  lines (28 `D-SPAF.*-3/-4` pacing/rollback arms mooted by the Arm-B election + the 13
  `D-SPA.12-2..24-2` preview rollback drills — no flag exists post-SPA.28). Every dated
  tail preserved verbatim under `Original cell:`; zero rows deleted; 10 ALREADY-DONE rows
  already led `DONE` and needed no edit. Owed rows: 203 → 107.
- **BUILD_INDEX + conventions** (REQ-MEM-5): seq 177 backfills `ARMB.2` (PR #171,
  `ffbb8ad` live on prod — the `done` entry it lacked); the entry-ID/evidence-file naming
  convention is stated once in `docs/build/README.md`.
- **§-anchor fix** (REQ-MEM-9): `COVERAGE_MATRIX.csv` REQ-IDE-20/-21 `§5.3` → `§6.6` (the
  design-spec register's own section column, rows 3115–16).
- **BL-73** (REQ-MEM-10): dated note — the 33 `1.x`/Later MISSING matrix rows are
  spec-scheduled and not lost; BL-73 stays `open` as the DEFER-class record (not closed).
- **Backlog truth** (G1 ALREADY-DONE): BL-16/BL-17/BL-21 closed — substance discharged in
  funded window B 2026-10-06 + GATE-ACCEPT sign-off; ADR-094 rehomed BL-17 → BL-77 so
  `check-backlog` stays home-closed-clean.
- **PHASE LOG rotation** (REQ-MEM-4): the `## PHASE LOG — Round <n>` per-round region
  convention is documented in `docs/build/README.md` + applied — `## PHASE LOG — Round 5`
  opens after the last pre-rotation entry (older regions stay byte-frozen).
- **Ledger-shape fix**: `harness:` moved to its allowed CURRENT STATE slot — the sole
  pre-existing validator violation is gone.
- **Fixture test**: `scripts/deferral-status-parity.test.mjs` — both parsers' verbatim
  ports asserted identical on all 320 live rows + 7 synthetic drift cells (incl. the
  never-flip `DONE-code … open … DONE` shape), plus the ratified disposition of all 106
  G1 rows.

## Verify

- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` → **0
  violations**, 8 warnings all pre-existing class (134 unbannered legacy manifest rows,
  GATE-G3 bare-word, `2_PRB.16b` lowest-unlanded legacy row, oversized entries now
  correctly *older-region*, 41 legacy `run` live-verification values, the 2026-10-15
  clock-ahead stamp, readout guard sentence, missing Harness headers).
- `check-history.sh --staged` → **0 violations / 0 warnings** (98 record dates, 37,446
  protected lines judged — every flip judged a dated grow).
- `node docs/build/tools/check-append-only.mjs --base 27f8672` → OK (tree).
- `check-backlog.sh` → **complete + non-duplicating + verdict-consistent** at 369 expected
  sources.
- `pnpm turbo build lint typecheck` → 135/135 · `pnpm test` → **5,575 pass / 4 skip / 0
  fail** (489 files, incl. the new parity test).
- `deferral-status-normalize.mjs --verify` → 106/106 G1 rows read the ratified
  disposition.

## Deferrals

Opened: none. Closed: **96 rows normalized** — 55 → DONE, 41 → WONTFIX (`DROPPED
2026-10-14:` literal closes). Honestly-owed residuals left verbatim: `D-P0.06-3` (G1
DEFER, BL-02 carry), `D-P1.18-1`/`D-STB.5b-5`/`D-CAP.2-2`/`D-EDIT.1-2` (trailing DONE
names a sub-leg/sibling, not the row).

## Requirement ids

REQ-MEM-1 · REQ-MEM-2 · REQ-MEM-3 · REQ-MEM-4 · REQ-MEM-5 · REQ-MEM-9 · REQ-MEM-10 ·
REQ-G1-2 · REQ-G1-3 (V-3 half)

## Evidence

`runs/HYGIENE.1.md` · `reports/2026-10-14_deferral-census.{txt,json}` · upstream
`agent-skills@e981ec5` · `mergePolicy: OPERATOR` — stacked on `stevevitali/r5-synthesis`,
never merged by this run.
