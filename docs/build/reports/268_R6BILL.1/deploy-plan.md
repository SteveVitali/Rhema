# 268_R6BILL.1 — expedited deploy plan (PREPARED, NOT RUN)

**Status:** staged for the operator's **explicit go-ahead** — the handoff authorizes preparing
this deploy, not running it. **Nothing below has been executed against prod or any stage.**
**Date drafted:** 2026-11-16 · **Worker:** devin-desktop/swe-2-high/subagent · **Deadline:** the first
live renewal of the 2026-10-27 Writer subscription falls **~2026-11-27** — land + deploy before then
or the first `invoice.paid`/`invoice.payment_failed` under basil is `ignored`-but-`processed_at` and the
period sync silently does nothing (the exact defect this PR fixes).

> **No prod writes were made by this run.** The only Stripe contact was the ticket-sanctioned
> read-only check, already executed by the read-only pass and recorded verbatim in §0.

## 0 · Decisive read (verbatim, already done — do NOT re-run)

`stripe webhook_endpoints retrieve we_1UH99C2MLe3ETP9Sk4UQBKXs --live` → **`api_version: None`** —
no version pinned at endpoint creation (PRB.18, 2026-09-18), so the **account default governs**
webhook payloads AND every unpinned API call. The live sub `sub_1UVF6l2MLe3ETP9ShyUGStFu` read at
that default returns `current_period_start`/`current_period_end` **only at item level**
(`subscription.items.data[].current_period_*`) — **the account default IS post-basil.** Deployed
code reads `invoice.subscription` + `sub.current_period_*` top-level — under basil both are absent →
`invoice.paid`/`payment_failed` → `ignored` but still marked `processed_at`; period sync silently
does nothing.

**Why expedited:** the endpoint gained `invoice.*` events only 2026-10-28 (R6LCH.1), so NO
`invoice.paid` has ever been delivered — zero broken events in `stripe_events` today. The first
exposure is the ~2026-11-27 renewal. Deploying this PR converts that event from silent no-op to a
real renewal.

## 0.1 · What the deploy must carry

The PR to prod is the merged `main` tip **after this PR merges** (`stevevitali/r6bill-1-basil`,
base `main` @ `784a2e54`). The payload is source-only:

- `packages/ledger/src/stripe.ts` — basil field-path reads w/ pre-basil fallback +
  `created`-ordering guard + `expectLivemode` check.
- `packages/ledger/src/stripe-port.ts` — `STRIPE_API_VERSION = "2025-03-31.basil"` pinned on every
  request (`Stripe-Version` header in `FetchStripePort.post`).
- `apps/worker/src/{billing-jobs.ts,main.ts}` — `expectLivemode` threaded + derived from the bound
  key's `sk_live_`/`rk_live_`/`sk_test_`/`rk_test_` prefix.
- `docs/` records — ticket file, manifest row, DEFERRALS/BUILD_INDEX/LEDGER tails.

**Services carrying the payload: api AND worker.** The webhook intake (`/stripe/webhook`) lives in
api (unchanged — verify→insert→enqueue); the state-writing processor (`processStripeEvent`) runs in
the **worker** — the worker image is the critical one for the ~11-27 renewal. The `Stripe-Version`
pin rides api (Checkout/Portal) AND worker (auto-reload). Zero migrations, zero config, zero env
changes — the livemode expectation derives from the already-bound `STRIPE_SECRET_KEY` value's mode
prefix, so nothing needs wiring.

## 1 · Pre-state capture (run at deploy time — 15 min before `pulumi up`)

```bash
# (a) deployed SHAs — record BOTH origins verbatim
curl -s https://rhema.tools/healthz        # deployed web SHA at time of writing
curl -s https://api.rhema.tools/healthz    # deployed api SHA

# (b) the pinned digest set that rollback restores
git show <deployed-sha>:infra/pulumi/Pulumi.prod.yaml > reports/268_R6BILL.1/prestate-Pulumi.prod.yaml
#     (commit the rhema:serviceImages / runTaskImageDigest / proxyImage line diff only —
#      P-1: never commit Pulumi stack exports)

# (c) migration ceiling (system-DSN over the IAP tunnel, BEGIN READ ONLY)
#     select max(name) from _migrations;   -- expect 0063-class; the diff carries ZERO migrations

# (d) webhook hygiene snapshot for the post-deploy note (read-only)
#     select type, count(*) from stripe_events group by type;
#     select count(*) from stripe_events where processed_at is null;
#     — expect zero invoice.* rows (first delivery lands ~11-27; a non-zero count means an early
#       invoice.* arrived pre-deploy — READ it before deploying: a stored basil-shape event
#       parked unprocessed will process correctly under this build on its next re-drive)
```

## 2 · The eight conditions — mapped to this deploy

