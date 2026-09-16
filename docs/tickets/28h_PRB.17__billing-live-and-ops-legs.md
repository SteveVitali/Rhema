# PRB.17 — Billing live + the ops legs: the real-money channel, provider reconcile, and PRB.14's live halves

- **Sequence:** inserted — runs **after `28g_PRB.16`, before `29_P1.01`**. Sorts as `28h` — the
  last row of the prod-launch round (§ Plan extensions, **ADR-008**).
- **Phase:** LV — prod launch (the money + ops verification).
- **base_branch:** current checkout (stacked PR chain)
- **Depends on:** PRB.16 (prod golden-path green — the money legs run on a verified system),
  PRB.15 (prod up), PRB.14 (the resilience/cost code whose live halves land here), PRB.08 (the
  Payment-Link/webhook/reconcile machinery), PRB.12 (the `beta-report` leg), **HUMAN-H6** (the
  Stripe live-mode answer + the secrets — hard blockers).
- **Run:** `implement-spec spec=docs/tickets/28h_PRB.17__billing-live-and-ops-legs.md`
- **Gate status:** the **Stripe live-mode activation answer (HUMAN-H6)** decides which purchase leg
  runs — live-mode if activated, test-mode + a new DEFERRALS row if not. Never fabricate.
- **Live stage:** **operator-gated** — Stage B on prod: real money (or test-mode), real provider
  report, real ops webhook. A small Stage A writes any thin driver needed (no spend).

> **This is the real-money ticket.** The autonomy contract is modified as in P0.15c–i/PRB.15/16:
> STOP for explicit operator authorization at each **[OPERATOR GATE]** — a live Stripe purchase is
> **real money**, the Usage & Cost pull reads the real provider account, the alert POSTs to the real
> ops webhook — and surface, never guess past, a missing prerequisite.

## Operator prerequisites (hard blockers if absent — HUMAN-H6)
- **The Stripe live-mode answer.** If the account is live-activated: the live-mode Payment Link +
  webhook endpoint exist and the live keys are in Secret Manager. If NOT: the purchase leg runs in
  **test mode** and the live-mode leg is appended as a DEFERRALS row (`D-PRB.17-*`) — the
  alternative is never to fake a live charge.
- **Secrets:** Stripe secret + `whsec_…` (prod endpoint), `ANTHROPIC_ADMIN_KEY_SECRET` (the Usage &
  Cost report), `OPS_ALERT_WEBHOOK_URL`, `RHEMA_OPERATOR_ID` for the admin CLI.
- **A stated budget** — the live purchase itself + the runs the ops legs drive.

## Goal
Prove the **one real-money channel works on prod** (Stripe Payment Links — REQ-BETA-15) and that
the platform's books balance against the provider's: a real purchase lands as a `grant(topup)`, the
nightly `usage.reconcile` folds the real Anthropic Usage & Cost report and refunds only in the
user's favour, the >2% drift alert reaches ops, the admin CLI works against the deployed DB — plus
the **live halves of PRB.14's resilience/cost rows** (the sweeps, the refund→resume re-debit, the
breaker cap, the parked sweep, the provisional ±2% figure) and the live `beta-report` leg.

