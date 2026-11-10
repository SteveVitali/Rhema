# GATE-ACCEPT.R7 — round-7 accepted-deviations sign-off — PASSED 2026-11-08

**Disposition:** SIGNED. The operator's instruction, verbatim, on the presented list:
**"continue"** (2026-11-08 — immediately after the full § R7 acceptance draft was presented).
Recorded as the operator's signature on `docs/build/CAPSTONE_CLOSURE.md` § R7 as drafted by
251_R7CAP.1. An operator record supplies the decision; this is that record.

## What was presented (the § R7 draft, verbatim class)

- **(a) Deployed + coverage posture** — prod serves `e578a767` (provenance all-PASS web+api);
  both phase deploys under `GD-DEPLOY.R7`; preview spend ≈$14/$20; 135/135 REQ ids verdicted
  (111 MET · 18 MET-ENGINEERED · 1 PARTIAL · 3 MISSING→routed · 1 N/A→BL-97); finding map 0
  unmapped; deferral census clean.
- **(b) Deferrals accepted into the tail** — ~30 bespoke-capture rows → 253_R7REC.1 sweep;
  `D-R7DEM.2c-1` → BL-100; `D-R7TOUR.2-1` → the F-9 insert; `D-R7DEP.2-2` (F-10…14) → a
  post-round defect insert.
- **(c) Deviations + waivers signed:**
  - `REQ-KIT-5` — the +15.3 kB vs ≤15 kB allowance (the standing `GD-KIT3A-BUDGET` deficit)
    **signed**.
  - `U3.stopgap` superseded by `U3.occlusion` **signed**.
  - `D2.tour` prod red = asset-parity class (hero mp4 serves 206 correctly), not tour code
    **signed** — the F-9 insert flips it.
  - **Paid U6** — the one authorized dispatch failed HTTP 402 (unfunded identity; metered
    $0.00): re-dispatch authority stays with the operator; the deferral (`D-R7DEP.2-1`)
    **signed as owed**, not re-attempted.
  - **HUMAN-H16** — no `F-R7UX-*` rows produced: **waived** as skipped/undispositioned.
  - Env-bound Stage-B legs (`JOURNEY_DATABASE_URL`, expired token, pre-existing magic-link
    loop) **recorded**.

## Effect of the signature

- `GD-DEPLOY.R7` and `GD-UX-PAIDLEG.R7` **expire** per their own terms.
- 253_R7REC.1 + 254_R7DOC.1 unblock (they assumed signed deviations).
- `projectStatus: DONE` unblocks at the round's close.
- All PRs remain unmerged — `mergePolicy: OPERATOR` is untouched; the stack merges bottom-up
  on the operator's act, never the agent's.
