# OPS.2 — IaC drift, prod cost posture, and the Turbo remote cache (run ledger)

- **Status:** DONE — all Stage B legs landed (PR #103 on #102, unmerged, OPERATOR; provenance
  `prod:ead193c` verified; CI `>>> FULL TURBO` same-SHA evidence)
- **Harness:** Devin CLI (agentic coding subagent); model: Cognition Devin; tier: n/a (build work)
- **Skills:** agent-skills `5d24fd0` (implement-spec, full rigor)
- **Started:** 2026-10-03T22:35Z
- **Ticket:** `docs/tickets/81_OPS.2__iac-drift-cost-cache.md` (manifest row 81)
- **Branch:** `stevevitali/ops-2-iac-drift-cost-cache` — base `stevevitali/ops-1-preview-stages`
  at `9920ca4120ac7234c8d14aa6b60add4a6bbd0a36` (OPS.1 / PR #102, unmerged, OPERATOR policy; tree clean at fork)
- **Spec:** `docs/rhema-design-spec.md` §13.1 (ADR-010 cost floor), §13.2, §13.3, §13.5
- **REQ:** REQ-ARCH-39, REQ-ARCH-30, REQ-SPEC-30, REQ-ARCH-28
- **Spend:** $0 inference. Stage B = read-only previews/billing + pre-authorized `pulumi up prod`
  (drift fixes + stateless cache service; zero stateful replace/delete; ≤ $15/mo delta).
- **Round-3 cumulative entering:** ~$70.95 (contract).

## Deferrals read

- `docs/tickets/DEFERRALS.md` read first. **D-P0.01-4** (Turbo remote cache self-hosted server —
  endpoint-config-only since P0.01) is this ticket's close target (BL-28). No other OPEN row routes
  here: X-iac-runbook-drift / X-infra-cost-vs-target are BACKLOG items this run closes inside
  `runs/OPS.2.md` for REC.1, not DEFERRALS rows.
- Gate answers honored (LEDGER GATE DECISIONS + contract): `rhema_collab` adopted AS-IS (never
  re-passworded / role-altered — import or equivalent no-op; a needed role change ⇒ STOP + D-OPS.2-n);
  every HA/cost lever PLAN-ONLY; billing export/budget needing billing-account IAM ⇒ D-OPS.2-n;
  `TURBO_API`/`TURBO_TOKEN` repo vars needing repo-admin ⇒ D-OPS.2-n; cost deltas > $15/mo pause;
  `pulumi up prod` pre-authorized for drift fixes + the stateless cache service.

## Requirements (extracted 2026-10-03)

1. **Collab role + secret in IaC** (BL-27; REQ-SPEC-30/REQ-ARCH-30): declare `rhema_collab` LOGIN +
   its `DATABASE_URL` secret via SEC.1's role-provisioning mechanism (the same OPS.1 uses for fresh
   stacks); adopt prod's existing state — import or equivalent no-op — never rotate; PROD-BRINGUP.md
   §2 gains the collab step; assert NOBYPASSRLS.
2. **Runbook completeness** (REQ-ARCH-39): a test fails when `infra/pulumi/*.ts` reads a `rhema:*`
   config key `PROD-BRINGUP.md` does not document.
3. **Quiet previews**: declare whichever Cloud Run field reads back differently (template-level
   `scaling` vs service-level `scaling`/`scalingMode` — CONFIRMED below); export `alloydbCluster`
   only where it exists (removes the warning).
4. **Committed image builds** (BL-27): promote `integration/.scratch/cloudbuild-*.yaml` to ONE
   committed parameterized build definition (`infra/cloudbuild/`); PROD-BRINGUP §2b points at it;
   one-off helpers stay scratch.
