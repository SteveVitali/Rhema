# R5CAP.1 — Round-5 capstone gap analysis (the REQ-G1-1 completeness check)

Manifest row 168 · stacks on `stevevitali/funded-1-funded-window-wave` (tip `e683c34`) ·
merge policy **OPERATOR** — do not merge from the build environment · contract
`docs/tickets/168_R5CAP.1__capstone-gap-analysis.md` · run ledger
`docs/build/runs/R5CAP.1.md` · the report itself `docs/build/reports/
CAPSTONE_GAP_ANALYSIS_R5.md`.

## What lands

The capstone the round was building toward: **every round-5 requirement id judged
against the composed tree — 86 ids, zero unmapped — plus the disposition-census
completeness check REQ-G1-1 requires before `projectStatus` can move.**

Independence held (BM-VERDICT-01): verdicts were formed from the spec + the composed
tree + the census BEFORE reading any run ledger's self-report; the reconciliation table
records what the self-reports claimed and whether the independent evidence agreed —
no blocking discrepancies surfaced.

**Verdict sums (86 ids):** MET 66 · MET-DIFFERENTLY 1 · MET-ENGINEERED 11 · PARTIAL 5 ·
MISSING 3. Per family: NAVM 10 MET · NAVT 7+1ME · NAVC 8 MET · ECON 13 MET · FND 8 MET ·
FIX 4+7ME · OPS 2MET+1MD+1ME+3PARTIAL · COST 3MET+2ME+1PARTIAL · MEM 7MET+3MISSING ·
G1 4MET+1PARTIAL.

**Standing facts carried honestly:**

- The funded wave is **dispositioned-carried**, not MET and not silently unmet:
  attempted at bind 2026-10-16, cumulative $80.86 ≥ ~$60 refused all 21 legs, $0 spent,
  operator ruled **CARRY** (GD-FUNDED.1-1) → owed on D-CAP.2-1.
- **GD-R5OPS.1-1** (nightly-golden ~$150–300/night budget) is flagged **AWAITING** —
  an open operator item, not counted as resolved.
- H8 partial (Resend seeded; ~12 bundle items remain operator-owed) · H9 ruled ·
  GATE-R5F PASSED.
- Prod still serves pre-chain `ffbb8ad`; nav verdicts rest on staging-verified
  (pr-186) evidence — the merge sweep (BL-01/H8) is the named owner for the prod layer.

**Every PARTIAL/MISSING is routed — nothing floats:** REQ-OPS-3 → D-R5OPS.1-2 ·
REQ-OPS-6 → BL-01/H8 merge sweep · REQ-OPS-7 → GD-R5OPS.1-1 + D-P0.15-4 ·
REQ-COST-5 → D-COST.1-3 · REQ-G1-5 → H8 checklist · REQ-MEM-6/7/8 → R5REC.2 (row 172) ·
funded executions → D-CAP.2-1. Deviation candidates named for the operator's
GATE-ACCEPT.R5 sign-off (row 170, drafted by R5CAP.3 — this run does NOT draft it):
deferred intent-preload allowlist, mark-read-parity freshness trade-off,
unlevered-vs-levered cap basis, posture-bound owed legs, the CARRY disposition.

**Census completeness:** every DECOMPOSE row → landed ticket or named deferral; every
OPERATOR row → ruling or named owner. Zero unlanded-untracked, zero unowned.
`projectStatus` stays **IN_PROGRESS** — open rows all carry landed dispositions.

## Artifacts

- `docs/build/reports/CAPSTONE_GAP_ANALYSIS_R5.md` — per-family verdict tables,
  §0–§11 judgments, census completeness tables, run-ledger reconciliation, routings.
- `docs/build/COVERAGE_MATRIX.csv` — +86 rows (the file now covers all 752 spec ids).
- `scripts/check-coverage-matrix.test.mjs` — the checker's authoritative union now
  includes the round-5 corpus (`post-spa-disposition-spec.md` + `r5_f1` + `r5_g1`) —
  without it the matrix rows would have failed the extras check; the wider id grammar
  (digit families, alphanumeric/multi-segment suffixes, slash-set siblings) is
  extracted and the spec-declared non-ids (REQ-NAVC-7..15/-24) excluded.
- `docs/build/runs/R5CAP.1.md` — this PR's run ledger.

## Verification

- `pnpm turbo build lint typecheck` — 135/135 green.
- `pnpm test` — 501 files pass / 1 skipped · 5,814 tests pass / 4 skip / 0 fail
  (privsep.docker green, 331 s).
- `scripts/check-coverage-matrix.test.mjs` — 6/6: exactly one matrix row per spec id over
  the 752-id union; no missing/extras/dupes; verdict grammar + evidence + ref resolution.
- `check-build-memory` — 0 violations.
- `check-append-only --base e683c34` — clean.
- `ci:` — pending at closeout (the recurring first-read class); boundary read recorded in
  the run ledger.

## Boundaries

Repo-read + committed-artifact work only: no production mutations, no deploys, no live
stage, no secrets, $0 spend. mergePolicy=OPERATOR — this PR is opened, never merged.
