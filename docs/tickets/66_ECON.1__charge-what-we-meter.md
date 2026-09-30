# ECON.1 — Charge what we meter: ground truth, §6.5 presets, calibrated caps, `debitMode`

- **Sequence:** 66 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** money
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** BILL.3, RES.1
- **Scope (one line):** establish metered ground truth and root-cause committed-vs-metered; make the rigor presets conform to §6.5; measure instrumented cost cards after RES.1 and refit the estimator and per-bucket caps (REQ-BILL-7) in a durable calibration store; ship `debitMode` dark in the same deploy as the calibrated caps; prove F5 settlement live; prepare the paid-account notice and the operator-paused flip; run the admin-key reconcile leg (HUMAN-H7).
- **Spec §§:** 14.1 (+ the 2026-09-30 banner), 14.4 (event table; REQ-BILL-3/6/7; REQ-SPEC-24 (5)(6)(8)), 6.5 (the rigor table), 12.7 (meter of record; cross-check 2), 14.6 (per-run cap control), 16.3 #1 (instrumented cost runs), Appendix A.9 (REQ-SPEC-32 + the note)
- **REQ coverage:** REQ-SPEC-32(a) (primary), REQ-BILL-7 (primary), REQ-SPEC-24, REQ-ARCH-35, REQ-SPEC-11, REQ-BILL-3, REQ-BILL-6, REQ-BILL-13 (the reconcile leg) (stamp in the PR)
- **Absorbs (backlog):** BL-13 (the debit / calibration / §6.5-preset half: X-unit-economics, PR-E5, PR-E6, the D-PRB.21-1 residual), BL-14 (D-P0.15k-1, ADR-005), BL-10 (the F5 proof only: X-f5-settlement-live-proof)
- **Run:** `implement-spec spec=docs/tickets/66_ECON.1__charge-what-we-meter.md`
- **Gate status:** Operator-paused: the **metered-debit flip** (`debitMode=metered`), preceded by **paid-account notice** whose timing is HUMAN-H7's call; **sending** that notice; the **admin-key Usage & Cost reconcile** (HUMAN-H7 admin key, BL-34); any **one-off prod data write** (the calibration store is filled only by committed code paths — never a manual insert); any ADR that **relaxes a spec target** (REQ-BILL-7's multiplier rule, REQ-SPEC-32(c)).
- **Live stage:** Stage A: code + tests ($0). Stage B: harvest admissible prod runs ($0), then instrumented Reviews and one F5 cancel leg per the spend plan, then deploy the calibrated caps with `debitMode=committed`, ≤ $30 metered (list $)


> **Amended 2026-09-30 (operator — round-3 spend limit: hard ≤ $200, target ≤ $100):** this ticket's Stage B metered spend cap is **≤ $30** (was ≤ $40); aim for ≈ $15. Run legs cheapest-first and stop once the acceptance evidence suffices; where a leg plan below sums past the new cap, drop the lowest-priority legs and record each dropped leg as a `D-ECON.1-<n>` row (never overspend). The orchestrator pauses the chain when round-3 cumulative metered spend reaches $100 and hard-stops at $200 (LEDGER GATE DECISIONS 2026-09-30, D6 revised).

## Goal
ADR-014 decides to charge what we meter (REQ-SPEC-32(a)), but only after calibrating. Its premise figures need
checking first:
- **The 2026-09-30 run.** Quick/Base Review `01M3SK62YZST272B35CG12K6TW` "charged 632 cr" against "Editor — 1,625 cr".
- **STB.3.** 451 committed vs 1,304 metered, almost entirely on cancelled or failed runs; DEF.2's F5 fix came after.
- **D-PRB.21-1's `01M36663…`.** 586 committed vs 720 metered.

There is a strong code-level signal that the 1,625 figure is **not** the meter of record:
- The level-4 seat query (`apps/api/src/timeline-routes.ts` ~558) sums `usage_records` across **every** `source`,
  with no `source='proxy'` filter.
