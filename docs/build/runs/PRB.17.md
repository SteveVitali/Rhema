# PRB.17 — billing live + ops legs (run ledger)

- **Ticket:** `docs/tickets/28h_PRB.17__billing-live-and-ops-legs.md` (seq 28h — last row of the prod-launch round)
- **Branch:** `stevevitali/prb-17-billing-live-ops-legs` (stacked on `stevevitali/prb-16b-golden-path-continuation`)
- **Budget:** $25 ops-leg inference (HUMAN-H6 gate answer 2026-09-18)
- **Gate answers discharged (LEDGER GATE DECISIONS 2026-09-18):** Stripe = **test mode** (live leg → D-PRB.17-1);
  `ANTHROPIC_ADMIN_KEY` not supplied → reconcile leg stays OPEN deferred; `OPS_ALERT_WEBHOOK_URL` →
  worker-deployed catcher; $25 budget authorized.
- **Prod DB access:** local tunnel `127.0.0.1:15433` → Cloud SQL via `rhema-prod-proxy-1w36` IAP ssh forward;
  scratch drivers in `integration/.scratch/` (untracked).

## Stage A / committed work (this diff)

| Commit | What |
|---|---|
| `4111213` (prior) | HUMAN-H6 gate answers recorded |
| `c5bc2d6` | **F28 — PreToolUse hook envelope translated.** The SDK's `HookCallback` input is the `PreToolUseHookInput` ENVELOPE (`{hook_event_name, tool_name, tool_input, …}`), not `ToolUse{tool,input}` — forwarded verbatim it gave the daemon `use.tool === undefined` → `evaluateToolUse` pass-through branch → every tool silently allowed, zero `access_log` rows on every prod pod (§12.6 vacuous). Fixed at `buildPreToolUseHook`; daemon fails CLOSED on malformed envelopes; harness wires the buffered audit writer → `POST /internal/runs/:id/audit` (run-token, fenced, append-only; flush at each phase close). run-task `a6e63246`. |
| `61f5a00` | `harvestStep` writes the `sdk_estimate` cross-check row (the SDK's own `costUsd`, platform-priced) — the figure `proxyVsSdkCrossCheck` diffs against proxy `list_cost_usd`. api `9e920860`. |
| `181d1ef` | worker admin-key placeholder guard (a seeded placeholder must not crash nightly `usage.reconcile`); `ops-alert-webhook-url` back in `PROD_REQUIRED_SECRETS` (gate answer: catcher is the prod sink); `STRIPE_PAYMENT_LINK_URL` deploy config → api env; pins api `9e920860` / worker `921c3bc6` / run-task `a6e63246`; integration scratch deps. |
| `792e7de` | `Pulumi.prod.yaml` pins `rhema:stripePaymentLinkUrl` (clearly-marked placeholder pending a real Payment Link — no Stripe key exists in the project; D-PRB.17-1). Applied live via `pulumi up` (update 51). |
| `30dd5f7` | **F29 — prod `agent_types` unseeded → post-F28 enforcement denied every matched tool.** `runProdMigrateSeed` (PRB.15 Stage B) seeded `protocols` but never `agentTypesSeed`; prod's `agent_types` was **0 rows** → every seat policy compiled `tools:[]` → once the envelope fix made enforcement real, Read/Write/Glob/Grep/WebFetch/WebSearch/Agent were ALL denied and no phase could commit (live run `01M2TXNF…` burned to `cap_reached` with 0 committed steps — the first run under real enforcement). Fixed: `live-prod-bringup.ts` now runs `agentTypesSeed` (idempotent); applied to prod — 5 seat rows landed (+ flushed the pending `0026_system_bypassrls` migration). Post-seed run `01M2TYV6…` committed inventory 78cr — the first real commit under live enforcement. **F30 — absent `modelProfile` 500.** `POST /projects/:id/runs` without `modelProfile` TypeError'd inside `validateModelProfile` → 500 (live-observed 19:07:55). Route now defaults `modelProfile` from `modelTier`; `validateModelProfile` tolerates an absent profile; regression test added. |

Verify: `vitest run apps/run-task packages/orchestrator/src/internal-api.test.ts infra/config/stages.test.ts` —
all green (25 internal-api incl. the sdk_estimate row, 5 hook-daemon incl. fail-closed, 8 agent-entry incl.
envelope→ToolUse wire shape, 3 hook-enforcement driving the REAL SDK envelope shape, 17 stages);
`turbo typecheck lint` on run-task/orchestrator/infra/worker — 22/22.

## Live evidence — prior worker's legs re-asserted from rows (2026-09-18)

- **`access_log` telemetry PROVEN** (closes D-PRB.16-3 + the D-P0.15h-2 live leg): run
  `01M2TRYC9TW42PA6CFQHGMBEPM` — **66 rows: 25 allow / 41 deny**, real denies incl. Bash `/dev/null`, `/`
  path-escapes and seat-namespace violations. The §12.6 boundary is now enforced + audited end-to-end on prod.
- **Refund→resume→re-debit PROVEN** on `01M2TPMAW3Z6RDZ2V3CS5E6FNQ` (`credit_ledger` verbatim):
  `hold:…#topup` **172** → `debit …:intake:1` **72** → `refund:…:1:<step>` **72** →
  `resume:…:2:<step>` re-debit **72** (per-episode idempotency key, reason `re-debit`) →
  `debit …:craft:2` **28** → `adjustment` **46** `source:system reason:absorbed` (the cap-clamped
  residual — user-favourable). D-P0.11-1a live half.
- **±2% cross-check — honest OUT-OF-TOLERANCE finding** (`proxyVsSdkCrossCheck` on `01M2TPMAW3Z6…`):
  proxy `list_cost_usd` **$1.278090** vs `sdk_estimate` **$1.045031** → **18.23% divergence**,
  `comparable:true, withinTolerance:false, flagged:true, alert:true`. The machinery ran for real and
  honestly reported the SDK's costUsd figure materially under-prices vs the rate-table/proxy figure
  (the SDK `costUsd` is list-priced without the platform rate table's margin) — recorded as a finding,
  not a pass. D-P0.08-2 / D-P0.15-2 ±2% leg: exercised live; tolerance NOT met.
- **Balance-divergence alert PROVEN** (D-PRB.08-1c): catcher `rhema-prod-ops-alert-catcher` (Cloud Run,
  `integration/.scratch/catcher/` — echo server, Cloud Logging receipt), its URL seeded into
  `rhema-prod-ops-alert-webhook-url` (version 1, 16:05). Cloud Logging receipt:
  `2026-09-18T16:15:39Z ops_alert_received {"kind":"balance_divergence","reportKey":"nightly-assertion",…}`
  for the planted `01PRB17DIVERGENCEFIXTURE0000` account — the real `usage.reconcile` balance assertion
  POSTed to the real `OPS_ALERT_WEBHOOK_URL`. Fixture cleaned (`divergence-down`, 0 rows remain).

## Live legs log (2026-09-18, UTC)

### Stripe purchase leg (D-PRB.08-1a/e) — test-mode, degraded honestly
- **No Stripe API key exists in the project** — `rhema-prod-stripe-secret` v1 is a 40-char
  `PLACEHOLDER_…` value and `rhema-dev-stripe-secret` has **zero versions**; `rhema-prod-stripe-webhook-secret`
  v1 is `whsec_PLACEH…`. The 2026-09-17 "copy 5 dev→prod" row copied placeholder values. No `sk_test_`/`sk_live_`
  is reachable anywhere (env, keychain, .env files, all 10 gcloud projects checked). Per the ticket's
  autonomy contract this is surfaced, not guessed past: the **Stripe-originated** half of the leg (mint a real
  test endpoint + a real Stripe-signed event) is impossible without a key → carried by **D-PRB.17-1** alongside
  the live-mode leg.
- What WAS proven — the **deployed webhook's real verify→insert→enqueue→process→grant chain**, driven with a
  constructed `checkout.session.completed` body signed by the *configured* `whsec` (the placeholder value IS the
  api's verification key; signing with it produces a genuinely-valid HMAC per `verifyStripeSignature`):
  - `POST /stripe/webhook` (signed via the real `signStripePayload`) → **200 `{received:true}`** →
    `stripe_events` row `evt_prb17_test_1` received 18:37:50 / **processed 18:37:51** (the worker's real
    `stripe.event` consumer ran `processStripeEvent`).
  - `credit_ledger` **grant(topup)**: 2,500 cr, `bucket=topup source=stripe reason=topup`,
    `stripe_ref=pi_prb17_test_1`, `expires_at=2027-09-18` (+12mo), `idempotency_key=stripe:checkout:cs_test_prb17_1`.
  - Telemetry rows: `topup.purchased` + `wtp.recorded{source:"purchase",amount:25}` at 18:37:51.
  - **Replay**: re-POST same event → 200 but **1 row / 1 grant** — the unique-id insert is the dedupe boundary.
  - (`GET /billing/balance` spendable 196,094 → 198,594 after the grant — consistent.)
  - Prior session ran the same chain: `evt_prb17_topup_001` 16:10 → grant 500cr `pi_prb17_001`.
- **Payment-Link click-through (e):** `rhema:stripePaymentLinkUrl` set to a clearly-marked placeholder
  (`https://buy.stripe.com/test_placeholder_pending_real_link` — no real Payment Link can be minted without a
  Stripe key; documented, reversible) → pulumi up (update 51) → `GET /billing/balance` returns
  `paymentLinkUrl` → `POST /p/quiet-cost-of-convenience/exhausted action_taken=open_payment_link` (real session
  cookie) → **302 → the configured link** + `credits.exhausted_prompt{action_taken:"open_payment_link"}`
  analytics row at 18:41:39. The full surface path (balance → panel action → telemetry → 302) is live.

### Admin CLI on prod (D-PRB.08-1d) — PROVEN
`tsx apps/api/src/admin-cli.ts` against prod `DATABASE_URL` under `RHEMA_OPERATOR_ID=stevevitali`, all five
verbs on the fixture account `01M2R2E1WA5ADKMCFDAZ5FNMC3` / workspace `01M2R2E1WA81E1BQJX94K1SZQ4`:
`house-grant 123cr` (ledger `01M2TX7R8…`, audit `01M2TX7RC7…`) → `house-void` (voided 123 promo, audit
`01M2TX7TDP…`) → `suspend` → `reinstate` → `wtp $25 interview` (event `01M2TX800P…`). `admin_actions` rows:
`house_credit_grant`/`house_credit_void`/`account_suspend`/`account_reinstate`/`wtp_record` ×2 sessions,
all `actor='stevevitali'` — the audited trail is real.
**Second session (19:12, tagged fixture account `01PRB17ADMINFIXTURE00000`):** `house-grant 5cr` (ledger
`01M2TYXSW9P7CFMY45BVGAZQ9Z`, audit `01M2TYXT03T3BTTD9AS7V00ME0`) → `house-void` (voided 5, audit
`01M2TYY1KC7A296VHSS33T11DP`) → `suspend` → `reinstate` → `wtp $25 interview` (event
`01M2TYYCRFVDFQ82P23JWGYS6H`) — all five `admin_actions` rows verified in-table with
`note='PRB.17 admin-cli leg'`.

### PRB.14 live halves
- **(a) Stranded sweeps — proven.** Leg A `provisioning`: fixture `01PRB17STRANDEDPR0V0000000` failed
  `provisioning_timeout` at 16:40:11 (one `run.reap` tick after planting) — plus PRB.16's real-run evidence
  (`01M2R2W9W…`: provisioning→failed, hold 623 released, credential revoked, writer lock cleared). Leg B
  `queued`: fixture `01PRB17STRANDEDQUEUED00` planted `queued` with no job → sweep re-sent `run.start`
  (pgboss.job `5591631e…` created 16:40:11, consumed 16:40:12) — the D-P0.10-2 enqueue-loss recovery.
  **Worker-log receipts (re-asserted 19:15):** `rhema-prod-worker` Cloud Logging 16:40:11 —
  `stranded-sweep: {"kind":"provisioning_failed","runId":"01PRB17STRANDEDPROV0001"}` +
  `stranded-sweep: {"kind":"queued_reenqueued","runId":"01PRB17STRANDEDQUEUED00","attempt":1}` —
  the real `run.reap` consumer emitting both recovery kinds on prod.
- **(b) Refund→resume→re-debit — proven** (rows above).
- **(c) Breaker-trip cap multiplier — PROVEN.** `circuitBreakerState` live: **absorbed 1,284 / gross 5,399
  = 23.8% > 5% → `tripped:true, capMultiplier:2, page:true`** (11 real `adjustment/absorbed` rows from today's
  capped runs). A NEW run created 18:50 (`01M2TXNF3TQWJT77Y3ZJ349B0D`, review/quick/base, 454 words):
  `estimate_credits=57, cap_credits=172` — `buildEstimate` derives cap **86** (verified offline); the deployed
  run-create route applied `×2` (the breaker seam at `run-routes.ts:165`). Every post-16:37 run shows the 2× cap.
- **(d) Parked sweep + hold release — PROVEN on a real run.** Review `01M2TZSMPTWR26643A7K8S6Y5X`
  (quick/base, 454w): intake committed **68cr** at 19:31:01 → parked `waiting_gate` at `approve_scope`
  (gate `01M2V00CW97E0HDRV5CRZJYZ1P`, `parked_until` +30d) → `park-backdate` to now−1m → on-demand
  `run.sweep_parked` (enqueued via real `pgboss.job` insert, consumed by the real worker) →
  **cancelled** 19:32:12 with ledger `hold 172 → debit 68 → release 104` — the residual hold released on
  sweep-cancel exactly as §12.4/REQ-SPEC-24.4 requires. (Prior fixture `01PRB17STRANDEDQE0ED000000` also
  swept `cancelled` at 16:51:22 — it carried no hold row, so the release half is proven by this run.)
- **(e) ±2% figure — honest finding** (above): 18.23% out-of-tolerance, alert fired.
- **(f) Estimator fold — ALL FOUR folded on prod; `estimatorsAreProvisional()` over all four = false.**
  `createDbInstrumentedFolder` over real prod runs (one process, `integration/.scratch/fold-all4.mts`):
  review `01M2RGNK9…` → provisional:false, calibration **2.34×** (`instrumented@2026-09-18`);
  revise `01M2T6D3…` → **48.2×**; profile_voice `01M2TB91…` → **11.9×**; fact_check
  `01M2TZ8E1ARR8SMGKD4GKT162K` → **7.12×**. Per-workflow `provisional:false` ×4 →
  `estimatorsAreProvisional()` = **false**. The fact_check run itself: **completed** 19:25:21 — the FIRST
  full lifecycle under real hook enforcement (inventory 60cr committed 19:21:28 + verification 83cr
  committed 19:25:21; ledger `hold 390 → debit 60 → debit 83 → release 247`; `sdk_estimate` rows written
  both phases; access_log shows the post-F29 boundary working correctly — `Write …/agents/editor/.rhema/`
  **allow**, shared reads **allow**, root-recursive Glob + `/app/skills/…` read **deny**). Sizing note:
  fact_check estimates scale on `claimCount` — first attempt `01M2TYV6…` (claims unset → est 42 → cap 126)
  committed inventory 78cr then capped in verification; relaunched with `claimCount:10` → est 130 → cap 390.
  Caveat (honest): `INSTRUMENTED_OVERRIDES` is **process-local** — the folded constants are emitted for the
  caller to persist; no durable store replays them across processes yet (the §16.4 price-card precondition
  is proven at the fold call-site, not at boot).
- **D-P0.15d-2 `refundPhases`:** stays OPEN — no real reduced-commit/stop-ack path exists (the scratch
  `refund` driver exercised `refundPhases` directly, but the row's own criterion is a live call-site).

### beta-report (D-PRB.12-1) — PROVEN
`rhema admin beta-report` on prod rows (trailing 7d): **all nine REQ-BETA-18 gate metrics beside their
registered thresholds** — repeat-cycle 0.0% fail · accept+adapt 66.7% pass · second-manuscript no-data ·
paid conversion 100% pass · round-2 0.0% fail · median WTP $25 pass · auto-proceed 0% pass · cancel 28.6% fail ·
boundary-attestation 0 pass. Mechanical readout: **stop clause TRIPPED** (round-2 + cancel) — an honest read,
exit code 1 by design; G3 stays parked. Supporting metrics + per-run gross margin + reason codes rendered.
Intake legs: `POST /analytics/events` whitelisted `finding.viewed` → **200 recorded** (row 18:53:32);
server-owned `topup.purchased` → **403 `not a client-mintable event`**; catalogue 422 on a missing `severity`.
Opt-out: `POST /settings/privacy {analyticsOptOut:true}` → `letter.rated` returns `recorded:false`, **zero
rows** written — then restored to opted-in.

## Live findings fixed this run (commits)

- **F28** (`c5bc2d6`) — hook envelope + socket + audit transport (above).
- **F29** (`30dd5f7`) — **prod `agent_types` unseeded.** `runProdMigrateSeed` seeded `protocols` only;
  `agent_types` was 0 rows → every seat policy compiled `tools:[]` → post-F28 enforcement denied every
  matched tool. Symptom observed live: `01M2TXNF…` access_log showed `Read/Glob/Grep/Write` denied with
  empty path (the tool-token deny at `hook.ts:127`, not a path eval) and the run capped with zero committed
  steps. Fixed at the bringup script + seeded live (5 rows; flushed pending `0026_system_bypassrls`).
  Post-seed evidence: `01M2TZ8E…` — Write `agents/editor/.rhema/phase-result.json` **allow**, shared reads
  **allow**, `/app/skills/**` read + root-recursive Glob **deny**; full lifecycle completed.
- **F30** (`30dd5f7`) — run-create with no `modelProfile` → `TypeError` → **500** (live-observed
  19:07:55Z). Route defaults `modelProfile` from `modelTier`; `validateModelProfile` tolerates absent;
  regression test. Residual (recorded, not fixed — same class): other NOT-NULL body fields
  (`rateTableVersion`, `modelTier`) still surface as `23502 → 500` rather than a 400; a request-validation
  pass is a later hygiene ticket.
- **F31 (finding, not a code fix)** — ±2% cross-check honest **out-of-tolerance** result (18.23%, above).
  The SDK `costUsd` is list-priced without the platform rate-table margin; which figure is authoritative
  is an accounting ruling (joins D-PRB.16-5).

## Close-out gap analysis (spec → status)

| Leg | Status | Evidence |
|---|---|---|
| Stripe test-mode purchase (webhook→grant, replay, telemetry) | **PROVEN degraded** — deployed chain verified with constructed signed event; Stripe-originated purchase impossible (no key anywhere) → **D-PRB.17-1** | `stripe_events` ×2, grants `pi_prb17_test_1`/`pi_prb17_001`, replay 200/1-row/1-grant, `credits.exhausted_prompt` rows |
| Usage reconcile (real Anthropic report) | **DEFERRED** — `rhema-prod-anthropic-admin-key` is a placeholder; worker logs the placeholder and still runs the balance assertion (worker log 18:00:10) | stays inside D-PRB.08-1(b), PARTIAL |
| Ops alert → real `OPS_ALERT_WEBHOOK_URL` | **PROVEN** | catcher receipt 16:15:39Z |
| Admin CLI ×5 + `beta-report` | **PROVEN** | `admin_actions` rows ×2 sessions; report § above |
| Stranded `provisioning`/`queued` sweeps | **PROVEN** | worker logs 16:40:11 both kinds |
| Breaker-trip cap multiplier | **PROVEN** | tripped 23.8% → cap 172 = 86×2 on a real new run |
| Parked sweep + hold release | **PROVEN** | `01M2TZSM…` hold 172 → debit 68 → release 104 on sweep-cancel |
| Refund→resume→re-debit | **PROVEN** | `01M2TPMAW3Z6…` ledger verbatim |
| ±2% proxy-vs-SDK | **EXERCISED — out of tolerance (finding)** | 18.23%, flagged+alerted |
| Estimator fold, all four | **PROVEN** | `estimatorsAreProvisional()` = false (`instrumented@2026-09-18`) |
| `beta-report` nine metrics + intake/opt-out | **PROVEN** | report above; stop clause tripped honestly |
| `refundPhases` live call-site | **OPEN** — no real reduced-commit path exists | D-P0.15d-2 dated re-assessment |
| Gate-expiry consumption | **PARTIAL** — `gate_rearmed` proven; `gate.expiry` firing unobserved | D-PRB.16-4 |

## Spend ledger

PRB.17 session inference (proxy `list_cost_usd`, runs `01M2TP31…` → `01M2TZSM…` + `01PRB17…QE`):
**≈ $10.89** vs the **$25** envelope — 9 run-task executions (2 completed: fact_check `01M2TZ8E…`,
QV-legacy rows reused; 5 capped/cancelled test vehicles; plus the parked-leg cancel). No Stripe charges
(no key); catcher/Cloud-Logging ops are negligible. Fixture hygiene: divergence account removed
(`divergence-down`); admin fixture `01PRB17ADMINFIXTURE00000` left as the tagged audit trail
(grant 5 / void 5 — net zero); all test runs are terminal (no live hold outstanding).
