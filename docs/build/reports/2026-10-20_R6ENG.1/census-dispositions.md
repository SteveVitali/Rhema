# R6ENG.1 (REQ-ENG-6) — `r6_open_work_census` §5 flag dispositions + BL-02 sweep

**Date:** 2026-10-20 · Per the census's own rule, the flagged rows are "flagged, NOT flipped"
— a flip lands only here, with evidence, through this reconciliation pass.

## BL-02 sweep

`docs/build/COVERAGE_MATRIX.csv` — verified rows: **332, dirty-leading: 0** (the BL-02
sweep's own count). Additionally `REQ-FIX-BL22-T7DEST` was re-pointed
`deferral:D-FIX.1-4` → `deferral:D-P1.04-2` (the correct carrier); all six
`check-coverage-matrix` tests pass.

## §5 flag dispositions

| row | disposition | evidence |
| --- | --- | --- |
| **BL-06** | **FLIPPED → closed** (BACKLOG.csv row rewritten RESOLVED, `done 2026-10-20`; BACKLOG.md row updated) | DOC.1 `20e29ec`/#114 carried the `phase1-exit-readout` dated append-only correction; DOC.2 #115; the X-tail refresh landed green R5DOC.1 #193 + R5DOC.2 #194. |
| **BL-80** | **kept open** | Preview secret seeded and preview legs reported green, but the residual interpretation is operator/live-bound — the row text already names the residual; no falsifiable offline verdict exists. |
| **BL-82** | **kept open** | Composed verification legs green except D-MAINT.4-1 — residual is a live leg; row unchanged. |
| **BL-74** | **kept open** | Soak + N4 evidence exists; the scheduled-nightly evidence remains owed (it is exactly what REQ-ENG-8 makes honest — recorded, not flipped). |
| **BL-24** | **kept open, annotated** (csv title now marks the injection smoke discharged) | Canary-pause smoke passed 2026-10-15 (R5OPS.1 REQ-OPS-1: `pause_signals` claimed, refusal gate, $0, rollback clean). Residuals stand: alert-channel page, `usercontent` headers on a CDN-signed URL, first-finding ≤4 min, D-R5OPS.1-2 (LB→private-bucket 403), D-R5OPS.1-1 (organic cohort). |
| **D-P1.22-2** | **kept PARTIAL, dated note appended** (DEFERRALS.md cell append-only) | Injection-control half (b) DISCHARGED on the 2026-10-15 R5OPS.1 leg; surviving residual (c)→D-R5OPS.1-2, (e)→disposer, (f)→D-R5OPS.1-1. |
| **BL-87** | **flip held for PR-closeout** | Local REQ-ENG-1 evidence lands with this run (see `dom-settle-audit.md` + `flake-iterations.md`); the row flips only on exact-head CI evidence per the ticket's own sequencing. |
| **D-R5REC.1-1** | **flip held for PR-closeout** | Same rule — the deferral's discharger is the mount-settle fix + evidence, closed with BL-87 when CI reads green at the PR head. |
