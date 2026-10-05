# STB.1 — Merge gate + full-chain deploy + smoke (run ledger)

- **Ticket:** `docs/tickets/52_STB.1__merge-deploy-smoke.md` (seq 52 — post-P1 closeout, ops).
- **Branch:** `stevevitali/p1-22-launch-checks` — **deployed SHA
  `4fcf03ed8994392cbffb5848c443d770e542607a` (short `4fcf03e`)**.
- **Scope executed:** the **whole** ticket — image build, deploy, migrations, k8s apply,
  provenance stamp, $0 smoke battery, deferral audit — on **prod**.
- **PRE-MERGE DEPLOY (recorded caveat):** per the ticket's 2026-09-26 amendment, the operator
  authorized deploying the chain-tip SHA **without waiting for the merge** (`mergePolicy` stays
  `OPERATOR`; nothing was merged by this run). The `deployments` row therefore cites a
  **non-`main` SHA** — reconcile the deployed tree hash against the post-merge tree when the
  operator merges; divergence ⇒ footnote, not redo (ticket lines 5–11). PRB.22–25 deployed
  branch SHAs the same way.
- **Spend:** **$0.** No run launched, no inference, no Stripe leg.

## Deferrals read

`docs/tickets/DEFERRALS.md` read first per AGENTS.md. Rows this deploy touches:

- **D-P0.01-5** (worker IAM least-privilege) — flipped **DONE live** (§7).
- **D-P0.01-6** (subnet `/20` sizing) — flipped **DONE** on the live audit (§7).
- **D-P0.01-4** (self-hosted Turbo cache) — audited; **stays re-deferred** (no cache resource in
  the stack; audit was the assigned leg) (§7).
- **D-P1.22-2** (Stage-B verification bundle) — annotated: all *deploy* legs landed; live legs
  (a)–(f) stay open on their named owners (STB.2 read-only / STB.3 run-driven).
- **D-P0.15b-1** — annotated: the `pr-test` full-stack residual is unchanged (no preview stack
  was spun up; the amended target was the chain-tip prod deploy).

## 1. Stage selection — `dev` is a skeleton; deployed to **prod** (recorded deviation)

`infra/config/stages.ts` defines `dev`/`preview`/`prod`; `pulumi stack ls` (2026-09-25):

| stack | resources | last update | verdict |
|---|---|---|---|
| `dev` | **23** | 1 week ago | skeleton only — no Cloud SQL/GKE/LB/services to deploy |
| `prod`* | **139** (post-deploy) | live | the only fully provisioned stage |

Per the ticket's explicit fallback ("if only `prod` is provisioned, deploy to `prod` instead —
the PRB.* precedent did prod-only deploys — and record the deviation", lines 45–47): **deployed
to prod**. Deviation recorded here and in LEDGER/BUILD_INDEX.

Prod facts used: project `rhema-507501`, region `us-central1`, Cloud SQL
`rhema-prod-postgres` (private `10.46.0.3`), GKE `rhema-prod-run-task-gke-c13cb80`, Redis
`10.46.100.251`, LB `34.8.177.69`, proxy `rhema-prod-proxy-mqvs` (`http://10.8.16.4:8443`),
stage kind `prod`, `max_usd` $100.

## 2. Cloud Build — all nine images at `4fcf03e`, tag `p1final`

```
gcloud builds submit --config cloudbuild.yaml --project rhema-507501 \
  --substitutions _AR=us-central1-docker.pkg.dev/rhema-507501/rhema-prod,_TAG=p1final
```

- **Build `30d48852-9b01-467c-863a-bc0cfb6ee0d4` — SUCCESS**, all nine images pushed to
  `us-central1-docker.pkg.dev/rhema-507501/rhema-prod`.

