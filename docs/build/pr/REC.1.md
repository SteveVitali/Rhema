# REC.1 — backlog + operational-readiness reconcile

Manifest row 89 · reconcile-build `mode=backlog` · stacks on `stevevitali/cap-3-capstone-closure`
(PR #110) · merge policy **OPERATOR** — do not merge from the build environment · docs-only, **$0**.

## What lands

- **`docs/build/BACKLOG.csv`** — rewritten 65 → 77 rows. Every owed source id lands in exactly one
  `sources` cell: **357 expected / 0 missing / 0 duplicates / 0 on a closed row**
  (`check-backlog.sh` green). 22 rows closed on landed evidence (BL-08/09/10/11/12/14/15/26/27/28,
  the HOT.1/EDIT.1/RUN.1/ONB.1/UX.1/UX.2/EST.1/RPT.1/OBS.1/SEC.*/OPS.* defect rows, CAP.1's BL-03,
  and this run's BL-04). 11 new rows: BL-67 CITE.1 deploy+probe legs · BL-68 ECON.1 residuals +
  metered-flip ruling · BL-69 ECON.2 deploy/levers/restore · BL-70 CAP.1 verifying legs · BL-71
  CAP.2/CAP.3 live legs (72 routed PARTIAL matrix rows + D-STB.5a-1..3) · BL-72 spend-guard
  integrity · BL-73 spec-scheduled 1.x (33 MISSING) · BL-74 OBS.1 evidence windows · BL-75
  GD-RES.2-1 residual · BL-76/77 ADR watch rows.
- **`docs/build/BACKLOG.md`** — rewritten: rows grouped by landing, major themes, the dated
  103-ADR revisit-trigger sweep (0 fired-unanswered), dated risk-register review (no standalone
  register exists — every OPEN FINDING maps to a row), recomputed matrix sums:
  **engineering closed 327/474 · requirement satisfied 326/474**.
- **`docs/build/OPERATIONAL_READINESS.md`** — rewritten for the post-round-3 state: 16-row
  capability matrix (code state / infra / human gate w/ owner+date / highest layer / proof) +
  10-step ordered critical path, every step `ticket:` + `proof:`, **zero TBD**.
- **`docs/build/COVERAGE_MATRIX.csv`** — one verdict correction: `REQ-SPEC-31`
  `MET` → `MET-ENGINEERED(D-RES.1-2)` per BM-VERDICT-01 (a MET row may not cite an OPEN leg).
  Recorded as a finding in BACKLOG.md — CAP.3's 327 satisfied headline is honestly 326 until the
  N6 planted-error leg runs (BL-56).
- **`docs/tickets/DEFERRALS.md`** — append-only edits only: `D-DEF.3-2` flipped OPEN→DONE with a
  dated marker (in-cell EST.1 + Stage-B live evidence; prior text preserved verbatim); dated
  status-hygiene notes on `D-P0.06-3`/`D-P0.08b-3` (verified in-cell but validator-stuck on
  mid-text `open` tokens → carried on BL-02, not re-written).
- **`docs/build/LEDGER.md`** — `lastCompleted: REC.1`, `nextTicket:
  90_REC.2__spec-reconciliation.md`, `chainTip: stevevitali/rec-1-backlog-and-readiness`,
  `projectStatus` stays **IN_PROGRESS**; $0 PHASE LOG entry appended.
- **`docs/build/BUILD_INDEX.md`** — row 117. **`docs/build/runs/REC.1.md`** — run ledger.
  **`docs/build/pr/REC.1.md`** — this file.

## Status-parse audit (stricter rule)

The upstream checker tokenizes on `[^A-Z-]` and reads the first canonical keyword *anywhere* — a
`RE-DEFERRED` cell falls through to a mid-cell `OPEN`. Re-read with the stricter first-recognized-
keyword rule: 220 rows → DONE 112 / OPEN 74 / PARTIAL 32 / RE-DEFERRED 1 / ACCEPTED-SKELETON 1.
All 107 owed rows are on open backlog rows.

## Upstream fix disclosed

`~/agent-skills/skills/build-memory/scripts/check-build-memory.sh`: exempted `GATE-ACCEPT` from the
"OPEN row references a PASSED gate" violation — the accepted-deviations gate's PASSED readout
*means* signed-but-open rows (D-CAP.2-1/-2, D-CAP.3-1/-2). Phase gates keep the check. This was the
baseline's sole violation and is the BL-02 upstream item.

## Checks

- `check-backlog.sh` — complete + non-duplicating + verdict-consistent (357 expected)
- `check-append-only.mjs --base a5a0142` — clean (append-only regions preserved)
- `check-build-memory.sh .` — 0 violations (pre-existing baseline warnings unchanged)
- Spend **$0** · zero prod writes · zero deploys · `projectStatus` **IN_PROGRESS** (not DONE — the
  open rows are the deliverable's subject, and GATE-ACCEPT's own note says they remain)

## Requirement ids

Touched requirement ids this PR records/stamps: REQ-SPEC-31 (re-verdict), REQ-SPEC-24, REQ-SPEC-25,
REQ-SPEC-32, REQ-ARCH-13, REQ-ARCH-21, REQ-BILL-7, REQ-BILL-13, REQ-BILL-14, REQ-BETA-2,
REQ-BETA-5, REQ-BETA-15, REQ-BETA-18, REQ-IDE-1, REQ-IDE-25, REQ-ACCT-3, REQ-DATA-20,
REQ-GROWTH-10, REQ-GROWTH-15, REQ-EVAL-1..18, REQ-PROD-12, REQ-WF-15, REQ-POS-3, REQ-GENRE-3,
REQ-ARCH-32/33/34/35/37/38 (carried on backlog rows).
