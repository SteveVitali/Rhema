# COST.1 — Production cost-posture levers (REQ-COST-1..6)

- **Sequence:** 164 · **Phase:** round 5 · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 163_HUMAN-H9 (posture ruling — **RULED 2026-10-16, option (a)**) +
  D-OPS.2-1 (billing export — REQ-COST-1's billed-actuals before/after read; **still OPEN,
  operator-owed via H8 — non-blocking per the H8 deferral rule**)
- **Run:** `implement-spec spec=docs/tickets/164_COST.1__prod-cost-posture.md`
- **Gate status:** expanded 2026-10-16 on the H9 ruling — class-level lever authorization
  (below); anything unmappable to a named class pauses for the operator
- **Live stage:** operator-authorized per lever CLASS (H9); $0 reads + `pulumi preview`
  evidence per change; `pulumi up` only for levers inside a named class
- **Production mutations:** per-lever, ONLY through `pulumi up` with provenance recorded
  (update id + preview diff ledgered), ONLY inside a named authorized class
- **Size budget:** ~450 changed lines (stages.ts posture facts + compute.ts consumption +
  tests + Redis analysis + docs/ledgers)

> **Expanded 2026-10-16** — was `Kind: skeleton` gated on HUMAN-H9. The ruling landed
> (`docs/build/readouts/HUMAN-H9.md`): **(a) the ~$50/mo target stands → architecture
> change required (cold floors, consolidation); lever pre-authorization is CLASS-LEVEL.**
> Body below is the run-time expansion scoped to the ratified ruling-(a) levers.

## The H9 lever classes (verbatim basis)

The operator pre-authorized **classes** of changes — "e.g. all scale-to-zero floors; all
consolidation moves" — under ruling (a) ("cold floors, consolidation"). Execution inside a
named class needs no further pause; a lever that cannot be honestly mapped pauses.

| Class | Named in H9? | Contents |
|---|---|---|
| **A — scale-to-zero / cold floors** | yes ("all scale-to-zero floors") | minInstances→0 on any Cloud Run service the product tolerates; CPU-billing posture toward request-billed (the cold-floor half of `cpuIdle`) |
| **B — consolidation moves** | yes ("all consolidation moves") | removing/consolidating always-on components (none executed this run — see §Out-of-class) |
| *(out-of-class — PAUSE)* | — | resource shape changes that are neither floors nor consolidation: worker right-size, GKE node posture (spot/zero-scale design), SQL down-tier, Redis removal/tier, proxy MIG sizing, any HA (cost-INCREASING) lever, convert-svc min→0 while `import_preview_p95_s` ≤20 s is unproven cold |

## Lever execution map (D1-F5 × H9 classes × live evidence)

Measured baseline (`scripts/live/billing-read.mjs --json`, 2026-10-16T01:21Z):
**$285.80/mo** — Cloud Run warm floor $152.28 = convert-svc $51.84 (live
`cpu-throttling:"false"` DRIFT vs IaC) + worker $51.84 + api/web/collab/export/fetcher
5×$9.72 (request-billed min=1) + turbo-cache/ops-alert-catcher $0 (already min=0).

