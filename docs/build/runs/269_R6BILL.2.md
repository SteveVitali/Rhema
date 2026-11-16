# Run — 269_R6BILL.2 (stripe-idempotency)

- **Date:** 2026-11-16 · **Ticket:** `docs/tickets/269_R6BILL.2__stripe-idempotency.md` (handoff insert, RH-3 — Stripe idempotency + auto-reload defects)
- **Branch:** `stevevitali/r6bill-2-idempotency` · **Base:** `main` @ `27cf4b6d` · **Harness:** devin-desktop/swe-2-high/subagent
- **Class:** code + records, Stage A · **Spend:** $0 — the only prod contact was the ticket-sanctioned read-only census (`BEGIN READ ONLY … ROLLBACK` per session over the IAP tunnel; zero writes)

## Prod census (ticket's FIRST act — read-only, verbatim)

The ticket asked FIRST: does any prod account have `auto_reload` enabled? Collected
2026-11-16T06:43Z over the IAP tunnel (`gcloud compute ssh rhema-prod-proxy-zkrx
--zone us-central1-b --tunnel-through-iap -- -NL 15433:10.46.0.3:5432`; system-role DSN
`rhema-prod-proxy-database-url` host-rewritten to `127.0.0.1:15433`, `sslmode=disable`, never
printed/committed; `scripts/live/funded-query.mjs` — `BEGIN READ ONLY … ROLLBACK` per session).
The proxy MIG rolled again — `m4g8/g556` → `t1m0/nrqg` → now `zkrx/ld01` (recorded, recipe otherwise
unchanged).

```sql
select count(*)::int as total_accounts,
       count(*) filter (where auto_reload_enabled)::int as enabled,
       count(*) filter (where auto_reload_threshold_credits is not null
                        or auto_reload_pack_id is not null
                        or auto_reload_month_cap_cents is not null)::int as configured,
       count(*) filter (where stripe_customer_id is not null)::int as with_customer,
       count(*) filter (where auto_reload_spend_cents > 0)::int as nonzero_spend
  from billing_accounts
-- [ { "total_accounts": 1051, "enabled": 0, "configured": 0, "with_customer": 1, "nonzero_spend": 0 } ]

select count(*)::int as events,
       count(*) filter (where outcome = 'charged')::int as charged,
       count(*) filter (where outcome = 'failed')::int as failed,
       count(*) filter (where outcome = 'skipped')::int as skipped,
       min(at) as first_at, max(at) as last_at
  from auto_reload_events
-- [ { "events": 0, "charged": 0, "failed": 0, "skipped": 0, "first_at": null, "last_at": null } ]
```

**Census answer: ZERO.** No prod account has auto-reload enabled (0 of 1051), no `auto_reload_*`
column is set anywhere, `auto_reload_events` is empty, one account carries a `stripe_customer_id`.
**The defect family is LATENT** — no live charge can currently double-fire or strand — but the fix
still lands per the ticket: the hourly sweep arms the moment the first user opts in, and every
defect is a money-truthfulness defect once live.

## The four verified findings — each re-confirmed at tip, each fixed

1. **`Idempotency-Key` never sent** (`stripe-port.ts:146-151` pre-fix) — `FetchStripePort.post`
   sent only `authorization` + `content-type`; `chargeOffSession` already accepted an
   `idempotencyKey` arg that was silently dropped. **Fix:** `post(path, params, idempotencyKey)`
   sends the header on EVERY POST. Key policy, recorded: **deterministic where a durable call-site
   identifier exists** — `checkout-session:<checkout_sessions row id>` (a retry of the same session
   create collapses) and the sweep's `auto-reload:<account>:<month>:<seq>` — else a **per-request
   uuid**: `portal-session:<uuid>` (no call-site key; a rebuilt call honestly mints a new session)
   and `sub-cancel:<uuid>` (the flag write is itself state-idempotent, and a deterministic
   `sub-cancel:<id>:<flag>` key would replay-stale a cancel→uncancel→cancel cycle inside Stripe's
   24h window — the third request must reach Stripe, not replay the first response).

