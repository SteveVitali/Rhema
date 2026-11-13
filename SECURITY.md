# Security policy

## Report a vulnerability privately

Email **security@rhema.tools** with suspected security issues. Please do not include an unpublished vulnerability in a public issue, pull request, or build record. We aim to acknowledge reports within three business days and provide a remediation timeline after triage.

Include the affected commit or deployment, reproduction steps, expected and observed behavior, and the likely impact. Use a minimal reproduction with accounts and data you control. Redact credentials, session cookies, signed URLs, and other users' content; describe where a secret was exposed without sending its value.

Publication of the source does not authorize testing other people's accounts or the hosted service. An external assessment uses an agreed scope, test accounts, and budget; see the [engagement scope](docs/security/pen-test-scope.md).

## Supported versions

Security fixes are applied on the `main` branch and ride the next deployment; only the current
`main` (and the deployment it serves) is supported. The hosted service tracks this repository's
deployed revision — report against the commit or deployment you observed.

## Security boundaries

The repository's required controls include:

- **Secrets:** never commit credentials. The `public-safe` CI job runs gitleaks. Provider keys belong at the egress-proxy boundary; Stripe and authentication secrets are managed through Secret Manager. The model process must not receive provider keys, run tokens, or proxy credentials. Run-task separates the `harness` and `agent` uids, with privileged credentials in harness-readable files.
- **Sandbox egress:** arbitrary internet access is restricted through the proxy. The network also permits specific infrastructure traffic, including DNS, Private Google Access, and Workload Identity; inspect both [VPC rules](infra/pulumi/network.ts) and [pod NetworkPolicy](infra/k8s/20-run-task-egress-policy.yaml) when changing this boundary.
- **Tenant isolation:** user-serving database access uses a role without `BYPASSRLS`. Directly tenant-scoped tables use RLS; child tables also depend on authorized parent access and explicit predicates. Elevated system connections are restricted to reviewed call sites. See the [tenancy audit](docs/security/tenancy-audit.md), table census, and [two-tenant probe](integration/src/two-tenant-probe.ts).
- **Untrusted content:** fetching and parsing are separated; conversion is isolated from network access. User-content delivery applies a closed inline-image allowlist and download disposition for other types. See the [content/CSP audit](docs/security/usercontent-csp-audit.md).

These are requirements and source-level controls, not a claim that every deployment or integration has been independently certified. In particular, the worker has optional model-key integrations that remain under review against the proxy-only policy; the [release-readiness review](docs/open-source-readiness.md) records that discrepancy. Dated security audits describe their recorded scope and date, not a fresh assessment of the current deployment.

## Retention and deletion

Retention configuration lives in [`infra/config/retention.ts`](infra/config/retention.ts). Project and account deletion use staged tombstone/purge and grace/hard-delete workflows implemented in [`apps/worker/src/deletion.ts`](apps/worker/src/deletion.ts). Review those paths when changing storage or adding a retained data class.
