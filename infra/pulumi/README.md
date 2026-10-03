# `infra/pulumi` — Rhema GCP infrastructure (Pulumi, TypeScript)

This is the Pulumi program that replaces the superseded SST/AWS skeleton (AWS→GCP amendment 2026-09-02;
DEFERRALS **D-P0.01-7**). It is **operator-run IaC**, like the old `sst.config.ts` was — it is *not* a
pnpm-workspace member and is not part of `tsc -b` / `eslint` / `pnpm test`. The Pulumi CLI installs its
own deps and runs it with ts-node.

The security- and cost-critical numbers (sandbox subnet isolation, database sizing, per-run spend guard,
bucket versioning/retention, each stage's `requiredSecrets`) come from the **typechecked, unit-tested**
pure config in `infra/config/` (`stages.ts`, `retention.ts`) — the same data the tests in
`infra/config/stages.test.ts` assert. So the deployed shape cannot drift from what the tests prove.

## What it provisions (spec §13.1/§13.2)

| Area | Resource |
|---|---|
| Network | Custom VPC, three `/20` subnets, Cloud NAT for **private-app only**, firewall rules making the sandbox a one-way street to the proxy (`network.ts`) |
| Data | The stage's managed Postgres on the shared PSA peering — AlloyDB cluster + primary on dev/preview (preview = small/paused); **Cloud SQL Postgres 16 on prod** (`db-g1-small`, zonal, private-IP, 35 daily backups + 7-day PITR — amended 2026-09-17 for the ~$50/mo budget); isolated + versioned GCS buckets with the §13.3 retention lifecycle, Memorystore Redis (BASIC on all stages — prod included, same-day amendment) (`data.ts`) |
| Secrets | Secret Manager containers for every id in `ALL_SECRET_IDS` (+ non-prod-only `system-database-url`). **Prod** secret values are operator-set out of band (`gcloud secrets versions add`); **non-prod** values are generated in-program — `@pulumi/random` passwords for the postgres bootstrap + `rhema_app_login`/`rhema_collab` DSNs + better-auth/email-action, a `@pulumi/tls` RS256 run-token keypair — and land as Secret Manager *versions* written by `index.ts`. Values exist only in encrypted Pulumi state + SM (`secrets.ts`, `index.ts`) |
| IAM | One Workload-Identity SA per service + explicit least-privilege secret/bucket bindings — incl. api/worker/collab reads on their generated DSN secrets and the fetcher's `objectCreator` CONDITIONED to `user-content`'s `quarantine/` prefix (`iam.ts`) |
| Images | The per-stack Artifact Registry docker repo `rhema-<stack>` the images CI/`infra/cloudbuild/image-set.yaml` push to (`compute.ts`) |
| Compute | GKE **Standard** cluster (dataplane-v2 for NetworkPolicy) + node pool for run-task (CAP_SYS_ADMIN), egress-proxy MIG (startup-script `docker run` — the supported re-platform, D-P0.15c-7), seven Cloud Run services + the convert Cloud Run **Job** (§12.1) + the non-prod **`migrate` Cloud Run Job**, external HTTPS LB + Cloud CDN fronting `web`/`api`/`collab` and — on prod — the private `usercontent.rhema.tools` backend-bucket origin (`compute.ts`) |
| Domains/TLS (prod) | Managed cert over `rhema.tools`, `api.rhema.tools`, `usercontent.rhema.tools` (one zone — amended 2026-09-17); a reserved global IPv4; host-routing URL map; the operator's DNS records emitted as the `dnsRecords` stack output (PRB.15). Non-prod carries **no** `domains` block — `web` is `INGRESS_TRAFFIC_ALL` on `*.run.app` and self-wires `API_BASE_URL` to the api service's uri |
| Sandbox node egress | A Private-Google-Access route + firewalls (to the `199.36.153.8/30` VIP and the GKE master CIDR) + private DNS zones so the no-NAT sandbox nodes bootstrap + pull images (`network.ts`); the run-task GSA gets `roles/artifactregistry.reader` (`iam.ts`) — D-P0.15c-8 |
| Run-task k8s state | The `runs` namespace, the WI-bound `run-task-ksa`, the pod egress NetworkPolicy, and — SEC.3 — the AppArmor profile-loader DaemonSet + `rhema-run-task` profile (`infra/k8s/`, applied post-`up` by `infra/k8s/apply.sh`) — D-P0.15c-8 |

## Stack lifecycle — which path owns which verb

| Stack | Create/up/destroy | Notes |
|---|---|---|
| `pr-<n>` (exactly `^pr-\d+$`) | **`scripts/live/preview-stack.mjs` — the ONLY permitted path** | Guarded: refuses `prod` for every verb, refuses any non-`pr-<digits>` name (incl. `pr-test`, `dev`, `staging`), stamps + checks the `rhema:owner=ops-preview` stack tag before any mutating verb. See below. |
| `dev` | operator-run `pulumi` in this dir | Shared integration; full stack since OPS.1. Never destroyed through the preview guard (the name refuses it). |
| `prod` | operator-run `pulumi` in this dir, `infra/PROD-BRINGUP.md` | Deletion protection ON (Cloud Run `deletionProtection`, AlloyDB/GKE policies). The preview guard refuses the name outright — there is no override flag. |

## The preview guard (`scripts/live/preview-stack.mjs`)

Every `pr-<n>` lifecycle act goes through the guard — its refusal contract is unit-tested
(`preview-stack.test.mjs`, incl. a tree scan proving no other script shells `pulumi destroy`/`stack rm`):

```bash
node scripts/live/preview-stack.mjs init pr-1            # creates + stamps rhema:owner=ops-preview
node scripts/live/preview-stack.mjs config pr-1 rhema:serviceImages '{"api":"…@sha256:…",…}'
node scripts/live/preview-stack.mjs config pr-1 rhema:proxyImage '…/rhema-pr-1/egress-proxy@sha256:…'  # optional until built
node scripts/live/preview-stack.mjs up pr-1            # pulumi up --yes --skip-preview --stack pr-1
node scripts/live/preview-stack.mjs output pr-1        # read outputs (databaseHost, redisHost…)
node scripts/live/preview-stack.mjs destroy pr-1       # resources only — the stack stays registered
node scripts/live/preview-stack.mjs rm pr-1            # pulumi stack rm pr-1 --yes (a separate, audited act)
```

Rules the guard enforces (fail if removed — the test suite proves each):

- `prod` (and `prod-*`) is refused for **every** verb, reads included. No override.
- Only `^pr-\d+$` names pass — `stageKindFor`'s fail-closed unknown→preview mapping is *not* trusted here.
- `init` stamps `rhema:owner=ops-preview`; every later verb — `output` and `select` included —
  refuses a stack whose tag is absent or foreign. `init` refuses to adopt an existing stack.
- `destroy` never carries `--remove` or `--exclude-protected`: resources die, the registration
  stays, and the orphan enumeration runs *before* `rm` drops the stack.

## Non-prod boot — zero hand-set secrets (OPS.1)

A fresh `dev`/`pr-<n>` stack needs **no** `rhema:*DatabaseUrl` configs and **no** hand ALTER:

1. `index.ts` mints the generated set (`NONPROD_GENERATED_SECRET_IDS` in `stages.ts`): postgres
   bootstrap password, `app-database-url` / `collab-database-url` / `system-database-url` DSNs,
   `run-token-signing-key`, `better-auth-secret`, `email-action-secret` — as SM versions.
   `pulumi stack output appDatabaseDsn --show-secrets` reads the app DSN back for operator psql.
2. The `rhema-<stack>-migrate` **Cloud Run Job** (non-prod only) runs inside the VPC under the
   worker SA with the three DSNs mounted via `secretKeyRef`:
   `create database rhema` → `applyMigrations` → `ALTER ROLE … LOGIN PASSWORD` for
   `rhema_app_login`/`rhema_collab` (passwords parsed from their own DSNs — the SEC.1 role split
   goes live without a hand ALTER) → seeds. Execute it:
   `gcloud run jobs execute rhema-<stack>-migrate --region us-central1 --wait`.
3. Seed policy (REQ-ARCH-38): `dev` runs `seedRealProjects` (the three-real-project fixture);
   **preview-kind stages hard-refuse it** (`seedPlanFor` in `apps/worker/src/migrate.ts`) and
   seed code rows only (agent types + protocols). Prod never reaches this Job — its migrate path
   is the operator tunnel in `integration/src/live-prod-bringup.ts`.
4. With `rhema:gitSha` + `rhema:protocolsVersion` set, the same Job writes the `deployments`
   provenance row (REQ-ARCH-39) — unset ⇒ the leg skips and a bare `pulumi preview` stays clean.

The one seed that is still out-of-band on non-prod: the **non-prod** Anthropic key into
`rhema-<stack>-anthropic-api-key` (`gcloud secrets versions add … --data-file=-`). Provider keys
are read only by the egress-proxy (REQ-ARCH-31); previews must never receive `rhema-prod-*`
secret values or refs (the tripwire at the bottom of `index.ts` plus the stage tests assert it).

## Operator runbook — `dev` up → verify → idle

**Prerequisites:** `gcloud auth login` **and** `gcloud auth application-default login` for
`rhema-507501`; Pulumi CLI + `pulumi login`; billing + a stated budget.

```bash
cd infra/pulumi
npm install                       # @pulumi/pulumi + @pulumi/gcp + @pulumi/random + @pulumi/tls

pulumi stack select dev
pulumi preview                    # MUST be clean — no spend
pulumi up                         # [OPERATOR GATE] — full stack: VPC/AlloyDB/Redis/GKE/proxy/
                                  # seven services + convert & migrate Jobs + generated secrets
printf %s "$ANTHROPIC_API_KEY_DEV" | gcloud secrets versions add rhema-dev-anthropic-api-key --data-file=-

# run-task k8s state + the SEC.3 AppArmor profile (post-up apply, same as prod):
gcloud container clusters get-credentials rhema-dev-run-task-gke --region us-central1 --project rhema-507501
PROJECT=rhema-507501 STACK=dev ./infra/k8s/apply.sh

# migrations + role LOGINs + the dev seed, in-VPC:
gcloud run jobs execute rhema-dev-migrate --region us-central1 --wait
gcloud run jobs executions list --job rhema-dev-migrate --region us-central1 --limit=1
```

**Cost posture.** Dev is a *warm* stage (AlloyDB primary, min-1 worker) — it is not the paused
preview shape. After the verification window, return dev to idle: its standing projection is
checked against the ticket's `$15/month` threshold — over it, `pulumi destroy` (operator-run,
dev is not a guard stack) or a documented scale-down; under it, dev may stand. Preview stacks
are the disposable shape — paused AlloyDB, scale-to-zero services — and are destroyed + `stack
rm`'d at the end of every exercise; **zero orphans** is an acceptance criterion, checked by
enumerating `rhema-pr-<n>-*` resources after destroy.

## Production

The prod stack (`Pulumi.prod.yaml`) runs the real domains, warm Cloud SQL, BASIC Redis, open
signup, and the full image/secret set — **all operator-seeded**; the non-prod generated-secret +
migrate-Job paths do not run on prod. The complete operator runbook is **`infra/PROD-BRINGUP.md`**.
Every step there is operator-gated (HUMAN-H6 + a stated budget).

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
