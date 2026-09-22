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
| Compute | GKE **Standard** cluster + node pool for run-task (CAP_SYS_ADMIN), egress-proxy MIG behind an internal LB, seven Cloud Run services, external HTTPS LB + Cloud CDN for `web` (`compute.ts`) |

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
pulumi up                         # stands up shared dev
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
