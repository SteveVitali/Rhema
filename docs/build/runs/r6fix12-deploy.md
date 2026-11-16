# r6fix12-deploy — post-merge prod deploy @ `040e36a9` (the merged-`main` tip: the R6FIX.12 sign-up redirect-loop hotfix PR #337 + 261's purge-FK fix + records) under `GD-HOTFIX.R6`

- **Ticket:** the deploy arm of `262_R6FIX.12` (`docs/tickets/262_R6FIX.12__signup-redirect-loop.md`
  § Deploy arm) — authorized by the operator's 2026-11-15 verbatim ruling recorded in GATE
  DECISIONS (`GD-HOTFIX.R6`, verbatim): *"Production mutation: after I merge, deploy through the
  documented prod deploy path, with pre-state capture (current revision), rollback (re-point to
  the previous revision) and post-deploy verification (N1/N3 against prod plus a manual GET of
  the redirect chain). I authorize that deploy now, conditional on my merge and green CI."*
  **Both conditions verified before the first mutation:** PR #337 `MERGED` 2026-11-15T23:27:04Z
  (merge commit `040e36a9fd676fe2f9e17e44d87219cf97658c1d`) and all seven checks `SUCCESS`
  (fast-path, typecheck/lint/unit, contracts, public-safe, integration, images build+scan,
  ci-pass anchor — `gh pr view 337 --json statusCheckRollup` read at open).
- **Branch:** `stevevitali/r6fix12-deploy-records` (records branch off `main` `040e36a9` —
  the deploy commit set stays records + `Pulumi.prod.yaml` pins only; mergePolicy OPERATOR —
  a run never merges).
