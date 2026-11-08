# Run ledger — R7CAP.1 (manifest 251)

| key | value |
|---|---|
| ticket | 251_R7CAP.1 — round-7 capstone gap analysis |
| harness | devin-desktop/swe-2-high/subagent (implement-spec; gap_analysis=true, live_verification=false) |
| branch | `stevevitali/r7cap-1-gap-analysis` off `stevevitali/r7dep-2-t1-prod` @ `5c7d3cfb` |
| date | 2026-11-08 · spend **$0** · zero production mutations · never merge |

## Independence

Verdicts composed from the spec + tree + deployed evidence (2026-11-{04,05,07,08} report dirs)
BEFORE any runs/R7*.md was read; ledgers reconciled afterwards — AC-4 ordering satisfied.

## Deliverables

- `docs/build/reports/CAPSTONE_GAP_ANALYSIS_R7.md` — full report (roll-ups, seam hunt, finding
  accounting, deferral census, §1 judgment, acceptance-list draft).
- `docs/build/COVERAGE_MATRIX.csv` — +135 round-7 rows; checker extended to `round-7-draft-spec`
  (`…` ranges) → **6/6 green**. Pre-existing `dom-contract.tsx` drift on 5 older rows fixed to `.ts`.
- `docs/build/planning/2026-11-03_r7-demo/finding-map.csv` — every R5/R6/RV/R7 finding
  dispositioned (closed / routed-BL / wontfix / carried-D-row); zero unmapped.
- `docs/tickets/DEFERRALS.md` — `## R7CAP.1` census + dated tails: 11 rows census-closed;
  ~30 bespoke captures → 253_R7REC.1; defect/authority rows → 252 operator / F-9 insert.
- `docs/build/CAPSTONE_CLOSURE.md` §R7 — the acceptance-list draft (deferrals / deviations / waivers).
- BUILD_INDEX row 301; LEDGER advanced to R7CAP.1 / nextTicket 252.

## Verdict counts

111 MET · 0 MET-DIFFERENTLY · 18 MET-ENGINEERED · 1 PARTIAL (REQ-KIT-5 +0.3 kB) ·
3 MISSING→routed · 1 N/A-RATIONALE.

## Judgement calls

- The 12 Stage-B reds split honestly: F-9 asset-parity; F-10…14 product defects → insert;
  F-15 pre-existing; F-16 env-bound — none treated as code failure vs external constraint.
- `U3.stopgap` remains `expected:"green"` in registry but is superseded by `U3.occlusion`
  (D-R7PANE.1-1) — recorded, not re-flipped.
- Paid U6: the one authorized dispatch failed 402, metered $0.00 — paused; re-dispatch
  authority routed to the operator, not re-attempted.
- HUMAN-H16: no F-R7UX rows anywhere → waiver candidate, flagged to the operator.
- Census-closed rows got dated tails only (append-only); nothing rewritten.

## Checks

check-coverage-matrix 6/6 · append-only (below) · build-memory (below) · ci-boundary
recorded at PR head (below). Probe: prod /healthz 200 @ e578a767, 2026-11-08T11:09Z.
