# PRB.18 — Prod finish legs: real OAuth client, Resend magic-link, Stripe-originated purchase, browser legs

> **Inserted 2026-09-18** (manifest § Plan extensions). Synthesized from the operator-supplied
> production credentials + the open DEFERRALS rows that only needed them: the Google OAuth client ID
> (the `401 invalid_client` root cause — `Pulumi.prod.yaml` carried `pending-h6-google-oauth-client-id`),
> a real Resend key, a **live-mode** Stripe key, and the operator's own Anthropic key. The secrets are
> already seeded in Secret Manager (`rhema-prod-resend-api-key` v2, `rhema-prod-stripe-secret` v2,
> `rhema-prod-anthropic-api-key` v2 — orchestrator-seeded, no values in any ledger); this ticket deploys
> the config and runs the legs those keys unblock.

- **Sequence:** inserted — runs **after `28h_PRB.17`, before `29_P1.01`**. Sorts as `28i`.
- **Phase:** LV — prod launch (the auth + money finish).
- **base_branch:** `stevevitali/prb-18-prod-auth-billing-finish-legs` — **pre-created by the
  orchestrator** (forked from chainTip `stevevitali/prb-17-billing-live-ops-legs`); it already carries
  the ticket file, the manifest/ledger insert, and the `Pulumi.prod.yaml` OAuth client-ID config. Work
  on this branch — do not fork a second one.
- **Depends on:** PRB.17 (chainTip — billing machinery proven), PRB.16/16b (golden path + auth mount
  live), **HUMAN-H6** (credential answers now recorded in ledger GATE DECISIONS 2026-09-18).
- **Run:** `implement-spec spec=docs/tickets/28i_PRB.18__prod-auth-billing-finish-legs.md`
- **Gate status:** two legs are **[OPERATOR GATE — browser/real money]** — a human performs the
  Google/magic-link click-throughs and the real Stripe checkout. Never fabricate a browser sign-in;
  assert the DB/log rows it produces.
- **Live stage:** **operator-gated** — Stage B on prod only. Stage A is thin (drivers only, no spend).

> **The Stripe key is `sk_live_`.** The earlier H6 answer chose test mode because no API credential
> existed; the operator has now supplied a **live-mode** key. A Stripe-originated purchase through a
> live-mode Payment Link is a **real charge** — the checkout step is the operator's own click (they
> supplied the key intending the live channel); the worker sets up the endpoint/link and verifies, but
> does not itself charge a card. If the account turns out not to accept live charges, degrade honestly
> to the test-mode leg and annotate.

## Operator prerequisites (recorded — discharge, don't re-ask)
- `rhema:googleOauthClientId` **already set** on the prod stack file
  (`25012989319-…apps.googleusercontent.com` — plain config, committed on this branch).
- `rhema-prod-resend-api-key`, `rhema-prod-stripe-secret`, `rhema-prod-anthropic-api-key` — real
  versions seeded (v2 each).
- `rhema-prod-google-oauth-client-secret` — presumed matching the supplied client (the dev-copied
  value; the OAuth consent screen was published covering `rhema.tools`). **Verify on the wire** — if
  the token exchange fails, the secret is stale and the operator must re-seed.
- `rhema-prod-stripe-webhook-secret` — still a **placeholder**; this ticket mints the real endpoint
  and seeds its `whsec_…`.
- `rhema-prod-anthropic-admin-key` — still a placeholder; usage.reconcile stays deferred (annotate).

