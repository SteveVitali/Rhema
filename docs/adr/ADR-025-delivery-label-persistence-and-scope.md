# ADR-025: The delivery label persists on `runs.delivery`; *Unverified* is Review-scoped in v1

- **Status:** Accepted
- **Date:** 2026-10-01
- **Ticket:** RES.2
- **Requirement ids:** REQ-SPEC-31(3), REQ-IDE-18, REQ-VIS-9, REQ-SPEC-2
- **Spec:** §12.8 + the 2026-09-30 banner, §5.7, §5.11, Appendix D.2

## Context

REQ-SPEC-31(3) names the Review, but two decisions were owned here: (a) where the write-once label
lives so every surface reads it and never recomputes it (invariant 6), and (b) whether a
zero-coverage `fact_check` run is in scope. The coverage predicate is computable only at delivery —
after the Path-B citation strip, a claim URL absent from the proxy `fetch_log` is already dropped —
so the classification must be computed in the same transaction that flips `finalizing → completed`
and persisted as a product fact.

## Decision

The label persists as `runs.delivery jsonb` (migration 0047) — written atomically with the
`finalizing → completed` transition via `RunFields.delivery` in `applyTransition`, carrying
`{label, checkableClaims, coveredClaims}` plus the settlement markers (`refundedCredits`,
`platformFaultSettledAt`, `trialRestoredAt`, `alerted`) merged in post-commit. An index on
`delivery ->> 'label'` serves the sweep leg + the weekly rate probe. `deliveryLabelFromRow` in
`@rhema/contracts` is the single read seam; `runDeliverySchema` validates the blob.

**Scope:** *Unverified* applies to `review` runs only in v1. `fact_check` carries no research-class
phases to refund and its spec row does not name it; a future extension adds the predicate and the
phases together, as a new ADR.

## Consequences

- Every surface (timeline card, dossier banner, `run_finished` email, notification DTOs) reads the
  persisted label — none recomputes coverage, none infers from claim verdicts or narrative text.
- The settlement markers live on the same blob, so exactly-once retry semantics ride one write-once
  row rather than a second table; `trial_restorations` exists only because `admin_actions` is
  operator-only and cannot hold the platform-fault audit.
- The `delivery` column is deliberately generic — a later run-level label (e.g. a partial-coverage
  or degraded-delivery class) extends the `label` literal union without a schema change.
- Historical delivered runs have `delivery = null`; the read-only scan recomputes their predicate
  from `claims`/`claim_sources`/`fetch_log` and is operator-paused for any retroactive write.

## Alternatives considered

- **A `runs.delivery_label text` column + separate settlement table** — rejected: two rows to keep
  atomic; the blob keeps classification + settlement markers under one write-once envelope and the
  label index still serves the sweep.
- **Recomputing coverage on read** — rejected: read-time computation re-derives a product fact from
  mutable inputs (a later `fetch_log` correction would relabel history) and lets surfaces diverge.
- **Applying *Unverified* to `fact_check` now** — rejected: REQ-SPEC-31(3) names the Review;
  fact_check has no research phases to refund, so its extension is a label-only change deferred to a
  future ticket (`D-RES.2` row) rather than a half-implemented settle path.

## Revisit trigger

Revisit the scope ruling if a second workflow needs the label (the column is ready; the predicate +
refund phases must land together), or if the blob's settlement markers outgrow it (a per-label
settlement table becomes the rule).
