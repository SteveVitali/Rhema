# MAINT.5 — OAuth `form-action` CSP: the browser never followed the Google 302

- **Sequence:** 97 (round 3 — maintenance row, post-chain) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** defect
- **base_branch:** `stevevitali/res-3-leg1a-zero-coverage` (the chain tip; stacked PR on
  `stevevitali/maint-5-oauth-form-action-csp`)
- **Depends on:** MAINT.4 (95) — its deploy (update 146, `0acd16d`) made the api-side path healthy and
  revealed this second defect in the browser leg.
- **Scope (one line):** the `/login` form's POST 302-redirects to `accounts.google.com`; Chromium
  enforces CSP `form-action` on the redirect *target* → the navigation is refused silently and the user
  sits on `/login`. Admit the Google OAuth origin + validate the redirect target.
- **Run:** `implement-spec` (this file — authored retroactively; the fix landed in-run under the
  operator's "still doesn't work" live report)
- **Gate status:** none — code+tests; `mergePolicy: OPERATOR`.
- **Spend:** **$0.**

## The incident (live-verified)

After MAINT.4's deploy, a headless-Chromium walk of the real `/login` click (`packages/journeys`
harness, `google-click.mjs`) proved: `POST /login method=google` → server answers 302 to
`accounts.google.com/…`, and the browser console logs
`Sending form data to 'https://rhema.tools/login' violates … "form-action 'self' https://checkout.stripe.com …"`
— navigation blocked, page stays on `/login`. This is the same defect class BILL.3 fixed for Stripe
(ADR-027) and explains why MAINT.4 alone did not clear the operator's report: **two stacked defects** —
the limiter 429'd intermittently AND every successful 302 was CSP-blocked.

## Contract

1. Admit the Google OAuth origin in the CSP `form-action` allowlist, sharing one contracts constant
   (`GOOGLE_OAUTH_ORIGINS` in `packages/contracts/src/oauth.ts`, mirroring `stripe.ts`).
2. Validate the OAuth redirect target before emitting the 302 (`oauthRedirectTarget` — relative paths
   same-origin; absolute URLs must parse to `https://accounts.google.com`; refused targets render the
   honest "signup unavailable" copy, never a followed URL — mirroring `stripeRedirectTarget`, ADR-027).
3. Tests: `oauth.test.ts` (allowlist/lookalike/refusal), `server.test.ts` (absolute-Google 302 emitted
   + CSP admits the origin; non-Google absolute → 400, no Location), `billing-surfaces.test.ts` CSP
   assertion extended to the combined allowlist.
4. Deploy to prod + re-run the headless click: `/login` → Google consent page reached.

## Out of scope

- The real-account OAuth round-trip (D-MAINT.4-1 half (b) — operator, needs a Google account).
- Any change to `signup.mode`/invite gating; the limiter work stays as MAINT.4 landed it.

## Verify

- `pnpm vitest` touched files green; `turbo typecheck lint` green on `@rhema/web`+`@rhema/contracts`.
- Post-deploy: headless click reaches `accounts.google.com` (no CSP console error).
- `check-build-memory.sh` + `check-append-only.mjs` clean.
