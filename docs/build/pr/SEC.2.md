# SEC.2 — Signup admission enforced on every path, and a throttle shared across instances

`signup.mode` now binds **every** account-creation path — `POST /signup`, Better Auth's
`user.create.before` (magic-link verify **and** the OAuth callback), and the magic-link **send**
itself — so no path mints a user/workspace/billing row or enqueues an email without clearing the
same admission rule. The signup and magic-link throttles count in **one shared Redis store**
(atomic INCR+PEXPIRE Lua, SHA-256-hashed keys) across all Cloud Run instances — D-PRB.13-1's
per-instance hole closed — and degrade on a Redis outage to finite per-instance limits: never
unlimited, never fail-closed (ADR-039). The throttle bucket keys on the **LB-attested penultimate
XFF hop**, or the web's `x-rhema-client-ip` stamp behind a **verified Google OIDC token** minted
ambiently from the metadata server — no secret ever reaches web (ADR-040); a forged first hop
provably cannot move the bucket. The web's per-instance limiter is retired — the api is the single
authority and web maps its refusals to copy (ADR-041). Open-mode forms put **email first** with the
invitation code behind a "Have an invitation code?" disclosure on both `/signup` and `/login`
(PR-U1 half).

Ticket: `docs/tickets/69_SEC.2__signup-admission-and-throttle.md` (chain row 69, round 3).
Base: `stevevitali/rpt-1-live-meter-and-run-report` @ `5eeb392` (stacks on the RPT.1 tip).
Merge policy: **OPERATOR — do not merge.**
ADRs: **ADR-039** (shared store + the finite outage fallback), **ADR-040** (the OIDC-stamped
trusted client-IP channel), **ADR-041** (the api is the throttle authority; the web limiter is
retired).
Requirement ids: **REQ-BETA-19** (primary), **REQ-GROWTH-15** (throttle half), **REQ-BETA-14**
(invite machinery), **REQ-ARCH-30** (no secret on web). Absorbs **BL-23** = D-PRB.13-1 +
D-PRB.01-1 residual + ADR-009's per-instance clause (superseded by ADR-039) + the **PR-U1** form
half.
Deferrals: **D-PRB.13-1** annotated (code landed; flips DONE with live cross-instance evidence);
**D-PRB.13-2** annotated (the OAuth `user.create` admission binding it deferred is now landed);
**D-PRB.01-1** annotated (binding on every path; the real-invite prod consume carries forward as
**D-SEC.2-1** — a one-off prod write, operator-paused).

## The defects

- **Admission was uneven.** `POST /signup` enforced `signup.mode`, but a direct
  `POST /api/auth/sign-in/magic-link` could enqueue mail for an unadmitted email, and the
  Better Auth `user.create` paths (magic-link verify, OAuth callback) ran `onUserCreate` with no
  mode/invite check at all — an invite-mode deployment was bypassable by anyone who skipped the web
  form.
- **The throttle was per-instance.** N Cloud Run instances gave a rotating attacker N× the window
  (D-PRB.13-1, the accepted ADR-009 beta trade SEC.2 retires).
- **The bucket key was caller-controlled.** `clientIp` read the *first* `x-forwarded-for` hop — a
  forged first hop reset the bucket per request.
- **Web-mediated callers collapsed into one bucket** — `POST /signup` and the auth sends arrive at
  the api from web's egress; without a trusted channel the real client IP never reached the
  counter.
- **The invite field led the forms** even in open mode (the self-serve path asks for an invite code
  first — backwards), and Better Auth refusals could land on `/app?error=` where the session guard
  hid them.

## What changed

