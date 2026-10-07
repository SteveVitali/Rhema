# ADR-024: The platform-fault refund class — `platform_fault:<cause>` reasons and the REQ-SPEC-24(6) carve-out

- **Status:** Accepted
- **Date:** 2026-10-01
- **Ticket:** RES.2
- **Requirement ids:** REQ-IDE-18, REQ-SPEC-24(6), REQ-SPEC-31(3)
- **Spec:** §8.4 (ledger), §14.4 (event table), Appendix A.9 REQ-SPEC-31 row

## Context

RES.2 refunds an *Unverified* Review's research-class debits (verification + discourse + the
metered gap) because the platform — not the user — failed to fetch any source. The refund reasons
needed a shape that (a) stays greppable as one class, (b) is excluded from the user-refund window
REQ-SPEC-24(6) defines for DEF.4 (a platform-fault refund is not the user exercising a refund), and
(c) is excluded from `reDebitRefundedPhases` so a resume never re-charges refunded platform-fault
work. RES.1's `research_preflight_failed` default refund is the same class and needed a home.

## Decision

Refund `reason` strings read `platform_fault:<cause>` — `platform_fault:zero_coverage` for RES.2's
settlement, `platform_fault:research_preflight_failed` for RES.1's preflight default refund (folded
into the class by stamping the same reason). `isPlatformFaultRefund({kind, reason})` in
`@rhema/contracts` is the one predicate: `kind = 'refund'` AND `reason` prefixed `platform_fault:`.
`refundPhases` gained an optional `reason` argument; the settlement calls it with
`PLATFORM_FAULT_ZERO_COVERAGE`. `reDebitRefundedPhases` filters the prefix out of both its "which
phases were refunded" and "how much to re-debit" readings (SQL `reason not like 'platform_fault:%'`,
kept textually identical to the predicate). Platform-fault refunds are permitted on `completed`
runs — the REQ-SPEC-24(6) carve-out belongs to the class, not the verb.

## Consequences

- The user-refund window DEF.4 defines never counts platform-fault rows; the predicate is the shared
  contract, not a per-call-site string compare.
- A resumed run never re-charges refunded platform-fault work; a NEW run is debited normally.
- `platform_fault:*` is now a reserved reason namespace — a user-facing refund may not claim it.
- `absorbMeteredGap` books the refunded metered burn as platform COGS (margin accounting), which is
  why the settle totals can exceed `spentCredits` bookkeeping without violating
  Σ debits − refunds ≥ 0.

## Alternatives considered

- **A boolean `platform_fault` column on `credit_ledger`** — rejected: an additive NOT NULL column on
  a hot table needs a two-phase backfill; the `reason` prefix carries the same semantics with no
  schema change and reads identically in SQL and code.
- **A separate `platform_refunds` table** — rejected: every accounting surface (resume, window,
  margins) already reads `credit_ledger`; a side table would fork every total.
- **Reusing `refund` with no marker, inferring fault from the run's delivery label** — rejected: the
  ledger row must be self-describing; a refund written before/without the label would be
  indistinguishable from a user refund.

## Revisit trigger

Revisit if a second run-level fault label lands (the class takes a new `<cause>`, not a new prefix)
or if DEF.4's window predicate needs per-cause granularity beyond the prefix.
