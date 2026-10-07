# ADR-037: Intra-phase meter source and cadence — the heartbeat reads the proxy ledger

- **Status:** Accepted
- **Date:** 2026-10-02
- **Ticket:** RPT.1
- **Requirement ids:** REQ-IDE-11 (meter half, primary); REQ-SPEC-32(a); REQ-SPEC-29/30
- **Spec:** principle 6 ("live meter during"), §5.5 (run card), §12.7 (the proxy is the meter of record), Manifest #10/#13
- **Amends (display only):** DEFERRALS `D-P0.08-2` — the harvest-path tick stays; this ADR adds the intra-phase half

## Context

The design-review defect (PR-E4): the run card's spend sat at 112 cr for 6+ minutes of a running
phase — `usage.tick` only emitted at harvest (phase end), so the meter was phase-granular and the
card was static during execution. Principle 6 promises a live meter *during*.

What had to be decided: **where the intra-phase reading comes from** and **how often it emits**.

Candidate sources:

1. **The proxy itself** — `SqlUsageWriter` already writes one `usage_records(source='proxy')` row per
   metered response (the meter of record). The proxy has no event seam, no `eventWriter` binding, and
   publishing run events from it would couple the metering path to run state it deliberately does
   not read.
2. **A new sweep worker** over `usage_records` per running run — another moving part for a reading
   the pod already requests.
3. **The pod's existing heartbeat** — the pod beats `PUT /internal/runs/:id/heartbeat` every 20 s
   during every phase, inside a fenced, attempt-checked transaction that already reads run state.
   The heartbeat is run-predicated by construction (Manifest #13's "explicit run/workspace
   predicate") and costs one indexed aggregate query.

## Decision

The intra-phase meter rides the **existing 20 s heartbeat**: inside `heartbeat`'s fenced
transaction the api computes `Σ usage_records(source='proxy', run_id)` for the run and derives
`tickSpent = min(cap, max(spent_credits, metered))`. A `usage.tick` row appends **only when the
figure or its provisional marker changed** since the last tick (deduped on the durable
`run_events` row, so quiet beats cost nothing and a restart cannot re-emit noise). The tick is
`provisional: true` exactly when it exceeds the committed `spent_credits` — the committed figure
always wins ties, so a lagging proxy write never regresses the displayed meter.

`usage.tick` gains an optional `provisional: boolean` in the event contract. Ticks and report rows
carry counts and credits only (Manifest #10) — no prompt text, no attribution beyond ids.

Delivery to the card is two-sided, because events are *not* the source of truth:

- **SSR:** the timeline route reads the latest `usage.tick` for non-terminal runs and overrides the
  card's `spentCredits`/`provisional` when the tick is ahead of the committed figure.
- **Live patch:** the web island's `EventSource` handler updates `[data-credits]`, the meter bar
  width, and the provisional marker on `usage.tick`/`cost.final`; `step.started`/`step.finished`
  flip `data-phase-status`.

`cost.final` (committed) is never provisional — terminal cards render the committed figure.

## Consequences

- The meter moves during a phase at heartbeat cadence (≤20 s behind the proxy write) — no new
  subsystem, no proxy coupling, no new query load beyond one bounded aggregate per beat.
- Removing the intra-phase read (the `source='proxy'` sum inside `heartbeat`) is observable: the
  phase-loop test watches ≥3 ascending provisional ticks land before a commit.
- The provisional figure is labelled `≈` everywhere it renders — provisional and committed figures
  never combine silently; a tick behind the committed figure loses.
- 20 s granularity is the price of riding the heartbeat — finer cadence would need a dedicated
  channel (SLO.1's territory, not this ticket's).

## Alternatives considered

- **Proxy-side publish** — rejected: the proxy has no event seam; adding one makes the metering
  hot path depend on run-event writes (and leaks run lifecycle into a component scoped to auth +
  metering).
- **A dedicated meter sweep job** — rejected: a second writer for the same fact, polling load on
  the system pool, and a new failure mode (sweep lag) with no benefit over the beat the pod
  already pays for.
- **SDK `sdk_stream` rows as the source** — rejected (the ECON.1 D-A finding): stream rows are
  provisional renders of the same tokens, not the meter of record.

## Revisit trigger

Reopen when §13.4's event-delivery SLO work (SLO.1) needs sub-20-s meter freshness, or when the
heartbeat path is restructured — at that point a proxy-side publish channel or a dedicated sweep
can be costed against the proven-adequate beat.