## Load
- **`docs/tickets/DEFERRALS.md`** — **D-PRB.08-1** (in full: real purchase → webhook → grant; the
  Usage & Cost pull; the >2% alert; the admin CLI; the exhaustion-panel click-through),
  **D-PRB.12-1** (live `beta-report` over prod analytics rows), and the **live halves** of
  **D-P0.08-4 / D-P0.10-2** (sweep recovery on prod), **D-P0.11-1** (refund→resume re-debit;
  breaker-trip; parked sweep — and **D-P0.15d-2** `refundPhases` if a real reduced-commit path now
  exists), **D-P0.08-2 / D-P0.15-2** (the live ±2% proxy-vs-SDK figure + the revise/profile_voice
  fold — **D-P0.15k-1**'s live leg).
- `@rhema/ledger` `stripe.ts`/`reconcile.ts`/`chargeback.ts`/`admin.ts` + `apps/api`
  `billing-routes.ts`/`admin-cli.ts` + `apps/worker` `billing-jobs.ts` +
  `AnthropicAdminReportSource` (the seams; all deterministic-tested — this is the live binding +
  exercise).
- Spec §12.7 (both cross-checks), §14.5–14.6, REQ-BETA-14/15, REQ-BILL-13, REQ-ARCH-35.

## In scope — Stage A (offline, PR-able; thin drivers only, no spend)
1. Any driver/catcher the legs need (a webhook-catcher for the alert leg, a prod DB-read helper for
   the grant/ledger asserts) — patterned on the PRB.08 deterministic tests. **No prod calls, no
   Stripe calls.**

## In scope — Stage B ([OPERATOR GATE]d; each leg = do it on prod → assert from rows/logs)
2. **[OPERATOR GATE — REAL MONEY] The Stripe Payment-Link purchase (D-PRB.08-1a/e).** **Live mode
   if H6's activation check passed, else test mode** (and append the live-mode DEFERRALS row): buy
   the Payment Link → the deployed webhook (Secret-Manager `whsec_…`, HMAC t,v1 verify) →
   `stripe_events` insert → `grant(topup, +12mo, stripe_ref=payment_intent)`; replay the event id →
   no second grant; the exhaustion panel's Payment-Link click-through on prod emits the telemetry.
3. **The Anthropic Usage & Cost pull + reconcile (D-PRB.08-1b).** `usage.reconcile` pulls the real
   report via the Secret-Manager admin key, joins on `provider_request_id`, writes
   `provider_report` rows, adjusts **only in the user's favour**, and folds measured rows into the
   estimator.
4. **The >2% drift alert (D-PRB.08-1c).** Force a >2% drift (or a balance divergence) → the alert
   POSTs to the real `OPS_ALERT_WEBHOOK_URL`.
5. **The admin CLI on prod (D-PRB.08-1d).** `rhema admin` (house-grant/void/suspend/reinstate/wtp)
   against the deployed DB under `RHEMA_OPERATOR_ID` — audited `admin_actions` rows.
6. **PRB.14's live halves.** (a) Stranded-run sweep recovery on prod — a stuck `provisioning` /
   `queued`-with-no-job run is swept + the hold released (D-P0.08-4, D-P0.10-2). (b) A real
   refund→resume re-debit — refunded phases re-debit first under the per-episode idempotency key
   (D-P0.11-1a; `refundPhases` too if D-P0.15d-2's path exists). (c) A breaker-trip fixture — cross
   the 24 h absorbed-adjustment threshold → new runs get the cap multiplier (D-P0.11-1b). (d) The
   parked sweep — a run past `parked_until` is cancelled with the hold released (D-P0.11-1c).
   (e) The provisional **±2%** proxy-vs-SDK figure on a live `sdk_estimate` row (D-P0.08-2,
   D-P0.15-2) + the **revise/profile_voice fold** → `estimatorsAreProvisional()` false over all
   four (D-P0.15k-1's live leg).
7. **The live `beta-report` (D-PRB.12-1).** `rhema admin beta-report` against prod analytics rows —
   all nine REQ-BETA-18 gate metrics beside their registered thresholds; `POST /analytics/events`
   records a whitelisted event / 403s a server-owned one; the opt-out toggle removes the user's
   events from the report.

## Out of scope
- The golden-path surface legs — `28g_PRB.16`. The deploy — `28f_PRB.15`.
- Plan ladder / trial entitlement / subscriptions — P1.16. Refund UX beyond the ledger —
  PRB.08 is done; P1.16 for the rest.
- If Stripe live mode is NOT activated: the live-mode purchase leg is a **new DEFERRALS row**
  (`D-PRB.17-1`), not a fabricated pass.
- Benchmark/corpus rows (D-P0.13-*/D-P0.14-* — H2/G2), the nightly golden run (D-P0.15-4 — ops).

## Acceptance criteria
- [ ] The purchase leg ran — **live-mode if activated, else test-mode + the appended DEFERRALS
      row** — `stripe_events` + `credit_ledger grant(topup)` rows on prod; replay = no second grant
      (D-PRB.08-1a/e). *(live — real or test money)*
- [ ] `usage.reconcile` pulled the real Usage & Cost report; `provider_report` rows written;
      user-favourable adjustments only (D-PRB.08-1b). *(live)*
- [ ] A forced >2% drift POSTed to the real `OPS_ALERT_WEBHOOK_URL` (D-PRB.08-1c). *(live)*
- [ ] `rhema admin` ops ran against the deployed DB with audited `admin_actions` rows
      (D-PRB.08-1d). *(live)*
- [ ] The PRB.14 live halves verified on prod: swept stranded run + hold released; refund→resume
      re-debit; breaker-trip cap; parked-sweep cancel; the ±2% figure; the revise/profile_voice
      fold (D-P0.08-4/-10-2/-11-1/-08-2/-15-2/-15k-1 live legs). *(live)*
- [ ] `rhema admin beta-report` rendered the nine gate metrics vs thresholds from prod rows; the
      intake/opt-out legs held (D-PRB.12-1). *(live)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement
      ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its
      compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md`
      row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-BETA-15 (the real-money channel), REQ-BETA-14 (billing core exercised end-to-end),
REQ-BILL-13 (reconciliation), REQ-ARCH-35 (the >2% alert / provider report), REQ-SPEC-24
(holds/debits/refunds under real money), REQ-BETA-18's metrics read out live (the report —
the gate decision itself stays G3, parked), REQ-PROD-16 (the weekly report).

## Cross-cutting invariants — re-check on the LIVE system
- **Real money is real** — a live-mode purchase charges the operator's card; the test-mode fallback
  is the honest alternative, never a fabricated live row.
- Money: the proxy is the meter of record; Σ debits ≤ cap; refunds are user-favourable only; no
  silent billing (REQ-SPEC-11/24; REQ-BILL-3).
- Secrets never in a ledger/PR — the `whsec_…`/keys are Secret-Manager names.
- See 00_MANIFEST.md § Cross-cutting invariants.

## Notes
This is the last row of the round — after it, `nextTicket` is whatever the ledger names (G3 stays
parked pending real-world data; the P1 skeletons stay skeletons until G3 reads). If the Stripe
live-mode answer is "not yet", the test-mode leg still proves the wiring and `D-PRB.17-1` carries
the live-mode remainder — the round is not blocked on it.
