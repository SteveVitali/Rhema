# PRB.15 — Prod bring-up: the `prod` stage profile, the Pulumi prod stack, and the operator-gated deploy

> **Amended 2026-09-17:** the operator controls the **`rhema.tools`** zone only — `rhema.app` and
> `rhemausercontent.com` are NOT available and never will be. The prod serving surface is therefore:
> app on the **`rhema.tools` apex**, api on **`api.rhema.tools`**, the cookieless user-content origin
> on **`usercontent.rhema.tools`** (+ the `*.usercontent.rhema.tools` wildcard). "DNS control" below
> means the one `rhema.tools` zone. The cookie-isolation half of the old separate-domain scheme is
> preserved by construction instead of by TLD split: the user-content origin emits NO cookies and
> every auth cookie is host-only `__Host-`-prefixed (`apps/api/src/auth.ts`, unit-asserted by
> `auth.test.ts`), so a `Domain=rhema.tools` plant from a sibling subdomain can neither shadow nor
> receive session material.
>
> **Amended 2026-09-17 (same date, second note): prod's database engine is Cloud SQL for
> PostgreSQL, not AlloyDB** — the operator's ~$50/mo prod budget cannot carry AlloyDB's ~$270/mo
> minimum warm primary; §12's provider table already called Cloud SQL "the simpler swap". Read every
> "prod AlloyDB" below as "prod Cloud SQL": the stage facts now carry `database.engine`
> (`alloydb` on dev/preview — dev's live cluster is untouched; `cloudsql` on prod), prod runs a
> warm `db-g1-small` (the minimal prod-ready shared-core tier — `db-f1-micro` is too thin), private-IP
> on the SAME PSA peering, 35 daily automated backups + 7-day PITR (Cloud SQL's cap), deletion
> protection on. Companion prod cost posture: **zonal** Standard GKE + **one on-demand e2-medium**
> node (Spot stays a lever, never the default — run pods must not be preempted), **smallest
> Memorystore BASIC** Redis (not re-architected), egress-proxy MIG **×1** (fail-closed, not
> fail-open). `ops-alert-webhook-url` is provisioned but **no longer prod-required** (no alert
> destination exists — the worker's alert path stays inert until one is seeded). The canonical api
> key is `rhema:appDatabaseUrl` (`apiDatabaseUrl` still reads as a fallback). ADR-010 records the
> decision; the runbook's AlloyDB prerequisites/steps are reworded to Cloud SQL + `cloud-sql-proxy`.
> Stage B remains operator-gated — nothing live has run.
>
> **Amended 2026-09-17 (Stage B live): the `*.usercontent.rhema.tools` wildcard is dropped.** The
> first `pulumi up prod` proved the runbook's flagged constraint: `ManagedSslCertificate` rejects
> wildcard SANs (`400 Wildcard domains not supported`). The pre-authorized fallback applied — cert
> SAN, URL-map host rule, and DNS record all drop the wildcard; user content serves from the bare
> `usercontent.rhema.tools` host. Per-workspace content hosts are future scope (Certificate Manager +
> DNS authorization).

> **Amended 2026-09-17 (Stage B executed — outcome):** the live bring-up ran end-to-end on
> `rhema-507501`/`prod` — 107 resources converged, all 9 images built + digest-pinned, the 11
> required secrets seeded, 24/24 migrations + `essay v1` on prod Cloud SQL (via an IAP/SSH tunnel —
> the instance is private-IP-only), the `deployments` row (`prod:3d538e9…`,
> `protocols_version=0.4.0+64cbeef137b090c2`) and the provider-verification row written, and the
> sandbox's fail-closed egress proven on the wire (`api.anthropic.com` blackholed; the proxy answers
> `egress.denied` to uncredentialed requests). Three more live-surfaced defects were fixed en route:
> Cloud SQL's new ENTERPRISE_PLUS default (`edition: "ENTERPRISE"` pinned), the LB→serverless-NEG
> path needs `roles/run.invoker`/`allUsers` on `web`+`api`, and the proxy MIG re-assigns ephemeral
> IPs on every template roll (a reserved internal `Address` is now pinned as the template's
> `networkIp`; `proxyBaseUrl` is `http://` — the proxy serves plain HTTP). **What remains before
> this ticket closes: the operator applies the three `dnsRecords` A records at the registrar → the
> managed cert leaves PROVISIONING → the `*.rhema.tools` smoke legs re-run** (TLS root, api
> `/healthz`, usercontent no-cookie, cert ACTIVE). `/api/auth/*` 404s are by design — Better Auth is
> unmounted (D-P0.01-3 → PRB.16), so the `__Host-` cookie smoke runs there.

- **Sequence:** inserted — runs **after `28e_PRB.14`, before `28g_PRB.16`**. Sorts as `28f`
  (prod-launch round; § Plan extensions, **ADR-008**).
- **Phase:** LV — prod launch (the deploy itself).
- **base_branch:** current checkout (stacked PR chain)
- **Depends on:** PRB.13 (the open-signup surface the prod web image ships), PRB.14 (the
  resilience/cost wiring the prod worker runs), **HUMAN-H6** (domains, GCP footing, secrets, the
  Stripe answer — surface as a hard blocker if absent), and every PRB ticket (the image set).
- **Run:** `implement-spec spec=docs/tickets/28f_PRB.15__prod-bringup.md`
- **Gate status:** HUMAN-H6 prerequisites must hold before Stage B; a missing one is a hard
  blocker, never guessed past. **DISCHARGED 2026-09-17** — the operator's answers are recorded in
  `docs/build/LEDGER.md` GATE DECISIONS (five `28f_PRB.15` rows): GCP footing = `rhema-507501` +
  a separate `prod` Pulumi stack (us-central1; ADC + Pulumi backend verified); prod secrets =
  sourced-per-plan (5 copied dev→prod, 3 generated fresh, 3 placeholders whose dependent legs defer
  to PRB.16/PRB.17 — `provided: no` for `stripe-webhook-secret`/`resend-api-key`/
  `anthropic-admin-key`); DNS = operator-controlled `rhema.tools` at the registrar (no Cloud DNS
  zone — the agent emits `dnsRecords`, the operator applies them); budget = ~$50/mo target
  authorized (honest always-on floor ~$95/mo documented; the stage facts implement the cheapest
  prod-ready shape); Stripe = **test mode** (PRB.17's real-money leg runs test-mode; its live leg
  self-defers). The Stage-B [OPERATOR GATE]s in this ticket and `infra/PROD-BRINGUP.md` are
  discharged by those answers.
- **Live stage:** **operator-gated** — Stage A is offline (IaC + runbook, no spend); Stage B is
  real GCP spend (`pulumi up prod`, prod AlloyDB kept warm).

> **Read this banner first — like the P0.15b…k tickets this is a two-stage ticket.** Stage A is an
> offline, PR-able construction stage (the prod stage profile, the prod Pulumi stack config, the
> domains/DNS/TLS wiring, the image-set completeness check, the seed/migration runbook, the
> deploy-provenance binding — all typecheck/test-verifiable, NO spend). **Stage B is [OPERATOR
> GATE]d** (a stated prod budget; prod AlloyDB is kept warm — dearer than dev's ~$1/hr) and is where
> `pulumi up prod`, the prod migrations, the smoke checks, and the D-P0.13-2 provider-verification
> write actually run. **The autonomy contract is modified exactly as in P0.15c–i: STOP for explicit
> operator authorization at each [OPERATOR GATE], and surface — never guess past — any missing
> prerequisite (a domain, a secret, the GCP footing, the Stripe answer, the budget).**

## Operator prerequisites (the agent cannot create these — HUMAN-H6; hard blockers if absent)
- **GCP prod footing** — a dedicated prod project **or** `rhema-507501` with a `prod` stack
  (`rhema-prod`); billing; ADC + a reachable Pulumi backend.
- **Prod secrets in Secret Manager** (H6 checklist): Anthropic key, RS256 run-token key, AlloyDB
  password, Better Auth secret, Google OAuth client, Resend key, Stripe secret + `whsec_…`,
  `ANTHROPIC_ADMIN_KEY_SECRET`, `OPS_ALERT_WEBHOOK_URL`. Names only — no value in any ledger.
- **DNS control** of `rhema.app` + `rhemausercontent.com` to finish the LB/CDN cutover.
- **A stated prod budget** — prod AlloyDB stays warm (§13.2); per-run `max_usd` guards; no
  [OPERATOR GATE] runs outside an authorized budget.

## Goal
Take the deterministically-proven + dev-proven system to **prod**: author the `prod` stage profile
and Pulumi stack, wire the real domains + TLS, verify the full image set, write the prod
seed/migration runbook, bind deploy provenance — then, under operator authorization, `pulumi up
prod`, run the migrations on prod AlloyDB, smoke the stack, and record the D-P0.13-2 provider
verification on the prod DB (the operator attestation is already captured). This is the deploy the
golden-path (`28g_PRB.16`) and billing (`28h_PRB.17`) legs run against.

## Load
- `infra/config/stages.ts` (the stage-fact model + its tests; §13.2 stage semantics — prod keeps
  the AlloyDB primary warm), `infra/pulumi/` (the whole program — dev is already proven live; prod
  is a new stack config + the prod-grade deltas), `infra/pulumi/README.md` (the deploy runbook the
  dev bring-up proved), `infra/k8s/` (the runs namespace + NetworkPolicy + `apply.sh` post-`up`
  step).
- `.github/workflows/ci.yml` `images` job + `scripts/record-provenance.mjs` +
  `scripts/compute-protocols-version.mjs` (the real `PROTOCOLS_VERSION` PRB.14 wires — prod stamps
  it).
- **`docs/tickets/DEFERRALS.md`** rows this ticket reconciles/closes: **D-P0.01-1** (the deploy
  AC — prod is the full-stack `up` it names; dev already proved the mechanics), **D-P0.01-7**
  (SST→Pulumi/GCP rewrite — its verify is a `pulumi up`; prod completes it), **D-P0.15b-1** /
  **D-P0.15c-1** (the full-deploy operator-gate rows — the prod `up` is the same act on the prod
  stage; flip with prod evidence), **D-P0.07-4** (the real egress-proxy image — verify the
  production Dockerfile still serves, not the P0.01 sleeper), **D-P0.04-2** (the live provenance
  stamp — PRB.14 lands the CI half; the prod deploy records it), **D-P0.13-2** (the
  `recordProviderVerification` write on the prod DB — operator-attested `termsRef` captured in
  `16_P0.15d` § Operator authorizations; **insert the authorized row verbatim — never invent or
  alter it**).
- Spec §13.1–13.5 (GCP services, stage semantics, SLOs), §12.1 (reference architecture),
  REQ-ARCH-1/2/30/31/38/39.

## In scope — Stage A (offline, no spend; ends in a reviewable PR; one implement-spec session)
1. **The `prod` stage profile** in `infra/config/stages.ts` — prod facts (AlloyDB primary kept
   warm, real domains, prod secret names, `signup.mode: 'open'` for the prod web/api per PRB.13's
   flag, prod `max_usd`/cap guards); unit-tested like the existing stages.
2. **The Pulumi prod stack config** — `Pulumi.prod.yaml` (+ the `rhema-prod` stack) against the
   existing program; `pulumi preview` clean at run time is a Stage-B step, but the config +
   program deltas are authored + `tsc --noEmit`-clean now.
3. **Domains/DNS/TLS wiring** — the prod web (`rhema.app`), api, and the cookieless
   `*.rhemausercontent.com` serving origin on the HTTPS LB + Cloud CDN with managed certs; the DNS
   records the operator applies are emitted by the runbook.
4. **The full image set** — confirm every service's production Dockerfile is real (api, web,
   worker, egress-proxy, run-task, fetcher, convert, export; collab if the beta ships it): rebuild
   any remaining placeholder (D-P0.07-4 names the egress-proxy — verify it is the real
   `createProxyServer` image, not the sleeper), and the `cloudbuild`/images loop covers the prod
   set, digest-pinned, provenance-stamped with the real `PROTOCOLS_VERSION`.
5. **The prod seed/migration runbook** — `applyMigrations` (0001…current) on prod AlloyDB; what
   prod seeds (the Essay protocol body via `seedProtocols` — **not** the dev sample projects);
   the `infra/k8s/apply.sh` post-`up` step; teardown/rollback notes.
6. **Deploy-provenance binding** — the prod deploy records provenance with the real
   `PROTOCOLS_VERSION` + image digests (REQ-ARCH-39; PRB.14 lands the CI half).

## In scope — Stage B ([OPERATOR GATE]d; the live execution)
7. **[OPERATOR GATE — prod deploy + budget] `pulumi up prod`.** Stand up the full prod stack
   (AlloyDB **warm primary**, GKE + sandbox node pool, Memorystore, GCS, Secret Manager, Cloud Run,
   the HTTPS LB + CDN, the no-egress sandbox + the proxy as its only egress). Run the
   `infra/k8s/apply.sh` post-step. Assert the sandbox-subnet facts on the live prod network (no NAT
   / no default route / egress only to the proxy — the D-P0.01-2 assertion pattern).
8. **Prod migrations + seed.** `applyMigrations` + `seedProtocols` on prod AlloyDB per the runbook;
   confirm the schema version + the Essay protocol row.
9. **Smoke checks.** Health/readiness on every Cloud Run service; TLS + the managed certs live;
   the web serves on `rhema.app`; the api answers; the worker consumes the queue; the proxy is the
   sandbox's only egress on the wire.
10. **[OPERATOR GATE — writes the legal attestation row] Record D-P0.13-2 on prod.** After the DB
    is up: `recordProviderVerification(exec, deps, { provider: "anthropic", termsRef:
    "https://www.anthropic.com/legal/commercial-terms", verifiedAt: <2026-09-03> })` — the
    operator-attested `termsRef` captured in `16_P0.15d` § Operator authorizations, inserted
    **verbatim**; assert `providerTransmissible("anthropic", now)` is true on prod. Never invent or
    alter the termsRef.
11. **Close the rows.** Flip every row this ticket genuinely proves (the list under Load) to DONE
    with the prod evidence; leave any not-proven row OPEN with a dated note.

## Out of scope
- Driving a real user journey / the live surface legs — `28g_PRB.16` (golden-path verification).
- The billing/money legs — `28h_PRB.17` (the Stripe purchase, the Usage & Cost reconcile, the
  alert webhook, the admin CLI).
- `dev`-stack changes (dev stays as-is; prod is a separate stack/project per H6's decision).
- The benchmark/enclave/pilot rows beyond the single D-P0.13-2 write (H2/G2-scoped — stay OPEN).
- Teardown scheduling/ops policy (cost watch is the operator's; the runbook notes the warm
  AlloyDB).

## Acceptance criteria
- [ ] **Stage A, offline:** `stages.ts` carries a tested `prod` profile (warm AlloyDB, real
      domains, `signup.mode: 'open'`, prod secret names, prod guards); `Pulumi.prod.yaml` +
      program deltas `tsc --noEmit`-clean vs `@pulumi/gcp@8.41.1`; the DNS/TLS/origin wiring is
      authored; every prod Dockerfile is real (no sleeper); the seed/migration runbook + the
      `infra/k8s` post-step are written. *(deterministic — `stages.test.ts` + `tsc` + doc review)*
- [ ] `pulumi up prod` stands the full stack up; the sandbox subnet has no NAT/default route and
      egresses only to the proxy — asserted on the live prod network. *(live — Stage B)*
- [ ] Migrations + `seedProtocols` run green on prod AlloyDB; the schema version + Essay protocol
      row confirmed. *(live — Stage B)*
- [ ] Every Cloud Run service healthy; TLS live on `rhema.app` + `*.rhemausercontent.com`; the api
      answers; the worker consumes; the proxy is the sandbox's only egress. *(live — Stage B)*
- [ ] `recordProviderVerification` written on prod with the attested `termsRef`;
      `providerTransmissible("anthropic", now)` true (D-P0.13-2). *(live — Stage B)*
- [ ] Deploy provenance on prod carries the real `PROTOCOLS_VERSION` + image digests (D-P0.04-2's
      live half). *(live — Stage B)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement
      ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its
      compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md`
      row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-ARCH-1/2 (GCP services + the sandbox no-egress), REQ-ARCH-26/27/28/29 (the deploy shape),
REQ-ARCH-30/31 (secrets), REQ-ARCH-38 (stage isolation — prod is its own footing),
REQ-ARCH-39 (provenance), REQ-EVAL-3 (the D-P0.13-2 write consumes the attestation),
§13.1–13.5.

## Cross-cutting invariants — re-check on the LIVE system
- The sandbox subnet provably egresses only to the proxy (assert on the wire, not from config).
- Secrets never in the repo/ledger — Secret Manager names only.
- Money: no [OPERATOR GATE] step runs outside the stated budget; prod spend is surfaced honestly.
- See 00_MANIFEST.md § Cross-cutting invariants.

## Notes
Dev already proved the whole `pulumi up` path end-to-end (P0.15b→k) — prod is the same program
with the prod stage facts; expect IAM/DNS/cert iteration, not architecture. The Stripe live-mode
answer (H6) does **not** gate this ticket — it gates `28h_PRB.17`'s real-money leg only. The
provider-verification write is the operator's legal act recorded as a row; the agent inserts only
the authorized `termsRef`.
