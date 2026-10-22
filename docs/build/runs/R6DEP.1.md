# R6DEP.1 — Tip deploy to prod under `GD-DEPLOY.R6` (run ledger)

- **Spec:** `docs/tickets/186_R6DEP.1__tip-deploy.md` (manifest row 186, round 6; REQ-DEP-1)
- **Normative loads:** `docs/round-6-draft-spec.md` §2 + §4.5 REQ-DEP-1; LEDGER GATE DECISIONS
  `GD-DEPLOY.R6` (deploy pre-authorization, four conditions) + `GD-PREAUTH-ACTS.R6` (metered-notice
  send item); `docs/build/INTEGRATION_PLAN.md` §R5 (deploy boundaries) + §R4.11 (Arm B);
  `docs/build/runs/VERIF.2.md` + `docs/build/runs/R6SOAK.1.md` (owned `pr-<n>` recipe);
  `docs/build/runs/ARMB-2026-10-14.md` (the last prod deploy, `ffbb8ad`);
  `docs/ops/launch-flips.md` step 0 + `docs/ops/debit-mode-flip.md` (the EFFECTIVE_DATE ≥30-day rule);
  `docs/build/reports/2026-10-21_R6MNY.1/prod-readiness-reads.md` (recipients=2 measured);
  `infra/PROD-BRINGUP.md` §2b/§7/§8/§13.2 (image-set, migrate, record-deployment, rollback).
- **Base:** `stevevitali/r6soak-1-worker-rightsize-soak` @ `dc7fb15` (chain tip)
- **Branch:** `stevevitali/r6dep-1-tip-deploy` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** REQ-DEP-1
- **Started:** 2026-10-22T05:42Z · **Closed:** 2026-10-22T09:4xZ
- **Live stage:** owned `pr-<n>` preview first (≤ $8 resource-hours), then prod.
- **Production mutations (ticket header, verbatim):**
  - `pulumi up --stack prod` of the chain-tip SHA (images: CI digests pinned in
    `Pulumi.prod.yaml`); `scripts/record-deployment.mjs`;
  - if R6MNY.1 recorded notice recipients > 0: `send-metered-notice.mjs --send`
    (`GD-PREAUTH-ACTS.R6` item), with the effective date recorded.
  - Pre-state = the current prod stack export + `/healthz` SHAs. Rollback = `git revert` +
    redeploy of the previous SHA.
- **Size budget:** ~200 changed lines (evidence + recipe).
- **Deploy tip SHA:** `dc7fb15a0aa7caa5d47734656d06514d5b75b127` (the chain tip at branch cut;
  later commits on this branch are docs/evidence only — `scripts/deploy-neutral-paths.txt`
  allowlist `docs/` makes any post-tip drift provably neutral).
- **Pre-state (recorded BEFORE any mutation, 2026-10-22T05:4xZ):**
  - web `/healthz` → `ffbb8ad01b4383ab7f11088c8427b668bc442b01`
  - api `/healthz` → `ffbb8ad01b4383ab7f11088c8427b668bc442b01`
  - `ffbb8ad` (full: `ffbb8ad3f2dedd690a5b9d8a86528128fd25fa23`) is an ancestor of `dc7fb15`
    (206 commits; the whole round-5 + round-6 pre-deploy code).
  - IAP tunnel target for prod reads/writes: `rhema-prod-proxy-3ms6` (us-central1-c) →
    `10.46.0.3:5432`; system-role `postgres` DSN (never the app role — FORCE RLS).
- **ci:** pass #207@`3605335` (run 39763340702 — all seven legs + `ci-pass` anchor, the
  final closeout head incl. the `3d2852e` stage revert); PR-open head `1c8997d` also
  green (run 39729566641); boundary JSON `docs/build/logs/ci-R6DEP.1.json`.

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). No row names R6DEP.1 as its unblocker. Rows in
this ticket's blast radius (dated notes at close; no flips expected):

- **D-ECON.1-3 / D-ECON.1-4** — OPEN; cap-calibration admissibility + derived cells. Unchanged by
  this run (admissible=0 per R6MNY.1); the metered-notice send is a `GD-PREAUTH-ACTS.R6` item +
  `launch-flips.md` step-0 precondition, not one of these rows.
- **D-OBS.1-3 / BL-74-class / D-SPA.28-1** — the nightly-green-on-deployed-SHA rows: this deploy
  moves the deployed SHA to the tip; the first scheduled post-merge nightly remains REQ-POST-4 /
  REQ-GO-2's criterion. Dated note only.
