# R6CNT.2 — Showcase build / H4 stamps / sample dossier / legal flags / exposure notice (run ledger)

- **Spec:** `docs/tickets/194_R6CNT.2__showcase-build.md` (manifest row 194, round 6; REQ-LCH-3/-4,
  halves REQ-LCH-1 + REQ-FOR-4; REQ-POS-3 proof)
- **Normative loads:** `docs/round-6-draft-spec.md` §4.2; `docs/tickets/DEFERRALS.md` rows
  D-P1.17-1/-2, D-P1.21-1, D-PRB.01-2; `docs/build/readouts/HUMAN-H11.md` (A1–A5 verbatim);
  `docs/build/reports/2026-10-21_R6CNT.1/` (h4-venue-evidence, h5-showcase-shortlist,
  sample-dossier-proposal); LEDGER GATE DECISIONS `GD-DEPLOY.R6`, `GD-EXPOSURE-NOTICE.R6`,
  `GD-CONTENT.R6`, `GD-SHOWCASE.R6`, `GD-LEGAL.R6`, `GD-LEGAL-DETAILS.R6`, `GD-R6B.R6`;
  `docs/build/reports/2026-10-21_R6FOR.2/` (verdict YES + approved draft);
  `docs/build/runs/R6DEP.1.md` (the deploy recipe this run reuses).
- **Base:** `stevevitali/r6post-2-posture-stages` @ `97e2a88` (chain tip at branch cut)
- **Branch:** `stevevitali/r6cnt-2-showcase-build` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills`
- **Requirement ids stamped:** REQ-LCH-3 REQ-LCH-4 · halves: REQ-LCH-1 REQ-FOR-4 · REQ-POS-3
- **Started:** 2026-10-23T03:53Z · **Closed:** —
- **Live stage:** prod — the ticket's named mutations only.
- **Production mutations (ticket header, verbatim):**
  - one paid Full-board run;
  - a redeploy of the tip under `GD-DEPLOY.R6`, carrying the new seed bundle + H4 stamps;
  - the showcase seed applied (`seedShowcaseProject` idempotent) and `venue_table_verified_at` set
    by `seedProtocols`;
  - the exposure notice send (only if R6FOR.2's verdict is yes, after HUMAN-H11 approves the text
    verbatim).

  Rollback = `git revert` + redeploy.

## Funding gate — the PAID FULL-BOARD RUN PAUSES (recorded BEFORE any dispatch)

**Gate cell (verbatim):** "the paid run spends the headroom GATE-R6B reserved for it; if its
estimate now exceeds the remaining headroom → PAUSE." Chain of authority: contract cell →
`GD-R6B.R6` **STAYS CLOSED** (2026-10-23; reserved headroom **$0**; re-open needs a fresh operator
ruling) → the operator's standing directive "**proceed as you see fit**" bounded at **≤ $15**
declared cap.

**The estimate (the estimator itself, `resolveEstimation` — `estimator_cells` on prod is EMPTY,
verified over the system-role DSN 2026-10-23T04:0xZ ⇒ the modeled estimators govern):**

| config | estimate | declared cap (`ceil(1.5×est)`) | cap USD | verdict |
|---|---|---|---|---|
| review · `full_board` · **frontier** (§6.5 default tier) | 10,043 cr | 15,065 cr | **$150.65** | > $15 |
| review · `full_board` · **base** (the cheapest legal tier) | 2,232 cr | 3,348 cr | **$33.48** | > $15 |

Inputs: `words: 1640` (Wells, measured in R6CNT.1), density-derived `claims: 7`, `phases: 7`
(intake, craft, verification, discourse, second_read, argument, letter — all active at full_board),
`meteredCoverage 1.25`, rigor `full_board ×1.2`. The declared cap is editable **upward only**
(REQ-BILL-7), so **$33.48 is the floor for ANY legal Full-board dispatch** — the bound is
unsatisfiable, not merely exceeded on one config. (A 0-word essay still caps ≈ $26 at base — the
per-phase churn + research intercepts dominate; no essay choice could fit.)

**Verdict: PAUSE.** The estimator-derived declared cap ($33.48 min / $150.65 at the §6.5 default)
exceeds every bound in the chain ($0 remaining headroom; ≤ $15 authorization). **Zero spend.**
The paid run + the SHOWCASE_FIXTURE bundle export it was to produce are deferred (new row
`D-R6CNT.2-1`; `D-P1.17-1`/`-2` carry dated notes). Everything else the ticket names is spend-free
and proceeds: H4 stamps, sample dossier, legal flags, `seedProtocols`/`seedShowcaseProject` apply,
the redeploy, the fresh-account Showcase leg, the notice send, the GATE-LAUNCH staging.

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows in this ticket's blast radius:

- **D-P1.17-1** (real Showcase essay seed) — unblocked only while the paid run can dispatch; the
  funding gate above keeps it OPEN → dated note.
- **D-P1.17-2** (Stage-B Showcase verification) — the fresh-account Showcase leg runs this ticket
  (against the stand-in fixture — the leg proves the provisioning → dossier-open path, which is
  content-agnostic; the real-essay half stays owed under D-P1.17-1's funding pause) → dated note.
- **D-P1.21-1** (H4 venue stamps) — discharged THIS RUN for the rows the approved evidence covers
  (PLOS ONE + the 3 fetch-confirmed outlets); the 3 fetch-blocked rows stay stale by the evidence's
  own condition → dated note; flip evaluated at close.
- **D-PRB.01-2** (sample-dossier sign-off) — H11 A3 approved the proposal verbatim; landing it this
  run → flip to DONE at close if the row's criterion is met.
