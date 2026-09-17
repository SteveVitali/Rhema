# PRB.15 — Production bring-up runbook (Stage B, operator-gated)

> **Stage A (this PR) authored everything offline.** Nothing below has run. Every step spends money or
> touches production — the [OPERATOR GATE] is `HUMAN-H6` complete + a stated budget. Do not proceed
> past a step whose output does not match the expected result.

## 0. Human prerequisites (HUMAN-H6 — `docs/tickets/28c_HUMAN-H6__prod-launch-accounts.md`)

All of these must already hold; the runbook does not create accounts:

- [ ] GCP footing: project `rhema-507501` (or a dedicated prod project) with billing enabled; region
      `us-central1`; ADC + `gcloud auth login` and a reachable Pulumi backend (`pulumi login`).
- [ ] DNS control of the **`rhema.tools`** zone (one zone — the app is the apex, the api is
      `api.rhema.tools`, the cookieless user-content origin is `usercontent.rhema.tools` +
      `*.usercontent.rhema.tools`; **amended 2026-09-17** — the earlier `rhema.app` +
      `rhemausercontent.com` pair is superseded, the operator does not control those domains).
- [ ] A stated prod budget — **amended 2026-09-17 to ~$50/mo**: prod runs **Cloud SQL**
      `db-g1-small` (Postgres 16, warm, zonal — AlloyDB's ~$270/mo minimum was unaffordable; dev
      stays on AlloyDB), a **zonal** Standard GKE cluster with **one on-demand e2-medium** node
      (Spot is the documented lever, never the default — run pods must not be preempted), the
      **smallest Memorystore BASIC** Redis (not re-architected into the cluster — it is
      fan-out/presence, not the system of record), and a **single-instance** egress-proxy MIG.
      Honest floor estimate: Cloud SQL db-g1-small ≈ $25/mo + e2-medium ≈ $24/mo + Basic-1GB Redis
      ≈ $33/mo + MIG e2-small ≈ $13/mo — **~$95/mo for always-on data+compute before Cloud Run /
      LB / GCS / egress traffic**, so ~$50/mo is achievable only if (a) the GKE free-tier waiver
      zeroes the cluster-management fee on this billing account and (b) a further lever is pulled
      (e.g. scheduling off the proxy MIG or Redis when idle). The $50 figure is the operator's
      TARGET; the stage facts implement the cheapest prod-ready shape — every bigger lever (HA
      Cloud SQL, regional GKE, STANDARD_HA Redis, MIG ×2) is documented in `stages.ts`/`data.ts`/
      `compute.ts` comments.
- [ ] Google OAuth consent screen published for `rhema.tools`; Resend sending domain verified for
      `@rhema.tools`.
- [ ] The Stripe live-mode answer recorded (gates the real-money leg — PRB.17, not this deploy).

## 1. Select/init the prod stack

```bash
cd infra/pulumi
npm install                        # @pulumi/pulumi + @pulumi/gcp@8.41.1
pulumi stack init prod             # once; Pulumi.prod.yaml is committed with the non-secret config
pulumi stack select prod
pulumi stack output                # sanity: empty until first up
```

## 2. Set the prod config (secrets via `pulumi config set --secret` — never committed)

