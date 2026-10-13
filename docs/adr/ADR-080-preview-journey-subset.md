# ADR-080: Preview exercises only the credential-free journey legs; the rest defer per-leg

- **Status:** Proposed
- **Date:** 2026-10-04
- **Ticket:** OPS.1
- **Requirement ids:** REQ-SPEC-29, REQ-ARCH-38, REQ-SPEC-32
- **Spec:** §13.2, §6.5

## Context
OPS.1's acceptance is "credential-free `$0` journeys pass on the preview". The JOURNEY.1 registry
steps fall into three classes for a preview: (a) sessionless, `$0` legs — N10 (anonymous public
surfaces + the static `/showcase` sample); (b) legs needing a session — every signed-in leg needs a
magic link, which needs the Resend transport, which `PREVIEW_REQUIRED_SECRETS` deliberately excludes
(no third-party credentials on previews, REQ-ARCH-38); (c) legs needing paid inference or Stripe —
forbidden outright (`$0` inference) and by `purchase.mode=closed` respectively. A preview carries no
`rhema-prod-*` secrets and no third-party keys by design, so classes (b) and (c) cannot run there
without violating the same isolation the ticket exists to prove.

## Decision
The preview journey set is exactly the credential-free legs — **N10** plus the smoke (api
`/healthz`, web 200, worker boot) — run cheapest-first with `MAX_USD_PER_RUN=3` live and
`signupMode=invite`. Every dropped leg is recorded as an append-only `D-OPS.1-<n>` deferral row
naming the credential it needs (magic-link/Resend for the session legs, Stripe for N9-adjacent
legs, paid inference for every run leg). The deferral rows carry the close condition: a
ticket-approved non-prod mail path or a seeded `is_test` workspace that sidesteps magic-link
delivery — whichever a later ops ticket picks.

## Consequences
- The preview's journey evidence is honest: it proves the stage serves the real app, not that it
  can act as a user — a deliberately narrower, security-consistent claim.
- No third-party credential is minted "just for journeys", keeping the preview secret surface at
  the generated set + the non-prod provider key.
- Dropped legs are enumerated, not silently skipped — the same append-only deferral discipline the
  rest of the chain uses.

## Alternatives considered
- **Seed Resend + a test mailbox on previews:** rejected — a third-party credential on a preview is
  the exact surface REQ-ARCH-38 forbids; the mailbox dependency (JOURNEY.1 DWD) is prod-scoped.
- **Run the magic-link legs with a stub transport:** rejected — a stubbed send is not a real
  journey leg; a false pass is worse than an honest deferral.
- **Sign sessions in via seeded credentials:** partially open — if a later ticket ships an
  `is_test` session fixture that needs no mail transport, the session-leg deferrals close without
  third-party keys; that path is noted on the deferral rows.

## Revisit trigger
When a ticket-approved non-prod mail path or a credential-free `is_test` session fixture exists,
the `D-OPS.1-*` rows for session legs become closeable.
