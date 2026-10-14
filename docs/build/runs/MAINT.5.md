# MAINT.5 — OAuth `form-action` CSP — run ledger

- **Harness:** Devin (SWE-2 High), interactive session — not a subagent dispatch (live operator report mid-session)
- **Base:** `stevevitali/res-3-leg1a-zero-coverage` @ `0acd16d` (chain tip; also the deployed prod SHA)
- **Spend:** $0 — one prod deploy (web image only) authorized by the operator's "diagnose and fix, including prod deploy"

## Reproduction (live, pre-fix)

Headless Chromium (script committed at `docs/build/reports/2026-10-07_oauth-csp/google-click.mjs`; run from `packages/journeys` for module resolution) on the deployed `0acd16d`:

1. `goto https://rhema.tools/login` → 200, "Continue with Google" button visible (plain
   `<form method=post action=/login>` + `<button type=submit name=method value=google>`; only inline
   script is the theme switcher — no interception).
2. Click → browser console: `Sending form data to 'https://rhema.tools/login' violates the following
   Content Security Policy directive: "form-action 'self' https://checkout.stripe.com …"` → page never
   leaves `/login` (no navigation at all).
3. Same POST via curl → 302 to `accounts.google.com` (server path healthy post-MAINT.4 deploy).

## Root cause

Chromium enforces CSP `form-action` on a form submission's redirect **target**. The allowlist held
`'self'` + `STRIPE_HOSTED_ORIGINS` (BILL.3, ADR-027) — `accounts.google.com` absent → every OAuth
hand-off silently refused in-browser. Stacked with MAINT.4's limiter defect: 429s surfaced "Too many
attempts" (the only visible feedback); non-429'd attempts died on this CSP line — both produced the
"does nothing" symptom.

## Fix

- `packages/contracts/src/oauth.ts` — `GOOGLE_OAUTH_ORIGINS` + `isGoogleOAuthRedirect` (mirrors
  `stripe.ts`); exported via `index.ts`.
- `apps/web/src/server.ts` — `form-action 'self' <stripe> <google>`; `oauthRedirectTarget` validator
  on both `outcome.redirect` emission sites (relative → same-origin ok; absolute → allowlist, refused
  targets render `errorSignupUnavailable` + log, never followed).
- Tests: `oauth.test.ts` (2), `server.test.ts` (+2: absolute-Google 302 + CSP origin present;
  non-Google absolute → 400, no Location), `billing-surfaces.test.ts` CSP assertion extended.

## Verify

- `vitest`: contracts oauth 2/2 · web server.test + billing-surfaces 118/118.
- `turbo typecheck lint` on `@rhema/web` + `@rhema/contracts`: green.
- Post-deploy live leg + build-memory/append-only results: appended below after the deploy.

## Deferrals

- `D-MAINT.4-1` half (b) still stands — the real-Google-account round trip to `/app` is operator-owed.

---

### Post-deploy (2026-10-07)

- Web-only rebuild: Cloud Build `80fb3cd9` (`_SERVICES=web`, `_GIT_SHA=6ebb1cb76e…`) →
  `web@sha256:ab1a2937e38f66c05a4a877b775546b6bfa4d714afc688fc16283e2d5d0049b9`; pinned in
  `Pulumi.prod.yaml`; **`pulumi up` update 147** (1 update, 0 replaces).
- `web/healthz` → `6ebb1cb76e14be8bfa6c6dc0731932c9011e6224`; `deployments` row recorded.
- **Live leg GREEN:** headless-Chromium click on `rhema.tools/login` "Continue with Google" →
  302 → `accounts.google.com/o/oauth2/v2/auth` → `v3/signin/identifier` ("Sign in - Google Accounts")
  — the real Google sign-in dialog; zero CSP console errors. (curl still sees 7×302 — unchanged.)
- **D-MAINT.4-1** half (a) now fully proven end-to-end (curl 302s + browser navigation to Google);
  half (b) — a real Google account through consent → `callback/google` → `/app` — remains operator-owed.
- Note: the fix commits rode `stevevitali/res-3-leg1a-zero-coverage` (PR #118) as an in-session hotfix
  under the operator's live report rather than a separate maint-5 branch; recorded here so the ledger
  matches the pushed history exactly.