```bash
# The Postgres bootstrap password — bind it FIRST; the Cloud SQL `postgres` built-in user is created
# with it (the key name is `alloydbPassword` for stack continuity — it is engine-agnostic).
pulumi config set --secret rhema:alloydbPassword '<generated-strong-password>'
# Database URLs (restricted RLS roles where marked) — built AFTER the instance exists (its private IP
# comes from `pulumi stack output databaseHost`); set them before `up` if you already know the
# address plan, else `up`, then set them, then `up` again so services pick them up. Recommended:
# set after step 3's first up. Host = the Cloud SQL private IP — e.g. postgresql://<user>:<pw>@<ip>:5432/rhema
pulumi config set --secret rhema:appDatabaseUrl          'postgresql://…@<cloudsql-private-ip>:5432/rhema'
pulumi config set --secret rhema:apiSystemDatabaseUrl    'postgresql://…(elevated role)…/rhema'
pulumi config set --secret rhema:workerDatabaseUrl       'postgresql://…(restricted)…/rhema'
pulumi config set --secret rhema:workerSystemDatabaseUrl 'postgresql://…(elevated)…/rhema'
pulumi config set --secret rhema:proxyDatabaseUrl        'postgresql://…(restricted)…/rhema'
pulumi config set --secret rhema:redisUrl                'redis://<redis-host>:6379'   # stack output redisHost
pulumi config set          rhema:emailFrom               'hello@rhema.tools'           # Resend-verified sender
# Image refs (digests from step 2b) — real images only, never the placeholder:
pulumi config set          rhema:proxyImage          '<repo>/egress-proxy@sha256:…'
pulumi config set          rhema:runTaskImageDigest  '<repo>/run-task@sha256:…'
pulumi config set          rhema:serviceImages \
  '{"api":"<repo>/api@sha256:…","web":"<repo>/web@sha256:…","worker":"<repo>/worker@sha256:…",
    "fetcher":"<repo>/fetcher@sha256:…","convert":"<repo>/convert@sha256:…",
    "export":"<repo>/export@sha256:…","collab":"<repo>/collab@sha256:…"}'
# internalApiUrl defaults to https://api.rhema.tools on prod; proxyBaseUrl is set after the MIG stands up:
pulumi config set          rhema:proxyBaseUrl        'https://<proxy-internal-address>:8443'
```

## 2b. Build + push the production image set (before `up` so services boot real images)

```bash
gcloud builds submit --config cloudbuild.yaml --project rhema-507501 \
  --substitutions _AR=us-central1-docker.pkg.dev/rhema-507501/rhema-prod,_TAG=prod
# then capture each pushed digest:
gcloud artifacts docker images list us-central1-docker.pkg.dev/rhema-507501/rhema-prod \
  --include-tags --format='table(package,tag,digest)'
```

The Artifact Registry repo `rhema-prod` is created by the program itself — so run `pulumi up` once for
the substrate (services will be unhealthy on placeholder images; expected), push images, pin
`rhema:serviceImages`/`runTaskImageDigest`/`proxyImage`, then `pulumi up` again to roll the real
revisions. (Or pre-create the repo: `gcloud artifacts repositories create rhema-prod
--repository-format=docker --location=us-central1`.)

## 3. [OPERATOR GATE] `pulumi up`

```bash
pulumi preview    # review the plan — Cloud SQL db-g1-small warm + 35d backups/7d PITR, prod domains
                # cert, prod-locked deletions (Cloud SQL + GKE + buckets)
pulumi up         # THE spend step
```

Expected surface: VPC + 3 subnets (sandbox has NO default route/NAT), **Cloud SQL Postgres 16
`db-g1-small` warm + private-IP + 35-day automated backups / 7-day PITR** (prod's engine — amended
2026-09-17; AlloyDB exists only on dev/preview), Memorystore **BASIC** 1 GB, a **zonal** GKE
Standard cluster + run-task pool (**1 × e2-medium**), the egress-proxy MIG (**×1**), six
Cloud Run services + the convert Cloud Run **Job**, the Secret Manager containers (all
`rhema-prod-*`), the AR repo `rhema-prod`, the external HTTPS LB + managed cert (PENDING until DNS is
live) + the reserved global IP.

## 4. Apply the run-task k8s state (post-`up`, stack-parameterized)

```bash
# prod is a ZONAL cluster (us-central1-a) — get-credentials takes --zone, not --region:
gcloud container clusters get-credentials rhema-prod-run-task-gke \
  --zone us-central1-a --project rhema-507501
PROJECT=rhema-507501 STACK=prod ./infra/k8s/apply.sh
# ⇒ runs namespace + run-task-ksa (WI-bound to rhema-prod-run-task@…) + pod egress NetworkPolicy
```

