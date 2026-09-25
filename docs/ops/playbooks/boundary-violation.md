# Playbook: boundary violation (§12.6; §13.5 — boundary violations = 0)

**Alert:** `mirror_errors_10m` — any `boundary.violation` or `engine.error` internal event in 10 min (the
probe bundles the two error channels; the line's `signal` says which).

A `boundary.violation` event means a tool call touched a path outside its seat's declared scope — the
scoped-seat model (§12.6) failed to contain it, or the hook boundary enforcement recorded a real violation.
This is a security signal, not a perf signal: respond accordingly.

## Detect

- `[slo] violation {"signal":"mirror_errors_10m"}` + the `boundary.violation` row in `run_events_internal`.
- The pod's `boundary.attested` event carries `violations` + `denied_count` counts for the run — read it for the full picture.

## Immediate steps (≤ 10 min)

1. **Pause the run** if still live — the pause-signal path (`pause_signals` drain) or the manual pause; a boundary violation mid-run means containment is not proven.
2. **Preserve evidence:** the run's `run_events_internal` rows, `tool.audit` rows, the fetch_log rows, and the pod's `/work` materialization scope — never delete a violating run's rows before the readout.
3. **Identify the seat:** `agent_label` on the violating event — was it the agent uid or a scoped subagent? A subagent escaping its input-scoped mount namespace is the worst case (SYS_ADMIN/SYS_CHROOT capability audit — `infra/k8s/30-worker-job-rbac.yaml`, `apps/run-task/docker/entrypoint.sh`).

## Diagnose

- Replay the violating tool call against `packages/hooks` boundary enforcement — was the violation DENIED-and-logged (the hook worked; the event is audit signal) or EXECUTED-then-flagged (enforcement gap)?
- If executed-then-flagged: treat as a live containment failure — pause launches of the affected protocol until the hook gap is fixed.

## Post-incident

- Every boundary violation gets a named entry in `docs/build/LEDGER.md` OPEN FINDINGS until dispositioned.
- A real containment breach is launch-blocking — feed it to the pen-test scope's known-issues appendix and do not ship past it.