- `reconcileRunSpend` sets `runs.spent_credits = greatest(committed, Σ proxy)`, and the report's "632 cr spent · est.
  1,015 (0.62×)" is that field.

So proxy Σ is likely ≤ 632. That means the completed-run gap may be small, and the real divergence is in
non-completed runs and retries.

ECON.1 therefore **starts with ground truth**, then builds what ADR-014 requires:
- §6.5-conformant presets (PR-E6: Quick ran discourse and the second read)
- instrumented cost cards measured with research restored
- an estimator refit and per-bucket caps in a durable store (BL-14)
- a `debitMode` flag shipped dark in the same deploy as those caps
- the notice and flip runbook

The flip itself is the operator's.

## Load (read these — do not re-read others)
- `docs/tickets/DEFERRALS.md` (start-of-run rule; D-PRB.16-5, D-PRB.21-1, D-P0.15k-1, D-PRB.08-1, D-DEF.2-1); the planning ledger row 66 + shared-decision owners; `docs/build/BACKLOG.csv` BL-13 / BL-14 / BL-10.
- `docs/adr/ADR-014…`, `ADR-005…`, `ADR-015…` (the platform-fault class); spec §14.1, §14.4 in full, §6.5 table, REQ-SPEC-32 row + A.9 note.
- Run ledgers: `docs/build/runs/DEF.2.md` §§1–2 (the F5 fix), `STB.3.md` §4-F5, `PRB.17.md` (live folds), `RES.1.md`, `RES.2.md`.
- Accounting:
  - `packages/orchestrator/src/spend.ts`: ~18–45 `reconcileRunSpend`; ~62–114 the attempt-scoped `meteredCredits` / `incrementalMeteredDebit`; ~128 `settleMeteredDebit`; ~155 `absorbMeteredGap`.
  - `internal-api.ts` ~873–880 (the commit), ~1204 / ~1276 / ~1293 / ~1641 (settle / absorb).
  - `delivery.ts` ~95–135 and `cancel.ts` ~97.
  - `apps/api/src/timeline-routes.ts` ~545–600.
- Presets:
  - `packages/run-sheet/src/profiles.ts` ~70–120 (`phaseFlagsForToggles`, `activePhaseCount`, REVIEW `rigorDefaults`)
  - `apps/web/src/server.ts` ~3360–3410 (the run POST: the `toggleKeys` sentinel, `normalizeTier("")`)
  - the api's run creation, which freezes toggles into opt-out flags
  - `packages/engine/src/roster.ts` (tier routing)
- Estimator / caps:
  - `packages/protocols/src/estimator.ts` ~480–530 (`INSTRUMENTED_OVERRIDES`, `recordInstrumentedFold`)
  - `packages/ledger/src/estimator-refit.ts` — a global singleton, median est/actual, ±0.05/0.1 steps (re-confirm)
  - `circuit-breaker.ts`
  - `packages/db/migrations/0036_billing_full.sql` ~160–168 (`estimator_fits`, `estimator_config`)
  - `packages/ledger/src/reconcile.ts` (`usage.reconcile`)

## In scope — deliverables
1. **Ground truth** (read-only, $0; PR-E5, BL-13).
   - **For `01M3SK62…`**, reconcile:
     - Σ proxy / `sdk_estimate` / `sdk_stream` rows by attempt, agent and phase
     - `credit_ledger` debit / refund / adjustment rows by phase and attempt, including `debit:<run>:settle:<n>`
     - `runs.spent_credits` (632)
     - the report's phase debits (57+55+97+49+14+69+99 = 440)
     - the "Editor — 1,625" seat figure
   - **Repeat** for STB.3's legs and `01M36663…`.
   - **Name every divergence path.** Examples:
     - attempt-scoped settle plus `absorbMeteredGap` of other attempts
     - cancel as release-only
     - the failure refund default
     - a multi-source report sum
   - **Tests and write-up.** Each path gets a test that reproduces it. The numbers go in `docs/build/runs/ECON.1.md`.
   - **If completed runs already debit the metered figure:**
     - append a dated correction note to ADR-014's premise (never rewrite it)
     - raise it in LEDGER OPEN FINDINGS for the operator
     - hand the report's seat-sum defect to **RPT.1**