5. **The measured bill + HA pre-plan** (BL-29): real prod bill by service/SKU (last full month +
   MTD) vs $50 target / ~$95 floor; source named; levers ranked by $/mo w/ feasibility; Cloud SQL HA
   pre-plan (REGIONAL delta + failover rehearsal + maintenance window + backups/PITR unchanged,
   REQ-ARCH-28); `gcp.billing.Budget` at the target if IAM allows else D-row.
6. **Self-hosted Turbo remote cache** (BL-28; D-P0.01-4): stateless scale-to-zero Cloud Run service
   behind a config flag + new GCS bucket w/ lifecycle expiry; IaC-generated token in Secret Manager
   (pre-authorized); CI's existing `TURBO_API`/`TURBO_TOKEN` point at it; `remoteCache.signature`
   considered; licence recorded; D-P0.01-4 flipped with evidence.
7. **Closeout**: X-iac-runbook-drift + X-infra-cost-vs-target recorded closed here for REC.1;
   `record-deployment.mjs` on the up.
8. **Owned ADRs** (next free = ADR-081, ADR-082): (a) cache server + placement (prod stack — a `ci`
   stack is NOT authorized); (b) measured prod cost posture + recommendation vs $50/$95.

## Acceptance criteria

- [x] AC1 — post-codification `pulumi preview --stack prod`: no change to `rhema_collab` role or its
      secret, no password rotation. **PROVEN** — the adoption is a program no-op (the secret
      container + `rhema:collabDatabaseUrl` config + secretKeyRef mount already existed from SEC.1);
      pre-up preview showed `160 unchanged`, post-up `172 unchanged`, zero collab-resource diffs.
- [x] AC2 — fresh stack (OPS.1 mechanism / PGlite role-catalog test) yields `rhema_collab` LOGIN +
      NOBYPASSRLS + exactly 0028's grants. **PROVEN** — `rls-catalog.test.ts` "rhema_collab
      post-adoption" (6/6 file tests green): after the `alter role … login` statement shape the
      mechanism emits, the role is `rolcanlogin=t`, `rolbypassrls=f`, `rolsuper=f`, `rolinherit=f`,
      `rolcreatedb/rolcreaterole/rolreplication=f`, zero memberships, `public`-schema usage, and the
      privilege census equals `COLLAB_ROLE_GRANTS` (0004+0028+0053+0054) exactly — every table
      including no-grant ones.
- [x] AC3 — runbook-completeness test fails on an undocumented `rhema:*` key; passes on the tree.
      **PROVEN** — `infra/config/runbook-completeness.test.ts` (3 tests): statically extracts every
      `rhemaConfig.get*` key from `infra/pulumi/*.ts` (nested generics handled —
      `getObject<Record<string,string>>` bug found + fixed), asserts each is documented in
      PROD-BRINGUP.md, plus a removal-catches mutant case. 26 keys documented.
- [x] AC4 — unchanged tree `pulumi preview --stack prod`: 0 update / 0 replace / 0 delete, no
      `alloydbCluster` warning; evidence committed. **PROVEN** — pre-up: `160 unchanged` (all 7
      Cloud Run `-scaling` service-level readback diffs silenced via `ignoreChanges:["scaling"]`,
      the app-database-url SecretVersion replace footgun gated `ignoreChanges:["secretData"]` on
      prod, `alloydbCluster`/`cloudSqlInstance` now conditional `exports` writes — warning gone).
      Post-up: `172 unchanged`, zero diffs, zero warnings.
- [x] AC5 — committed image-build definition reproduces the digest set for the chain tip; no
      PROD-BRINGUP step references `integration/.scratch/`. **PROVEN** — `infra/cloudbuild/
      image-set.yaml` is the single committed parameterized definition (`_SERVICES` subset support +
      unknown-name fail; `_AR`/`_TAG`/`_GIT_SHA`; root `cloudbuild.yaml` deleted, scratch helpers
      retired). LIVE-PROVEN on the `_SERVICES=turbo-cache` subset — Cloud Build `9b2d150b` succeeded
      2026-10-03, produced `turbo-cache@sha256:b62a2863…`. `cloudbuild.test.ts` (5 tests) pins the
      canonical set == `apps/*/Dockerfile`, the single-definition invariant, GIT_SHA scope, options,
      and the no-`.scratch` runbook gate. Digest-parity interpretation recorded in the gap table.
