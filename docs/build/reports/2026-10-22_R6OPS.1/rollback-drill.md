# R6OPS.1 — REQ-DEP-2(b): rollback drill on owned preview `pr-208` (2026-10-22)

Staging-verified on an owned `pr-<n>` stack (`rhema:owner=ops-preview`, guard-driven via
`scripts/live/preview-stack.mjs` — the sanctioned preview lifecycle path).

## Arms

| Arm | api+web images | gitSha | Evidence |
|---|---|---|---|
| **N** (drill build) | `rhema-pr-208/api@sha256:040bd1a8…`, `rhema-pr-208/web@sha256:4419c36…` (Cloud Build `8b9205ef`, tag `r6ops-1`, `_GIT_SHA=18b3dee`) | `18b3dee57bf8a57e2c9d6b036f1c4a014b39038c` | `/healthz/` on api+web → `"gitSha":"18b3dee…"`; live image digests match pins; **R1 journey PASS** (`rollback-N/report.json` — invite → magic-link → signup → SPA shell → project list; the runner's settle contract walks `data-nav-count`/`data-mounted`/document-load counters) |
| **N−1** (rollback target) | `rhema-prod/api@sha256:8159bc…`, `rhema-prod/web@sha256:1d4b5f…` (the `r6dep-1` `@dc7fb15` set) | `dc7fb15a0aa7caa5d47734656d06514d5b75b127` | `/healthz/` on api+web → `"gitSha":"dc7fb15…"` (provenance flips cleanly — the SHA is image-baked); live digests = prod pins; **R1 journey PASS** (`rollback-Nminus1/report.json`) |

Unchanged support services (worker/fetcher/convert/export/collab/turbo-cache) pinned at the
`r6dep-1` prod digests for both arms; `run-task` + `egress-proxy` at prod digests. Support
images pulled cross-repo from `rhema-prod` AR — same-project pull works (prod services pull the
same way); `docker tags add` is same-repo only and could not copy into `rhema-pr-208`.

## Timeline (UTC)

- 14:09Z — Cloud Build `8b9205ef` submitted (api+web at `18b3dee`, tag `r6ops-1`; custom `^;^`
  substitution delimiters after the comma-parsing failure on the first attempt)
- 14:14Z — build SUCCESS (3m5s); N digests recorded
- 14:16Z — first `up`: 62 resources, failed on the log-metric propagation race
  (`rhema_pr_208_route_5xx` — the documented ~10 min descriptor delay; retried)
- 14:26–14:37Z — second `up`: networking/PSA/Redis/GKE converged; AlloyDB instance hit a zonal
  capacity stockout (`Error code 9 — us-central1 insufficient resources`); retried
- 14:42–14:51Z — third `up`: AlloyDB created (383s); api revision failed startup —
  `database "rhema" does not exist` (migrate Job had not yet run — R6DEP.1 hit the identical
  ordering on pr-207)
- 14:55Z — migrate Job executed: schema applied (0035→0058) but exited 1 on the
  `image_digests.egress-proxy` validator — `rhema:proxyImage` unset → placeholder ref isn't a
  digest. Set `rhema:proxyImage` to the prod `egress-proxy` digest (new live-found gap vs the
  VERIF.2 recipe — pr-207's notes don't record it; recipe drifted since)
- 15:0xZ — `gcloud run deploy` forced fresh api revision 00002 → READY; `up` converged
  (web+worker+policies; two SLO policies hit the metric-propagation race — converged on retry)
- 15:1xZ — `seed-invite prv-208-test` via `rhema-pr-208-migrate-6a77639` (clean execution);
  `/api/auth/*` still 404 → missing `GOOGLE_OAUTH_CLIENT_ID` then `APP_BASE_URL`/`API_PUBLIC_URL`
  (F-VERIF.2-2 class gap: auth mounts only when all three + appBaseUrl resolve). Set
  `rhema:googleOauthClientId` + `rhema:appBaseUrl`/`rhema:apiPublicUrl` → api/web env rolled
- 15:13:01Z — **N verified**: `/healthz` = `18b3dee` (api+web, report-observed in
  `rollback-N/report.json` `provenance.observed`); **R1 PASS**
- 15:13:3xZ — rollback: `serviceImages` repinned to the `r6dep-1` set + `gitSha=dc7fb15`; `up`
  rolled api+web+migrate (42 s, 3 updates)
- 15:14:28Z — **N−1 verified**: `/healthz` = `dc7fb15` (api+web, report-observed in
  `rollback-Nminus1/report.json`); live digests = prod pins (`rhema-prod/api@8159bc…`,
  `rhema-prod/web@1d4b5f…`); **R1 PASS**
- 15:2x–15:5xZ — `destroy` pass 1: **144/193 removed**; the private subnet then sat
  `resourceInUseByAnotherResource` on the GCP-managed
  `serverless-ipv4-cloudrun-1792680586032522302` (+ `-…1772217786476`) reservation —
  Google-owned (`//serverless.googleapis.com/…`), manual delete correctly refused; the
  pr-206/pr-207 GC-lag class. Drain loop `destroy` every ~5 min.
- 17:24Z — **reservations GC'd (~2h19m)**; drain attempt 20 removed the final **49**
  (subnet, network, 12 secrets, 4 buckets, AR repo, health check, cert, logging metrics,
  IAM role) → `preview-stack.mjs rm pr-208` (stack + `Pulumi.pr-208.yaml` deleted,
  deletion committed)

## Verdict

**PASS** — deploy N, revert to N−1 by digest repin, provenance + marker contract verified on
both arms, clean teardown. The rollback primitive is exactly the prod recipe's Option A
(`docs/build/reports/2026-10-22_R6DEP.1/rollback-recipe.md`): config-repin + `pulumi up`, no
rebuild — measured wall time for the repin up ≈ 42 s plus Cloud Run revision settle.

## Incidents honestly recorded (drill-time, all recovered)

1. log-metric → AlertPolicy propagation race ×2 (documented in `monitoring.ts` — converge-on-retry)
2. AlloyDB zonal capacity stockout — retried, cleared in ~5 min
3. api-before-migrate ordering (same as R6DEP.1's (b)) — forced fresh revision after migrate
4. `rhema:proxyImage` unset → migrate's deployments-row validator exit(1) **after** schema
   applied — preview recipe drifted; a preview now needs `proxyImage` pinned or migrate fails
5. `rhema:googleOauthClientId` + `rhema:appBaseUrl`/`rhema:apiPublicUrl` unset → auth surface
   404 (F-VERIF.2-2 class; the R6DEP.1 ledger records the same fix on pr-207)

## Teardown + orphan sweep

- `preview-stack.mjs destroy pr-208`: **193/193** across two passes — 144 in-window, then
  49 at 17:24Z once the two GCP-managed `serverless-ipv4-cloudrun-*` reservations released
  (~2h19m GC lag; `resourceInUseByAnotherResource` on the private subnet; a direct
  `addresses delete` had been correctly refused — they belong to
  `//serverless.googleapis.com`). 20 drain attempts ~5 min apart; one transient
  api.pulumi.com `connection reset` mid-drain (attempt 18) — retried cleanly.
- `preview-stack.mjs rm pr-208`: stack + `Pulumi.pr-208.yaml` removed (deletion committed
  in the closeout commit — same as R6DEP.1's pr-207 file lifecycle).
- **Orphan sweep: ZERO `rhema-pr-208*` across 26 enumerated classes** (run services, run
  jobs, secrets, buckets, GKE, AlloyDB clusters+instances, Redis, VMs, networks, subnets,
  firewalls, routers, addresses, health checks, certs, instance templates, instance
  groups, backend services, url-maps, forwarding rules, https-proxies, AR repos, log
  metrics, alert policies, service accounts) — measured 17:3xZ post-rm.
- Preview spend window: init ~13:5xZ → rm 17:3xZ ≈ 3.7 h standing (AlloyDB ~1 h of it) —
  within the ≤ $8 resource-hours budget (R6DEP.1 measured ~$4–6 for a longer window incl.
  a full journey suite; this window ran 2 R1 legs only).
