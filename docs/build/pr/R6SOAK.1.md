## Summary

R6SOAK.1 — worker right-size soak on a preview (0.5 vCPU / 512Mi) (REQ-ENG-7; spec
`docs/round-6-draft-spec.md` §4.1; manifest row 185; DEFERRALS `D-COST.1-3` (a) / `D-P0.15h-3`).
The batch-2 gate ruling authorizes the worker's `1 vCPU/1Gi → 0.5 vCPU/512Mi` flip **only** on a
green cold-import soak reproducing the D-P0.15h-3 failure-mode condition. This PR lands the
preview-only stage fact + the soak driver, then runs **N=6** pre-registered cold-import
iterations on an owned `pr-<n>` preview (stack = this PR number) at chain-tip images. **Zero prod
mutations; the prod flip is R6INF.1's and only on soak-green.**

## What changed

- `infra/config/stages.ts` — `cloudRunPosture` gains an explicit `workerResources` parameter;
  the **preview** stage pins `{ cpu: "0.5", memory: "512Mi", startupCpuBoost: true }` (instance
  billing + min 1 preserved — exactly the candidate shape a green verdict would flip prod to).
  Dev and prod keep the D-P0.15h-3-pinned `1 vCPU/1Gi` shape — no shared-stage change.
- `infra/config/stages.test.ts` — pins the preview worker shape (0.5/512Mi + boost + instance +
  min≥1) and re-pins dev's `1 vCPU/1Gi` inside the same test so the pair can't drift.
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

## Live leg (executed on the owned `pr-<n>` preview)

Bring-up per the VERIF.2 runbook: `preview-stack.mjs init` → config → targeted AR repo →
`gcloud builds submit infra/cloudbuild/image-set.yaml` (all 10 images, this HEAD sha) → digest
pins → `up` → migrate Job → post-up k8s (`runs` namespace + worker launcher RBAC + KSA/NetPol) →
non-prod `anthropic-api-key` seeded into the preview's own container → IAP tunnel through the
preview's egress-proxy VM → driver with `RHEMA_SOAK_DATABASE_URL` (system-role DSN, never
printed). `destroy` → full `rhema-pr-<n>-*` orphan enumeration → `rm` → cost table vs the $8
resource-hours budget. Results land in the run ledger + report dir at closeout.

## Verification

`pnpm turbo build lint typecheck` — 135/135 · `pnpm test` — 511 files, 6,030 pass / 6 skip /
0 fail (new pins 42/42 incl. the 13 driver pins + preview-worker stage pin) ·
`check:licenses`, `check:protocol-markers`, `check:no-cookies`, `check:spa-budget`,
`check:spa-env`, `check:dom-contract` — all OK · `check-build-memory.sh` 0 violations ·
`check-append-only.mjs --base 3c93544` OK.

## Boundaries

Zero prod writes; owned `pr-<n>` preview only (`^pr-\d+$` guard + ownership tag on every
mutating verb); no secrets in code/logs/reports; `mergePolicy: OPERATOR` — never merges.