- **Deploy SHA:** `040e36a9fd676fe2f9e17e44d87219cf97658c1d` (`origin/main` tip after `git pull`;
  the #337 merge commit on top of `4da72170`). Prod pre-deploy serves `ebfd33f2` (verified live
  below — r7deploy-main's deploy SHA). The deployed-product delta this deploy carries:
  `apps/web` `server.ts`/`data.ts`/`spa/routes/_authenticated/app.new.tsx` (**262's** redirect-loop
  fix — `GET /app/new?entry=draft|outline` (+`held`) serves the SPA shell; `consumeSignupIntent`
  awaited on the `/app` honor; the leaf refusal arm `href:`→`to:` — all PROD-LOADED),
  `apps/api` `project-list.ts` (`POST /showcase/intent/consume` — PROD-LOADED), `apps/worker`
  `jobs.ts` (**261's** `handleProjectPurge` leaf-first NO-ACTION ordering + self-FK sever —
  PROD-LOADED; `D-R6FIX.11-1`'s verify leg rides this deploy), `packages/api-client`
  `consumeSignupIntent`, `packages/journeys` leg-side test only, and every records/docs row
  merged since `ebfd33f2`.
- **Harness:** devin-desktop/swe-2-high/subagent
- **Production mutations (ruling scope):** all-10 image build at `040e36a9` → `rhema-prod` AR;
  `pulumi preview --diff` classification → `pulumi up --stack prod`; `check-deploy-provenance`;
  `deployments` row via `record-deployment.mjs` over the operator IAP tunnel; the Cloud CDN
  invalidation of `/bff/p/demo~*` through `scripts/live/cdn-invalidate-demo.mjs` (dry-run ==
  act); post-deploy N1/N3 against prod + the manual GET of the redirect chain; the deployed
  re-proof `D-R6FIX.11-1`/`D-BL38.1-2`/`BL-112`/`BL-113` (read-only + the deployed sweep's own
  self-fired purge — no manual prod write).
- **Not authorized / not done here:** a NEW preview walk (condition-1 evidence carried — below);
  merges (`mergePolicy: OPERATOR`); any paid/funded dispatch; golden re-run (classified
  non-affecting, below); a manual tombstone clear (operator-paused class — and moot: the
  deployed sweep self-fired it, below).
- **Concurrency:** the deploy ran inside a dedicated detached worktree
  (`/private/tmp/rhema-deploy-hotfix` @ `040e36a9`). The vendored agent SDK (gitignored,
  operator-held) was copied in from the main checkout for the image-build context only;
  never committed.
- **R-2 note (honest):** the standing rule puts N1/N3 green *before* a prod deploy; here the
  deploy IS the fix for the only failing leg (F-15 — the loop itself), and the ruling's own
  ordering is deploy → post-deploy N1/N3. The pre-deploy reds were the target defect, not an
  unrelated red (R-2's concern); both legs verified PASS post-deploy below.

## The eight conditions (each evidenced before the act it guards)

1. **Preview evidence carried honestly.** No new preview stood up — the ruling authorizes the
   deploy arm of an already-merged hotfix, not a preview cycle (no `GD-PREVIEW` authority
   invoked; `preview-stack.mjs` untouched). Carried: the ticket's own Stage-A local browser arm
   (`packages/journeys/src/signup-redirect.local.test.ts` — real Chromium on the built web +
   stub api: real landing hold → ONE create + ONE consume → `/p/<slug>/import` → later `/app`
   lands the list; green post-fix, loops forever pre-fix), the 19/19 `signup-redirect.test.ts`
   hop-table, and the proven all-10/deploy discipline at `e578a767`/`b8307a40`/`ee40639d`/
   `ebfd33f2` (R7DEP.3, r7deploy-composed, r7deploy-main). The residual risk is exactly the
   deployed-auth hop the ruling's own post-deploy arm (N1/N3 + manual GET) verifies.
2. All-service image build at the tip — Cloud Build `9acde02a` (below).
3. `pulumi preview --diff` classified — zero stateful replace/delete; additive-only migrations
   (NONE — `git diff ebfd33f2..040e36a9` touches zero `packages/db` paths); cost Δ ≤ $15.
4. `pulumi up --stack prod` at `040e36a9`.
5. `check-deploy-provenance` all-PASS on web + api.
6. `deployments` row recorded (`prod:040e36a9…`).
7. Committed rollback recipe (§ below) + corpus-in-web-image assertion.
8. CDN invalidation `/bff/p/demo~*` recorded.

## Pre-state (captured 2026-11-15T23:4xZ, before any mutation)

- prod `/healthz` `build.gitSha` on web `rhema.tools` + api `api.rhema.tools`:
  `ebfd33f2d06aff5d1e387fd50ac3d62eb73d8015` (r7deploy-main's deploy SHA) — verified live
  (`logs/r6fix12-deploy/healthz-{rhema,api}-predeploy.json`).
- prod stack export: `docs/build/logs/r6fix12-deploy/prod-stack-export-prestore.json`
  (182 resources).
- Migrations: `git diff ebfd33f2..040e36a9` touches ZERO `packages/db` paths — repo max stays
  `0062_drafts_discard.sql`, already applied. Nothing to apply; the additive-migration clause
  is satisfied vacuously.
- prod digests (`Pulumi.prod.yaml` at pre-state) — the rollback pins: api `5f2ac960…`, web
  `aacb7d42…`, worker `4f1a55a8…`, fetcher `74db8783…`, convert `2612de42…`, export
  `23c6bd13…`, collab `c3854f80…`, turbo-cache `c5454e08…`; run-task `6f021c17…`;
  egress-proxy `7b54bd07…` (the `ebfd33f2`/build-`ddc437fa` set — still in `rhema-prod` AR).
- **Deployed re-proof baseline** (prod `BEGIN READ ONLY` over the operator IAP tunnel
  `rhema-prod-proxy-t1m0` → `127.0.0.1:15433→10.46.0.3:5432`; system-role
  `rhema-prod-proxy-database-url`, host rewritten, never printed; role probe
  `rolname=postgres, rolbypassrls=t`):
  - Tombstone `01M3SK380GQX41RKMD4KVFB34Q` still sits `deleted_at=2026-09-30T21:41:10.945Z` —
    the ONLY tombstoned project on prod.
  - The loud-and-recorded churn verified live: hourly `test-tenant.purge` ticks at ~:10Z all
    `completed` (20:10/21:10/22:10/23:10Z), each re-arming `project.purge:01M3SK38…`, each arm
    terminal `failed` `retry_count` 2/2 — the pre-fix handler still throwing
    `claims_draft_id_fkey` every hour (`logs/r6fix12-deploy/prestate-tombstone.log`).

## Payload classification (`ebfd33f2..040e36a9`, 32 files)

- **Deploy-neutral?** No — product code changed → every `/healthz` service rebuilt at the tip.
- **Product delta:** the redirect-loop fix (web + api + api-client) and the purge-FK fix
  (worker) described above; `infra/pulumi/Pulumi.{dev,prod}.yaml` re-pin comments;
  `packages/journeys` leg-side test; remaining surface docs/records/tickets.
- **Golden rule:** **NOT protocol-affecting → no re-run → $0.** The delta touches the signup
  redirect path (web/api), the showcase intent consume (api), and the purge job handler
  (worker) — none of it touches `packages/protocols`, the run/dispatch path, the
  harness/skill phase machinery, the egress proxy's research/fetch policy, or a REQ-SEC-3
  boundary. `apps/run-task` and `apps/egress-proxy` are untouched (rebuilt for provenance
  parity only).
- **Migrations:** none (above).

## Part B — rollback recipe (committed; NOT executed — the operator's go)

Rollback of the `040e36a9` deploy = the r7deploy-main recipe shape with this round's pins:
1. `git revert` the `ebfd33f2..040e36a9` range for a source rollback, OR (operator-faster)
   re-pin the pre-deploy digest set in `infra/pulumi/Pulumi.prod.yaml`: api `5f2ac960…`, web
   `aacb7d42…`, worker `4f1a55a8…`, fetcher `74db8783…`, convert `2612de42…`, export
   `23c6bd13…`, collab `c3854f80…`, turbo-cache `c5454e08…`, run-task `6f021c17…`,
   egress-proxy `7b54bd07…` (the `ebfd33f2`/build-`ddc437fa` set — still in `rhema-prod` AR).
2. `pulumi up --stack prod` → `check-deploy-provenance --expect ebfd33f2…` all-PASS.
3. CDN invalidate `/bff/p/demo~*` again (the S-13 act is idempotent).
4. `deployments` row re-record via `record-deployment.mjs` with the reverted digests.
5. No migration rollback — the payload carried zero migrations.
6. The SPA renderer flags/keys do not exist to flip (renderer rollback is a code rollback,
   infra gotcha 7). A prod incident attributed to this deploy voids the ruling's authority —
   rollback is then the operator's go.
7. **Re-proof caveat:** a rollback reverts the web to the redirect loop (F-15 re-opens — new
   signups with draft/outline intent re-loop) AND reverts the worker to the pre-leaf-first
   `handleProjectPurge` — the hourly sweep would re-arm `project.purge` for any FUTURE
   tombstone and fail loudly (the already-purged `01M3SK38…` stays deleted; rows re-open on
   their live criteria only for future instances). Record that honestly if rollback is ever
   exercised.

## Progress

- 2026-11-15T23:4xZ — detached worktree `/private/tmp/rhema-deploy-hotfix` @ `040e36a9`
  (clean, == origin/main post-pull); vendored SDK copied in (gitignored) for the run-task
  context assert; pre-state captured (above); payload classified non-protocol-affecting; zero
  new migrations; `pnpm install --frozen-lockfile` + `@rhema/infra`/`@rhema/journeys` dists
  built in-worktree; `infra/pulumi` `npm install`. IAP tunnel up on `rhema-prod-proxy-t1m0`;
  re-proof baselines read `BEGIN READ ONLY` (tombstone present; the hourly re-arm + loud-fail
  churn verified across four ticks).
- 2026-11-15T23:47Z — Cloud Build `9acde02a-81ce-4ee6-9edf-327d5c7b6822` submitted: all-10 @
  `040e36a9`, `_AR=us-central1-docker.pkg.dev/rhema-507501/rhema-prod`, `_TAG=r6fix12-deploy`,
  `_ALLOW_PLACEHOLDER_SDK=0` (vendored SDK present in the context; submit from the deploy-tip
  worktree — the r7deploy-composed/r7deploy-main pattern). Log:
  `docs/build/logs/r6fix12-deploy/cloud-build-submit.log`.
- 2026-11-16T00:0xZ — **condition 2 DONE:** Cloud Build `9acde02a` SUCCESS (12m46s), all-10
  images @ `040e36a9` → `rhema-prod` AR; run-task in-build vendored-SDK asserts PASS
  (`vendored native claude binary … executable by uid agent=10002` + `run-task image assert:
  vendored agent SDK readable+executable by uid agent=10002`). Digests re-verified against AR:
  `docs/build/logs/r6fix12-deploy/digests-040e36a9.txt` — api `5079a266…`, web `72ee5c82…`,
  worker `5b4d30c3…`, fetcher `3317b3a3…`, convert `b74cf444…`, export `6ea3f76f…`, collab
  `63fa0045…`, turbo-cache `6b1c8b95…`, run-task `93194707…`, egress-proxy `d9bed3af…`.
- 2026-11-16T00:1xZ — **condition 3 DONE — `pulumi preview --diff --stack prod` CLASSIFIED:**
  **10 updates + 1 replace, zero deletes, 169 unchanged** — 9 image rolls (8 services +
  convert job) + the `rhema-prod-proxy-mig` version pin, and the ONE replace is the
  `rhema-prod-proxy-tmpl` InstanceTemplate — a stateless immutable template the MIG rolls
  (the identical class accepted at every prior deploy). The worker's `+ [22] / - [25]` envs
  diff is the same non-converging secret-masked env-shape line the prior deploys carried —
  cosmetic, non-stateful. **Zero stateful replace/delete, zero stateful touches. Migrations:
  none in the payload** (additive clause vacuous). **Cost Δ ≈ $0** — identical service
  count/sizing; ≤ $15. Log: `logs/r6fix12-deploy/pulumi-preview-diff.log`.
- 2026-11-16T00:1xZ — **condition 4 DONE:** `pulumi up --stack prod` — **update 178**, 10
  updated + 1 replaced, 1m30s, zero destructive. Log: `logs/r6fix12-deploy/pulumi-up.log`. The
  proxy MIG rolled (`rhema-prod-proxy-{t1m0,nrqg}` retired → `{zkrx,ld01}`) — the recorded
  per-deploy pattern; the operator IAP tunnel re-established on `rhema-prod-proxy-zkrx` (the
  `deployments` row write ran over the still-live `t1m0` tunnel first — same mid-roll pattern
  as last deploy).
- 2026-11-16T00:1xZ — **condition 5 DONE — `check-deploy-provenance` all-PASS:**
  `rhema.tools` + `api.rhema.tools` both report `build.gitSha = 040e36a9…` (first poll already
  live). Log: `logs/r6fix12-deploy/provenance.log`.
- 2026-11-16T00:1xZ — **condition 6 DONE — `deployments` row recorded:** `prod:040e36a9…`,
  `protocols_version=0.4.0+9c2b880dbee74bd8` (unchanged — the committed trio is), all-10
  digests — over the operator IAP tunnel (`rhema-prod-proxy-t1m0` →
  `127.0.0.1:15433→10.46.0.3:5432`; system-role `rhema-prod-proxy-database-url`, host
  rewritten, never printed). Log: `logs/r6fix12-deploy/record-deployment.log`.
- 2026-11-16T00:1xZ — **condition 7 (corpus arm) DONE — corpus-in-web-image assertion:** the
  web Dockerfile's in-build `RUN test -s` on `corpus/PROVENANCE.md` +
  `snapshots/projects.json` + `snapshots/structure-of-political-difference/index.json`
  (Dockerfile L25–27) ran inside `9acde02a` — step `#15 [builder 9/9]` before the export;
  the asserted web digest `72ee5c82…` is exactly what prod serves (provenance PASS). The
  in-build-assert + AR-digest-match evidence class carries.
- 2026-11-16T00:2xZ — **condition 8 DONE — CDN invalidation:** dry-run == act on
  `rhema-prod-urlmap-6f2b86e`, host `rhema.tools`, path **`/bff/p/demo~*`** —
  `invalidate-cdn-cache` submitted (eventually consistent per-edge). Logs:
  `logs/r6fix12-deploy/cdn-{dry-run,invalidate}.log`.

## Post-deploy verification (the ruling's own leg)

### (a) Journeys N1 + N3 against prod @ `040e36a9` — **both PASS**

```
node packages/journeys/dist/cli.js --stage prod --steps N1,N3 \
  --expect-sha 040e36a9fd676fe2f9e17e44d87219cf97658c1d \
  --out docs/build/logs/r6fix12-deploy/n1n3-prod --state-dir docs/build/logs/r6fix12-deploy/journeys-state
```

```
PASS  N1         [ONB.1]
PASS  N3         [ONB.1]
provenance match · spend $0 ≤ $5 · report docs/build/logs/r6fix12-deploy/n1n3-prod/report.json
```

- **N1** (the landing drop-zone holds a dropped draft across sign-in and later loads) — PASS,
  9,631 ms. **N3** (the held draft becomes a project with its preview in ≤ 20 s) — PASS,
  14,961 ms. Both legs sign a fresh `test+<nonce>-n<k>held@rhema.tools` identity up through
  the REAL magic-link leg (Gmail DWD mailbox, Resend) inside the same browser context — the
  exact chain that `ERR_TOO_MANY_REDIRECTS`'d pre-fix: held drop → `/signup?held=1` → magic
  link → `/app?entry=draft&held=1` → consume + 302 → `/app/new?entry=draft&held=1` shell →
  the leaf's ONE create POST → `/p/<slug>/import` hydrated with the held file.
- Provenance `match` — observed web + api both `040e36a9…` at walk time. Console errors [] /
  failed requests [] on both legs.
- **Artifact handling (GD-OPS-RULES.R6 (c)):** `report.json` carries no magic-link/session
  tokens (grep-verified — ids/durations/provenance only) → committed at
  `docs/build/reports/2026-11-16_r6fix12-deploy/report.json`. `N1.png`/`N3.png` are signed-in
  screenshots → NOT committed (kept in the gitignored `logs/r6fix12-deploy/` subtree), per
  the 2026-11-15 standing rule.
- **F-15 disposition:** the regression is verified REPAIRED on prod — N1/N3 went red-in-every-
  readable-run-since-11-12 → PASS at the deployed fix SHA. Dated tail appended to BL-105's
  note chain (the row itself stays OPEN for F-16/paid-U6 authority) and to D-R7DEP.2-2.

### (b) Manual GET of the redirect chain — every chain ends at a 200 in ≤ 2 hops, no cycle

Unauthenticated arm (the session gate precedes the intent arm — `GET /app`'s `!session →
/login` runs first, so pre-auth each URL takes the login hop; verbatim statuses below, log
`logs/r6fix12-deploy/redirect-chain.log`):

```
GET https://rhema.tools/app?entry=draft&held=1   → HTTP 302 Location: https://rhema.tools/login
GET https://rhema.tools/login                    → HTTP 200        (2 requests, terminal 200)
GET https://rhema.tools/app?entry=outline        → HTTP 302 Location: https://rhema.tools/login
GET https://rhema.tools/login                    → HTTP 200
GET https://rhema.tools/app?entry=draft&held=1&src=hero   (the OAuth callback target)
                                                 → HTTP 302 Location: https://rhema.tools/login
GET https://rhema.tools/login                    → HTTP 200
GET https://rhema.tools/app/new?entry=draft&held=1
                                                 → HTTP 302 Location: https://rhema.tools/login
GET https://rhema.tools/login                    → HTTP 200
GET https://rhema.tools/app                      → HTTP 302 Location: https://rhema.tools/login
GET https://rhema.tools/login                    → HTTP 200
```

Every chain terminates at 200 in ≤2 hops; no URL redirects to itself or revisits. The OAuth
start endpoint probed for completeness: `GET /api/auth/sign-in/social/google` → HTTP 404 —
it is a POST-only better-auth route, not a document GET (recorded honestly; the OAuth arm
that matters — the `/app?entry=…&src=hero` callback target — is the third chain above). The
authed hop mechanics that actually looped pre-fix are what N1/N3 exercised live (both PASS —
the green arm (a)).

### (c) `D-R6FIX.11-1` / `D-BL38.1-2` / BL-112 / BL-113 — the survivor purge self-fired and **verified**

The payload also carried 261's `handleProjectPurge` fix, whose verify row's whole design is
"the next worker deploy + the already-deployed hourly sweep self-fires it." It did — inside
this window, verbatim:

- `00:02:50.336Z` — the new worker revision `rhema-prod-worker-cbdaf0f-00090-glz` (the
  `5b4d30c3…` build) enqueued its boot `test-tenant.purge` (`singleton_key="boot"`), completed
  `00:02:51.832Z`.
- `00:02:51.830Z` — `[worker] project.purge.sweep → {"scanned":1,"rearmed":["01M3SK38…"]}` —
  260's watchdog re-armed the survivor (job `2adaddea-a411-4c39-970b-ef3f6f35fd8c`,
  `start_after` 00:02:54.260Z) — **on the draining `00089-tnk` revision** (the ~2 s
  old-code-claim race the r7deploy-main record documented — revision-labelled below).
- `00:02:52.360Z` + `00:02:54.258Z` — attempts 1–2 **FAILED** `claims_draft_id_fkey` — on
  **`rhema-prod-worker-cbdaf0f-00089-tnk` (the pre-fix code)** — the same throw, now loud.
- `00:02:55.998Z` — attempt 3 on **`rhema-prod-worker-cbdaf0f-00090-glz` (the fix):**
  `[worker] project.purge 01M3SK38… → {"purged":true,"deleted":{"working_copies":0,
  "provenance_maps":0,"analytics_events":0,"inbox_items":0,"gates":1,"decision_requests":0,
  "obligation_findings":9,"revision_obligations":9,"dispositions":0,"findings":24,"claims":16,
  "correspondence_items":1,"projects":1},"severed":{"drafts.base_draft_id":0,
  "runs.parent_run_id":0},"objectsDeleted":27}` — the leaf-first ordering destroyed the tree
  the old code could not touch (`retry_count` 2/2 on the terminal row — the two old-code
  attempts counted against the same job's retry budget; the last allowed attempt ran the
  fix).
- `00:03Z` verify select: `select id, deleted_at from projects where deleted_at is not null`
  → **0 rows** — the 46-day-past-grace tombstone is gone end-to-end; no manual prod write
  (the deployed sweep's own mechanism performed it — the GD-R6OPS.3-1 arm (a) path).
- Revision labels are the receipts (`logs/r6fix12-deploy/postdeploy-purge-revisions.log`):
  sweep + both FAILED lines on `00089-tnk`, the `purged:true` line on `00090-glz` — same job,
  same data, old code fails ×2, new code completes. The row's "(no FAILED line)" expectation
  is honestly amended: the two FAILED lines are MORE evidence, not less — they are the
  identical failure on the identical job under the old handler, three minutes before the fix
  cleared it.
- **Dispositions:** `D-R6FIX.11-1` → **DONE** (verified verbatim); `D-BL38.1-2` → **DONE**
  (its criterion — the verify select returns 0 rows — met live, ~16.5 d late); BL-112 →
  **closed** (audit answered at r7deploy-main + survivor now purged); BL-113 → **closed**
  (fix verified live). Dated tails appended; F-15's BL-105 note chain records the N1/N3
  verify.

## Spend

Cloud Build `9acde02a` ~13 min (~$0.6 list) + `pulumi up` (Δ≈$0) + N1/N3 journeys (free legs,
$0 metered) + prod `BEGIN READ ONLY` reads $0. No funded/paid arms; golden classified
non-affecting ($0). Well under any envelope.

## Records

`runs/r6fix12-deploy.md` (this), `pr/r6fix12-deploy.md`, BUILD_INDEX row 322, LEDGER PHASE
LOG `done` + `ci boundary` lines, CURRENT STATE `lastCompleted` → `262_R6FIX.12` (the deploy
arm lands the ticket — verified) + `nextTicket` → `263_R6FIX.13` (unchanged — already the
next unlanded row), DEFERRALS dated dispositions on `D-R6FIX.11-1` (DONE) / `D-BL38.1-2`
(DONE) / `D-R7DEP.2-2` (F-15 tail — row stays OPEN for F-16/env-bound), BACKLOG BL-112 +
BL-113 closed + `BL-105-note-2026-11-16`, `Pulumi.prod.yaml` re-pin comments,
`reports/2026-11-16_r6fix12-deploy/report.json` (token-free; signed-in PNGs kept gitignored
per GD-OPS-RULES.R6 (c)).