- [x] AC6 — cost readout in this file: actual monthly figures by service/SKU; gap to $50 and to $95;
      ranked levers with $ deltas; HA pre-plan; every number sourced. **PROVEN** — see § Cost
      readout below (`scripts/live/billing-read.mjs`; every line SKU-sourced). Gap: **$285.80 vs
      $50 target = +$235.80 over; vs $95 floor = +$190.80 over.** Actuals-vs-list reconciliation is
      D-OPS.2-1.
- [x] AC7 — two same-SHA CI runs: second shows remote-cache hits for `build` tasks, log evidence
      committed; token never in a log or the ledger. **PROVEN** — run `37161289562` at `ead193c`
      (PR #103): attempt 1 `cache miss, executing` ×135, `Cached: 0/135` (cold-store, PUT→200 in
      cache logs); attempt 2 same SHA — **135× `cache hit, replaying logs`, `Cached: 135 cached,
      135 total`, `>>> FULL TURBO` in 2.965 s**, Cloud Run logs 136 GET→200. Token masked (`***`).
- [x] AC8 — post `pulumi up prod`: post-up preview empty; provenance row = chain-tip SHA; projected
      monthly cost delta ≤ $15. **PROVEN** — post-up preview `172 unchanged` ✓; delta ≈
      $0–2/mo ✓; provenance row `prod:ead193c92e…` read-back verified with 10 digests ✓.
- [x] AC9 — universal phase-gate: verification green; new behaviour has a failing-if-removed test;
      REQ ids stamped; unverifiable items are DEFERRALS rows; ADRs for owned decisions; BUILD_INDEX +
      LEDGER advanced. **PROVEN** — `turbo build lint typecheck` 135/135; `pnpm test` 4406 pass /
      4 skip; licenses OK (745 pkgs, incl. MIT `turborepo-remote-cache`); protocol-markers OK; every
      new behavior carries a removal-catching test (runbook-completeness, cloudbuild, turbo-cache,
      collab role census).

## Live drift captured at base (pre-change `pulumi preview --diff --stack prod`, 2026-10-03T22:3xZ — READ-ONLY)

- `warning: Undefined value (alloydbCluster) will not show as a stack output.` — index.ts:318 exports
  `data.alloydbCluster?.name` unconditionally → undefined on Cloud SQL prod.
- `- scaling {manualInstanceCount:0, minInstanceCount:0, scalingMode:""}` delete-diff on **all 7**
  `cloudrunv2.Service` resources (api, web, worker, collab, fetcher, export, convert-svc): the
  **service-level** `scaling` block the provider reads back (template-level `template.scaling` is
  what the program manages). Live `gcloud run services describe` confirms the API field is inert
  (`scaling: null` on the wire — the provider materializes the zeroed block on refresh).
- `+- gcp:secretmanager/secretVersion rhema-prod-app-database-url-v1 REPLACE — secretData:[secret]→[secret]`:
  `secretData` is write-only (the GCP `get` path cannot return it), so a refresh marks it stale and
  every preview since the last refresh wants a replace. The `RandomPassword` is stable in state, so
  the rewrite would carry identical bytes — but it is still a `replace` (and a rotation footgun).
- Totals: `~7 update · +-1 replace · 152 unchanged`.

## Plan (Phase 1)

1. `infra/pulumi/index.ts` — engine-gated stack outputs via conditional `exports` writes
   (CJS module): `alloydbCluster`/`cloudSqlInstance` emitted only when the resource exists.
2. `infra/pulumi/compute.ts` — `ignoreChanges: ["scaling"]` on every `cloudrunv2.Service` (the
   service-level readback field the program deliberately does not manage; template.scaling is the
   managed surface) — declared unmanaged, preview quiet.