| # | Condition | How it lands for RH-9/RH-7 |
|---|-----------|----------------------------|
| 1 | Owned `pr-<n>` preview walk first, teardown verified | **Carried (recorded honestly).** This is a webhook-processor diff — the defect is Stripe-payload-shape, exercisable only by a live Stripe account's events; a preview walk cannot produce basil-shaped `invoice.paid` deliveries (preview Stripe, if bound at all, is a different account/endpoint). The Stage-A proof is the fixture-per-shape suite (pre-basil AND basil) + fail-pre-fix verification. The deploy discipline itself (preview/up/provenance) is carried from the 262/266 walk. |
| 2 | All-service image build at the tip | Cloud Build trigger all-10 @ merged-`main` tip → `rhema-prod` AR (run-task vendored-SDK asserts must pass). |
| 3 | `pulumi preview --diff` classified | Expected: api + worker image updates + possibly the stateless `rhema-prod-proxy-tmpl` replace; **zero stateful replace/delete, zero destructive**; migrations none (zero `packages/db/migrations` delta); cost Δ ≈ $0 ≤ $15. A mismatch → **PAUSE**, never proceed. |
| 4 | `pulumi up --stack prod` | One-shot. api + worker roll together (the worker is the renewal-critical surface; the pin rolls with both). |
| 5 | `check-deploy-provenance` all-PASS | `node scripts/check-deploy-provenance.mjs --expect <merged-sha> --healthz https://rhema.tools --healthz https://api.rhema.tools`. |
| 6 | `deployments` row | `scripts/live/record-deployment.mjs` over the IAP tunnel — `prod:<merged-sha>`, all-10 digests, `protocols_version` unchanged. |
| 7 | Rollback recipe committed + corpus-in-web-image in-build assert | Recipe in §3; the corpus assert runs in-build as always. |
| 8 | CDN invalidate `/bff/p/demo~*` | `node scripts/live/cdn-invalidate-demo.mjs --dry-run` (commit output) then the act — standing post-web-deploy step (deploy-neutral for this payload but the act is standing). |

**Deadline ordering:** the ~2026-11-27 renewal is the hard edge. If the merge lands <48 h before it
and any condition can't be proven in time, the honest fallback is the §3 posture already in place —
the pre-basil code continues to `ignored`-process invoice events (no corruption, no grant) and the
missed renewal is recoverable post-deploy by re-driving the parked `stripe_events` row
(`admin-cli stripe-redrive`) — the stored payload processes correctly under the new build.

**GD-OPS-RULES.R6 (b) gate:** journeys `N1`/`N3` and the public-page legs must pass before any prod
deploy — a leg that fails but passed in any of its last 7 scheduled runs needs a cited earlier
failing run to classify pre-existing — otherwise it blocks.

## 3 · Rollback recipe

Rollback re-exposes the basil defect (invoice events `ignored`-processed, period sync no-op) — an
availability-only escape hatch; prefer a forward fix.

1. Re-point `infra/pulumi/Pulumi.prod.yaml` `rhema:serviceImages` / `rhema:runTaskImageDigest` /
   `rhema:proxyImage` to the pre-state digest set captured in §1(b).
2. `pulumi up --stack prod` — same shape (service rolls).
3. `check-deploy-provenance --expect <deployed-sha> --healthz …` all-PASS.
4. New `deployments` row for the rollback event.
5. **Compatibility note (honest):** state written under this build converges forward — a rollback
   only un-fixes future events. `stripe_events` rows processed under the new code (incl. `skipped`
   outcomes) stay processed; any basil-shape event that `ignored`-processed under a rolled-back
   build is re-driveable (`admin-cli stripe-redrive`) once the fix returns.

## 4 · Post-deploy verification (execute at deploy time; the ~11-27 renewal is the live proof)

1. **Provenance** — `check-deploy-provenance` all-PASS web+api at the merged SHA (condition 5).
2. **`Stripe-Version` live assert** — any outbound call proves the header: `stripe subscriptions
   retrieve <sub>` under the deployed code path is covered by the pin; externally, the account's
   Workbench request log shows `Stripe-Version: 2025-03-31.basil` on the next API call (e.g. a
   Portal session creation or the auto-reload sweep).
3. **First live `invoice.paid`** — on/after ~2026-11-27, over the IAP tunnel `BEGIN READ ONLY`:
   `select id, type, processed_at, payload->'data'->'object'->'parent'->'subscription_details'->>'subscription' as sub
    from stripe_events where type like 'invoice.%' order by received_at desc limit 5;`
   expect `processed_at` set, and the worker log line `stripe.event <evt> → renewal_paid`; the
   subscription row's `period_start`/`period_end` advance (never `ignored` on a basil invoice that
   resolves an account — `ignored` on invoice.* post-deploy is a page-worthy anomaly).
4. **Endpoint `api_version` (operator's Stripe-side act — never this repo's):** the request pin
   governs OUR calls only; webhook payloads keep following the account default. Recommended:
   Dashboard → Developers → Webhooks → `we_1UH99C2MLe3ETP9Sk4UQBKXs` → pin API version
   `2025-03-31.basil` so event shape and request shape can't drift apart. The dual-shape reads stay
   correct either way.
5. **D-R6BILL.1-1 close** — record the verification outcome on the deferral row.
