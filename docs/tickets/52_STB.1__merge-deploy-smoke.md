# STB.1 — Merge gate + full-chain deploy + smoke

- **Sequence:** 52 · **Phase:** post-P1 closeout · **Tag:** ops
- **base_branch:** `main` after the operator merges the stacked chain (PRs #50–#76, bottom-up).
- **Depends on:** **OPERATOR MERGE of the entire stack** — this ticket is gated on it. RCN.1 may
  run before the merge (it is audit-only); STB.1 must not.
- **Scope (one line):** deploy the merged tree to `dev` — every service image, all migrations
  `0029`–`0041`, `infra/k8s/apply.sh`, the new Pulumi IAM/monitoring wiring — then the smoke
  battery that proves the deploy is coherent.
- **Spec §§:** 13.2 (stages), 13.5 (deploy provenance).
- **REQ coverage:** REQ-ARCH-38/39 (deploy provenance stamped with real `protocols_version`).
- **Run:** `implement-spec spec=docs/tickets/52_STB.1__merge-deploy-smoke.md`
- **Gate status:** operator merge is the hard prerequisite. GCP deploy credentials exist
  (PRB.15/PRB.18 pattern). No new secrets.
- **Live stage:** this ticket IS the live stage — a `dev` deploy. Spend $0 (infra apply + smoke
  asserts; no inference).

## Goal

Bring `dev` to the post-P1 state so every downstream STB ticket verifies against real deployed
code. Concretely: after the operator merges the stack to `main`, build all images, `pulumi up`
`dev`, apply migrations `0029`–`0041` in order, run `infra/k8s/apply.sh`, stamp a `deployments`
provenance row carrying the real `protocols_version`, and smoke-verify the platform end-to-end.

## Load-bearing context

- Deploy procedure precedent: `docs/build/runs/PRB.24.md` / `PRB.25.md` Stage B sections
  (Cloud Build image tags → digest pins in `infra/pulumi/Pulumi.dev.yaml` → `pulumi up` →
  `scripts/live/record-deployment.mjs` provenance row).
- Migrations pending on `dev`: `0029` (project list), `0030` (timeline), `0031` (run sheet),
  `0032` (approval surface), `0033` (chat), `0034` (figures), `0035` (ingestion), `0036`
  (billing), `0037` (showcase), `0038` (account export), `0039` (in-app notifications), `0040`
  (settings/account), `0041` (P1.22 launch checks). Apply via the prod-tunnel pattern through the
  bastion (`rhema-prod-proxy-mqvs`, local port 15433 for prod; the `dev` equivalent per stage
  facts in `infra/config/stages.ts`).
- Pulumi-side changes landing with this deploy: custom `IAMCustomRole` for the worker (replaces
  `roles/container.developer` — D-P0.01-5 applies here), monitoring/SLO stack (P1.22),
  fetcher/convert/user-content grants (P1.15), `STRIPE_SECRET_KEY_NAME` wiring (P1.16),
  `FETCHER_SERVICE_URL`/`USER_CONTENT_BUCKET`/`CONVERT_JOB`/`INGEST_MODEL_KEY_SECRET` env wiring.
- The `dev` stage may not exist as a live stack — check `infra/config/stages.ts` +
  `pulumi stack ls`. If only `prod` is provisioned, deploy to `prod` instead (the PRB.* precedent
  did prod-only deploys) and record the deviation.

## In scope

1. Wait for the operator merge (or verify it happened: `gh pr list --state merged`).
2. Build all service images on the merged `main` SHA (Cloud Build, tag `p1-final`).
3. `pulumi preview` — review the diff, then `pulumi up` on `dev` (or `prod` per the stage audit).
4. Apply migrations `0029`–`0041` in order; verify schema parity.
5. `infra/k8s/apply.sh` for the run-task GKE manifests.
6. `scripts/live/record-deployment.mjs` provenance stamp (real `protocols_version`, real digests).
7. Smoke battery (all $0, read-only):
   - `/healthz` 200 on api; `/` returns the marketing page; `/login` renders.
   - `/app` renders the four attention groups for an authed session.
   - `/p/:project` renders the IDE shell (rail + Page + Timeline + Desk mounts).
   - `wss://…/collab` upgrades under a session cookie.
   - A `deployments` row exists with `protocols_version=0.4.0+…` (not `stub-0.0.0`).
8. Close every deferral row the deploy itself satisfies (D-P0.01-5 is the known one — the IAM
  role lands on `pulumi up`; audit D-P0.01-4 self-hosted cache + D-P0.01-6 subnet sizing while
  inside the Pulumi state). Flip with evidence; leave genuinely-unverifiable rows open.

## Out of scope

- Any inference spend or live run (that's STB.3).
- Real-money Stripe legs (STB.4).
- Browser click-through legs that need a human hand — mark them in the run ledger as
  operator-pending.

## Acceptance

- **AC1** — `dev` (or `prod` if dev isn't provisioned) serves the merged SHA with all migrations
  applied and a real `protocols_version` in `deployments`.
- **AC2** — every smoke item above passes; each gets a row in the run-ledger evidence log.
- **AC3** — deploy-satisfiable deferral rows flipped to DONE with the deployment id cited.

## Verify

- Smoke asserts above + `check-build-memory.sh .` clean.
- Report `pulumi stack` outputs (service URLs, image digests) in the run ledger.
