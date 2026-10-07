# ADR-023: The research probe is a real bounded `fact_check` run, not a synthetic credential

- **Status:** Accepted
- **Date:** 2026-10-01
- **Ticket:** RES.1
- **Requirement ids:** REQ-SPEC-31, REQ-SPEC-11, REQ-SPEC-29 (N6)
- **Spec:** §12.7/§12.8 (metering; fetch-log provenance)

## Context

Deliverable 5 needs a ≤ $1 probe that shows on demand that research reaches the model and that the
planted error is contradicted with a fetched source — asserted on `fetch_log`, `usage_records`, and
the delivered claim rows. Two shapes were on the table: a `meterOnly`-style synthetic credential
(like DEF.2's `est_` pre-pass) driven by a direct `/v1/messages` POST, or a real one-claim
`fact_check` run.

## Decision

The probe is a **real `fact_check` run** over the committed ≤300-word planted-error excerpt
(`packages/journeys/fixtures/planted-error-excerpt.md`; the full essay beside it for the N6 leg).
`driveResearchProbe` (integration/src/research-probe.ts) launches it through the public run-creation
route, polls to terminal, then evaluates the proxy's evidence: metered searches/fetches per model in
`usage_records`, allow rows in `fetch_log`, the planted claim's `contradicted` verdict in `claims`,
and cited⇒fetched against `claim_sources`.

A `meterOnly` credential cannot satisfy the contract: `fetch_log`/`run_events`/`pause_signals` all
foreign-key to `runs(id)`, so an `est_*` context deliberately writes usage only — it could never
produce the fetch row or the claim verdict the probe asserts on. The real run also exercises the
pieces a synthetic request cannot: the harness's phase-class stamp, the research floor, and the
research-subagent roster.

The deterministic twin (`research-probe.test.ts`) replays a recorded-shape evidence bundle through
the pure `evaluateProbeEvidence`, including the incident's own shape (zero searches, Unverifiable
planted verdict) as the negative case. CI runs it at $0; Stage B refreshes the fixture with the live
capture.

## Consequences

- The probe's ≤ $1 bound comes from the excerpt's size and the two-phase fact_check shape, plus the
  run's own `capCredits` — a misbehaving run dies at cap, never at the budget.
- Probe evidence is exactly the rows the delivery contract already writes — no new sinks, no
  privileged writes; the driver reads with a system-pool seam.
- The probe double-covers N6's DB half; N6 itself remains the browser walk (JOURNEY.1 harness).

## Alternatives considered

- **`meterOnly` synthetic credential + direct POST** — rejected: no `runs` row, so no `fetch_log`
  and no claim verdict; it would probe the proxy in isolation while the incident was the whole
  pipeline.
- **Reusing the weekly `paid-fixture.md`** (moon-landing planting) — rejected for this leg: the
  before/against comparison is the 2026-09-30 run's own essay; the excerpt keeps the same planted
  error so the comparison is direct. The paid fixture stays the weekly journey's.

## Revisit trigger

Revisit if `fact_check`'s shape changes (a claimCount-priced bound would re-derive the probe cost)
or if a synthetic-credential probe gains fetch-log attribution (a runs-adjacent probe row type).
