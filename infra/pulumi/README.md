# GCP infrastructure

This directory is the operator-run Pulumi TypeScript program. It has its own npm dependencies and is not a pnpm workspace package. The pure configuration in [`../config/`](../config/) is typechecked and unit-tested by the main workspace; Pulumi consumes it when constructing resources. Tests establish the intended configuration, while deployment previews and live checks establish actual infrastructure state.

This is not a local development setup. Read [development](../../docs/development.md) first if you want to build or test Rhema. Infrastructure changes require a chosen cloud project, credentials, a Pulumi backend, and an approved budget.

## Resource map

| Source                                             | Responsibility                                                                                   |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| [`network.ts`](network.ts)                         | VPC, subnets, private-app NAT, sandbox firewall rules, and Private Google Access                 |
| [`data.ts`](data.ts)                               | PostgreSQL, Redis, storage buckets, backups, and retention                                       |
| [`secrets.ts`](secrets.ts), [`index.ts`](index.ts) | Secret containers, generated credentials, and service wiring                                     |
| [`iam.ts`](iam.ts)                                 | Service identities and secret/storage access                                                     |
| [`compute.ts`](compute.ts)                         | Cloud Run services/jobs, GKE run-task cluster, proxy MIG/load balancer, and public load balancer |
| [`monitoring.ts`](monitoring.ts)                   | SLO dashboard, metrics, alerts, and configured notification channel                              |
| [`../k8s/`](../k8s/)                               | Run namespace, service account, egress policy, and AppArmor loader applied after provisioning    |

[`stages.ts`](../config/stages.ts) owns the stage differences. The current source configures AlloyDB for dev/preview and regional Cloud SQL PostgreSQL 16 for prod, BASIC Redis, and a two-instance prod proxy MIG behind an internal load balancer. See the [proxy operations guide](../../docs/ops/proxy-ha.md) for its cutover and rollback constraints. Resource sizes, budgets, and live posture must be checked for the deployment being operated; historical estimates are not a current quote.

## Stack ownership

| Stack         | Lifecycle path                                                                |
| ------------- | ----------------------------------------------------------------------------- |
| `pr-<digits>` | Only [`scripts/live/preview-stack.mjs`](../../scripts/live/preview-stack.mjs) |
| `dev`         | Operator-run Pulumi in this directory                                         |
| `prod`        | Operator-run Pulumi and the [production runbook](../PROD-BRINGUP.md)          |

The preview guard refuses prod, dev, and malformed names even for reads. It creates and verifies the `rhema:owner=ops-preview` tag, refuses adoption of an existing foreign stack, and separates resource destruction from stack removal. After `destroy`, enumerate remaining stage resources and prove there are no orphans before `rm`. Never bypass this path with raw Pulumi commands for a preview.

## Preview preparation

Run the guard from the repository root. Its source documents the accepted verbs and arguments. A session-capable preview needs the following sequence:

1. `init pr-<n>` to create the owned stack.
2. `config` to pin built service/proxy/run-task images and public origins required by the chosen preview topology.
3. `resend-pull pr-<n>` to pipe the operator-seeded nonproduction mail key into encrypted config. Optional Stripe posture tests use the separate `stripe-pull` path and a nonproduction Stripe key.
4. `preview`, review the plan and budget, then `up`.
5. Apply the stage's Kubernetes configuration and execute its `rhema-<stack>-migrate` Cloud Run Job.
6. `seed-invite pr-<n>` to create the deterministic non-secret `prv-<n>-test` code, then run [journeys](../../packages/journeys/README.md) with the preview URLs and `--invite-code`.
7. `destroy`, verify zero orphan resources, then `rm`.

The guard and [`index.ts`](index.ts) enforce separate preview credentials. Never copy a production secret value into a preview. A placeholder run-task image may exercise non-model surfaces but cannot execute live model runs; see the [SDK image inputs](../../apps/run-task/vendor/README.md).

## Secrets and migrations

For nonproduction stages, Pulumi generates PostgreSQL passwords, the restricted app/collab DSNs, the system DSN, authentication secrets, and the run-token key pair. Cloud Run mounts the generated DSNs from Secret Manager. External provider, mail, and optional Stripe credentials still need the operator's nonproduction inputs.

The nonproduction migrate Job creates the database, applies migrations, enables the scoped login roles with the generated passwords, and seeds code rows. Dev also seeds the real-project fixtures; preview stages refuse that fixture seed. If `rhema:gitSha` and `rhema:protocolsVersion` are configured, the Job records deployment provenance.

Prod uses the operator migration path in [`integration/src/live-prod-bringup.ts`](../../integration/src/live-prod-bringup.ts). Most production secret values are provisioned out of band; the app-role password/DSN and remote-cache token have program-managed creation paths. Follow the source ownership rules before rotating any value. Never print DSNs, tokens, or decrypted stack outputs into reports.

## Dev command locations

From the repository root, install the separate program's dependencies in a subshell:

```bash
(cd infra/pulumi && npm install)
(cd infra/pulumi && pulumi stack select dev)
(cd infra/pulumi && pulumi preview)
```

After the operator approves the plan and budget, `pulumi up` runs in the same directory. Kubernetes application runs from the repository root:

```bash
# Set GCP_PROJECT to the approved project and obtain that cluster's kubeconfig first.
PROJECT="${GCP_PROJECT:?set the approved project}" STACK=dev ./infra/k8s/apply.sh
```

The dev cluster uses the configured region; prod's GKE cluster is zonal. Read the stack outputs and current configuration instead of substituting a different stage into a copied production command. Dev retains warm resources; ending a verification window requires an explicit cost/teardown decision.

## Network verification

Verify both layers after a deployment:

- Cloud NAT covers the private-app subnet, not the sandbox. The sandbox firewall denies arbitrary internet egress and explicitly admits the proxy tier, Private Google Access VIP, and GKE control-plane traffic.
- The [pod NetworkPolicy](../k8s/20-run-task-egress-policy.yaml) admits DNS, the private-app proxy/API ports, the Google API VIP, and the Workload Identity metadata endpoint. Other egress is denied.
- Run-task credential and uid separation remains a separate boundary; a network allowlist alone does not prove that credentials are inaccessible to the model process.

The `sandboxIsolated` output records intended stage facts. It does not replace inspection of live routes, NAT, firewall rules, NetworkPolicy, and a bounded egress probe. Record the deployment SHA and measured results with the operator run.
