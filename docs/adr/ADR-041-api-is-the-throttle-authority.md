# ADR-041: The api is the single throttle + admission authority — the web-side magic-link limiter is retired

- **Status:** Accepted
- **Date:** 2026-10-02
- **Ticket:** SEC.2
- **Requirement ids:** REQ-GROWTH-15, REQ-BETA-19, REQ-BETA-14
- **Spec:** §13.3, §15.3

## Context

SEC.2's ticket asks for the throttle "where the send happens" and leaves open whether the web-side
`magicLinkThrottle` (20/IP + 4/email, per-instance in-memory — PRB.13) is kept or retired once the
api owns a *shared* counter.

Three forces decided it: (a) a per-instance web limiter cannot count shared state — it would trip
early for users pinned to one instance and late for users spread across many, i.e. *wrong in both
directions* once the api's count is the real one; (b) two layered limiters double-charge every
attempt — one legitimate burst could trip the web limiter while the api's shared bucket was still
under; (c) the api's guard must exist anyway for direct `POST /api/auth/sign-in/magic-link` callers
who never touch web — a web limiter protects nothing the api doesn't.

## Decision

- **Web's `magicLinkThrottle` is retired** — `createWebApp` drops the dep entirely; no local send
  counter remains. What web keeps is the **refusal mapping**: an upstream `429`/`rate_limited`
  (from `POST /signup` or a proxied beginAuth call) renders the existing "Too many attempts" copy —
  a refusal is never a false "sent".
- **The api enforces the send throttle at both surfaces with the same numbers the web had** —
  20/IP + 4/email, 1h window (`MAGIC_LINK_THROTTLE_DEFAULTS`, Redis prefix `rl:magiclink`) — now
  shared across instances (ADR-039) and keyed on the trusted client IP (ADR-040). Account creation
  keeps 10/IP + 5/email (`rl:signup`), enforced at `POST /signup` *and* `user.create.before` (the
  Better Auth verify/OAuth legs — a path that bypasses `/signup` still hits the counted gate).
- **Admission also lives only at the api** on the Better Auth paths: the `hooks.before` send guard
  runs `admitSignup` for never-seen emails (invite mode: no valid code ⇒ 403 + nothing enqueued);
  `user.create.before` re-runs it at creation with the carried `rhema_ic`; `user.create.after`
  consumes the code + provisions. The web keeps its thin pre-gate only as UX (no-code invite-mode
  POSTs never leave the browser→api hop — the PRB.01 property).

## Consequences

- **Positive:** one authority, one count, one code-path to reason about; direct-api and
  web-mediated callers face identical limits; the double-charge and per-instance-early-trip classes
  of bug are gone by construction.
- **Negative / accepted:** a rate-limited send now costs a web→api round-trip before the refusal
  (was: local). Throttle error copy is web-mapped — a new api error code needs a `copy.ts` row to
  avoid the generic line (the mapping is allowlisted for exactly this reason).

## Alternatives considered

| Option | Why it lost |
|---|---|
| Keep the web limiter in front of the api's | Double-charges attempts and can trip early/late vs the shared count — a limiter that's wrong in both directions is worse than none. |
| Share Redis into web and keep both | Adds the Redis dep + the trusted-IP problem to web for a guard that still can't see direct-api callers; the api guard is mandatory regardless. |
| Let Better Auth's plugin limiter be the send authority | Per-instance memory, first-hop-XFF keyed, fixed 5/60s — see ADR-039's table. |

## Revisit trigger

Reopen if a third send surface appears that can't reach the api guard (e.g. an edge worker), or if
the web→api hop latency on refused sends ever becomes a measurable UX problem worth a local
pre-check that *approximates* (never replaces) the api count.