**One admission rule (REQ-BETA-19).** `admitSignup`'s semantics now guard every path:
`user.create.before` throttles (the shared account throttle) then enforces mode + invite `check`
before the row exists — a refusal throws a named `APIError` (`invite_required`, an invite rejection
reason, `rate_limited`) that magic-link verify maps to `?error=` and OAuth maps through `errorURL`,
so no `user`/`workspaces`/`billing_accounts` row is ever left behind and nothing ever 500s.
`user.create.after` consumes the code **at creation** (the PRB.01 invariant) then provisions
(`onUserCreate`). `hooks.before` gates the magic-link SEND: shared throttle first, then, for a
never-seen email, the mode/invite check — invite mode without a valid code ⇒ 403, no email
enqueued. A returning account bypasses re-gating on every path (`knownUser`/`created:false` — an
exhausted single-use code can't lock out a re-login). The invite code travels as `rhema_ic` on the
`callbackURL`; on OAuth initiation the api promotes it into the state's trusted `serverContext`
**only** behind the verified web stamp — client-supplied channels are still read but every code is
gate-validated, so forging the transport buys nothing.

**Shared throttle (ADR-039).** `IpEmailThrottle.attempt` is now async over a `ThrottleStore` seam
(`incrWithTtl` — one Lua `EVAL` = INCR + conditional PEXPIRE + PTTL over `rl:signup:`/`rl:magiclink:`
prefixed SHA-256 keys; raw IPs/emails never reach a key or a log line). Redis down ⇒
`createFallbackIpEmailThrottle` sticks to a per-instance in-memory limiter (same limits) for the
process life and logs once per instance with the error kind only. Better Auth's own plugin limiter
stays on underneath as a second layer; the app limiter is the authority.

**Trusted client IP (ADR-040).** `resolveClientIp`: stamped `x-rhema-client-ip` wins only with a
verified `x-rhema-internal-token` (RS256 vs Google's JWKS, iss/aud/exp/`email`-pinned to the web SA
— `createGcpOidcVerifier`, dependency-free); else the penultimate XFF hop. Web mints the token from
the metadata server (`internal-token.ts`: cached to exp−60s, negative-cached 60s, 2s timeout — a
metadata problem never stalls a request) and `authProxy` **strips** inbound internal headers before
re-stamping the resolved IP itself. Prod web ingress tightens to
`INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` so the penultimate-hop premise is infrastructural.
`x-rhema-instance` stamps the serving instance id (metadata `instance/id`, boot-UUID fallback) for
the Stage-B cross-instance leg.

**Retired web limiter + honest errors (ADR-041).** Web no longer counts sends; api 429/`rate_limited`
and the named admission codes map to stable copy, including `GET /login?error=<code>` for the
verify/OAuth redirect legs (`errorCallbackURL` = `/login`, not `/app`). `clientIp` rides the api
call's headers, never the serialized body.

**Form order (PR-U1).** Open mode: email input first, invitation code inside a closed
`<details><summary>` on `/signup` and `/login` (auto-opens when a code value re-renders). Invite
mode unchanged: code first, required, bare.

## Tests (all deterministic unless noted)

- `rate-limit.test.ts` — shared store trips at `perIp+1` combined across two instances; removing
  the shared store reproduces the hole (the removal witness); hashed keys; fallback logs once with
  no identifiers and stays sticky; Redis impl pins the atomic Lua call shape.
- `client-ip.test.ts` — penultimate rule; stamped IP ignored without/forged token; honored when the
  token verifies; verifier failure degrades, never throws.
- `signup.test.ts` — invite/open modes (no rows on refusal, consume-at-creation, idempotent
  re-post, exhausted-code re-login bypass); forged-XFF bucket pin; `x-rhema-instance` present/absent.
- `auth.test.ts` — send gate: over-limit 429 with `sendMagicLink` never called; invite-mode send
  without a code ⇒ 403; verify leg: `create.before` refuses (no rows, no provisioning), valid code
  consumes at creation, account throttle binds the verify leg; OAuth `serverContext` promotion only
  behind the verified stamp.
- `internal-token.test.ts` — exp−60s cache, 60s negative cache, timeout-safe, zero fetches without
  an audience.
- `server.test.ts` (web) — retired-limiter propagation (api 429 ⇒ 429 copy; `?error=` mapping);
  DOM-order pins on both forms.
- `compute.test.ts` — prod web ingress is LB-only (non-prod keeps ALL); `INTERNAL_*` envs wired;
  no new web secrets.
- Journeys — `N2.invite` walks `/signup` + `/login` (open ⇒ email first + code in `<details>`;
  invite ⇒ code required/visible/first); flips green with the Stage-B run.

## Stage B evidence

See `docs/build/runs/SEC.2.md` § Stage B — write-free prod legs (empty-email `/signup` 400s → 429
with `x-rhema-instance` ids from ≥2 instances; bogus invite ⇒ loud refusal + no account), the
N2.invite journey run + screenshots, and deploy provenance (`/healthz` gitSha, `deployments` row).