- **D-SPA.6-1** (prod SSR arm) — **CLOSED this run**: the tip deploy made prod carry the marker
  vocabulary; `N10`+`P1.public` under `--expect-renderer ssr --expect-sha dc7fb15…` PASSed and
  the preview `--expect-renderer spa` sweep re-discharged leg (b). **D-PRB.01-1** (invite leg),
  **D-CAP.1-1**, **D-SEC.2-1** — REQ-POST-* legs consume the deployed tip; this run only
  delivers the deploy they require.
- **D-COST.1-3 (a)** — OPEN; soak RED (R6SOAK.1) → the worker right-size flip is NOT authorized;
  worker stays 1vCPU/1Gi in this deploy (no stage-fact change).

## The GD-DEPLOY.R6 authority envelope (conditions — ALL evidenced BEFORE `pulumi up`)

| # | Condition | Evidence plan |
|---|---|---|
| 1 | `pulumi preview --diff` shows **zero replace/delete on stateful resources** | prod preview JSON classified per-resource; stateful set = Cloud SQL, Redis, GKE+nodepool, GCS buckets, Secret Manager secrets, AR repo, network/LB/sandbox, IAM |
| 2 | migrations pass the additive lint (no DROP/rename/type-narrowing/rewrite/role change) | prod `_migrations` max read over the tunnel + `check-additive-migrations.mjs` over the newer-than set (`git diff ffbb8ad..dc7fb15 -- packages/db/migrations` is EMPTY — expect zero new files) |
| 3 | monthly cost delta ≤ $15 (`billing-read.mjs`; HA levers excepted) | `scripts/live/billing-read.mjs` baseline + the preview-diff shape audit (image rolls only ⇒ $0 delta) |
| 4 | provenance `check-deploy-provenance` all-PASS AFTER the up | `--expect dc7fb15…` on `https://rhema.tools` + `https://api.rhema.tools` |

**Any condition fails → do NOT run `pulumi up`; commit the evidence; flag FIRST-LINE.**

## Requirements (spec §In scope — deliverables)

1. Preview of the tip on `pr-<n>`: `paid:false` suite + `--expect-renderer spa` (VERIF.2 recipe);
   evidence committed; preview destroyed + `rhema-pr-<n>*` orphan sweep verified.
2. Prod `pulumi preview --diff` classified against each pre-authorization condition, committed.
3. `pulumi up`; `check-deploy-provenance --expect <tip>` all-PASS on web + api; the `deployments`
   row recorded.
4. Post-deploy smoke (public routes 200; signed-in shell; `/bff/*` reads; the worker consuming).
5. The rollback recipe for this SHA (`git revert` + redeploy of `ffbb8ad`, concrete commands).
6. The metered notice send — only after the deploy, only if recipients still >0 and scope matches
   the R6MNY.1 measurement (2); `EFFECTIVE_DATE` ≥ 30 days after the send.

## Acceptance criteria

- [x] Preview suite green on the tip; teardown verified *(staging-verified)* — the
  `paid:false` suite ran green on pr-207 (40 PASS; N8/N9 = preview-posture, T8 +
  R10.keepalive = owed-reporting, zero fabricated) and the `--expect-renderer spa`
  surface sweep held zero renderer violations; teardown verified — destroy removed all
  193 resources (the GCP-managed `serverless-ipv4-cloudrun-*` reservations GC-lagged the
  subnet ~2h20m, released ~10:24Z, and the drain loop finished destroy + `rm`), and the
  25-class orphan sweep is **zero**.
- [x] Each pre-authorization condition evidenced before `up` *(live-executed)* —
  `reports/2026-10-22_R6DEP.1/prod-preflight/preview-classification.md`: zero
  stateful replace/delete (the one replace was the stateless proxy
  `InstanceTemplate`), additive lint PASS (no migrations newer than `0058`), cost
  delta $0 ≤ $15, provenance plan committed — then `check-deploy-provenance` PASSed.
- [x] Provenance all-PASS on prod at the tip SHA *(live-executed)* —
  `PASS https://rhema.tools` + `PASS https://api.rhema.tools`, deployed =
  `dc7fb15a0aa7caa5d47734656d06514d5b75b127`.
- [x] Universal phase-gate AC *(agentic)* — full verification below.

## Plan

1. Ledger + PR skeleton → push → `gh pr create` (base `stevevitali/r6soak-1-worker-rightsize-soak`)
   → the PR number names the stack `pr-<n>`.
