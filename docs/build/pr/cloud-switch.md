<!-- PR #7 body as submitted (stevevitali/cloud-switch-gcp → main, MERGED). Committed by MAINT.1 build-memory migration as the evidence file for BUILD_INDEX row cloud-switch. -->

## Summary

The operator could not create an AWS account. This refactors the ratified "AWS-first" design to **GCP**, and — the higher-leverage change — moves inference to the **direct Anthropic API**.

**The key finding:** the load-bearing AWS dependency was never generic compute (ECS/Aurora/S3 all have GCP equivalents) but the **inference channel**. "Claude Platform on AWS" is Anthropic's first-party API with Marketplace billing and the server web tools our research phases require. GCP's Vertex Claude — like Bedrock — **lacks those web tools**. So a naive lift to GCP would break the research architecture. Sourcing inference from the **direct Anthropic API** (`api.anthropic.com`, platform-billed, key in Secret Manager, proxy-injected) is cloud-independent, works on any host, and **collapses the M15 auth spike (H1)** — there's no SigV4/Marketplace path.

## Service mapping (applied consistently)

| AWS | GCP |
|---|---|
| ECS Fargate (services) | Cloud Run |
| Fargate — run-task sandbox | **GKE Standard** (needs `CAP_SYS_ADMIN` for the §12.6 mount-namespace sandbox; Cloud Run can't grant it) |
| Aurora Serverless v2 | AlloyDB for PostgreSQL |
| S3 · CloudFront/ALB | GCS · Cloud CDN/HTTPS-LB |
| Secrets Manager · SigV4/task-role | Secret Manager · Workload Identity |
| SES · SST · CloudWatch · Bedrock | Resend · Pulumi (TS) · Cloud Operations · Vertex AI |
| Claude Platform on AWS (Marketplace) | **direct Anthropic API** (platform-billed) |

## What changed

- **Spec** (`docs/rhema-design-spec.md`): §12.1/12.3/12.4/12.7/12.9 + §13.1–13.5, plus a **§12 amendment banner** with the full mapping table. Historical decision matrices/appendices are left as record and covered by reference (the architecture sections are authoritative).
- **Manifest**: stack line, H0/H1 rows (**H1 now RESOLVED BY DESIGN**), chain table, § Spec amendments applied.
- **Tickets**: 00a (H0), 06a (H1), 01, 06, 07, 08, 16, 25.
- **DEFERRALS**: P0.01 rows → GCP; new **D-P0.01-7** (SST→Pulumi IaC rewrite, pending a P0.01 re-run once the GCP project exists); P0.06 rows → GKE/Anthropic.
- **Repo docs**: AGENTS.md, README.md.
- **Code**: engine `sessionStore` label → `gcs`; `scrubbed-env` adds GCP creds to the forbidden set; run-task Dockerfile → GKE Job/Pod; managed-agents comment.
- **infra/**: the committed SST skeleton is marked **SUPERSEDED** (banner) — the real Pulumi/GCP IaC is intentionally not hand-written now (untested with no GCP project); it lands on the P0.01 re-run.

## What operators need now (shortened)

The old critical path (AWS account → Marketplace subscription → H1 auth spike) collapses to: **an Anthropic API key** (needs no cloud account — unblocks the 7→8 build today) + a **GCP project** (long-lead; only for live deploy, which we already defer). The updated Phase-0a runbook site has the report-back templates.

## Verification

Full gate green: **78** build/typecheck/lint tasks, **425** tests. No behavior change in the P0.06 code — the switch is naming/config + the inference-source amendment.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