2. **`debitMode`** (REQ-SPEC-32(a); REQ-SPEC-24).
   - `committed` is today's behaviour, byte-for-byte.
   - `metered`: a run's committed debits equal its proxy-metered burn at the published rate, clamped at the cap.
     The only absorbed kinds are the above-cap overrun, RES.2's platform-fault class and the trial entitlement.
   - The flag defaults to `committed`.
   - **Owned decision → write an ADR:** which burn is chargeable under `metered`. REQ-SPEC-32(a)'s three absorbed
     kinds must be reconciled with:
     - §14.4 "User stops mid-run — debit completed phases" and "Provider outage — idempotent debits"
     - REQ-SPEC-24(8) (in-flight tokens on a stop are COGS)
     - D-PRB.16-5's 2026-09-22 ruling (append a dated "superseded by ADR-014 under `debitMode=metered`" note)

     If the reconciliation relaxes a spec row, it is operator-paused.
3. **§6.5 preset conformance** (PR-E6; REQ-BILL-6).
   - **The defect.** `profiles.ts` says Quick = discourse off and second read off, yet the Quick/Base run executed
     both. Find the path: the sheet's rendered `toggle.*` values vs the `toggleKeys` sentinel vs the api's frozen
     flags.
   - **Server-side derivation.** The server derives toggles from the rigor defaults unless the user changed a toggle
     under Advanced.
   - **Quick's limits.** "Fact-check limited to the 5 most load-bearing claims" and findings cap 40 (§6.5; ledger C22)
     are implemented nowhere; re-confirm. Land them through the manifest's sanctioned inputs. If the vendored skill
     has none, do not edit skill text (invariant 8): write an ADR and a `D-ECON.1-n` row.
   - **Tier routing.** Standard's "Base for research phases" and Full board's routing are asserted against
     `roster.ts`.
   - **Pricing consistency.** The estimator prices exactly the frozen phase set (`activePhaseCount`), and RES.1's
     floor takes the claim cap as input.