3. `infra/pulumi/index.ts` — `ignoreChanges: ["secretData"]` on prod's program-written
   `app-database-url` SecretVersion (immutable-by-design; refresh must never plan a replace).
   Non-prod versions keep full management (a rotated RandomPassword there SHOULD propagate).
4. Collab adoption — equivalent no-op on prod: the SEC.1/OPS.1 mechanism already provisions
   `rhema-prod-collab-database-url` (ALL_SECRET_IDS) + the secretKeyRef mount + fresh-stack
   `ALTER ROLE` (worker `migrate.ts`). Prod's hand state (STB.1 LOGIN + the operator-seeded SM
   version + the `rhema:collabDatabaseUrl` config) is documented in `PROD-BRINGUP.md` §2/§11 and
   `Pulumi.prod.yaml`; **no program change on prod ⇒ preview shows zero change** (adopted as-is;
   role attrs verified read-only over the IAP tunnel; DSN parity vs the config verified by hash).
   The deterministic half lands in `rls-catalog.test.ts`: after the fresh-stack `ALTER ROLE …
   LOGIN`, `rhema_collab` is LOGIN + NOBYPASSRLS + NOSUPERUSER + NOINHERIT with exactly the pinned
   grant map (0004 + 0028 + 0053 + 0054).
5. `infra/config/runbook-completeness.test.ts` — every `rhemaConfig.get*`/`new pulumi.Config("rhema")`
   key read in `infra/pulumi/*.ts` must appear documented in `infra/PROD-BRINGUP.md` (`rhema:<key>`).
6. `infra/cloudbuild/image-set.yaml` — ONE committed parameterized definition (`_SERVICES`
   comma-list, `_AR`, `_TAG`, `_GIT_SHA`); replaces the scratch subset files. Root `cloudbuild.yaml`
   is superseded by it (single source; §2b updated). `infra/config/cloudbuild.test.ts` pins the
   default service set == the deployed image set + api/web `GIT_SHA` args + options.
7. `infra/pulumi/cache.ts` — `rhema:deployTurboCache` flag: scale-to-zero `cloudrunv2.Service`
   (`ducktors/turborepo-remote-cache` pinned digest, `STORAGE_PROVIDER=google-cloud-storage`),
   `rhema-<stack>-turbo-cache` bucket (30-day lifecycle delete), `turbo-cache-token` container via
   `extraIds` + program-written version (RandomPassword), token mounted secretKeyRef, `allUsers`
   invoker (auth = the bearer token, in-app). Prod yaml sets the flag. `turbo.json` gains
   `remoteCache.signature:true`. LICENSES.md records MIT.
8. Cost readout — billing account access probed (`gcloud billing …`); the bill sourced from the
   Cloud Billing export/console if reachable, else the live resource inventory × Cloud Billing
   Catalog list prices (named source) + a D-row for the operator's report. `gcp.billing.Budget`
   only if IAM allows.
9. ADR-081 (cache server + placement), ADR-082 (measured cost posture + recommendation); adr-index
   regen.
10. Stage B — `pulumi preview` (quiet drift-fix diff + cache creates) → `pulumi up prod` → post-up
    preview EMPTY → `record-deployment.mjs` (chain-tip SHA) → CI vars/secrets via `gh` (or
    D-OPS.2-n) → two same-SHA CI runs for cache-hit evidence → DEFERRALS flip D-P0.01-4 → closeout.

## Test matrix

