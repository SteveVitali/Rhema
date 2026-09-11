# ADR-001: Cloud provider GCP + inference via the direct Anthropic API — retro-fitted record

- **Status:** Accepted
- **Date:** 2026-09-02
- **Ticket:** cloud-switch (PR #7)
- **Requirement ids:** REQ-ARCH-1, REQ-ARCH-2, REQ-ARCH-30, REQ-ARCH-31
- **Spec:** rhema-design-spec §12 (execution/platform architecture), §13 (deployment); Q-3

> Retro-fitted by MAINT.1 (build-memory v2 migration) from the manifest's `## Spec amendments applied`
> (2026-09-02). The decision was taken and applied during the build; this ADR is its committed record.

## Context

The ratified spec assumed **AWS-first** (Fargate run-tasks, Aurora, S3, SES, SST, and — load-bearing —
"Claude Platform on AWS Marketplace" as the inference channel, chosen because Anthropic's server-side web
search/fetch tools are not available on Bedrock). During Phase-0 bring-up the operator could not create an AWS
account. The one hard AWS tie was the inference channel; every other AWS service had a GCP peer.

## Decision

Move **compute to GCP** and **inference to the direct Anthropic API** (platform-billed; the key lives in Secret
Manager and is proxy-injected per run). Sourcing inference from Anthropic's first-party API is cloud-independent
(it works from anywhere with the key) and returns the `usage` block (incl. `server_tool_use`) plus a
request-id-matchable cost report, so the metering + nightly reconciliation design holds. This also **collapses
the H1 auth spike** (the SigV4-vs-key Marketplace question is moot with a direct key). Service mapping:
Fargate→Cloud Run; run-task→GKE Standard (for `CAP_SYS_ADMIN`); Aurora→AlloyDB; S3→GCS; CloudFront/ALB→Cloud
CDN/HTTPS-LB; Secrets Manager→Secret Manager; SigV4/task-role→Workload Identity; SES→Resend; CloudWatch→Cloud
Operations; us-east-1→us-central1. pg-boss, Stripe, Better Auth and the two-uid boundary model are unchanged.

## Consequences

- Affects §12.1/12.3/12.4/12.7/12.9, §13.1–13.5, H0/H1, and tickets P0.01/P0.06/P0.07/P0.08/P0.15/PRB.09.
- The SST→Pulumi IaC rewrite it forces is a separate decision ([[ADR-003]], DEFERRALS `D-P0.01-7`).
- Server-side web tools remain available (they are an Anthropic-API feature, not an AWS one), preserving the
  transparency floor's `cited ⇒ fetched` check.
- No product requirement changed; the amendment is an infrastructure/inference-channel substitution.

## Alternatives considered

- **Stay AWS, operator opens an account later.** Rejected: blocked all Phase-0 live work indefinitely.
- **GCP compute but inference via Vertex Claude.** Rejected: Vertex (like Bedrock) lacks Anthropic's server-side
  web search/fetch, which the fact-check + `cited ⇒ fetched` transparency floor depend on.

## Revisit trigger

Revisit if Anthropic ships server-side web tools on a cloud-native channel the deployment already uses (Vertex),
or if first-party API pricing/terms change materially against a marketplace-billed alternative, or if a
multi-provider routing requirement (REQ-ARCH-10, deferred) reaches a stage that needs a cloud-native model API.
