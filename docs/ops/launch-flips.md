# Launch flips — the `GD-LAUNCH-MONEY.R6` order (R6MNY.1)

> **Owned shared decision; consumed by R6LCH.1.** This file *prepares* the four ruled launch
> flips — nothing here has been executed. Every flip is an auditable one-line stage-fact diff
> + redeploy, in this exact order, gated on GATE-LAUNCH and the operator's go. `mergePolicy:
> OPERATOR`; the operator merges and deploys each step.
>
> Ruling (`LEDGER` GATE DECISIONS): metered debit + the paid-account notice first;
> `purchaseMode → open`; `REFUND_WINDOW_MODE → open`; trial `audience → everyone` behind the
> $50/day kill switch and the 1-concurrent cap (`GD-TRIAL-CEIL.R6`).

## Step 0 — the paid-account notice (precondition to flip 1, not a flip)

- **Act:** `node scripts/live/send-metered-notice.mjs --send` with the chosen `EFFECTIVE_DATE`
  (system-role DSN over the IAP tunnel; `GD-PREAUTH-ACTS.R6` pre-authorizes it for R6DEP.1
  after the dry-run matches scope exactly). R6MNY.1 ran the **dry-run** only — see the run
  ledger for the recipient count.
- **Verify:** `notification_deliveries` carries one `dedup_key='metered-debit-notice:v1'` row
  per recipient (re-run is exactly-once); the committed report records the count.
- **Critical path:** the flip must not precede the effective date — ≥ 30 days after the send
  (REQ-BILL-2 / ADR-014 §1; `docs/ops/debit-mode-flip.md` step 0).

## Flip 1 — metered debit (`DEBIT_MODE`)

- **Diff (one line):** `infra/config/stages.ts`, prod —
  `debitMode: "committed"` → `debitMode: "metered"`
- **Preconditions** (`docs/ops/debit-mode-flip.md` §Preconditions, all four):
  migration `0049` applied + harvest running; `cap_calibration_reports` has `adopted=true`
  rows for the paid-surface cells with in-sample `cap_reach_pct ≤ 10%`; the notice sent +
  effective date reached; `DEBIT_MODE=committed` live on api + worker.
  **R6MNY.1 read (2026-10-21, system-role DSN, read-only): preconditions 1–2 are UNMET** —
  `cap_calibration_reports` = 0 rows (admissible observations = 0 of 199 harvested),
  `cap_reach_pct` therefore vacuous, `capFor` null on all five paid surfaces; the funded wave
  (REQ-DISC-1) is what supplies admissible rows. This stays a **finding for an operator
  ruling — never flipped past**; evidence in
  `docs/build/reports/2026-10-21_R6MNY.1/`.
  **256_R6FLIP.1 evaluation (2026-11-11, under the operator's same-day "ignore dates"
  ruling lifting the `GD-THRESH13.R6` ≥2026-12-01 park): evaluated early, NOT executed —
  preconditions 1–2 still UNMET** on the freshest datum available (the same-day R6WATCH.1
  on-time read, window-age ≈14.58 d): `cap_calibration_reports` = 4 rows, all
  `adopted=false` "insufficient sample" (max n=2, cohort-excluded; organic admissible
  `cost_observations` n=0; `estimator_cells` 0), so `cap_reach_pct` stays vacuous and
  `capFor` null on the paid surfaces. Precondition 3 is also unarrived on its own terms:
  the 2026-10-22 notice named `EFFECTIVE_DATE=2026-12-01` to the two paid accounts and
  the runbook forbids flipping before the noticed date — the ruling lifted the *park's*
  date, not the customers' notice. **Re-parked with evidence**; prod stays
  `debitMode: "committed"`. Re-evaluate when a `cap_calibration_reports` row reaches
  `adopted=true` (D-ECON.1-3's watch, `slo.review.weekly` trigger) or at the noticed
  effective date, whichever the operator rules on. Run record:
  `docs/build/runs/256_R6FLIP.1.md`.
- **Verify:** inspect `rhema-prod-api` and `rhema-prod-worker` separately using the filtered
  `DEBIT_MODE` read in [debit-mode-flip.md](debit-mode-flip.md); each shows
  `DEBIT_MODE=metered`; a completed run's `credit_ledger` settles to the proxy meter
  (`debit:<run>:settle` + `metered_over_debit` refunds where the floor overshot) — the
  runbook's Step-3 list.
- **Rollback:** revert the line + redeploy the same images — pure config, safe both
  directions (the residue sweep reconciles stragglers under whichever mode is live).

## Flip 2 — purchase open (`PURCHASE_MODE`)

- **Diff (one line):** `infra/config/stages.ts`, prod —
  `purchaseMode: "closed"` → `purchaseMode: "open"`  (dev/preview stay `closed`)
- **Verify:** a non-test workspace's `POST` on the purchase path mints a real Checkout
  session (was `purchase_closed`); the Billing surface shows the buy affordance.
- **Rollback:** revert the line + redeploy — `closed` refuses new session mints; existing
  subscriptions/webhooks are unaffected.

## Flip 3 — refund window open (`REFUND_WINDOW_MODE`)

- **Diff (one line):** `infra/config/stages.ts`, prod —
  `refundWindowMode: "test_tenants"` → `refundWindowMode: "open"`
- **Verify:** `POST /runs/:id/refund` on a real workspace's eligible run (completed /
  completed_partial / cancelled, within `REFUND_WINDOW_DAYS` of `runs.ended_at`) is admitted;
  the report DTO renders the refund affordance; the request row records `auto_allowance`.
- **Rollback:** revert the line + redeploy — `test_tenants` re-closes the window for real
  workspaces; already-recorded `user_refund_requests` rows keep their state.

## Flip 4 — trial audience → everyone (`pricing.json`)

- **Diff (one line):** `packages/contracts/src/domain/pricing.json` —
  `trial.audience: "test_tenants"` → `trial.audience: "everyone"`
- **Verify:** an unflagged workspace's trial claim renders (`trial.firstReviewIncluded`
  resolves on via `claimsForAudience`) and its entitlement claim creates the queued run; a
  flagged test tenant still unlocks. The `$50/day` kill switch and 1-concurrent cap under
  `everyone` are proven by R6MNY.1's HTTP tests (run-routes.test.ts, `REQ-LCH-5d`) — re-read
  them at the flip.
- **Rollback:** revert the line + redeploy — the audience snaps back to `test_tenants`;
  already-active trials run their window out (the state machine is unaffected).
- **Watch:** `trial_spend_daily.paused_at` / the reconciled counter — the kill switch is the
  safety instrument, never bypassed; GD-ABUSE.R6b's revisit triggers on fraud signals
  (>10 fingerprint-reuse or disposable-domain denials in a week, or confirmed farming),
  not ordinary budget trips.

## Ordering guarantee

Each step is independent config; the order is the ruling's — **metered before purchases,
refund window before the audience opens.** A failure or hesitation at any step pauses the
list for the operator; nothing here auto-advances.
