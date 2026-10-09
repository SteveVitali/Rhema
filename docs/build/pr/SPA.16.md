# SPA.16 — surface: billing (`/app/settings/billing` + `/settings/billing` + `/billing/return` → React SPA behind the `billing` flag)

**Manifest row 119** · stacks on `stevevitali/spaf-6-prod-flip-project-home` @ `d463318` ·
merge policy **OPERATOR** — do not merge from the build environment · **$0** spend, no
deploys, no production writes, no Stripe flows exercised.

Implements `docs/tickets/119_SPA.16__surface-billing.md` per `docs/design/22`
(endpoint table — the `app.settings.billing` + `billing.return` rows),
`docs/design/29` (route-map `billing`), `docs/design/27` (two-leg + rollback
mechanics), and `docs/frontend-spa-spec.md` §4/§8/§9.
`STAGES.dev.spaSurfaces` gains `"billing"`; preview `[]` and prod
`["usage","inbox","settings","voices","onboarding","project-home"]` stay unchanged
(the prod flip is SPAF.7's own row, gated on the REQ-SEQ-10 bake).

**Deployable dark:** nothing changes for an unflipped request — each leaf's loader
skips its BFF read and `SsrHandoff` document-navigates back to the same URL, where
the server re-runs session → `spaShellResponse` consult → SSR in its normative
order (REQ-BFF-20). SSR fallback + `billing-pages.test.ts` untouched and green
(REQ-SEQ-11/12); `?ssr=1`/`x-rhema-renderer` overrides ride the unchanged consult
machinery.

## Requirement IDs

**REQ-SEQ-9 · REQ-VFY-8 · REQ-BFF-1/2/3/8/9/15/20/27 · REQ-DAT-4/12 ·
REQ-BILL-14/16/17 · REQ-NAV-11 · REQ-SAFE-6-R11/REQ-SAFE-10 ·
REQ-UX-3/4/5/6/10/13/14/15/16 · REQ-TST-2 · REQ-VFY-2/6**

## What lands

### BFF read twins (REQ-BFF-1/8/9, REQ-DAT-4/12)

- `GET /bff/settings/billing` → `{billing:{subscription,plans}, balance}` — raw
  DTOs over `getSubscription` / `getPlans` / `getBillingBalance`. `billing` is
  `null` unless BOTH reads land — the SSR's `subscription && plans` gate, so a
  degrade renders `data-billing-down`, never a fabricated free tier.
  `balance.paymentLinkUrl` is re-validated through the Stripe allowlist before
  serialization — a refused origin never reaches the wire (REQ-BFF-27).
- `GET /bff/billing/return` → `{checkoutReturn, cancelled, pollAfterSeconds?}` —
  `session_id`/`cancelled` ride the query string (URL state, never payload); the
  row read degrades to `null`; `pollAfterSeconds: 5` is emitted only while
  `open ∧ ¬cancelled ∧ <30 s old` — the §14.6 webhook-lag verdict stays
  server-owned (REQ-BFF-15; the leaf's `refetchInterval` reads it, never invents
  a cadence).

### JSON mutation branches (REQ-BFF-1/2/3/27)

All seven billing POSTs (`subscribe`, `topup`, `change-plan`, `cancel`,
`auto-reload`, `portal`, `waitlist` — on BOTH the canonical and legacy mounts)
gain `wantsJson` + `bodyFields` dual-mode:

- same-origin outcomes → `{ok:true, redirect}` on the identical `?saved=1` /
  `?notice=<code>` URLs the 302s carry (the alias posts return to the alias base);
- Stripe-hosted checkout/portal mints → `{ok:true, url}` after
  `stripeRedirectTarget` — `mutationOutcome` re-validates at serialization; a
  refused mint lands the `?notice=checkout|portal` arm and is never serialized;
- unauthed JSON → `{error:"unauthenticated"}` 401, never a `/login` redirect;
- form posts keep their exact 302 behaviour — the SSR tests pin it.

### `spa/surfaces/billing.tsx` + three wired leaves

- `BillingSurface` ports `BillingPage`; `BillingReturnSurface` ports
  `BillingReturnPage` — `Shell`/`PageTitle`/`SettingsNav` (exported from
  `surfaces/settings.tsx`)/footer chrome verbatim, `COPY.billing` copy, purchase
  fail-closed on the literal `"open"`, plan ladder, trial states, top-up gating,
  auto-reload, portal/no-customer, waitlist, `?notice`/`?saved` flashes, and all
  four checkout-return states. `compact` (phone) keeps §10.1's read-only card.
- `billing-copy.ts` — `billingNoticeFor` extracted to a client-safe module; one
  mapper serves SSR redirects AND the SPA's notice flash (protocol-markers
  allowlist += `billing-copy`).