## 5. Apply the DNS records (emitted, not hand-edited)

```bash
pulumi stack output dnsRecords   # [{name,type,value},…] — every A record → the reserved LB IPv4
# expected: rhema.tools.  api.rhema.tools.  usercontent.rhema.tools.  *.usercontent.rhema.tools.  → <lbIpAddress>
```

Apply all four in the `rhema.tools` zone. **The managed cert cannot authorize until these resolve** —
poll `gcloud compute ssl-certificates describe rhema-prod-cert --global` until `status: ACTIVE` (can
take minutes–an hour after DNS propagates). If the `*.usercontent.rhema.tools` SAN refuses managed-cert
provisioning (wildcard managed certs have constraints), the fallback is dropping the wildcard SAN +
host rule and serving objects from the bare `usercontent.rhema.tools` host — the app does not depend
on per-workspace subdomains yet.

## 6. Seed the Secret Manager versions (out-of-band; values never in repo/state/ledger)

```bash
for s in $(pulumi stack output requiredSecrets --show-secrets=false | jq -r '.[]'); do
  echo "rhema-prod-$s"; done     # the operator's checklist — every name must gain a version
# per secret:  printf %s "$VALUE" | gcloud secrets versions add rhema-prod-<id> --data-file=-
```

The 11 REQUIRED ids (from `requiredSecrets` / stage facts — **amended 2026-09-17**:
`ops-alert-webhook-url` is provisioned but NOT required — the operator has no alert destination yet
and the drift-alert path stays inert; opting back in = seed a version + re-add the id to
`PROD_REQUIRED_SECRETS`): `anthropic-api-key`, `run-token-signing-key`,
`alloydb-password`, `better-auth-secret`, `google-oauth-client-secret`, `stripe-secret`,
`stripe-webhook-secret`, `email-action-secret`, `resend-api-key`, `anthropic-admin-key`,
`user-content-signing-key`.

Then arm the private user-content origin: the SAME `user-content-signing-key` value is installed on
the backend bucket so the CDN edge verifies the signatures the api will mint (D-PRB.02-1's signer is a
later leg — the key plumbing exists now):

```bash
gcloud compute backend-buckets add-signed-url-key \
  --backend-bucket rhema-prod-usercontent-backend \
  --key-name rhema-tools-key --key-value "<the same base64url key stored in rhema-prod-user-content-signing-key>"
```

## 7. Migrations + protocol seed on prod Cloud SQL

Reach the private-IP instance from an in-VPC path — **the Cloud SQL Auth Proxy on the operator's
machine is the one-liner** (private-IP instances need an authorized-network route; the proxy
dials out through the VPC):

```bash
# one-liner: cloud-sql-proxy <PROJECT>:<REGION>:<INSTANCE> — instance name from
# `pulumi stack output cloudSqlInstance`; requires the proxy binary (brew install cloud-sql-proxy
# or gcloud components install cloud-sql-proxy) + a source of VPC reachability (the proxy's
# --private-ip flag needs you on a network that can route to the VPC — e.g. run it from a
# private-app-tier VM, or over a VPN/Interconnect). For a private-IP-only instance, run the proxy
# from an in-VPC host:
cloud-sql-proxy --private-ip rhema-507501:us-central1:rhema-prod-postgres
# ⇒ listens on 127.0.0.1:5432 by default (-p 5433 to pick a port)
```

