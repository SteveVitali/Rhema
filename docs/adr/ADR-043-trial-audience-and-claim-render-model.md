# ADR-043: The trial's go-live is an audience flag, and every claim renders through the audience fold

- **Status:** Accepted
- **Date:** 2026-10-02
- **Ticket:** ACT.1
- **Requirement ids:** REQ-SPEC-32(b), REQ-SPEC-8 (amended), REQ-GROWTH-10, REQ-POS-4/5/13, REQ-SPEC-29
- **Spec:** §14.3, §15.1, §15.2
- **Consumes:** ADR-042 (the config half — `trial.audience` lives in the same `pricing.json` block)

## Context

ACT.1 must honour the trial entitlement for *new accounts* while the operator keeps real-user
go-live paused. Two failure modes were live:

1. **The claim and the gate disagreed.** `trial.firstReviewIncluded` was OFF in `public-claims.ts`
   (so the claim never rendered anywhere) while the mechanics were partially live — a fresh account
   showed "Free — chat only" on billing while every run sheet refused with "cap is more than your
   spendable balance". Whatever the gate's state, surfaces must never promise (or hide) a trial the
   mechanics can't honour for *that* viewer.
2. **Go-live needed a third state between "off" and "on".** The launch plan is: prove the trial
   end-to-end on JOURNEY.1's flagged test tenants (`is_test`, operator-set, never user-settable)
   first; flip to real users only on an operator decision. A boolean flag can't express that.

## Decision

- **`trial.audience` ∈ `off | test_tenants | everyone`** ships in `pricing.json`
  (currently `"test_tenants"` — the operator pause). `TrialAudience` + `TRIAL_AUDIENCES` are the
  typed vocabulary (`trial.ts`).
- **`trialAudienceAllows(audience, isTest)`** is the single predicate: `everyone` ⇒ all viewers;
  `test_tenants` ⇒ flagged `workspaces.is_test` only; `off`/absent ⇒ fail closed.
- **`claimsForAudience(cfg, isTest)`** folds the audience into the public-claims config:
  `trial.firstReviewIncluded` is effectively enabled iff the shipped flag is ON *and* the viewer
  is inside `trial.audience`. **Every surface resolves claims through the fold** — landing hero +
  FAQ, `/pricing` trial rule + Free column, `/billing/plans` DTO, the billing trial card, the run
  sheet's Included line. Anonymous ⇒ `isTest:false`; a signed-in JOURNEY.1 tenant can preview the
  gated render with `?audience=test` (the api's `/session` now reports `isTest` so the web knows
  who may ask).
- **The audience gates the *mechanics* too, not just the copy.** `sheet-context` only emits a
  claimable entitlement for covered workspaces; `run-routes` refuses an uncovered POST
  (`422 entitlement_unavailable`) *before* the unlock gate runs — no audit row, no run, nothing
  claimed. A claim the audience excludes can never leak onto a page, and an entitlement a covered
  page never rendered can never be claimed by a crafted POST.
- **The everyone-flip is a one-line config diff** (`trial.audience: "everyone"`), recorded in the
  ledger/GATE DECISIONS and executed by the operator — no code deploy, no flag service.

## Consequences

- Stage B can prove N5 (trial Review → Included → delivery) and C1 (claims parity) on flagged
  tenants while real users see the paused posture — the *only* difference at flip time is the
  audience value.
- Test-tenant spend and fingerprints stay out of the real-user daily tally (ADR-042) — coherent
  with the audience: the harness operates inside the trial without perturbing its real-user
  guardrails.
- `?audience=test` is preview-only and requires a signed-in `is_test` session — an anonymous or
  real-user request for it is a no-op (never a leak).
- A claim that ships flag-ON but audience-gated is a new state the claims machinery must model —
  `claims-visibility.test.ts` and `launch-surface.test.ts` pin it (flag ON + audience-folded OFF
  for the default viewer).

## Alternatives considered

- **A deploy-time env flag instead of `pricing.json`** — rejected: the audience *is* trial
  configuration; co-locating it with the entitlement terms keeps one config the claims, gates, and
  ADR-042 derivations all read. An env var would also force a redeploy for the flip.
- **Boolean `enabled` + a separate test-tenant allowlist** — rejected: `test_tenants` is a named
  third state, not a toggle + a list; the audience enum makes the paused posture self-describing
  on every surface.
- **Gate only the copy, leave the mechanics open** — rejected: a claimable entitlement the
  audience can't see is the pre-ACT.1 incoherence in reverse (a crafted POST could claim a trial
  the surface never offered).

## Revisit trigger

The operator's real-user go-live decision — flip `trial.audience` to `"everyone"` and record the
diff in the ledger (the GATE DECISIONS entry names it). Also revisit if JOURNEY.1's `is_test`
flag ever becomes user-reachable — the audience predicate trusts it absolutely.
