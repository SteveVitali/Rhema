# MAINT.4 — OAuth sign-in start 429s: better-auth's built-in limiter keys a shared bucket (ADR-040 bypass)

- **Sequence:** 95 (round 3 — maintenance row, post-chain) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** defect
- **base_branch:** `stevevitali/maint-3-funded-window-repairs` (the chain tip; stacked PR on `stevevitali/maint-4-oauth-signin-throttle`)
- **Depends on:** nothing in-flight; stacks on MAINT.3's tip
- **Scope (one line):** stop better-auth's unaudited built-in `/sign-in/*` rate limiter from keying a single
  global bucket on prod, and cover `sign-in/social` with the app's audited OIDC-verified throttle channel.
- **Absorbs (backlog):** new finding (this diagnosis); recorded below.
- **Run:** `implement-spec spec=docs/tickets/95_MAINT.4__oauth-signin-throttle.md`
- **Gate status:** none — code + tests only; `mergePolicy: OPERATOR`.
- **Spend:** **$0.** Live verification is read-only curl, owed to the next deploy.

## Diagnosis (operator-reported symptom: "Continue with Google" loops back to /login)

Prod evidence (all read-only, $0):

- `POST https://rhema.tools/login` `method=google` → **302 to `accounts.google.com`** with a valid
  `__Host-rhema.state` cookie; the minted Google URL resolves to a real sign-in flow (no
  `redirect_uri_mismatch`). Server-side start is healthy.
- BUT the api's request log shows `POST /api/auth/sign-in/social` → **429** bursts
  (14-day window: 26×200 / 8×429 — e.g. 2026-10-06T18:28:30-34Z: 302,302,302 then 429,429).
- Cloud Logging carries better-auth's own warning: **"Rate limiting could not determine a client IP and is
  falling back to a single shared per-path bucket"** (`NO_TRUSTED_IP_KEY`).
- Root cause: better-auth v1.7.2's built-in limiter defaults ON (in production) with a `/sign-in/*`
  special rule (`window:10s, max:3`, `dist/api/rate-limiter/index.mjs`), keyed by `getIP` reading
  `advanced.ipAddress.ipAddressHeaders: ["x-forwarded-for"]` (`apps/api/src/auth.ts:402`). Two paths
  conspire: (a) `beginAuth`'s `apiFetch` stamps `x-rhema-client-ip` + OIDC and deliberately omits XFF;
  (b) `authProxy` DOES relay the browser's XFF verbatim, but v1.7.2's `getIP` rejects multi-hop XFF chains
  when `trustedProxies` is unconfigured — and the GCP LB chain is multi-hop. Both resolve null →
  **one shared global bucket: 3 sign-in starts per 10 s across ALL users, on EVERY proxied auth path**.
  A 429 surfaces as the re-rendered login page — the reported symptom. (The `ipAddressHeaders` line was
  itself the 2026-09-22 fix for an earlier shared-bucket incident; it predates ADR-040 and silently
  regressed when the stamped channel landed.)
- Zero real `callback/google` hits in 14 days — no successful (or even attempted) OAuth return observed.
  Whether the user additionally hit a Google-side issue (consent-screen audience) cannot be ruled out from
  here; the callback leg + a real Google account sign-in are owed live legs.

## Contract

1. **Own the limiter deliberately.** better-auth's default limiter was never opted into or audited; the
   app's SEC.2 design (ADR-039/040: shared Redis store, `resolveClientIp` in `packages/contracts/src/
   client-ip.ts` — stamped `x-rhema-client-ip` trusted only behind a verified OIDC token, else penultimate
   XFF) is the reviewed control. In `apps/api/src/auth.ts`:
   - Disable the library limiter (`rateLimit: { enabled: false }`) with a comment naming this ticket and
     why XFF-keying is broken under ADR-040. Do NOT add `x-rhema-client-ip` to `ipAddressHeaders` —
     better-auth's `getIP` cannot verify the OIDC stamp, so listing it would let a direct api caller mint
     unlimited forged buckets. (`customRules` returning `false` exempts a path; `enabled:false` is the
     cleaner statement of intent here — confirm in `dist/api/rate-limiter/index.mjs` when editing.)
   - Correct the now-false comment at `auth.ts` ~398-401 ("both forward the original client in
     x-forwarded-for") — post-ADR-040 it no longer holds.
   - Cover `/sign-in/social` (+ `/sign-in/oauth2/*`) through the audited channel instead: in the existing
     `hooks.before` social branch — BEFORE the `!token`/`!verified` early-returns, so unstamped callers
     still key on penultimate XFF — resolve `authClientIp(ctx, admission.verifyInternalToken)` and run a
     shared-store throttle sized for real retries (e.g. 10/min/IP — a deliberate constant the worker
     names). Add it as a new `AuthAdmission` field (additive, optional) wired in `server.ts` at the
     throttle-construction site (~139-154) + the `admission:` object (~194-204).
   - Audit which other better-auth mutation paths are actually reachable (`emailAndPassword` is not
     enabled — no `/sign-in/email`, `/sign-up/email`, `change-*`; `/signup` is the app's own throttled
     route) — record the list in the run ledger. If any reachable mutation path would lose its only
     limit, keep a `customRules` entry for it rather than disabling wholesale.
   - Cross-ref note: the app-side `magicLinkThrottle` (20/IP·h, OIDC-keyed) is a different, intended
     control — the N8/N9 429s on `D-OBS.1-3` belong to it, not to this defect.
2. **Tests** (colocated, deterministic). IMPORTANT: `NODE_ENV=test` disables the library limiter by
   default, so behavior alone cannot prove the config — include a config assertion:
   - `auth.options.rateLimit?.enabled === false` on the built auth instance (precedent:
     `auth.test.ts` ~63-65 asserts `crossSubDomainCookies.enabled`);
   - rapid `sign-in/social` posts (>3/10s) with distinct stamped IPs → none 429 (guards the app channel's
     wiring, not the library's);
   - same-IP abuse still throttles via the app channel → 429 `rate_limited`;
   - an unstamped caller keys on penultimate XFF (trust model unchanged);
   - existing `auth.test.ts` stays green.
3. **Live legs owed (recorded, not run — no deploy this pass):** after the next deploy, 5 rapid
   `curl -X POST /login -d method=google` → all 302; full round-trip (real Google account → callback →
   `/app`) is a HUMAN/operator leg — append a DEFERRALS row (`D-MAINT.4-1`) carrying both.

## Out of scope

- Any deploy, prod write, or paid leg.
- Magic-link throttle tuning (a separate, intended control).
- Google consent-screen/console verification (HUMAN, rides D-MAINT.4-1's note).

## Verify

- `pnpm exec vitest run apps/api/src/auth.test.ts` (+ touched files) green.
- `pnpm turbo build lint typecheck` green on touched packages; `pnpm test` no new failures.
- `check-build-memory.sh` + `check-append-only.mjs --base <tip>` clean; run ledger + DEFERRALS row written.
