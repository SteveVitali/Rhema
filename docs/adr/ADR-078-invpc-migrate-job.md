# ADR-078: In-VPC migrate/seed runs as a per-stack Cloud Run Job on non-prod stages

- **Status:** Proposed
- **Date:** 2026-10-04
- **Ticket:** OPS.1
- **Requirement ids:** REQ-ARCH-38, REQ-ARCH-39, REQ-SPEC-30, REQ-ARCH-30
- **Spec:** §13.2, §12.1

## Context
The stage databases are private-IP only. Prod runs migrations over an operator IAP tunnel
(`integration/src/live-prod-bringup.ts`) — a ceremony that needs an operator shell, a bastion, and
hand-set DSNs. A preview lifecycle must be able to migrate + seed **unattended and per-stack**: no
tunnel, no bastion, no operator shell, and hard guarantees that `seedRealProjects` (user-text
fixtures, REQ-ARCH-38) can never run on a preview and that the `deployments` provenance row
(REQ-ARCH-39) lands with the deploy.

## Decision
Non-prod stacks provision a `rhema-<stack>-migrate` **Cloud Run Job** (`infra/pulumi/compute.ts`)
that runs the worker image's `dist/migrate.js` entry (`apps/worker/src/migrate.ts`) on the
`private-app` subnet (`vpcAccess`, `PRIVATE_RANGES_ONLY` egress) under the worker SA. The Job
mounts the three generated DSNs via `secretKeyRef` — never a plaintext env — and performs, in
order: `create database rhema` bootstrap → `applyMigrations` → `ALTER ROLE … LOGIN PASSWORD` for
`rhema_app_login`/`rhema_collab` (passwords parsed back out of their own mounted DSNs — the SEC.1
role split goes live with no hand ALTER) → code seeds always + `seedRealProjects` only when the
stage kind resolves `dev` (`seedPlanFor` — preview-kind stages log a refusal) → the `deployments`
row when `rhema:gitSha`+`rhema:protocolsVersion` are pinned. The Job is executed with
`gcloud run jobs execute … --wait` (a read/execute verb — not a lifecycle verb — so it does not
route through `preview-stack.mjs`). Prod's operator-tunnel path is untouched.

## Consequences
- The migrate step is repeatable, per-stack, VPC-confined, and carries the same worker image the
  deploy pins — the migrations in the image can never drift from the code being deployed.
- The seed guard lives in *code the tests pin* (`migrate.test.ts`), not in an operator habit.
- Executing the Job is a deliberate `gcloud` act documented in the runbook; the Job itself is just
  a template until invoked.
- `--probe <url>` mode gives the smoke an in-VPC `/healthz` leg without exposing internal
  services publicly.

## Alternatives considered
- **GKE Job on the run-task cluster:** rejected — conflates the migrate step with the sandbox
  substrate, needs k8s credentials in the lifecycle script, and the cluster is the confined
  run-task surface, not a general batch runtime.
- **Operator tunnel per preview (prod's path):** rejected — it is precisely the hand ceremony a
  guarded preview lifecycle must not need.
- **Migrate at `pulumi up` time (local-exec/data source):** rejected — Pulumi-side execution would
  need DB reachability from the operator's network (private IP ⇒ impossible) and would put
  migration ordering inside the resource graph, which cannot express "run after services exist".

## Revisit trigger
If prod ever moves to an in-VPC migrate model, or a stage needs >900 s migrations, revisit the Job
shape (timeout, retries, or a dedicated migrate SA narrower than the worker's).