2. Preview bring-up (VERIF.2/R6SOAK.1 runbook): `preview-stack.mjs init` → config
   (project/region/placeholderImage/gitSha/`dc7fb15`/protocolsVersion/deployProxyMig/
   runTaskAppArmor*/emailFrom/appBaseUrl/apiPublicUrl/uploadCorsOrigins) → resend-pull →
   targeted AR-repo `up` → `gcloud builds submit infra/cloudbuild/image-set.yaml` (all 10,
   tag `r6dep-1`, sha `dc7fb15`) → pin digests → `up` → migrate Job → seed-invite.
3. Journey suite: `rhema-journeys --web https://<web>.run.app --api https://<api>.run.app
   --invite-code prv-<n>-test --expect-renderer spa` — every `paid:false` step; `JOURNEY_DATABASE_URL`
   bound to the preview's system DSN through an IAP tunnel on the preview's proxy VM
   (+ preview-scoped firewall, deleted in-window) for the seeded-substrate legs.
4. `destroy` → `rm` → orphan sweep (20+ classes) → cost record.
5. Prod: `gcloud builds submit` all 10 at `dc7fb15` → `_AR=…/rhema-prod,_TAG=prod`; pin digests
   in `Pulumi.prod.yaml` (committed, dated comment à la ARMB); `pulumi preview --diff --stack prod`
   → per-resource classification committed; additive lint vs prod `_migrations` max (tunnel);
   `billing-read.mjs` baseline + delta reasoning.
6. `pulumi up --stack prod` → provenance `--expect dc7fb15…` → `record-deployment.mjs`
   (STAGE=prod, GIT_SHA=dc7fb15, the pinned digests) over the tunnel.
7. Smoke: public routes 200 + `data-renderer`; signed-in shell + `/bff/*` reads via a journeys
   session (real magic-link mint on `test@rhema.tools`); worker consuming via prod logs/jobs.
8. Rollback recipe committed (revert pins → `pulumi up` → provenance `--expect ffbb8ad` →
   `record-deployment` prod:ffbb8ad — concrete commands).
9. Notice: tunnel → `send-metered-notice.mjs` dry-run (EFFECTIVE_DATE=2026-12-01) → recipients must
   still match the R6MNY.1 scope (2>0) → `--send` → post-state count; counts only, no PII.
10. Evidence under `docs/build/reports/2026-10-22_R6DEP.1/`; verify suite; self-review; gap table;
    closeout.

## Test matrix

No code change — the deploy sequence + evidence is the deliverable. Gates re-run at close:
`pnpm turbo build lint typecheck`, `pnpm test`, all `check:*`, `check-build-memory.sh`,
`check-append-only.mjs --base dc7fb15`. The "tests" here are the live legs themselves (preview
suite, condition classification, provenance, smoke, dry-run/send scope match).

## Progress

- 2026-10-22T05:42Z — branch `stevevitali/r6dep-1-tip-deploy` cut at `dc7fb15` (clean base, pushed
  base branch); contract + GD-DEPLOY.R6/GD-PREAUTH-ACTS.R6 conditions extracted verbatim; VERIF.2 /
  R6SOAK.1 / ARMB deploy precedents loaded; pre-state recorded above (web+api `/healthz` =
  `ffbb8ad01b…`; proxy VM `rhema-prod-proxy-3ms6`; `ffbb8ad..dc7fb15` = 206 commits, zero new
  migration files). Tooling: pulumi logged in (`14stevevitali-gmail-com`), gcloud → `rhema-507501`,
  node v25.2.1, pnpm 10.32.1.
- 2026-10-22T05:5xZ — **F-R6DEP.1-1: the branch inherited R6SOAK.1's RED worker candidate**
  (`workerCpuBilling:"request"` + 0.5 vCPU/512Mi). That shape reproduced `D-P0.15h-3` 6/6 on
  pr-206 — not deployable. `infra/config/stages.ts` restored to the known-safe preview posture
  (1 vCPU/1Gi, `cpuIdle:false`, `workerMax:1`); `stages.test.ts` re-pinned to assert
  `cpuBilling:"instance"` + the 1/1Gi resources (focused run 29/29). Commit `3d2852e`.
