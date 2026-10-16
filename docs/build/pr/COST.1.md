# COST.1 — Production cost-posture levers (live-executed, $285.80 → $198.32/mo)

Manifest row 164 · stacks on `stevevitali/bl38-1-prod-residue-cleanup` (tip `5631d5d`,
the HUMAN-H9 readout commit) · merge policy **OPERATOR** — do not merge from the build
environment · contract `docs/tickets/164_COST.1__prod-cost-posture.md` (expanded at run
time from skeleton on the H9 ruling) · run ledger `docs/build/runs/COST.1.md` · live
evidence `docs/build/reports/2026-10-16_COST.1/`.

## What lands

The skeleton ticket expanded per `decompose-spec mode=extend` on the **HUMAN-H9 ruling**
— option (a): the ~$50/mo prod target stands → architecture change required ("cold
floors, consolidation"), with **class-level lever pre-authorization** ("e.g. all
scale-to-zero floors; all consolidation moves — COST.1 executes inside the classes
without re-asking"). The expansion names every lever's class; execution paused on
anything unmappable.

**Executed — `pulumi up` update 151 (2026-10-16, 1m1s, 6 updates, 0 create/delete/
replace), all inside H9 Class A (scale-to-zero / cold floors):**

- **REQ-COST-2 — the convert-svc live-vs-IaC drift, REVERTED.** Live carried an
  out-of-band `run.googleapis.com/cpu-throttling:"false"` (instance-billed, ~$39–51/mo
  of the warm floor) while IaC implied request-based billing. `cpuIdle` is now declared
  **explicitly** from the stage fact — a billed-posture divergence can never sit split
  from IaC again. Live post-up: `cpu-throttling:"true"`, `minScale:1` (the
  `import_preview_p95_s` ≤ 20 s floor is preserved — it IS the service's purpose).
- **REQ-COST-1 — the five request-billed floors to zero:** api, web, collab, export,
  fetcher `minScale 1→0`. Live post-up: all five at `minScale:'0'`,
  `cpu-throttling:'true'`.
- **Recomputed posture (`billing-read.mjs`, live inventory × Catalog SKUs):**
  **$285.80 → $198.32/mo** (−$87.48; Cloud Run warm floor $152.28 → $64.80 = convert-svc
  $12.96 + worker $51.84 + the rest $0). Billed actuals remain gated on D-OPS.2-1 (the
  console-only BigQuery export) → **D-COST.1-1** — no bill-derived number is fabricated.

**Engineered:**

- **REQ-COST-3 — `infra/config/stages.ts` `cloudRun` posture block.** Min-instance
  counts, CPU-billing mode (`"request"`/`"instance"`), and per-service resource shapes
  are test-asserted **stage facts** now; `compute.ts` consumes them verbatim — the last
  `cfg.kind === "prod"` posture ternaries are gone. A cost lever is a fact flip the
  tests pin, never a program edit.
- **REQ-COST-4 — `docs/ops/redis-degradation-analysis.md`.** All consumers mapped:
  throttles (ADR-039 in-memory fallback), SSE fan-out (re-poll fallback),
  `RedisHeartbeatStore` (**no fallback — the orphan reaper requires it**). Verdict:
  Redis removal is a design change, not a COST.1 lever.
- **REQ-COST-5 — worker right-size engineered as a stage fact** (`services.worker.
  resources`), execution **paused** out-of-class with its soak-leg spec on D-COST.1-3
  (the soak must reproduce D-P0.15h-3's throttled cold-import failure mode).

**Kept warm deliberately:** worker `min=1` `instance`-billed — forbidden to zero
(pg-boss consumers + every cron die at 0); convert-svc `min=1` request-billed — its
floor IS the SLO design, and the measured `import_preview_p95_s` re-probe reads
`empty` (no traffic) → **D-COST.1-2** decides the zero-flip on evidence.

**Paused out-of-class → D-COST.1-3:** worker right-size (shape change + soak), GKE
node spot/zero-scale (preemption loses in-flight runs), SQL `db-f1-micro` (not
prod-ready per D1-F5), Redis removal/tier (design change), proxy MIG sizing
(fail-closed egress), and the D-OPS.2-2 HA set (cost-INCREASING — contrary to
ruling (a)). **Resolved by read:** the second in-use IPv4 is the Cloud NAT auto-IP —
no lever (D1-Q2).

**The honest finding:** $198.32 is still ~4× the $50 target. The in-class levers were
necessary but not sufficient; the remaining ~$145/mo needs the out-of-class redesign
moves (consolidation candidates: Redis→DB-backed heartbeat, GKE→Cloud-Run-Job run-task)
— reported, never expanded past the authorization.

**Post-deploy verification:** `[slo]` probe loop alive post-up (tick 01:35:18Z); the
only firing signal is the *standing* `run_success_rate_24h_pct` empty-cohort violation
(predates the deploy — no new breach). Cold-start curls: `rhema.tools/` 200 in 1.42 s
cold → 0.14 s warm; `api.rhema.tools/healthz` 0.28 s → 0.10 s. Healthz provenance
unchanged (`build.gitSha=ffbb8ad0…` on api+web — scaling-only revision rolls, no image
rebuild).

## What changed

- `infra/config/stages.ts` — `CloudRunServicePosture`/`CloudRunPosture` types +
  `cfg.cloudRun` facts per stage; prod's request-billed services scale to zero.
- `infra/pulumi/compute.ts` — services loop + convert-svc consume `cfg.cloudRun`;
  `cpuIdle` declared on every service; collab max=1 pin preserved.
- `infra/config/stages.test.ts` / `infra/pulumi/compute.test.ts` — posture pins
  (forbidden-to-zero worker, convert-svc request-billed, non-prod floors) +
  posture-consumption structural assertions.
- `docs/ops/redis-degradation-analysis.md` — REQ-COST-4 deliverable.
- `docs/tickets/164_COST.1__prod-cost-posture.md` — the run-time expansion (H9 classes,
  lever execution map, acceptance criteria).
- `docs/tickets/DEFERRALS.md` — D-OPS.2-2 → **PARTIAL** (executed subset evidence;
  worker right-size + HA set forward to D-COST.1-3); new COST.1 section:
  D-COST.1-1 (billed actuals ← D-OPS.2-1), D-COST.1-2 (measured `import_preview`
  re-probe), D-COST.1-3 (paused out-of-class levers).
- `docs/build/reports/2026-10-16_COST.1/` — preview diff, up log, post-up inventory,
  billing-read-after.json, cold-start probes, healthz provenance, slo logs.

## Test plan

| Contract clause | Test |
|---|---|
| prod scale-to-zero floors as stage facts | `stages.test.ts` posture pins |
| worker forbidden-to-zero + `instance` billing | `stages.test.ts` (fails on any edit that zeros/request-bills the worker) |
| convert-svc `cpuBilling:"request"` codified revert | `stages.test.ts` + `compute.test.ts` |
| `compute.ts` consumes `cfg.cloudRun` verbatim (no ternaries) | `compute.test.ts` structural pins |
| collab max=1 at every stage (single-writer) | `stages.test.ts` |
| preview → up → live inventory → billing-read → cold-start | `reports/2026-10-16_COST.1/` |

## Boundaries

Prod mutations were exactly the six class-A updates in `pulumi up` update 151, gated by
a `preview --diff` showing nothing else. No image rebuilds, no data writes, no paid
legs, no other tenants' data, no secrets in files/ledgers. `$0` reads (gcloud, Pulumi
state, logging) everywhere else. Out-of-class levers paused — never executed.

Requirement ids stamped: **REQ-COST-1 REQ-COST-2 REQ-COST-3 REQ-COST-4 REQ-COST-5
REQ-COST-6**.
