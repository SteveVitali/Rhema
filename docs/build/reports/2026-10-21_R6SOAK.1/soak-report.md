# R6SOAK.1 — Worker right-size soak report (pr-206)

**Verdict: RED — the 0.5 vCPU / 512Mi preview worker reproduces the D-P0.15h-3 throttled cold-import failure mode. D-COST.1-3's soak condition is NOT met; the production flip in R6INF.1 is not authorized by this evidence.**

## What was measured

- Stack `pr-206`, project `rhema-507501`, region `us-central1`.
- Live worker posture (asserted by the driver from `run.services.describe` + `worker-posture.txt`):
  `cpu=0.5`, `memory=512Mi`, `cpu-throttling=true`, `startup-cpu-boost=true`, min/max scale `1/1`, instance billing.
- Image `worker@sha256:77fee0f5d03d44aa2cedb77fabb7661c73c3f5ac6f0ea5b5cdc718f970676298` (Cloud Build `d68e5ea3-…`, chain-tip code).
- Pre-registered in `docs/build/runs/R6SOAK.1.md` before live execution: **N=6** iterations, `job_launch ≤ 60 s`, 600 s watch window, any timeout/attempt marker or missing `job_launch` → failed iteration; all-clean → green, else red.
- Each iteration: benign `RHEMA_SOAK_ITER=<i>` env bump → brand-new Cloud Run revision → 100% traffic → cold instance under the throttled posture → real `run.start` pg-boss job for a seeded fixture run → watch run state + `run_start_stage_ms` SLO samples + worker log markers → `run.cancel` to bound spend.
- The exercised path is the real one: `run.start` → `handleRunStart` → `provisionRun` → `ensureLauncher` → lazy `import("@kubernetes/client-node")` → GKE Secret/Job creation.

## Per-iteration results (all six FAILED — see worker-soak.json for machine form)

| # | Revision | run.start sent (UTC) | Run state at watch end | job_launch | Markers | Classification |
|---|----------|----------------------|------------------------|------------|---------|----------------|
| 1 | 00002-fbj | 01:04:13 | provisioning | none (10 min) | `building GKE launcher` | failed |
| 2 | 00003-w6g | 01:14:38 | provisioning | none | `building GKE launcher` | failed |
| 3 | 00004-k7j | 01:25:02 | queued | none | — | failed |
| 4 | 00005-xjj | 01:35:29 | queued | none | — | failed |
| 5 | 00006-wbz | 01:46:01 | queued | none | `building GKE launcher` | failed |
| 6 | 00008-fc5 | 01:58:01 | queued | none | — | failed |

## The signature (worker-logs-*.txt + pg-boss ledger)

- **Zero** `slo_samples` rows with `signal='run_start_stage_ms'` for any detail across all six iterations — the launch path never reached its first SLO write.
- Iterations 1, 2, 5 logged `building GKE launcher (import @kubernetes/client-node + KubeConfig)` — the cold import began — then the handler hung past `expire_seconds=900`. pg-boss retried to `retry_limit=2` and ended `failed` (iter 1: last fetch 01:30:19 = **26 min** after send).
- Iterations 3, 4, 6: the `run.start` row sat `created` for the entire 600 s window — the pg-boss consumers never fetched it while the starved instance was stuck in startup/import.
- Revision `00004-k7j` **crashed at cold start**: `[worker] failed to start: Error: timeout exceeded when trying to connect` → `Container called exit(1)` at 01:31:17Z (and the same exit signature repeats for `00008-fc5`'s predecessor instance at 02:08:29Z). 82 `timeout exceeded when trying to connect` lines appear in the final log window alone.
- Even `run.cancel` jobs failed after exhausting retries (iters 2, 3, 4) — queue starvation is total, not launch-path-specific.

This is the documented D-P0.15h-3 shape: on the throttled 0.5 vCPU, the lazy `@kubernetes/client-node` import / launcher construction and pg-boss startup starve the DB pool; connection-acquisition timeouts take out consumers, the timekeeper, and — twice — the whole instance (`exit(1)`). With `startupCpuBoost=true` it still fails: the boost covers container startup, not the steady-state throttled import under load.

## Driver incident disclosure (honest bookkeeping)

The first driver pass completed iterations 1–5, then crashed during iteration 6 on an unhandled pg-boss client `error` event (`Connection terminated due to connection timeout` — an IAP-tunnel blip; the supervisor's own maintenance query, not an awaited call). That pass's iteration-6 `run.start` never landed; only its seed row did. The driver was made resilient (`boss.on("error")`/`pool.on("error")` logging listeners, `--from` resume flag, idempotent run seed, `verdictFor([])` now fails closed red) and iteration 6 was re-run from scratch on fresh revision `00008-fc5`: **failed**, `queued`, no markers, 601.8 s observed. The incident is a measurement-harness event only; it does not soften the worker-under-test result — iteration 6 failed identically on re-measurement, and iterations 1–5 alone already forced red.

## Files in this report

- `worker-soak.json` — machine-readable verdict + all six iteration records (1–5 reconstructed from the driver log and the `pgboss.job` ledger; flagged in `driverIncident`).
- `soak-report.md` — this file.
- `worker-posture.txt`, `worker-describe.json` — live Cloud Run shape proof.
- `image-provenance.txt` — build ids + pinned digests.
- `stack-config.txt` — Pulumi stack config (no secrets).
- `worker-logs-partial.txt`, `worker-logs-mid.txt`, `worker-logs-final.txt` — worker log windows covering revisions 00001–00008.

## Resource-hours / spend

- Preview stack lifetime: Pulumi `up` converged ~2026-10-21T23:5xZ (after AlloyDB `us-central1` capacity retries); destroyed 2026-10-22T02:2xZ — **≈ 2.5–3 h**.
- Dominant cost: AlloyDB ZONAL preview posture (~$0.1–0.2/h) + Cloud Run min-instance worker/api/etc + 2 Cloud Build runs (~10–11 min each on the free-ish/private pool). **Estimated spend ≈ $2–4 — inside the $8 budget.** Recorded in the run ledger.

## Disposition

- `D-COST.1-3` stays OPEN (the deferral conditions the production flip on a GREEN soak; this soak is RED).
- `R6INF.1` must not flip prod to 0.5/512Mi on this evidence; if right-sizing is still wanted it needs a re-scoped fix (e.g., eager launcher import, pg-boss pool sizing for throttled CPU, or 0.75 vCPU) and a fresh soak.
- Production and shared/dev stages were never touched; `stages.ts` keeps them at `1 vCPU / 1Gi`.
