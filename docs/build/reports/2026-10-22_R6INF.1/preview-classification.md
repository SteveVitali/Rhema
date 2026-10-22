# R6INF.1 — prod `pulumi preview --diff` classification (the GD-HA.R6 / ticket hard-abort gate)

Two previews ran 2026-10-22T~19:0xZ on `infra/pulumi --stack prod`. The committed
`pulumi-preview-diff.txt` is the SECOND (deployed) one.

## Preview 1 — both ruled levers expressed (NOT deployed)

Stage facts at `cloudSqlAvailabilityType:"REGIONAL"` + `egressProxyTargetSize:2` produced:

- `~` `rhema-prod-postgres` — in-place `settings.availabilityType: ZONAL => REGIONAL`. **No
  replace.** Clean.
- `~` `rhema-prod-proxy-mig-…` — in-place `targetSize: 1 => 2`. **No replace.**
- `=` 170 unchanged · **0 replaces, 0 deletes.**

The preview itself was in-place-clean for both levers. **But** between previews a live
substrate check (`gcloud compute instance-templates describe rhema-prod-proxy-tmpl-9f75916`)
surfaced **F-R6INF.1-1**: the template pins `networkInterfaces[].networkIP = 10.8.16.4` (the
single reserved internal IP that `rhema:proxyBaseUrl` = `http://10.8.16.4:8443` —
`ANTHROPIC_BASE_URL` for the worker's run pods — depends on; pinned deliberately so template
rolls can't dangle the address). Exactly one resource may hold a static internal IP
(GCP static-internal-IP docs), so a `targetSize: 2` MIG can **never create its second
instance** — permanent IP-in-use create failure → an error-looping MIG that still doesn't
deliver failover (the single URL reaches only the IP-holding VM). Real MIG×2 needs a shared
frontend first (internal passthrough NLB on the VIP — a design + ~$8–18/mo add the GD-HA.R6
ruling did not price). **Fail-closed: the bare flip was withdrawn before `up`** — deployed
state stays size 1; `egressProxyTargetSize` is pinned 1 in `stages.ts` and `compute.ts`
throws on `>1` so no future preview/up silently produces the stuck MIG.

## Preview 2 — the deployed scope (verbatim, complete)

- `~` `gcp:sql/databaseInstance rhema-prod-postgres` — **update in place**:
  `settings.availabilityType: "ZONAL" => "REGIONAL"`. No other field moves.
- `=` 171 unchanged — every other resource incl. Redis, GKE, buckets, secrets, IAM, all Cloud
  Run services (the worker's `resources`/`cpu-throttling` untouched — R6SOAK.1 RED ⇒ the
  0.5/512Mi candidate is NOT flipped) and the proxy MIG (stays 1 — F-R6INF.1-1).
- **0 replaces (`+-`), 0 deletes (`-`).**

## Gate verdicts

| Gate | Evidence | Verdict |
|---|---|---|
| Ticket / GD-HA.R6 hard abort: no replace/delete of the Cloud SQL instance; in-place patch only | `~ update` on `settings.availabilityType`; `id` unchanged | **PASS — proceeded** |
| GD-PREAUTH-ACTS.R6: dry-run matches the itemized scope (the GD-HA.R6 levers only); pre-state captured | Preview 2 = exactly the SQL lever (MIG×2 withdrawn on F-R6INF.1-1 — withheld, not expanded); `stack-export-pre.json.gz` + `sql-describe-pre.json` + `mig-describe-pre.json` + `healthz-*-pre.json` captured before `up` | **PASS** |
| GD-DEPLOY.R6 c1: zero replace/delete on stateful resources | 0 `+-`, 0 `-` anywhere | **PASS** |
| GD-DEPLOY.R6 c2: additive migration lint | `check-additive-migrations.mjs --newer-than 0058` → pass; no migration files touched | **PASS** |
| GD-DEPLOY.R6 c3: cost delta ≤ $15 (HA levers excepted) | Deployed delta = the SQL REGIONAL lever only: measured +$27.25/mo (`billing-read-{pre,post}.json`: $198.38 → $225.63; core +$25.55 per the ruling + HA-priced storage +$1.70) — all inside the ruled HA exception | **PASS** |
| GD-DEPLOY.R6 c4: provenance all-PASS post-up | `check-deploy-provenance --expect dc7fb15…` PASS on `rhema.tools` + `api.rhema.tools` (no image change — same deployed tip) | **PASS** |

## Runtime behavior observed

`pulumi up` update 153: `rhema-prod-postgres` patched in 469 s (~7m56s total). The expected
writer restart produced a ~19:05–19:12Z connectivity window (worker `ECONNREFUSED
10.46.0.3:5432` lines — all inside the window); pg-boss recovered on its own, `billing.
auto-reload` ticked clean at 19:20:09Z and a `run.walkthrough` job was consumed at 19:20:51Z.
`gcloud sql instances describe` post-up: `availabilityType=REGIONAL`, `state=RUNNABLE`,
`failoverReplica.available=true`, PITR + 35-day backups + 7-day txn-log retention preserved,
private IP unchanged (`10.46.0.3` — no DSN/peer churn).
