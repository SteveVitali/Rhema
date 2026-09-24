# ADR-005: the instrumented-fold registry — a process-local override so a live metered run flips `estimatorsAreProvisional()`

- **Status:** Accepted
- **Date:** 2026-09-11
- **Ticket:** P0.15k
- **Requirement ids:** REQ-EVAL-5 (cross-check), §16.3 #1 (instrumented replaces provisional), §16.4 (price-card precondition); D-P0.15-2
- **Spec:** rhema-design-spec §16.3 (instrumented cost runs), §12.7 (proxy-vs-SDK cross-check), §12.2 (estimator data)

## Context

The §17 Phase-0 exit criterion (D-P0.15-2 / AC2) requires that, after one proxy-metered run per ported
workflow × rigor, `foldInstrumentedRun` folds the measured cost into the estimator so **`estimatorsAreProvisional()`
becomes false** for the ported workflows. But the machinery as built could never satisfy that:

- `foldInstrumentedRun` is **pure** — it returns a NEW `EstimatorSpec` and never touches the module-level
  `ESTIMATORS` const (deliberately: the fold-purity tests assert it).
- `estimatorsAreProvisional()` read the hardcoded `ESTIMATORS` const, where every spec is `provisional: true`.
- `driveLiveExit` **launched** the instrumented runs but **never folded** their measurements, then called
  `estimatorsAreProvisional()` — which was therefore always true, so `ready` could never be true and AC2 could
  never pass, even on a perfect live run.

So the live "fold" call-site was missing, and there was nowhere for a folded spec to be recorded such that the
provisional check would reflect it.

## Decision

Add a **process-local instrumented-override registry** to `@rhema/protocols/estimator.ts`:
`recordInstrumentedFold(workflow, m)` folds `m` into the workflow's current spec (an existing override if present,
else the shipped modeled base) via the still-pure `foldInstrumentedRun` and stores the result in a module-level
map; `estimatorSpec(workflow)` reads override-first; `estimatorsAreProvisional()` reads override-first;
`resetInstrumentedOverrides()` clears it (fresh driver process / test isolation). `foldInstrumentedRun` stays
pure and unchanged.

`driveLiveExit` gains an injectable `InstrumentedFolder` seam and folds **each** instrumented run through it,
surfacing the folded specs in the readout (`estimatorFolds`); the live binding
(`createDbInstrumentedFolder`, `integration/src/instrumented-folder.ts`) reads the run's measured proxy cost
(the meter of record, via `proxyVsSdkCrossCheck`) + the run's estimator inputs, converts proxy list dollars to
platform credits (§14.1 `platformCredits`), and records the fold. A run with no proxy cost yet folds nothing
(returns `null`) — never a fabricated fold.

## Consequences

- After the live instrumented runs, `estimatorsAreProvisional()` returns false **in the driver's process** and
  the driver emits the folded specs (with measured `calibrationScale` + phase-aware `cacheEconomics`) as the
  measured constants to persist. The AC2 assertion is now satisfiable.
- The reflection is **process-local and non-durable**: it does not survive a restart and is not shared across
  processes. That is adequate for the exit assertion (one driver process) but NOT for the durable price card /
  marketing precondition (§16.4). The durable step — writing the measured constants into the shipped
  `ESTIMATORS` source (or a price-card table a future PRB.3 cap-sizing consumer reads) — is a follow-up the
  operator lands from the driver's emitted folds; it is out of this ticket's scope.
- `estimateCredits` consumers that want the calibrated figures must read through `estimatorSpec(workflow)`; the
  only current caller of the estimator data is the fold path + tests, so nothing is refactored now.
- `foldInstrumentedRun` purity is preserved; the existing estimator tests are unchanged.

## Alternatives considered

- **Mutate `ESTIMATORS` in place on fold.** Rejected: mutating an exported const map is opaque, not resettable
  for tests, and destroys the pure-base baseline the provenance test relies on. A separate override map with
  read-through is reversible and explicit.
- **Persist folded specs to a new `estimator_specs` DB table + read the provisional check from the DB.** This is
  the durable design and the right long-term home, but it is a migration + a store + a cap-sizing consumer
  (PRB.3) — well beyond this ticket's thin Stage-A scope, and untestable offline anyway (the whole point is a
  live metered run). Recorded as the follow-up above rather than built now.
- **Have the driver compute readiness from its own accumulated folds without touching the module function.**
  Rejected: AC2 names `estimatorsAreProvisional()` specifically (it is the price-card precondition surface), so
  that function must reflect the fold.

## Revisit trigger

When PRB.3 (estimator-driven cap sizing) or the price-card publication needs the measured constants durably —
i.e. when a process OTHER than the live-exit driver must see `provisional: false` — replace this in-process
registry with the persisted `estimator_specs` design (or fold the measured constants into the shipped
`ESTIMATORS` source), and make `estimatorsAreProvisional()` / `estimatorSpec()` read that store.
