# ADR-008: Open self-serve paid launch on prod — the partner program, G3, and H2 stay deferred

- **Status:** Accepted
- **Date:** 2026-09-16
- **Ticket:** decompose-spec plan extension (28c–28h: HUMAN-H6, PRB.13–PRB.17)
- **Requirement ids:** REQ-BETA-19 (amended 2026-09-16), REQ-BETA-14/15, REQ-BETA-16/17/18
  (deferred), REQ-EVAL-19 / §16.4 (standing bars kept)
- **Spec:** rhema-design-spec §17 (beta row amendment banner), Appendix A.13 (REQ-BETA-19 note),
  §16.4 (marketing block)

## Context

The RB phase is complete (PRB.01–PRB.12 landed as PRs #29–#40): the whole beta surface — shell,
ingest, estimator/run-sheet, dossier, triage, revise loop, source editing, billing, email, Quick
Voice, export, analytics — is built and deterministic-tested, and Phase 0 is exited (G1 PASSED with
accepted exceptions; the three real-project Reviews deliver green live on `dev`, PR #28). What the
system has never had is **production** — the platform has only ever run on `dev`.

The ratified sequence (§17) next calls for HUMAN-H3 (recruit 20–25 design partners, sign the
REQ-BETA-17 deal, grant house credits) then a ≥90-day/≥15-active-partner window before GATE G3
reads. The operator judged that sequencing wrong for the actual goal — *host the platform live in
production and let users pay for their own credits* — because partner recruitment is a slow human
pipeline that would leave a finished, working system unshipped for months, and the partner-deal
economics (house credits) are unnecessary when the Payment-Link channel already lets a user pay for
their own runs.

## Decision

Deploy straight to **prod** (no dev-rehearsal ticket — the Phase-0 live bring-up already proved the
deploy path on dev, PR #28) and open **self-serve signup + self-serve credit purchase**, amending
REQ-BETA-19 ("the beta is private and capped … the launch moment reserved for the full IDE"):

- **Permitted now:** a public self-serve signup (PRB.13 puts the invite gate behind a
  `signup.mode` flag — the machinery is kept for partner cohorts) and self-serve credit purchase.
- **Kept, verbatim:** no PR / marketing site / launch moment (reserved for the full IDE); no public
  pricing page beyond the purchase flow's own needs; **no §16.4 efficacy/superiority claims on any
  surface until GATE G2's LIFT criterion is met** (REQ-EVAL-19). Stripe Payment Links remain the
  one real-money channel (REQ-BETA-15).
- **Deferred, not cancelled:** H3's partner recruitment + deal + house-credit grants (users pay
  their own way; the sample-dossier sign-off D-PRB.01-2 stays operator-owed); G3's
  ≥90-day/≥15-active-partner window (the gate row stays in the chain and reads on whatever
  real-world usage exists); H2/G2 stay deferred as the HARD gate before marketing claims
  (`docs/build/readouts/GATE-G2.md`).
- **Stripe live mode is verified at run time** (H6): if the account is not live-activated, the
  real-money leg runs in test mode and becomes a DEFERRALS row — never fabricated.

The round is six chain rows (`28c`–`28h`): H6 (operator prerequisites), PRB.13 (open signup),
PRB.14 (run resilience + cost fidelity), PRB.15 (prod bring-up), PRB.16 (golden-path live
verification), PRB.17 (billing live + ops legs). The stacked-PR merges remain operator-manual.

## Consequences

- **Positive:** the finished system ships and earns; real-money + real-usage telemetry start
  accumulating immediately (the beta dashboard reads it); the open DEFERRALS live legs finally get
  a live stage to run against — this round is synthesized largely from those OPEN rows.
- **Negative / accepted:** the REQ-BETA-18 gate cohort (≥15 active partners) no longer exists as
  designed, so G3's readout will be statistically weaker when it eventually reads — accepted, the
  gate is a pause not a block. Self-serve users start at 0 credits (no house grants) — a colder
  onboarding that PRB.13 mitigates by surfacing the purchase path honestly. Prod is a
  kept-warm-AlloyDB spend the operator now carries continuously. UI/behaviour shipped ahead of G2's
  LIFT remains at risk under REQ-EVAL-16 if the eval later fails.

## Alternatives considered

- **Run the ratified sequence (H3 → ≥90-day beta → G3):** rejected — months of partner recruitment
  before a finished system earns anything; the deal economics assume free house credits the
  operator no longer wants to fund when users can pay directly.
- **Ship a dev-stage "soft launch" instead of prod:** rejected — a dev deploy already exists and
  was proven; a second rehearsal stage adds cost and delay without answering the question that
  matters (does a real user pay).
- **Wait for G2 (wave-1 LIFT) first:** rejected — G2 is the marketing-claims gate; opening a quiet
  paid signup makes no efficacy claim and so does not cross it. G2 stays the HARD gate before any
  §16.4 claim ships.

## Revisit trigger

Revisit if (a) the Stripe account cannot be live-activated and test-mode persists past the point
real revenue matters, (b) self-serve abuse economics (fraud, credit arbitrage, support load)
overwhelm the beta-grade throttles — then re-close signup to invite mode (the flag makes it a
config flip), or (c) G2's LIFT result lands and re-opens the launch/marketing sequence this
decision deliberately left deferred.