| image | digest |
|---|---|
| api | `sha256:0088346f564d82cb5caad4924fadab540c8604f77d2e6e28788d2f8512a09baf` |
| web | `sha256:cde31f1a2657702682a3068cbbef66fc3e0103807d40f5eae5a3b8ce48eecba9` |
| worker | `sha256:a324228bb77c21d0c09f66a85595f846d9a1d45b8177317a9ab5c82412bb63c6` |
| fetcher | `sha256:ffdaf127523f560cca116a248b012e8bc752b044cc21af9827a3469d9ab8a905` |
| convert | `sha256:85b580645b79b7f84cba60e6085898976a255a322325f213f3730f3cb5c242a4` |
| export | `sha256:84568c4d78912507e7a47209f90a1fb1d74ba9dcb927f6ac2c4d5d123dd2b0b2` |
| collab | `sha256:946577988629511517ded5e1d162de3e3af18a3881a0c3278f092e0924e71582` |
| run-task | `sha256:3c96ecef81334eef4c5824932e8e964fb3f3571e9fc51626ed9eb7d895a97ffc` |
| egress-proxy | `sha256:cf779cd54857aaf4040cb1cf20a823276ec9d2adfb9c4847e7955b5d0f5e794c` |

All nine digests pinned in `infra/pulumi/Pulumi.prod.yaml`
(`rhema:serviceImages` + `rhema:runTaskImageDigest` + `rhema:proxyImage`), replacing the prior
pins, with a dated comment citing build 30d48852 / SHA 4fcf03e / the pre-merge authorization.

## 3. Pulumi — preview, three live-prompted fixes, `up` converged

The preview surfaced the expected P1.15/P1.16/P1.22 wiring: monitoring stack (log-metric
`rhema_slo_violations`, 8 SLO AlertPolicies, api-availability `Slo`, `GenericService`,
dashboard), `IAMCustomRole rhema-prod-gke-cluster-access` + worker binding (replacing
`roles/container.developer`), collab RegionNetworkEndpointGroup/BackendService/`/collab*`
URL-map rule + `allUsers` invoker, fetcher invokers + worker convert-Job IAMs, and the
digest-pinned Cloud Run service updates. **No destroys/replacements of Cloud SQL, buckets, or
Redis** — the ticket's stop condition never fired. One expected IAMMember *replacement* (the
worker's role changes) and six cosmetic Cloud Run updates from the known scaling-readback drift
(PRB.22 precedent).

Three defects surfaced **live at plan/apply time** and were fixed on the branch (part of this
commit — the amend is the deployed tree):

1. `infra/pulumi/monitoring.ts` — `sig.replaceAll("_", "-")` fails the program's ES2020 target
   (TS2551); changed to `sig.replace(/_/g, "-")`.
2. `infra/pulumi/monitoring.ts` — the hand-escaped `dashboardJson` interpolate template
   serialized an `Output` into a raw string → provider plan-time validation error
   ("invalid character 'l' after object key:value"). Rebuilt via
   `pulumi.all([slo.name]).apply(JSON.stringify(...))`; also fixed the `REGEXP_EXTRACT`
   label-extractor escaping (double-backslash → single).
3. `infra/pulumi/compute.ts` — `timeoutSec: 3600` on the collab BackendService was rejected by
   GCP ("Timeout sec is not supported for a backend service with Serverless network endpoint
   groups"); removed (the comment now records the live finding; Hocuspocus keepalive covers
   quiet sessions).

One new config secret was required: P1.03 collab code throws without `DATABASE_URL`
(`apps/collab/src/server.ts`) and the program reads `rhema:collabDatabaseUrl`. Enabled login on
the existing `rhema_collab` DB role and set the key as a **Pulumi secret** (value never logged;
without it the new collab service would crash-loop).

**Final `pulumi up` converged** (prod stack updates 74–77 across the fix iterations; end state
139 resources). Post-up state shows no drift on stateful resources.

Known benign warning throughout: `Undefined value (alloydbCluster) will not show as a stack
output` — pre-existing, non-fatal (prod uses Cloud SQL, not AlloyDB).

