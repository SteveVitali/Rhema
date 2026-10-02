# SEC.2 — run ledger (signup admission on every path + a throttle shared across instances)

## Spec / Base / Branch / Config
- Spec: `docs/tickets/69_SEC.2__signup-admission-and-throttle.md` (chain row 69; §15.3, §14.3, §13.3;
  REQ-BETA-19 note primary, REQ-GROWTH-15 throttle half, REQ-BETA-14 invite machinery, REQ-ARCH-30;
  absorbs BL-23 = D-PRB.13-1 + D-PRB.01-1 residual + ADR-009's per-instance clause, PR-U1 form half).
- Base: `stevevitali/rpt-1-live-meter-and-run-report` @ `5eeb392` (append-only check base).
- Branch: `stevevitali/sec-2-signup-admission-throttle`. Stacked PR, mergePolicy=OPERATOR, never merge.
- **Harness:** Devin CLI (Cognition agentic coding CLI), Anthropic Claude.
- **Skills:** `5d24fd0` (implement-spec full rigor).
- **Started:** 2026-10-02T16:20Z
- Gate answers (operator, pre-dispatch): no pre-dispatch gate; prod `signup.mode` stays `open` (never
  flipped by this ticket); prod deploy pre-authorized if `pulumi preview` shows no stateful
  replace/delete, migrations additive, monthly delta ≤$15; Stage B write-free and $0-metered;
  magic-link legs target only `test@rhema.tools` (H7); real invite mint is a one-off prod write,
  operator-paused → a `D-SEC.2-n` row if not performed.
- Spend: Stage A $0. Stage B: deploy + write-free legs only (empty-email `/signup` calls never create
  rows; bogus-invite leg refuses before any write; magic-link sends go to the test mailbox only).

## Deferrals read
- `D-PRB.13-1` (OPEN): the shared/multi-instance throttle this ticket lands — annotate + flip DONE
  on live cross-instance evidence.
- `D-PRB.01-1` (PARTIAL): the live invite-enforcement residual — the binding now lands in code; the
  real-invite live consume is operator-paused → annotate, carry the residual forward as `D-SEC.2-n`.
- `D-PRB.13-2` (DONE): the Better Auth `user.create` binding note — dated annotation required
  regardless (the OAuth admission binding lands here).

## Context map
- Throttle seam: `packages/contracts/src/rate-limit.ts` — `IpEmailThrottle.attempt` sync over an
  in-process `Map` (anchored fixed window per key, `ip:`/`em:` dimensions). Isomorphic `sha256.ts`
  exists for hashing (no `node:crypto` — contracts ships to browser bundles).
- API signup: `apps/api/src/signup.ts` — `POST /signup` → `throttle.attempt(clientIp(c), email)` at
  ~317 BEFORE `admitSignup`; `clientIp` reads the FIRST `x-forwarded-for` hop (caller-controlled).
  `admitSignup` (mode gate → invite check → user insert → consume at creation →
  `provisionPersonalAccount`) is the single admission rule. `SIGNUP_THROTTLE_DEFAULTS` 10/IP + 5/em.
- API wiring: `apps/api/src/index.ts` — `BetaApiDeps{db, signupMode, signupThrottle, auth, …}`;
  `createApp` mounts `deps.auth` handler at `/api/auth/*` (~300) and, inside `if (deps.db)`, the
  signup routes + `createInviteGate` (~417). `deps.auth.handler` is the whole BA surface.
- Better Auth: `apps/api/src/auth.ts` — `databaseHooks.user.create.after` → `onUserCreate` →
  `provisionPersonalAccount` unconditionally (no mode/invite check). BA `create.before` supports
  `false`/`throw` to refuse (verified in `db/with-hooks.mjs`: `result === false ⇒ return null`).
  BA's own magic-link plugin rate-limits `sign-in/magic-link`+`verify` 5/60s per IP keyed on the
  first XFF hop (`ipAddressHeaders`) — in-memory, spoofable; our guard is the authoritative one.
  `after` hooks run via `queueAfterTransactionHook` (post-commit — cannot roll back a create).
- API deploy: `apps/api/src/server.ts` — `new Redis(env.redisUrl)` already exists (59); `onUserCreate`
  wired ~148; `env.ts` parses `SIGNUP_MODE` etc.; `API_PUBLIC_URL` is prod-only (domains exist).
- Invite gate: `apps/api/src/invite.ts` — `check(code, email?)` (email-bound invite + missing email ⇒
  `email_mismatch`); `consume` is one atomic CTE (redemption insert + `used_count` claim, idempotent
  per (code,user)).
- Web: `apps/web/src/server.ts` — `MAGIC_LINK_THROTTLE_DEFAULTS` 20/IP+4/em; `clientIp` first-XFF;
  throttle calls at 1394/1483 before `dataSource.signup` + `beginAuth`; pre-gates for invite mode.
  `apps/web/src/data.ts` — `signup(req)` creates an apiClient with NO client-IP forwarding (the
  bucket-collapse hypothesis). `recordLandingEvent` forwards `x-forwarded-for` (analytics dedupe only).
  `apps/web/src/main.ts` — `apiFetch` forwards cookie + `x-forwarded-for:clientIp`; `authProxy`
  relays the browser request verbatim (its XFF passes through untouched = forgeable at the api);
  `beginAuth` POSTs `sign-in/social` + `sign-in/magic-link` server-side.
- Forms: `marketing.tsx:469-492` (signup form — code first) + `pages.tsx:339-361` (login form — code
  first); copy in `copy.ts` (`login.codeLabel[Optional]`, `signup.*`); `<details>` pattern already in
  use (FAQ). N2 step: `packages/journeys/src/steps.ts:121` asserts first `input:visible` is `email`;
  registry `N2.invite` expected `red`, owner SEC.2.
- Infra: `infra/pulumi/compute.ts` — web `INGRESS_TRAFFIC_ALL`, api `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER`
  (LB + VPC only); `API_BASE_URL=apiOrigin` on web (prod only); `API_PUBLIC_URL` on api (prod only);
  secrets via `createSecrets`/`ALL_SECRET_IDS`; `security-checks` sweep forbids ANY secretKeyRef env
  on web (REQ-ARCH-30 — the trusted channel therefore cannot be a shared secret on web).
- GCP semantics: external HTTPS LB appends `<client>,<lb>` to XFF ⇒ the PENULTIMATE hop is the
  LB-attested client; run.app direct hits append only `<client>` ⇒ penultimate is caller-controlled
  ⇒ web must be LB-only on prod for the derivation to hold. `fetchGceMetadataIdToken` already mints
  OIDC ID tokens (live-clients) — service identity is ambient, needs no secret on web.

## Design (ticket-owned decisions → ADR-039/040/041)
1. **Shared throttle store (ADR-039):** `IpEmailThrottle.attempt` → `Promise<ThrottleVerdict>`; a
   `ThrottleStore` seam (`incrWithTtl(key, windowMs) → {count, ttlMs}`, one Lua `EVAL` = INCR +
   conditional PEXPIRE + PTTL over SHA-256-hashed keys — contracts' isomorphic sha256). Impls:
   `createIpEmailThrottle` (in-memory, kept for tests + degraded path), `createSharedIpEmailThrottle`
   (over any ThrottleStore), `createMemoryThrottleStore` (deterministic shared-store fake),
   `createRedisThrottleStore` (ioredis, in apps/api — contracts stays dep-free). Redis error ⇒
   `createFallbackIpEmailThrottle` fails over to a per-instance in-memory limiter — never unlimited,
   never fail-closed; `onDegraded` logs ONCE per process with no email/IP. Same limits + Retry-After.
2. **Trusted client-IP channel (ADR-040):** `x-rhema-client-ip` + `x-rhema-internal-token` headers.
   Web mints a Google-signed OIDC ID token (metadata server, `audience` = `INTERNAL_AUTH_AUDIENCE`
   = the api origin, cached to exp−60s; negative-cached 60s when the metadata server is absent;
   2s mint timeout — `apps/web/src/internal-token.ts`) and stamps the derived client IP.
   The api verifies the JWT offline (JWKS, iss accounts.google.com, aud = `INTERNAL_AUTH_AUDIENCE`,
   `email` = the web SA — `INTERNAL_CALLER_SA` env, non-secret config) and trusts the stamped IP ONLY
   on a verified token; otherwise it falls back to the PENULTIMATE XFF hop (the LB-appended client).
   No secret reaches web (REQ-ARCH-30 sweep untouched); a forged header without a valid token is
   ignored; the token is audience+expiry-bound. Prod web ingress tightens to
   `INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` so the derivation's premise (LB-appended hop) is true for
   every request web serves; api already is. `x-forwarded-for` is still set (truthful first hop) for
   BA's own logging/limiter.
3. **Web-side limiter retired (ADR-041):** `magicLinkThrottle` leaves `apps/web` — a per-instance
   copy cannot count shared state and would double-charge attempts. The api is the authority at BOTH
   surfaces: `POST /signup` (10/IP, 5/em, 1h — unchanged) and the auth-send guards (20/IP, 4/em, 1h —
   the web's retired limits, now enforced where the send happens). Web maps an upstream 429 to the
   existing `errorRateLimited` copy.
4. **One admission rule on every creation path:** the magic-link SEND runs the same admission
   (`hooks.before` — a direct `POST /api/auth/sign-in/magic-link` in invite mode w/o a valid code ⇒
   403 `invite_required` + no email enqueued; a valid code is CHECKED at send and CONSUMED at
   creation by `user.create.after`; a provisioned email bypasses = returning users re-login freely).
   The invite code's channel is **`rhema_ic`** (`INVITE_CODE_PARAM`, contracts): the web stamps it on
   the auth `callbackURL` query param; the OAuth initiation (`sign-in/social` / `sign-in/oauth2/*`)
   promotes it into the state's TRUSTED `serverContext` ONLY behind the verified internal token —
   client-supplied `additionalData.rhema_ic` is still read as fallback but every code is gate-
   VALIDATED regardless of channel, so forging the transport buys nothing. `user.create.before`
   throttles + refuses a NEW email in invite mode without a valid code (throws a named `APIError` —
   no `user` row, no 500); `user.create.after` consumes + provisions (`onUserCreate`). A
   returning-user OAuth sign-in links accounts — no `user.create` fires. Magic-link/OAuth refusals
   redirect to the app's `/login?error=<code>` (`errorCallbackURL`) — never a bare `/app` guard
   swallow or a 500.
5. **Form order (PR-U1):** open mode ⇒ email input first, invite code behind a native
   `<details><summary>Have an invitation code?</summary>` (auto-opens when a code value/error is
   present); invite mode unchanged (code first, required, visible). Same for `/signup` + `/login`.
6. **Live evidence:** `x-rhema-instance` response header (metadata `instance/id`, once at boot) on
   `/signup` + auth-guard responses so the cross-instance 400→429 leg records real instance ids.

## Requirements (spec §In scope)
- R1 admission on every path (web pre-gate, api /signup, BA user.create/OAuth, magic-link send)
- R2 shared Redis throttle, async signature, INCR+PEXPIRE, same limits+Retry-After, in-memory kept
- R3 throttle where the send happens; web limiter kept-or-retired → ADR
- R4 unspoofable client IP (penultimate hop + trusted channel + forge fixture)
- R5 form order + disclosure + a11y (N2 form half)
- R6 ADR-009 superseded; D-PRB.13-1/D-PRB.01-1 annotated + flipped when live legs pass
- Inv: #1 no banned vocab; #10 hashed/truncated ids in keys+logs; #12 N2 walked live + provenance;
  #13 admission writes on user-serving pool; REQ-ARCH-30 no secrets in repo/ledger/web env.

## Acceptance criteria (spec)
- AC1 invite mode on each path: missing/invalid code ⇒ no user/workspaces/billing row + no email;
  valid code ⇒ used_count++ + redemption row (deterministic).
- AC2 open mode: no code ⇒ admit; bogus code ⇒ 400/403 named reason + no account (deterministic).
- AC3 two throttle instances over one shared store trip at perIp+1 combined; removing the store
  fails the test (deterministic).
- AC4 forged first-hop XFF doesn't change the key; two web client IPs → two buckets (deterministic).
- AC5 direct POST /api/auth/sign-in/magic-link beyond per-email limit ⇒ 429 + no email (deterministic
  + live test-mailbox).
- AC6 Redis outage ⇒ per-instance fallback, log once, no email/IP in the line (deterministic).
- AC7 live prod (open mode), write-free: perIp+1 empty-email /signup ⇒ 400s then 429 across ≥2
  instances (ids recorded); bogus invite ⇒ loud failure + no account (live, $0).
- AC8 N2 form half green on deployed stage via the harness; expected-red flipped; screenshots
  committed (live, $0).
- AC9 universal gate: verification green, tests-fail-if-removed, REQ ids stamped, unverifiable ⇒
  DEFERRALS row, ADRs for owned decisions, BUILD_INDEX row + LEDGER advance.

## Test matrix
- contracts `rate-limit.test.ts` (new): shared store two instances share the count; store removal
  (two independent memory stores) does NOT trip at perIp+1 (the "fails without it" witness);
  pexpire/ttl → retryAfterSec; hashed keys carry no raw email/ip; fallback wrapper → in-memory on
  store throw, logs once, still enforces; in-memory impl keeps identical verdicts (async now).
- contracts `signup.test.ts`: existing throttle asserts await'd (async signature).
- api `client-ip.test.ts` (new): penultimate rule; trusted header ignored w/o valid token; trusted
  header honored with a verified token; forged first hop doesn't move the bucket.
- api `signup.test.ts`: forged XFF bucket-key pin; two distinct trusted IPs → independent buckets;
  `x-rhema-instance` header present when dep set.
- api `auth-guard.test.ts` (new, PGlite): invite-mode send w/o code ⇒ 403 invite_required, spy auth
  handler never called; invalid code ⇒ 403 named reason, no send; valid code ⇒ 200-ish + account rows
  + used_count=1 + redemption; open-mode no code ⇒ send + account; per-email limit ⇒ 429 + spy not
  called; social init: IP-throttle 429; bad code ⇒ 403; valid code ⇒ rhema_invite cookie set.
- api `auth-admission.test.ts` (new, PGlite): user.create.before — invite mode no cookie ⇒ throws /
  refuses; valid cookie ⇒ allows; open mode no cookie ⇒ allows; bad cookie ⇒ refuses; provisioned
  email ⇒ allows regardless. after-hook consumes the cookie code + provisions.
- web `server.test.ts`: retired-limiter propagation (api signup 429 ⇒ 429 render; beginAuth failure ⇒
  429 render); form-order asserts (open: email precedes code, code inside details; invite: code
  required+visible); no `magicLinkThrottle` dep.
- web `internal-token.test.ts` (new): caches to exp−skew; negative-caches 60s on failure; timeout-safe.
- journeys: N2_INVITE extended — both forms, first visible input = email, code behind `details`,
  focus order; registry flip; screenshots.
- infra `compute.test.ts`: prod web ingress = internal/LB; api env carries INTERNAL_CALLER_EMAIL; no
  new web env.

## Progress
- Phase 0 done: DEFERRALS read first; branch from 5eeb392; baseline green (28 pkgs build, 130 tests).
- Phase 1 done: context map + design + matrix above.
- Phase 2 done (implementation): contracts (`rate-limit.ts` async + `ThrottleStore` + shared/memory/
  Redis impls + fallback wrapper; `client-ip.ts` penultimate-XFF + verified-stamp resolve; `INVITE_CODE_PARAM`
  export); api (`gcp-oidc.ts` JWKS verifier, `auth.ts` `user.create.before/after` + `hooks.before`
  send gate + OAuth `serverContext` promotion + `errorCallbackURL`, `signup.ts` trusted clientIp +
  async throttle, `index.ts` `verifyInternalToken`/`instanceId` deps + `x-rhema-instance` header,
  `server.ts` Redis throttles + OIDC wiring + metadata instance id, `env.ts` INTERNAL_* vars);
  web (`internal-token.ts` minter — exp−60s cache, 60s negative cache, 2s timeout; `main.ts` stamp +
  strip/re-stamp proxy; `data.ts` clientIp transport stripped from the body; `server.ts` web limiter
  retired + api-429/`?error=` mapping; `pages.tsx`/`marketing.tsx`/`copy.ts` email-first + disclosure
  + mapped copy); api-client (`signup` init.headers); infra (`compute.ts` INTERNAL_* envs + prod web
  LB-only ingress); journeys (`steps.ts` N2.invite now walks `/signup` + `/login`, open⇒email-first
  + code inside `<details>`, invite⇒code required/visible/first).
- Phase 3 done (self-review + gap analysis): full diffs read; found + fixed — (a) `mintInternalToken`
  lacked the promised exp-cache/negative-cache/timeout → extracted to `internal-token.ts` + 7 tests;
  (b) journey step silently passed on a missing field / never asserted the invite-mode half → now
  throws on missing + asserts required/visible/first; (c) RPT.1's registry flip left
  `registry.test.ts`'s green-baseline assertion stale (base-branch failure) → baseline list updated;
  (d) ADR-039 wording corrected to match the sticky-for-life degraded posture in code.

## Gap table
| AC | Where proven | Status |
|---|---|---|
| AC1 invite mode each path | `signup.test.ts` (POST /signup: no code ⇒ 403 no rows; invalid ⇒ named 403; valid ⇒ consume+redemption); `auth.test.ts` (send gate 403 + nothing enqueued; verify `create.before` refuse ⇒ no user/provision; valid code ⇒ consume at create); web `server.test.ts` (pre-gate ⇒ no auth request) | deterministic ✅ / live invite consume = D-SEC.2-1 (operator-paused write) |
| AC2 open mode | `signup.test.ts` (no code ⇒ created; bogus ⇒ named 403 + no rows; supplied valid code still consumed); `auth.test.ts` verify-leg bogus code ⇒ refuse | ✅ deterministic |
| AC3 shared store | `rate-limit.test.ts` — two instances over ONE MemoryThrottleStore trip at perIp+1 combined; two stores reproduce the hole (the removal witness); Redis impl pinned via a fake `eval` client asserting the Lua call shape | ✅ deterministic; live cross-instance leg = AC7 |
| AC4 forged XFF | `client-ip.test.ts` (penultimate rule; stamped ignored w/o token; honored w/ verified); `signup.test.ts` (rotating forged first hop ⇒ same bucket; forged stamp ignored) | ✅ deterministic |
| AC5 direct magic-link 429 | `auth.test.ts` — over per-email ⇒ 429 + spy `sendMagicLink` never called; over per-IP same | ✅ deterministic; live leg = AC7 |
| AC6 Redis outage | `rate-limit.test.ts` — store throw ⇒ fallback enforces, `onDegraded` once, log line carries no email/IP; sticky degrade doesn't reset the window | ✅ deterministic |
| AC7 live prod leg | `x-rhema-instance` header machinery + tests landed; awaiting Stage B deploy | ⏳ Stage B |
| AC8 N2 form half | `steps.ts` extended to both forms; `server.test.ts` DOM-order pins (email first, code in `<details>`; invite-mode required/first/bare); registry still `red` pending live run | ⏳ Stage B |
| AC9 universal gate | ADR-039/040/041 written + index regenerated; DEFERRALS annotated (D-PRB.13-1/-2, D-PRB.01-1) + D-SEC.2-1 added; LEDGER/BUILD_INDEX/PR body pending at commit | ⏳ at close |

## Evidence log
- baseline: `pnpm turbo build` 28/28 ok; `vitest` signup+auth+invite+showcase+web.server+contracts.signup
  = 130 pass.
- `pnpm turbo build lint` (api, web, contracts, api-client, live-clients, journeys + deps): 34/34.
- Full suites: api+contracts+api-client **66 files / 726 tests green**; web **30 files / 421 green**
  (incl. 7 new `internal-token.test.ts` + 4 new form-order pins); journeys **6 files / 29 green**;
  infra `compute.test.ts` 7 + `stages.test.ts` 19 + live-clients 57 green.
- Pre-existing base failure fixed: `registry.test.ts` green baseline missed R6's RPT.1 flip.

## Evidence report
(Stage B — pending deploy)