4. **Instrumented cost cards** (REQ-SPEC-32(a)/(c) inputs; §16.3 #1).
   - Cells are workflow × rigor × tier × size band. Each card carries: n, p50 / p90 metered list $, provenance
     (`measured` / `harvested` / `derived`), and the rate-table version.
   - **Harvest first ($0).** A prod run is admissible only if:
     - it has proxy rows only
     - it is research-bearing and ran post-RES.1, or it is not research-bearing
     - it ran on the current presets
     - it is not an *Unverified* delivery (`isSuccessfulDelivery`, RES.2)
   - **Measure** the rest per the spend plan.
   - **Owned decision → ADR:** size bands, admissibility, and whether a `derived` cell may drive a cap or a surface
     (e.g. Balanced re-rated from a Base measurement's token mix).
5. **The durable calibration store** (BL-14; ADR-005's follow-up; REQ-BILL-7).
   - An additive migration; the schema is owned. It replaces the process-local `INSTRUMENTED_OVERRIDES` as the source
     of `estimatorSpec` for both api and worker (load plus refresh seam).
   - The refit runs **per bucket** with REQ-BILL-7's rule: 1.5× until the trailing-30-day p95 actual/estimate < 1.3,
     then 1.35, never below 1.25. The circuit breaker's 2× override is preserved (REQ-SPEC-24(5)).
   - Grants follow SEC.1: the user-serving role reads, the system pool writes.
   - **Publish one read API** (e.g. `costCard(...)`, `capFor(...)`) for EST.1, RPT.1, ACT.1 and ECON.2.
6. **Calibrated caps in the same deploy as the flag** (ADR-014's sequencing guard).
   - A calibration report per bucket: n, cap-reach %, and whether the printed range contains the actual.
   - Replaying every admissible run under `metered` at the new caps must reach cap for ≤ 10% of runs in-sample.
     Meeting REQ-SPEC-32(c) on the trailing window is ECON.2's.
7. **Notice and flip runbook** (ADR-014 §1).
   - A notice template (email via PRB.09's mailer plus an in-app notice; D.2 vocabulary; no "you will be billed").
   - The recipient query: active paid subscriptions and top-up holders.
   - An operator-invoked send CLI.
   - The flip / rollback procedure in `docs/ops/`.
   - Nothing is sent and nothing is flipped.
8. **F5 settlement live proof** (BL-10). Four-number agreement — `credit_ledger` debits, Σ proxy,
   `runs.spent_credits`, hold release / adjustment — on one completed instrumented run and one user-cancelled
   mid-phase run.
9. **The reconcile leg** (REQ-BILL-13, REQ-ARCH-35; D-PRB.08-1(b)).
   - If HUMAN-H7's admin key is provided: run `usage.reconcile` against the Anthropic Usage & Cost report for the
     instrumented runs (drift ≤ 2%).
   - Otherwise: a `D-ECON.1-n` row, reason "H7 pending: admin key".

**Spend plan (Stage B ≤ $30 metered list $; stop adding legs at $27 cumulative).**

| leg | cell | budget (list $) |
|---|---|---|
| H | harvest all admissible prod runs | $0 |
| I1 | Review · Standard/Base · ~300 words (the planted-error excerpt) | ≤ $4 |
| I2, I2′ | Review · Standard/Base · ~1,000 words (the planted-error essay) ×2 — the trial cell needs variance | ≤ $8 each |
| I3 | Review · Standard/Base · ~2,500 words | ≤ $10 |
| I4 | Review · Quick/Base · ~1,000 words (after the preset fix) | ≤ $5 |
| F5 | a user cancel mid-phase | ≤ $2 |

The measured figures are unknown until run. The 632 cr (≈ $4.51 list) of the no-research Quick run is the only
anchor. Balanced and Frontier cells stay `derived` unless budget remains. Cells not measured become `derived` cells
or `D-ECON.1-n` rows.

## Out of scope
- Surfacing estimates, tier control, the estimate route's 400 → **EST.1**. The run report's seat sum, live meter and spent = Σ debits → **RPT.1**.
- The trial word cap and entitlement → **ACT.1** (it consumes these cost cards). Meeting REQ-SPEC-32(c) on the trailing window, COGS levers, the REQ-SPEC-8 restore → **ECON.2**.
- The reconcile write ordering, `held>=0` parity, the refund window → **DEF.4**. The research floor and preflight → **RES.1**. The platform-fault class → **RES.2**.

## Acceptance criteria
- [ ] **Ground truth.** It is recorded for `01M3SK62…`, STB.3's legs and `01M36663…`. Every divergence path is named and has a test that reproduces it. If the premise is wrong, ADR-014 carries a dated correction note and LEDGER OPEN FINDINGS has the finding. *(deterministic + agentic)*
- [ ] **`debitMode=committed`.** It is byte-for-byte today's behaviour (regression suite). *(deterministic)*
- [ ] **`debitMode=metered`.** Committed debits = Σ proxy at the published rate, clamped at the cap, on these fixtures: completed, multi-attempt, user-stop, failure, platform-fault, trial, above-cap. Each is classified per the ADR. *(deterministic)*
- [ ] **REQ-BILL-3 fault injection.** 3× inflation still yields debits = cap, an adjustment row, a 402 and a delivered dossier, under both modes. Σ debits ≤ cap always. *(deterministic)*
- [ ] **Quick presets (frozen inputs).** A Quick run's frozen inputs opt out discourse and the second read. A stale form claiming them without an Advanced change is ignored. *(deterministic)*
- [ ] **Quick claim cap.** The 5-claim fact-check cap is enforced, or an ADR plus a `D-ECON.1-n` row explains why not. The estimator prices the same phase set. *(deterministic)*
- [ ] **Quick presets (journey).** The JOURNEY.1 walk shows the Quick sheet with discourse and second read off, and the run card lists them skipped. *(agentic)*
- [ ] **Durable store.** A fold survives a process restart, and api and worker read the same bucket. The per-bucket refit hits REQ-BILL-7's thresholds in tests (p95 1.29 / 1.31, the 1.25 floor, the 2× breaker). The migration passes the additive lint. *(deterministic)*
- [ ] **Stage B deploy.** Admissible runs are harvested. The instrumented legs are recorded with metered list $ per leg, total ≤ $30. The calibrated caps are deployed with `debitMode=committed`. Deployed provenance = the chain-tip SHA. *(agentic)*
- [ ] **Stage B calibration report.** Present per bucket. In-sample cap reach ≤ 10% under `metered` at the new caps. *(agentic)*
- [ ] **F5 settlement.** The four numbers agree live for the completed run and the cancelled run. *(agentic)*
- [ ] **Flip readiness.** The notice template, recipient query, send CLI and flip/rollback runbook exist. **No notice sent, no flip made.** A LEDGER GATE DECISIONS row asks the operator for the notice timing and the flip. *(agentic)*
- [ ] **Reconcile leg.** Green, or a `D-ECON.1-n` row with reason "H7 pending: admin key". *(agentic)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-SPEC-32(a) (primary), REQ-BILL-7 (primary), REQ-SPEC-24, REQ-ARCH-35, REQ-SPEC-11, REQ-BILL-3, REQ-BILL-6,
REQ-BILL-13.

## Cross-cutting invariants
- `00_MANIFEST.md` #7: money.
  - The proxy is the meter of record, and only `source='proxy'` rows feed cards and debits.
  - Σ debits ≤ cap.
  - Never a silent bill: the flip needs notice first.
- #8: presets change only through sanctioned inputs; no skill-text edits.
- #1 / REQ-BILL-18: the notice and any copy use credits / cap / top-up / plan.
- #10: the calibration store and alerts hold aggregates and ids only.
- #12 / REQ-SPEC-29: the preset change is walked.
- #13 / REQ-SPEC-30:
  - Harvest and the recipient query are allowlisted system-pool scans with explicit predicates.
  - User routes read the store through the user-serving role.
- #14 / REQ-SPEC-32: every figure downstream reads this store.

## Notes
- **Owned decisions → write an ADR each:**
  1. burn classification under `metered` (the §14.4 / REQ-SPEC-24(8) reconciliation)
  2. the calibration-store schema, size bands, admissibility and derived cells
  3. the Quick claim-cap mechanism
- **Shared decisions:**
  - *Owned here:* debit mode, cost cards, the calibration store and cap derivation. EST.1, RPT.1, ACT.1 and ECON.2
    consume them.
  - *Consumed:*
    - RES.1's floor and preflight: cost cards are measured with research working
    - RES.2's `isSuccessfulDelivery` and the platform-fault class
    - BILL.3's purchase path: the notice points users at a working top-up
    - SEC.1's roles
    - JOURNEY.1's harness and fixtures
- **Sizing risk.** This is the round's heaviest single-context ticket. If ground truth shows no completed-run gap,
  deliverable 2 narrows to the non-completed-run classification — but the flag, the calibrated caps and the
  sequencing guard still ship. If the context or budget cannot hold every leg, stop at a clean boundary and record
  the remainder as `D-ECON.1-n` rows. Never silently drop a deliverable.
- **Anchors to re-confirm at build time:**
  - every line number
  - the refit's current rule
  - whether any claim or findings cap exists in the manifest inputs
  - the list-$ rating (credits = list × 1.4, `apps/egress-proxy/src/rates.ts`)
- **DEFERRALS rule:** H7-gated legs, the paused flip, and unmeasured cells become `D-ECON.1-n` rows with a
  compensating control. Report "gate pending", never a fabricated pass.