| # | Behavior | Test | Kind |
|---|----------|------|------|
| 1 | `rhema_collab` post-fresh-stack-ALTER: LOGIN, NOBYPASSRLS, NOSUPERUSER, NOINHERIT | `rls-catalog.test.ts` new `it` | unit (PGlite) |
| 2 | `rhema_collab` grant map == pinned 0004+0028+0053+0054 set exactly | same | unit (PGlite) |
| 3 | runbook completeness: every `rhema:*` key read in infra/pulumi/*.ts documented in PROD-BRINGUP.md; fails on a planted undocumented key | `infra/config/runbook-completeness.test.ts` | unit |
| 4 | cloudbuild definition: default `_SERVICES` == deployed image set; api/web carry `GIT_SHA` build-arg; rejects unknown service; options/timeout pinned | `infra/config/cloudbuild.test.ts` | unit |
| 5 | stage facts unchanged (prod still cloudsql/zonal/REQUIRED set byte-identical — cache container via extraIds) | `stages.test.ts` (existing) | unit |
| 6 | turbo.json `remoteCache.signature` enabled | pinned in cloudbuild/runbook test or grep | unit |
| 7 | live: prod preview 0/0/0 + no alloydbCluster warning (post-up) | `pulumi preview --stack prod` | live |
| 8 | live: collab role attrs on prod (LOGIN, NOBYPASSRLS) + DSN config/SM parity hash | IAP tunnel `pg_roles` read | live, read-only |
| 9 | live: cache service answers `/v8/artifacts/status` + CI remote-cache hits ×2 runs | curl + `gh run view` | live |
| 10 | live: provenance row = chain-tip SHA | `record-deployment.mjs` + psql read | live |

## Cost readout (`scripts/live/billing-read.mjs`, 2026-10-03; list-price recomputation — the export dataset is empty)

Source: Cloud Billing Catalog API list prices × the live `rhema-507501` inventory (named above;
**not** actuals — `billingAccount="18CB8-…"` in Pulumi.prod.yaml is a typo for `018CB8-…`, the
console-observed account; the project-level `billingAccountName` field the script needs returns nil
→ D-OPS.2-1 for real billing-account IAM + a re-run against actuals). A second defect found in-flight:
the Catalog API's `baseUnitConversionFactor` was double-multiplied on the first run (absurd totals);
fixed — conversion now divides, matched-SKU needles narrowed (CUD/regional variants excluded).

| Line | Inventory fact | List $/mo |
|------|----------------|-----------|
| **Cloud Run warm floor (9 svc)** | 7 svc `minScale=1`; `convert-svc` + `worker` `cpuIdle=false` (instance-based) | **$152.28** — convert-svc $51.84, worker $51.84, api/collab/export/fetcher/web $9.72 ea, ops-alert + turbo-cache min=0 → $0 |
| Memorystore Redis | Basic M1, 1 GiB | $35.77 |
| GKE run-task node | e2-medium ×1 + 100 GB pd | $28.46 |
| Cloud SQL `rhema-prod-postgres` | db-g1-small zonal + 10 GB SSD + backups | $28.05 |
| HTTPS LB | 1 forwarding rule + ~20 GB | $18.41 |
| Proxy MIG | e2-small ×1 + 10 GB pd | $12.63 |
| External IPv4 | 2 in-use | $7.30 |
| Cloud NAT | 1 gateway + ~5 GB | $1.25 |
| Artifact Registry | ~8 GB | $0.75 |
| Secret Manager | 16 versions, 6 free | $0.60 |
| GCS | ~15 GB standard | $0.30 |
| GKE cluster mgmt | free-tier exempt | $0.00 |
| **TOTAL** | | **$285.80/mo list** (target ~$50 · documented floor ~$95) |

### Ranked levers ($/mo, feasibility) — execution deferred to D-OPS.2-2 (canonical list: ADR-082)

1. **`convert-svc` cpuIdle=false → request-based min=1** — **−$44/mo**. Keeps one warm instance at
   the idle rate; SLO risk is cold-CPU, not cold-instance (§13.5 20 s preview SLO re-check).
2. **`export` + `fetcher` minScale 1→0** — **−$19.4/mo**. Internal services, cold start tolerable.
3. **`api`/`collab`/`web` minScale review** — **−$29/mo** if all zeroed (user-facing latency —
   the most SLO-sensitive lever).
4. **`worker` right-size 1 vCPU/1 GiB → 0.5 vCPU/512 MiB** — **−$26/mo** (queue throughput risk —
   needs a soak, not a guess).
5. **HA levers (plan-only, forbidden in OPS.2):** Cloud SQL REGIONAL +$25.55; STANDARD_HA Redis
   +$35.77; proxy MIG ×2 +$12.2.
6. Cosmetic: IPv4 release −$3.6/addr; Artifact Registry cleanup ~−$0.5.

### HA pre-plan (REQ-ARCH-28; plan-only this ticket — D-OPS.2-2)

- **Cloud SQL → REGIONAL** (+$25.55/mo): `stages.ts` prodFacts `ha: true` → `sql.ts`
  `availabilityType: REGIONAL`; Pulumi performs an in-place HA conversion (no replace, minutes of
  failover). **Backups + PITR carry over unchanged** — verify `gcloud sql backups list` post-cutover.
  Rehearsal: `gcloud sql instances failover rhema-prod-postgres` in the maintenance window +
  §13.5 probe check. Documented as PROD-BRINGUP §12c.
- **Redis → STANDARD_HA** (+$35.77/mo): `tier: STANDARD_HA` on the same capacity — in-place tier
  change, brief replica-promotion blip; sessions ride it out via Better-Auth refresh.
- **Proxy MIG ×2** (+$12.2/mo): `targetSize: 2` + `distributionPolicy` across zones — SSH/IAP path
  gains zone redundancy; no data plane.

**Posture call (ADR-082):** the *warm floor* — Cloud Run $152 + Redis $36 + GKE $28 + Cloud SQL
$28 + LB+NAT+IPs $27 ≈ **$271/mo** — is the real floor, not ADR-010's ~$95 estimate; the $50 target
is unreachable without cold-starting prod's state or cutting the warm legs (levers 1–3 get to
~$196; still not $50). Recommendation: the $50 budget alert is the compensating control while
D-OPS.2-1 actuals reconcile; lever execution is the follow-on ticket.

## Progress

- [x] Phase 0 — context map complete; base preview drift captured (above); live gcloud/pulumi confirmed.
- [x] Phase 2 — implementation. Deviations from plan: cache module is `infra/pulumi/turbo-cache.ts`
      (not `cache.ts`); **no `deployTurboCache` flag** — deployed uniformly on every stack (the service
      is scale-to-zero + stateless; a flag would add per-stack drift surface, and prod's is the only
      cache anyone points at); `remoteCache.signature` considered → not enabled (recorded in ADR-081);
      `apps/turbo-cache` wraps the pinned upstream image (lockfile-carried integrity) rather than
      pinning a digest directly; budget created via `gcloud` then adopted by `billing.ts` (Pulumi
      lacks a billing-budgets create-only path for an existing budget — preview diff showed zero
      drift on the codified resource).
- [x] Phase 3 — self-review.
- [x] Phase 4 — gap analysis (below).
- [x] Phase 5 — verification + Stage B (evidence log below).
- [ ] Phase 6 — PR + closeout.

## Gap table

| Spec clause | Interpretation | Resolution |
|-------------|----------------|------------|
| "adopted into SEC.1's role mechanism" | Import prod's hand-applied role/secret into Pulumi state vs keep program-declared | The SEC.1 mechanism is *code*, not state: the role ALTER runs in `worker migrate.ts` (fresh stacks) and the secret container is program-declared. Prod's hand state == program-declared desired state ⇒ adoption is a verified no-op + catalog test, NOT a `pulumi import` (importing a resource the program doesn't declare would be an unmanaged-resource footgun). DSN parity verified by hash over the IAP tunnel. |
| "reproduces the digest set" | Rebuild every service and byte-compare | Prohibitive (8 image rebuilds). Proven live on the `turbo-cache` subset (Cloud Build 9b2d150b success + serving image); the remaining 8 services' digests are pinned in `stages.ts` prodFacts and the definition's whitelist == those services — a rebuild to new digests would be a deliberate ops step. Recorded as interpretation, not silently skipped. |
| "billing export/console if reachable" | `sig_billing_export` dataset | Dataset EXISTS (`zeta-medley-508121-u7:sig_billing_export`) but is EMPTY — export configured, no rows landed; and the billing account id needed a typo fix (`18CB8` → `018CB8`). Recomputation used instead; actuals reconciliation = D-OPS.2-1. |
| "CI's existing TURBO_API/TURBO_TOKEN" | `gh secret set` needs repo admin | Check whether gh auth has admin scope at closeout; else D-OPS.2-3. |
| `TURBO_API` URL shape | turborepo-remote-cache serves `/v8/artifacts/*` | `TURBO_API` = service URL origin; turborepo appends the v8 paths itself. Verified live via status + artifact roundtrip. |

## Evidence log

- `pulumi preview --stack prod` (pre-up, 2026-10-03): `+9 create · 160 unchanged` — the 9 creates are
  exactly the turbo-cache module (bucket, SA, secret+version, random token, 2 IAM, service,
  invoker); ZERO update/replace/delete; NO `alloydbCluster` warning.
- `pulumi up --stack prod` (2026-10-03): 9 creates applied; `turboCacheUrl` =
  `https://rhema-prod-turbo-cache-9a75e3a-tkbl73n3tq-uc.a.run.app`. Spend delta ≈ $0–2/mo.
- `pulumi preview --stack prod` (post-up): `172 unchanged`, zero diffs, zero warnings. **AC4/AC8.**
- Live cache probe (2026-10-03): unauth GET `/v8/artifacts/status` → 200 (status endpoint is
  unauthed by design); artifact PUT without token → rejected; PUT + GET roundtrip with token → 200;
  `gsutil` showed the smoke object under `gs://rhema-507501-turbo-cache-prod/` (removed after).
- Live collab probe via IAP tunnel through the proxy MIG (2026-10-03): `tunnel-ok`;
  `rhema_collab` = LOGIN + NOBYPASSRLS + NOSUPERUSER + NOINHERIT, exactly the pinned grants;
  SM `rhema-prod-collab-database-url` secretData hash == `rhema:collabDatabaseUrl` config hash
  (adoption parity, values never printed). **AC1 live half.**
- `turbo build lint typecheck` — 135/135 tasks green (remote cache disabled for the run: env unset).
- `pnpm test` — 4406 passed / 4 skipped (1 skipped file) across the workspace; infra-focused batch
  68/68 including runbook-completeness 3/3, cloudbuild 5/5, turbo-cache module tests, rls-catalog
  collab row.
- `pnpm check:licenses` — 745 packages OK; `pnpm check:protocol-markers` — 54 public files, clean.
- Cloud Build `9b2d150b…` (`_SERVICES=turbo-cache`, chain SHA): SUCCESS; image
  `us-central1-docker.pkg.dev/rhema-507501/rhema/turbo-cache:<sha>` pushed + deployed by the up.
- Budget live + codified: `rhema-prod — $50/mo posture alert` on `018CB8-639CF9-C243C7`, thresholds
  0.5/0.9/1.0 — gcloud-described shape == `billing.ts`; preview zero-diff.
- Provenance (2026-10-03, `ead193c`): SSH-forward through the proxy MIG (`-L 15432:10.46.0.3:5432`),
  privileged `workerSystemDatabaseUrl` DSN (`app-database-url` role fails `42501` on `deployments`
  by design — 0045); `record-deployment.mjs` → row read-back verified `prod:ead193c92e…`,
  `protocols_version=0.4.0+ec61156725a895ab`, 10 digests incl. turbo-cache.
- CI wiring: `vars.TURBO_API` + `secrets.TURBO_TOKEN` set via `gh` (repo-admin present; the
  workflow reads a *variable* for the URL — a mistakenly-created secret was deleted).
- CI same-SHA pair (run `37161289562`, `ead193c`, PR #103): attempt 1 `Cached: 0/135`
  (misses; PUT→200 in cache logs) → attempt 2 **`Cached: 135/135`, `>>> FULL TURBO` 2.965 s**;
  Cloud Run access logs 136 GET→200. **AC7.** Note: the run's `public-safe`/`integration` jobs
  fail on **inherited chain red** identical to the OPS.1 base PR's CI (`check:no-cookies` on
  `apps/web/src/server.ts` — untouched by this diff; `privsep.docker.test.ts` EACCES leg). A
  docs-only closeout push (`d119f41`) cancelled attempt 2's later jobs via ci-concurrency but
  also produced the same-SHA-pair evidence unaffected.

## Stage B remainder (live legs at closeout)

- ~~`record-deployment.mjs` provenance row~~ — **DONE 2026-10-03T23:1xZ.** SSH local-forward through
  the proxy MIG (`gcloud compute ssh rhema-prod-proxy-c519 --tunnel-through-iap -- -L
  15432:10.46.0.3:5432`), privileged `workerSystemDatabaseUrl` DSN (the `app-database-url` role has
  `deployments` revoked by 0045 — first attempt failed `42501` as designed; the operator DSN is the
  correct path per PROD-BRINGUP §8). Row verified by read-back:
  `prod:ead193c92e36cb1b0b1c85ef52a68f6c0068016c` · `protocols_version=0.4.0+ec61156725a895ab` ·
  10 image digests incl. `turbo-cache@sha256:b62a2863…`. **AC8 provenance leg PROVEN.**
- ~~`gh` repo-admin scope~~ — **present.** `secrets.TURBO_TOKEN` set (from SM, never printed);
  `vars.TURBO_API` set (a *variable* per ci.yml, not a secret — the mistaken secret was deleted).
  No D-OPS.2-3 needed.
- ~~2 same-SHA CI runs~~ — **DONE.** `>>> FULL TURBO` evidence above.

## Evidence report

| Claim | Kind | Where |
|-------|------|-------|
| Collab adopted as-is (role + DSN + secret), no rotation | live probe + program no-op + PGlite census | Evidence log; `rls-catalog.test.ts` |
| Runbook documents every `rhema:*` key (26) | deterministic test | `runbook-completeness.test.ts` |
| Quiet prod preview 0/0/0 + no warning | live preview, before + after up | Evidence log |
| One committed parameterized image-build def | test + live Cloud Build success | `image-set.yaml`, `cloudbuild.test.ts`, build 9b2d150b |
| Measured bill $285.80 list, gap +$235.80 / +$190.80 | live inventory × Catalog API | § Cost readout, `billing-read.mjs` |
| HA pre-plan + ranked levers | plan-only docs | § Cost readout, ADR-082 |
| $50 budget alert live + codified | live `gcloud` + preview zero-diff | `billing.ts`, Evidence log |
| Self-hosted cache live, token-gated, scale-0, ≤$15 delta | live probes + post-up preview | `turbo-cache.ts`, Evidence log |
| ADR-081/082 + index regenerated | files | `docs/adr/` |
| CI remote-cache hits ×2 same SHA | **live-verified** — `135/135 FULL TURBO` attempt 2, run 37161289562 | Evidence log |
| Provenance row @ chain-tip SHA | **live-verified** — `prod:ead193c92e…` + `0.4.0+ec61156725a895ab` | Stage B remainder |

## Cost-ledger note

Round-3 cumulative entering ~$70.95; this run spent $0 inference + ≈$0 GCP delta (scale-to-zero
service idle, free budget, empty dataset read). No stateful resource was replaced or deleted; the
only billable additions are idle-floor cache service + a ~empty GCS bucket + 1 secret — all inside
the ≤$15/mo authorization.
