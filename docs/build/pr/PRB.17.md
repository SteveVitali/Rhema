# PRB.17 — Billing live + ops legs: Stripe webhook chain, ops alert, admin CLI, resilience legs, estimator folds, beta report

**Spec:** `docs/tickets/28h_PRB.17__billing-live-and-ops-legs.md` ·
**Base:** `stevevitali/prb-16b-golden-path-continuation` ·
**Stacked PR — do not merge (mergePolicy=OPERATOR).**

## What this PR is

The **real-money ticket** executed live on prod (`rhema-507501`): the billing channel and the
PRB.14 resilience/cost live halves proven against the deployed system, three live-surfaced
defects fixed and redeployed mid-run, and the beta report generated with all nine gate metrics.
Full evidence ledger: `docs/build/runs/PRB.17.md`. Spend ≈ **$10.89** proxy-list vs the $25
envelope.

## Live evidence (all against prod)

- **Stripe channel (test mode, honest degradation).** No Stripe API credential exists anywhere
  in the project (live mode not activated), so a Stripe-originated purchase was impossible.
  Instead the deployed webhook chain was exercised with a **constructed event signed by the
  configured `whsec`**: signature verify → `stripe_events` insert → queue →
  `checkout.session.completed` → top-up grant `bucket:topup`, `source:stripe`, `+12mo` expiry —
  ×2 (`pi_prb17_test_1` 2,500cr; `pi_prb17_001` 500cr) — plus **replay idempotency** (same
  event re-POSTed → 200, one event row, one grant) and exhaustion-panel telemetry
  (`open_payment_link`, `topup`, 302 to the configured link). The Stripe-originated purchase +
  real Payment Link is deferred as **D-PRB.17-1**. No live purchase fabricated.
- **Ops alert.** POSTed through the deployed `OPS_ALERT_WEBHOOK_URL` to the Cloud Run catcher;
  receipt verified in Cloud Logging (16:15:39Z).
- **Provider reconciliation.** `rhema-prod-anthropic-admin-key` is a placeholder — the worker
  logs the placeholder and still runs the balance assertion (18:00:10Z). Real Usage & Cost pull
  stays inside D-PRB.08-1(b) → **PARTIAL**. The ±2% proxy-vs-SDK cross-check ran and returned an
  honest **out-of-tolerance 18.23%** (SDK `costUsd` is list-priced without the platform
  rate-table margin — the authoritative-figure ruling joins D-PRB.16-5). Flagged + alerted, not
  hidden.
- **Admin CLI ×5** (`house-grant`, `house-void`, `suspend`, `reinstate`, `wtp`) against prod
  with `RHEMA_OPERATOR_ID=stevevitali`; `admin_actions` audit rows verified across two sessions
  (fixture account `01PRB17ADMINFIXTURE00000` net-zero, left as the tagged audit trail).
- **PRB.14 live halves.** Stranded `provisioning` sweep (`provisioning_failed` in worker logs,
  hold+lock+credential settle); stranded `queued` re-enqueue (`queued_reenqueued`); breaker-trip
  cap multiplier (tripped 23.8% → a real new run's cap 172 = 86×2); parked-run sweep cancelled a
  real `waiting_gate` run with `hold 172 → debit 68 → release 104`; refund→resume→re-debit
  ledger verbatim on `01M2TPMAW3Z6…`; analytics whitelist (200 recorded / 403 client-mint /
  422 catalogue) + opt-out zero-rows round-trip.
- **Estimator folds — all four.** `review` 2.34×, `revise` 48.2×, `profile_voice` 11.9×,
  `fact_check` 7.12× (completed run `01M2TZ8E1ARR8SMGKD4GKT162K`, inventory 60cr + verification
  83cr under live hook enforcement) — `estimatorsAreProvisional()` = **false**
  (`instrumented@2026-09-18`), one-process fold.
- **Beta report — all nine metrics rendered** with threshold comparisons. The stop clause
  **honestly tripped**: round-2 0.0% and cancel 28.6% both fail (repeat-cycle 0% also fails);
  exit code 1 by design. **G3 stays parked.**

## Live-surfaced fixes (commits on this branch)

- **F28 (`c5bc2d6`)** — the harness's `PreToolUse` envelope (`tool_name`/`tool_input`) was never
  translated, so §12.6 enforcement was vacuous on every pod: envelope → `ToolUse`, hook socket
  0666, fail-closed on malformed envelopes, buffered audit shipped to
  `/internal/runs/:id/audit` (run-task `a6e63246`).
- **F29 (`30dd5f7`)** — prod `agent_types` was **unseeded** (bring-up seeded protocols only) →
  every seat compiled `tools:[]` → post-F28 enforcement denied every matched tool, runs capped
  with zero committed steps. `runProdMigrateSeed` now runs `agentTypesSeed`; applied live (5
  rows) + flushed pending `0026_system_bypassrls`. Post-seed telemetry: path-scoped allows AND
  denies (`/app/skills/**` read deny, root-recursive Glob deny).
- **F30 (`30dd5f7`)** — run-create without `modelProfile` threw `TypeError` → 500
  (live-observed 19:07:55Z). Route defaults the profile from `modelTier`;
  `validateModelProfile` tolerates `overrides` absent (`?? []`) + regression test. Residual
  recorded: other NOT-NULL body fields still surface `23502 → 500` rather than 400 (later
  hygiene ticket).
- Also: `61f5a00` (harvestStep writes the `sdk_estimate` cross-check row, D-P0.15-2),
  `181d1ef` (ops-alert required on prod, payment-link config, placeholder guards),
  `792e7de` (`stripePaymentLinkUrl` placeholder pin, applied via pulumi update 51).

## Honestly open

- **D-PRB.17-1 (new)** — Stripe-originated purchase + a real Payment Link; needs a live/test
  Stripe API credential that does not exist in the project.
- **D-P0.15d-2** — `refundPhases` still has no live reduced-commit/stop-ack call site.
- **D-PRB.16-4** — `gate_rearmed` proven; `gate.expiry` firing unobserved.
- **D-PRB.08-1(b)** — real Usage & Cost report (placeholder admin key).
- **G3** — parked; the beta report's honest read keeps it parked (stop clause tripped).

DEFERRALS flips with dated evidence: D-P0.15h-2, D-PRB.16-3, D-P0.08-4, D-P0.10-2,
D-P0.15k-1, D-P0.11-1, D-PRB.12-1 → **DONE live**; D-P0.15-2, D-P0.08-2, D-PRB.08-1,
D-PRB.16-4 → **PARTIAL**.

## Verify

`pnpm turbo build lint typecheck` **111/111 green** · vitest: hooks+capabilities **98 pass**,
apps/api **21 files green**, run-task+integration scope **22 files green** (the kernel-level
`privsep.docker.test.ts` skips under `CI=1`; the local Docker daemon was unresponsive on this
machine — it runs in the `integration` CI job per D-P0.06-2) · `check-build-memory.sh .`
**0 violations** · live evidence in `docs/build/runs/PRB.17.md`.
