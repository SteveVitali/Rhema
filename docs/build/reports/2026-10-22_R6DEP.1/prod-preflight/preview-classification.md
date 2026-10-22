# R6DEP.1 — prod `pulumi preview --diff` classification vs `GD-DEPLOY.R6`

Run 2026-10-22T~08:00Z on `infra/pulumi --stack prod` after pinning the dc7fb15 digest set
(Cloud Build `f953fcf4`, `r6dep-1` tags, copied verbatim from the `pr-207` preview build into
`rhema-prod` AR — digest check `api:r6dep-1 = sha256:8159bc11…` matches the preview's).

Raw diff: `pulumi-preview-diff.txt` (150 lines). Pre-state export: `stack-export-pre.json.gz`
(sha256 `4da06d9c…`, 174 resources, all secrets ciphertext) + `healthz-{web,api}-pre.json`.

## The diff (verbatim)

- `~` 11 updates: `user-content` bucket CORS (+GET, +Content-Disposition/Length/Accept-Ranges/
  Content-Range — the REQ-POST-7 delivery headers), `convert` Job image, `turbo-cache`,
  `export`, `fetcher`, `collab`, `convert-svc`, `web`, `worker`, `api` service image swaps,
  `proxy-mig` version bump.
- `+-` 1 replace: `rhema-prod-proxy-tmpl` InstanceTemplate — GCP instance templates are
  immutable; every image bump re-creates the template and the MIG rolling-updates onto it.
  This is the same mechanism every prior image deploy used.
- `=` 160 unchanged: **every stateful resource** — Cloud SQL `rhema-prod-postgres`, Redis,
  GKE cluster + node pool, AR repos, all buckets' data, all secrets, IAM — untouched.
- 0 deletes.

## Condition-by-condition

| `GD-DEPLOY.R6` condition | Evidence | Verdict |
| --- | --- | --- |
| 1. `pulumi preview --diff` zero replace/delete on **stateful** resources | The single `+-` is `rhema-prod-proxy-tmpl` — a stateless, immutable-by-GCP-design compute template (it stores no data; the MIG rolls the same-shape e2-small proxy onto it). Zero deletes anywhere; Cloud SQL/Redis/GKE/buckets/secrets all `=`. | **PASS** — zero replace/delete on stateful resources |
| 2. `check-additive-migrations.mjs` — no DROP/rename/type narrowing/rewrite/role change | `node scripts/check-additive-migrations.mjs --newer-than 0058` → `no migrations newer than the base — pass`. Prod `_migrations` max = `0058_pgboss_purge_probe.sql` (58 applied — read 2026-10-22T07:5xZ over the IAP tunnel, system role). | **PASS** — schema already at tip; nothing to apply |
| 3. Monthly cost delta ≤ $15 (`billing-read.mjs` recompute; HA levers excepted) | `billing-read.json` — floor $254.83/mo (incl. the `pr-207` preview's $51.84 worker, ephemeral). The deploy diff carries NO shape change — image swaps, a CORS block, an immutable-template replace. Worker stays 1vCPU/1Gi instance-billed min=1 (R6SOAK's RED 0.5vCPU candidate NOT adopted; prod untouched). | **PASS** — delta $0 |
| 4. `check-deploy-provenance` all-PASS after the up | Plan: `node scripts/check-deploy-provenance.mjs --expect dc7fb15a0aa7caa5d47734656d06514d5b75b127 --healthz https://rhema.tools --healthz https://api.rhema.tools`. Pre-state healthz both report `ffbb8ad01b4383…` (orphaned stamp — see rollback-recipe.md note). Post-up images bake `GIT_SHA=dc7fb15…` (build `_GIT_SHA` substitution verified in the f953fcf4 build). | **PENDING** — runs post-up; fail ⇒ pause |

## Image-set ↔ tip correspondence

| Service | pr-207 tag | rhema-prod tag | Digest | Built at |
| --- | --- | --- | --- | --- |
| api, web, worker, fetcher, convert, export, collab, turbo-cache, run-task, egress-proxy | `r6dep-1` | `r6dep-1` | sha256 pinned in `Pulumi.prod.yaml` | `dc7fb15a0aa7caa5d47734656d06514d5b75b127` (Cloud Build `f953fcf4`, `_GIT_SHA` baked) |

All four conditions' pre-evidence is committed before `pulumi up`.
