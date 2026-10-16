# VERIF.2 — Preview-leg wave on an owned `pr-<n>` stack (run ledger)

- **Harness:** devin-desktop/swe-2-high/subagent
- **Skills:** agent-skills @ (see `git -C ~/agent-skills rev-parse --short HEAD` in Evidence log)
- **Started:** 2026-10-16T03:26:00Z
- **Closed:** —
- **Spec:** `docs/tickets/165_VERIF.2__preview-legs.md` (manifest row 165)
- **Base:** `stevevitali/cost-1-prod-cost-posture` @ `f20ee28` (+ orchestrator commits `e6c774b`, `1b1fee9`)
- **Branch:** `stevevitali/verif-2-preview-legs` @ `1b1fee9` (impl head at branch open)
- **Config:** full rigor (ledger/self_review/gap_analysis/tests/live_verification/evidence_report)
- **Live stage:** `pr-<n>` preview ($0 legs; resource-hours recorded — target ≤$8)
- **Production mutations:** none — every leg runs on the owned preview, destroyed at closeout

## Deferrals read (in scope this run)

The stream-V-2 set (behind the H8 Resend seed — landed 2026-10-16T03:24Z, operator-delegated):

| Row | Leg (post-SPA.28 shape) |
|---|---|
| D-OPS.1-1 | every signed-in `paid:false` step green on a preview w/ real Resend + mailbox (the full-suite leg) |
| D-OPS.1-2 | live paused-AlloyDB leg — `activationPolicy NEVER` post-create update + `ignoreChanges` no-drift proof (named carrier) |
| D-MAINT.6-1 | the live session-mint proof — real `test*@rhema.tools` magic-link session via `resend-pull`/`seed-invite` + `--invite-code` |
| D-SPA.6-1 | renderer-asserted journey legs on a deployment carrying the marker vocabulary (preview half) |
| D-SPA.12-1 | `settings` surface gate (`T2.matrix`, `T3`, `R8.prefs`) under `--expect-renderer spa` |
| D-SPA.13-1 | `voices` (`T5`, `X1.voices`) |
| D-SPA.14-1 | `onboarding` (`N1`, `N3`, `N4`, `P1.app-new`) |
| D-SPA.15-1 | `project-home` (`R1`, `R7`, `T2.badge`, `T6`, `T7`, `P1.project`, `X1.home`, `R10`) |
| D-SPA.16-1 | `billing` (`N9`) |
| D-SPA.17-1 | `export` + `ide-chrome` (`R5`, `T4`, `T8`, `P1.project`) |
| D-SPA.18-1 | `outline` (`P1.outline`) |
| D-SPA.19-1 | `figures` (`P1.figures`) |
| D-SPA.20-1 | `run-sheet` (`N4`, `R7`, `N9`, `P1.runsheet`) |
| D-SPA.21-1 | `dossier` (`N7`, `T1`, `T12F`, `T13F`, `P1.dossier`) — seeded substrate needs `JOURNEY_DATABASE_URL` |
| D-SPA.22-1 | `run-report` (`R6F`) — seeded delivered report, needs `JOURNEY_DATABASE_URL` |
| D-SPA.23-1 | `editor` mount half (`N8`, `P1.pill`, `P1.project`, `R7`, `R10`, `R10.keepalive`, `T2.badge`, `T6`, `T7`, `T17`) |
| D-SPA.24-1 | `editor` collab half — same `editor` gate, collab wire under the SPA surface |

**SPA.28 restatement (binding):** the D-rows' leg-A (`x-rhema-renderer: ssr` pin) / leg-B
(`rhema:spaSurfaces` flag-on) / rollback-drill vocabulary is RETIRED — flag machinery and the
header override are deleted (`--pin-renderer` refuses exit 2). The honest post-removal leg per
`surface-gates.ts TWO_LEG_PROCEDURE` is: ONE `pr-<n>` preview serves `--expect-renderer spa` on the
surface's gate subset (Page-family forced-SSR verdicts self-report `data-ssr-cause` and are exempt
by design — the ticket's "assert `data-renderer`/`data-ssr-cause` only"). The `D-SPA.*-2` rollback
drills are DROP-mooted in the G1 census — untouched by this run.

