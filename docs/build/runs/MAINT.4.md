# MAINT.4 — OAuth sign-in throttle (run ledger)

- **Harness:** Devin CLI (subagent); model: SWE-2 High; tier: n/a (build work)
- **Skills:** agent-skills @ `5d24fd0`
- **Spec:** `docs/tickets/95_MAINT.4__oauth-signin-throttle.md` (manifest row 95, maintenance)
- **Base:** `stevevitali/maint-3-funded-window-repairs` @ `1fa46b3` (the chain tip)
- **Branch:** `stevevitali/maint-4-oauth-signin-throttle` (mergePolicy=OPERATOR — never merge)
- **Started:** 2026-10-07T15:52Z · **Closed:** 2026-10-07T16:55Z — **blocked** (inherited CI
  red: `integration`/`privsep.docker.test.ts` fails identically on base PR #116; see below)
- **Config:** code + deterministic tests only; **Live stage: none**; metered spend **$0**;
  zero prod writes, zero deploys

## Deferrals read

`docs/tickets/DEFERRALS.md` read at run start (AGENTS.md rule). No `OPEN`/`PARTIAL` row is
unblocked by this ticket — the closest neighbours are `D-OBS.1-3` (whose N8/N9 429s are the
app-side `magicLinkThrottle`, a different intended control the ticket names explicitly) and
`D-P0.01-3` (live sign-in legs; the real-Google-account round-trip rides this ticket's own
new row `D-MAINT.4-1`, operator/HUMAN).

## Requirements

1. `rateLimit: { enabled: false }` on `betterAuth()` in `apps/api/src/auth.ts`, with a
   comment naming this ticket + why XFF keying is broken under ADR-040. Do NOT add
   `x-rhema-client-ip` to `ipAddressHeaders` (forgeable — better-auth's `getIP` cannot
   verify the OIDC stamp). Confirmed in `dist/api/rate-limiter/index.mjs`:
   `ctx.rateLimit.enabled = options.rateLimit?.enabled ?? isProduction`;
   `customRules` resolving `false` exempts a path.
2. Correct the now-false comment at `auth.ts` ~398-401 ("both forward the original client
   in x-forwarded-for" — false post-ADR-040).
3. Cover `/sign-in/social` + `/sign-in/oauth2/*` through the audited channel: in the
   existing `hooks.before` social branch, BEFORE the `!token`/`!verified` early-returns,
   resolve `authClientIp(ctx, admission.verifyInternalToken)` and run a shared-store
   throttle (deliberate constant ~10/min/IP).
4. New additive optional `AuthAdmission` field wired in `server.ts` at the
   throttle-construction site + the `admission:` object, reusing
   `createSharedIpEmailThrottle`/`createFallbackIpEmailThrottle` over `throttleStore` with
   its own `keyPrefix` (`rl:oauth`).
5. Audit reachable better-auth mutation paths; record the list here; keep a `customRules`
   entry for any reachable mutation that would lose its only limit.
6. Tests: config assertion `auth.options.rateLimit?.enabled === false`; rapid distinct-IP
   stamped social posts >3/10s → none 429; same-IP abuse → 429 `rate_limited`; unstamped
   caller keys on penultimate XFF; existing auth.test.ts stays green.
7. Defer the live legs: `D-MAINT.4-1` (post-deploy rapid-POST 302 check + the
   operator/HUMAN real-Google-account round-trip).
8. Build memory: this ledger + BUILD_INDEX row (seq 123) + LEDGER advance +
   `check-build-memory.sh` + `check-append-only.mjs --base b51f80b` clean.

## Acceptance criteria

- AC1 (config): `rateLimit.enabled === false` on the built auth instance (vitest's
  `NODE_ENV=test` leaves the library limiter off, so behavior alone cannot prove config).
- AC2 (behavior): >3 posts per 10 s to `/api/auth/sign-in/social` stamped with distinct
  trusted IPs → all succeed (the library's old 3/10s global bucket is gone).
- AC3 (behavior): same-IP abuse → 429 `rate_limited` via the app channel.
- AC4 (trust model): an unstamped caller keys on the penultimate XFF hop.
- AC5 (no regression): existing `auth.test.ts` green; no reachable mutation path loses its
  only limiter without replacement (audit below).
- AC6 (cross-cutting): tenant isolation/RLS untouched; no secrets; TS only; `.js` on
  intra-package imports; colocated `*.test.ts`; `mergePolicy: OPERATOR`.

## Plan

- `auth.ts`: add `rateLimit: { enabled: false }` + ticket-naming comment; fix the stale
  `ipAddressHeaders` comment (it now serves session `ip_address` best-effort only);
  add `OAUTH_SIGNIN_THROTTLE_DEFAULTS` (perIp 10 / windowMs 60 s); add optional
  `signinThrottle` to `AuthAdmission`; run it at the TOP of the `hooks.before` social
  branch (before the token early-returns) via `authClientIp`.
- `server.ts`: construct `signinThrottle` beside `signupThrottle`/`magicLinkThrottle`
  (`createSharedIpEmailThrottle(throttleStore, …, keyPrefix: "rl:oauth")` wrapped in
  `createFallbackIpEmailThrottle`, `onDegraded: degraded("oauth-signin")`); wire into
  `admission:`.
- `auth.test.ts`: config assertion + three behavior tests.
- Build-memory close per 6.5.

## Test matrix

| AC | Test | File |
|---|---|---|
| AC1 | `auth.options.rateLimit?.enabled === false` | auth.test.ts |
| AC2 | 4+ rapid `sign-in/social` posts over distinct stamped IPs → all 200 | auth.test.ts |
| AC3 | same stamped IP over perIp → 429 `rate_limited` | auth.test.ts |
| AC4 | unstamped XFF chains sharing the penultimate hop share a bucket → 429 | auth.test.ts |
| AC5 | existing 17 tests unchanged | auth.test.ts |

## Reachable-mutation-path audit (contract item 1, last bullet)

Config: `google` social provider + `magicLink` plugin; `emailAndPassword` NOT enabled (no
`/sign-in/email`, `/sign-up/email`, `/reset-password*`, `/request-password-reset`,
`/verify-password`, `/change-password`); `user.deleteUser` / `user.changeEmail` /
`emailVerification.sendVerificationEmail` unset (`/delete-user`, `/change-email`,
`/send-verification-email` throw "not enabled" before any mutation — config-dead). Audited
against `better-auth@1.7.2` `dist/api/routes/*.mjs` + `plugins/magic-link`.

| Path | Mutation | Built-in rule that covered it | Limit after this change |
|---|---|---|---|
| `POST /sign-in/social` | OAuth initiation (state row) | special `/sign-in*` 3/10s | **app `signinThrottle` 10/min/IP (this ticket)** |
| `POST /sign-in/oauth2/*` | generic-OAuth initiation (not mounted — defensive regex) | special `/sign-in*` 3/10s | **app `signinThrottle` (same hook branch)** |
| `POST /sign-in/magic-link` | email enqueue | special `/sign-in*` 3/10s | app `magicLinkThrottle` (existing hooks.before) |
| `GET /magic-link/verify` | session + first-time user create | default 100/10s | token single-use; user-create leg bound by `accountThrottle` |
| `GET /callback/google` | session + first-time user create | default 100/10s | Google token exchange bounds the leg; user-create bound by `accountThrottle` |
| `POST /link-social`, `/unlink-account` | account rows | default 100/10s | session-authenticated only; no unauthenticated abuse path |
| `POST /sign-out`, `/revoke-session(s)`, `/revoke-other-sessions` | session rows | default 100/10s | session-authenticated only |
| `POST /update-user`, `/update-session`, `/refresh-token`, `/get-access-token` | user/session rows | default 100/10s | session-authenticated only |

Reads (`/get-session`, `/list-*`, `/account-info`, `/ok`, `/error`, `/verify-email`) carry
no mutation.

**Verdict:** no reachable mutation loses its *only* limiter — every unauthenticated
creation path keeps an app-channel limit, and the session-authenticated mutations never had
a usable per-user limiter anyway (the prod bucket was one global `no-trusted-ip` shared
across all users). `enabled:false` (not a `customRules` exemption) is therefore the
faithful contract implementation; no `customRules` needed.

## Progress

- [x] 0.x — branch cut at `1fa46b3`; ledger seeded; library internals confirmed
      (`enabled ?? isProduction`; `customRules→false` exempts; multi-hop XFF → null IP →
      `no-trusted-ip` global bucket).
- [x] 1.x — baseline `auth.test.ts` 17/17 green on base.
- [x] 2.x — implemented: `rateLimit.enabled:false` + comment; stale `ipAddressHeaders`
      comment corrected; `signinThrottle` in `AuthAdmission` + hooks.before social branch
      (before the early-returns); `OAUTH_SIGNIN_THROTTLE_DEFAULTS` (10/min/IP); server.ts
      construction + wiring on `rl:oauth`; 4 new tests. **Self-review caught:** a
      `prettier --write` reflowed the whole files (repo is not prettier-gated — lines
      >100 everywhere); reverted and re-applied so the diff stays surgical.
- [x] 3.x — self-review: typecheck + lint clean; only `server.ts` constructs `createAuth`
      (seam fully wired); the double OIDC verify per social request (throttle +
      promotion) is inherent to the contract's ordering and cheap (JWKS-cached).

## Gap table

| item (spec §) | required layer | achieved layer | status | evidence |
|---|---|---|---|---|
| `rateLimit: { enabled: false }` + ticket-naming comment | engineered | engineered | met | `apps/api/src/auth.ts` `rateLimit:` block (~L418-434); lib confirmed `enabled ?? isProduction` |
| Do NOT add `x-rhema-client-ip` to `ipAddressHeaders` | engineered | engineered | met | `auth.ts` `advanced.ipAddress` = `["x-forwarded-for"]` only |
| Stale ~398-401 comment corrected | engineered | engineered | met | new comment at `advanced.ipAddress` (~L445-452) |
| `hooks.before` social branch: `authClientIp` throttle BEFORE `!token`/`!verified` early-returns | engineered | engineered | met | `auth.ts` ~L343-349; test "unstamped caller keys on penultimate XFF" |
| New optional `AuthAdmission` field wired in `server.ts` (construction + `admission:`) | engineered | engineered | met | `auth.ts` `signinThrottle?` (~L82-89); `server.ts` ~L165-170 construction, `admission.signinThrottle` |
| Shared-store, own keyPrefix, deliberate ~10/min constant | engineered | engineered | met | `OAUTH_SIGNIN_THROTTLE_DEFAULTS` (10/60s); `keyPrefix: "rl:oauth"` + `createFallbackIpEmailThrottle` |
| Reachable-mutation audit recorded; `customRules` kept only if needed | engineered | engineered | met | audit table above — verdict: none needed |
| AC1 config assertion | engineered | fixture-verified | met | `auth.test.ts` "the built-in rate limiter is disabled" |
| AC2 distinct-IP rapid posts no 429 | engineered | fixture-verified | met | `auth.test.ts` "rapid starts from distinct stamped IPs" |
| AC3 same-IP 429 `rate_limited` | engineered | fixture-verified | met | `auth.test.ts` "same-IP abuse still throttles" |
| AC4 unstamped → penultimate XFF | engineered | fixture-verified | met | `auth.test.ts` "an unstamped caller keys on the penultimate XFF hop" |
| Existing auth.test.ts green | engineered | fixture-verified | met | 21/21 |
| Live legs (5× POST→302; real Google round-trip) | live-executed | engineered | met-engineered(D-MAINT.4-1) | owed on D-MAINT.4-1 (no deploy this pass, $0) |
| Out-of-scope honored | engineered | engineered | met | no deploys/prod writes/paid legs; no magic-link tuning; no consent-console work |
| Cross-cutting invariants | engineered | engineered | met | no RLS/tenancy touch; no secrets; TS only; `.js` imports; colocated test; OPERATOR |

## Evidence log

- `pnpm exec vitest run apps/api/src/auth.test.ts` — **21/21** (baseline 17 + 4 new).
- `pnpm turbo build lint typecheck` — **135/135 tasks** (74 cached).
- `pnpm test` — **Test Files 448 passed | 1 skipped; Tests 4,572 passed | 4 skipped**
  (baseline 4,567 — no new failures; +4 this ticket's, +1 conditional delta).
- `git diff --check` — clean. Diff: `auth.ts +59/-8`, `server.ts +21/-4`,
  `auth.test.ts +67`, `runs/MAINT.4.md` new.
- Library internals read at the pinned version
  (`better-auth@1.7.2`): `dist/context/create-context.mjs` `enabled ?? isProduction`;
  `dist/api/rate-limiter/index.mjs` `NO_TRUSTED_IP_KEY` shared-bucket path + special
  `/sign-in*` 10s/3 rule + `customRules→false` exemption;
  `@better-auth/core/dist/utils/ip.mjs` multi-hop XFF → `null` without `trustedProxies`.
- prettier note: repo is NOT prettier-gated (`pnpm format` unused by CI; long lines
  everywhere); a whole-file `--write` was reverted — diff kept surgical.
- Live verification: **none run** — $0 constraint; no deploy exists carrying this code.
  Owed legs recorded on `D-MAINT.4-1`.

## Evidence report

All contract items met with evidence (gap table above). The two live legs are
`met-engineered(D-MAINT.4-1)` — the post-deploy rapid-POST 302 smoke and the
operator/HUMAN real-Google round-trip. No deviations; no ADRs (the contract specified the
design). CI read on the pushed head below.

ci: fail #117@9ce64cc (integration run 37649414207 — `privsep.docker.test.ts`
  `setpriv: setresgid failed`/`mount: bind failed` inside the GH-runner container; typecheck
  / lint / unit PASS 37m14s, contracts PASS, public-safe PASS, images pending at read).
  **Inherited from base:** `ci-boundary --pr 116 --no-wait` → the same check fails on the
  base head (run 37647411487, same test, same error); MAINT.4 touches `apps/api` auth
  wiring only and the test passes locally → the inherited-red rule applied: `blockedOn:
  CI fail on #117 (integration)`, PHASE LOG `blocked` entry, no BUILD_INDEX row, no
  `lastCompleted`/`nextTicket`/`chainTip` advance. Boundary record:
  `docs/build/logs/ci-MAINT.4.json` (gitignored subtree).

---

### 2026-10-07 — GD-MAINT.4-1 waiver applied (append)

Operator waived the inherited `integration`/privsep red verbatim
("Waive the privsep leg") — GATE DECISIONS row `GD-MAINT.4-1`. The check fails
identically on base #116 (run 37647411487) and locally; the worker's blocked
disposition is superseded by the waiver: ticket closes done-under-waiver,
`lastCompleted`/`chainTip` advanced, BUILD_INDEX row 123 added. The waiver
scopes to the privsep leg only; every other CI check still gates. Live legs
(`D-MAINT.4-1`) remain owed to a deploy + operator real-Google round-trip.
