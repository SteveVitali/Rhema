# ADR-003: IaC rewritten from SST (AWS) to Pulumi (GCP, TypeScript) — retro-fitted record

- **Status:** Accepted
- **Date:** 2026-09-03
- **Ticket:** P0.15b (PR #18); origin `D-P0.01-7`
- **Requirement ids:** REQ-ARCH-1, REQ-ARCH-2, REQ-ARCH-26, REQ-ARCH-27, REQ-ARCH-37..40
- **Spec:** rhema-design-spec §12 (execution/platform), §13 (deployment)

> Retro-fitted by MAINT.1 from the manifest's `## Spec amendments applied` (the SST→Pulumi note) and DEFERRALS
> `D-P0.01-7`. Applied at P0.15b (PR #18); this ADR is its committed record. Follows [[ADR-001]].

## Context

[[ADR-001]] moved compute to GCP, which stranded the committed AWS/SST `infra/` skeleton. Writing untested GCP
IaC before a GCP project existed was low-value churn, so P0.01's re-platform was deferred (`D-P0.01-7`) and the
SST files carried a superseded banner. When the GCP project (`rhema-507501`) existed, the IaC had to be written
against a real cloud so `pulumi preview`/`up` validated against the actual GCP API.

## Decision

Replace the SST (AWS) `infra/` skeleton with **Pulumi (TypeScript)** provisioning the GCP stack: Cloud Run
(web/api/worker/collab/fetcher/export/convert), a **GKE Standard** cluster for run-task (needs `CAP_SYS_ADMIN`),
AlloyDB, GCS, Memorystore Redis, Cloud CDN + HTTPS LB, Secret Manager, Workload-Identity service accounts, and
the no-egress sandbox subnet (Cloud NAT-free, egress only to the proxy). The Pulumi program typechecks against
real `@pulumi/gcp`; the network layer was proven live (`pulumi up`/`destroy` clean on pr-test) at P0.15b.

## Consequences

- Chosen over SST/CDK to satisfy the TypeScript-everywhere constraint (Q-3) while targeting GCP first-class.
- The Pulumi program is operator-run; its npm lockfile + compiled output are generated at deploy time
  (gitignored), versions pinned in `infra/pulumi/package.json` (committed).
- Live-only fixes surfaced during Stage B were folded back into the IaC across P0.15d–h (node-egress PGA, pod
  NetworkPolicy, proxy ingress firewall, worker CPU/no-throttle) — see those PRs' DEFERRALS rows.

## Alternatives considered

- **Keep SST, target AWS.** Rejected by [[ADR-001]] (no AWS account; inference channel moved).
- **Terraform / gcloud scripts.** Rejected: breaks the TypeScript-everywhere constraint and the typed-program
  validation Pulumi gives against `@pulumi/gcp`.

## Revisit trigger

Revisit if the deployment target changes clouds again, if Pulumi's GCP provider drifts in a way the pinned
versions cannot follow, or if a managed-platform (e.g. Cloud Run only, no GKE) becomes viable for the run-task
once the `CAP_SYS_ADMIN` requirement is relaxed.
