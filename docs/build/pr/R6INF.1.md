# R6INF.1 — Infra posture: SQL REGIONAL landed; proxy MIG×2 withheld (live-found); worker withheld (REQ-DEP-3)

## Summary

Applies the GD-HA.R6-authorized HA levers to prod through the stage-fact path —
**Cloud SQL `availabilityType` `ZONAL → REGIONAL` landed and live-verified** — while the
**proxy MIG×2 lever was withheld before `pulumi up`** on a live-found design blocker
(**F-R6INF.1-1**: the proxy template pins the single static internal IP `10.8.16.4`, so a
size-2 MIG can never create its second instance, and failover would need an internal-LB
frontend the ruling never priced). The worker stays at **1 vCPU / 1 GiB** — the R6SOAK.1
soak was **RED** (6/6 cold-import iterations failed), so the conditional authorization for
the 0.5/512Mi flip is not discharged. Redis HA stays declined; levers (b)–(e) untouched.

## Production mutations performed

| Mutation | Preview | Applied | Live-verified |
|---|---|---|---|
| Cloud SQL `availabilityType` ZONAL→REGIONAL | in-place `~` update, `id` unchanged, **0 replaces/deletes** | `pulumi up --stack prod` — 1 update / 171 unchanged (~7m56s, expected instance restart) | `REGIONAL` + `RUNNABLE` + `failoverReplica.available=true`; PITR enabled, 35 retained backups, 7-day txn-log; private IP `10.46.0.3` unchanged (2026-10-22T19:12Z) |
| Proxy MIG `targetSize` 1→2 | previewed in-place `1=>2`, then **withdrawn** (F-R6INF.1-1) | **NOT applied** — stage fact pinned `1`; `compute.ts` throws on `>1` | verified **unchanged** at 1 (`mig-describe-{pre,post}.json`) |
| Worker 1/1Gi → 0.5/512Mi | n/a | **NOT applied** — R6SOAK.1 RED ⇒ authorization not discharged | worker untouched; consuming post-restart |

## F-R6INF.1-1 — why MIG×2 was withheld

The ruled lever presumed the second proxy instance could exist and take failover. The live
template pins `networkInterfaces[0].networkIP = 10.8.16.4` — the reserved internal IP that
`rhema:proxyBaseUrl` (`http://10.8.16.4:8443`, the worker's `ANTHROPIC_BASE_URL`) points at,
pinned deliberately so template rolls can't dangle the address. One static internal IP ⇒
exactly one holder ⇒ `targetSize: 2` permanently fails to create instance #2 (IP-in-use
create failure) → an error-looping MIG that delivers **zero** failover — the single URL
still reaches only the IP-holding VM. Applying the bare flip would have violated the
fail-closed envelope and produced fake "×2" evidence. The real fix (internal passthrough
NLB on a shared VIP + drop `networkIP` + repoint `proxyBaseUrl`, then flip the fact) is a
design + ~$8–18/mo add **outside** the ruled +$12.2 lever → owed as **D-R6INF.1-1** for an
operator ruling. `compute.ts` now fails closed on `egressProxyTargetSize > 1` so no stage
can silently express the broken flip.

## Maintenance-window note