(A `gcloud compute ssh` tunnel through a private-app-tier host to port 5432 works the same — the
operator's call; there is no public endpoint.) Then, with `DATABASE_URL` pointed at the privileged
`postgres` role through the proxy:

```bash
pnpm build
DATABASE_URL='postgresql://postgres:<pw>@127.0.0.1:5433/rhema' \
  node scripts/live/prod-migrate-seed.mjs
# ⇒ [migrate] applied 00NN_*.sql … ; N migrations recorded
# ⇒ [seed] protocol essay v<n>   (seedProtocols — the ONLY prod seed; seedRealProjects is dev data and
#                                this runner refuses to touch it)
```

Verify: the log's migration count matches `packages/db/migrations/` and `protocol essay v*` is listed.

## 8. Record the deploy provenance row (REQ-ARCH-39; D-P0.04-2's live half)

```bash
DATABASE_URL='postgresql://…prod…' STAGE=prod GIT_SHA="$(git rev-parse HEAD)" \
IMAGE_DIGESTS='{"api":"sha256:…","web":"sha256:…","worker":"sha256:…","fetcher":"sha256:…",
  "convert":"sha256:…","export":"sha256:…","collab":"sha256:…",
  "egress-proxy":"sha256:…","run-task":"sha256:…"}' \
  node scripts/live/record-deployment.mjs
```

`IMAGE_DIGESTS` is the same `{service: sha256:…}` map pinned in step 2 (strip the repo prefix to the
bare `sha256:…`). The runner computes `PROTOCOLS_VERSION` itself (`compute-protocols-version.mjs
--bare`) and **refuses** to write if it comes back empty or non-`0.4.0+` — prod provenance can never
stamp `stub-0.0.0`. Verify:

```bash
psql "$DATABASE_URL" -c "select id, protocols_version, image_digests from deployments where stage='prod'"
```

## 9. Record the provider verification (D-P0.13-2 — the human's written act)

The operator has attested the Anthropic no-training/retention terms in writing (the Commercial Terms
reference captured in `16_P0.15d` § Operator authorizations). Insert **that row verbatim** — never
invent or alter the `termsRef` (PRB.15 item 10):

```bash
DATABASE_URL='postgresql://…prod…' PROVIDER=anthropic \
TERMS_REF='https://www.anthropic.com/legal/commercial-terms' \
VERIFIED_AT='2026-09-03T00:00:00Z' \
  node scripts/live/record-provider-verification.mjs
# ⇒ providerTransmissible("anthropic", now) === true   (asserted in-process; a failure exits non-zero)
```

The `termsRef` + `verifiedAt` above are the ticket-authorized values verbatim — if the operator's
recorded attestation differs, use THEIR values and correct the ticket by amendment.

## 10. Smoke the stack (PRB.16's golden path picks up from here)

```bash
curl -fsS https://api.rhema.tools/healthz
curl -fsS https://rhema.tools/ | head
# cookie isolation (single-zone amendment): any auth Set-Cookie must be `__Host-`-named with Secure +
# Path=/ + HttpOnly and NO Domain= attribute — a Domain=rhema.tools cookie would ride to usercontent.*.
# e.g. kick an OAuth start and inspect:  curl -si -XPOST https://api.rhema.tools/api/auth/sign-in/social \
#   -H 'content-type: application/json' -d '{"provider":"google","callbackURL":"https://api.rhema.tools/"}' \
#   | grep -i '^set-cookie'   # ⇒ __Host-rhema.* …; Secure; HttpOnly; SameSite=Lax  (no Domain=)
# the user-content origin must never set a cookie of its own:
curl -fsSI https://usercontent.rhema.tools/<a-seeded-object> | grep -i 'set-cookie' && echo FAIL
# sandbox egress (from a runs-namespace pod): only the proxy answers; api.anthropic.com is blackholed.
kubectl -n runs run egress-check --rm -i --image=curlimages/curl -- \
  sh -c 'curl -m5 -sS https://api.anthropic.com || echo BLOCKED; curl -m5 -sSk https://<proxy>:8443/healthz'
```

## What Stage B then records

- `deployments` row + `providerTransmissible` assertion → annotate `D-P0.04-2` / `D-P0.13-2` in
  `docs/tickets/DEFERRALS.md` and flip the rows the live evidence genuinely proves
  (`D-P0.01-1`, `D-P0.01-7`, `D-P0.15b-1`, `D-P0.15c-1`, `D-P0.07-4`'s serve leg).
- Live leftovers (auth binding, user-content signed-URL serving, Stripe live mode, provider-smoke)
  stay OPEN and route to PRB.16/PRB.17 per their named paths.
