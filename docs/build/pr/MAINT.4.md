# MAINT.4 — OAuth sign-in start 429s: own the limiter deliberately

Manifest row 95 (maintenance) · stacks on `stevevitali/maint-3-funded-window-repairs` @
`1fa46b3` · merge policy **OPERATOR** — do not merge from the build environment · **$0**
spend, no deploys, no production writes.

Implements `docs/tickets/95_MAINT.4__oauth-signin-throttle.md`.

## The defect

better-auth v1.7.2's built-in rate limiter defaults ON in production
(`rateLimit.enabled = options.rateLimit?.enabled ?? isProduction`) with a `/sign-in/*`
special rule (10 s window, max 3), keyed via `getIP` on `x-forwarded-for`. Under ADR-040
neither channel yields a resolvable IP: `beginAuth`'s stamped web→api channel deliberately
omits XFF, and `authProxy`'s relayed multi-hop XFF is rejected without `trustedProxies` —
so every call resolved null → **ONE global `no-trusted-ip` bucket: 3 sign-in starts per
10 s across ALL users**. Prod evidence: `POST /api/auth/sign-in/social` 26×200 / 8×429 in
14 days plus the library's own "falling back to a single shared per-path bucket" warning.
A 429 surfaces as the re-rendered `/login` — the reported "Continue with Google doesn't do
anything".

## What lands

- **`rateLimit: { enabled: false }`** on `betterAuth()` (`apps/api/src/auth.ts`) — the
  library limiter was never opted into or audited; `enabled:false` (confirmed against
  `dist/api/rate-limiter/index.mjs`: `customRules` returning `false` would exempt a path,
  but nothing left needs its bucket) is the clean statement. `x-rhema-client-ip` is **not**
  added to `ipAddressHeaders` — `getIP` can't verify the OIDC stamp, so a direct caller
  could mint unlimited forged buckets.
- **App-channel throttle on the sign-in start**: the `hooks.before` social branch
  (`/sign-in/social` + `/sign-in/oauth2/*`) now runs `authClientIp` →
  `admission.signinThrottle.attempt(ip)` **before** the `!token`/`!verified`
  early-returns, so an unstamped caller still keys on the penultimate XFF hop. New
  additive optional `AuthAdmission.signinThrottle`; `server.ts` constructs it like its
  siblings — `createSharedIpEmailThrottle` over the shared Redis `throttleStore` with its
  own `keyPrefix: "rl:oauth"` wrapped in `createFallbackIpEmailThrottle` — at
  `OAUTH_SIGNIN_THROTTLE_DEFAULTS` = **10/min/IP** (sized for real retries).
- **Stale comment corrected** at `advanced.ipAddress` ("both forward the original client
  in x-forwarded-for" — false post-ADR-040; the field now only feeds the session row's
  best-effort `ip_address`).

## Reachable-mutation audit (verdict: `enabled:false` is faithful — no `customRules`)

Every unauthenticated creation path keeps an app-channel limit: `sign-in/social` +
`sign-in/oauth2/*` → `signinThrottle`; `sign-in/magic-link` → `magicLinkThrottle`;
`magic-link/verify` + `callback/google` creates → `accountThrottle` (and the
single-use-token / Google-exchange legs bound them). `emailAndPassword` is not enabled and
`user.deleteUser`/`changeEmail`/`emailVerification` are unset, so the whole
`sign-in/email`, `sign-up/email`, `change-*`, `reset-password*`, `delete-user`,
`send-verification-email` surface is config-dead. The remaining mutations
(`link/unlink-account`, `sign-out`, `revoke-*`, `update-*`, `refresh-token`) are
session-authenticated and never had a usable per-user limiter anyway — the shared
`no-trusted-ip` bucket was the outage, not a control. Full table in
`docs/build/runs/MAINT.4.md`.

## Owed (honest) — `D-MAINT.4-1`

- Post-deploy smoke: 5 rapid `POST /login -d method=google` → all 302; api log shows no
  `sign-in/social` 429 and no `NO_TRUSTED_IP_KEY` warning.
- The real-Google-account round-trip (operator/HUMAN): consent → `callback/google` →
  `/app`; also the first real callback hit ever observed (14d had zero — a Google-side
  issue could not be ruled out from the api).

## Test plan

- [x] `apps/api/src/auth.test.ts` — **21/21** (was 17): config assertion
      `rateLimit.enabled === false` (vitest leaves the library limiter off, so the config
      is pinned directly); 4 rapid distinct-IP stamped starts → all 200; same-IP abuse →
      429 `rate_limited`; unstamped caller keys on penultimate XFF (forged first hops
      share the bucket)
- [x] `pnpm turbo build lint typecheck` — 135/135 tasks
- [x] `pnpm test` — **4,572 pass / 0 fail** (baseline 4,567; +4 new, +1 conditional)
- [x] `git diff --check` clean · `check-build-memory.sh` 0 violations ·
      `check-append-only --base b51f80b` clean
- [ ] live legs above ride the next deploy (D-MAINT.4-1)
