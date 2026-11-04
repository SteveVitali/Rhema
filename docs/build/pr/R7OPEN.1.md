# R7OPEN.1 — Open round 7: rulings, ADR shells, deferrals, journey legs, finding map

**Spec:** `docs/tickets/209_R7OPEN.1__open-round-7.md` (manifest row 209 · phase round 7/R7a)
**Requirement ids:** REQ-CLOSE-5, REQ-DACC-8, REQ-DOPS-7
**Posture:** Stage A only, $0 · no prod mutations · mergePolicy OPERATOR · repo-only + one
read-only `gh run view`.

## Summary

Opens round 7 in the committed build memory. The decomposition already wrote the `### Round 7`
GATE DECISIONS block, CURRENT STATE, and `## PHASE LOG — Round 7`; this ticket **verified**
them (never re-appended, never edited a recorded cell) and filled every gap: three dated note
rows (ruling-coverage verification + the two supersession notes), five ADR shells, the
round-7 DEFERRALS region with two evidence-based flips, 14 journey legs registered
`expected:"red"` with wired owed-stubs and exactly one owner, the finding→REQ→ticket map seed,
and the §7 BACKLOG residue (BL-88…103).

## What changed

- `docs/build/LEDGER.md` — 3 dated `note` rows appended to `### Round 7` GATE DECISIONS
  (coverage verification; `GD-DEMO-DEPTH.R7` hero supersession; `GD-DEMO-RUNS.R7` S-9
  narrowing). CURRENT STATE advance lands in the closeout commit.
- `docs/adr/ADR-126…130-*.md` — shells from `_TEMPLATE.md` (Status `Proposed`, owners,
  revisit triggers); `docs/adr/README.md` regenerated via `adr-index.sh`.
- `docs/tickets/DEFERRALS.md` — `## Round 7 — open` preamble + `## R7OPEN.1` section
  (D-R7OPEN.1-1); `D-OBS.1-3` + `D-SPA.28-1` → DONE on scheduled nightly `41472916874`
  (44 PASS/21 skip/0 FAIL, provenance match on deployed `4938b8e`, OBS.1's `3c3d7a7` an
  ancestor); dated interaction notes on `D-P1.17-2` and `D-FIX.1-2` (rows stay OPEN/PARTIAL).
- `packages/journeys/src/{registry,r7legs,impls,registry.test,runner.test}.ts` — 14 rows:
  D1.hub, D2.tour, D3.readonly, P1.demo, R11.demo, U1–U7, U3.stopgap, R8.showcase.spa — all
  red/free/single-owned; stubs fail loudly `owed — owner <id>` so the nightly cannot
  re-redden and no leg can pass before its owner lands the body.
- `docs/build/planning/2026-11-03_r7-demo/finding-map.csv` — 111 rows; unmapped P0/P1 = 0.
- `docs/build/BACKLOG.csv` — BL-88…103 (§7 residue + ADR-shell + phase-preview homes); existing
  rows byte-identical.

## Design decisions

- Owner picks where spec §10 named two: `P1.demo`/`R11.demo` → R7DEM.4b (P4-5);
  `D2.tour` → R7DEM.6a with 248 R7TOUR.2 a sanctioned re-flipper (P4-23). §10 deviations:
  `D1.hub` → R7DEM.5b; `U4.controls` → R7KIT.3e. `R*.demo` concretized to `R11.demo`.
- `P1.demo` carved out of the planning-ledger P1-family owner test — a new round-7 leg
  (REQ-DACC-4), not a P1 split.
- Flips are delegated to the phase deploys (224/250) under `GD-PREVIEW.R7`; every owner holds
  its leg `ready-to-flip` — recorded in the run record's owner→leg→flipper table.

## Verification

- `pnpm exec vitest run packages/journeys/src/registry.test.ts packages/journeys/src/runner.test.ts` → 28/28 (offline runner pass: all 14 legs `owed`)
- `gh run view 41472916874` (read-only): scheduled, success, deployed `4938b8e` pinned, provenance match, 44/21/0
- `git merge-base --is-ancestor 3c3d7a7 4938b8e…` → true (D-OBS.1-3 clause)
- `pnpm turbo build lint typecheck` + `pnpm test` → see run record
- `check-build-memory.sh .` → 0 violations; `check-append-only.mjs --base <merge-base>` → OK;
  `check-backlog.sh` → baseline carried 27 pre-existing issues, zero added

## Acceptance criteria → evidence

| AC | Layer | Result |
|---|---|---|
| GATE DECISIONS covers every ruling id verbatim; gaps appended, no dupes/edits | engineered | met — committed id-by-id check in `runs/R7OPEN.1.md`; 3 dated notes only |
| ADR-126…130 shells + `adr-index.sh --check` matches | engineered | met |
| Deferral flips/notes + parity + append-only green | engineered | met |
| All legs red + owed stubs + owner/flipper map; registry tests green; no U6 paid row | fixture-verified | met |
| finding-map full coverage; unmapped P0/P1 = 0 | engineered | met |
| BACKLOG rows appended; existing rows byte-identical | engineered | met |
| Universal phase-gate AC | engineered | met — details in `runs/R7OPEN.1.md` |

Full evidence: `docs/build/runs/R7OPEN.1.md`.
