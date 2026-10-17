<!--
  docs/build/readouts/R5REC.1.md — append-only reconcile readout for ticket
  171_R5REC.1__backlog-and-readiness.md (round-5 reconcile, offline, $0).
-->
# R5REC.1 — round-5 backlog + operational-readiness reconcile — readout

- **Criterion (verbatim, `171_R5REC.1__backlog-and-readiness.md`):** "Reconcile BACKLOG.csv +
  DEFERRALS.md effective statuses after the round: every row lands its final disposition
  (DONE / DROPPED-dated / DEFER-to-named-track / carried-forward), zero zombie cells remain,
  and the operational-readiness tail is recorded." AC: "Zero rows whose cell and dated tail
  disagree (deterministic) + universal phase-gate AC."
- **Branch:** `stevevitali/r5rec-1-backlog-readiness`, stacked on
  `stevevitali/r5cap-3-capstone-closure` @ `bdc3e1f` · **mergePolicy:** OPERATOR (never merged
  by the agent) · **layer:** in-repo deterministic + committed live evidence · **$0, offline —
  no live stage, no prod contact.**

> An operator or authorized human record supplies the decision; an agent must not sign or
> assume silence is approval.

## Disposition — 2026-10-17: **RECONCILED — zero zombies, backlog verdict-consistent**

### 1. Zombie sweep (REQ-MEM-1)

The effective-status census was re-run against `docs/research/r5_g1_dispositions.md`. A
"zombie" = the cell's leading canonical token mis-states the disposition the dated tail
ratified. **20 cells normalized this pass** — each got a dated `2026-10-17 (R5REC.1)` prepend
preserving the original cell verbatim under `Original cell:` (append-only; the HYGIENE.1
convention). No row deleted, no historical text rewritten, nothing closed without cited
evidence:

- **16 → `DONE`** (the dated tail already records the discharge; the lead token predated it):
  `D-OPS.1-2`, `D-MAINT.6-1`, `D-SPA.12-1`, `D-SPA.13-1`, `D-SPA.14-1`, `D-SPA.15-1`,
  `D-SPA.17-1`, `D-SPA.18-1`, `D-SPA.19-1`, `D-SPA.21-1`, `D-SPA.22-1`, `D-SPA.23-1`,
  `D-SPA.25-1` — all VERIF.2-green on `pr-186` (`reports/2026-10-16_verif2/`);
  `D-CAP.1-2` (VERIF.1 emission audit, `2026-10-15_VERIF.1-emission-audit/`); `D-P0.06-3`
  (SEC.3 Stage-B live, `01M41AE99M49Q5HNG4M9S6106Q` — the REC.1-noted parser-stuck class now
  normalized in-repo); `D-P0.01-4` (OPS.2 turbo-cache discharge, ADR-081).
- **4 → `PARTIAL`** (tail records code-half-landed + live-leg-owed — the honest half-status):
  `D-STB.5b-4` + `D-STB.5b-5` (MAINT.3 code-fixed; live legs ride `D-FIX.1-3`/BL-78),
  `D-CAP.1-1` (CAP.3 engineered half; live deep-link walk → `D-CAP.2-2`), `D-P1.04-2`
  (`DONE-code` compound token outside the canonical grammar; schedule half DONE at `ffbb8ad`,
  the +30d destruction fire stays clock-owed).

Checker-canonical read after the pass: **DONE 193 · OPEN 68 · PARTIAL 29 · WONTFIX 41**
(previously DONE 177 / OPEN 87 / PARTIAL 25 / WONTFIX 41 / ACCEPTED-SKELETON 1). Every
remaining `OPEN`/`PARTIAL` row is carried forward with a named carrier — nothing was
silently dropped; nothing flipped merely because a dated note describes engineered work.

**Reviewed-and-not-a-zombie (representative):** `D-P0.15-2` (leading DONE ratified by the
real 2026-09-22 operator ruling on D-PRB.16-5 — the R5OPS re-ask `GD-PRB.16-5-1` concerns a
different metered-mode residual; the mid-cell "stays PARTIAL" is earlier history);
`D-EDIT.1-2` (the `DONE` token refers to sibling `D-EDIT.1-1`; the row itself stays OPEN —
Safari/WebKit leg operator-blocked); `D-PRB.07-1` (leading PARTIAL is the honest read — the
trailing "Stays OPEN" is narrative for the same owed leg; both are owed statuses);
`D-SPA.6-1` (the dated tail itself keeps it OPEN — preview half discharged, post-merge leg
owed); the `WONTFIX → OPEN`-mention rows (the drop note names the still-OPEN carrier row —
the dated `DROPPED` disposition stands).

