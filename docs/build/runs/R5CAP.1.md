# R5CAP.1 — Round-5 capstone: whole-round gap analysis — run ledger

- **Spec:** `docs/tickets/168_R5CAP.1__capstone-gap-analysis.md` (manifest row 168, round 5,
  Kind: capstone)
- **Normative loads:** `docs/post-spa-disposition-spec.md` (whole spec);
  `docs/research/r5_g1_dispositions.md` (census of record); `docs/build/COVERAGE_MATRIX.csv`
  + `scripts/check-coverage-matrix.test.mjs`; `docs/build/BACKLOG.csv`;
  `docs/tickets/DEFERRALS.md`
- **Base:** `stevevitali/funded-1-funded-window-wave` tip @ `e683c34`
- **Branch:** `stevevitali/r5cap-1-capstone-gap-analysis` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory
  @ `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** REQ-G1-1 REQ-G1-4
- **Independence (BM-VERDICT-01):** verdicts formed from the spec + the composed tree + the
  disposition census BEFORE reading any run ledger's self-report; discrepancies routed, never
  smoothed.
- **Live stage:** none · **Production mutations:** none (repo reads only)
- **Started:** 2026-10-16T22:02Z

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Round-5 rows surveyed: the funded-carrier
set (D-CAP.2-1 umbrella + §5.6 census rows — carried per GD-FUNDED.1-1 CARRY), the VERIF.2
residual carriers (D-SPA.24-1, D-SPA.16-1, D-SPA.20-1, D-FIX.1-1, D-OPS.1-1, D-SPA.6-1), the
COST.1 residual (D-COST.1-3), the R5OPS.1 residuals (D-R5OPS.1-1/-2), D-BL38.1-1/-2, D-FIX.1-*.
No OPEN row is closeable by an offline gap-analysis ticket — the analysis dispositions, it does
not verify live legs.

## Requirements (from the contract)

1. `docs/build/reports/CAPSTONE_GAP_ANALYSIS_R5.md` — every in-scope REQ id + spec § judged
   with evidence (MET / MET-DIFFERENTLY / MET-ENGINEERED / WAIVED / PARTIAL / MISSING /
   AT-RISK-INTEGRATION).
2. COVERAGE_MATRIX rows for the round-5 REQ ids (REQ-NAVM/NAVT/NAVC/ECON/FND/FIX/OPS/COST/
   MEM/G1) per `scripts/check-coverage-matrix.test.mjs`'s schema.
3. Every PARTIAL/MISSING routed: closing ticket, DEFERRALS row, or the GATE-ACCEPT.R5
   deviations list — nothing floats.
4. Disposition-census completeness: every DECOMPOSE row → landed ticket or named deferral;
   every OPERATOR row → ruling or named owner (REQ-G1-1/4/5). Just-closed operator items:
   H8 partial, H9 ruled, GATE-R5F PASSED, GD-FUNDED.1-1 CARRY, GD-R5OPS.1-1 nightly-golden
   budget (AWAITING if unruled — flag honestly).

## Acceptance criteria

- [ ] Every round-5 REQ id judged with evidence; zero unmapped (deterministic)
- [ ] `check-coverage-matrix` + `check-build-memory` green (deterministic)
- [ ] universal phase-gate AC

## Plan

1. Extend the checker's spec union to `docs/post-spa-disposition-spec.md` (the round-5 REQ ids
   are authoritative only there — without this, matrix rows would fail the extras check);
   alphanumeric id regex + declared non-ids exclusion (REQ-NAVC-7..15 renumbered away per §4
   note; REQ-NAVC-24 spec-declared nonexistent).
2. Verify every REQ id in-tree: nav machinery (NAVC.1–5 commits), settle contract, registry
   invariants, econ regime, fixture repairs, ops residuals, cost posture, hygiene.
3. Census completeness cross-check vs BACKLOG.csv + DEFERRALS.md.
4. Write report + 86 matrix rows + routings; run full verification; close via BUILD_INDEX /
   LEDGER / PHASE LOG.

## Test matrix

- `check-coverage-matrix` must pass with the 86 new rows (schema, verdicts, ref resolution).
- `pnpm turbo build lint typecheck` + `pnpm test` green.
- `check-build-memory.sh .` + `check-append-only.mjs --base e683c34` green.

## Progress

- 22:02Z — branch cut at `e683c34`; ledger seeded; contract + spec + census + checker loaded.
  Round-5 composed tickets identified: HYGIENE.1#172, FIX.1#173, VERIF.1#174, CIREP.1,
  NAVC.1#175, NAVC.5#176, NAVC.2#177, NAVC.3#178, NAVC.4#179, R5ECON.1#180, R5ECON.2#181,
  R5ECON.3#182, R5OPS.1#183, BL38.1#184, HUMAN-H9 ruled, COST.1#185, H8 partial (Resend
  seeded), VERIF.2#186, GATE-R5F PASSED, FUNDED.1#187 (refused, CARRY).
- 22:2xZ — independent verdicts formed (BM-VERDICT-01): nav machinery (`nav-intercept.ts`,
  `main.tsx`, `dom.ts`, `states.tsx`, `head.tsx`, `page-sessions.ts`, `page-mount.tsx`,
  `queries.ts`, `dom-contract.ts`), settle contract (`settle.ts`, `runner.ts`, registry
  R10/R10.keepalive), econ/funded regime (`spend-guard.ts`, `window-plan.ts`,
  `cogs-levers.ts`, funded drivers in `scripts/live/`), fixture repairs (`steps.ts`,
  `stb5a.ts`, `seed-bl78-fixtures.mjs`, `mint-t8-export.mjs`), ops residuals
  (`canary-pause.mjs`, `usercontent-cdn-verify.mjs`, `first-finding-latency.mjs`,
  `nightly-golden-driver.mjs`, `preview-stack.mjs`), cost posture (`stages.ts`, `compute.ts`,
  `billing-read.mjs`, `redis-degradation-analysis.md`), memory hygiene
  (`deferral-status-*.mjs`, `deferral-status-parity.test.mjs`). TanStack pin noted:
  `@tanstack/react-router@1.170.40` (the spec's pin) — resolved `router-core` is `1.171.33`,
  which is what the OQ1 history-slot pin names; recorded as a footnote, not a discrepancy.
- checker repair — `scripts/check-coverage-matrix.test.mjs` extended: the round-5 corpus
  (`post-spa-disposition-spec.md` + `r5_f1_funded-census.md` + `r5_g1_dispositions.md`) joins
  the authoritative union; the wider id grammar (digit-carrying families, alphanumeric/
  multi-segment suffixes, slash-set siblings) extracted; `R5_NON_IDS` excludes the
  spec-declared non-ids (REQ-NAVC-7..15 renumbered away; REQ-NAVC-24 nonexistent). Union:
  666 product ids + 86 round-5 ids = 752. A stray-backtick syntax error self-introduced in
  the edit was caught by `node --check` + vitest and repaired before any commit.
- 86 matrix rows appended in family blocks (NAVM/NAVT/NAVC/ECON/FND/FIX/OPS/COST/MEM/G1) —
  753 lines incl. header = 752 ids exactly; checker 6/6 green (two self-caught missing-file
  refs fixed: `cogs-levers.test.ts` lives under `packages/contracts/src/domain/`;
  `seed-bl78-fixtures.test.mjs` does not exist → `window-plan.test.ts` cited instead).
- report written — `docs/build/reports/CAPSTONE_GAP_ANALYSIS_R5.md`: per-family verdict
  tables, §0–§11 section judgments, disposition-census completeness tables
  (DECOMPOSE + OPERATOR), run-ledger reconciliation, routings summary.

## Gap table

| item | required layer | achieved | status | evidence | reason/routing |
|---|---|---|---|---|---|
| REQ-NAVM-1..10 (deliverable: nav mechanism) | engineered | engineered + staging-verified (pr-186 R10) | **10/10 MET** | `reports/CAPSTONE_GAP_ANALYSIS_R5.md` §REQ-NAVM | — |
| REQ-NAVT-1..4,6..8 | engineered + fixture/staging-verified | achieved | **MET** | same, §REQ-NAVT | — |
| REQ-NAVT-5 | staging-verified (live keepalive leg) | engineered; leg needs domains-bearing stage | **MET-ENGINEERED(D-SPA.24-1)** | `page-mount.tsx:331`, registry R10.keepalive `expected:"red"` | owed → D-SPA.24-1 |
| REQ-NAVC-16..23 | engineered | achieved | **8/8 MET** | report §REQ-NAVC | — |
| REQ-ECON-1..13 | engineered | achieved | **13/13 MET** | report §REQ-ECON | — |
| REQ-FND-1..8 | engineered + live-attempted | achieved (regime exercised at bind; wave carried) | **8/8 MET** | report §REQ-FND; `reports/2026-10-16_funded-env/` | executions → D-CAP.2-1 (CARRY) |
| REQ-FIX-P1D/T17/T12F/T13F | live-verified | achieved (ready-to-flip / green) | **4 MET** | report §REQ-FIX | — |
| REQ-FIX-T8/T15/T16/BL22-T7DEST/BL78-5B4/5B5/M31 | live-verified | engineered; live halves clock/paid/funded-owed | **7 MET-ENGINEERED** | report §REQ-FIX | → D-FIX.1-1..4 (+ D-CAP.2-1) |
| REQ-OPS-1/2/5 | live-executed | achieved | **3 MET** (OPS-2 MET-DIFFERENTLY per Q-ALERT) | report §REQ-OPS | — |
| REQ-OPS-4 | live-executed | engineered; needs organic signups | **MET-ENGINEERED(D-R5OPS.1-1)** | `first-finding-latency.mjs` | → D-R5OPS.1-1 |
| REQ-OPS-3/6/7 | live-executed | partial substance landed | **3 PARTIAL** | report §REQ-OPS | → D-R5OPS.1-2 / BL-01+H8 / GD-R5OPS.1-1+D-P0.15-4 |
| REQ-COST-1/2/3/4 | live-executed / engineered | achieved | **4 MET** (COST-1 MET-ENGINEERED billed-actuals owed) | report §REQ-COST | — |
| REQ-COST-5/6 | live-executed | partial / engineered | **1 PARTIAL + 1 MET-ENGINEERED** | report §REQ-COST | → D-COST.1-3 / D-COST.1-2 |
| REQ-MEM-1..5,9,10 | engineered | achieved | **7 MET** | report §REQ-MEM | — |
| REQ-MEM-6/7/8 | engineered (spec fold-back) | unlanded | **3 MISSING → routed** | report §REQ-MEM | → R5REC.2 (manifest row 172) |
| REQ-G1-1/2/3/4 | this analysis | achieved | **4 MET** | report §REQ-G1 | — |
| REQ-G1-5 | human-completed (operator bundle) | one item done | **PARTIAL** | report §REQ-G1-5 | → H8 checklist (named owner) |
| deliverable: report | written | achieved | MET | `docs/build/reports/CAPSTONE_GAP_ANALYSIS_R5.md` | — |
| deliverable: matrix rows | 86 rows, schema-valid | achieved | MET | `COVERAGE_MATRIX.csv` + checker 6/6 | — |
| deliverable: routings | every PARTIAL/MISSING routed | achieved | MET | report §Routings | nothing floats |
| deliverable: census completeness | every DECOMPOSE/OPERATOR covered | achieved | MET | report §census | GD-R5OPS.1-1 flagged AWAITING |
| AC: every REQ judged, zero unmapped | deterministic | achieved | MET | matrix 752/752; checker green | — |
| AC: check-coverage-matrix + check-build-memory green | deterministic | achieved | MET | evidence log | — |
| AC: universal phase-gate | deterministic | achieved | MET | evidence log | — |

**Verdict sums (86 round-5 ids):** MET 66 · MET-DIFFERENTLY 1 · MET-ENGINEERED 11 ·
PARTIAL 5 · MISSING 3 · WAIVED 0 · AT-RISK-INTEGRATION 0. Per family —
NAVM 10 MET · NAVT 7 MET + 1 ME · NAVC 8 MET · ECON 13 MET · FND 8 MET ·
FIX 4 MET + 7 ME · OPS 2 MET + 1 MD + 1 ME + 3 PARTIAL · COST 3 MET + 2 ME + 1 PARTIAL ·
MEM 7 MET + 3 MISSING · G1 4 MET + 1 PARTIAL.

## Evidence log

- `pnpm turbo build lint typecheck` — **135/135 tasks green** (full turbo).
- `pnpm test` — **502 files (501 pass / 1 skipped) · 5,814 tests pass · 4 skip · 0 fail**
  (incl. privsep.docker 331 s green; `check-coverage-matrix` 6/6 inside).
- `pnpm vitest run scripts/check-coverage-matrix.test.mjs` — **6/6 pass**: header grammar,
  752-id union (666 product + 86 round-5), exactly one row per id (no missing/extras/dupes),
  verdict grammar, MET-family evidence nonblank, file/deferral/journey refs resolve.
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` —
  **0 violations** (8 warnings, all pre-existing classes: manifest banner/ordering,
  oversized phase-log entries incl. legacy, index legacy values, old readouts, missing
  Harness lines on old ledgers).
