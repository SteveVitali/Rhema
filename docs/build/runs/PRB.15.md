# PRB.15 — Prod bring-up: the `prod` stage profile, the Pulumi prod stack, the operator-gated deploy

- **Spec:** `docs/tickets/28f_PRB.15__prod-bringup.md`
- **Base:** `stevevitali/prb-14-run-resilience-cost-fidelity` @ `462ee96`
- **Branch:** `stevevitali/prb-15-prod-bringup`
- **Config:** implement-spec — **Stage A only** (offline, no spend). Stage B (`pulumi up prod`,
  prod migrations, smoke checks, the D-P0.13-2 write, the live-provenance stamp) is the
  operator-gated half and is **not attempted** — HUMAN-H6 + a stated budget gate it.
- **ADR:** none (no deviations — the convert Service→Job fix is the ticket's own §12.1 spec; the
  collab decision below is scope, not a spec change)

## Deferrals read

`docs/tickets/DEFERRALS.md` read at start. Rows this ticket touches — each got a dated Stage-A
annotation; **only the offline-verifiable row was flipped**:

- **D-P0.07-4** — **DONE (image leg).** `apps/egress-proxy/Dockerfile` is a real two-stage image
  running `node dist/main.js` → `createProxyServer` (verified at source: the DB resolver, SM key
  provider, streaming forwarder, usage/fetch-log/cap writers all wire in `main.ts`). The *live serve*
  leg (metering/capping a real run) stays under D-P0.15c-6's wire path.
- **D-P0.01-1** — annotated (prod stack authored; `pulumi up prod` remains the Stage-B act).
- **D-P0.01-7** — annotated (prod IaC authored + `tsc --noEmit` clean vs `@pulumi/gcp@8.41.1`; the
  live verify is Stage B).
- **D-P0.15b-1 / D-P0.15c-1** — annotated (the prod equivalent of both deploy-gate rows is authored
  end-to-end in `infra/PROD-BRINGUP.md`; the `up` remains operator-gated).
- **D-P0.04-2** — annotated (the live-stamp writer exists: `record-deployment.mjs` computes the real
  `PROTOCOLS_VERSION` and refuses stub/empty; the prod row write is Stage-B step 8).
- **D-P0.13-2** — annotated (the prod write is scripted — `record-provider-verification.mjs`; the
  ticket-authorized `termsRef` is in the runbook verbatim; the write itself is the human act).
