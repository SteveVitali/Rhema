## Summary

R6SOAK.1 — worker right-size soak on a preview (0.5 vCPU / 512Mi) (REQ-ENG-7; spec
`docs/round-6-draft-spec.md` §4.1; manifest row 185; DEFERRALS `D-COST.1-3` (a) / `D-P0.15h-3`).
The batch-2 gate ruling authorizes the worker's `1 vCPU/1Gi → 0.5 vCPU/512Mi` flip **only** on a
green cold-import soak reproducing the D-P0.15h-3 failure-mode condition. This PR lands the
preview-only stage fact + the soak driver, then runs **N=6** pre-registered cold-import
iterations on an owned `pr-<n>` preview (stack = this PR number) at chain-tip images. **Zero prod
mutations; the prod flip is R6INF.1's and only on soak-green.**

## What changed

- `infra/config/stages.ts` — `cloudRunPosture` gains explicit `workerResources` +
  `workerCpuBilling` parameters; the **preview** stage pins `{ cpu: "0.5", memory: "512Mi",
  startupCpuBoost: true }` + request billing. **Live finding F-R6SOAK.1-1 (load-bearing):**
  Cloud Run refuses `limits.cpu < 1` under `cpuIdle:false` — the 0.5 vCPU candidate exists
  ONLY request-billed, which is the D-P0.15h-3 throttled posture itself. The soak measures the
  only realizable candidate shape. Dev and prod keep the D-P0.15h-3-pinned `1 vCPU/1Gi`
  instance-billed shape — no shared-stage change.
- `infra/config/stages.test.ts` — pins the preview worker shape (0.5/512Mi + boost + request
  billing + min≥1), scopes the "never request-billed" invariant to dev+prod with the soak
  rationale recorded, and re-pins dev's `1 vCPU/1Gi` so the pair can't drift.
- `scripts/live/worker-soak.mjs` (+ `.test.mjs`, 13 pins) — the soak driver. Per iteration:
  bump `RHEMA_SOAK_ITER=<i>` on `rhema-pr-<n>-worker` (a new revision ⇒ a guaranteed cold
  process ⇒ the lazy `import("@kubernetes/client-node")` re-exercises), seed a `queued` run
  fixture on an `is_test` workspace, send the real `run.start` pg-boss job (the api's verbatim
  name/payload/singleton key), then watch `slo_samples` for the `run_start_stage_ms`/`job_launch`
  sample and the worker log window for the launcher's `timeout after`/`launch attempt N/3
  failed` markers — firing that machinery IS the throttled signature. Launch lands →
  `run.cancel` so no pod reaches provider spend. Verdict GREEN iff all N clean.
- `docs/build/runs/R6SOAK.1.md` — run ledger with the **pre-registered** N=6 contract,
  thresholds, and fixture shape (written before any live run).
- `docs/build/reports/<date>_R6SOAK.1/` — committed soak evidence (config, image provenance,
  per-iteration ledger, signature analysis, teardown + orphan sweep, resource cost).

## Live leg (executed on the owned `pr-206` preview) — **VERDICT: RED**

The soak ran live on stack `pr-206` (worker digest `77fee0f5…`, live-asserted
`cpu=0.5`/`memory=512Mi`/`cpu-throttling=true`/`startup-cpu-boost=true`/min=max=1). **All six
pre-registered iterations failed** — this is a clean reproduction of `D-P0.15h-3`, not a
borderline result:

- **Zero** `run_start_stage_ms` SLO samples landed across all six iterations — the launch path
  (`handleRunStart → provisionRun → ensureLauncher → import("@kubernetes/client-node")`) never
  reached its first SLO write.
- Iters 1/2/5: `run.start` consumed → `provisioning` → `building GKE launcher` logged → handler
  hung past `expire_seconds=900` → pg-boss retried to `retry_limit` → `failed`.
- Iters 3/4/6: the `run.start` job sat `created` the whole 600 s window — the pg-boss consumers
  never fetched it while the starved instance churned.
- Revision `00004-k7j` **crashed at cold start** — `pg-boss connect timeout → exit(1)` — the
  mass-DB-connection-starvation signature. Even `run.cancel` jobs exhausted retries (iters
  2/3/4): the starvation is queue-wide, not launch-path-specific.
- Iter-6 caveat, honestly disclosed: the first driver pass crashed mid-iteration on a tunnel-side
  pg-boss `error` event (before its send landed); the driver was hardened
  (transient-error listeners, `--from` resume, idempotent seed, fail-closed empty verdict) and
  iter 6 re-measured on a fresh revision — failed identically.

`D-COST.1-3` (a)'s conditional authorization is **not discharged** — R6INF.1 must not flip prod
to 0.5/512Mi on this evidence; the lever needs a redesign (eager import / pool sizing under
throttle / different size) and a fresh soak. Evidence: `docs/build/reports/2026-10-21_R6SOAK.1/`
(`soak-report.md`, `worker-soak.json`, three worker-log windows, posture/provenance dumps).
Preview destroyed via the guard; orphan sweep + cost in the run ledger. Spend ≈ $2–4 < $8.

## Verification

`pnpm turbo build lint typecheck` — 135/135 · `pnpm test` — 511 files, 6,033 pass / 4 skip /
0 fail (incl. the 15 driver pins + preview-worker stage pin; the `privsep.docker` leg failed
once mid-outage on a registry.npmjs.org 503 inside the docker `pnpm install` and passes clean
on retry post-recovery — environmental, unrelated to the diff) ·
`check:licenses`, `check:protocol-markers`, `check:no-cookies`, `check:spa-budget`,
`check:spa-env`, `check:dom-contract` — all OK · `check-build-memory.sh` 0 violations ·
`check-append-only.mjs --base 3c93544` OK.

## Boundaries

Zero prod writes; owned `pr-<n>` preview only (`^pr-\d+$` guard + ownership tag on every
mutating verb); no secrets in code/logs/reports; `mergePolicy: OPERATOR` — never merges.