## 4. Migrations — `0027`–`0041` applied in order via the bastion tunnel

Tunnel: `rhema-prod-proxy-mqvs` → local `127.0.0.1:15433`; applied with the repo's TypeScript
`pg` helper (`integration/.scratch/q.ts` — `psql` is not installed locally).

The prod DB was at **0026**. The ticket asked for `0029`–`0041`; `0027` and `0028` were missing
and **must** precede them (0027 theme prefs, 0028 the `rhema_collab` grants the new collab
service needs), so the full contiguous range was applied in order:

`0027_theme_prefs` · `0028_collab_restore` · `0029_project_home` · `0030_timeline_steering` ·
`0031_consent_threshold` · `0032_approval_surface` · `0033_chat` · `0034_figures` ·
`0035_ingestion` · `0036_billing_full` · `0037_showcase` · `0038_account_export` ·
`0039_in_app_notifications` · `0040_settings_account` · `0041_pause_signals`

Result: **41 migrations recorded**; protocol seed rows `academic v1` / `essay v1` / `memo v1` /
`op-ed v1`; agent types `assistant` / `author` / `editor` / `persona_builder` / `system`.

**Ordering deviation (deliberate):** the ticket lists Pulumi *then* migrations; migrations were
applied **before** the final service rollout because `0041`'s `pause_signals` tables are read by
the P1.22 code being deployed — all fifteen were verified additive before running, so there was
no destructive-migration risk in reordering.

## 5. Kubernetes — `infra/k8s/apply.sh` (STACK=prod)

Applied against `rhema-prod-run-task-gke-c13cb80`, including the new P1.22 manifest
`infra/k8s/30-worker-job-rbac.yaml`: `Role`/`RoleBinding run-task-launcher` in `runs`
(secrets create/get; jobs create/get/list; bound to the worker GSA as a User) + the Workload
Identity binding. Verified live with the IAM evidence in §7.

## 6. Provenance — `deployments` row with real `protocols_version`

`scripts/live/record-deployment.mjs` stamped (schema uses `deployed_at`, not `created_at`):

- `id`: **`prod:4fcf03ed8994392cbffb5848c443d770e542607a`**
- `stage`: `prod` · `git_sha`: `4fcf03ed8994392cbffb5848c443d770e542607a` (the **non-main**
  chain-tip — pre-merge deploy caveat applies)
- `protocols_version`: **`0.4.0+619079b3ba004cf1`** (real, not `stub-0.0.0`)
- `image_digests`: the nine §2 digests · `deployed_at`: `2026-09-25T20:09:56.719Z`

## 7. Smoke battery — all items green ($0, read-only)

Session minted via the PRB.24/PRB.25 headless pattern (token never logged).

| # | check | result |
|---|---|---|
| 1 | `GET /healthz` (api) | **200** |
| 2 | `GET /` | **200** — marketing HTML, `<title>Rhēma` |
| 3 | `GET /login` | **200** — sign-in UI (magic-link + Google options) |
| 4 | `GET /app` (authed) | **200** — all four attention groups rendered: **Needs you · Running · Ready to read · Quiet** |
| 5 | `GET /p/my-first-project` (authed) | **200** — IDE shell: **Desk, Timeline, Page** + rail mounts |
| 6 | `wss://rhema.tools/collab` (session cookie) | **101 Switching Protocols** — upgrade succeeded (first attempt failed on a scratch-dir `ws` resolution; re-ran inside the repo against `apps/collab/node_modules/ws` → green) |
| 7 | `deployments` row | row `prod:4fcf03e…` present, `protocols_version=0.4.0+619079b3ba004cf1` |

