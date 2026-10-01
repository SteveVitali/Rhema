# ADR-022: The research preflight — model × server-tool pairs proven before any debit

- **Status:** Accepted
- **Date:** 2026-10-01
- **Ticket:** RES.1
- **Requirement ids:** REQ-SPEC-31(1)/(3), REQ-SPEC-11, REQ-ARCH-31
- **Spec:** §12.4 (terminal step failure; settle on failure)

## Context

PR-Q1 charged a complete Quick/Base Review whose `web_search` never reached the model — every claim
came back Unverifiable and the run still settled. The root causes were injection-side (server tools
not reliably declared, client tool blocks misread as executions), but the guard the incident argues
for is upstream of all of them: a run should prove the model × server-tool pairs it will exercise
*BEFORE* the first paid phase, through the same proxy path the run will use, so a refusal becomes a
cheap, immediate failure instead of a paid Unverifiable dossier.

## Decision

`authorResearchPreflight` (orchestrator) derives the pair set from the run's `model_tier` row
(planning model + optional research-model override) crossed with the web tools the run's
`WebToolPolicy` enables, carrying the server-authored tool type strings (`web_search_20250305`,
`web_fetch_20250910`). The runspec ships the manifest as `researchPreflight`; it contains no secret
material.

The run-task commit loop runs the probe ONCE per pod, before the first phase's model traffic —
a resume is a fresh pod, so re-preflight is automatic. The probe (`research-preflight.ts`) POSTs a
minimal `/v1/messages` request to the run's OWN egress proxy (not the agent's injector loopback),
carrying the run credential and `x-rhema-phase-class: preflight`; each pair declares its tool
clamped to `max_uses: 1` and answers inside a 30 s timeout. A 2xx proves the model accepted the
injected variant — the provider validates `tools[]` at request time — while a refused pair, a
non-2xx, or a transport error fails closed.

Failure is terminal and observable: the loop reports `research_preflight_failed` through the
ordinary `failStep`, which settles `running → failed` in one tx (hold released, zero user debit,
probe burn absorbed as platform cost), and the stranded sweep's leg D pages exactly one ID-only ops
alert per run (`runs.failure.alerted` is the send-then-mark dedupe). A spec that demands preflight
with an unbound probe seam fails closed rather than silently skipping.

## Consequences

- A misconfigured model/tool pair costs one bounded probe per pair and a clean failure — never a
  charged Unverifiable run.
- Probe requests are metered like any served response; on the terminal settle they absorb as
  platform cost, so Σ debits ≤ cap holds.
- The `preflight` phase class bypasses the remaining-budget bound so an exhausted run can still
  re-probe on resume — bounded by `max_uses: 1` per pair.
- The alert path is sweep-based (not inline), so a crashed pod still yields exactly one page.

## Alternatives considered

- **Inline alert at failStep** — rejected: the alert would need a network call inside the settle tx;
  the sweep's send-then-mark gives exactly-once without holding the tx.
- **Preflight once per run (recorded in DB) rather than once per pod** — rejected: a resume can land
  on a different proxy deployment or after a tool-config change; re-proving is cheap and the ticket
  requires it.
- **Agent-side probe** — rejected: the agent must never hold the credential; the harness owns the
  probe through the same credentialed path it already uses.

## Revisit trigger

Revisit if the pair set grows beyond `models × {web_search, web_fetch}` (e.g. a new server tool or a
per-phase model map), or if probe latency materially delays pod start (parallel probes already bound
it at ~30 s worst case).