The SQL flip restarted `rhema-prod-postgres` (per the ruling's "expected restart"). The
observed window: worker `ECONNREFUSED 10.46.0.3:5432` ~19:05–19:12Z → pg-boss reconnected
on its own, `billing.auto-reload` ticked clean 19:20:09Z, `run.walkthrough` consumed
19:20:51Z. Web/api stayed healthy through the flip (provenance PASS at `dc7fb15`). Any
rollback or the future MIG×2/ILB work needs the same maintenance-window treatment.

## Cost recomputation (post-change, `scripts/live/billing-read.mjs`)

**$198.38 → $225.63/mo (+$27.25)** — the SQL REGIONAL leg only: Regional core
$0.0700/h → $51.10 (ZONAL was $25.55, matching the ruled +$25.55) + Regional storage
$0.34/GiBy×10GB + backups. Zero other lines moved; the MIG×2 +$12.2 was never spent. The
script now picks Zonal/Regional SQL SKUs from the live `availabilityType` (Billing Catalog
API — not hardcoded).

## Rollback

Revert the stage fact `database.cloudSqlAvailabilityType` `"REGIONAL"→"ZONAL"` (+ the
test pin) → `pulumi preview --diff` (must show in-place `~`) → `pulumi up --stack prod`
→ verify `ZONAL`/`RUNNABLE`. Full recipe: `docs/build/reports/2026-10-22_R6INF.1/rollback-recipe.md`.
REGIONAL→ZONAL is again an in-place patch with a restart — run it in a window.

## Also in this PR

- `infra/config/stages.ts` — `cloudSqlAvailabilityType` (prod `REGIONAL`, non-prod `ZONAL`)
  + `egressProxyTargetSize` (pinned `1` all stages) facts.
- `infra/pulumi/data.ts` — SQL `availabilityType` + `failoverReplica` consume the fact.
- `infra/pulumi/compute.ts` — MIG `targetSize` consumes the fact; throws on `>1`
  (F-R6INF.1-1 fail-closed).
- `scripts/live/billing-read.mjs` — availability-aware SQL SKU needles; dead `disk`
  helper removed (inherited lint error on this file, now clean).
- Test pins: `stages.test.ts` (+8), `compute.test.ts` (+3), `data.test.ts` (+3).
- `docs/tickets/DEFERRALS.md` — dated notes on **D-OPS.2-2** (stays PARTIAL on the owed
  proxy leg), **D-COST.1-3** (worker lever (a) withheld on R6SOAK.1 RED; (f) executed in
  part) + new row **D-R6INF.1-1** (the withheld MIG×2 lever + its real unblock).
- Evidence: `docs/build/reports/2026-10-22_R6INF.1/` (preview classification, pre/post
  describes, worker logs, probes, provenance, smoke, billing, rollback recipe).
- Run ledger: `docs/build/runs/R6INF.1.md`.

**Requirement ids:** REQ-DEP-3
**Merge policy:** OPERATOR — this PR is not merged by the run; it stacks on
`stevevitali/r6ops-1-readiness-drills`.

## Verification

- Focused vitest: `stages.test.ts` + `compute.test.ts` + `data.test.ts` — **58/58 pass**.
- `tsc --noEmit` on the standalone Pulumi program — clean.
- Preview classification: `~` in-place update only; **0 replaces, 0 deletes** on any
  resource (hard-abort gate passed before `up`).
- `pulumi up --stack prod`: 1 updated, 171 unchanged — duration ~7m56s.
- Live: SQL `REGIONAL`/`RUNNABLE`/failover-ready; PITR + 35-day backups preserved; MIG at
  1 (withheld, verified unchanged); worker reconnected + consuming; `check-deploy-provenance`
  PASS on `https://rhema.tools` + `https://api.rhema.tools` @ `dc7fb15`; public smoke
  4×200; journeys R8.inbox + T2.badge PASS ($0); zero `[slo]` probe violations post-change.
- `check-build-memory.sh` — clean; `check-append-only.mjs --base e2316d6` — OK
  (numbers recorded in `logs/ci-R6INF.1.json`).

## Deviations

- **MIG×2 withheld** — live-found F-R6INF.1-1 (above). The lever stays authorized-but-owed
  on D-R6INF.1-1 pending the ILB design ruling; prod posture honestly remains MIG×1.
- **Size:** `git diff e2316d6` = **153 insertions / 18 deletions** (171 churned) impl+tests
  vs the ~150 soft budget — the overage is the `>1` fail-closed guard + the
  availability-aware billing needles + pins; honestly counted.
- Dead `disk` helper removed from `billing-read.mjs` (pre-existing unused-var on the
  file this ticket edits — 1-line hygiene, reported not silent).
