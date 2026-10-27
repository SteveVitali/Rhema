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
# Database URLs — the elevated/system strings stay Pulumi secret config (operator-built from the
# bootstrap password + the private IP from `pulumi stack output databaseHost`; set after step 3's
# first up). SEC.1 amended the USER-serving string: api + worker `DATABASE_URL` is now the
# `rhema_app_login` DSN in Secret Manager (`rhema-prod-app-database-url`, version materialized by
# the program from a @pulumi/random password — NEVER set `rhema:appDatabaseUrl`/`rhema:workerDatabaseUrl`
# for prod; on stages that provision `app-database-url` those config keys are ignored in favour of
# the secretKeyRef mount).
pulumi config set --secret rhema:apiSystemDatabaseUrl    'postgresql://…(elevated role)…/rhema'
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
pulumi config set          rhema:proxyBaseUrl        'http://<proxy-internal-address>:8443'  # the proxy serves PLAIN HTTP (surfaced live 2026-09-17 — https:// gets "wrong version number"); the address is the RESERVED rhema-prod-proxy-ip — read it via `gcloud compute addresses describe rhema-prod-proxy-ip-* --region us-central1` (the MIG re-assigns ephemeral IPs on every template roll without it)
# OPS.2 — collab: the `rhema_collab` role's DSN was set by hand at STB.1 (2026-09-25) and is
# ADOPTED AS-IS — never re-set, rotated, or role-altered (the SEC.1 switch moved the collab env to
# the Secret Manager `rhema-prod-collab-database-url` version, so on prod this config key is now a
# dead fallback kept for roll compatibility; non-prod stacks get an IaC-generated DSN instead):
#   rhema:collabDatabaseUrl   — postgresql://rhema_collab:<pw>@<host>:5432/rhema  (Pulumi secret)
# The matching one-time role enable was the operator's `alter role rhema_collab login password
# '<pw>'` (executed STB.1; assert `rolcanlogin=t, rolbypassrls=f` — see §11's collab step):
#   rhema:internalApiUrl      — api's internal URL (worker API_INTERNAL_URL + web reach)
#   rhema:googleOauthClientId — the OAuth WEB CLIENT ID (plain config; the SECRET is the SM
#                               google-oauth-client-secret container — see §6)
#   rhema:stripePaymentLinkUrl— the Stripe Payment Link URL the exhaustion panel 302s to (PRB.17)
```

**Operator-local env — never a `rhema:*` config key:** `rhema-journeys --paid` dispatches
(and `scripts/live/funded-window.mjs`) read `JOURNEY_DATABASE_URL` from the operator's shell.
It MUST be the **system-role** DSN — an elevated `rolsuper OR rolbypassrls` string in the
`apiSystemDatabaseUrl`/`workerSystemDatabaseUrl` class, reached over the IAP tunnel — never
the app-login `app-database-url`: `usage_records` is FORCE-RLS, so an app-role bind reads $0
and would greenlight an unmeasured week. Both spend guards probe `pg_roles` before the meter
query ever runs, so a blind pool is a refusal, not a measurement (ADR-093). The scheduled
cron is the one exception — it cannot reach the private DB and self-bounds to one paid
leg/week. The full convention lives in `packages/journeys/README.md` § "Spend guards".

### Config keys the program reads but the operator normally does NOT set

Completeness reference (the `infra/config/runbook-completeness.test.ts` gate requires every
`rhema:*` key read in `infra/pulumi/*.ts` to be named here — a hand-set key that never enters this
runbook is exactly how `collabDatabaseUrl` drifted):

- `rhema:placeholderImage` — the stand-in container image each service runs until a digest pin
  lands (`us-docker.pkg.dev/cloudrun/container/hello` on prod); missing `serviceImages` entries
  fall back to it so `preview` stays plannable.
- `rhema:deployProxyMig` — `"true"` (prod default): the egress-proxy MIG is program-managed; set
  `"false"` only to run the proxy out-of-band.
- `rhema:apiDatabaseUrl` / `rhema:apiRedisUrl` / `rhema:workerRedisUrl` — legacy/fallback names:
  `apiDatabaseUrl` reads only when `appDatabaseUrl` is absent (superseded 2026-09-17); the Redis
  keys are per-service overrides of the shared `rhema:redisUrl`.
- `rhema:opsAlertWebhookUrl` — Pulumi secret config for the ops-alert sink; the worker mounts the
  SM `ops-alert-webhook-url` version instead (webhook catcher, PRB.17 gate answer). Setting the
  config is optional; the SM version is what serves.
  **Amended 2026-10-23 (R6OPS.2 / F-R6OPS.1-1):** the config is BOUND on prod — same value as the
  SM `latest` version (moved via the gcloud→pulumi stdin pipe, ciphertext in `Pulumi.prod.yaml`
  only). It is what materializes the Monitoring `webhook_tokenauth` NotificationChannel the 14
  AlertPolicies page through (`monitoring.ts`); unset on a stage ⇒ policies still record
  incidents unnotified. Keep it equal to the SM version — if the sink URL ever rotates, rotate
  both.
- `rhema:ciRepository` — JOURNEY.1's GitHub `owner/repo` for the WIF token-creator condition
  (default `SteveVitali/Rhema`).
- `rhema:gitSha` / `rhema:protocolsVersion` — OPS.1 deploy-provenance inputs for the NON-PROD
  migrate Job's `deployments` row (chain-tip SHA + computed protocols version; unset ⇒ the record
  leg skips). Prod records via `scripts/live/record-deployment.mjs` (§8).
- `rhema:runTaskAppArmorType` / `rhema:runTaskAppArmorLocalhostProfile` — SEC.3's pod AppArmor
  deploy config (`Localhost` / `rhema-run-task` on prod; a rollback flips these keys, never code).
- `rhema:spaSurfaces` — **DELETED post-SPA.28 (2026-10-10; see §13):** the migration-window key no
  longer exists — `StageConfig.spaSurfaces`, `SPA_SURFACES`/`SPA_OVERRIDES` env emissions,
  `parseSpaSurfaces`, and every request-path renderer consult are removed from the program and the
  apps; setting this key on a post-cleanup stack is a no-op at best (the program no longer reads
  it). Historical, for pre-cleanup checkouts only: it was SPA.2's per-flip PREVIEW override
  (REQ-SEQ-3), a `SPA_SURFACES` CSV set via `preview-stack.mjs config pr-<n> rhema:spaSurfaces
  "<prior set>,<key>"`; prod/dev flips were committed stage-fact edits (REQ-SEQ-10 — a prod flip
  was its own operator-merged PR).
- `rhema:uploadCorsOrigins` — SPA.13's REQ-BFF-16 companion: a CSV of extra `https://` origins the
  `user-content` bucket's CORS block admits for the browser's presign→direct-PUT upload leg
  (PUT-only, the signed-URL headers only, never a wildcard). The stage's own app origin is admitted
  unconditionally (`domains.app`, or `https://<stack>.rhema.dev` without one), so the key exists for
  previews whose serving host differs from the deployed origin — set via
  `preview-stack.mjs config pr-<n> rhema:uploadCorsOrigins "https://host1,https://host2"`; unset is
  the normal case.
- `rhema:resendApiKey` — MAINT.6's NON-PROD-only secret config (Pulumi secret). On a preview/dev
  stack it carries the REAL Resend key — `preview-stack.mjs resend-pull` pipes the operator-seeded
  shared SM `rhema-nonprod-resend-api-key` into it — so that stack's `resend-api-key` SM version
  carries the real key instead of the placeholder and signed-in preview journeys can send mail.
  Setting it on prod is refused fail-closed by the program: prod's `resend-api-key` version stays
  operator-seeded out-of-band.
- `rhema:appBaseUrl` / `rhema:apiPublicUrl` — VERIF.2's NON-PROD public-origin config (plain,
  not secret): on stages without `domains` the api/web derive their public origins from these
  keys instead of `https://<stack>.rhema.dev` placeholders, which is what mounts the auth
  surface (`APP_BASE_URL` gates `authSecretsReady`) and stamps `API_PUBLIC_URL` /
  `INTERNAL_AUTH_AUDIENCE` correctly on `*.run.app` previews. Set via
  `preview-stack.mjs config pr-<n> rhema:appBaseUrl "https://<web>.run.app"` (+ `apiPublicUrl`
  likewise); prod ignores them — `domains` always wins there.
- `rhema:postureDomains` — R6POST.2's NON-PROD-only posture override (plain config, JSON
  `{"app":"…","api":"…","uc":"…"}`): merged over `stageConfigFor(stack)` so a preview runs the
  prod domains machinery verbatim — managed-cert SANs, host rules (`<app>` → web with
  `/collab*` → collab backend, `<api>` → api, `<uc>` → user-content bucket),
  `COLLAB_WS_URL=wss://<app>/collab`, and every derived origin (`APP_BASE_URL` /
  `API_PUBLIC_URL` / `INTERNAL_AUTH_AUDIENCE` / bucket CORS). Setting it on prod is refused
  fail-closed — prod's domains stay a stage fact.
- `rhema:postureLbAddress` — the posture stage's NON-PROD companion (plain config): the name of
  a pre-created global `gcloud compute addresses` IP the program adopts via
  `GlobalAddress.get`, so the LB IP is known BEFORE the hostnames are minted (a wildcard-DNS
  name like `*.sslip.io` embeds the IP — one `up`, no forwarding-rule replacement). Prod
  refuses it.
- `rhema:extraRequiredSecrets` — NON-PROD-only CSV of additional `ALL_SECRET_IDS` entries the
  stack should require (validated fail-closed against the known id set): the Stripe posture
  stage's `stripe-secret` opt-in so `requires("stripe-secret")` wires `STRIPE_SECRET_KEY_NAME`
  on api + worker only on stacks that ask. Prod refuses it.
- `rhema:stripeSecret` — R6POST.2's NON-PROD-only secret config (Pulumi secret), the
  resend-pull shape: `preview-stack.mjs stripe-pull` pipes the operator-seeded shared SM
  `rhema-nonprod-stripe-secret` (a test-mode `sk_test` — never a prod key, REQ-ARCH-38) into it
  so the stack's `stripe-secret` SM version carries the real test key instead of the OPS.1
  placeholder and the Stripe-hosted hand-off legs can run on previews. Setting it on prod is
  refused fail-closed by the program: prod's `stripe-secret` version stays operator-seeded
  out-of-band.

## 2b. Build + push the production image set (before `up` so services boot real images)

```bash
# _GIT_SHA (JOURNEY.1) bakes the commit into api/web images → /healthz build.gitSha (provenance).
# OPS.2 — the ONE committed image-set definition (BL-27): `_SERVICES` takes any comma-separated
# subset for a diff-scoped rebuild (unknown names fail the build); the default is the full set.
# Never hand-edit a copy — that copy-then-edit pattern is exactly the Stage B drift OPS.2 retired.
gcloud builds submit --config infra/cloudbuild/image-set.yaml --project rhema-507501 \
  --substitutions _AR=us-central1-docker.pkg.dev/rhema-507501/rhema-prod,_TAG=prod,_GIT_SHA=$(git rev-parse HEAD)
# subset rebuild: append `,_SERVICES=api,web`
# then capture each pushed digest:
gcloud artifacts docker images list us-central1-docker.pkg.dev/rhema-507501/rhema-prod \
  --include-tags --format='table(package,tag,digest)'
```

**run-task vendored-SDK gate (F-R6H11-2 — never ship a no-engine image).** When `run-task`
is in `_SERVICES`, the build asserts the vendored agent SDK exists in the uploaded context
BEFORE building (`apps/run-task/vendor/claude-agent-sdk/sdk.mjs` + `…-linux-x64/claude`),
and asserts the paths inside the BUILT image (agent-uid exec via the shipped `setpriv`)
before push. Both fail the build — the `e04a8c8` deploy shipped a no-SDK image because the
submit ran from a clean worktree (the SDK is gitignored operator-held state; worktrees and
fresh clones do NOT carry it) and the old contract only warned. **Remediation:** run the
submit from the checkout where the SDK was populated per `apps/run-task/vendor/README.md`,
or copy the vendor trees into the build checkout first. `_ALLOW_PLACEHOLDER_SDK=1` is the
explicit opt-out for builds that never launch runs (CI provenance, preview posture stages).

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
# expected: rhema.tools.  api.rhema.tools.  usercontent.rhema.tools.  → <lbIpAddress>
```

Apply all three in the `rhema.tools` zone. **The managed cert cannot authorize until these resolve** —
poll `gcloud compute ssl-certificates describe rhema-prod-cert --global` until `status: ACTIVE` (can
take minutes–an hour after DNS propagates).

> **Amended 2026-09-17 (Stage B live): the wildcard fallback was TAKEN.** `gcp.compute.ManagedSslCertificate`
> rejects `*.usercontent.rhema.tools` at create (`400 "Wildcard domains not supported"` — wildcard SANs
> need Certificate Manager + DNS authorization, which the runbook flagged as the constraint). The wildcard
> SAN, URL-map host rule, and DNS record were dropped; user content serves from the bare
> `usercontent.rhema.tools` host — the app does not depend on per-workspace subdomains yet.

## 6. Seed the Secret Manager versions (out-of-band; values never in repo/state/ledger)

```bash
for s in $(pulumi stack output requiredSecrets --show-secrets=false | jq -r '.[]'); do
  echo "rhema-prod-$s"; done     # the operator's checklist — every name must gain a version
# per secret:  printf %s "$VALUE" | gcloud secrets versions add rhema-prod-<id> --data-file=-
```

The REQUIRED ids (from `requiredSecrets` / stage facts — **amended 2026-09-17**:
`ops-alert-webhook-url` is provisioned but NOT required — the operator has no alert destination yet
and the drift-alert path stays inert; opting back in = seed a version + re-add the id to
`PROD_REQUIRED_SECRETS`): `anthropic-api-key`, `run-token-signing-key`,
`alloydb-password`, `better-auth-secret`, `google-oauth-client-secret`, `stripe-secret`,
`stripe-webhook-secret`, `email-action-secret`, `resend-api-key`, `anthropic-admin-key`,
`user-content-signing-key`. **SEC.1 additions:** `app-database-url` is PULUMI-MANAGED — the program
itself writes the `rhema_app_login` DSN version (skip it in the seeding loop); `collab-database-url`
IS operator-seeded — `postgresql://rhema_collab:<pw>@<host>:5432/rhema` (the `rhema_collab`
bootstrap password), required before the deploy that flips collab's env to secretKeyRef.

Then arm the private user-content origin: the SAME `user-content-signing-key` value is installed on
the backend bucket so the CDN edge verifies the signatures the api will mint (D-PRB.02-1's signer is a
later leg — the key plumbing exists now):

> **⚑ RETIRED 2026-10-21 (ADR-113 / R6UCD.1):** this step is superseded — the edge-signed CDN
> contract was verified nonfunctional (LB→bucket origin read denied; `D-R5OPS.1-2`) and its
> repair was ruled out. The api mints GCS V4 signed GETs on `storage.googleapis.com` via IAM
> signBlob instead — no key to install. If `rhema-tools-key` was already installed it may stay
> (inert) until a separate CDN-removal decision; `user-content-signing-key` stays seeded and
> listed only because nothing has removed it — no code reads it.

```bash
# RETIRED (ADR-113) — do NOT run: the edge-signed usercontent contract is superseded.
# gcloud compute backend-buckets add-signed-url-key \
#   --backend-bucket rhema-prod-usercontent-backend \
#   --key-name rhema-tools-key --key-value "<the same base64url key stored in rhema-prod-user-content-signing-key>"
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
# HOT.1 — the additive-migration gate (ADR-013's standing authorization; ADR-018 §8 defines "role
# change"): `prod-migrate-seed` below lint-checks every migration NEWER than the live `_migrations`
# max and refuses to apply a non-additive one. To dry-check the chain's migrations yourself:
#   node scripts/check-additive-migrations.mjs --since-git <deployed-base-ref>
# The `contracts` CI job runs the same lint per-PR against the base ref.
DATABASE_URL='postgresql://postgres:<pw>@127.0.0.1:5433/rhema' \
  node scripts/live/prod-migrate-seed.mjs
# ⇒ [lint] additive-migration gate: checking migrations newer than <prod max>  (HOT.1 — fails fast
#         on a non-additive migration BEFORE anything applies)
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
  sh -c 'curl -m5 -sS https://api.anthropic.com || echo BLOCKED; curl -m5 -sS http://<proxy>:8443/v1/messages -X POST -d "{}"'  # the proxy is plain HTTP with NO /healthz (surfaced live 2026-09-17) — an uncredentialed request must come back `{"error":{"type":"egress.denied","message":"missing proxy credential"}}` 403; anything else is a wiring bug
```

## 11. SEC.1 — the user-serving role switch (Stage B, OPERATOR GATE)

Once the SEC.1 deploy is up (`0045` applied — `rhema_app_login` exists `NOLOGIN`; the
`rhema-prod-app-database-url` secret carries its generated DSN), the authorized window is:

```bash
# 1. Seed collab's DSN secret (REQ-ARCH-30 — collab's env flips to secretKeyRef this deploy):
printf %s 'postgresql://rhema_collab:<collab-pw>@<cloudsql-private-ip>:5432/rhema' \
  | gcloud secrets versions add rhema-prod-collab-database-url --data-file=-

# 2. Enable the user-serving role WITH THE GENERATED PASSWORD (read it from SM — the same value the
#    program wrote into the DSN; never re-derive by hand):
DSN=$(gcloud secrets versions access latest --secret=rhema-prod-app-database-url)
PW=$(printf %s "$DSN" | sed -E 's|.*://rhema_app_login:([^@]+)@.*|\1|')
psql 'postgresql://postgres:<bootstrap-pw>@127.0.0.1:5433/rhema' \
  -c "alter role rhema_app_login login password '${PW}'"

# 3. PRE-switch probe (two real magic-link tenants — see step 0's probe-account prerequisites):
PROBE_SESSION_A='…' PROBE_SESSION_B='…' \
  pnpm tsx integration/src/two-tenant-probe.ts \
  --base-url https://api.rhema.tools --web-url https://rhema.tools

# 4. Roll the switch: `pulumi up` — api/worker `DATABASE_URL` envs land on the
#    `app-database-url` secretKeyRef (new revisions). If a revision still carries the OLD DSN config
#    key from a previous stack, unset it first: `pulumi config rm rhema:appDatabaseUrl` /
#    `rhema:workerDatabaseUrl` (ignored anyway on required-secrets stages — belt & suspenders).

# 5. POST-switch probe — identical command; zero cross-tenant markers + own rows visible.

# 6. Observe 30 minutes (api/worker 5xx rate, Cloud Run logs for `permission denied` — a denied
#    grant means a table the user role legitimately needs was missed in 0045; that is a FIX bug,
#    not a rollback trigger by itself).
```

**Rollback (retained pre-switch revision):** `gcloud run services list-revisions
--service rhema-prod-api` → shift traffic back to the pre-switch revision
(`gcloud run services update-traffic rhema-prod-api --to-revisions <rev>=100`), same for
`rhema-prod-worker`, then `alter role rhema_app_login nologin` to seal the window. The `postgres`
system DSNs are untouched throughout — system paths never leave the elevated role.

## What Stage B then records

- `deployments` row + `providerTransmissible` assertion → annotate `D-P0.04-2` / `D-P0.13-2` in
  `docs/tickets/DEFERRALS.md` and flip the rows the live evidence genuinely proves
- SEC.1: the pre/post probe reports + switch timestamp → `docs/security/rls-exposure-since-0026.md`
  closes each exposure row's end date; the role-enable ALTER output is HUMAN-H7's review evidence
  (`D-P0.01-1`, `D-P0.01-7`, `D-P0.15b-1`, `D-P0.15c-1`, `D-P0.07-4`'s serve leg).
- Live leftovers (auth binding, user-content signed-URL serving, Stripe live mode, provider-smoke)
  stay OPEN and route to PRB.16/PRB.17 per their named paths.

## 12. OPS.2 — cost posture, the $50 budget alert + the Turbo remote cache

### 12a. Reading the bill

No public API returns billed actuals and there is no populated BigQuery export yet (the
`billing_export_prod` dataset is provisioned; the console-only export flip is D-OPS.2-1). Until
then, `scripts/live/billing-read.mjs` recomputes the monthly bill bottom-up — live `gcloud`
inventory × Cloud Billing Catalog API list prices, every matched SKU printed:

```bash
node scripts/live/billing-read.mjs          # markdown table + sources
node scripts/live/billing-read.mjs --json   # ledger/CI-consumable
```

The stack carries a `$50/mo` Billing Budget alert (`rhema-prod-budget-50`, thresholds
50 %/90 %-forecast/100 % → billing-admin emails). One provider quirk is now permanent knowledge:
`gcp.billing.Budget` (google-beta) refuses ADC without a quota project — run preview/up as
`GOOGLE_CLOUD_QUOTA_PROJECT=rhema-507501 pulumi …` (or `gcloud auth application-default
set-quota-project rhema-507501`; `cloudresourcemanager.googleapis.com` must be enabled in the
quota project — it is, 2026-10-03).

### 12b. The Turbo remote cache (ADR-081; D-P0.01-4 discharged)

`turboCacheUrl` (stack output) is the v8-artifacts endpoint. The Bearer token lives ONLY in
`rhema-prod-turbo-cache-token` — the program mints it, never the operator's env:

```bash
# wire CI (repo-admin) + local dev:
gh secret set TURBO_API   -R SteveVitali/Rhema --body "$(pulumi stack output turboCacheUrl)"
gh secret set TURBO_TOKEN -R SteveVitali/Rhema --body "$(gcloud secrets versions access latest \
  --secret=rhema-prod-turbo-cache-token --project=rhema-507501)"
# never print the token into a log, ledger, or PR body
```

The service scales to zero (min 0 / max 2, ~$0–2/mo); artifacts land in
`rhema-507501-turbo-cache-prod` (private, 30-day lifecycle, project-internal — no
protocol-bearing artifact leaves the project). Rotation = a fresh secret version + repo-secret
update; nothing else depends on the value.

### 12c. Cloud SQL HA pre-plan (plan-only — never executed inside OPS.2)

The measured bill (ADR-082) puts the always-on floor ≈ $285/mo, dominated by the Cloud Run warm
floor; the HA levers below are priced but NOT executed:

- **Cloud SQL ZONAL→REGIONAL** (`availabilityType`, ≈ +$25.55/mo): a settings flip on
  `rhema-prod-postgres` — preserves `backupConfiguration` (35 daily backups) + the 7-day PITR
  window (unchanged by the flip; re-verify `pointInTimeRecoveryEnabled` stays true after). Plan:
  maintenance window → flip → observe a failover rehearsal (`gcloud sql instances failover
  rhema-prod-postgres` drills the standby promote; ~2–4 min writer unavailability) → roll back by
  flipping ZONAL only if the drill surfaces a problem.
- **Memorystore BASIC→STANDARD_HA** (≈ +$35.77/mo): tier flip on the instance, brief reconnect.
- **Proxy MIG ×2** (≈ +$12.2/mo): `targetSize` 1→2 (regional MIG already spans zones).
- **Warm-floor levers** (the bigger dollars, still plan-only): `convert-svc` cpuIdle→request-based
  (−$44), `export`/`fetcher` minScale 1→0 (−$19.4), worker right-size (−$26).

## 13. Post-migration SPA operations (SPA.28 / SPACAP.2, 2026-10-10)

The round-4 frontend-SPA migration rewrote the renderer contract. This section is the current
operational truth for anything touching renderer, rollback, or activation order; the pre-cleanup
flag recipes elsewhere in this runbook are retained for pre-cleanup checkouts only.

### 13.0 Provenance first — prod is pre-chain

Current prod serves **pre-chain ancestors**: web `6ebb1cb76e14be8bfa6c6dc0731932c9011e6224`,
api `0acd16d0f6d5af473f28815b7358140d70e39146` (`/healthz` `build.gitSha`,
`merge-base --is-ancestor`-verified — 150/153 commits behind the round-4 tip). Prod has **zero**
round-4 SPA code: `GET https://rhema.tools/bff/app` → 404, and `data-renderer`/`data-mounted`/
`data-route`/`spa-root` are absent on `/`, `/login`, `/showcase`, `/pricing`. **Only
SHA-matched evidence counts as live verification**: before any post-deploy leg, run
`check-deploy-provenance --expect <tip> --healthz https://rhema.tools --healthz https://api.rhema.tools`
and require all-PASS; the harness itself refuses on a provenance NO-MATCH (exercised, exit 1).

### 13.1 Forced SSR is code, not configuration

There is no renderer flag left anywhere — no stack key, no env var, no header, no query param.
`?ssr=1`, `?renderer=spa`, `x-rhema-renderer`, `SPA_OVERRIDES`, `SPA_RENDERER_HEADER`, and
`rhema:spaSurfaces` are deleted machinery; a request carrying any of them gets the same answer as
one that doesn't (inert, not an error). The remaining renderer verdicts are the request path's
own, and they are permanent:

- **Public funnel** (`/`, `/login`, `/showcase`, `/pricing`, legal) — always SSR (REQ-BND-1's
  `SPA_PUBLIC_ROUTES`).
- **The Page family forced-SSR truth** — two server-owned conditions: a **phone user agent**, and
  `project.showcase: true` read from the BFF twin (ADR-108). Both serve the SSR document with
  `page.js`/`ide.js` islands (ADR-107's forever-SSR set), the showcase leg in read-only posture.
  In-SPA navigation to a showcase Page document-navigates to SSR via the client's `twinForcesSsr`
  mirror — the verdict cannot be flipped by any operator control; changing it is a code change.
- **Everything else authenticated** — the SPA shell (`data-renderer="spa"`), unconditionally.

### 13.2 Rollback — `git revert` + redeploy (the flag rollback is gone)

Config-flag rollback **does not exist** post-SPA.28. To roll back a migrated surface, a SPAF flip,
or any part of the cleanup wave:

1. `git revert` the offending commits (a surface's SPAF migration commit, or the specific
   cleanup-wave commits — revert the wave bottom-up if the target is inside it).
2. Rebuild + redeploy the affected services at the reverted SHA (§2b image-set flow, then the
   deploy leg of §13.3's cadence).
3. Re-run the surface's verification legs against the redeployed SHA — the `D-SPAF.*-1` marker
   curls and the `--expect-renderer` leg for that surface (§13.3); a renderer revert restores the
   prior renderer in one deploy.
4. Record the revert + re-verification in the run ledger; the DEFERRALS row the leg discharges
   gets a dated note.

The pre-cleanup escape hatches (`?ssr=1`, `x-rhema-renderer: ssr`, dropping a surface off
`rhema:spaSurfaces`) **no longer function** — they are inert signals, not fallback paths. Do not
plan any rollback that ends in a config edit; there is no renderer config to edit.

### 13.3 Activation — the 15-segment bottom-up cadence

The chain activates by the SPACAP.2 runbook
(`docs/build/reports/SPACAP.2_COMPOSED_VERIFICATION.md` §3), not by a single deploy:

1. Merge the PR chain **bottom-up** (`mergePolicy: OPERATOR` — the operator merges; a run never
   merges its own PR).
2. At each SPAF boundary (segments 1–14, one per migrated surface), deploy that boundary, then run
   the segment's legs: the `D-SPAF.*-1` marker curls + inert-escape checks, the `D-SPAF.*-2`
   `--expect-renderer spa` journey leg for that surface, and the `D-SPAF.*-3` rollback-arm verify.
3. **Require ≥1 nightly journey run green on prod after each deploy** (`D-SPAF.*-4`, REQ-SEQ-10)
   before the next segment merges+deploys — the nightly bake is the pacing control.
4. The cleanup wave (PRs #158–#163) activates only after the `editor` flip's bake —
   `D-SPA.26-1/-27-1/-28-1` entry gates: all 14 prod flips merged AND ≥1 nightly green since the
   last flip. Segment 15 is the wave + the tip.
5. After the tip deploys, the composed verification runs (BL-82): the full suite with
   `--expect-renderer spa`, the two-tenant BFF probe, the public-SSR regression diff vs the
   committed pre-chain baseline, the zero-CSP walk, the G2-fix live leg.
6. **Arm B (recorded fallback):** a tip-only deploy exists in the runbook as the emergency path —
   it jumps all-SSR→all-SPA in one deploy with flag rollback already gone. It is a fallback, not
   the plan; every deviation from the cadence is an operator call, recorded.

### 13.4 The owed operator secret — `rhema-nonprod-resend-api-key`

Every `pr-<n>` preview leg is blocked on one human act: seeding a real send-only Resend key as the
shared Secret Manager secret `rhema-nonprod-resend-api-key` in project `rhema-507501` (probed
`NOT_FOUND` on every pass through SPA.25 — the value has never existed and must never appear in
the repo, a ledger, a log line, or a PR). Once seeded, `preview-stack.mjs resend-pull pr-<n>`
pipes it into that stack's `rhema:resendApiKey` (§2, the NON-PROD-only key; prod refuses it
fail-closed). It gates: MAINT.6's live session-mint proof (D-MAINT.6-1), every surface ticket's
`D-SPA.*-1/-2` preview legs/drills, and D-OPS.1-1's signed-in preview suite. **Prod legs do not
need it** — prod sessions mint through the live `rhema.tools` mailbox. Never fabricate a preview
result: if the secret is absent, the leg reports owed, not green.
