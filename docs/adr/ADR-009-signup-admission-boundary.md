# ADR-009: Signup admission lives in the api; the sign-in link is the verification; the throttle is fixed-window per-instance

- **Status:** Accepted
- **Date:** 2026-09-16
- **Ticket:** PRB.13 (open self-serve signup + the 0-credit purchase path)
- **Requirement ids:** REQ-BETA-19 (amended 2026-09-16), REQ-BETA-14/15, REQ-PROD-15,
  REQ-CHAT-25, REQ-POS-4/5/13
- **Spec:** §17 beta row (amended), Appendix A.13, §14.6, §16.4

## Context

PRB.13 flips REQ-BETA-19 from invite-only to a `signup.mode = invite | open` flag. Four decisions
the ticket leaves to the implementer needed a fixed answer:

1. **Where admission is enforced.** The PRB.01 gate lived at the web `/login` pre-check ("no valid
   code ⇒ no auth request"), with invite `consume` wired to the deferred Better Auth `user.create`
   hook (D-PRB.01-1). A web-only gate is bypassable by definition — and PRB.13 needs a deterministic
   account-creation path NOW, not when the auth mount lands.
2. **What "verified email" means mechanically.** The ticket requires a verified email before a
   self-serve account can create a run, but warns against a second email path (Notes: reuse the
   PRB.09 `MailSender` if a separate verify send is ever needed).
3. **What the abuse throttle is.** "Beta-grade" per the ticket — no captcha vendor, no risk scoring.
4. **How the mode flag fails.** A typo'd deploy value must never silently open signup.

## Decision

- **The api owns admission.** `apps/api/src/signup.ts` exposes `admitSignup` — the single function
  every account-creation path runs — behind `POST /signup` (public, throttled). It checks +
  **consumes the invite at creation** (the PRB.01 invariant, now exercised deterministically instead
  of only in a deferred live hook), provisions `user` + personal `workspace` + `billing_account` +
  `workspace_members` idempotently, and emits `signup.completed{method}`. The web `/login` POST
  calls it for the magic-link path; the Google/OAuth path binds the same function at `user.create`
  in the live mount (D-PRB.13-2). The web keeps a thin pre-gate (invite mode: no code ⇒ the request
  never leaves the browser-to-api hop — the PRB.01 "no auth request" property is preserved).
- **The sign-in link IS the verification.** A magic-link click is mailbox proof — Better Auth sets
  `user.email_verified` on it. No separate "verify your email" send exists. Run creation enforces
  the flag server-side (`POST /projects/:id/runs` ⇒ 403 `email_unverified`), so the gate binds the
  account regardless of how the session was minted.
- **The throttle is a fixed-window `IpEmailThrottle` (per source IP + per email), in-memory
  per-instance** — `429 + Retry-After` past the limit. Per-instance counting is the accepted beta
  trade (N instances ⇒ N× the window for a distributed attacker); the shared-store binding is
  D-PRB.13-1 at prod bring-up. The verified-email run gate is the compensating control: a
  throttle-bypassed account still cannot run.
- **`signup.mode` fails closed.** `parseSignupMode` maps anything but the literal `"open"` to
  `invite`; every stage config ships `invite` until PRB.15 flips prod.
- **A returning account resolves `created:false`** before the invite check — a re-login must not be
  locked out by its own now-exhausted single-use code (the magic-link send leaks the same existence
  fact anyway, and the throttle caps probing).

## Consequences

- **Positive:** invite `consume` at creation is proven deterministically (PGlite) rather than
  deferred to a live auth mount; the 0-credit account → exhaustion panel → Payment Link path is
  testable end-to-end in-process; one email path keeps the surface honest; the flag can re-close
  signup by config flip if abuse economics turn (ADR-008's revisit clause).
- **Negative / accepted:** the OAuth admission call-site is still the deferred live mount
  (D-PRB.13-2); the email-existence oracle in `created:false` is accepted at beta (documented in
  `signup.ts`); per-instance throttle windows are the documented D-PRB.13-1 trade.

## Alternatives considered

- **Keep admission web-only + wait for the Better Auth mount:** rejected — the ticket's account
  creation must exist and be tested now; a web-only check is no security boundary.
- **A separate "verify your email" send:** rejected by the ticket Notes (one email path; the
  magic link already proves the mailbox — a second send is pure cost + confusion).
- **Redis/DB-backed throttle now:** rejected as over-build for the beta ask; recorded as
  D-PRB.13-1 instead of silently shipping the in-memory one.
- **Invite codes silently ignored in open mode:** rejected — a supplied code is still validated +
  consumed, so partner cohorts keep working and a typo'd code fails loudly.

## Revisit trigger

Revisit if (a) multi-instance throttle bypass measurably matters on prod (bind the shared store —
D-PRB.13-1), (b) Better Auth's mount reveals `user.create` cannot carry the invite code through
OAuth state — then admission for the Google path needs a post-OAuth code step, or (c) the
email-existence oracle in `created:false` is judged unacceptable — then the magic-link path
collapses admit+send into one opaque answer.
