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
- [ ] A stated prod budget (AlloyDB stays warm; GKE + MIG + Cloud Run + Redis STANDARD_HA).
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
# The AlloyDB bootstrap password — bind it FIRST; the cluster's `postgres` user is created with it.
pulumi config set --secret rhema:alloydbPassword '<generated-strong-password>'
# Database URLs (restricted RLS roles where marked) — built AFTER the cluster exists (its private IP
# comes from `pulumi stack output`); set them before `up` if you already know the address plan, else
# `up`, then set them, then `up` again so services pick them up. Recommended: set after step 3's first up.
pulumi config set --secret rhema:apiDatabaseUrl          'postgresql://…@<alloydb-private-ip>:5432/rhema'
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
pulumi preview    # review the plan — AlloyDB STANDARD/warm, prod domains cert, prod-locked deletions
pulumi up         # THE spend step
```

Expected surface: VPC + 3 subnets (sandbox has NO default route/NAT), AlloyDB 4-vCPU primary warm +
35-day PITR, Memorystore STANDARD_HA, GKE Standard + run-task pool, the egress-proxy MIG (×2), six
Cloud Run services + the convert Cloud Run **Job**, the Secret Manager containers (all
`rhema-prod-*`), the AR repo `rhema-prod`, the external HTTPS LB + managed cert (PENDING until DNS is
live) + the reserved global IP.

## 4. Apply the run-task k8s state (post-`up`, stack-parameterized)

```bash
gcloud container clusters get-credentials rhema-prod-run-task-gke \
  --region us-central1 --project rhema-507501
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

The 12 ids (from `requiredSecrets` / stage facts): `anthropic-api-key`, `run-token-signing-key`,
`alloydb-password`, `better-auth-secret`, `google-oauth-client-secret`, `stripe-secret`,
`stripe-webhook-secret`, `email-action-secret`, `resend-api-key`, `anthropic-admin-key`,
`ops-alert-webhook-url`, `user-content-signing-key`.

Then arm the private user-content origin: the SAME `user-content-signing-key` value is installed on
the backend bucket so the CDN edge verifies the signatures the api will mint (D-PRB.02-1's signer is a
later leg — the key plumbing exists now):

```bash
gcloud compute backend-buckets add-signed-url-key \
  --backend-bucket rhema-prod-usercontent-backend \
  --key-name rhema-tools-key --key-value "<the same base64url key stored in rhema-prod-user-content-signing-key>"
```

## 7. Migrations + protocol seed on prod AlloyDB

Reach the private-IP cluster from an in-VPC path (the AlloyDB Auth Proxy on an operator VM, or a
`gcloud compute ssh` tunnel through a private-app-tier host — the operator's call; there is no public
endpoint). Then, with `DATABASE_URL` pointed at the privileged `postgres` role:

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