### 2. Backlog reconciliation (REQ-MEM-2 verification half)

`check-backlog.sh` on entry: **25 issues**. Repaired:

- **6 `met-with-owed-leg` stale verdicts** → honest `MET-ENGINEERED(D-…)`: `REQ-FND-5`,
  `REQ-FND-6`, `REQ-FND-7`, `REQ-FND-8`, `REQ-G1-4` → `MET-ENGINEERED(D-CAP.2-1)` (the
  carried 21-leg funded wave, `GD-FUNDED.1-1` = CARRY, `$0` spent, future envelope ruling
  required); `REQ-OPS-5` → `MET-ENGINEERED(D-OPS.1-1;D-SPA.16-1;D-SPA.20-1;D-SPA.24-1;
  D-SPA.6-1)` (the five preview/post-tip legs that VERIF.2 could not discharge).
- **1 `stale-met-engineered`:** `REQ-ED-17` re-verdicted up to `MET` — `D-SPA.25-1`'s T17
  source-mode leg ran green on pr-186 (VERIF.2); every leg is DONE at its layer.
- **15 owed sources without a home** — each housed on exactly one open row: `D-BL38.1-1`,
  `D-BL38.1-2` → **BL-85** (new — `prod:d5a74cc` stamp delete, operator write + the
  ~2026-10-30 purge verify); `D-COST.1-1`, `D-COST.1-2`, `D-COST.1-3`, `REQ-COST-5` → BL-29
  (billed actuals, `import_preview_p95_s` re-probe, paused out-of-class levers + soak spec);
  `D-R5OPS.1-1`, `D-R5OPS.1-2`, `REQ-OPS-3` → BL-24 (organic-cohort first-finding measure +
  CDN signed-URL repair — the `AccessDenied` 403 origin-read defect); `REQ-OPS-6` → BL-74
  (first scheduled-nightly green is merge-dependent); `REQ-OPS-7` → BL-36 (fail-closed
  nightly-golden driver — `GD-R5OPS.1-1` AWAITING); `REQ-MEM-6`, `REQ-MEM-7`, `REQ-MEM-8` →
  BL-05 (spec amendments routed to R5REC.2); `REQ-G1-5` → **BL-86** (new — the H8
  operator-session bundle, PARTIAL at 1/~12 items).

On exit: **367 expected sources — complete + non-duplicating + verdict-consistent.**
Sums recomputed: engineering closed **591/752**; requirement satisfied **573/752**
(MET-ENGINEERED never counts as MET — the six re-verdicted rows moved requirement-satisfied
down from 578, which is the honest number while the funded wave stays carried).

### 3. Operational-readiness tail (recorded in `OPERATIONAL_READINESS.md`)

Dated 2026-10-17 addendum supersedes the stale facts by name: the Resend secret is seeded
(D-MAINT.6-1 DONE — critical-path step 1 complete); 13 preview legs discharged on pr-186, 5
stay OPEN; prod cost `$285.80 → $198.32` list (update 151, class-A only); soak done
(D-OBS.1-2) but **first scheduled-nightly green is merge-dependent**; named-red SLOs
`D-SLO.1-5/-6/-7/-8` stay OPEN; `balance_divergence` paged 2026-10-15 (six included-bucket
accounts, `expectedHeld=-3860` — classification owed); CDN usercontent signed-URL delivery
nonfunctional (origin-read 403 — repair leg owed); **nightly-golden budget ruling
`GD-R5OPS.1-1` AWAITING** (~$150–300/night — not answered by the agent); funded wave
`GD-FUNDED.1-1` = CARRY ($0 spent); prod serves **pre-chain `ffbb8ad`** — no round-4/5 code
live; merge sweep operator-owned; H8 bundle 1/~12 done; **`projectStatus: IN_PROGRESS`**.

### Operator flags (not discharged, not answerable by the agent)

`GD-R5OPS.1-1` budget ruling · `GD-FUNDED.1-1` funded-envelope ruling · the merge/deploy
sweep (BL-01 → BL-81 → BL-82) · H8's ~11 remaining items (BL-86) · the CDN IAM/origin
decision (D-R5OPS.1-2) · the `prod:d5a74cc` stamp delete + purge verify (BL-85) · the
out-of-class cost-lever rulings + billed-actuals export (BL-29).

_Agent-drafted; unsigned — the operator's dispositions stand as recorded in the cited dated
cells, and nothing herein signs for them._