| Lever | Δ $/mo | Class | Disposition |
|---|---|---|---|
| convert-svc `cpuIdle`→request-billed (codify the revert — REQ-COST-2) | −42.12 | **A** (cold floor; matches committed IaC intent) | **EXECUTE** — explicit `cpuBilling:"request"` stage fact → `pulumi up` flips the out-of-band `cpu-throttling:"false"` annotation |
| export + fetcher min 1→0 | −19.44 | **A** | **EXECUTE** |
| api + web + collab min 1→0 | −29.16 | **A** ("all" floors; user-facing cold starts are ruling-(a)'s accepted consequence) | **EXECUTE** — REQ-COST-6 live re-verify after |
| worker min 1 (pg-boss consumers + all crons) | — | forbidden to zero (D1-F5) | **KEEP warm** — never scale-to-zero |
| worker right-size 1vCPU/1Gi → 0.5/512Mi | −26 | **out-of-class** (a shape change, not a floor/consolidation; + REQ-COST-5 soak) | **PAUSE** → D-COST.1-3; stage fact engineered so the authorized flip is one field |
| convert-svc min 1→0 | −9.72 | **A** but SLO-blocked | **PAUSE in-class** — the warm floor IS the `import_preview_p95_s` ≤20 s design (ONB.1/ADR-044); a cold-start re-probe (D1-Q4) is owed before zeroing → rides D-COST.1-2 |
| GKE run-task node spot / scale-to-0 | ~−20–28 | **out-of-class** (design change — preemption can lose an in-flight run; needs the autoscaling block) | **PAUSE** → D-COST.1-3 |
| Cloud SQL `db-g1-small`→`db-f1-micro` | ~−18–20 | **out-of-class** ("too thin to call prod-ready" — D1-F5) | **PAUSE** → D-COST.1-3 |
| Redis removal / tier | −35.77 | **out-of-class** (design change — REQ-COST-4 analysis delivered instead) | **PAUSE** → D-COST.1-3 |
| proxy e2-small→e2-micro / MIG off | ~−5/−12.63 | **out-of-class** (fail-closed egress dies when down) | **PAUSE** → D-COST.1-3 |
| HTTPS LB | −18.41 | not realistically removable (domains/cert/CDN/WSS/XFF chain) | **no lever** |
| external IPv4 release | −3.65 | **resolved: NO lever** — the 2nd in-use addr is the Cloud NAT auto-IP (load-bearing; D1-Q2 answered) | **closed by read** |
| HA levers (SQL REGIONAL +25.55, STANDARD_HA Redis +35.77, proxy MIG ×2 +12.2) | +cost | **out-of-class** and contrary to ruling (a) (they raise spend) | **PAUSE** → D-COST.1-3 (carried forward from D-OPS.2-2's HA half) |

**Projected post-execution floor:** 285.80 − 42.12 − 48.60 ≈ **$195/mo** — still ~4× the
$50 target. That IS the honest ruling-(a) finding: the in-class levers are necessary but
not sufficient; the remaining ~$145 gap needs the out-of-class redesign moves the operator
has NOT yet authorized (consolidation candidates: Redis→DB-backed heartbeat, GKE→Cloud-Run
Job run-task, single-service consolidation). Reported, not expanded.

## Goal

Execute the ruling-(a) in-class cost levers against the $285.80/mo posture with measured
honest evidence: FIRST the convert-svc live-vs-IaC `cpu-throttling:"false"` drift reconcile
(REQ-COST-2 codify-or-revert → **revert**, codified as an explicit request-billed stage
fact), then the scale-to-zero floor levers (REQ-COST-1 with `billing-read.mjs` before/after
recompute), the `stages.ts` fact moves (REQ-COST-3), the Redis degradation analysis
(REQ-COST-4), the worker right-size engineering + soak-leg spec (REQ-COST-5 — execution
paused out-of-class), and the §13.5 SLO re-verify after the executed levers (REQ-COST-6).

## Requirements (REQ-COST-1..6, D1 × BL-29)

1. **REQ-COST-1** — execute the authorized warm-floor levers; `billing-read.mjs` BEFORE and
   AFTER each `pulumi up`, deltas ledgered. The **billed-actuals** before/after read is owed
   separately — D-OPS.2-1 (the console-only export flip, H8) gates it → D-COST.1-1.
2. **REQ-COST-2** — the convert-svc `cpu-throttling:"false"` live-vs-IaC divergence is
   codified-or-reverted in the same `up`, never left split: **revert** (live converges to
   the request-billed IaC intent; codifying the warm state would contradict ruling (a)).
3. **REQ-COST-3** — min-instance / CPU-billing facts move from `compute.ts` ternaries into
   `infra/config/stages.ts` as test-asserted stage facts (a per-service posture block the
   Pulumi program consumes verbatim).
4. **REQ-COST-4** — Redis degradation analysis over ALL consumers (throttles w/ ADR-039
   fallback, SSE fan-out w/ re-poll fallback, `RedisHeartbeatStore` reaper w/ NO fallback,
   the `import_preview` first-seen clock) — removal stays a design change; the analysis is
   the deliverable (`docs/ops/redis-degradation-analysis.md`).
5. **REQ-COST-5** — worker right-size is engineered as a stage fact + the soak leg is
   spec'd (it must reproduce D-P0.15h-3's throttled cold-import failure mode); execution is
   PAUSED as out-of-class → D-COST.1-3.
6. **REQ-COST-6** — after the executed levers: the §13.5 probe state re-read live (the
   worker's 5-min `probeSlos` + `[slo]` lines), cold-start latency measured on the public
   origins, the measured `import_preview_p95_s` re-probe ledgered (empty→D-COST.1-2 when no
   real preview traffic exists in the window).

## Acceptance criteria

- [x] `stages.ts` carries the per-service Cloud Run posture block; every prod scale-to-zero
  fact is test-asserted (worker stays min=1 instance-billed — the forbidden-to-zero pin);
  `compute.ts` consumes the facts verbatim (no min/max/cpuIdle ternary left). *(engineered —
  `stages.test.ts` + `compute.test.ts` pins)*
- [x] `pulumi preview --diff` before the `up` shows ONLY the authorized lever updates
  (6 services' `template.scaling` + convert-svc `resources.cpuIdle`); zero stateful
  replace/delete. *(live-executed — `reports/2026-10-16_COST.1/pulumi-preview-diff.txt`:
  6 updates / 166 unchanged)*
- [x] `pulumi up` executed per in-class lever set with provenance (update id + duration
  ledgered); post-`up` `gcloud` inventory reads min=0 on api/web/collab/export/fetcher,
  `cpu-throttling:"true"` on convert-svc, worker unchanged. *(live-executed — update 151,
  1m1s; `pulumi-up.txt` + `post-up-inventory.txt`)*
- [x] `billing-read.mjs` before + after committed; the after total ≈ projected. The
  billed-actuals read is `met-engineered(D-COST.1-1)` — never fabricated. *(live-executed
  recompute — $285.80 → $198.32; engineered for actuals — gated on D-OPS.2-1)*
- [x] Redis degradation analysis committed (`docs/ops/redis-degradation-analysis.md`) —
  all four consumers + the no-fallback reaper named. *(engineered)*
- [x] §13.5 re-verify: probe readings post-deploy + cold-start measurements on
  `rhema.tools`/`api.rhema.tools`; the `import_preview` measured re-probe is
  `met-engineered(D-COST.1-2)` if the window carries no samples. *(live-executed —
  probe ticks green post-up, cold starts 1.42 s/0.28 s → ~0.1 s; engineered for the
  measured window — `import_preview_p95_s` reads `empty`)*
- [x] Out-of-class levers paused + ledgered (D-COST.1-3) — nothing executed that the
  class ruling does not honestly cover. *(agentic — preview showed exactly the 6
  class-A updates)*
- [x] verification green; BUILD_INDEX row + LEDGER advanced; DEFERRALS rows updated
  (D-OPS.2-2 dispositioned with evidence). *(agentic — turbo 135/135, vitest 5,804 pass,
  six check:* green; D-OPS.2-2 → PARTIAL; D-COST.1-1/-2/-3 opened)*

## Spec §§

`docs/post-spa-disposition-spec.md` §7 BL-29 row · `docs/research/r5_d1_cost-levers.md`
(lever inventory verbatim — D1-F1..F7, Q1–Q6) · `docs/build/readouts/HUMAN-H9.md` (the
ruling + class granularity) · DEFERRALS D-OPS.2-1/-2, D-SLO.1-* · `infra/PROD-BRINGUP.md`
§12c (HA pre-plan)

## Out of scope

- Anything outside classes A/B — every F5 lever marked out-of-class above is PAUSED
  (never expanded by this run).
- The HA lever set (cost-increasing) — carried forward, not executed.
- Redis removal itself (design change — the analysis is the deliverable).
- Image rebuilds / code deploys beyond the IaC posture change; migrations; DNS;
  `signup.mode`; any what-users-are-charged change; any prod data write.

## Notes

- The convert-svc drift origin (D1-Q1: deliberate ONB.1 verification set vs accidental)
  is UNRESOLVED — codifying `cpuBilling:"request"` explicitly makes the IaC intent
  self-documenting either way; the `up` converges live to it.
- D1-Q2 (second IPv4) answered live: the Cloud NAT auto-IP — no lever exists.
- D1-Q5 (api throttled-idle crash claim) is moot at min=0 (no idle instance) — the
  `boss.on("error")` handler exists regardless.
- Provenance: scaling changes roll new revisions on the SAME pinned images — the
  `deployments`/healthz provenance SHA is unaffected (no image rebuild).
