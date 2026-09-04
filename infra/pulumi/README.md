# `infra/pulumi` — Rhema GCP infrastructure (Pulumi, TypeScript)

This is the Pulumi program that replaces the superseded SST/AWS skeleton (AWS→GCP amendment 2026-09-02;
DEFERRALS **D-P0.01-7**). It is **operator-run IaC**, like the old `sst.config.ts` was — it is *not* a
pnpm-workspace member and is not part of `tsc -b` / `eslint` / `pnpm test`. The Pulumi CLI installs its
own deps and runs it with ts-node.

The security- and cost-critical numbers (sandbox subnet isolation, AlloyDB sizing, per-run spend guard,
bucket versioning/retention) come from the **typechecked, unit-tested** pure config in `infra/config/`
(`stages.ts`, `retention.ts`) — the same data the tests in `infra/config/stages.test.ts` assert. So the
deployed shape cannot drift from what the tests prove.

## What it provisions (spec §13.1/§13.2)

| Area | Resource |
|---|---|
| Network | Custom VPC, three `/20` subnets, Cloud NAT for **private-app only**, firewall rules making the sandbox a one-way street to the proxy (`network.ts`) |
| Data | AlloyDB cluster + primary (preview = small/paused), isolated + versioned GCS buckets with the §13.3 retention lifecycle, Memorystore Redis (`data.ts`) |
| Secrets | Secret Manager containers: `anthropic-api-key` (proxy-only), Better-Auth, Google OAuth, Stripe, run-token signing key (`secrets.ts`) |
| IAM | One Workload-Identity SA per service + explicit least-privilege secret/bucket bindings (`iam.ts`) |
| Compute | GKE **Standard** cluster (dataplane-v2 for NetworkPolicy) + node pool for run-task (CAP_SYS_ADMIN), egress-proxy MIG (startup-script `docker run` — the supported re-platform, D-P0.15c-7), seven Cloud Run services, external HTTPS LB + Cloud CDN for `web` (`compute.ts`) |
| Sandbox node egress | A Private-Google-Access route + firewalls (to the `199.36.153.8/30` VIP and the GKE master CIDR) + private DNS zones so the no-NAT sandbox nodes bootstrap + pull images (`network.ts`); the run-task GSA gets `roles/artifactregistry.reader` (`iam.ts`) — D-P0.15c-8 |
| Run-task k8s state | The `runs` namespace, the WI-bound `run-task-ksa`, and the pod egress NetworkPolicy (`infra/k8s/`, applied post-`up` by `infra/k8s/apply.sh`) — D-P0.15c-8 |

## Operator runbook

**Prerequisites (the agent cannot create these — hard blockers):**
- `gcloud auth login` **and** `gcloud auth application-default login` for project `rhema-507501`.
- Pulumi CLI installed; a reachable Pulumi backend (`pulumi login`).
- Billing enabled; a stated spend budget.

```bash
cd infra/pulumi
npm install                       # @pulumi/pulumi + @pulumi/gcp (heavy generated SDK; ~1–2 min)

pulumi stack select pr-test       # a throwaway preview stack
pulumi preview                    # MUST be clean — no spend

# [OPERATOR GATE — cloud auth + budget]  (ticket item 7)
pulumi up                         # provisions the pr-test stack (small/paused AlloyDB, isolated GCS…)
pulumi destroy                    # MUST tear down cleanly (AC2)

pulumi stack select dev
# the proxy MIG needs its DATABASE_URL as an ENCRYPTED Pulumi secret config (never committed); the proxy
# reads the provider KEY from Secret Manager itself, so only the key's secret NAME is passed (automatic).
pulumi config set --secret rhema:proxyDatabaseUrl "postgresql://…"   # the run-context DB the proxy resolves
pulumi config set rhema:proxyImage "<region>-docker.pkg.dev/<proj>/<repo>/egress-proxy@sha256:…"  # optional
pulumi up                         # stands up shared dev — the proxy MIG + sandbox node egress come up with
                                  # NO out-of-band steps now (D-P0.15c-7/8 baked into the IaC)
```

**Apply the run-task k8s state** (the `runs` namespace + WI-bound KSA + pod egress NetworkPolicy — D-P0.15c-8).
Stack-parameterized k8s state, so it is a documented post-`up` apply rather than a GCP resource:

```bash
gcloud container clusters get-credentials rhema-dev-run-task-gke --region us-central1 --project rhema-507501
PROJECT=rhema-507501 STACK=dev ./infra/k8s/apply.sh   # namespace + run-task-ksa (WI-bound) + NetworkPolicy
```

**Add secret versions out-of-band** (never in the repo or Pulumi state — REQ-ARCH-30):

```bash
printf %s "$ANTHROPIC_API_KEY" | gcloud secrets versions add rhema-dev-anthropic-api-key --data-file=-
# …likewise better-auth-secret, google-oauth-client-secret, stripe-secret, run-token-signing-key
```

## Post-deploy network assertion (D-P0.01-2 — the live half of AC3)

After `pulumi up`, prove on the **live VPC** that the sandbox subnet has no egress but the proxy:

```bash
# No Cloud NAT names the sandbox subnet as a source:
gcloud compute routers nats describe rhema-dev-nat --router rhema-dev-router --region us-central1 \
  --format='value(subnetworks)'      # must NOT contain the sandbox subnet

# No 0.0.0.0/0 default route resolves for the sandbox tag, and the only egress-allow to it is the proxy:
gcloud compute firewall-rules list --filter="name~rhema-dev-sandbox" \
  --format='table(name,direction,priority,destinationRanges.list(),allowed[].map().firewall_rule().list(),denied[].map().firewall_rule().list())'
# expect: a priority-1000 deny-all EGRESS on tag `sandbox`, beaten only by a priority-900 allow to the
# private-app range (the proxy tier) — nothing else.
```

The stack output `sandboxIsolated` records the expected facts
(`{hasDefaultInternetRoute:false, hasCloudNat:false, egressTargets:["fw:egress-proxy"]}`); the commands
above are what a reviewer runs to confirm the live network matches.