- `node docs/build/tools/check-append-only.mjs --base e683c34` — **OK** (PHASE LOG /
  GATE DECISIONS / DEFERRALS / Plan-extensions only grew).

## Self-review

Mechanical pass: checker repair re-verified via `node --check` + the green suite; the
two missing-file refs were caught BY the checker itself (its own ref-resolution leg did
its job — `cogs-levers.test.ts` → `packages/contracts/src/domain/`,
`seed-bl78-fixtures.test.mjs` does not exist → `window-plan.test.ts`); verdict sums
recounted mechanically against the matrix (66/1/11/5/3 = 86) after a first-pass miscount
was corrected in both the ledger and the report; stray backtick in the checker edit
caught by `node --check` before commit. Design pass: every PARTIAL/MISSING row's routing
field was re-read against the contract's three allowed routes (closing ticket /
DEFERRALS row / GATE-ACCEPT.R5 list) — all named; the funded wave judged on machinery
under the CARRY ruling rather than marked ordinary-MET or unmet; GD-R5OPS.1-1 flagged
AWAITING rather than smoothed; prod-vs-staging layer honesty recorded (prod still
`ffbb8ad`; nav verdicts are staging-verified).

## Evidence report

- **Closed:** 2026-10-16T22:29Z · **layer:** engineered (docs + checker tooling; $0
  spend; zero prod writes; no live stage).
- PR #188 opened against `stevevitali/funded-1-funded-window-wave` (mergePolicy
  OPERATOR — opened, never merged).
- Deliverables: `reports/CAPSTONE_GAP_ANALYSIS_R5.md` (all 86 ids + §0–§11 + census +
  reconciliation + routings); +86 matrix rows over a 752-id union; checker extended for
  the round-5 corpus.
- Census completeness: zero unlanded-untracked DECOMPOSE rows; zero unowned OPERATOR
  rows; GD-R5OPS.1-1 flagged AWAITING; `projectStatus` stays IN_PROGRESS.
- **ci:** pending at closeout — boundary read in the PHASE LOG entry / logs once
  reported (the recurring first-read class; stack #187–#172 previously green).
- Harness: devin-desktop/swe-2-high/subagent.