- **D-PRB.13-1** — annotated (evaluated; the Redis binding deliberately NOT landed — `attempt` is a
  synchronous interface and the row's verify path is a live cross-instance assert → PRB.16).

## What landed — Stage A (offline)

### 1. The `prod` stage profile — `infra/config/stages.ts`

- `STAGES.prod.signupMode` → **`"open"`** (PRB.13's flag flips on prod only; dev/preview stay
  `invite` — the flag fails closed).
- **`StageConfig.domains`** (prod-only): `{ app: "rhema.app", api: "api.rhema.app",
  userContent: "rhemausercontent.com" }` — the Pulumi program builds the cert SANs + URL-map host
  rules from this block, so the tested facts ARE the deployed facts.
- **`StageConfig.requiredSecrets`** + **`ALL_SECRET_IDS`** (12 ids — the H6 checklist encoded):
  `anthropic-api-key`, `run-token-signing-key`, `alloydb-password`, `better-auth-secret`,
  `google-oauth-client-secret`, `stripe-secret`, `stripe-webhook-secret`, `email-action-secret`,
  `resend-api-key`, `anthropic-admin-key`, `ops-alert-webhook-url`, `user-content-signing-key`.
  Per-stage sets: prod = all 12; dev = all but `ops-alert-webhook-url`; preview = the two non-prod
  keys only.
- `stages.test.ts`: the all-invite loop replaced by **prod-open / others-invite**, plus new blocks
  asserting the real domains (separate registrable domain for user-content — the XSS blast-radius
  cut) and the full prod secret checklist.

### 2. The Pulumi prod stack — `Pulumi.prod.yaml` + program deltas

- **`Pulumi.prod.yaml`**: `gcp:project`/`region` + `deployProxyMig:true` committed; every secret/plain
  config the operator sets is enumerated in the file's header (values never committed).
- **`secrets.ts`**: provisions a container per `ALL_SECRET_IDS` id (`rhema-<stack>-<id>`) — the
  provisioned set can't drift from the tested checklist.
- **`iam.ts`**: the full least-privilege grant set — api reads run-token/better-auth/oauth/
  stripe-webhook/email-action/user-content-signing; worker reads run-token/stripe/email-action/
  resend/anthropic-admin/ops-webhook; proxy stays the sole `anthropic-api-key` reader; the fetcher
  gets `objectCreator` **conditioned to `user-content`'s `quarantine/` prefix** (§12.1's "service
  account limited to the quarantine prefix"); convert gets read-only on the bucket.
- **`data.ts`**: the AlloyDB cluster's `initialUser` binds the `postgres` bootstrap password to the
  `rhema:alloydbPassword` Pulumi secret — one value for the runbook's privileged steps + every
  DATABASE_URL build.
- **`compute.ts`**:
  - `convert` is a Cloud Run **Job** (§12.1 — "per batch, no network, no DB"), not a service; its SA
    + 600s timeout + no `vpcAccess`.
  - A per-stack **Artifact Registry** docker repo `rhema-<stack>` (was hand-made for dev);
    `RUN_TASK_IMAGE_REPO` derives from it.
  - The api gets its full prod env: `DATABASE_URL`/`SYSTEM_DATABASE_URL`/`REDIS_URL` (secret config),
    `OBJECTS_BUCKET`, `MAX_USD_PER_RUN` (from stage facts), the run-token/stripe-webhook/
    email-action secret **names**, `API_PUBLIC_URL`/`APP_BASE_URL` from `domains`. Optional-secret
    names are wired only for stages whose `requiredSecrets` include them — the apps eagerly `access`
    a named secret at boot, so naming a versionless preview secret would crash-loop.
  - The worker gets the same treatment: `RUN_TOKEN_*` names, `RUN_TASK_IMAGE_REPO`, the admin/resend/
    email-action names, `OPS_ALERT_WEBHOOK_URL` via `secretKeyRef`, `EMAIL_FROM`, prod origins;
    `API_INTERNAL_URL` defaults to `https://api.rhema.app` on prod.
  - The web gets `API_BASE_URL = https://api.rhema.app` on prod.
  - **The prod serving surface**: managed cert over `rhema.app` + `api.rhema.app` +
    `rhemausercontent.com` + `*.rhemausercontent.com`; a URL map host-routing `api.rhema.app` → the
    api NEG and `[*.]rhemausercontent.com` → a `BackendBucket` over the PRIVATE `user-content` bucket
    (cookieless by construction — a separate registrable domain; CDN enabled because signed-url
    verification happens at the edge; `USE_ORIGIN_HEADERS` honors the private/no-store
    `servingHeadersFor` emits); a reserved global IPv4; the forwarding rule pinned to it.
- **`index.ts`**: reads `rhema:serviceImages` (the JSON `{service: digest-ref}` map the images CI
  publishes — REQ-ARCH-39), `apiDatabaseUrl`/`apiSystemDatabaseUrl`/`redisUrl`/`alloydbPassword`/
  `emailFrom`; exports `lbIpAddress`, **`dnsRecords`** (the operator's apply-list, emitted not
  hand-edited), and `requiredSecrets` (the seeding checklist).
- `npx tsc --noEmit -p tsconfig.json` — clean against `@pulumi/gcp@8.41.1`.

### 3. The full image set — every prod Dockerfile is real

Replaced the four remaining P0.01 sleeper Dockerfiles (`node -e "setInterval…"` placeholders) with
real two-stage pnpm images on the api pattern:

- **`apps/web/Dockerfile`** — `node dist/main.js` (the SSR shell + identity-header session stand-in);
  the generated `public/editor.js` client bundle is copied from the builder explicitly (it's a
  gitignored artifact `pnpm deploy` doesn't carry).
- **`apps/fetcher/Dockerfile`** — `node dist/server.js` (the real `/fetch` + `/healthz` service).
- **`apps/convert/Dockerfile`** — `ENTRYPOINT ["node","/app/dist/main.js"]` (the real converter CLI;
  the Job's per-execution args pass straight through — a Job image runs, never sleeps).
- **`apps/collab/Dockerfile`** — `node dist/server.js`, backed by a NEW `apps/collab/src/server.ts`:
  the honest minimum the skeleton service can serve (a `/healthz` listener so the Cloud Run service
  is healthy + real — the Hocuspocus impl is still its own ticket; no fake surface added). Deps:
  `hono` + `@hono/node-server`.
- Verified already-real: `api`, `worker`, `export`, `run-task`, `egress-proxy` (which runs
  `createProxyServer` — D-P0.07-4's image leg).
- **CI `images` job** now builds all **9** services (`run-task egress-proxy api web worker fetcher
  convert export collab`) so the provenance artifact carries a real digest for each.
- **`cloudbuild.yaml`** builds + pushes the same 9 to the stack's AR repo (`_AR`/`_TAG`
  substitutions — prod pushes to `rhema-prod`).

### 4. The prod seed/migration runbook — `infra/PROD-BRINGUP.md`

Ten numbered steps, all operator-gated: H6 checklist → stack init → `pulumi config` (secrets via
`--secret`) → Cloud Build + digest pinning → `[OPERATOR GATE] pulumi up` → `infra/k8s/apply.sh
STACK=prod` → DNS (from the `dnsRecords` output) → the 12 secret versions + the backend-bucket
signed-url key → **`applyMigrations` + `seedProtocols`** via the new
`scripts/live/prod-migrate-seed.mjs` (`integration/src/live-prod-bringup.ts` — deliberately never
`seedRealProjects`; verifies the migration count + lists the Essay row) → the provenance row → the
verbatim D-P0.13-2 write → smoke. `infra/pulumi/README.md` gained the prod section + the updated
resource table.

### 5. Deploy provenance binding (D-P0.04-2's live half, authored)

- `integration/src/record-deployment.ts` + `scripts/live/record-deployment.mjs`: inserts the prod
  `deployments` row (`id = prod:<git_sha>`) through the same `buildDeploymentProvenance` contract the
  CI half uses; computes `PROTOCOLS_VERSION` itself via `compute-protocols-version.mjs --bare` and
  **refuses** empty/stub/non-`0.4.0+` — prod provenance can never stamp `stub-0.0.0`.
- `integration/src/record-provider-verification.ts` + `scripts/live/record-provider-verification.mjs`:
  the Stage-B write for D-P0.13-2 — inserts the operator-attested `termsRef` and asserts
  `providerTransmissible("anthropic", now)` in-process.

## Evidence report

| Gate | Result |
|---|---|
| `pnpm turbo build lint typecheck` | **111/111 tasks pass** |
| `infra/pulumi` `tsc --noEmit` | clean vs `@pulumi/gcp@8.41.1` |
| `pnpm test` | all files pass — `infra/config/stages.test.ts` 16/16; one timing flake in `run-sheet/lever-matrix.test.ts` (104.9ms vs <100ms under concurrent load; green standalone in 22ms — pre-existing, unrelated to this change) |
| `pnpm check:protocol-markers` | OK — 39 public-facing files |
| `pnpm check:licenses` | OK — 502 packages |
| `node scripts/check-upstream-diff.mjs` | OK — 16 ported files reconcile |
| `check-build-memory.sh .` | **0 violations** |

Stage-A acceptance evidence: `stages.test.ts` (16 tests — prod-open signup, real domains, the
12-secret checklist, sandbox isolation unchanged); the Pulumi program typechecks; every prod
Dockerfile is a real two-stage image (no `setInterval` sleeper remains); the runbook covers
migrations/`seedProtocols`/k8s/DNS/secrets/provenance/the D-P0.13-2 write.

## What was deliberately NOT done (Stage B — operator gate)

1. Confirm HUMAN-H6 (GCP footing, billing, ADC, Pulumi backend, DNS control, prod secrets, OAuth
   consent, Resend domain, stated budget; the Stripe answer gates PRB.17).
2. Set prod Pulumi config + `--secret` values in the operator environment only.
3. `pulumi stack init prod` + `pulumi stack select prod`.
4. `[OPERATOR GATE]` `pulumi up prod`.
5. `PROJECT=rhema-507501 STACK=prod ./infra/k8s/apply.sh`.
6. Seed the 12 Secret Manager versions out-of-band + `add-signed-url-key` on the backend bucket.
7. `node scripts/live/prod-migrate-seed.mjs` against prod AlloyDB.
8. `node scripts/live/record-deployment.mjs` (the real `PROTOCOLS_VERSION` + digests).
9. `node scripts/live/record-provider-verification.mjs` (the verbatim `termsRef`).
10. Smoke: Cloud Run health, TLS ACTIVE on both domains, api/web/worker/proxy-egress assertions.
11. Flip the genuinely-proven rows (D-P0.01-1, D-P0.01-7, D-P0.15b-1, D-P0.15c-1, D-P0.04-2,
    D-P0.13-2) with the live evidence.

## Deviations / decisions

- **convert is a Cloud Run Job, not a service** — the ticket's own §12.1 shape ("a Cloud Run Job per
  batch, no network, no DB"). A real convert image (CLI entrypoint) could never have served a Cloud
  Run service's startup probe; the Job shape is the honest deploy. No ADR — spec-conformant.
- **collab got a real healthz server** (`server.ts`) rather than remaining a sleeper or being
  excluded from prod — every deployed service now runs a real image; the Hocuspocus impl is
  unchanged scope for its own ticket.
- **D-PRB.13-1 (Redis throttle) not landed** — the interface change + the row's live-only verify
  path make it PRB.16's; annotated, dated.
- **AR repo now IaC'd** (`rhema-<stack>` per stack) — removes the out-of-band `rhema-dev` repo; if a
  same-named repo exists on a re-deployed dev, `pulumi import` it once (documented in the runbook's
  image step).

---

## Addendum — 2026-09-17: prod domain re-scoped to the `rhema.tools` zone

The operator controls **`rhema.tools` only** — `rhema.app` + `rhemausercontent.com` are not
available (and never will be). The prod serving surface was re-factored onto the single zone:

- `PROD_DOMAINS` (`infra/config/stages.ts`): `rhema.tools` apex · `api.rhema.tools` ·
  `usercontent.rhema.tools` (+ `*.usercontent.rhema.tools` wildcard — kept for per-workspace
  content hosts; the runbook notes the bare-host fallback if the wildcard SAN fails managed-cert
  provisioning). Every `rhema.app`/`rhemausercontent.com` reference in live code, the Pulumi program
  (comments; the names were always `domains`-block-driven), `Pulumi.prod.yaml`, `PROD-BRINGUP.md`
  (incl. `emailFrom` → `hello@rhema.tools`), `SECURITY.md` (`security@rhema.tools`), the fetcher
  UA, and `apps/convert/src/serving.ts` (`USERCONTENT_ORIGIN`) now reads `rhema.tools`.

- **Cookie isolation rebuilt for a single zone (the security-critical half).** The separate-
  registrable-domain boundary is gone: `usercontent.rhema.tools` is a sibling subdomain of the apex,
  so a `Domain=rhema.tools` cookie set there would otherwise ride to `rhema.tools`/`api.rhema.tools`
  (clobber) and a Domain-scoped session cookie would leak back. `createAuth` (`apps/api/src/auth.ts`)
  now emits every Better Auth cookie **host-only under a literal `__Host-` name**
  (`cookiePrefix: "__Host-rhema"`, `useSecureCookies: false` so the library's `__Secure-` prefix
  doesn't break the position-0 rule, `crossSubDomainCookies.enabled: false` — never Domain-scoped,
  `defaultCookieAttributes: {secure, sameSite:"lax", path:"/", httpOnly:true}` on https base URLs;
  http dev keeps a plain `rhema-dev.` prefix since browsers reject `__Host-` without Secure). All
  Better Auth cookies — session, `session_data`, `dont_remember`, `account_data`, OAuth `oauth_state`
  /`state`/`nonce`/`code_verifier` — flow through the one `createCookieGetter`, so the block covers
  every Set-Cookie the api can emit. `apps/api/src/auth.test.ts` (new) asserts the computed cookie
  set AND a real `Set-Cookie` off `auth.handler` (`__Host-rhema.oauth_state=…; Secure; Path=/;
  HttpOnly; SameSite=Lax` — no `Domain=`). `AuthSecrets` gained optional `trustedOrigins` (the apex→
  api cross-origin auth calls D-P0.01-3 will need). Web sets no cookies (it only forwards the
  inbound `cookie` header); the user-content backend bucket cannot emit Set-Cookie — verified by
  code sweep, and asserted again in the runbook's smoke step.

- **Amendment notes (append-only, history not rewritten):** `28c_HUMAN-H6`, `28f_PRB.15`, and
  `28g_PRB.16` each carry a dated `> Amended 2026-09-17:` note; `docs/rhema-design-spec.md` carries
  the `⚑ Amendment — 2026-09-17` banner at §13.3 + a status-line mention; the D-PRB.02-1 deferral
  row got a dated note re-scoping its "separate registrable domain" AC wording. Everything else
  (older tickets, design docs, build history, the PHASE LOG) is untouched landed history.

- **Unchanged:** `signupMode:"open"` on prod, the 12 `requiredSecrets` ids, warm ≥4-vCPU AlloyDB,
  the `dnsRecords` output shape (now emits the `rhema.tools` A records), the Stage-B runbook steps.

## Addendum — 2026-09-17 (second, same date): prod database engine → Cloud SQL for PostgreSQL

The operator stated the real prod budget: **~$50/mo of infrastructure**. AlloyDB's minimum warm
primary (~$270/mo) is ~5x the entire target, so prod's managed Postgres became **Cloud SQL** — the
swap §12's provider table already foreshadowed ("Cloud SQL is the simpler swap"). ADR-010 records
the decision; the "Unchanged" bullet above is superseded on exactly the points below (append-only —
the earlier addendum stays as written).

**What changed in code (all offline; Stage B still gated):**

- `infra/config/stages.ts` — `alloydb: AlloyDbConfig` → `database: DatabaseConfig` with
  `engine: "alloydb" | "cloudsql"`: dev + preview keep AlloyDB (dev's cluster is live; previews stay
  small/paused — the spec's "AlloyDB **or Cloud SQL**" preview line licensed either); prod is
  `cloudsql` + `cloudSqlTier: "db-g1-small"` (the minimal prod-ready shared-core tier —
  `db-f1-micro` documented as the absolute floor but too thin to call prod-ready), `paused: false`,
  `backupRetentionDays: 35`.
- `infra/pulumi/data.ts` — AlloyDB cluster/primary gated behind `engine === "alloydb"`; prod creates
  a `gcp.sql.DatabaseInstance` (**POSTGRES_16**, `db-g1-small`, **ZONAL**, `ipv4Enabled:false` +
  `privateNetwork` on the same VPC + SAME `network.psaConnection` peering — Cloud SQL private IP
  allocates from the existing reserved range, no second connection/collision), `Database` (`rhema`)
  + `User` (`postgres` BUILT_IN bound to the same `rhema:alloydbPassword` secret — the key/id names
  are engine-agnostic, kept for stack continuity). Backups: `enabled` + `retainedBackups: 35` +
  `pointInTimeRecoveryEnabled` + `transactionLogRetentionDays: 7` (Cloud SQL's hard PITR cap —
  stated honestly; no 35-day continuous window exists on this engine). `deletionProtection` on
  prod. New `databaseHost` output = the private IP (AlloyDB `primary.ipAddress` / Cloud SQL
  `privateIpAddress`) — what the operator's DATABASE_URLs + `prod-migrate-seed.mjs` point at.
- `infra/pulumi/index.ts` — `alloydbCluster` output is now optional (empty on prod); added
  `cloudSqlInstance` + `databaseHost`. Canonical api URL key is now `rhema:appDatabaseUrl`
  (`apiDatabaseUrl` reads as a fallback so a stack seeded under the old name still works).
- `infra/pulumi/compute.ts` — companion prod cost posture from the same budget: the run-task GKE
  cluster is **ZONAL** (`us-central1-a`; non-prod keeps regional + the e2-stockout zone pin), the
  node pool is **1 × on-demand `e2-medium`** (Spot documented as a lever, never default — run pods
  must not be preempted; a >4 GiB Pod request is the documented reason to bump the pool), the
  egress-proxy MIG → **targetSize 1** (fail-CLOSED: a dead proxy loses egress, never leaks;
  auto-healing still replaces it). Redis → **BASIC** on prod too (smallest Memorystore; it is
  fan-out/presence, not the system of record).
- `infra/config/stages.ts` `PROD_REQUIRED_SECRETS` — `ops-alert-webhook-url` removed from the
  required set (11 required ids). Its Secret Manager container + IAM grant + conditional worker
  `secretKeyRef` binding are unchanged — the drift/balance alert path stays **inert** until a
  destination is seeded and the id re-added; provisioned-not-required is a documented opt-in, not a
  deletion.
- Cloud Run reachability: unchanged by design — services egress `PRIVATE_RANGES_ONLY` over the
  existing Direct-VPC connector; the Cloud SQL private IP routes identically to the AlloyDB one.
- Honest cost floor (runbook + ADR): db-g1-small ≈$25 + e2-medium ≈$24 + BASIC Redis ≈$33 +
  proxy e2-small ≈$13 ≈ **~$95/mo always-on before Cloud Run/LB/GCS/traffic** — ~$50 is achievable
  only with the GKE free-tier waiver (billing-account dependent) and/or the documented levers; the
  docs say so rather than pretending it fits.

**What changed in docs (append-only amendments):** design-spec `⚑` banners at §13.1 (engine +
companion cost posture) and §13.3 (backups → Cloud SQL automated ×35 + PITR capped at 7d) + the
status line; dated notes on `28c_HUMAN-H6`, `28f_PRB.15`, `28h_PRB.17`; `infra/PROD-BRINGUP.md`
reworded (Cloud SQL prerequisites/expected surface, `cloud-sql-proxy --private-ip` one-liner for
the migrate/seed leg, zonal `get-credentials --zone`, 11-required-secret checklist, the honest
floor); `Pulumi.prod.yaml` + `infra/pulumi/README.md` config/key comments; **ADR-010** authored and
the ADR index regenerated via `adr-index.sh`; LEDGER's current-state lines updated.

**Verify:** `infra/pulumi` `tsc --noEmit` clean; `stages.test.ts` green (engine/tier/secret
assertions rewritten); full gates re-run in this leg (numbers below in the commit message / PR).
**Stage B is still operator-gated** — no `pulumi up prod`, no live resources, no migrations, no
provenance/provider-verification writes.

---

## Stage B — live execution (2026-09-17, operator-authorized)

**Authorization:** the [OPERATOR GATE]s are discharged by the five `2026-09-17 | 28f_PRB.15`
GATE DECISIONS rows in `docs/build/LEDGER.md` (footing `rhema-507501`/`prod` stack, ~$50/mo budget
target, secrets sourced-per-plan, `rhema.tools` DNS operator-applied at the registrar, Stripe test
mode). The ticket's `Gate status` block records the same. `infra/PROD-BRINGUP.md` is followed
literally; this section logs each numbered step's outcome.

### Step log

_(populated as the runbook executes — see below)_

### Step 0 — HUMAN-H6 prerequisites confirmed

- `gcloud` project = `rhema-507501`, active account `14stevevitali@gmail.com`, ADC present;
  `pulumi whoami` OK (Pulumi Cloud backend).
- Dev-scoped copy sources exist in Secret Manager: `anthropic-api-key` (unprefixed) +
  `rhema-dev-{better-auth-secret,google-oauth-client-secret,run-token-signing-key,stripe-secret}` —
  exactly the 5 the gate answers name. Zero `rhema-prod-*` containers before `up` (created by the
  program).
- Budget: ~$50/mo target authorized; honest ~$95/mo always-on floor documented (runbook §0).

### Step 1 — stack init — DONE

`pulumi stack init prod` created the stack; `pulumi stack select prod`; `pulumi stack output` empty
as expected pre-`up`.

### Step 2 — prod config — DONE (pre-`up` half)

- `rhema:alloydbPassword` set `--secret` (fresh generated strong random — generated, never printed;
  the same value seeds `rhema-prod-alloydb-password` in step 6 and builds the DATABASE_URLs).
- `rhema:emailFrom` = `hello@rhema.tools`.
- DB URLs / `redisUrl` / image digests / `proxyBaseUrl` are set after the first `up` (the host
  facts don't exist yet) — per runbook §2's "set after step 3's first up" guidance.

### Step 3 — `pulumi up` (first pass — substrate + placeholder services)

`pulumi preview` clean: **+105 to create**, `stageKind=prod`, `requiredSecrets` = the 11 amended
ids, `sandboxIsolated{hasCloudNat:false,hasDefaultInternetRoute:false,egressTargets:[fw:egress-proxy]}`.
`pulumi up --yes` running (log: substrate — VPC/subnets/buckets/secrets/SA/IAM/AR repo
`rhema-prod`/reserved LB IP created; Cloud SQL db-g1-small + zonal GKE + MIG + LB in progress).
Cloud Build of all 9 prod images started in parallel against the now-created `rhema-prod` AR repo
(`_TAG=prod`).

**Step 3 outcome — two live-surfaced defects fixed, then converged:**

1. **Wildcard SAN rejected** — the managed cert was authored with `*.usercontent.rhema.tools`;
   Google-managed certs reject wildcard domains (400). Fixed in `compute.ts` (wildcard kept in the
   URL-map host routing, dropped from the cert SAN + the emitted DNS payload) — commit `8980f18`.
2. **Cloud SQL edition default** — `Invalid Tier (db-g1-small) for (ENTERPRISE_PLUS)`: Cloud SQL
   now defaults new instances to ENTERPRISE_PLUS; `edition: "ENTERPRISE"` is pinned explicitly in
   `data.ts` (db-g1-small is shared-core → ENTERPRISE-only, also the budget-right edition).
3. **Placeholder Job image** — `gcr.io/google-containers/pause:3.9` is no longer pullable; the
   final `up` ran after the image build with real digest-pinned images instead.

`pulumi up` then converged clean: **107 resources** (105 + 2 public-invoker grants below).

**Image build — DONE.** `gcloud builds submit --config cloudbuild.yaml --substitutions
_AR=us-central1-docker.pkg.dev/rhema-507501/rhema-prod,_TAG=prod` → **STATUS SUCCESS (7m32s)** —
all 9 images in the prod AR repo. Digests captured and pinned into `rhema:serviceImages` (7
services), `rhema:runTaskImageDigest`, `rhema:proxyImage`; AR digests re-verified to match the
pinned refs exactly.

**Step 4 — k8s post-step — DONE.** `get-credentials --zone us-central1-a` on
`rhema-prod-run-task-gke-c13cb80`; `PROJECT=rhema-507501 STACK=prod ./infra/k8s/apply.sh` →
`runs` namespace + `run-task-ksa` (WI-bound to `rhema-prod-run-task@…`) + `run-task-egress`
NetworkPolicy applied.

**Step 5 — DNS emitted verbatim (operator applies at the registrar):**

```
pulumi stack output dnsRecords
[{"name":"rhema.tools.","type":"A","value":"34.8.177.69"},
 {"name":"api.rhema.tools.","type":"A","value":"34.8.177.69"},
 {"name":"usercontent.rhema.tools.","type":"A","value":"34.8.177.69"}]
```

Managed cert `rhema-prod-cert-fc89dad`: `PROVISIONING`, all three domains `FAILED_NOT_VISIBLE` —
expected until DNS lands; the cert poll is the bounded post-DNS leg.

**Step 6 — secrets — DONE.** All 11 required `rhema-prod-*` secrets carry ≥1 version (verified by
`gcloud secrets versions list`; values never printed): 5 copied dev→prod by pipe, 3 generated
(`alloydb-password`, `email-action-secret`, `user-content-signing-key`), 3 placeholders
(`stripe-webhook-secret`, `resend-api-key`, `anthropic-admin-key`). The same
`user-content-signing-key` is installed on the backend bucket
(`rhema-prod-usercontent-backend-7dea6dd.signedUrlKeyNames = [rhema-tools-key]`, `enableCdn`).

**Step 7 — migrations + protocol seed — DONE.** Private-IP-only Cloud SQL reached via an
SSH/IAP tunnel through a private-app host (`127.0.0.1:15434 → 10.46.0.3:5432`); `DATABASE_URL` →
`scripts/live/prod-migrate-seed.mjs` applied **24/24 migrations** (matches
`packages/db/migrations/` exactly) and seeded **`protocols: essay v1`** — `seedRealProjects` never
invoked. Instance: `rhema-prod-postgres`, PostgreSQL 16.15, `db-g1-small`, ENTERPRISE, ZONAL.

**Step 8 — deploy provenance — DONE.** `record-deployment.mjs` computed the real
`protocols_version=0.4.0+64cbeef137b090c2` and wrote `deployments` id
`prod:3d538e9ae334eae874c406ade4cee1d20bdfe1f4` with all nine `sha256:` digests.
(Live note: `IMAGE_DIGESTS` wants bare `sha256:<hex>` values — the contract regex rejects
`repo@sha256:` refs; a first pass with full refs failed validation, correctly.)

**Step 9 — provider verification — DONE.** `record-provider-verification.mjs` with the
runbook-authorized values verbatim (`PROVIDER=anthropic`,
`TERMS_REF=https://www.anthropic.com/legal/commercial-terms`,
`VERIFIED_AT=2026-09-03T00:00:00Z`) → row `01M2Q07H6YQ37J06WT98XZGYHS`;
`providerTransmissible("anthropic", now) === true`.

**Step 10 — smoke (partial; honest split):**

- **PASS — service readiness:** all six Cloud Run services READY on the pinned digests; `web`
  `/`, `/login`, `/invite` serve real app HTML (200) over the `.run.app` URLs; `api` answers
  (app-level 404 on unmounted routes — Better Auth is unmounted by design, D-P0.01-3 → PRB.16).
- **PASS — sandbox egress, on the wire** (from a `runs` pod): `api.anthropic.com` → BLOCKED
  (unresolvable — no NAT, no default route); `http://10.8.16.4:8443/v1/messages` → the REAL
  egress-proxy answers `{"error":{"type":"egress.denied","message":"missing proxy credential"}}`
  403 — reachable, digest-pinned image running, credential gate enforced. Fail-closed posture
  proven.
- **PENDING — operator DNS:** every `*.rhema.tools` leg. TLS handshakes to `34.8.177.69` fail
  while the managed cert is `PROVISIONING`/`FAILED_NOT_VISIBLE`; port 80 has no frontend (HTTPS
  proxy only). Re-run after the registrar records propagate: `https://rhema.tools/`,
  `https://api.rhema.tools/healthz`, the `usercontent` no-cookie check, cert → ACTIVE.
- **BLOCKED-by-design — cookie check:** `POST /api/auth/sign-in/social` 404s because Better Auth
  is not mounted (D-P0.01-3, routed to PRB.16). The `__Host-` Set-Cookie assertion can't run
  until then — not a Stage B defect.
- **Note — Google FE quirk:** exactly `/healthz` on `*.run.app` hosts is answered by Google
  front-end infra (robot-page 404, no `x-cloud-trace-context`) before the request reaches Cloud
  Run; neighboring paths (`/healthzz`, `/healthz/`) reach the app normally. Health checks are
  exercised via the custom domain + LB once DNS lands.

**Live-surfaced defects fixed during Stage B (all committed):**

- `compute.ts` — `roles/run.invoker` for `allUsers` on `web` + `api`: the LB does not mint
  identity for LB→serverless-NEG hops, so every public request 403'd (dev worked only because
  `gcloud run deploy` grants it implicitly). Internal services stay invoker-gated.
- `compute.ts` — reserved internal `Address` (`10.8.16.4`) pinned as the proxy template's
  `networkIp`: MIG replacement re-assigned ephemeral IPs (16.2→16.3→16.6), silently dangling
  `rhema:proxyBaseUrl`. Also corrected `proxyBaseUrl` scheme to `http://` — the proxy serves
  plain HTTP.
- `data.ts` — `edition: "ENTERPRISE"` on the Cloud SQL instance.
- `infra/PROD-BRINGUP.md` — smoke command corrected (plain-HTTP proxy, no `/healthz`;
  credential-gated 403 is the expected response).

**Cost:** always-on floor ≈ $95/mo (Cloud SQL db-g1-small ~$25 + e2-medium ~$24 + BASIC Redis
~$33 + proxy e2-small ~$13) before Cloud Run/LB/GCS — above the ~$50 target; the honest floor was
authorized in the gate answers. Tear-down/scheduling policy is the operator's.

**Stage B state: SUBSTANTIALLY COMPLETE, not green.** The full stack is deployed and converged;
secrets/migrations/seed/provenance/provider-verification are written; the sandbox fail-closed
egress is proven on the wire. **Pending:** operator applies the 3 A records → cert leaves
PROVISIONING → the custom-domain smoke legs re-run. `nextTicket` therefore stays on PRB.15.

---

## Stage B — continuation: DNS applied, cert poll + domain smoke (2026-09-17, same date)

### Step 5′ — DNS landed at the registrar (operator), verified resolving

The operator applied the three `dnsRecords` A records. Verified from this environment — direct
authoritative/53 is blocked here, so all checks ran over public resolvers:

```
# Google DoH + Cloudflare DoH — every name → only the LB's reserved global IP
rhema.tools            A → ['34.8.177.69']   (dns.google + cloudflare-dns.com, status 0)
api.rhema.tools        A → ['34.8.177.69']   (same)
usercontent.rhema.tools A → ['34.8.177.69']  (same)
# negatives also clean: no AAAA at any of the three; no CAA at the apex; no CNAME at the apex
# apex sampled across ECS subnets (1.0.0.0/8, 35.190.0.0/16, 104.196.0.0/16,
# 199.36.153.0/24, 34.8.177.0/24) → all five return 34.8.177.69 only
```

Zone is hosted at Squarespace DNS (`nsb1..4.squarespacedns.com`); the local caching resolver
briefly still returned the four pre-change Squarespace IPs (`198.185.159.144/145`,
`198.49.23.144/145`) — stale TTL-bound cache, not the authoritative answer.

### Cert poll timeline — `rhema-prod-cert-fc89dad` (bounded, ~85 min of 3-min checks)

| time | status | domainStatus |
|---|---|---|
| 03:34 | PROVISIONING | all three `FAILED_NOT_VISIBLE` |
| 03:37 | PROVISIONING | `usercontent` → ACTIVE; api/apex `FAILED_NOT_VISIBLE` |
| 03:40 | PROVISIONING | `api` → ACTIVE; apex `FAILED_NOT_VISIBLE` |
| 03:43 → 04:59 (22 more polls) | PROVISIONING | api + usercontent `ACTIVE`; **apex `rhema.tools` still `FAILED_NOT_VISIBLE`** |

Two of three domains provisioned; the apex has been `FAILED_NOT_VISIBLE` for ~85 min despite the
authoritative RRset being verifiably clean from every reachable vantage — consistent with Google's
managed-cert checker retry backoff after the pre-DNS failure window (per Google docs provisioning
can take up to ~24h once DNS is correct). **Operator-check item:** confirm the apex `@` RRset at the
Squarespace zone contains *only* `34.8.177.69` (no lingering Squarespace A records — a mixed RRset
would stall the checker permanently; current public-resolver answers show only our IP, so this is a
verification, not a known fault). No agent-side remediation is safe: the cert can't be deleted while
attached to the target HTTPS proxy, and detaching/recreating it would fight the Pulumi state.

### Domain smoke — BLOCKED on the cert (no TLS on any host until the cert is `ACTIVE` overall)

```
curl --resolve api.rhema.tools:443:34.8.177.69 https://api.rhema.tools/healthz
  → LibreSSL SSL_connect: SSL_ERROR_SYSCALL (TCP connects, TLS reset — HTTPS proxy has no ACTIVE cert)
curl --resolve usercontent.rhema.tools:443:34.8.177.69 https://usercontent.rhema.tools/
  → same handshake failure
```

The `*.rhema.tools` legs — api `/healthz` over the domain, apex web HTML, usercontent no-`Set-Cookie`,
and the `__Host-` cookie kick — all re-run identically the moment the cert flips ACTIVE; commands are
`infra/PROD-BRINGUP.md` §10 verbatim. The `__Host-`/auth-kick leg additionally needs Better Auth
mounted (`/api/auth/*` currently 404s **by design** — D-P0.01-3 → PRB.16).

**Stage B state after this leg: still SUBSTANTIALLY COMPLETE.** New this leg: DNS confirmed applied
+ resolving on all three names; cert 2/3 domains ACTIVE. Remaining before PRB.15 fully closes:
apex domain-status → ACTIVE → cert ACTIVE → the four `*.rhema.tools` curls (the `__Host-` leg is
PRB.16's by design). `nextTicket` stays PRB.15.

---

## Stage B — close-out: cert recycled → ACTIVE, domain smoke green (2026-09-17, same date)

### The apex fix — recycle the managed cert through Pulumi

The stuck apex was the managed-cert checker's `FAILED_NOT_VISIBLE` retry backoff from the pre-DNS
failure window (documented Google behavior: retries can take up to ~24h once a domain has failed).
The remediation stayed inside Pulumi state — no hand-edited cloud resources:

```
cd infra/pulumi && pulumi stack select prod
pulumi stack export | grep sslCertificate
# → urn:pulumi:prod::rhema::gcp:compute/managedSslCertificate:ManagedSslCertificate::rhema-prod-cert
pulumi up --replace urn:pulumi:prod::rhema::gcp:compute/managedSslCertificate:ManagedSslCertificate::rhema-prod-cert --yes
# ++ ManagedSslCertificate rhema-prod-cert created replacement (5s)
# ~  TargetHttpsProxy rhema-prod-https-proxy updated (11s) [diff: ~sslCertificates]
# -- ManagedSslCertificate rhema-prod-cert deleted original (11s)
# ~ 6 Cloud Run services updated [diff: -scaling] — reverted live-side scaling drift to the
#    program-declared shape (program has no scaling block; services redeployed clean)
# Resources: ~7 updated, +-1 replaced, 100 unchanged — Duration 33s
```

The cert was never serving (PROVISIONING since creation), so replacement was free and safe.
The `alloydbCluster` stack-output warning is cosmetic — prod's engine is Cloud SQL (ADR-010), so
that output is intentionally undefined on this stack.

### Cert timeline — replacement cert `rhema-prod-cert-5c72967`

| time (EDT) | event |
|---|---|
| 05:14:34 | replacement cert created by the `pulumi up --replace` (`-fc89dad` deleted after proxy rebind) |
| 05:17–05:20 | polls: all three domains `PROVISIONING` (fresh checker run — no carried-over failure state) |
| 05:23:23 | **all three `domainStatus` ACTIVE → `managed.status: ACTIVE`** — ~9 min from creation |

Old cert `rhema-prod-cert-fc89dad` no longer exists (deleted by the replace; `ssl-certificates
list` shows only `-5c72967` on prod). The apex needed nothing at the zone — the Squarespace RRset
was already correct; the checker just needed a fresh start.

### Domain smoke — `infra/PROD-BRINGUP.md` §10, all legs green

```
$ curl -fsS https://api.rhema.tools/healthz        # UNPINNED — local DNS resolves api correctly
{"ok":true,"service":"api"}                        # HTTP 200 — the *.run.app /healthz intercept
                                                   # quirk does not apply on the custom domain

$ curl -fsS --resolve rhema.tools:443:34.8.177.69 https://rhema.tools/   # apex pinned (see caveat)
<!doctype html><html lang="en" data-theme="dark"><head>…<title>Rhēma</title>…   # HTTP 200 — real app

$ echo | openssl s_client -connect 34.8.177.69:443 -servername rhema.tools | openssl x509 -noout -subject -issuer -dates -ext subjectAltName
subject=CN=rhema.tools
issuer=C=US, O=Google Trust Services, CN=WR3
notBefore=Sep 17 08:22:23 2026 GMT  notAfter=Dec 16 09:14:35 2026 GMT
X509v3 SAN: DNS:rhema.tools, DNS:api.rhema.tools, DNS:usercontent.rhema.tools

$ curl -sSI --resolve usercontent.rhema.tools:443:34.8.177.69 https://usercontent.rhema.tools/
HTTP/2 403  (private GCS origin, no signed URL — expected shape)
headers: content-type, x-guploader-uploadid, cache-control: private, server: UploadServer, via: 1.1 google
→ ZERO Set-Cookie headers — the cookieless user-content origin holds on the wire

$ curl -sS -o /dev/null -w '%{http_code}' -XPOST https://api.rhema.tools/api/auth/sign-in/social \
    -H 'content-type: application/json' -d '{"provider":"google","callbackURL":"https://api.rhema.tools/"}'
404   # by design — Better Auth unmounted (D-P0.01-3 → PRB.16); the __Host- cookie kick is PRB.16's
```

**Local-resolver caveat (documented, not a defect):** this machine's caching resolver still returns
the stale pre-change Squarespace A records (`198.185.159.144/145`, `198.49.23.144/145`) for the
bare apex — a TTL-bound local cache artifact. Public resolvers are clean: `dns.google` returns
`status 0`, `rhema.tools A → [34.8.177.69]` only (same for api/usercontent, and no AAAA/CAA/CNAME —
verified in the prior leg and re-verified this leg). The apex curls were therefore run with
`--resolve` pinned to the LB IP; `api.`/`usercontent.` resolve fresh locally and pass unpinned.

### Stage B final state: **COMPLETE**

Every Stage-B step of `infra/PROD-BRINGUP.md` is now executed and evidenced: stack converged (107
resources), k8s post-step, DNS applied + verified, 11 secrets seeded, 24/24 migrations + `essay v1`,
deployments row with real `PROTOCOLS_VERSION`, provider-verification row + `providerTransmissible`
true, sandbox fail-closed egress proven on the wire, **managed cert ACTIVE on all three domains,
and the custom-domain smoke legs green**. The two remaining smoke sub-legs — the `__Host-`
Set-Cookie kick and "worker consumes the queue" — are pending-PRB.16 **by design** (Better Auth is
unmounted per D-P0.01-3; worker consumption needs a first real run on PRB.16's golden path), not
Stage-B failures. `nextTicket` advances to **PRB.16** (28g); `chainTip` stays
`stevevitali/prb-15-prod-bringup` (PRB.16 forks from it).
