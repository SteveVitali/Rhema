# Playbook: orphan storm (§13.5 — orphaned runs = 0)

**Alert:** `orphaned_runs` — runs in `state='orphaned'` for > 10 min (the reaper's `run.reap` cron normally clears a stale heartbeat within ~4 min: 3-min stale window + 1-min cron period).

## Detect

- `[slo] violation {"signal":"orphaned_runs", ...}` persisting across sweeps.
- `select id, state_since from runs where state='orphaned'` on the system role — a storm is a count growing between reads, not a single row.

## Diagnose (≤ 10 min)

1. **Is the reaper itself dead?** `run.reap` is a 1-minute pg-boss cron on the worker — check worker health (`/health`), pg-boss queue depth, and the worker's recent `[worker] run.reap` errors. A dead reaper orphans everything with a stale heartbeat.
2. **Is the heartbeat path dead?** Heartbeats write Redis — check Redis connectivity (`REDIS_URL` reachability from the worker). Pods whose heartbeats can't land look orphaned while still running.
3. **Is the launcher loop alive?** A crash-looping run-task image orphans every run at launch — check the GKE `runs` namespace for pods failing before first heartbeat (`kubectl get pods -n runs`).

## Contain

- Pause new launches (same §14.4 admission pause as provider-outage) until the orphan count stops growing.
- For each orphaned run: the reaper re-enqueues up to `maxAttempts`; past that it parks `waiting_gate` with a `resume_partial` card — those are already user-visible and safe. Don't hand-flip states.

## Recover

- Fix the failing layer (worker deploy, Redis, image), let `run.reap` drain the backlog — one sweep handles one pass; a storm may take several minutes to clear.
- Verify: `orphaned_runs` probe reads 0 for two consecutive sweeps.

## Post-incident

- If the root cause was a pod-side failure, check the run-task image digest pin + `privsep-check.sh` health; a systemic launch failure is a release rollback, not an orphan patch.