## Goal
Close every prod leg that was parked only for credentials: **Google sign-in works on `rhema.tools`**
(the user's reported blocker), magic-link delivery works if the Resend domain is verified, a
**Stripe-originated** purchase lands `grant(topup)` (the leg D-PRB.17-1 could not run), and the
browser-only surfaces (EventSource run-card, CodeMirror editor) are exercised for real.

## Load
- `infra/pulumi/Pulumi.prod.yaml` (the OAuth client-id line — already set), `infra/pulumi/compute.ts`
  (the api env wiring), `apps/api/src/auth.ts` (Better Auth `baseURL`/`google` + `__Host-` cookies),
  `@rhema/ledger` `stripe.ts` + `apps/api` `billing-routes.ts` (webhook route path for the endpoint
  mint), `docs/build/runs/PRB.17.md` (the proven webhook→grant chain this leg re-verifies
  Stripe-originated).
- `docs/tickets/DEFERRALS.md` — **D-P0.01-3** (Google + magic-link sign-ins — the remaining halves),
  **D-P0.15b-1** (sign-in sub-leg), **D-PRB.17-1** (Stripe-originated purchase + real Payment Link),
  **D-PRB.04-2a / D-PRB.07-1a** (browser EventSource/editor legs), **D-PRB.08-1b** (reconcile — stays
  deferred absent the admin key), fetch byte-receipts (decision only — PRB.19 owns the code half).

## In scope — Stage A (offline, PR-able; thin only, no spend)
1. Any small driver the legs need (e.g. a Resend domain-status probe, a Stripe API helper for the
   endpoint/link mint). **No prod calls in tests.** If nothing is needed, Stage A is empty — say so.

## In scope — Stage B ([OPERATOR GATE]d; each leg = do it on prod → assert from rows/logs)
2. **Deploy the OAuth config.** `pulumi up prod` (rolls the api revision carrying the real
   `googleOauthClientId`); restart/roll the worker + egress-proxy MIG so `versions/latest` picks up
   the seeded v2 secrets (the proxy's provider key changed). Assert the api revision env.
3. **OAuth smoke (headless).** `POST https://api.rhema.tools/api/auth/sign-in/social` with
   `provider=google` → 302 to `accounts.google.com` carrying the real `client_id`, **no
   `invalid_client`**. If Google answers `redirect_uri_mismatch`, stop and report the exact URI —
   the operator adds `https://api.rhema.tools/api/auth/callback/google` to the client's authorized
   redirect URIs (Better Auth's convention under the `/api/auth` mount).
4. **[OPERATOR — browser] Google sign-in click-through** (D-P0.01-3 Google half). Operator signs in
   at `https://rhema.tools`; worker asserts: callback 200, `__Host-better-auth.session_token`
   `Secure` cookie on the response, `users`/`sessions`/`accounts` rows, `signup.completed
   {method:"google"}` (or sign-in) analytics row. No cookie names/values in the ledger — row counts
   + ids only.
5. **Resend domain status + magic-link leg** (D-P0.01-3 magic half). Query the Resend API for the
   `rhema.tools` sending-domain status with the seeded key. **If verified:** request a magic link to
   an operator address → operator clicks → assert session + user rows + `signup.completed
   {method:"magic_link"}`. **If unverified:** surface the exact DKIM/SPF records the Resend dashboard
   requires; the leg stays OPEN with a dated note (do not fake delivery).
6. **[OPERATOR GATE — REAL MONEY] Stripe-originated purchase** (D-PRB.17-1). Via the Stripe API with
   the seeded `sk_live_` key: mint a webhook endpoint pointing at the api's Stripe webhook route →
   seed its signing secret as `rhema-prod-stripe-webhook-secret` v3; create a real Payment Link for
   the configured top-up price → `pulumi config set rhema:stripePaymentLinkUrl <url>` → roll.
   Operator performs the checkout (real card, real money — small amount). Worker asserts the full
   Stripe-originated chain: `checkout.session.completed` arrives at the deployed webhook → signature
   verified against the **real** `whsec` → `stripe_events` row → `grant(topup,+12mo,stripe_ref)` →
   `credit_ledger` + balance assert. If live charges are refused by the account, run the test-mode
   equivalent and annotate the mode honestly.
7. **Browser surface legs** (D-PRB.04-2a, D-PRB.07-1a) — operator-assisted where a browser is
   required: a real run's run-card renders SSE events live in the browser (the EventSource path
   proven headlessly in PRB.16, asserted here visually/by the operator's report + the rows it
   produces), and the CodeMirror editor mounts/edits/saves. Whatever cannot be operator-verified
   stays OPEN with a dated note.
8. **Stragglers:** `usage.reconcile` — admin key still a placeholder → stays deferred (annotate
   D-PRB.08-1b); ops-alert real destination — only if the operator supplies one, else the catcher
   stands.

## Acceptance
- Google sign-in completes on `rhema.tools` with the real client (no `invalid_client`), session rows
  asserted — **or** a dated note naming the exact console fix still owed (redirect URI, secret).
- Magic-link delivered + clicked → session row, **or** the exact Resend DNS records surfaced.
- A **Stripe-originated** (not constructed) `checkout.session.completed` produced a `grant(topup)`
  row on prod — mode (live/test) stated honestly.
- Every leg's evidence is row ids/log timestamps — **no secret values, tokens, or card data**
  anywhere (ledger, PR body, run ledger).
- `pnpm turbo build lint typecheck` + `pnpm test` green for anything Stage A touched;
  `check-build-memory.sh .` clean.

## Out of scope
- The F26 revise-delivery design fix + F27/stranded-gate verifies + fetch byte-receipts code →
  **PRB.19** (`28j`).
- The D-PRB.16-5 spend-accounting ruling — operator decision, not this ticket.
- P1.* — skeletons parked on G3.
- Any merge — `mergePolicy: OPERATOR`.
