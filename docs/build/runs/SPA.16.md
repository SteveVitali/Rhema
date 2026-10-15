# SPA.16 — run ledger: surface `billing` (`/app/settings/billing` + `/settings/billing` + `/billing/return`)

- **Ticket:** `docs/tickets/119_SPA.16__surface-billing.md` (manifest row 119)
- **Branch:** `stevevitali/spa-16-surface-billing` — forked from
  `stevevitali/spaf-6-prod-flip-project-home` @ `d463318` (the requested chain tip).
- **PR:** #141 — `pr/SPA.16.md` is the committed body.
- **Harness:** devin-cli subagent (per the 2026-10-08T23:05Z dispatch-tier ruling).
- **Mode:** offline-only, $0 — no deploys, no production writes, no Stripe flows,
  mergePolicy OPERATOR.
- **Spend:** `paid:false` legs only; no metered spend ($0).

## 0 — Prerequisite probe (run first, per the ticket's operating clause)

```
gcloud secrets versions access latest \
  --secret=rhema-nonprod-resend-api-key --project=rhema-507501
→ ERROR: (gcloud.secrets.versions.access) NOT_FOUND:
  Secret [projects/25012989319/secrets/rhema-nonprod-resend-api-key]
  not found or has no versions.        (account 14stevevitali@gmail.com)
```

The secret was never printed (there is no version to print). Without it
`preview-stack.mjs resend-pull` cannot seed `rhema:resendApiKey`, so no signed-in
preview session can mint through the magic-link + mailbox leg — every billing leg
is session-gated. The preview two-leg and rollback drill are honestly deferred
(`D-SPA.16-1`/`-2`), with the deterministic in-repo proof standing in. This is the
same live blocker as `D-MAINT.6-1` / `D-SPA.6-1` / `D-SPA.12-1` / `D-SPA.13-1` /
`D-SPA.14-1` / `D-SPA.15-1`.

## 1 — What landed

### `billing-copy.ts` — the shared notice mapper (new, client-safe)

`billingNoticeFor` was hoisted verbatim out of `server.ts` into
`apps/web/src/billing-copy.ts` — one mapper, both renderers: the SSR still maps
a failed POST's stable code into the `?notice=` redirect's copy, and the SPA's
flash line maps the same code through the same table. All cases carried:
`purchase_closed`, `topups_require_plan`, `first_month_cap`, `plan_waitlisted`,
`no_stripe_customer`, `stripe_rejected`, `stripe_unconfigured`,
`stripe_credentials_unconfigured`, `change`, `cancel`, `autoreload`, `waitlist`,
`checkout`, `portal`, `stripe_unavailable`, default → `stripeDownNote`.
`check-protocol-markers.mjs` allowlist += `billing-copy` (the guard caught it
first — worked as designed).

### `GET /bff/settings/billing` — the aggregate twin (REQ-BFF-1/8/9, REQ-DAT-4/12)

- `{billing:{subscription,plans}, balance}` — raw DTOs over `getSubscription`,
  `getPlans`, `getBillingBalance`; no view models.
- `billing` is `null` unless BOTH the subscription and plans reads land — the
  document's own `subscription && plans` gate, so an upstream degrade renders
  `data-billing-down`, never a fabricated free tier.
