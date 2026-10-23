# R6CNT.2 — prod `pulumi preview --diff` classification (GD-DEPLOY.R6 four conditions)

Deploy SHA `ba66c4b` (Cloud Build `b05636b5`, all 10 images, `rhema-prod` AR, `_TAG=prod`).
Pre-state: web+api `/healthz` = `dc7fb15a0aa7caa5d47734656d06514d5b75b127`; `_migrations` max `0058`.

## Condition 1 — zero replace/delete on stateful resources: **PASS**

Preview totals: **10 updates + 1 replace + 161 unchanged.** Per-resource:

| resource | op | class | delta |
|---|---|---|---|
| `rhema-prod-proxy-tmpl` InstanceTemplate | **replace** | **stateless** (MIG re-rolls the egress-proxy VM) | `proxy-image` metadata digest roll |
| `rhema-prod-proxy-mig` | update | stateless | template version pin |
| cloudrun services ×7 (api/web/worker/fetcher/collab + 2) | update | stateless | container `image` digest roll (+ worker env-count jitter `[secret]`, same shape as R6DEP.1) |
| cloudrun Job `rhema-prod-convert` | update | stateless | container `image` digest roll |
| turbo-cache service | update | stateless | container `image` digest roll |

**Zero replace/delete on any stateful resource** — Cloud SQL (AlloyDB), Redis, GKE+nodepool,
GCS buckets, Secret Manager, Artifact Registry, network/LB, IAM all sit in the 161-unchanged set.
The single replace is the same stateless-proxy-InstanceTemplate class R6DEP.1 classified green.

## Condition 2 — additive migration lint: **PASS**

`node scripts/check-additive-migrations.mjs --newer-than 0058_pgboss_purge_probe.sql` →
`no migrations newer than the base — pass`. Prod `_migrations` max = `0058` (system-role DSN over
the IAP tunnel); `git diff dc7fb15..ba66c4b -- packages/db/migrations` is EMPTY.

## Condition 3 — monthly cost delta ≤ $15: **PASS** ($0)

`scripts/live/billing-read.mjs` baseline ≈ **$225.63/mo** (the whole-stack inventory figure — same
reading class as R6DEP.1's $254.83, not the deploy delta). The diff is image rolls + a MIG
template re-roll only — zero resource-shape changes ⇒ deploy delta **$0 ≤ $15**.

## Condition 4 — provenance all-PASS AFTER `up`: **owed**

`check-deploy-provenance.mjs --expect ba66c4b… --healthz https://rhema.tools --healthz https://api.rhema.tools`
runs post-up; result recorded below the up evidence.

**Verdict: conditions 1–3 PASS → `pulumi up --stack prod` authorized; condition 4 owed post-up.**
