# R7REC.1 — round-7 combined backlog + spec fold-back

**Ticket:** `docs/tickets/253_R7REC.1__backlog-and-reconciliation.md` (chain row 302) · **REQ-CLOSE-3**
**Harness:** devin-desktop/swe-2-high/subagent · **Spend:** $0 (Stage A, read-only probes; live_verification=false)
**Base:** `stevevitali/r7cap-1-gap-analysis` @ `869e14c4` · mergePolicy: OPERATOR (this PR is not self-merged)

## Backlog (reconcile-build mode=backlog)

`check-backlog.sh` — **420 expected sources · complete + non-duplicating + verdict-consistent**
(entry: 87 issues). Sums: **engineering closed 740/900 · requirement satisfied 705/900**.

- **BL-104** — the bespoke-capture bundle (32 D-ids): every Stage-B screenshot/probe arm the green leg board doesn't produce, carried OPEN to a deployed walk.
- **BL-105** — defect/authority: D-R7DEP.2-2 (F-9…F-16), D-R7TOUR.2-1 (prod arm → F-9 insert), D-R7DEP.2-1 (paid U6 re-dispatch — operator ruling; F-17 funding fix).
- **BL-106** — nine round-6 OPEN rows homed → 204_R6REC.1 / 205_R6REC.2.
- **BL-107** — REQ-CLOSE-4 → 254_R7DOC.1. **BL-108** — GATE-ACCEPT.R7 signed deviations (`accepted`).
- Appends: BL-100 += D-R7DEM.2c-1 (re-home per GATE-ACCEPT.R7 (b)); BL-76 += ADR-131…136; BL-84 += ADR-111…125; BL-30 cell quoted.
- `BACKLOG.md` — dated ADR-126…130 revisit sweep (all five **quiet**) + the two sums + risk review.
- `DEFERRALS.md` — sweep dispositions: 13 DONE normalizations (validator-stuck tails), ~32 OPEN→BL-104 (3 canonical-OPEN restores + D-R7WRITE.2-1), defect rows → BL-105, D-R7DEM.2c-1 → BL-100, `## R7REC.1` section.
- `COVERAGE_MATRIX.csv` — REQ-CLOSE-2/-3 → MET; REQ-FIX-T8 → MET; REQ-DWEB-4/-7, REQ-DOPS-5, REQ-CLOSE-5 → MET-ENGINEERED; REQ-OPS-5 narrowed.

## Spec fold-back (reconcile-build mode=spec)

Dated banners applied where spec §3.2's anchor list was missing them (ticks: ratified ADR-126…130 + GATE DECISIONS rows):

- design spec — ADR-130 (§5.5 D20, REQ-IDE-19), ADR-128 (REQ-IDE-41 kept, REQ-IDE-48), ADR-129 (§15)
- SPA spec — ADR-126 (§14.8, demo SPA read-only every device class), ADR-128 (keymap: `?` kept)
- post-spa — REQ-NAVM-7 discharged by REQ-SPEED-3
- round-7 spec — post-ratification notes (GD-PUBDELTA/PREVIEW/GOLDEN/TOURSIGN + §10 superseded)
- **Gate:** `docs/build/tools/check-adr-banners.mjs` — 15 (ADR, file, anchor) pairs green
- `TICKET_VS_SPEC.md` §Round 7 + `SPEC_RECONCILIATION_PLAN.md` §6 + manifest amendment line

## Operational readiness

`OPERATIONAL_READINESS.md` §Round-7 tail — demo/image-assert/CDN/`demo_events`, shell+keymap, guards, hero-recording refresh, preview posture (history, not standing authority). No TBD.

## Live reads ($0)

- prod `/healthz` → `gitSha e578a767` at 2026-11-08T19:46Z (≤24 h)
- `ci-boundary --stack --no-wait` 2026-11-08T19:46:46Z (`logs/ci-stack-R7REC.1.json`): stack green except **#300 integration fail — external GitHub CDN outage class** (recorded honestly)

## Ordering hand-back (GD-ORDER.R7)

`200_R6WATCH.1` has **not** landed → `nextTicket: 200_R6WATCH.1` (clock-bound ≥ 2026-11-11T04:0xZ); `254_R7DOC.1` named the round-7 row to return to after it (docs refresh then describes the R6 post-launch read too).
