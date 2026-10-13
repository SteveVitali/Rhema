# ADR-103: Signed email actions are Open/Wait-only — retro-fitted record

- **Status:** Proposed
- **Date:** 2026-10-04
- **Ticket:** CAP.3
- **Requirement ids:** REQ-MOBILE-10
- **Spec:** §10.7, §5.11 (manifest amendment)

## Context

REQ-MOBILE-10's clause limited lock-screen/notification actions to Open/Wait (no mutating
dispositions without entering the app). There is no mobile app at MVP; the equivalent surface is
the signed email action links (`packages/orchestrator/src/email-actions.ts`). The manifest
amendment applied the same rule: signed email actions may Open or Wait, never mutate state. The
matrix is MET-DIFFERENTLY; this retro-fits the record.

## Decision

Apply the Open/Wait-only rule to the signed email action surface: email links carry signed
`open`/`wait` intents only; any mutating action requires a session in the app. Live email legs
(`notifications.test.ts` + the sent-mail journey evidence) prove the shape.

## Consequences

- The spec's intent — no state mutation from an ambient surface — holds on the surface that
  actually exists (email), preserving the clause without an app.
- If a lock-screen surface ever ships, the same rule ports directly.

## Alternatives considered

- Allow Approve/Deny from email: mutating actions over a bearer link; violates the clause's
  intent; rejected.
- Defer the clause entirely as app-scoped: leaves email actions unbounded; rejected.

## Revisit trigger

Reopen when the mobile app or richer notification actions exist, or if signed-link semantics
change (e.g. one-click disposition lands as a product decision — that WOULD reopen this).