- 2026-10-22T06:0xZ — **pr-207 preview brought up** on the VERIF.2/R6SOAK.1 recipe:
  `preview-stack.mjs init` → config (project/region/placeholderImage/`gitSha=dc7fb15`/
  `protocolsVersion=0.4.0+ec61156725a895ab`/deployProxyMig/AppArmor/emailFrom) → `resend-pull` →
  AR repo targeted `up` → `gcloud builds submit infra/cloudbuild/image-set.yaml` (build
  `f953fcf4-addf-4816-ad75-341aff2de6d2`, ~9m58s, all 10 images at `dc7fb15`) → digests pinned →
  `up`. Incidents worked honestly: (a) two AlertPolicy propagation races (logging metric
  not-yet-queryable) — wait + retry, converged; (b) API revisions started before the migrate Job
  created database `rhema` → executed `rhema-pr-207-migrate-ae78720` (58 migrations through
  `0058_pgboss_purge_probe.sql`), forced a fresh revision via `gcloud run services update`, Pulumi
  re-converged (189 resources); (c) `seed-invite` inserted `prv-207-test`; (d) Better Auth 404s
  diagnosed from request logs — preview OAuth `googleOauthClientId` configured, API/web env
  rolled, `/api/auth/*` mounted. Preview URLs: web `…-web-8d83fe5-…`, api `…-api-27c38c9-…`,
  worker `…-worker-5020716-…`; proxy VM `rhema-pr-207-proxy-1zfg` (IAP tunnel for the
  system-role DSN + `JOURNEY_DATABASE_URL` legs; preview-scoped `rhema-pr-207-iap-ssh` firewall
  added, deleted in-window).
- 2026-10-22T07:2xZ — journey suite on pr-207: **r1** failed on unmounted auth (pre-OAuth-config
  artifact — evidence kept); **r2** failed on the retired `--pin-renderer` flag + rolling-hour
  magic-link throttle (evidence kept). After the throttle window cleared: **Run A — the full
  `paid:false` suite**: **40 PASS**; `N8`/`N9` honest non-greens — preview posture (N8 needs the
  collab wire — domains-only; N9 needs Stripe — previews never carry third-party keys,
  REQ-ARCH-38), `T8` + `R10.keepalive` reported **owed** (expected-red; expired-token leg and
  keep-alive collab leg respectively). **Run B — `--expect-renderer spa` surface sweep**: 30
  gated legs, **zero renderer violations**; N9 fail = same Stripe posture, T8 = owed. Spend $0
  both runs. Reports: `preview-suite/` (r2 shape), `preview-suite-r2/`, `preview-surfaces-spa/`.
- 2026-10-22T08:0xZ — **teardown**: manual `rhema-pr-207-iap-ssh` firewall deleted first;
  `preview-stack.mjs destroy` removed 136 resources, then 8, but the private subnet
  `rhema-pr-207-private-app-5b73328` stayed `resourceInUseByAnotherResource` — two GCP-managed
  `serverless-ipv4-cloudrun-*` address reservations GC-lag after the Cloud Run services die
  (same class as pr-206's ~100 min lag; they are Google-owned, undeletable by hand — a direct
  `addresses delete` was tried and correctly refused: in-use by
  `//serverless.googleapis.com/…/addressReservations/…`). `$0` third-party spend.
- 2026-10-22T10:25Z — **teardown completed**: the reservations released ~10:24Z (≈2h20m GCP
  lag); the drain loop then ran `destroy` (49 final resources — subnet, network, 12 secrets,
  4 buckets, AR repo, health check, cert, logging metrics, IAM role) + `stack rm pr-207`
  (stack + `Pulumi.pr-207.yaml` removed — deletion committed). **Orphan sweep: ZERO
  `rhema-pr-207*` across 25 classes** (Cloud Run svcs/jobs, secrets, buckets, GKE, AlloyDB,
  Redis, VMs, networks, subnets, fw, routers, addresses, health checks, certs, instance
  templates/groups, backend svcs, url-maps, fwd rules, https-proxies, AR repos, logging
  metrics, alert policies, SAs, IAM). Spend ≈$4–6 ≤ $8 (preview stood ~4.5h + one ~10min
  image-set build; all journey legs $0).
- 2026-10-22T08:2xZ — **prod preflight (all four GD-DEPLOY.R6 conditions evidenced BEFORE `up`)**:
  the 10 tip digests were copied into `rhema-prod` AR (no rebuild — digests copied verbatim from
  the pr-207 build) and pinned in `Pulumi.prod.yaml` (dated comment à la ARMB); stack export +
  `/healthz` pre-state captured; `check-additive-migrations.mjs --newer-than 0058` → PASS
  (zero new files); `pulumi preview --diff --stack prod` → **11 updates + 1 replace + 160
  unchanged**; per-resource classification committed — the single replace is the **stateless**
  proxy `InstanceTemplate` (image roll → MIG re-rolls), zero replace/delete on any stateful
  resource (Cloud SQL, Redis, GKE/nodepool, buckets, secrets, AR, network, IAM); cost delta
  **$0** ≤ $15 (image swaps + usercontent CORS response-header additions only; the
  `billing-read` $254.83 inventory figure is the whole stack, not the deploy delta); provenance
  plan recorded. Evidence: `prod-preflight/` (preview JSON, classification, additive-lint,
  billing reads) + `rollback-recipe.md`.
