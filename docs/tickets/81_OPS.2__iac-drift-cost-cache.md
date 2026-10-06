# OPS.2 — IaC drift, prod cost posture, and the Turbo remote cache

- **Sequence:** 81 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** ops
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** OPS.1, SEC.1
- **Scope (one line):** bring every hand-applied prod change into IaC or the runbook (the collab DB secret + `rhema_collab` LOGIN, adopted into SEC.1's role mechanism without rotation), zero the cosmetic Cloud Run scaling drift and the `alloydbCluster` output warning, commit the ad-hoc image-build helpers, measure the real monthly prod bill against the ~$50 target / ~$95 floor with a Cloud SQL HA pre-plan, and stand up the self-hosted Turbo remote cache.
- **Spec §§:** 13.2 (CI "Turborepo remote cache"; REQ-ARCH-39 deploy provenance), 13.3 (secrets), 13.1 as amended by ADR-010 (the prod cost floor; the HA levers), 13.5 (ops)
- **REQ coverage:** REQ-ARCH-39, REQ-ARCH-30, REQ-SPEC-30 (the collab role never bypasses RLS), REQ-ARCH-28 (backups/PITR in the HA pre-plan) (stamp in the PR)
- **Absorbs (backlog):** BL-27 (X-iac-runbook-drift), BL-28 (D-P0.01-4), BL-29 (X-infra-cost-vs-target; ADR-010's revisit)
- **Run:** `implement-spec spec=docs/tickets/81_OPS.2__iac-drift-cost-cache.md`
- **Gate status:** database role changes and any credential rotation — `rhema_collab` is adopted as-is, never re-passworded; a rotation or role change pauses. Also paused: infra cost deltas > $15/month (every HA lever is plan-only here); enabling a billing export or budget that needs billing-account IAM the build env lacks; and setting the GitHub `TURBO_API`/`TURBO_TOKEN` repo variables if the build env lacks repo-admin.
- **Live stage:** Stage A: code + tests + runbook ($0). Stage B: read-only `pulumi preview` and billing reads ($0), then a pre-authorized `pulumi up prod` for the drift fixes and the stateless cache service (zero stateful replace/delete, ≤ $15/mo delta); $0 inference

## Goal
Prod has to be reproducible from the chain-tip SHA plus the runbook. Today it is not, and four gaps show it.
- **Manual collab changes.** STB.1 enabled `LOGIN` on `rhema_collab` and set the `rhema:collabDatabaseUrl` Pulumi
  secret by hand, so collab would not crash-loop (`runs/STB.1.md` §3 ~100–103; §9 item 5). Neither is in
  `infra/PROD-BRINGUP.md` or any mechanism.
- **Preview noise.** Every `pulumi preview` since STB.1 has shown five or six cosmetic Cloud Run `-scaling`
  readback updates plus an `alloydbCluster` undefined-output warning. That noise hides real drift in the exact
  output the standing authorization's "zero replace/delete" check reads.
- **Scratch-only builds.** Every Stage B built images from gitignored `integration/.scratch/cloudbuild-*.yaml`.
- **Unmeasured cost.** The ~$50/mo target was authorized against a documented ~$95/mo floor (LEDGER GATE DECISIONS
  2026-09-17) and has never been measured.

Separately, CI's remote cache has been endpoint-config only since P0.01 (D-P0.01-4).

This ticket makes the IaC complete, makes previews quiet, puts a number on the bill, and gives CI a working cache.

## Load (read these — do not re-read others)
- Spec §13.2 (CI/CD paragraph, REQ-ARCH-39), §13.3 (secrets); `docs/adr/ADR-010-cloudsql-prod-database.md` (the ~$95 floor, the HA levers, revisit triggers); SEC.1's ADR (the role/secret provisioning mechanism) and OPS.1's ADR/run ledger (the fresh-stack mechanism it built).
- `docs/tickets/DEFERRALS.md` row D-P0.01-4; `docs/build/runs/STB.1.md` §3 ~95–110 and §9 items 5 and 7 (the collab secret/LOGIN; the `alloydbCluster` warning), `STB.2.md` ~140–155 (the scratch `cloudbuild-stb2.yaml`; the scaling drift), `STB.4.md` C.6 (the same drift on a worker-only roll); LEDGER GATE DECISIONS 2026-09-17 (the $50 target).
- `infra/PROD-BRINGUP.md` §0 (~17–30 the cost floor), §2 (~45–70 the config keys — no collab entry), §2b (the image build); `infra/pulumi/index.ts` (~20 `rhemaConfig.get*` keys; `collabDatabaseUrl` ~55; `alloydbCluster` export ~137), `compute.ts` (`scaling` ~408–410; collab env ~538–550), `data.ts` (Cloud SQL ~94–120; Redis ~189), `Pulumi.prod.yaml` (`rhema:collabDatabaseUrl` ~145).
- `packages/db/migrations/0001_roles.sql` (`rhema_collab` created NOLOGIN), `0028_collab_restore.sql` (its grants); `integration/.scratch/` (gitignored — read the `cloudbuild-*.yaml` set only).
- `turbo.json` (`remoteCache.enabled`), `.github/workflows/ci.yml` ~20–22 (`TURBO_API` / `TURBO_TOKEN` / `TURBO_TEAM` already wired); `LICENSES.md` + `licenses.exceptions.json`.

## In scope — deliverables
1. **The collab role and secret in IaC (BL-27; REQ-SPEC-30; REQ-ARCH-30).**
   - **Declare it.** `rhema_collab`'s LOGIN and its `DATABASE_URL` secret are declared through SEC.1's
     role-provisioning mechanism, the same one OPS.1 uses for fresh stacks.
   - **Adopt, don't rotate.** Prod's existing state is adopted by import or by an equivalent no-op, never by
     rotating the password or altering the role.
   - **Runbook.** `PROD-BRINGUP.md` §2 gains the collab step.
   - **Assertion.** The role is NOBYPASSRLS.
2. **Runbook completeness (REQ-ARCH-39).** A test fails when `infra/pulumi/*.ts` reads a `rhema:*` config key that
   `PROD-BRINGUP.md` does not document. This is the drift that let the collab key go unrecorded.
3. **Quiet previews.**
   - Find which Cloud Run field reads back differently (template-level `scaling` versus the service-level
     scaling/`scalingMode` defaults — re-confirm) and declare it, so an unchanged tree previews at **0 updates**.
   - Export `alloydbCluster` only where it exists, which removes the warning.
4. **Committed image builds (BL-27).** The image-set builds every Stage B ran from `integration/.scratch/` are
   promoted to one committed, parameterized build definition (e.g. `infra/cloudbuild/`), and `PROD-BRINGUP.md` §2b
   points at it. One-off query helpers stay in the gitignored scratch dir by design.
5. **The measured bill and the HA pre-plan (BL-29).**
   - **The bill.** The real prod bill, by service and SKU, for the last full month plus month-to-date, set against
     the ~$50 target and ADR-010's ~$95 floor. Record the source: the BigQuery billing export if enabled, else the
     operator's Cloud Billing report (a D-row).
   - **The levers.** Rank them by $/month with feasibility: the GKE free-tier waiver status, idle scheduling of
     Redis or the proxy MIG, Cloud Run min instances, the LB.
   - **The Cloud SQL HA pre-plan.** REGIONAL cost delta, failover rehearsal plan, maintenance window, and
     backups/PITR unchanged (REQ-ARCH-28). Plan only; execution is operator-paused.
   - **Budget alert.** A `gcp.billing.Budget` alert at the target, if IAM allows; else a D-row.
6. **The self-hosted Turbo remote cache (BL-28; D-P0.01-4).**
   - **The server.** A stateless cache service in the Pulumi program behind a config flag: scale-to-zero Cloud Run
     backed by a new GCS bucket with a lifecycle expiry.
   - **The token.** IaC-generated, a new secret (pre-authorized) in Secret Manager.
   - **CI.** CI's existing `TURBO_API`/`TURBO_TOKEN` point at it.
   - **Artifact integrity.** Consider `remoteCache.signature`.
   - **Licence.** Record the server's licence (REQ-ARCH-40 if it becomes a dependency).
   - **Closeout.** D-P0.01-4 is flipped with evidence.
7. **Closeout records.** X-iac-runbook-drift and X-infra-cost-vs-target are recorded as closed in `runs/OPS.2.md`
   for REC.1. Deployed provenance is recorded with `record-deployment.mjs`.

## Out of scope
- `dev` / `pr-<n>` stacks and the fresh-stack role mechanism → **OPS.1** (consumed).
- The user-serving / system role split and the api/worker pools → **SEC.1** (consumed; its role switch is its own
  gate).
- **Executing** any HA or cost lever (REGIONAL Cloud SQL, STANDARD_HA Redis, MIG ×2, bigger tiers) → operator.
- SLO remediation → **SLO.1**. Structured logging → **OBS.1**. The prod test-data cleanup → **MAINT.2** / **HUMAN-H7**.

## Acceptance criteria
- [ ] After codification, `pulumi preview --stack prod` shows **no change** to the `rhema_collab` role or its secret,
      and no password rotation (read-only). *(agentic)*
- [ ] A fresh stack (OPS.1's mechanism, or a PGlite role-catalog test) yields `rhema_collab` with LOGIN, NOBYPASSRLS
      and exactly 0028's grants. *(deterministic)*
- [ ] The runbook-completeness test fails if a `rhema:*` key read in `infra/pulumi/*.ts` is missing from
      `PROD-BRINGUP.md`, and passes on the tree. *(deterministic)*
- [ ] On an unchanged tree, `pulumi preview --stack prod` reports **0 to update, 0 to replace, 0 to delete** and no
      `alloydbCluster` warning. The evidence is committed. *(agentic, read-only)*
- [ ] The committed image-build definition reproduces the digest set an image job would produce for the chain tip,
      and no `PROD-BRINGUP.md` step references `integration/.scratch/`. *(deterministic + agentic)*
- [ ] The cost readout in `runs/OPS.2.md` holds the actual monthly figures by service/SKU; the gap to $50 and to
      $95; the ranked levers with $ deltas; and the HA pre-plan. The source of every number is named. *(agentic)*
- [ ] Two CI runs on the same SHA: the second shows remote-cache hits for `build` tasks, with the log evidence
      committed. The cache token never appears in a log or the ledger. *(agentic)*
- [ ] After the `pulumi up prod`: the post-up preview is empty, the provenance row equals the chain-tip SHA, and the
      month's cost delta ≤ $15, projected from the new resources. *(agentic)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-ARCH-39 (primary: the deployed prod state is reproducible from the SHA + runbook, and every deploy is
recorded), REQ-ARCH-30 (the collab and cache secrets stay in Secret Manager or encrypted config, never in the
repo or ledger), REQ-SPEC-30 (collab's role cannot bypass RLS), REQ-ARCH-28 (the HA pre-plan keeps backups/PITR).

## Cross-cutting invariants
- Manifest **2** (TypeScript/`.mjs` only; the cache server is a deployed container with its licence recorded) and
  **3** (the cache stores build outputs; confirm that no protocol-bearing artifact from `packages/protocols` is
  cached to a store reachable outside the project).
- Round 3: **REQ-SPEC-30** (collab adoption must not widen its grants or add BYPASSRLS), **REQ-SPEC-29** (no user
  surface changes; the evidence is previews, billing and CI logs), **REQ-SPEC-32** ($0 inference).

## Notes
- **Owned decisions (write ADRs):**
  - (a) **The cache server and its placement:** which open-source server; on the prod project/stack versus a
    separate `ci` stack. A new stack is not pre-authorized, but the prod stack's stateless additions are, under
    the `pulumi up prod` conditions.
  - (b) **The prod cost posture after measurement.** Changing the ~$50 target, or any lever with a > $15/mo delta,
    is the operator's decision. The ADR records the measured position and the recommendation.
- **Shared decisions consumed:** SEC.1 (roles, pools, and the provisioning mechanism) and OPS.1 (the fresh-stack
  mechanism this ticket adopts prod into). **Coordinate with SEC.1's role split.** If SEC.1 moved collab onto its
  user-serving role, adopt that state instead and record `rhema_collab` as retired, not re-created.
- **Anchors to re-confirm at build time:**
  - 0001 creates `rhema_collab` NOLOGIN (`create role … nosuperuser noinherit`); the LOGIN exists only on prod, by
    hand.
  - `integration/.scratch/` is gitignored (`.gitignore` ~3).
  - Cloud Billing cost totals need the BigQuery export or the console; the Billing API alone does not return them.
- **DEFERRALS rule:** anything not verifiable at build time becomes a `D-OPS.2-<n>` row with its compensating
  control. That includes a missing billing export, repo-admin for the CI variables, and a collab state that needs a
  role change to adopt.
