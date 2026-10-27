# R6DEP.3 — `pulumi preview --diff --stack prod` classification (2026-10-27T07:5xZ)

Deploy SHA `dc3a8f693f2d144c2a0f3a40e26da7003aa9e7e3` → prod (`e04a8c8` serving).
Preview `7d8d3a28-8624-4269-9b29-e948c72f25ab`: **10 to update + 1 to replace, 165
unchanged.**

## Per-resource classification

| Resource | Change | Class |
|---|---|---|
| `rhema-prod-proxy-tmpl` InstanceTemplate | **replace** — `proxy-image` metadata digest → `026bf024` (+ labels/tags unknowns) | **stateless** proxy template — MIG re-rolls two short-lived VMs; the R6DEP.2 precedent verbatim |
| `rhema-prod-proxy-mig` RegionIGM | update — `versions[0].instanceTemplate` pointer | stateless (follows the template replace) |
| `rhema-prod-api` Service | update — image `92b41954` → `8ec46f27` | stateless image roll (carries convergent restore) |
| `rhema-prod-web` Service | update — image `a4e3b420` → `674202c7` | stateless image roll (GIT_SHA bake) |
| `rhema-prod-collab` Service | update — image `f893d681` → `bacf9d75` | stateless image roll (carries `y_epoch` converge) |
| `rhema-prod-worker` Service | update — image `58ef4205` → `71cd2b51` + envs (`RUN_TASK_IMAGE_DIGEST` → `19c95a63`) | stateless image roll + env (the vendored-SDK run-task pin) |
| `rhema-prod-fetcher` Service | update — image `350a56bd` → `ce834a57` | stateless image roll |
| `rhema-prod-convert-svc` Service | update — image `7d193c43` → `e3b78179` | stateless image roll |
| `rhema-prod-convert` Job | update — image → `e3b78179` | stateless image roll |
| `rhema-prod-export` Service | update — image `b263f77b` → `277f1682` | stateless image roll |
| `rhema-prod-turbo-cache` Service | update — image `615ed320` → `869cafd6` | stateless image roll |

**Zero stateful replace/delete** — no Cloud SQL / Redis / GCS / Secret Manager / VPC /
IAM / DNS / LB resource changes. The only replace is the stateless proxy
InstanceTemplate (image digest in metadata forces a new template by GCP's design; the
MIG rolls the VMs — capacity 2 behind the ADR-122 ILB, same as R6DEP.2/R6INF.2).

## GD-DEPLOY.R6 four conditions

| Condition | Verdict | Evidence |
|---|---|---|
| zero replace/delete on stateful resources | **PASS** — 1 replace total, the stateless proxy template; zero deletes | this table |
| migrations pass the additive lint | **PASS** — `check-additive-migrations.mjs --newer-than 0058` = exactly `0059_live_docs_y_epoch.sql`, additive (one `ADD COLUMN … DEFAULT 0` non-volatile); applied via `prod-migrate-seed` BEFORE this `up` (the collab epoch read runs on every store hook — column must precede the new image) | `prod-migrate-seed.log`; `_migrations` row verified |
| monthly cost delta ≤ $15 | **PASS — $0** — image rolls + a template re-roll; no new/resized billable resource | preview diff (no new resources) |
| provenance all-PASS after | **PLANNED** — `check-deploy-provenance --expect dc3a8f6…` on web+api `/healthz` post-up; NEW this deploy: the run-task image digest change is additionally evidenced by the build's own contents assert (`run-task image assert: vendored agent SDK readable+executable by uid agent=10002`, build `36964998`) | `image-build/cloudbuild-36964998.log` |

## Rollback

`git revert` the pin block + re-pin the `e04a8c8` digests (api `92b41954`, web
`a4e3b420`, worker `58ef4205`, fetcher `350a56bd`, convert `7d193c43`, export
`b263f77b`, collab `f893d681`, turbo-cache `615ed320`, run-task `c7cf69c6`,
egress-proxy `9ee5ae08`) → `pulumi up` → provenance `--expect e04a8c8…`.
Migration 0059 needs no rollback: additive column, pre-0059 code ignores it.
