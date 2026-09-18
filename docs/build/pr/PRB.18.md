# PRB.18 — Prod finish legs: real OAuth client deployed, Resend DNS surfaced, live Stripe channel wired

**Spec:** `docs/tickets/28i_PRB.18__prod-auth-billing-finish-legs.md` ·
**Base:** `stevevitali/prb-17-billing-live-ops-legs` ·
**Stacked PR — do not merge (mergePolicy=OPERATOR).**

## What this PR is

The credential-unblocked prod legs, executed live on `rhema-507501`: the real Google OAuth client
deployed (the user's reported `401 invalid_client` was the `pending-h6-…` placeholder — now gone),
the live-mode Stripe channel fully wired end-to-end (endpoint + signing secret + Payment Link +
deployed verifier proven on the wire), the Resend path proven and its exact DNS records surfaced.
The four **operator-gated** legs (Google sign-in click-through, magic-link click, real-money
checkout, browser surfaces) are recorded OPEN with exact steps — a pause, not a failure.
Stage A is empty by design (all drivers are gitignored scratch scripts; the only committed diff is
the `Pulumi.prod.yaml` link pin). Full evidence: `docs/build/runs/PRB.18.md`. Spend: **$0**
inference this session.

## Live evidence (all against prod)

- **Deploy.** `pulumi up` (update 53) → api `rhema-prod-api-e745ce0-00022-cwx` carrying the real
  `GOOGLE_OAUTH_CLIENT_ID` + the live `STRIPE_PAYMENT_LINK_URL`; worker rolled to
  `rhema-prod-worker-cbdaf0f-00021-pgk` (proved by the Resend rejection below); egress-proxy
  refreshed `versions/latest` via its designed **SIGHUP** rotation path (REQ-ARCH-30) — the
  operator's Anthropic key (v2) is now live without an instance replace.
- **OAuth smoke (headless).** `POST /api/auth/sign-in/social {provider:google}` → 200 with an
  `accounts.google.com` authorize URL carrying the **real `client_id`** (matches stack config
  byte-for-byte), `redirect_uri=https://rhema.tools/api/auth/callback/google`. A fake-code
  callback probe returns `invalid_code` — Google rejected the grant, **not** the client, so the
  seeded client secret is good. Google itself answers **`redirect_uri_mismatch`** naming the
  exact URI to register: `https://rhema.tools/api/auth/callback/google` (the app origin — Better
  Auth's baseURL is the app; the web proxies `/api/auth/*`). That one Google-Console add is the
  only remaining blocker for the sign-in click-through.
- **Resend (transport proven, delivery gated on DNS).** Domain `rhema.tools` =
  `b283fd45-93cf-42da-af40-f7016f194809`, status `not_started`. A real `auth.mail` job reached
  `ResendMailSender.send` and was rejected "domain is not verified" — key, queue, and mailer all
  work. The exact DKIM/SPF/CNAME records the operator must publish are in the run ledger.
- **Stripe (live mode — stated honestly).** Endpoint `we_1UH99C2MLe3ETP9Sk4UQBKXs` →
  `api.rhema.tools/stripe/webhook` (enabled, livemode, `checkout.session.completed` +
  `charge.dispute.*`); its whsec seeded as `rhema-prod-stripe-webhook-secret` v2; live Payment Link
  `plink_1UH99P2MLe3ETP9SR1zL2jAW` ($25) deployed via `rhema:stripePaymentLinkUrl` and served on
  `/billing/balance`. A constructed event **signed with the real whsec** → 200 →
  `stripe_events` `evt_prb18_sigcheck_1` → `stripe.event` processed (21:18:18Z). The
  Stripe-originated purchase itself is the operator's checkout:
  `<link>?client_reference_id=01M2V3PM1133TPH4M8H0T8CSEE` — then the grant assertion runs
  (scriptable; baseline rows are clean).
- **Operator account observed:** self-serve signup already landed (user `01M2V3PM0W…`, workspace,
  billing acct, `signup.completed{method:"magic_link"}` 20:35:35Z) — no session/OAuth-link/credit
  rows yet, so post-click assertions are unambiguous.

## Finding surfaced (routes to PRB.19)

- **F32** — `open_payment_link` 302s to the bare configured URL (`apps/web/src/server.ts:604`):
  no `client_reference_id`/`metadata` reaches the session → a panel-initiated real purchase would
  land `unresolved` (money taken, no grant, `processed_at` NULL). The URL-param append or a
  per-account link from `/billing/balance` is the fix.

## Honestly open (operator-gated, steps prepared)

- **D-P0.01-3 / D-P0.15b-1** — Google sign-in click-through (blocked only on the redirect-URI
  console add above) + magic-link delivery (blocked on the 4 Resend DNS records).
- **D-PRB.17-1** — the Stripe-originated `checkout.session.completed` → `grant(topup)` (operator's
  card; everything else on the live channel is proven).
- **D-PRB.04-2a / D-PRB.07-1a** — in-browser EventSource run-card + CodeMirror mount/edit/save
  (needs verified email + credits first — the exact sequence is in the run ledger).
- **D-PRB.08-1(b)** — `usage.reconcile` stays deferred (`anthropic-admin-key` still a placeholder,
  fingerprint-checked).
- **D-PRB.13-2** — signup half proven by real rows; verified-email + purchase halves pending.

## Verify

`pnpm turbo build lint typecheck` **111/111** · `pnpm test` green · `check-build-memory.sh .`
**0 violations** · live evidence in `docs/build/runs/PRB.18.md`. No secrets, tokens, cookies, or
card data in this PR or the ledger.
