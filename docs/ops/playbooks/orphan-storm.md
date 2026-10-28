# Playbook: orphaned runs

**Alert:** `orphaned_runs`. The intended alert identifies a lingering orphan; consult the implementation caveat below before using the metric to rule out stuck work.

## Diagnose

1. Read the worker's `run.reap` consumer logs and pg-boss queue state. The cron runs once per minute. An HTTP `ok` from the worker proves its health listener is alive; the listener starts before database and queue initialization, so it does not prove the consumer is progressing.
2. Check the Redis heartbeat path and the run's current attempt. Inspect pods in the `runs` namespace for image/startup failures and correlate their image digest with the deployment.
3. Read orphan age explicitly using the authorized system connection:

```sql
select id, state_since, now() - state_since as orphan_age
from runs
where state = 'orphaned'
order by state_since;
```

**Known source discrepancy (2026-10-27):** the `orphaned_runs` SQL in [`slo.ts`](../../../packages/orchestrator/src/slo.ts) selects `state_since > now() - interval '10 minutes'`, although its target describes lingering orphans. An older stuck orphan can therefore be absent from this probe. A zero metric is not sufficient evidence of recovery; this discrepancy needs a code fix and is recorded in [readiness](../../open-source-readiness.md).

## Recovery behavior

[`reaper.ts`](../../../packages/orchestrator/src/reaper.ts) considers a heartbeat stale after three minutes. A current running attempt is moved through orphaned state and re-enqueued with an incremented attempt, up to **two re-enqueues per step**; exhaustion opens a `resume_partial` gate. A stale heartbeat for a superseded attempt is skipped. Preserve those transitions and their ledger/credential effects; do not hand-edit run states.

Fix the failing worker, Redis path, or run-task image through the reviewed deployment procedure. Confirm queue progress, current heartbeats, and the affected runs' outcomes over successive sweeps. The repository does not currently implement the global launch-pause switch described in the original playbook; any admission restriction requires an explicit operator remedy rather than an invented flag.

Record the incident and the source discrepancy in the [SLO review](../slo-review.md) process. Keep customer content and credentials out of public records.
