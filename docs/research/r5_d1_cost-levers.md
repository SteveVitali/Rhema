# d1_cost-levers — Prod cost decomposition and lever inventory
**Stream:** D · **Researched:** 2026-10-14 · **Ledger rows covered:** D1 · **Confidence:** high (committed OPS.2/ADR-082 decomposition verified against current IaC)

### F1 — The $285.80/mo is a bottom-up list-price recompute, not billed actuals
`scripts/live/billing-read.mjs` re-derives from live gcloud inventory × Billing Catalog list prices; the billing-export dataset exists but is EMPTY (console-only flip owed — D-OPS.2-1 OPEN). Logging/Monitoring ingestion is absent from the catalog pull (LB logs every request at sampleRate 1.0 — tail UNVERIFIED, likely small).

**Committed decomposition (OPS.2.md:188–202, list $/mo):**
| Line | Inventory fact | $/mo |
|---|---|---|
| Cloud Run warm floor (9 svc) | 7 svc minScale=1; convert-svc + worker instance-billed | **152.28** |
| Memorystore Redis | Basic M1 1 GiB | 35.77 |
| GKE run-task node | e2-medium ×1 + 100 GB pd | 28.46 |
| Cloud SQL | `db-g1-small` zonal + 10 GB SSD + backups | 28.05 |
| HTTPS LB | 1 fwd rule + ~20 GB | 18.41 |
| Proxy MIG | e2-small ×1 + 10 GB pd | 12.63 |
| External IPv4 | 2 in-use | 7.30 |
| Cloud NAT / AR / SM / GCS | | ~2.90 |
| **TOTAL** | | **285.80** |

### F2 — Deployed shape (verified against IaC)
- Cloud Run: export/fetcher/api/web/collab min=1/max=10; worker min=1/max=3 1vCPU/1GiB `cpuIdle:false` (required — pg-boss consumers + crons; the throttled 9-min k8s-client cold-import is a live finding, D-P0.15h-3); collab maxScale=1 everywhere; convert-svc min=1/max=4 `startupCpuBoost`; no concurrency overrides (default ~80).
- Zero Cloud Scheduler jobs — every cron is pg-boss inside the worker (run.reap 1-min, slo.probe 5-min, test-tenant.purge hourly, usage.reconcile nightly, slo.review.weekly) — already priced into the worker's $51.84.
- No AlloyDB (`stages.ts:349` cloudsql); `ops-alert-catcher` is a hand-deployed out-of-band service (min=0, $0, not in Pulumi).
- Budget alert `rhema-prod-budget-50` $50/mo 50/90/100 thresholds — the ADR-082 compensating control.

### F3 — NEW: the single biggest lever is a live-vs-IaC divergence, not a posture change
IaC sets `cpuIdle:false` **only** on worker; convert-svc has no `cpuIdle` field → should be request-billed. Yet live inventory shows `run.googleapis.com/cpu-throttling:"false"` on `rhema-prod-convert-svc` — set out-of-band between ONB.1 (10-02) and OPS.2 (10-03). Reverting = **−$44/mo**, matches committed IaC — but it's a §13.5 SLO path (`import_preview_p95_s` ≤20 s), so honest classification = *operator-confirmable drift-fix*, not autonomous.

### F4 — Redis is more load-bearing than documented
Shared api+worker (`web` has NO Redis — stale comment). Consumers: shared signup/magic-link throttles (ADR-039 in-memory fallback exists), SSE fan-out (poll fallback exists), and **`RedisHeartbeatStore` — the `run.reap` orphan sweep has NO fallback**. Removal is a design change, not a lever.

### F5 — Lever inventory (condensed; all Pulumi-expressible unless noted)
| Lever | Δ $/mo | Risk | Authority |
|---|---|---|---|
| convert-svc: revert live cpu-throttling drift → request-billed | **−44** | cold-CPU vs `import_preview_p95_s` 20 s SLO | operator-confirmable drift-fix |
| export + fetcher minScale 1→0 | **−19.4** | cold start on import/discover/export paths | per-change operator |
| api/collab/web minScale 1→0 | **−29** | user-facing cold starts | per-change operator |
| worker right-size → 0.5 vCPU/512 MiB | **−26** | queue throughput + the known cold-import failure mode — needs soak | operator + soak |
| worker minScale→0 | — | kills all consumers/crons | **forbidden** |
| SQL `db-g1-small`→`db-f1-micro` | ~−18–20 | 0.6 GiB shared-core, no SLA — "too thin to call prod-ready" | per-change operator |
| SQL disk→HDD / backups shorter | ~−1 | weakens REQ-ARCH-28 | operator; poor $/risk |
| Redis removal | −35.77 | kills heartbeat reaper | design ticket |
| GKE node spot / scale-to-0 | ~−20–28 | preemption can lose in-flight run; provision minutes vs `run_start_latency` SLO | operator / design change |
| Proxy e2-small→e2-micro / deployProxyMig off | ~−5/−12.63 | fail-closed egress dies when down | operator |
| HTTPS LB | −18.41 | carries domains/cert/CDN/collab-WSS/XFF chain | not realistically removable |
| IPv4 release | −3.65/addr | second in-use addr UNVERIFIED | operator |

### F6 — Authority posture
Every lever = committed-code change → PR → OPERATOR merge → `pulumi up`. OPS.2's pre-authorization covered only "additive drift fixes + stateless cache ≤$15/mo" — all F5 levers are plan-only → parked as **D-OPS.2-2 OPEN**. ADR-082's revisit trigger: "if the operator rules the ~$50 target immutable, the D-OPS.2-2 warm-floor levers become an execute ticket" — **the posture ruling itself is the gate.**

### F7 — Floor math honesty
Levers 1–3 ≈ −$92 → ~$194/mo, still 4× target. Under $95 needs worker right-size + state levers (GKE spot/zero-scale, Redis removal, proxy, SQL down-tier). **A ~$50 prod cannot run this architecture warm — no committed artifact supports $50-achievable; the ruling is target-vs-posture, not lever selection.**

## Open questions
1. Origin of live `cpu-throttling=false` on convert-svc — deliberate ONB.1 verification set or accidental? (drift-fix vs posture-change)
2. Second in-use external IPv4 — unaccounted in IaC.
3. Logging/Monitoring tail absent from recompute — D-OPS.2-1 actuals will reveal.
4. Does request-based convert-svc hold `import_preview_p95_s` ≤20 s? Live re-probe needed post-flip.
5. api "crashes if CPU-throttled while idle" claim (16_P0.15g) — fixed by `boss.on("error")` or lurking? Matters at min=0.
6. GKE scale-to-zero needs an autoscaling block — design question for the $50 ruling.

## Spec requirements emitted
- **REQ-OPS-1:** lever execution re-runs `billing-read.mjs` before+after, delta recorded in the ticket ledger.
- **REQ-OPS-2:** live-vs-IaC billed-posture divergences must be codified or reverted in the same `up` — never left split.
- **REQ-OPS-3:** min-instance/CPU-billing facts should move from `compute.ts` ternaries into `stages.ts` (test-asserted) if lever execution becomes routine.
- **REQ-OPS-4:** Redis changes gated on degradation analysis of all three consumers (throttles, SSE, heartbeat reaper — last has no fallback).
- **REQ-OPS-5:** worker shape changes require a soak leg reproducing D-P0.15h-3's cold-import failure mode.
- **REQ-OPS-6:** api/web/collab min-instance levers must re-verify §13.5 latency SLOs live and record the probe.
