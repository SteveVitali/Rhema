# ADR-064: The branded magic-link email — one template, expiry derived from `expiresIn`, a per-send nonce subject that never carries the token

- **Status:** Accepted
- **Date:** 2026-10-03
- **Ticket:** UX.1
- **Requirement ids:** REQ-SPEC-2 (copy half), REQ-BETA-19
- **Spec:** §15.3, §14.7

## Context
The sign-in email was "Sign in to Rhema" — no macron, no expiry, no safety line — and the subject
was identical on every send, so Gmail threaded all of a user's sign-ins together. Better Auth's
`expiresIn` was unconfigured (library default). Decisions owned here: the subject uniqueness scheme
and how the expiry line is derived.

## Decision
`magic-link-email.ts` owns one template rendered with three inputs: the verify URL (the ONLY place
the token appears), the expiry in minutes derived from `MAGIC_LINK_EXPIRES_SECONDS` — the same
constant `auth.ts` hands `magicLink({ expiresIn })`, so the quoted TTL can never drift from the
enforced one — and a per-send `sendNonce` (6 random bytes) that makes the subject distinct
(`Your Rhēma sign-in link · <nonce>`) while carrying nothing guessable and never the token. The
HTML part is a small inline-styled card (brand wordmark, one button, a paste-the-URL fallback, the
expiry line, and "Didn't request this? Ignore this email — nothing was signed in."); the text part
carries the same link, expiry, and safety line. `magicLinkSender(queue)` is the live `SendMagicLink`
composition — it renders and enqueues on `auth.mail`, so the worker transport is unchanged. The
subject scheme chose a random nonce over embedding the request timestamp (also acceptable) because
the nonce reads as an opaque reference and never implies a clock.

## Consequences
Each sign-in email is its own threadable message; a leaked inbox screenshot of the subject line never
leaks a token; the TTL claim is config-derived. Tests pin the brand, both parts, the expiry line, the
safety line, per-send subject uniqueness, and that the token appears only inside the link.

## Alternatives considered
- Timestamp-in-subject (`…requested at 12:04 UTC`): acceptable per the ticket but reveals a clock the
  reader doesn't need and can look identical for two sends inside a minute; the nonce is strictly
  unique.
- Token suffix in subject for correlation: rejected outright — the subject is the most-visible line
  of the email.
- A shared email-design system: overkill for one template; the inline-styled card is deliberately
  asset-free (no hosted images to track pixels or break).

## Revisit trigger
A second transactional template family (e.g. invite emails) — then the card shell extracts into a
shared renderer rather than being copied.
