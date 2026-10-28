# Playbook: boundary or delivery validation failure

**Alert:** `mirror_errors_10m` counts delivery-validation failures and `boundary.violation` internal events over ten minutes, excluding test tenants. `engine.error` is not part of this probe; terminal engine failures contribute to the success-rate signal. See [`slo.ts`](../../../packages/orchestrator/src/slo.ts).

## Triage

1. Identify which event class fired. A failed delivery validation and a tool/filesystem containment failure require different investigation.
2. Preserve the relevant `run_events`, `run_events_internal`, `tool.audit`, and fetch-log evidence, plus the scoped materialization needed for reproduction. Keep customer content and exploit details in the private incident record.
3. For a boundary violation, identify the seat/agent label and whether the operation was **denied and logged** or **executed before detection**. The former can be an enforcement success; the latter is a containment failure.
4. Escalate active containment failures immediately to the operator to stop affected work through the supported run/deployment controls. Do not assume the proxy's automated refusal signals provide a general manual pause control.

## Sources to inspect

- [`packages/hooks`](../../../packages/hooks/) for tool-boundary enforcement.
- [`apps/run-task/Dockerfile`](../../../apps/run-task/Dockerfile) and [`scoped-runner.ts`](../../../apps/run-task/src/scoped-runner.ts) for the uid/capability and scoped-process boundaries.
- [`infra/k8s/apparmor/`](../../../infra/k8s/apparmor/) for the filesystem/mount restrictions.
- The run's `boundary.attested` record for its violation and denial counts.

A confirmed containment breach is launch-blocking. Track remediation privately through the [security triage process](../../security/pen-test-findings-triage.md), add a sanitized build finding when appropriate, and verify the reproduction plus a regression assertion before closing it.
