# ADR-124: Test-mailbox identities ride a dedicated bounded throttle bucket — never the production limits, never unlimited

- **Status:** Accepted (agent decision within the finding's recorded option space — the finding
  named "exempt `test+*@rhema.tools` from the limiter"; a dedicated bounded bucket IS the exemption
  carried to its honest shape: moved ceiling, not removed ceiling)
- **Date:** 2026-10-29
- **Ticket:** F-R6SWP.1-5 (findings work on LEDGER OPEN FINDINGS `F-R6SWP.1-5` — the prod
  magic-link limiter is below journey-suite demand)
- **Requirement ids:** REQ-BETA-19 (the signup/admission throttle contract), REQ-SPEC-29 (the
  JOURNEY.1 test-tenant class)
- **Spec:** LEDGER OPEN FINDINGS `F-R6SWP.1-5` + `docs/build/runs/R6SWP.1.md` (options a/b/c);
  ADR-039/040/041 (the shared-store throttle design this extends)

## Context

Every session-minting journey leg crosses **two** unauthenticated admission throttles on the api —
`POST /signup` (`rl:signup`, perIp=10 · perEmail=5 · 1 h) and `POST /api/auth/sign-in/magic-link`
(`rl:magiclink`, perIp=20 · perEmail=4 · 1 h) — and, when Better Auth itself creates the row, the
`user.create.before` account throttle (the same `rl:signup` bucket). All attempts key on the
OIDC-stamped client IP — one GitHub-runner IP per suite run.

Two scheduled nightlies on `main` (40689727097, 40876457031) proved the structural deficit the
R6SWP.1 re-drive measured: ~20+ session mints per run cannot fit inside 10 signup-creations or
20 sends per IP-hour — and the five `X1.*` legs sharing `test+jrn-b` alone exceed perEmail=4. The
finding recorded three options: (a) exempt the `test+*@rhema.tools` class, (b) pace signups in the
suite, (c) pre-minted session fixtures. (b) is a throughput workaround that makes suites take
hours; (c) defeats the fresh-identity legs' assert object — the `test+j<nonce>` signup IS the
new-visitor journey under test.

## Decision

Test-mailbox identities — exactly `matchesTestMailbox(email, TEST_MAILBOX)`, the ADR-020 flag
predicate — count on a **dedicated, higher-ceiling, still-bounded shared bucket**
(`rl:testidentity`: perIp=240 · perEmail=120 · 1 h, ≈10× suite demand) at all three admission
call sites (`POST /signup`, the magic-link send gate, `user.create.before`). Every other address
keeps the production limits. The class exists only while `TEST_MAILBOX` is configured AND the
dedicated bucket is bound — either unset means zero exemption (fail-closed default).

Security reasoning, recorded explicitly: a magic link addressed to `test+anything@rhema.tools` can
only ever deliver to OUR OWN pinned DWD test mailbox — the third-party email-bombing surface the
limiter exists to close cannot open. What the exemption leaves deliberately bounded rather than
removed: account-creation row churn (every created workspace is `is_test`-flagged, 26 h-purged,
0-credit, and unverifiable — the link goes to our mailbox) and send volume to our own mailbox, each
capped by the bucket's ceiling. Invite/mode admission is untouched: a `test+` send in invite mode
still refuses without a valid code.

## Consequences

- The nightly's ~20+ mints (fresh `test+j<nonce>` AND stable `test+jrn-*` identities) fit the
  `rl:testidentity` budget with ~4× headroom; a same-window re-drive fits too.
- Real signups keep the production limits exactly; a suite bug that spams real addresses still
  trips them.
- Residual accepted: a hostile caller can churn bounded test-alias account rows and mail our own
  mailbox at ≤240/IP·h — self-targeted only, the rows purge, and rotating-IP abuse is no worse
  than any unauthenticated endpoint's per-IP exposure.
- The finding's literal wording ("the magic-link send limiter") was narrower than the mechanism:
  the account-creation bucket binds sooner. Exempting only the send would NOT have fixed the suite.

## Alternatives considered

- **Full skip (option a verbatim):** rejected — an unbounded unauthenticated write/send path, even
  self-targeted, breaks ADR-039's never-unlimited posture (the Redis-outage degrade is per-instance
  limits, never unlimited). The bounded bucket preserves it.
- **Exempt only the magic-link send:** rejected — `rl:signup` perIp=10 trips at leg ~10; measured
  against nightly 40876457031's leg census, which shows BOTH dims binding.
- **Runner-side pacing (b) / pre-minted fixtures (c):** rejected — throughput workaround / defeats
  the legs under test, per the finding's own option analysis.
- **`signinThrottle` (OAuth start):** unchanged — the identity is unknowable at initiation and the
  journeys harness never uses OAuth.

## Revisit trigger

A nightly demands >120 test-identity mints/hour from one runner IP (registry growth past ~60
session legs), or a real abuse incident rides the test-alias class — either argues for tightening
the dedicated ceiling or splitting the bucket per consumer.