2. **Minute-component charge key** (`auto-reload.ts:110` pre-fix) — the key ended in
   `Math.floor(now.getTime()/60000)`, so a retry in a later minute was a NEW Stripe operation → a
   second charge for the same logical attempt. **Fix:** `auto-reload:<account>:<month>:<seq>` where
   `seq = attempts_this_month + 1` — the count of THIS month's recorded charge-outcome events
   (`reason in ('below_threshold','payment_failed','webhook_reconcile')`, `e.at >= <UTC month start>`
   passed as a parameter — never `date_trunc`, which would read the session timezone). Semantics: a
   crash after the Stripe charge but before the grant tx leaves NO event row → the retry re-derives
   the same seq → same key → Stripe replays the stored intent (no second charge; the grant then
   converges). A recorded charge/failure advances the seq → a genuinely new attempt mints a new key.
   Skips (`monthly_cap`, `no_payment_method`) never reached Stripe and don't consume a seq.
   **Residual bound, recorded honestly:** a transport failure after Stripe processed the request
   writes `payment_failed` (we cannot see the outcome) → the next attempt uses a new seq → a Stripe-
   side double-charge is still possible in that narrow class. It is unrecoverable without querying
   Stripe intent state; the reconcile arm below is the compensating control (the succeeded intent's
   own delivery converges the account).

3. **Workspace-join double-charge** (`auto-reload.ts:41-73` pre-fix) — `billing_accounts ⋈
   workspaces` produced one row PER WORKSPACE: an account with N workspaces attempted (and charged)
   N times per sweep. **Fix:** `join lateral (… order by created_at, id limit 1)` — ONE row per
   account, anchored on the account's home workspace (the `homeWorkspace` convention already in
   `stripe.ts`), which carries the tx + audit row.

