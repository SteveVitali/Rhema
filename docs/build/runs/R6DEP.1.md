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
- **Started:** 2026-10-22T05:42Z · **Closed:** (pending)
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
- **ci:** (pending)

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). No row names R6DEP.1 as its unblocker. Rows in
this ticket's blast radius (dated notes at close; no flips expected):

- **D-ECON.1-3 / D-ECON.1-4** — OPEN; cap-calibration admissibility + derived cells. Unchanged by
  this run (admissible=0 per R6MNY.1); the metered-notice send is a `GD-PREAUTH-ACTS.R6` item +
  `launch-flips.md` step-0 precondition, not one of these rows.
- **D-OBS.1-3 / BL-74-class / D-SPA.28-1** — the nightly-green-on-deployed-SHA rows: this deploy
  moves the deployed SHA to the tip; the first scheduled post-merge nightly remains REQ-POST-4 /
  REQ-GO-2's criterion. Dated note only.
- **D-SPA.6-1** (prod SSR arm), **D-PRB.01-1** (invite leg), **D-CAP.1-1**, **D-SEC.2-1** —
  REQ-POST-* legs consume the deployed tip; this run only delivers the deploy they require.
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

- [ ] Preview suite green on the tip; teardown verified *(staging-verified)*
- [ ] Each pre-authorization condition evidenced before `up` *(live-executed)*
- [ ] Provenance all-PASS on prod at the tip SHA *(live-executed)*
- [ ] Universal phase-gate AC *(agentic)*

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

## Gap table

(pending — filled at Phase 4)

## Evidence log

(pending — `docs/build/reports/2026-10-22_R6DEP.1/`)

## Evidence report

(pending)