- 2026-10-22T08:5xZ — **`pulumi up --stack prod` executed** (all four conditions PASS): 11 updated
  (image env rolls on api/web/worker/collab/fetcher/convert/export + usercontent bucket CORS) +
  1 replaced (`rhema-prod-proxy-*` InstanceTemplate; MIG rolled `rhema-prod-proxy-3ms6` →
  `rhema-prod-proxy-vxdt`). **`check-deploy-provenance --expect dc7fb15…` → all-PASS** on
  `https://rhema.tools` + `https://api.rhema.tools`. **`record-deployment.mjs` →
  `prod:dc7fb15a0aa7caa5d47734656d06514d5b75b127`** over the IAP tunnel (protocols
  `0.4.0+ec61156725a895ab` recomputed live — the script refuses stubs) with all ten digest pins;
  the first attempt died on `ECONNRESET` when the MIG retired the old proxy mid-write — tunnel
  re-established on the new VM, retried clean.
- 2026-10-22T09:1xZ — **post-deploy smoke, all green**: public routes `/` `/pricing` `/signup`
  `/login` `/showcase` `/invite` + api `/healthz/` → 200; signed-in shell + `/bff/*` reads —
  `rhema-journeys --stage prod --steps R8.inbox,T2.badge --expect-sha dc7fb15…` → **PASS** ($0,
  test tenants auto-purge; `prod-smoke/`); **worker consuming** — prod worker logs show the new
  revision registering consumers at 09:13:34Z and consuming `run.walkthrough` +
  `billing.period-tick`/`auto-reload` crons. SSR arm: `N10` + `P1.public` on prod under
  `--expect-renderer ssr --expect-sha dc7fb15…` → **PASS** (`prod-ssr-leg/`); curl verified all
  six public docs carry `data-renderer="ssr"` + the full marker vocabulary — **D-SPA.6-1's
  residual prod leg discharged** (leg (b)'s post-SPA.28 shape already ran on pr-207).
- 2026-10-22T09:4xZ — **metered notice (GD-PREAUTH-ACTS.R6 item)**: dry-run re-read over the
  tunnel returned `recipients=2` — identical scope to R6MNY.1's 2026-10-21 measurement →
  `--send` delivered **2 emails + 2 inbox rows**, `EFFECTIVE_DATE=2026-12-01` (40 days out,
  ≥30 honored); counts-only evidence `metered-notice.md` (no PII); tunnel closed. The
  debit-mode flip itself is NOT performed — `launch-flips.md` preconditions 1–2 stay UNMET
  (`cap_calibration_reports` 0, admissible 0).

## Gap table

| Plan step | Delivered | Delta |
|---|---|---|
| 1 ledger+PR skeleton → `pr-<n>` | `1c8997d` pushed; **PR #207** opened, base `r6soak-1-…` | none |
| 2 preview bring-up | pr-207 full stack; Cloud Build `f953fcf4` (all 10 @ `dc7fb15`); digests pinned; migrate×58; `prv-207-test` | +OAuth config leg (F-R6DEP.1-2) — Better Auth mounts only with `googleOauthClientId` present; rolled env mid-run |
| 3 `paid:false` suite + `--expect-renderer spa` | Run A: 40 PASS, N8/N9 posture, T8/R10.keepalive owed; Run B: 30 legs, 0 renderer violations | two prior artifact runs (r1 unmounted-auth, r2 retired-flag + throttle) — evidence kept, not greenwashed |
| 4 destroy → rm → orphan sweep → cost | destroy 136+8+49 = 193 resources; `rm` done; orphan sweep **zero** (25 classes); spend ≈$4–6 ≤ $8 | subnet drain = ~2h20m GCP-managed reservation lag (pr-206 class) |
| 5 prod preflight | digests copied→`rhema-prod` AR, pinned; 4-condition classification committed | none |
| 6 `pulumi up` + provenance + deployments row | up clean (11u/1r/160same); provenance all-PASS; `prod:dc7fb15…` row recorded (retry after MIG rolled the proxy VM mid-write) | +1 retry (tunnel ECONNRESET on proxy rollover — honest retry, no state drift) |
| 7 post-deploy smoke | public 200s; R8.inbox+T2.badge PASS; worker consuming; **bonus: N10+P1.public `--expect-renderer ssr` PASS → D-SPA.6-1 residual discharged** | +ssr leg beyond the ticket floor |
| 8 rollback recipe | `rollback-recipe.md` committed — `git revert` + redeploy `ffbb8ad` + `record-deployment` + provenance `--expect ffbb8ad` | none |
| 9 metered notice | dry-run re-verified scope (2 == 2) → `--send` 2 emails + 2 inbox rows, EFFECTIVE_DATE 2026-12-01 | none |
| 10 verify + closeout | turbo 135/135; `pnpm test` 512 files/**6,033 pass**/4 skip/**0 fail**; six `check:*` green; build-memory warnings-only; append-only OK vs `dc7fb15` | none |

## Evidence log

`docs/build/reports/2026-10-22_R6DEP.1/`:

- `preview-suite/` + `preview-suite-r2/` — the artifact runs (r1 unmounted-auth; r2
  retired-flag/throttle) + the cleaned re-run, reports + screenshots.
- `preview-surfaces-spa/` — `--expect-renderer spa` sweep: 30 gated legs, zero renderer
  violations (N9 fail = Stripe-posture; T8 owed).
- `prod-preflight/` — prod stack export + `/healthz` pre-state; `pulumi preview --diff` JSON;
  `preview-classification.md` (all four GD-DEPLOY.R6 conditions, per-resource table);
  additive-lint + billing-read outputs.
- `rollback-recipe.md` — concrete `git revert` + redeploy-`ffbb8ad` + `record-deployment` +
  provenance commands for this exact SHA.
- `prod-smoke/` — signed-in shell + `/bff/*` legs (R8.inbox, T2.badge) PASS, provenance
  `dc7fb15…`, $0.
- `prod-ssr-leg/` — `N10` + `P1.public` PASS under `--expect-renderer ssr` on prod.
- `metered-notice.md` — counts-only send evidence (2+2, EFFECTIVE_DATE 2026-12-01).
- `docs/build/logs/ci-R6DEP.1.json` — CI boundary read (gitignored by convention).

## Evidence report

**Deploy authority exercised exactly once, inside the envelope.** `GD-DEPLOY.R6` authorized
`pulumi up --stack prod` on four conditions — each was evidenced in a committed file BEFORE
the up ran: zero stateful replace/delete (the only replace was the stateless proxy
InstanceTemplate, rolled by the MIG), additive lint PASS (no migrations newer than `0058`,
matching prod's `_migrations` max read over the tunnel), monthly cost delta $0 ≤ $15, and a
committed provenance plan that post-deploy `check-deploy-provenance` then satisfied
all-PASS on both origins at `dc7fb15a0aa7caa5d47734656d06514d5b75b127`. No condition was
argued past.

**Provenance + record.** `deployments.id` =
`prod:dc7fb15a0aa7caa5d47734656d06514d5b75b127` (protocols `0.4.0+ec61156725a895ab`,
ten service digests recorded; the script recomputes the protocol version and refuses stubs).

**Preview suite.** pr-207 proved the tip on the full `paid:false` registry (40 PASS; the
four non-greens are preview posture — N8 collab-wire, N9 Stripe — or owed-reporting — T8,
R10.keepalive — never fabricated green) plus a zero-violation `--expect-renderer spa`
surface sweep. Two artifact runs (unmounted-auth, retired-flag+throttle) are committed as
evidence, not hidden.

**Prod posture after the deploy.** Public docs: `data-renderer="ssr"` + full marker
vocabulary on all six routes (`N10`+`P1.public` PASS). Authenticated space: signed-in shell
+ `/bff/*` reads PASS. Worker: consuming (run.walkthrough + billing crons on the new
revision). Deploy delta: image rolls + usercontent CORS response-headers only.

**Notice.** The GD-PREAUTH-ACTS.R6 metered-notice item executed post-deploy after the
scope re-verified (2 recipients, same classes): 2 emails + 2 inbox rows, effective
2026-12-01. The debit flip stays gated (preconditions 1–2 UNMET) — no flip performed.

**Rollback.** `git revert` + redeploy of `ffbb8ad3f2dedd690a5b9d8a86528128fd25fa23` —
concrete commands in `rollback-recipe.md`.
