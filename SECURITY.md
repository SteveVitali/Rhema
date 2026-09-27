# Security Policy

## Reporting a vulnerability
Please report suspected security issues privately to **security@rhema.tools**. Do not open a public
issue for a vulnerability. We aim to acknowledge within 3 business days and to provide a remediation
timeline after triage.

## Handling of secrets
Secrets are **never** committed to this repository (enforced by gitleaks in the `public-safe` CI job)
and are never passed as plaintext environment variables to `web` or `collab` (REQ-ARCH-30). Provider
keys live only in the `egress-proxy`; Stripe and Better Auth secrets live in AWS Secrets Manager /
SSM. The per-run token and proxy credential are delivered to the `harness` uid via a file the `agent`
uid cannot read — never as env vars to the model's process (REQ-SPEC-10).

## Isolation posture (skeleton owned by P0.01)
- The sandbox subnet has **no** route to an internet or NAT gateway (REQ-ARCH-2); its only egress
  target is the egress-proxy security group.
- `fetcher` is the only component that opens arbitrary outbound HTTP and it parses nothing; `convert`
  parses and has no network (REQ-ARCH-4 amended).
- Row-Level Security (`FORCE ROW LEVEL SECURITY`, `SET LOCAL` only) scopes every tenant-owned table
  (policies land in P0.02).

## Data retention & deletion
Retention follows the §13.3 schedule (REQ-ARCH-29); project and account deletion follow the
tombstone→purge and grace→hard-delete pipelines (REQ-ARCH-28; REQ-ACCT-4). See `infra/config/retention.ts`
and `apps/worker/src/deletion.ts`.
