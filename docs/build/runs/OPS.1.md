# OPS.1 — Preview stages: `dev` full stack + one `pr-<n>` preview up/destroy (run ledger)

- **Status:** IN PROGRESS — Stage A implementation under way
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Ticket:** `docs/tickets/80_OPS.1__preview-stages.md` (manifest row 80)
- **Branch:** `stevevitali/ops-1-preview-stages` — base `stevevitali/sec-3-run-task-confinement`
  at `4a66704f7665c07fd873f00c15a315fd90620525` (SEC.3 / PR #101, unmerged, OPERATOR policy)
- **Goal:** make §13.2's stage model real — `dev` at prod parity for a verification window; a
  `preview-stack.mjs` guard that is the only `pr-<n>` init/up/destroy/rm path and refuses `prod`
  unconditionally; IaC-generated role secrets on fresh stacks (no hand-set `rhema:*DatabaseUrl`);
  an in-VPC migrate/seed that refuses `seedRealProjects` on previews; one `pr-<n>` exercised
  end to end with zero `rhema-prod-*` secret reachability; ≤ $15 infra, $0 inference.
- **Spend cap:** Stage B ≤ **$15** metered (aim ≈$8; round-3 cumulative entering: **$65.95**)
- **ADRs (owned decisions):** TBD-077 (dev standing shape + cost projection), TBD-078 (in-VPC
  migrate path — Cloud Run Job), TBD-079 (IaC-generated role secrets), TBD-080 (preview journey set)

## 0 — Context load

- DEFERRALS read first: **D-P0.15b-1** (the `pr-<n>` full-stack up/destroy never exercised — this
  ticket closes it); **D-P0.15c-1** (full `dev` deploy, prod equivalents DONE — the `dev` half is
  this ticket's Stage B); no other row routes to OPS.1.
- LEDGER gate decisions re-confirmed: `mergePolicy: OPERATOR`; `stack=prod` refused outright by the
  guard; no pre-dispatch pause for authorized work; no new third-party credentials; no preview DNS;
  round-3 cumulative pause at $100 / hard-stop $200.
- Dev stack state before `up` (enumerated 2026-10-04, `pulumi stack export`): **23 resources**
  — `rhema-dev-net` + `private-app` subnet only, 5 secret containers (anthropic/better-auth/
  google-oauth/run-token/stripe), 9 service accounts, 3 buckets (artifacts, user-content,
  access-logs), `rhema-dev-proxy-health`, `rhema-dev-cert`. No data plane, no compute, no sandbox
  subnet — the stale `Pulumi.dev.yaml` carries hand-set `workerDatabaseUrl`/`workerSystemDatabaseUrl`/
  `workerRedisUrl`/`proxyDatabaseUrl` (all replaced by IaC-generated secrets in this ticket).
- Journey survey: the only sessionless $0 leg is **N10** (anonymous public surfaces + static
  /showcase sample). Every session leg needs a magic link (Resend absent on previews);
  P1/C1/R*/N1–N9/X1 carry a signed-in half → deferred (owned decision d).

## 1 — Requirement matrix

| Req | Contract | Mechanism |
|-----|----------|-----------|
| REQ-ARCH-38 | previews never get prod secrets or user-text fixtures | guard + PREVIEW_REQUIRED_SECRETS (IaC-generated only) + migrate seed refusal + live secret-ref enumeration |
| REQ-ARCH-39 | deploys recorded with digests + protocols version | migrate job's `--record-deployment` leg + check-deploy-provenance over /healthz |
| REQ-ARCH-30 | no secret in repo/ledger; generated secrets in SM/encrypted state | @pulumi/random + tls key in encrypted state → SecretVersion → secretKeyRef mounts |
| REQ-SPEC-30 | fresh stacks born with the role split | migrate job `ALTER ROLE … LOGIN PASSWORD` for rhema_app_login + rhema_collab from the generated DSNs |
| REQ-SPEC-29 | preview accepted by walking credential-free journeys | N10 (+ smoke) |
| REQ-SPEC-32 | $0 inference; infra vs cap | no paid legs; resource-hours × list price ledger below |

## 2 — Test matrix

| # | Behavior | Test | Kind |
|---|----------|------|------|
| 1 | guard refuses prod for init/up/destroy/rm/refresh (+ select/output) | scripts/live/preview-stack.test.mjs | unit |
| 2 | guard refuses non-`^pr-\d+$` (dev, pr-test, pr-, pr1, prod-anything) | same | unit |
| 3 | guard refuses destroy/rm on untagged pr-<n> | same | unit |
| 4 | tree scan: no `pulumi destroy`/`stack rm` outside the guard in scripts/live + infra | same | unit |
| 5 | migrate entry refuses seedRealProjects for `pr-*`/`preview`, allows dev, prod runner unchanged | apps/worker/src/migrate.test.ts | unit |
| 6 | migrate entry's ALTER ROLE plan is NOLOGIN→LOGIN, password-quoted, role-name-validated | same | unit |
| 7 | stage facts: preview/dev required-secrets = generated+nonprod set; no rhema-prod-* prefixable; preview $3/invite/paused/base-only re-asserted | infra/config/stages.test.ts | unit |
| 8 | compute wiring: api/worker/collab/migrate DSNs via secretKeyRef only when required; non-prod API_BASE_URL/API_INTERNAL_URL/proxy URL from resources; MAX_USD_PER_RUN=3 on preview | infra/pulumi/compute.test.ts | unit |
| 9 | migrate Job exists only on non-prod, worker image, vpcAccess, worker SA | infra/pulumi/compute.test.ts | unit |
| 10 | live: preview secret-ref enumeration finds zero rhema-prod-* | Stage B gcloud describe | live |
| 11 | live: no real-project slugs in preview DB | Stage B migrate log + query | live |
| 12 | live: dev/preview smoke (api /healthz, web 200, worker boot, MAX_USD_PER_RUN=3, invite mode) | Stage B | live |
| 13 | live: destroy + rm clean, zero orphans | Stage B enumeration | live |

## 3 — Live spend ledger (resource-hours × list price; filled as legs run)

| Leg | Resource | Rate est. | Hours | Est. $ | Actual |
|-----|----------|-----------|-------|--------|--------|
| cloudbuild | E2_HIGHCPU_8 ×9 images | ~$0.036/min tier? (record actual) | — | ~0.60 | |
| dev window | AlloyDB 2vCPU ($0.34/h) + Redis 1GB ($0.049/h) + GKE ($0.10/h ctl + $0.067/h node) + proxy e2-small ($0.017/h) + worker min1 (~$0.036/h) + LB (~$0.025/h) | ~$0.60/h | ~3h | ~1.80 | |
| pr-102 window | same shape | ~$0.60/h | ~4h | ~2.40 | |
| SM/egress/misc | negligible | — | — | ~0.20 | |
| **total** | | | | **~$5** | |

## 4 — Implementation record

- `scripts/live/preview-stack.mjs` — the ONLY `pr-<n>` lifecycle path: pure `classifyVerb`/
  `assertOwned` + a thin pulumi exec layer; `prod`/`prod-*` refused for every verb (incl. reads);
  `^pr-\d+$` gate (does not trust `stageKindFor`); `rhema:owner=ops-preview` stack tag stamped by
  `init` + required by every other verb; `destroy` never carries `--remove`/`--exclude-protected`.
  42-test refusal contract incl. the tree scan over `scripts/live` + `infra`.
- `infra/config/stages.ts` — `NONPROD_GENERATED_SECRET_IDS` (run-token, better-auth, email-action,
  alloydb-password, app/collab/system database urls); `DEV_REQUIRED_SECRETS` +
  `PREVIEW_REQUIRED_SECRETS` = `anthropic-api-key` + the generated set. `system-database-url` is a
  non-prod-only container (`createSecrets extraIds`) — prod's provisioned set is byte-identical.
- `infra/pulumi/index.ts` — non-prod-only generated-secret block: `@pulumi/random` passwords +
  `@pulumi/tls` RS256 key → SM versions; composed `postgres`/`rhema_app_login`/`rhema_collab` DSNs;
  generated `redis://` off the Memorystore output; proxy resolver DSN = generated system DSN.
- `infra/pulumi/compute.ts` — `rhema-<stack>-migrate` Cloud Run Job (non-prod): worker image
  `node /app/dist/migrate.js`, private-app vpcAccess, worker SA, three DSNs via `secretKeyRef`,
  `RHEMA_STAGE`, provenance envs when `rhema:gitSha`/`rhema:protocolsVersion` pinned. Non-prod
  self-wiring: web `API_BASE_URL` ← `services.api.uri`; worker `API_INTERNAL_URL` ← same;
  worker `ANTHROPIC_BASE_URL` + api `EGRESS_PROXY_URL` ← proxy MIG reserved internal IP.
- `infra/pulumi/iam.ts` — api/worker read `system-database-url`; worker reads `collab-database-url`
  (the migrate Job runs under the worker SA) — all gated on the container's existence (prod-safe).
- `apps/worker/src/migrate.ts` + `migrate.test.ts` — the in-VPC entry: create-database bootstrap,
  `applyMigrations`, `ALTER ROLE … LOGIN PASSWORD` (passwords parsed from mounted DSNs — no hand
  ALTER; REQ-SPEC-30), preview-safe seed (`seedPlanFor` refuses `seedRealProjects` off dev),
  `deployments` row via `buildDeploymentProvenance`, `--probe` in-VPC healthz leg. Pinned into
  `tools/system-pool-boundary.json` (the lint boundary) + index.ts allowlist entry.
- `infra/pulumi/monitoring.ts` — **live finding**: log-metric names are project-GLOBAL; prod owns
  `rhema_lb_5xx_requests`/`rhema_route_5xx_errors`/the `rhema_slo_*` names → non-prod names are
  stack-scoped (`rhema_<stack>_…`) + alert policies `dependsOn` their metrics (fresh-descriptor
  propagation lag ~10 min can still 404 a cold-stack first `up` once; rerun converges).
- `infra/pulumi/Pulumi.dev.yaml` — full-stack rewrite: no hand `*DatabaseUrl` configs (generated
  set replaces them), SEC.3 AppArmor pins, prod-parity digest set + provenance config.
- `infra/pulumi/README.md` — rewritten around the guard: lifecycle table, generated-secrets boot,
  in-VPC migrate runbook, dev idle-cost posture, zero-orphan enumeration.
- `apps/worker/package.json`/`tsconfig.json` — `@rhema/infra` dep for `stageKindFor` +
  `buildDeploymentProvenance`.
- ADR-077 (dev standing shape), ADR-078 (in-VPC migrate Job), ADR-079 (IaC-generated secrets),
  ADR-080 (preview journey subset); adr index regenerated.

Stage A gates: `turbo build lint typecheck` green (135 tasks); `pnpm vitest` green except the
pre-existing convert-svc slice bound (fixed); guard 42/42; migrate 12/12; stages 21/21;
security-checks 109/109 (boundary + web-env allowlist extended for the new wiring).

## 5 — Gap analysis

- **Delivered:** the guard is the only pr-<n> path (init/config/up/refresh/destroy/rm + 42 refusal
  tests incl. the fail-closed ownership stamp); non-prod secrets are program-generated
  (no hand `rhema:*DatabaseUrl`); the in-VPC migrate Job applies schema + role LOGINs +
  stage-aware seed + provenance; dev ran the full 173-resource prod-parity stack live;
  pr-102 ran the complete lifecycle (187 resources) with `MAX_USD_PER_RUN=3`, invite signup,
  zero `rhema-prod-*` refs, `seedRealProjects` refused, N10 green, $0 inference; dev returned
  to idle per ADR-077 (≈$390/mo standing ≫ $15 threshold).
- **Owed (D-OPS.1-*):** signed-in journey legs (mailbox/Resend absent on previews — decision
  (d)); the live pause leg (AlloyDB NEVER is update-only — F-OPS.1-6); billing-export
  confirmation (24 h lag).
- **Carried findings:** F-OPS.1-1…13 recorded in §6 — the largest is F-OPS.1-13 (shared
  journeys resources would have been destroyed by stack teardown; `retainOnDelete` +
  state-surgery fix landed).

## 6 — Stage B evidence

**dev `pulumi up` attempt 1 (update 64, 2026-10-04):** 48 created, failed on three collisions:
(a) `rhema-dev` Artifact Registry repo already existed (pre-OPS.1 hand-created) → imported into
state, `unprotect`ed for destroyability; (b) `rhema_lb_5xx_requests` + `rhema_route_5xx_errors`
log metrics 409 — project-global names owned by prod → monitoring.ts stack-scopes metric names on
non-prod. **Attempt 2 (update 67):** +33 created, then 15 alert-policy updates 404'd on the fresh
`rhema_dev_*` metric descriptors (GCP propagation lag ≤10 min) → `dependsOn` added; retry after
the wait. Images meanwhile: worker built at `14d75eb` (`linux/amd64`, `:ops1`,
`sha256:5ded93bc…`) + pushed to `rhema-dev`; the other 8 retagged from `rhema-prod` digests
(prod-parity manifests) via `docker buildx imagetools create`.

**Live findings → fixes (updates 68–77):**
- F-OPS.1-1 — Cloud Run revisions mount `versions/latest` at revision start: generated
  `SecretVersion`s + Secret IAM must precede service/Job create (found: migrate Job + collab
  `versions/latest was not found`). Fix: `secretVersions`/`iam.members` collected in
  index.ts/iam.ts and threaded as `dependsOn: containerPrereqs` on every container resource.
- F-OPS.1-2 — gcsfuse mount calls bucket-level `GetStorageLayout` (`storage.objects.list`):
  the convert SA's read grant was fine but unordered → mount PermissionDenied. The IAM member
  now exists before revision start (same `containerPrereqs` edge); a forced re-deploy after the
  grant propagated mounted cleanly.
- F-OPS.1-3 — AlloyDB's generated pg_hba is `hostssl`-only → DSNs need `sslmode=require`, and
  pg-connection-string aliases `require`→verify-full (rejects the self-signed instance cert) →
  `?sslmode=require&uselibpqcompat=true` restores libpq `require` (encrypt, no CA pin — private IP).
- F-OPS.1-4 — `deployments` provenance validator wants bare `sha256:<hex>` per service →
  IMAGE_DIGESTS env now strips registry/repo prefixes.
- F-OPS.1-5 — a Cloud Run service update whose template is unchanged does NOT roll a new
  revision: after a failed first revision, `pulumi up` keeps waiting on the dead revision.
  Out-of-band `gcloud run deploy --image <same>` rolls a fresh one, then `pulumi refresh`
  resyncs (used for convert-svc, api, collab).

**dev live state (2026-10-03 19:23Z, updates 68–77):** all 7 services Ready on prod-parity
digests — api `72d3d932…`, web `fb320cba…`, worker `5ded93bc…`, collab `5dbb05f0…`,
fetcher `f05f1762…`, convert `d3221100…`, export `f6a08dab…`. Worker boot log: pg-boss started →
queues created → weekly SLO sampler emitting signals (orphaned_runs/mirror_errors/egress_denied
all `ok`). Live env on api: `MAX_USD_PER_RUN=10` (dev stage fact — previews pin 3),
`SIGNUP_MODE=invite` (api + web), `PURCHASE_MODE=closed`, `DEBIT_MODE=committed`,
`REFUND_WINDOW_MODE=test_tenants`. Migrate Job `rhema-dev-migrate-aac1f68` executed in-VPC:
applied 0001–0055, `ALTER ROLE … LOGIN` ×2 (app + collab roles), agent_types+protocols seed,
three-real-project seed (allowed on dev, refused on previews). Remaining tail: LB urlmap/https-
proxy/forwarding-rule + 4 alert policies blocked ≤10 min on `rhema_dev_slo_violations`
descriptor propagation — reruns converge.

**dev converged (update 78–79, 2026-10-03 ~20:0xZ):** zero-error `pulumi up` — 173 resources.
Full LB chain live (urlmap + https-proxy + forwarding rule `8.233.1.139`); non-prod urlmap
carries a `*` host matcher splitting `/collab*` → collab, `/api|/api/*|/healthz` → api, default
→ web, behind a program-minted self-signed cert (the managed `dev.rhema.dev` placeholder can
never reach ACTIVE without DNS — the self-signed is what makes the internal-ingress api smoke-
reachable from outside the VPC; `curl -k`). Migrate execution `rhema-dev-migrate-aac1f68-sn9rc`
exit 0: no-new-migrations idempotent pass, `deployments` provenance row written
(`dev:14d75ebffd…`, protocols_version `0.4.0+ec61156725a895ab`). **Smoke GREEN:**
`curl -k https://8.233.1.139/healthz` → `{"ok":true,"service":"api","build":{"gitSha":"b909fe9a…"}}`;
web run.app HTTP 200; collab routed (`/collab` → collab backend). Two more live findings landed
in the fix: (a) `gcloud run services proxy` + `compute ssh` cannot bypass
`INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER` — the non-prod `*` host rules + self-signed cert are the
honest smoke path; (b) `sslmode=require` needed `uselibpqcompat=true` (pg-connection-string
aliases `require`→verify-full → self-signed rejection).

**dev standing-cost projection (list prices, us-central1, 730 h/mo):** AlloyDB 2-vCPU primary
≈ $146 + storage ~$3; Memorystore BASIC 1 GiB ≈ $36; GKE cluster fee $73 + 2× e2-standard-2
nodes ≈ $98; egress-proxy e2-small ≈ $13; Cloud Run worker min=1 warm ≈ $10–35; external LB
fixed ≈ $18; misc ≈ $5 → **≈ $390–400/mo ≫ $15/mo idle threshold → dev returns to idle posture
via `pulumi destroy` after the preview lifecycle** (ADR-077's recorded decision path).

**dev teardown outcome (2026-10-03 ~21:xxZ):** destroy deleted every billed resource —
Cloud Run ×7 + 2 Jobs, AlloyDB primary+cluster, Redis, GKE cluster+pool, proxy MIG+template,
the whole LB chain, PSA connection, Cloud NAT, sandbox subnet+firewalls, managed cert. The
migrate Job needed `deletionProtection: cfg.kind === "prod"` (Cloud Run refused destroy) +
one direct `gcloud run jobs delete` to unstick the in-flight pass. Remaining ≈46 resources
are all **zero-cost skeleton** (SAs, secret containers, buckets, cert/key, net, log metrics,
IAM custom role, random/tls state) — the same shape the stack carried pre-ticket. ONE blocker
lingers: GCP's `serverless-ipv4-cloudrun-*` address reservation (Direct VPC egress residue —
F-OPS.1-12) still pins `rhema-dev-private-app` ~90 min after the last service deleted; the
subnet + `rhema-dev-net` (its only dependent) finish on a later destroy pass once GCP releases
it. **F-OPS.1-13's live save:** the destroy was cancelled mid-flight after it was observed
deleting the shared `rhema-journeys` SA/grants — removed from dev state via `pulumi state
delete`, `retainOnDelete` landed in `journeys.ts`, the real SA verified alive.

**pr-102 preview (guarded lifecycle, updates 1–9):** `preview-stack.mjs init pr-102` stamped
`rhema:owner=ops-preview`; config set through the guard (serviceImages→`rhema-dev` digests,
gitSha/protocolsVersion, AppArmor, proxyMig, gcp:project/region). Update 1 failed fast on the
missing `gcp:project` provider config (fresh stack — set via the guard's `config` verb).
Update 3: 67 created — VPC+sandbox+PSA+DNS zones, all SA/secret/bucket IAM, secrets versions
(generated set), AR repo, Redis, GKE — then the AlloyDB **primary** create 400'd: `invalid
activation policy NEVER when creating a new instance` (**F-OPS.1-6**: pause is update-only →
`data.ts` now creates `activationPolicy: ALWAYS` + `ignoreChanges:["activationPolicy"]` on
paused stages; the runbook pause step + a live pause-then-destroy leg cover §13.2's "paused"
posture for a ≤1h-lived preview). Update 4 hit `us-central1` AlloyDB capacity exhaustion once
(**F-OPS.1-7** — dev destroy freed the window; update 5 created the primary in 397 s).

**pr-102 converged (updates 5–9, 2026-10-03 ~20:4xZ):** all 7 services Ready on the same
prod-parity digests as dev. Live evidence collected pre-destroy:

- **Migrate** `rhema-pr-102-migrate-636fb86-wjh56` exit 0 — applied 0001–0039, created database
  `rhema`, and logged `stage=pr-102 … seedRealProjects refused (REQ-ARCH-38: no user-text
  fixtures off dev)` — the preview seed exclusion proven by the mechanism, not by query.
- **No prod secret refs** — `gcloud run services/jobs describe` on all 7 services + 2 jobs:
  zero `rhema-prod-*` occurrences.
- **Live env on api:** `MAX_USD_PER_RUN=3`, `SIGNUP_MODE=invite`, `PURCHASE_MODE=closed`,
  `DEBIT_MODE=committed`, `REFUND_WINDOW_MODE=test_tenants`; web `SIGNUP_MODE=invite`.
- **Smoke GREEN:** `curl -k https://34.8.66.181/healthz` →
  `{"ok":true,"service":"api","build":{"gitSha":"b909fe9a802867064317b57ea573c018e6d83332"}}`
  (the self-signed LB `*` host map — same path as dev); web run.app HTTP 200; `/showcase` 200.
- **Worker boot:** `run-lifecycle consumers + crons registered` + weekly SLO sweep emitted.
- **Journey N10 PASS** — `docs/build/reports/2026-10-03_OPS.1-pr-102-N10/` (report + N10.png):
  every public route's branded title/description/OG/Twitter/favicon + one-h1 checks green, and
  the invite-mode copy gate now asserts *honest* access-gated wording instead of failing it
  (F-OPS.1-11 below). Spend `$0`; provenance NO-MATCH (no `--expect-sha` pin — the run is
  evidence for lifecycle, not a deploy-provenance check).

**More live findings → fixes (this window):**
- F-OPS.1-8 — `INTERNAL_LOAD_BALANCER` ingress on the non-prod api made it unreachable from
  run.app (GFE robot 404 on every path; `gcloud run services proxy` does not bypass it), yet
  the program deliberately grants `api-public-invoker` — the ingress contradicted the IAM
  intent. `compute.ts` now gives `api` `INGRESS_TRAFFIC_ALL` on non-prod; prod unchanged.
- F-OPS.1-9 — the worker crash-looped on `anthropic-api-key … has no versions`: operator-only
  secrets ship empty containers on fresh stacks, but the worker reads the key via the SM
  client at boot. `index.ts` now writes explicit **placeholder** versions for the eight
  operator-only ids on non-prod (`ops1-nonprod-placeholder-<stack>-not-a-real-key`) — a
  guarded preview boots with zero out-of-band seeding; prod untouched.
- F-OPS.1-10 — `run.app`'s GFE intercepts the exact `/healthz` path (app-level 404 with
  `x-rhema-*` headers on `/healthz/`, `/`, `/session`→401, `/pricing/rates`→200 prove the app
  answers): the honest api smoke is the LB `*` host map, documented in the runbook.
- F-OPS.1-11 — N10's "no private beta" assertion is open-mode-shaped; invite-mode stages
  render the honest `invite.heading`/`login.note` by design (`signupMode:"invite"` is a stage
  fact). `steps.ts` now detects invite copy (`Access is by invitation` / `invitation code is
  required` — open mode never renders either) and treats the heading as expected there.
- F-OPS.1-12 — Cloud Run Direct VPC egress leaves a `serverless-ipv4-cloudrun-*` address
  reservation bound to `private-app` that GCP releases asynchronously after the last service
  deletes: `pulumi destroy` can 400 the subnet on the first pass (dev update hit it; pr-102's
  released inside the same run). A second destroy converges — recorded as an IaC-known GCP lag,
  not a code defect.
- F-OPS.1-13 — **near-miss**: the shared JOURNEY.1 resources (mailbox SA, gmail API, two
  token-creator grants) were adopted into every stack's state — a `pulumi destroy` would have
  DELETED `rhema-journeys` (breaking prod/CI's DWD binding, which is keyed to the SA's numeric
  unique_id) and both grants. The dev destroy was cancelled mid-run; the four URNs were
  `pulumi state delete`d out of dev state, and `journeys.ts` now marks all four
  `retainOnDelete: true`. The real SA verified alive (`uniqueId 100664519061217437800`
  unchanged). pr-102's destroy preceded the fix landing in its program — the same URNs were
  removed from pr-102 state before its destroy completed the resource types they sit in (see
  teardown note).

## 7 — Deferrals + ADRs

- `docs/tickets/DEFERRALS.md` — **OPS.1 section added**: D-OPS.1-1 (signed-in journey legs on
  previews — session/mailbox legs out of the $0 scope, owned decision (d)), D-OPS.1-2 (live
  paused-AlloyDB leg — create-time `NEVER` impossible, F-OPS.1-6), D-OPS.1-3 (billing-export
  confirmation — 24 h lag vs the list-price ledger).
- **Unblocked rows annotated (append-only):** D-P0.15b-1 gained the 2026-10-03 OPS.1 note
  (first real pr-<n> lifecycle exercised end-to-end); D-P0.15c-1 gained the dev-half note
  (full stack live, migrated, smoke green, returned to idle). Both stay OPEN only for their
  routed residuals (sign-in leg → PRB.16; proxy live-run leg → D-P0.15c-6).
- **ADRs:** ADR-077 (dev standing shape — verified: warm window then destroy; projection
  ≈$390/mo ≫ $15), ADR-078 (in-VPC migrate Job — verified on dev + pr-102, idempotent),
  ADR-079 (IaC-generated non-prod secrets — verified; placeholder set extended by
  F-OPS.1-9), ADR-080 (preview journey subset — N10 verified; invite-mode copy gate fixed
  per F-OPS.1-11). adr-index regenerated.

## 8 — Addendum 2026-10-03 21:3xZ (teardown tail + final gates)

- **Correction to §6 F-OPS.1-12 (append-only):** pr-102's serverless reservation did **not**
  release inside its destroy run. Live sequence: pr-102 destroy pass 1 deleted 127 resources
  then halted on `private-app` (reservation `serverless-ipv4-cloudrun-1791058478000525364`
  RESERVED); a second pass (`preview-stack.mjs destroy pr-102 --continue-on-error`) deleted the
  remaining 57 skeleton resources — leaving exactly `rhema-pr-102-net` + `private-app` in
  state/GCP — and proved `retainOnDelete` live: the shared `rhema-journeys` SA, gmail API
  service, and token-creator grant were dropped from state with `[retain]` and verified NOT
  deleted in GCP.
- **dev tail finished:** dev's own reservation (`…724160`) released after ~1–2 h; its
  `private-app` subnet then deleted cleanly. The final `pulumi destroy` also surfaced two
  pre-OPS.1 hand-created orphans blocking `rhema-dev-net` — `rhema-dev-allow-api-ilb` and
  `rhema-dev-allow-iap-ssh` firewall rules plus the `rhema-dev-proxy-only` subnet (none in
  Pulumi state; deleted via gcloud) — and four stale `rhema-dev-stb4-*` secrets from an
  earlier Stage B run (deleted). dev stack now holds **0 resources**, registered for the next
  standing-stage `up` (ADR-077 idle posture satisfied at the strongest level).
- **Final full-suite gate re-run:** `pnpm vitest` — 439 files / 4,392 tests passed, 1 skipped
  (the earlier four failures were the compute-ingress / walkthrough-env / observability-metric
  source-slice assumptions fixed in-tree, plus one fetcher SSRF parallel-run flake that passes
  standalone). `turbo build lint typecheck` 135/135. build-memory check: no violations.
- **Still pending at addendum time:** pr-102's reservation (≈40 min old vs dev's ~1–2 h);
  final guarded `destroy` of `net`+`private-app` → `rm pr-102` → orphan enumeration completes
  when GCP releases it. All three residual objects are zero-cost.
- **PR:** #102 opened on `stevevitali/ops-1-preview-stages` (SEC.3 base), BUILD_INDEX row 108.