4. **Charge→grant gap** — the off-session charge succeeds OUTSIDE the grant transaction; a crash
   between them leaves a real charge with no credits, no counter bump, no audit row — and no local
   trace (the event row lives in the same tx). **Fix — the `payment_intent.succeeded` reconcile
   arm** (chosen, reasoning recorded): a DB-side resweep cannot SEE the orphaned charge (the crash
   erased the only would-be local record; polling Stripe intent lists would need a new port verb +
   pagination and still can't fix an intent whose delivery never arrived). The webhook is Stripe's
   own durable, retried delivery channel for exactly this fact, and `stripe_events` intake already
   dedupes it. The arm: metadata gate `kind === 'auto_reload'` (Checkout top-up PIs carry
   `billing_account_id`/`pack_id` but no `kind` → `ignored`; their stranding is 272_R6BILL.3's
   stripe_events sweep, not this arm) → resolve account (metadata → customer) + workspace (metadata
   → home) + pack → `grant` under the SHARED `auto-reload:grant:<pi>` key the sweep uses →
   exactly-once whichever path lands first → on `applied`, the monthly counter advances
   (`case when auto_reload_month = $m then spend + cents else cents`) and the
   `webhook_reconcile`/`charged` audit row lands — the row the sweep would have left,
   distinguishable for audit. `chargeOffSession` now sends `metadata[kind/billing_account_id/
   workspace_id/pack_id]` on the intent so the arm resolves without a lookup. `payment_intent.
   succeeded` joined `STRIPE_WEBHOOK_EVENT_TYPES` (the endpoint contract test pins it) and
   `docs/ops/stripe-webhook-endpoint.md` (required set + the `enabled_events` command — now ten
   types). **The Stripe-side subscription update is the operator's act → `D-R6BILL.2-1`** — the arm
   is dormant until it runs; recorded, never executed.

## What landed

- `packages/ledger/src/stripe-port.ts` — `post()` sends `Idempotency-Key` on every POST (policy
  above); `chargeOffSession` gains `billingAccountId`/`workspaceId`/`packId` → intent metadata;
  `randomUUID` for the two uuid-keyed ops; `StripePort` interface + `StubStripePort` updated.
- `packages/ledger/src/auto-reload.ts` — distinct account select (lateral home workspace) +
  `attempts_this_month` count + the deterministic key + the new port args.
- `packages/ledger/src/stripe.ts` — `payment_intent.succeeded` in `STRIPE_WEBHOOK_EVENT_TYPES`
  + `PaymentIntentObject` + the `processPaymentIntentSucceeded` arm + `auto_reload_reconciled`
  outcome kind.
- `docs/ops/stripe-webhook-endpoint.md` — tenth required type + dated 269 note.
- `docs/tickets/DEFERRALS.md` — `D-R6BILL.2-1` (endpoint enabled_events act + deployed re-proof).
- `docs/tickets/00_MANIFEST.md` + ticket file (row 269 — stacked-PR convention: each PR carries
  its own row/file; the full insert set lives on #344's branch).

## Regressions — fail-pre-fix proof

**12 new tests, all RED on pre-fix code** (run verbatim, 2026-11-16): `stripe-port.test.ts` ×4 —
no `Idempotency-Key` header on any POST; `auto-reload.test.ts` ×4 — key read
`auto-reload:ba_seed:2026-09:1:29806560` (the minute component, verbatim), crash-retry produced a
second key, recorded-attempt seq stayed 1, the two-workspace account charged TWICE;
`stripe.test.ts` ×4 — the endpoint contract pin, and the reconcile arm absent (`ignored` on all
five arms: reconcile/grant, sweep-interlock, replay, non-auto_reload ignore, unresolvable
`unprocessed`). Post-fix: all green.

## Verify

- `vitest run packages/ledger/src/{stripe-port,auto-reload,stripe}.test.ts` — **63/63** (previously
  51 pass + 12 red → 63 pass).
- `vitest run packages/ledger/src` — **273/273** (full package suite, PGlite).
- `vitest run apps/worker/src/billing-jobs.test.ts apps/api/src/billing-routes.test.ts` — **38/38**.
- `pnpm turbo build --filter=@rhema/ledger... --filter=@rhema/worker... --filter=@rhema/api...` —
  clean (25 tasks).
- `pnpm --filter @rhema/ledger lint` — clean. Typecheck clean via `tsc -b` builds.
- `pnpm format` — the six touched files flag **pre-existing at unmodified HEAD** (verified by
  stash — the repo's standing condition disclosed in earlier runs; NOT reformatted, that would
  bury the diff under unrelated churn).
- `scripts/live/funded-query.mjs` — `BEGIN READ ONLY … ROLLBACK` every session; the DSN was never
  printed or committed; the tunnel was closed after the census. Zero prod writes.

## Dispositions this run

- `D-R6BILL.2-1` opened (endpoint `enabled_events` += `payment_intent.succeeded` — operator's
  Stripe-side act; the arm dormant until it runs + the deployed re-proof).
- `nextTicket` → `270_R6OPS.4`; `lastCompleted` → `269_R6BILL.2`; `projectStatus` stays
  IN_PROGRESS.
- **Spend: $0. Zero prod writes. No paid dispatch, no preview, no deploy.**
- No PR merged by this run; `mergePolicy: OPERATOR`.

## Self-review / gap analysis

- P1 — the seq-from-events scheme was chosen over `spend/packCents+1` deliberately: pack-size
  changes mid-month would collide a `floor` sequence (`$10 pack → spend 1000 → switch to $50 pack
  → 1000/5000+1 = 1` = the first attempt's key) and replay a wrong-priced charge; the event count
  tracks real Stripe round-trips regardless of pack. Trade-off recorded above (the post-processing
  transport-failure bound).
- P2 — `payment_intent.succeeded` for non-auto-reload PIs is deliberately `ignored`: RH-11's
  stranding class (Checkout top-ups, subscriptions) belongs to 272_R6BILL.3's `processed_at is
  null` sweep — this arm stays scoped to the only unattended-charge path.
- Honest flags: (a) the uuid keys for portal/cancel dedupe nothing today (no retry loop exists) —
  the header is the mandated uniform contract; recorded rather than dressed up; (b) the reconcile
  arm is dormant until the operator's endpoint update — it fixes nothing live until then, and
  `D-R6BILL.2-1` carries exactly that; (c) `attempted`/`charged` in the sweep result could read >1
  under a concurrent-sweep race that Stripe-side dedupes — a reporting nit, never a second charge
  (shared PI → shared grant key → `applied:false`).
