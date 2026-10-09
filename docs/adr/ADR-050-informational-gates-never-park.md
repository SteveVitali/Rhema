# ADR-050: One gate-policy resolution — informational gates open their card but never park the run

- **Status:** Accepted
- **Date:** 2026-10-03
- **Ticket:** RUN.1
- **Requirement ids:** REQ-SPEC-1, REQ-SPEC-17, REQ-GATE-1, REQ-GATE-3
- **Spec:** §6.4 (R3 defaults-as-data), §12.4 (gate open → park), §5.6 (run sheet lines)

## Context

The §6.4 R3 table says `approve_scope`'s default is *informational* — the card opens so the user
can read what the run is about to do, and the run proceeds. Three surfaces disagreed with that
line in production:

- `commitStep` transitioned `running → waiting_gate` for **every** opened gate, ignoring the
  `blocking` flag the card itself carried. An informational `approve_scope` therefore parked the
  run while its own card said "the run proceeds" (PR-R1).
- The run sheet hand-authored its scope-approval copy from `approvalPolicy`/`scopeBlocking` only —
  it never consulted the project's validated `approval_overrides`, so the sheet's line could
  disagree with what the orchestrator would actually do at the gate.
- The `approval_overrides` schema accepts `approve_scope: null` but nothing defined what a `null`
  override means on a kind whose default already has no deadline.

## Decision

- **One resolver drives everything.** `resolveGatePolicy` moved to `@rhema/contracts`
  (`packages/contracts/src/domain/gate-policy.ts`) and is THE resolution the orchestrator's park
  decision, the run sheet's scope line (`resolveScopeGate`), the gate card's informational copy,
  the Inbox row, and the Timeline's `waitingGate` all derive from. No surface hand-writes gate
  copy again.
- **`blocking:false` opens the card, never the park.** `CommitNext` carries `blocking`; an
  informational gate also carries `then: "advance" | "finalize"` — the transition the run would
  have taken had the gate not opened. `commitStep` opens the gate row + `gate.opened` event but
  leaves the run `running` (or takes `finalizing` when `then` says so). The pod harness maps an
  informational gate to `advance`/`finalize` and continues the same loop — no exit, no resume.
- **Informational gates ride the run until the letter phase.** Open `blocking:false` gates are
  auto-resolved (`Decision{by:'policy', action:'proceed_as_proposed'}`) at the finalization
  boundary — the §6.4 R3 "stays on the card until the letter phase" behaviour.
- **`approve_scope: null` means "the card waits for me".** Every other kind already blocks by
  default, so `null` ("remove the deadline → wait") is a no-op there; on `approve_scope` — whose
  default is an informational wait with no deadline to remove — `null` can only mean a *blocking*
  wait: `blocking:true`, no deadline, `onExpiry:"wait"`. A numeric `approve_scope` override
  remains schema-illegal (the kind is not add-eligible).
- **Spend/refusal kinds are untouched.** `neverAutoProceed` kinds keep their blocking park and
  never proceed_*; `wait_each` forces `blocking:true` on every kind; Run-to-completion/autonomous
  still skip named gates via `Decision{by:'policy'}`.
- **Actionable surfaces filter on `blocking`.** Needs-you shows blocking gates (or any gate on a
  `waiting_gate` run); an informational gate on a running run is observability, not an action
  item. The Timeline mounts the card on the run but `waitingGate` stays unset — a label saying
  "informational"/"the run continues" can never co-occur with a parked run.

## Consequences

- A default `named`-policy run passes `approve_scope` without a click — the card is audit, not a
  pause. Operators who want the old behaviour set `approval_overrides: {approve_scope: null}` or
  `approval_policy: 'wait_each'` on the project.
- The pod's commit contract grew a `blocking` flag + `then` leg; older pod wiring that commits
  `gate` without `blocking` is treated as blocking (fail-conservative — `blocking !== false`
  parks).
- Gate rows gained a persisted `blocking` column; the timeline can show an informational card on
  a running run without lying about the state.

## Alternatives considered

- **Keep parking, fix only the label.** Rejected — the §6.4 R3 table is explicit that the default
  is informational; changing copy to say "waits" would make the default experience strictly worse
  and still not honour `blocking:false`.
- **Informational gates as events, not gate rows.** Rejected — the gate row + `gate.opened`
  event is the audit trail and the card's data source; an event-only trail loses the unresolved
  gate the timeline and Needs-you surfaces read.
- **`approve_scope: null` as schema-illegal.** Rejected — `null` has a coherent meaning ("wait")
  and refusing it would break the uniform override rule REQ-SPEC-1 documents; making it
  blocking-wait is the least-surprise reading and matches how `null` behaves on every other kind.

## Revisit trigger

Reopen if a second informational-default gate kind is added (the `blocking:false` + `then`
machinery is general but only `approve_scope` uses it), or if product wants informational gates
to auto-dismiss earlier than the letter phase.