- Delegated `onSubmit` on the surface root: fields collected BEFORE
  `aria-busy="true"` + disabled controls mark the in-flight form (REQ-UX-16 —
  FormData would post an empty body after the disable pass); `redirect` arms
  navigate in-router; `{url}` arms take `navigateDocument` (a document nav —
  CSP `form-action`'s other half); settle invalidates `["bff"]` — the repaint is
  server-truth, never an optimistic mirror.
- Leaves: `app.settings.billing`, `settings_.billing`, `billing.return` — each
  warms its query ONLY on a `"spa"` verdict (`SsrHandoff` never spends a read);
  `flagParam`/`String()` normalize the router's numeric `?cancelled=1`/`?saved=1`
  parse (the SPA.15 hazard).
- `COPY.billing.cycleLabel` added — axe `select-name` on the subscribe select,
  carried on BOTH renderers.

### Journey re-spec + stage facts

- N9 probes re-spec'd onto manifest hooks (`[data-subscribe-form='writer']`,
  `[data-topup-form='topup_10']`, `[data-portal-form]`) — the delegated submit
  still document-navigates to the Stripe host; `waitForURL` catches it either
  way. `SURFACE_GATES.billing = {N9}` — pre-existing, verified total,
  non-vacuous, paid-free.
- `STAGES.dev.spaSurfaces += "billing"` (flip order preserved); preview `[]`,
  prod pinned — SPAF.7 owns the flip.

## Verification

- `pnpm turbo build lint typecheck` — 135/135 green.
- `pnpm test` — focused files green: `billing.dom.test.tsx` (26),
  `bff.test.ts` (161), `billing-pages.test.ts` (retained SSR), `spa.dom.test.tsx`
  (auth-gate leg re-scoped to `/session` — every leaf owns a read now),
  `copy-containment.test.ts` (the nested-ternary card action is computed into
  `cardAction` ahead of the JSX — the lexical `>…<` sweep), `stages.test.ts`
  (dev/prod pins).
- `pnpm check:licenses` · `check:protocol-markers` · `check:no-cookies` ·
  `check:spa-budget` · `check:spa-env` — all clean.
- Full-suite totals recorded in `runs/SPA.16.md` at closeout.

## Honestly deferred (DEFERRALS.md)

- **D-SPA.16-1** — preview two-leg (A `pin-renderer ssr`/`expect-renderer ssr`,
  B `rhema:spaSurfaces += billing` + `--expect-renderer spa` on
  `SURFACE_GATES.billing` = N9, C `paid:false`).
- **D-SPA.16-2** — preview rollback drill (flag off → SSR serves the same DOM
  contract).
- Blocker: `rhema-nonprod-resend-api-key` absent from Secret Manager
  `rhema-507501` — probed `gcloud secrets versions access latest` → `NOT_FOUND`
  (value never printed). Without it `preview-stack.mjs resend-pull` cannot seed
  `rhema:resendApiKey` → no signed-in preview session mints → the session-gated
  billing legs cannot run. Same live blocker as `D-MAINT.6-1` and every prior
  SPA deferral; both rows carry the exact unblock recipe + verify steps.

## Out of scope (held)

Prod flip (SPAF.7), SSR deletions (REQ-TST-1 cleanup wave), API/schema changes —
never (spec §13).