Extra free verification while inside the stack (not in the ticket's battery, recorded anyway):

- **Egress probe** from a temp `runs` pod: direct `api.anthropic.com` — **blocked/timed out**;
  egress proxy — **403 `egress.denied` (missing proxy credential)**: the sandbox's
  only-egress-is-the-proxy invariant holds on the wire. Pod deleted.
- **`usercontent.rhema.tools`** — **403, no `Set-Cookie`** (P1.15 privacy invariant).

## 8. Deferral audit — what flipped, what stayed

| row | verdict | evidence |
|---|---|---|
| **D-P0.01-5** (worker IAM least-privilege) | **DONE live** | `gcloud iam roles describe projects/rhema-507501/roles/rhemaprodGkeClusterAccess` → `container.clusters.get`/`list` **only**; `gcloud projects get-iam-policy` on `rhema-prod-worker@…` → the custom role and **nothing else** (`roles/container.developer` member replaced, verified gone); `Role/RoleBinding run-task-launcher` present in `runs` post-`apply.sh`. Deployment id cited on the row. First real Job launch exercises it on STB.3. |
| **D-P0.01-6** (subnets `/20`) | **DONE** | `gcloud compute networks subnets list` on `rhema-prod-net` while inside Pulumi state: `public` 10.8.0.0/20, `private-app` 10.8.16.0/20, `sandbox` 10.8.240.0/20 — all three stage subnets at spec; the sole non-/20 (`…-pe-subnet` 172.16.0.0/28) is GKE's managed pod range, not a stage subnet. Deployment id cited. |
| **D-P0.01-4** (self-hosted Turbo cache) | **audited, stays re-deferred** | 139-resource prod stack audited — no cache server/proxy resource exists; remote cache remains endpoint-config-only (`TURBO_API`/`TURBO_TOKEN`), the local cache carries correctness. Audit was the assigned leg; infra backlog, non-blocking. |
| **D-P1.22-2** (Stage-B bundle) | **annotated, stays open** | deploy legs (monitoring stack, custom IAM role, collab wiring, `0041`, RBAC) all landed on prod — noted on the row. Live legs (a)–(f) keep their named owners: run-driven (a)(b)(e) → STB.3; read-only (c)(d)(f) → STB.2. |
| **D-P0.15b-1** (pr-test full stack) | **annotated, stays open** | prod was updated; no `pr-<n>` preview was spun up — the `pr-test` up/destroy residual is unchanged. |

## 9. Surprises / deviations recap

1. **prod, not dev** — dev stack is a 23-resource skeleton; ticket's fallback clause exercised.
2. **Pre-merge deploy** — chain-tip SHA `4fcf03e`, not a `main` SHA (operator amendment; caveat
   carried on the `deployments` row and here).
3. **Migrations ran before the final rollout** — safety ordering for `0041`/`pause_signals`.
4. **Three live plan/apply fixes** committed on the branch: ES2020 `replaceAll`→`replace`,
   `dashboardJson` via `pulumi.all`+`JSON.stringify`, collab `timeoutSec` removed.
5. **`rhema:collabDatabaseUrl` Pulumi secret added** + `rhema_collab` login enabled — required
   by P1.03's `DATABASE_URL` check; not in the original prod config.
6. **`0027`/`0028` applied too** — ticket asked `0029`–`0041`; the live DB was missing the two
   prerequisites.
7. `alloydbCluster` stack-output warning — pre-existing, benign.

## Acceptance

- **AC1** — ✅ prod serves `4fcf03e`, migrations `0027`–`0041` applied (41 recorded),
  `deployments` row `prod:4fcf03e…` carries `protocols_version=0.4.0+619079b3ba004cf1`.
- **AC2** — ✅ all seven smoke items pass; each has a §7 evidence row.
- **AC3** — ✅ D-P0.01-5 and D-P0.01-6 flipped DONE with the deployment id cited; D-P0.01-4
  audited and left re-deferred per evidence; D-P1.22-2 / D-P0.15b-1 annotated.

**Next:** STB.2 — the read-only live-verification bundle (SLO dashboard reads, usercontent
headers on real objects, Cloud SQL backup/PITR verify, pause-transport assert, invite-leg
residuals per DEFERRALS owners).