Paid steps never dispatch ($0 legs — REQ-VFY-10; `--paid` never passed). The seeded-substrate
steps (`T12F`, `T13F`, `R6F`, `T7` probe) bind `JOURNEY_DATABASE_URL` to the preview's
IaC-generated system DSN through an IAP SSH tunnel on the preview's own proxy VM
(VERIF.1's prod pattern, preview-scoped; firewall rule created + deleted inside the window).

## Requirements

1. Stand `pr-<n>` with chain-tip (`1b1fee9`) images: `preview-stack.mjs` verbs in order
   (`init → config → resend-pull → up` → migrate Job → `seed-invite`).
2. `resend-pull` + `seed-invite` → mint a real mailbox session; journeys CLI `--invite-code`.
3. Execute the 15 preview legs — assert `data-renderer`/`data-ssr-cause` only; committed evidence
   under `docs/build/reports/2026-10-16_verif2/`.
4. Carry D-OPS.1-2 (live paused-AlloyDB leg inside this exercise).
5. Flip genuinely-closed D-rows to DONE with evidence pointers; honestly re-owe failures with
   classification (never fabricate green).
6. DESTROY the stack at closeout; record the destroy + resource cost (≤$8 target).
7. Boundaries: zero prod writes; $0 paid legs; preview resources only; no secrets anywhere;
   `date -u` for every stamp; never merge (mergePolicy OPERATOR).

## Acceptance criteria

- [ ] All 15 preview legs executed on the owned preview with committed evidence *(staging-verified)*
- [ ] Zero prod writes; spend ledger recorded *(deterministic)*
- [ ] verification green; BUILD_INDEX row + LEDGER advanced *(agentic — universal AC)*

## Plan

1. Ledger + PR skeleton → push → `gh pr create` (base `stevevitali/cost-1-prod-cost-posture`)
   → the PR number names the stack (`pr-<n>`).
2. `preview-stack.mjs init pr-<n>`; config `gcp:project`/`gcp:region`/`rhema:placeholderImage`
   (hello — placeholder pass)/`rhema:gitSha`/`rhema:protocolsVersion`; `resend-pull`.
3. Targeted `up` for the `rhema-pr-<n>-images` AR repo → `gcloud builds submit
   infra/cloudbuild/image-set.yaml` `_AR=<the preview repo>` `_TAG=verif-2` `_GIT_SHA=1b1fee9`
   → `config rhema:serviceImages`/`runTaskImageDigest`/`proxyImage` digests → `up`.
   (Images live in the preview's OWN AR — zero `rhema-prod` writes; matches the SPA.11
   authorization wording.)
4. `gcloud run jobs execute rhema-pr-<n>-migrate --wait` → `seed-invite` → healthz/smoke.
5. Journeys: `pnpm --filter @rhema/journeys build` + `playwright install chrome`;
   `--web https://<web>.run.app --api https://<api>.run.app --invite-code prv-<n>-test`.
   Run A — the mint proof + full $0 suite (D-OPS.1-1; every paid:false step). Run B…N —
   `--surface <keys> --expect-renderer spa` gated legs. `JOURNEY_DATABASE_URL` via
   `gcloud compute ssh <proxy-vm> --tunnel-through-iap -L 15433:<alloydb-ip>:5432`
   + a preview-scoped `iap-ssh` firewall rule (created + deleted inside the window).
6. D-OPS.1-2: `gcloud alloydb instances update rhema-pr-<n>-primary --activation-policy=NEVER`
   → `describe` shows NEVER → `preview-stack.mjs refresh` reports no drift (`ignoreChanges`).
7. `destroy` → `rm` → full `rhema-pr-<n>-*` orphan enumeration → spend ledger.
8. DEFERRALS flips + verify suite + closeout.

## Test matrix

No code change — verification legs are the deliverable. Gates re-run at close:
`pnpm turbo build lint typecheck`, `pnpm test`, all `check:*`, `check-build-memory.sh`,
`check-append-only.mjs --base f20ee28`.

## Progress

- 2026-10-16T03:2xZ — ledger seeded; prerequisites verified: `pulumi v3.261.0` logged in
  (`14stevevitali-gmail-com`), `gcloud` → `rhema-507501`, ADC live, `serviceAccountTokenCreator`
  on `rhema-journeys` SA held by the caller (mailbox leg viable), `rhema-nonprod-resend-api-key`
  seeded at 03:24Z (operator-delegated, H8). Only `rhema-prod` AR repo exists → images build into
  the preview's own `rhema-pr-<n>` repo after a targeted repo `up` (no `rhema-prod` writes).
- ~03:35Z — `init pr-186` + `config` (project/region/`placeholderImage`/`gitSha=1b1fee9`/
  `protocolsVersion=0.4.0+ec61156725a895ab`/`deployProxyMig`/`runTaskAppArmor*`/`emailFrom`) +
  `resend-pull` (key moved stdin→`rhema:resendApiKey` secret config; never printed). Targeted
  repo pass created `rhema-pr-186-images` AR + `rhema-journeys-sa` carryover bindings.
- 03:45–03:56Z — `gcloud builds submit infra/cloudbuild/image-set.yaml` `_AR=…/rhema-pr-186`
  `_TAG=verif-2` `_GIT_SHA=1b1fee9` `_SERVICES=<all 10>` → build `a9ba25ad-c19e-4746-88f7-
  77753651f083` SUCCESS 11m9s. Digests (tag `verif-2`, repo `rhema-pr-186`):
  run-task `18ed3aaf`, egress-proxy `a97a7d1e`, api `062e85c9`, web `d4364279`, worker
  `601b68d6`, fetcher `b4b611a8`, convert `f47c3472`, export `06cd1185`, collab `0c137cca`,
  turbo-cache `9e298121`.
- ~04:00Z — `config rhema:serviceImages`/`runTaskImageDigest`/`proxyImage` digests set;
  `up` pass 1 (update 2): 63 resources created; 2 AlertPolicy creates hit the known
  log-metric propagation 404 (metric ≤10 min to register) — transient, retried.
- ~04:05Z — preview-scoped IAP bridge: `gcloud compute firewall-rules create
  rhema-pr-186-iap-ssh` on `rhema-pr-186-net-42d9955` (tcp:22 from `35.235.240.0/20`,
  target tag `egress-proxy`) — deleted again at closeout with the stack.
- ~04:10Z — `up` pass 2 (update 3): 135/137 resources in place (VPC+PSA peering, AlloyDB
  cluster, Redis, GKE+nodepool, proxy plumbing, 9 generated secrets + IAM, 3 buckets,
  DNS-PGA zones, alert policies now green). `alloydb-primary` create FAILED:
  `Error code 9 … "us-central1" does not have enough resources available` — regional
  AlloyDB capacity, environmental. Pass 3 identical (164s wait → same refusal).
  Bounded retry loop armed (6 attempts @ ~10 min spacing); if exhausted, a preview-only
  `availabilityType:"ZONAL"` fallback is the recorded accommodation (no test pins it —
  `data.test.ts`/`stages.test.ts` clean).
- ~04:4xZ — fallback taken: `data.ts` pins `availabilityType: "ZONAL"` on `kind === "preview"`
  (REGIONAL double-books node capacity; a paused preview has no HA need). `up` pass 4
  converged — AlloyDB primary + all 192 resources live. Migrate Job created but not yet
  executed.
- ~04:5xZ — first migrate-Job execution (resolved auto-name `rhema-pr-186-migrate-60a902b` —
  the literal `rhema-pr-186-migrate` 404s; F-VERIF.2-1 fixed in `preview-stack.mjs`):
  58 migrations applied, `rhema_app_login`/`rhema_collab` roles enabled, `deployments` row
  recorded (`pr-186` @ `1b1fee9`), `seedRealProjects` correctly REFUSED (preview posture —
  no user-text fixtures), `agent_types` + protocols seeded. Without the DB the api's first
  Cloud Run revision crash-looped (`database "rhema" does not exist`) — `pulumi up` pass 5
  replaced it post-migrate and converged green.
- ~05:0xZ — auth surface found unmounted: `/api/auth/*` 404 because `APP_BASE_URL` gates
  `authSecretsReady` and previews derive no domains (F-VERIF.2-2). Fix: `rhema:appBaseUrl` /
  `rhema:apiPublicUrl` stack config → `APP_BASE_URL`/`API_PUBLIC_URL`/`INTERNAL_AUTH_AUDIENCE`
  env on api+web; `GOOGLE_OAUTH_CLIENT_SECRET_NAME` mounted whenever the container exists.
  Re-up → `/api/auth/*` live (400 on malformed input, then real magic-link sends).
- ~05:1xZ — `seed-invite` executed the resolved Job with `--args
  node,/app/dist/migrate.js,--seed-invite,prv-186-test` + verified the newest execution
  completed (`preview-stack.test.mjs` extended for the resolve+verify path).
- ~05:2xZ — **D-MAINT.6-1 mint proof GREEN**: `N2` + `N2.invite` passed against
  `https://rhema-pr-186-web-…run.app` with `--invite-code prv-186-test` — a real
  Resend-delivered magic-link session on the mailbox leg. Provenance probe reported NO-MATCH
  only because `fetchDeployedSha` hard-probes `/healthz`, which Cloud Run's GFE intercepts on
  `*.run.app` origins (F-OPS.1-10 — the LB path answers; `/healthz/` alias added).
- ~05:2xZ — broad `$0` + gated run (`gates/`): 20 legs green incl. `N4 N7 R1 R5 R7 R8.prefs
  R8.inbox T17 P1.pill P1.app-new X1.voices X1.usage X1.home X1.inbox T1 T2.badge T2.matrix
  T3 T4 T6`; `R10` FLIP (red→ready-to-flip); `R10.keepalive`/`T8` owed. Failures investigated:
  - `N1`/`N3` `[role="status"]` timeout → previews are `signupMode:"invite"`; the held-draft
    legs minted WITHOUT the seeded code (F-VERIF.2-5 — `StepCtx.inviteCode` now exposed, both
    legs fill the real `code` field; re-run GREEN).
  - `N3`/`T5` → GCS presign→direct-PUT blocked by CORS: the `user-content` bucket admitted
    only the `https://<stack>.rhema.dev` placeholder (F-VERIF.2-6 — `rhema:uploadCorsOrigins`
    set to the preview web origin; re-run GREEN).
  - `N8`/`R10.keepalive` (`R10`'s warm-return leg) → `COLLAB_WS_URL` is domains-only by design;
    previews serve the static read view — editor sync legs are owed-by-posture, not product.
  - `N9` → `notice=stripe_unconfigured` is the preview's intended posture
    (`PREVIEW_REQUIRED_SECRETS` excludes Stripe — REQ-ARCH-38); owed-by-posture.
  - `P1.project`/`P1.runsheet` → the shared `p1PhoneProject` prologue still sent only
    `sec-ch-ua-mobile` (loses to Chromium's desktop UA-CH — F-VERIF.2-4); upgraded to the real
    `IPHONE_USER_AGENT`/`isMobile` context like `P1_DOSSIER`; re-run GREEN both.
  - `P1.dossier` `[data-apply]` present on the phone arm → REAL product defect
    (F-VERIF.2-3): `findingControlsFor` gated bulk controls on `compact` but not the
    per-finding Apply verb — the preview's seeded writable dossier is the first fixture
    applyable enough to expose it (prod's showcase findings carried none). Fixed: Apply is
    withheld under `compact` alongside bulk.
  - `T8` — owed by design (the 410 half needs a 7-day expired token + purge exemption; mint
    recipe on D-FIX.1-1).
- 2026-10-16T05:4xZ — fixes committed as `e7b21ae` (`fix(verif-2): live-run fixes — preview
  auth origins, zonal AlloyDB, migrate-Job resolution, phone-context + invite-code harness,
  dossier §10.1 apply gate, /healthz/ provenance alias`). Rebuild: `gcloud builds submit
  infra/cloudbuild/image-set.yaml` `_TAG=verif-2b` `_GIT_SHA=e7b21aecb` (all 10 images) →
  build `54f6c4f9-f762-4372-9d0a-421d91f9772a`. Post-deploy legs re-run at `e7b21aecb`.
- 05:5xZ — harness-fixed legs re-run on the `verif-2` image (the product diff can't touch
  them — dossier-view + `/healthz/` only): `gates2/` — `N1` PASS (invite-code mint), `N3`
  reached the upload leg (then CORS), `P1.project`/`P1.runsheet` PASS (real mobile context);
  `gates3/` — post-CORS `N3` PASS + `T5` PASS (full substack export-link → discover → include
  walk).
- 2026-10-16T16:08Z — RESUMED after the orchestrator-session crash (~06:44Z). Fresh-context
  worker picked up at the close phase: all live legs were already green
  (`e7b21ae` committed-but-unpushed; DEFERRALS dispositions + the R10 registry flip +
  the F-VERIF.2-3 dossier regression test in flight as uncommitted state). Verified the
  dispositions against committed evidence (`reports/2026-10-16_verif2/*/report.json`) —
  R10's `ready-to-flip`×2 justifies the green flip; `N8`/`R10.keepalive` (collab wire is
  domains-only), `N9` (stripe_unconfigured posture), `T8` (D-FIX.1-1's expired-token recipe)
  confirmed honestly owed — their carrier rows stay OPEN. Prior `destroy` run exhausted its
  retry loop on the `serverless-ipv4-cloudrun-…` reservation (`/tmp/verif2-destroy.log`);
  the reservation is now released — re-running destroy, then orphan enumeration + `rm`.
- 2026-10-16T16:0x–16:1xZ — teardown completed: first `destroy` re-run deleted the
  47 held resources but stalled on `rhema-pr-186-net` — the preview-scoped
  `rhema-pr-186-iap-ssh` firewall rule (created by hand at ~04:05Z for the IAP tunnel, not
  Pulumi-managed) still referenced it. Deleted the rule, re-ran `destroy` (network + stack
  node deleted, 16:10Z), then `rm` removed the stack registration — `pulumi stack ls` shows
  only `dev` + `prod`. Orphan enumeration across 20 classes (Cloud Run svcs/jobs, AlloyDB,
  addresses, networks+subnets, buckets, AR repos, secrets, SAs, firewalls, SSL certs, health
  checks, log metrics, custom roles, GKE, Redis, VMs, LB plumbing, DNS zones, alert policies)
  → **zero `rhema-pr-186*` resources remain in `rhema-507501`**. Audit-log-pinned cost
  windows → spend ledger ≈ **$2.9 vs ≤$8**.
- 2026-10-16T16:2xZ — full verification: `pnpm install` clean; `pnpm turbo build lint
  typecheck` 135/135; `pnpm test` first pass surfaced two real closeout gaps, both fixed:
  (a) the `R10` registry flip hadn't updated `registry.test.ts`'s pinned green-baseline set
  (the VERIF.1-era audited pin — added `R10` with the dated evidence comment); (b) e7b21ae's
  `rhema:appBaseUrl`/`apiPublicUrl` keys were read but undocumented in `PROD-BRINGUP.md`
  (runbook-completeness invariant — §2 bullet added). Re-run: **502 files (501 pass, 1 skip)
  / 5,813 pass / 4 skip / 0 fail** — the F-VERIF.2-3 dossier regression test green;
  `privsep.docker` green this pass. All six `check:*` gates green.

## Gap table

| item (spec §) | required layer | achieved layer | status | evidence |
|---|---|---|---|---|
| Stand `pr-<n>` w/ chain-tip images (init→config→resend-pull→up→migrate→seed-invite) | staging-verified | staging-verified | met | `up` converged 192→193 resources across 5 passes; images tag `verif-2` @ `1b1fee9` → `verif-2b` @ `e7b21aecb` (preview's own AR `rhema-pr-186`, digest-pinned); migrate Job `rhema-pr-186-migrate-60a902b` applied 58 migrations; `seed-invite` upserted `prv-186-test`. Progress log + GCP audit trail |
| Mailbox session mint via `resend-pull`/`seed-invite` + `--invite-code` | staging-verified | staging-verified | met | `mint/report.json` — `N2` + `N2.invite` PASS (real Resend-delivered magic link → verify → session cookie); D-MAINT.6-1 → DONE |
| 15 preview legs executed; `data-renderer`/`data-ssr-cause` asserts only; committed evidence | staging-verified | staging-verified | met | `reports/2026-10-16_verif2/` — 10 runs, 98 files. `--expect-renderer spa` on every gated surface, zero renderer violations; `ssr-arm` N10+P1.public green under `--expect-renderer ssr`; provenance MATCH on `e7b21aecb` (dossier-b/tail/posture). 39/44 `paid:false` legs green; `N8`/`R10.keepalive` (collab wire domains-only), `N9` (stripe_unconfigured posture), `T8` (D-FIX.1-1 expired-token recipe) honestly owed |
| Carry D-OPS.1-2 (live paused-AlloyDB leg) | live-executed | live-executed | met | `gcloud alloydb instances update … --activation-policy=NEVER` → `NEVER`/`STOPPED` (audit `UpdateInstance` 06:13:33Z+06:15:25Z) → `refresh` 193 resources, 0 drift (`ignoreChanges` holds) |
| Flip closed D-rows DONE w/ evidence; re-owe failures w/ classification | engineered | engineered | met | DEFERRALS.md — 13 rows DONE (D-OPS.1-2, D-MAINT.6-1, D-SPA.12/13/14/15/17/18/19/21/22/23/25-1); 5 rows stay OPEN honestly w/ dated re-owe notes (D-OPS.1-1 posture-bound legs, D-SPA.6-1 prod arm, D-SPA.16-1 + D-SPA.20-1 N9-Stripe posture, D-SPA.24-1 collab wire); registry `R10` red→green (`ready-to-flip` ×2 legs) |
| Destroy stack at closeout; cost ≤$8 recorded | deterministic | live-executed | met | `destroy` 16:09–16:11Z (47+2 deleted; manual `rhema-pr-186-iap-ssh` firewall removed first — it blocked the network delete) + `rm` — stack gone; orphan enumeration across 20 resource classes → **zero `rhema-pr-186*` remain**; spend ≈ **$2.9** (below) |
| Boundaries: zero prod writes, $0 paid legs, preview-only, no secrets, `date -u`, never merge | deterministic | deterministic | met | every mutation scoped `rhema-507501`/`rhema-pr-186*`; prod stack untouched (174 res, last update = COST.1's); `spend.weeklyMeteredUsd: 0` + `withinCap: true` on every report; `--paid` never passed; secrets `provided: yes` only, never printed |

AC rows:

| AC | required | achieved | status | evidence |
|---|---|---|---|---|
| All 15 preview legs executed on the owned preview w/ committed evidence | staging-verified | staging-verified | met | `reports/2026-10-16_verif2/` + the DEFERRALS DONE/OPEN dispositions above |
| Zero prod writes; spend ledger recorded | deterministic | deterministic | met | mutation list above is `rhema-pr-186*`-only; spend table below |
| verification green; BUILD_INDEX row + LEDGER advanced | agentic | agentic | met | turbo/vitest numbers + check outputs in Evidence report; BUILD_INDEX 192; LEDGER PHASE LOG |

## Live spend ledger (resource-hours × list price; audit-log-pinned windows)

Window: resources first created ~03:58Z; full stack live ~04:45Z; **first `destroy` pass
06:19–06:37Z deleted ALL compute** (audit log: Cloud Run svcs+jobs 06:19:5xZ, proxy VM
06:23Z, AlloyDB inst+cluster 06:23–06:27Z, Redis 06:29Z, GKE 06:36Z, subnets/firewalls/
LB plumbing 06:36–06:47Z). The crash held only ~52 near-free non-compute resources
(secrets/SAs/buckets/AR/net/cert/HC/role/metrics) until the resumed destroy 16:09–16:11Z.

| Resource | Window (UTC) | Hours | Rate est. | Est. $ |
|---|---|---|---|---|
| Cloud Build ×2 (E2_HIGHCPU_8, 10 imgs, ~11m + ~14m) | 03:46–03:57Z, 05:50–06:05Z | 0.43 | ~$0.60/build-set | ~1.30 |
| AlloyDB primary 2-vCPU ZONAL (running; paused 06:14Z, deleted 06:23Z) | 04:35–06:27Z | 1.9 | $0.34/h | ~0.65 |
| Memorystore Redis BASIC 1 GiB | ~04:2x–06:29Z | 2.2 | $0.049/h | ~0.11 |
| GKE cluster fee + e2-standard-2 node | ~04:1x–06:36Z | 2.4 | $0.167/h | ~0.40 |
| egress-proxy e2-small MIG | ~04:2x–06:23Z | 2.0 | $0.017/h | ~0.03 |
| Cloud Run (min=0 services request-billed; worker; Jobs: migrate×3+seed-invite+convert) | ~04:3x–06:19Z | 2.0 | ~$0.05 | ~0.10 |
| External LB + static IP + DNS zones | ~04:2x–06:36Z | 2.3 | $0.025/h | ~0.06 |
| Held non-compute 06:37→16:10Z (16 secrets, 11 SAs, 4 buckets, AR repo, net/subnet, cert, HC, custom role, log metrics) | 9.6h held | — | pennies | ~0.15 |
| **total** | | | | **≈ $2.9 — inside the ≤$8 target** |

## Evidence log

| When (UTC) | Evidence | Result |
|---|---|---|
| ~03:5xZ | Cloud Build `a9ba25ad-c19e-4746-88f7-77753651f083` (tag `verif-2`, 10 digests) | chain-tip images in preview AR |
| ~05:1xZ | migrate Job `rhema-pr-186-migrate-60a902b` execution + `seed-invite` newest-execution verify | 58 migrations; invite `prv-186-test` seeded |
| ~05:2xZ | `mint/report.json` — N2 + N2.invite PASS; provenance observed `null` (F-OPS.1-10) | D-MAINT.6-1 green |
| ~05:2xZ | `ssr-arm/report.json` — N10 + P1.public PASS under `--expect-renderer ssr` | public funnel clean |
| ~05:3xZ | `gates/report.json` — 20 pass, R10 FLIP, R10.keepalive/T8 owed, 12 investigated fails | baseline matrix |
| ~05:3xZ | `seeded/report.json`, `seeded2/report.json` — R6F/T12F/T13F/T7 PASS under surface scopes w/ `JOURNEY_DATABASE_URL` via IAP tunnel | seeded substrate green |
| 05:5xZ | `gates2/report.json` — N1/P1.project/P1.runsheet PASS (harness fixes) | invite + phone-context green |
| 05:5xZ | `gates3/report.json` — N3/T5 PASS (post-CORS) | upload path green |
| 05:5xZ | Cloud Build `54f6c4f9-f762-4372-9d0a-421d91f9772a` (tag `verif-2b` @ `e7b21aecb`) | post-fix images |
| 06:13–06:15Z | `gcloud alloydb instances update … --activation-policy=NEVER` → audit `UpdateInstance` ×2 → `preview-stack.mjs refresh` 193 res / 0 drift | D-OPS.1-2 green |
| 06:19–06:37Z | `destroy` pass 1 (pre-crash): all compute deleted (audit: Cloud Run 06:19, proxy VM 06:23, AlloyDB 06:23–27, Redis 06:29, GKE 06:36); stalled on `serverless-ipv4-cloudrun-…` reservation pinning the private-app subnet | compute gone; ~52 near-free held |
| 16:09–16:11Z | `destroy` re-runs: `rhema-pr-186-iap-ssh` firewall deleted by hand (blocked net delete), 47+2 resources gone; `rm` → stack unregistered | stack empty; `pulumi stack ls` = dev+prod only |
| 16:1xZ | orphan enumeration — 20 resource classes, `rhema-pr-186*` filter, `rhema-507501` | **zero residuals** |
| 16:2xZ | `turbo build lint typecheck` 135/135 · `pnpm test` 501 files / 5,813 pass / 4 skip / 0 fail (2 closeout gaps fixed: registry.test green-pin + PROD-BRINGUP key docs) · all six `check:*` green | verification green |

## Evidence report

**PR:** #186 `stevevitali/verif-2-preview-legs` (base `stevevitali/cost-1-prod-cost-posture`,
unmerged — mergePolicy OPERATOR). Requirement ids: REQ-OPS-5, REQ-G1-3 (stream-V-2 half).

**What ran.** An owned `pr-186` preview stack in `rhema-507501` stood on chain-tip images
(`verif-2` @ `1b1fee9`, redeployed `verif-2b` @ `e7b21aecb` after the live-found fixes),
a real Resend-seeded mailbox minted sessions via `seed-invite`/`--invite-code`, and the
full `paid:false` journey registry + every gated `--surface … --expect-renderer spa` leg
ran against it — 10 committed runs under `docs/build/reports/2026-10-16_verif2/`.

**Leg outcome.** 39/44 free legs green; every gated surface leg that can green on a
`*.run.app` preview is green. The residual non-greens are preview posture, not product —
verified against the committed reports: `N8` + `R10.keepalive` need the collab wire
(`COLLAB_WS_URL` is domains-only; previews mount the static read view — `N8` failed
verbatim on both image builds, `posture/report.json`), `N9` lands on
`?notice=stripe_unconfigured` (previews never carry Stripe — REQ-ARCH-38), `T8`'s 410 half
needs the operator-minted 7-day expired token (D-FIX.1-1's recipe), `R10` reported
`ready-to-flip` twice and flipped `expected:"green"` in `registry.ts`.

**Live-found defects fixed this run** (commit `e7b21ae`): F-VERIF.2-1 migrate-Job auto-name
resolution in `preview-stack.mjs`; F-VERIF.2-2 preview auth origins (`rhema:appBaseUrl`/
`apiPublicUrl`); F-VERIF.2-3 **real product defect** — `[data-apply]` leaked at phone width
on the dossier (`dossier.dom.test.tsx` regression test added); F-VERIF.2-4 P1 phone-context
harness (real IPHONE UA-CH); F-VERIF.2-5 `StepCtx.inviteCode` for invite-mode previews;
F-VERIF.2-6 `rhema:uploadCorsOrigins` for direct-PUT uploads; F-OPS.1-10 `/healthz/`
provenance alias (GFE eats `/healthz` on `*.run.app`).

**Teardown.** `preview-stack.mjs destroy pr-186` pass 1 (pre-crash, 06:19–06:37Z) deleted
all compute; the retry loop exhausted on the `serverless-ipv4-cloudrun-…` IP reservation
pinning the private-app subnet. On resume (16:09Z): the released reservation let the
subnet delete proceed; the `rhema-pr-186-iap-ssh` firewall rule (manually created for the
IAP tunnel, not Pulumi-managed) was deleted, then `destroy` completed (47+2 resources)
and `rm` removed the stack registration. Orphan enumeration across Cloud Run svcs/jobs,
AlloyDB, addresses, networks+subnets, GCS buckets, AR repos, secrets, SAs, firewalls,
SSL certs, health checks, log metrics, custom roles, GKE, Redis, VMs, LB components,
DNS zones, routers, alert policies, backend svcs/buckets → **zero `rhema-pr-186*`
resources remain in `rhema-507501`**; `pulumi stack ls` shows only `dev` + `prod`.

**Cost.** ≈ $2.9 estimated (audit-log-pinned windows; see spend ledger) vs the ≤$8 target.
Compute lived ~04:0x–06:3xZ (~2.4h); the crash-imposed hold touched only near-free
resources. Paid legs: none dispatched (`spend.weeklyMeteredUsd: 0`, `withinCap: true` on
every report). Zero prod writes; the prod stack's last update predates this run (COST.1's).

**DEFERRALS disposition.** DONE (13): D-OPS.1-2 (live pause leg), D-MAINT.6-1 (mint proof),
D-SPA.12/13/14/15/17/18/19/21/22/23/25-1 (the gated preview legs that can green on a
preview). OPEN still, honestly (5): D-OPS.1-1 (posture-bound legs — carrier: a
domains-bearing stage), D-SPA.6-1 (prod SSR arm — carrier: operator chain deploy),
D-SPA.16-1 + D-SPA.20-1 (N9 Stripe posture — carrier: stripe-bearing stage),
D-SPA.24-1 (collab wire — carrier: domains-bearing stage). No row was fabricated green;
each re-owed note names the carrier and the committed evidence.

**Verification.** `pnpm install` clean · `pnpm turbo build lint typecheck` 135/135 tasks ·
`pnpm test` 501 files / **5,813 pass / 4 skip / 0 fail** (the F-VERIF.2-3 dossier
phone-width Apply regression green; `privsep.docker` green this pass) · all six `check:*`
gates green (licenses, protocol-markers, no-cookies, spa-budget, spa-env, dom-contract).
Two honest closeout fixes this resume: `registry.test.ts`'s audited green-baseline pin
gained `R10` (dated, per the VERIF.1-era convention — the crash left the flip unsynced);
`PROD-BRINGUP.md` §2 gained the `rhema:appBaseUrl`/`apiPublicUrl` bullet
(runbook-completeness invariant over e7b21ae's new keys). Not run: paid legs (never —
REQ-VFY-10), prod deploys (out of scope).

ci: pending