- `balance.paymentLinkUrl` is re-validated through `stripeRedirectTarget` BEFORE
  serialization — a refused origin lands `paymentLinkUrl: undefined` (the key is
  absent on the wire — REQ-BFF-27's never-serialize half).
- `bffRoute` session gate; upstream 401 rethrows into `{error:"unauthenticated"}`.

### `GET /bff/billing/return` — the checkout-return twin (REQ-BILL-14, REQ-BFF-15)

- `session_id`/`cancelled` ride the query string (URL state, never payload);
  a missing `session_id` spends no read (`checkoutReturn: null` — the document's
  own absent-param path).
- The row read degrades to `null` (the SSR's tolerate branch).
- `pollAfterSeconds: 5` is emitted only while `state==="open" ∧ ¬cancelled ∧
  createdAt < 30 s old` — the §14.6 webhook-lag verdict verbatim from the
  document's `stillPolling` check. Completed/expired/cancelled/past-window rows
  all answer WITHOUT it — the leaf never polls on its own judgment.

### JSON mutation branches — all seven POSTs × two mounts (REQ-BFF-1/2/3/27)

`subscribe`, `topup`, `change-plan`, `cancel`, `auto-reload`, `portal`,
`waitlist` on `/app/settings/billing/*` AND `/settings/billing/*`:

- `wantsJson` + `bodyFields` dual-mode; form posts keep their exact 302s.
- `{ok:true, redirect}` carries the identical `?saved=1` / `?notice=<code>` URL —
  including the alias base (`/settings/billing` posts return to
  `/settings/billing?…` — `billingPost`'s `base` argument verbatim).
- Checkout/portal mints → `{ok:true, url}` only after `stripeRedirectTarget`;
  `mutationOutcome` re-validates at serialization. A refused mint lands the
  `?notice=checkout|portal` arm — the value never serializes.
- Unauthed JSON → `{error:"unauthenticated"}` 401, never a `/login` redirect.
- `billingFailureCode` semantics preserved — the api's stable code maps the
  notice (`purchase_closed` on the auto-reload opt-in stays the paused copy).

### `spa/queries.ts`

- `billingSettingsQuery` — `["bff","settings","billing"]`, `bffFetch`,
  `retryPolicy`.
- `billingReturnQuery(search)` — `["bff","billing","return",{session_id,
  cancelled}]` (normalized: `session_id ?? null`, `cancelled === "1"` → bool);
  `refetchInterval` reads `pollAfterSeconds` from the twin — absent ⇒ no poll.

### `spa/surfaces/billing.tsx` (the React twin)

- `BillingSurface` ports `BillingPage` — `Shell`/`PageTitle`/`SettingsNav`
  (exported from `surfaces/settings.tsx`)/`Footer` chrome, `COPY.billing`
  throughout, `data-current-plan` (free vs tier + period line), the trial strip
  (`data-trial-state`), `data-past-due` banner, the plan ladder
  (`data-plan-ladder` + `data-plan` + `data-plan-card`), waitlist form on
  `plan.waitlist` cards, cancel form on the current card, subscribe form gated on
  `purchase === "open"` verbatim (`data-purchase-paused` when closed — fail
  closed), `data-topups`/`data-topup-form`/`data-topup-gated`, the auto-reload
  fieldset (`data-auto-reload`, `thresholdCredits`/`packId`/`monthlyCapUsd`
  fields + `enabled` checkbox), the portal form (`data-portal-form`) only when
  `hasStripeCustomer && purchaseOpen`, `data-no-customer`/`data-billing-down`,
  `data-notice`/`data-saved` flashes. Phone (`compact`) keeps §10.1's read-only
  card — all controls withheld.
- `BillingReturnSurface` ports `BillingReturnPage` — `data-checkout-state`
  completed/open/expired/cancelled, `data-checkout-continue` → `returnTo` or the
  billing settings page.
- Delegated `onSubmit` on the `[data-spa-surface]` root: `collectFormFields`
  gathers named controls BEFORE `setFormBusy` marks `aria-busy="true"` +
  disables (REQ-UX-16 — FormData after the disable pass would post an empty
  body); JSON via `bffFetch`; `{redirect}` → in-router `router.navigate`;
  `{url}` → `navigateDocument` (a real document nav — CSP `form-action`'s other
  half; REQ-SAFE-6-R11); settle → `invalidateQueries(["bff"])` — server-truth
  repaint, never optimistic.
- The per-card action (waitlist/cancel/subscribe) is computed into `cardAction`
  ahead of the JSX — the REQ-SAFE-10 lexical `>…<` sweep can't see a nested
  ternary between tags (`copy-containment` red → fixed).
- `COPY.billing.cycleLabel` added — axe `select-name` on the subscribe
  `<select name="cycle">`, carried on BOTH renderers (`pages.tsx` too — the
  SPA.14 both-renderers precedent).

### The three leaves

- `app.settings.billing.tsx` + `settings_.billing.tsx` — warm
  `billingSettingsQuery` ONLY on a `"spa"` verdict; `SsrHandoff` otherwise (the
  unflipped path never spends a BFF read); `saved`/`notice` validated search.
  The alias keys its verdict on its own route id `/settings/billing` (the boot
  map's shape) and posts to the canonical `/app/settings/billing/*` actions —
  verbatim the SSR's emitted actions on the alias mount.
- `billing.return.tsx` — `validateSearch` is `flagParam` for `cancelled` (the
  router's JSON-shaped parse turns `?cancelled=1` into the NUMBER 1 — the SPA.15
  hazard) + `strParam` for `session_id`; the loader normalizes `location.search`
  through `String()` so the warm key equals the leaf's `useQuery` key verbatim.

### DOM contract + journeys + stage facts

- `dom-contract.ts` billing section: every hook's emitter updated to
  `pages.tsx / spa/surfaces/billing.tsx`; added `data-checkout-continue`,
  `data-plan-ladder`, `data-topups`, `data-auto-reload`, `data-billing-down`,
  `data-no-customer`, `data-notice`, `data-saved`, the `seats`/`packId`/
  `thresholdCredits`/`monthlyCapUsd` fields, and the `session_id` urlparam.
  (A duplicate `u("cancelled")` was caught and removed — the entry existed.)
- N9 (`packages/journeys/src/steps.ts`): probes re-spec'd onto manifest hooks —
  `form[data-subscribe-form='writer']` → `[data-subscribe-form='writer']`,
  `form[data-topup-form='topup_10']` → `[data-topup-form='topup_10']`,
  `form[data-portal-form]` → `[data-portal-form]`. Under the flipped surface the
  delegated submit rides the JSON branch and `navigateDocument` performs the
  hand-off — `waitForURL` catches a document navigation in both renderers.
- `SURFACE_GATES.billing = gate("billing", ["N9"], …)` — pre-existing, verified
  total + non-vacuous + paid-free (`N9` asserts the Stripe-hosted hand-offs only;
  no purchase completes).
- `STAGES.dev.spaSurfaces` → `[…,"project-home","billing"]`; preview `[]` and
  prod `["usage","inbox","settings","voices","onboarding","project-home"]` pinned
  (SPAF.7 owns the prod flip — REQ-SEQ-10's nightly-green chain binds
  activation). `stages.test.ts` pin updated.

## 2 — Test evidence

- `pnpm turbo build lint typecheck` — **135/135 green**.
- `pnpm vitest run src/spa/billing.dom.test.tsx src/bff.test.ts
  src/billing-pages.test.ts` — **210 pass / 0 fail**;
  `infra/config/stages.test.ts` 23/23; `@rhema/journeys` lint clean.
- `pnpm test` (full suite) — 5,338 pass / 4 skip; the two mid-run reds were this
  ticket's own and are fixed + re-verified green:
  1. `copy-containment` — `surfaces/billing.tsx` inline-text hits (a `//` comment
     inside a JSX ternary arm + the nested-ternary `>…<` span). Fixed: block-body
     `mutationFn` (the other surfaces' idiom) + the `cardAction` extraction.
  2. `spa.dom.test.tsx` auth-gate leg — its "no fetch at all" fixture mounted
     `/app/settings/billing` because the leaf was still a stub; the leaf now
     legitimately warms its twin. Re-scoped the assertion to `/session` — the
     seed's contract — comment updated.
  3. `axe select-name` on the subscribe select → `aria-label={B.cycleLabel}` on
     both renderers (the run's third mid-run red, fixed before the suite re-run).
- Script gates: `check:licenses` ✓ · `check:protocol-markers` ✓ (allowlist grew
  by exactly `billing-copy`) · `check:no-cookies` ✓ · `check:spa-budget` ✓ ·
  `check:spa-env` ✓ (94 client sources / 126 artifacts).
- `billing.dom.test.tsx` — 26 tests: both mounts (`/app/settings/billing` +
  `/settings/billing`), plan ladder + current-plan line, trial states,
  purchase-closed fail-closed, subscription/cancel scheduled, top-up gating,
  auto-reload + waitlist + portal/no-customer, `?notice=`/`?saved=1` flashes,
  delegated JSON posts (fields-before-busy, `aria-busy`+disabled in-flight,
  `{redirect}` in-router nav, `{url}` → `spaRuntime.assign` document nav,
  `["bff"]` invalidate on settle), checkout-return completed/open/expired/
  cancelled + the `pollAfterSeconds`-driven refetch, numeric `?cancelled=1`/
  `?session_id` parse, SSR-parity `expectManifestEmission` vs `BillingPage`/
  `BillingReturnPage`, axe subset, SsrHandoff with zero BFF spend.
- `bff.test.ts` SPA.16 block — +11: twin aggregate verbatim, degrade→
  `billing:null` (never a fabricated tier), upstream-401 envelope, Stripe-URL
  re-validation (Stripe passes verbatim / refused origin absent from the wire),
  checkout-return poll verdicts (open<30s → 5; completed/expired/cancelled/
  past-window → absent; no `session_id` → null + zero reads; degrade → null),
  all seven mutation JSON branches + form-302 parity + alias-base redirects +
  unauthed-401 sweep on all eight legs.
- Retained SSR suite `billing-pages.test.ts` — untouched, green.

## 3 — Deferrals

- `D-SPA.16-1` — preview two-leg (A `pin-renderer ssr`/`expect-renderer ssr`,
  B `rhema:spaSurfaces += billing` + `--expect-renderer spa` on `N9`,
  C `paid:false`). **OPEN** — blocker recorded verbatim.
- `D-SPA.16-2` — preview rollback drill (flag off → SSR serves the same DOM
  contract). **OPEN** — same blocker.
- Neither preview nor prod was touched: `STAGES.preview.spaSurfaces` stays `[]`,
  `STAGES.prod.spaSurfaces` unchanged. REQ-SEQ-11 deployable-dark holds — the PR
  is additive-only on the render side.

## 4 — AC status

| AC | Status |
|---|---|
| `/bff/*` twins + envelope mutations green — typed JSON, preserved statuses | **engineered** — twins + all 14 mutation legs (7 verbs × 2 mounts) under test |
| React surface emits the full dom-contract vocabulary — component tests + axe | **engineered** — 26 dom tests + `expectManifestEmission` + axe subset |
| Retained SSR tests stay green — fallback untouched | **engineered** — `billing-pages.test.ts` green, zero edits |
| Journey re-spec + `SURFACE_GATES` + preview two-leg on `pr-<n>` | **journey re-spec engineered; preview leg DEFERRED** — `D-SPA.16-1` (secret blocker) |
| Rollback drill evidence on the preview | **DEFERRED** — `D-SPA.16-2` (same blocker); the flag-off path is unit-pinned |
| Dev stage-fact line — prod untouched | **engineered** — `stages.test.ts` pins dev/prod/preview verbatim |
| Universal phase-gate AC | recorded — checks below; deferrals appended; ledgers advanced |

## 5 — Checks read + memory

- `gh pr checks 141 --watch=false` — read once at closeout (2026-10-09T09:0xZ):
  **`no checks reported on the 'stevevitali/spa-16-surface-billing' branch`** —
  the same state SPAF.6's #140 recorded (`289acf5`); no check had reported yet.
  Local gates stand in: turbo build/lint/typecheck 135/135, `pnpm test` green,
  all five script gates clean.
- `check-build-memory.sh` + `check-append-only.mjs --base d463318` — green at
  closeout.
- `BUILD_INDEX.md` row 148 · `LEDGER.md` advanced — `nextTicket: SPAF.7`,
  `lastCompleted: SPA.16`, `chainTip: stevevitali/spa-16-surface-billing`.

## 6 — Deviations / notes

- **Size:** ~1.7k changed lines incl. ~600 of new dom tests + ~280 of new bff
  tests — over the ~600 guide for the same reason as SPA.14/15 (the test files
  dominate; production diff is modest). Recorded per precedent.
- **SSR-parity nicety:** `pages.tsx` gained `aria-label` on the subscribe select
  (one attribute) so both renderers carry the axe fix — the copy-containment and
  manifest emission remain identical.
- **No new ADRs** — every decision follows an existing one (REQ-BFF-27's
  validated `{url}` envelope, REQ-BFF-15's server-owned cadence, the SPA.15
  `flagParam` numeric-parse fix).
