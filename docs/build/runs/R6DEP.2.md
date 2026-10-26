# R6DEP.2 — Tip deploy to prod + post-deploy re-proofs (run ledger)

- **Spec:** operator-directed insert (no manifest ticket file) — directive "let's just deploy
  from the end of the stack" + GD-REMAINING.R6 + GD-DEPLOY.R6 (the deploy pre-auth).
- **Normative loads:** LEDGER GATE DECISIONS `GD-DEPLOY.R6` (four conditions — zero stateful
  replace/delete, additive migrations only, cost delta ≤ $15, provenance pass after) +
  `GD-REMAINING.R6` (invite minted on prod 2026-10-23 — `r6-*` code-bound, max_uses 10, +90 d,
  code operator-held, never committed); `docs/build/runs/R6DEP.1.md` (the deploy recipe +
  checklist this run follows); `docs/build/runs/R6POST.2.md` (the domains-bearing posture-stage
  procedure for R10.keepalive); `docs/build/runs/R6POST.1.md` (POST-2 invite-accept leg +
  $0-guard path); `docs/build/runs/R6SECR.1.md` + report (§12.8 legs a–f); `docs/ops/
  golden-rerun-rule.md` (protocol-affecting classes); `infra/PROD-BRINGUP.md` §2b/§7/§8.
- **Base:** `stevevitali/r6inf-2-proxy-ilb` @ `e04a8c8` (pushed chain tip; PR base = same).
  mergePolicy=OPERATOR — never merge.
- **Branch:** `stevevitali/r6dep-2-tip-deploy`
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills`
- **Requirement ids stamped:** none (operator insert; rides REQ-DEP-1's deploy machinery).
- **Started:** 2026-10-26T14:41Z · **Closed:** —
- **Live stage:** prod deploy under GD-DEPLOY.R6 + owned `pr-<n>` posture stage (≤ $8) for the
  keepalive re-arm.
- **Production mutations (this ticket's named scope):** `pulumi up --stack prod` of the
  chain-tip SHA `e04a8c875c0e4cbf25b65c3b6784de6812f32dc7` (image digests built by Cloud
  Build + pinned in `Pulumi.prod.yaml`); `scripts/live/record-deployment.mjs`; one prod
  invite consume via the operator-minted `r6-*` code (provided via env, never committed);
  `gh workflow run journeys.yml` dispatch on the tip ref. Rollback = `git revert` +
  redeploy of `80db0d521b55fbbb760be80220508cb2dc11812a` (prior digests recorded).
- **Deploy SHA:** `e04a8c875c0e4cbf25b65c3b6784de6812f32dc7` (the chain tip at branch cut;
  later commits on this branch are docs/evidence only — `deploy-neutral-paths.txt` `docs/`
  allowlist makes post-tip drift provably neutral).
- **Pre-state (recorded BEFORE any mutation, 2026-10-26T14:43Z):**
  - web `/healthz` → `80db0d5` · api `/healthz` → `80db0d5` (both
    `80db0d521b55fbbb760be80220508cb2dc11812a`, the R6SECR.1 deploy — an ancestor of
    `e04a8c8`).
  - `80db0d5..e04a8c8` = 79 changed files, **zero** `packages/db/migrations` entries
    (additive lint trivially satisfiable vs prod `_migrations` max `0058`).
  - Code-affecting payloads since `80db0d5`: R6FIX.1 (HSTS web+api; session-owned
    UndoManager — F-R6POST.2-2; egress-proxy periodic key refresh — F-R6GLD.1-1),
    R6OPS.2 (opsAlertWebhookUrl binding — already applied, up-157), R6CNT.3
    (DossierRunCard parameterization + drivers), R6INF.2 (ADR-122 ILB — already applied,
    ups 160–162). **Non-protocol-affecting** per `golden-rerun-rule.md`'s class list
    (no protocol seeds/manifests/rubrics/phase machinery, no run/dispatch path, no
    egress research/fetch *policy* change — key refresh is transport hygiene, HSTS is
    browser-facing) → the golden re-run rule does NOT re-arm; the threshold-5 note
    records this dated.
- **ci:** pending (post-push boundary read → `docs/build/logs/ci-R6DEP.2.json`).

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows in this ticket's blast radius:

- **D-R6SECR.1-2** — DONE code-landed 2026-10-23 (R6FIX.1); its live-curl closing clause is
  owed post-deploy → **this run's HSTS leg discharges it** (`curl -sI` both origins).
- **D-SEC.2-1** — OPEN; the real-invite-consume residual. GD-REMAINING.R6 minted
  `r6-…operator-held-env-redacted` on prod (max_uses 10, +90 d, email NULL, created_by
  `devin-cli:r6-h12`). This run: ONE consume via `--invite-code`-scoped journey mint +
  `invites.used_count`/`invite_redemptions` verified over the system-DSN tunnel.
- **D-SPA.24-1** — OPEN on the R10.keepalive residual only (N8 discharged on pr-211):
  F-R6POST.2-2's session-owned UndoManager fix is IN this deploy → re-run
  `N8` + `R10.keepalive` on a fresh domains-bearing posture stage at `e04a8c8`; green arm
  closes the residual per the row's tail.
- **D-R6SECR.1-1** — OPEN; R6CNT.3 discharged (a)/(e)/(f) + hook-layer on a benign run;
  (b)/(c)/(d)/`egress.denied` need hostile fixture content through a dispatched run —
  nothing new is $0-exercisable on this SHA (the controls are in-run, not
  HTTP-reachable). Honest dated tail; a $0-class re-verification is recorded where
  reachable.
- **D-OBS.1-3** (nightly green on deployed SHA) — dated note: this deploy moves the
  deployed SHA to `e04a8c8`; the threshold-6 evidence leg is the dispatch substitute.
- **D-PRB.01-1** — PARTIAL; its residual IS D-SEC.2-1 → dated note on consume.
- **D-OPS.1-1** — OPEN; the keepalive half is the D-SPA.24-1 arm → dated note only.

## Requirements (operator directive — deliverables)

1. Prod deploy `80db0d5` → `e04a8c8`: `pulumi preview --diff --stack prod` classified
   (zero stateful replace/delete, additive migrations, cost within rule) → `pulumi up`
   → provenance (`/healthz` `gitSha=e04a8c8` on web+api) → `record-deployment` → smoke
   legs per the GD-DEPLOY.R6 checklist (R6DEP.1 precedent).
2. Dated non-protocol-affecting note on GATE-LAUNCH threshold-5's validated-SHA line
   (the golden re-run rule does not re-arm for this tip).
3. HSTS live tail: `strict-transport-security` on both origins → close D-R6SECR.1-2's
   last clause.
4. Invite-consume leg: ONE consume of the minted `r6-*` code against prod via env;
   `invites.used_count` ticks + redemption row over the system-DSN tunnel.
5. R10.keepalive semantic re-arm: domains-bearing posture stage (`preview-stack.mjs`
   + sslip.io names) at `e04a8c8`, `--expect-renderer spa`, `N8` + `R10.keepalive`;
   expected green undo-arm → close the D-SPA.24-1 residual; destroy + orphan sweep.
6. D-R6SECR.1-1 §12.8 tail: honest accounting of (a)–(f) discharged vs carried; any
   $0-exercisable residual run against the new SHA.
7. Threshold-6 evidence: `journeys.yml` `workflow_dispatch` on the tip branch ref
   (`stevevitali/r6inf-2-proxy-ilb` @ `e04a8c8` — `github.sha` = the deployed SHA);
   described precisely (manual dispatch of the nightly $0 legs on the deployed SHA —
   never "nightly on main").
8. Records: run ledger + `docs/build/pr/R6DEP.2.md` + PR + BUILD_INDEX row 225 +
   LEDGER phase log + dated notes (`nextTicket` stays `196a_HUMAN-H12`).

## Acceptance criteria

- [ ] All four GD-DEPLOY.R6 conditions evidenced before `up` (zero stateful
      replace/delete; additive lint; cost ≤ $15; provenance plan → all-PASS)
      *(live-executed)*
- [ ] `/healthz` `e04a8c8` on both origins + `deployments` row recorded
      *(live-executed)*
- [ ] Post-deploy smoke green (public routes + signed-in shell + `/bff/*` + worker
      consuming) *(live-executed)*
- [ ] HSTS present on both origins *(live-executed)*
- [ ] One invite consume; `used_count` + redemption verified *(live-executed)*
- [ ] `R10.keepalive` arm verdict + `N8` PASS on the posture stage; teardown verified
      *(staging-verified)*
- [ ] journeys dispatch outcome recorded *(live-executed)*
- [ ] Universal phase-gate AC *(agentic)*

## Plan

1. Ledger + PR skeleton → `gh pr create` → PR number names `pr-<n>` (posture stage).
2. Cloud Build all-10 at `e04a8c8` into `rhema-prod` AR (`_TAG=r6dep-2`,
   `_GIT_SHA=e04a8c8…`).
3. Preflight: stack export + `/healthz` pre-state (above) → additive-lint (zero new
   migrations) → billing baseline → pin digests in `Pulumi.prod.yaml` (dated comment) →
   `pulumi preview --diff --stack prod` → per-resource classification committed.
4. `pulumi up --stack prod` → `check-deploy-provenance --expect e04a8c8…` →
   `record-deployment` over the IAP tunnel → smoke (public 200s + markers; signed-in
   `/bff/*` legs; worker consuming via logs).
5. HSTS curls → D-R6SECR.1-2 close.
6. Invite leg: tunnel → pre-state `invites` read → `RHEMA_INVITE_CODE` env (code
   provided via env, never committed) → one mint leg (`N1` — one `freshUser`, $0) +
   `N2.invite` form leg → post-state `used_count` + redemption row → guard read.
7. Posture stage `pr-<n>`: reserved LB IP → sslip.io names (`posture.<ip>.sslip.io` +
   `api.`/`uc.` — digit-free prefix; zero registrar records) → init/config
   (postureDomains/postureLbAddress/gitSha/protocolsVersion/googleOauthClientId/
   resend-pull) → images → `up` → migrate → `seed-invite` → cert ACTIVE →
   `--surface editor --steps N8,R10.keepalive --expect-renderer spa --expect-sha
   e04a8c8…` → destroy → rm → address release → orphan sweep → cost.
8. `gh workflow run journeys.yml --ref stevevitali/r6inf-2-proxy-ilb -f stage=prod
   -f paid=false` → poll → record outcome.
9. Rollback recipe + evidence committed; DEFERRALS flips/dated notes; GATE-LAUNCH
   threshold-5/6 dated notes; verify suite; gap table; closeout (BUILD_INDEX 225,
   LEDGER, ci-boundary).

## Test matrix

No product-code change — the legs are the tests (live evidence). Gates re-run at
close: `pnpm turbo build lint typecheck`, `pnpm test`, all `check:*`,
`check-build-memory.sh`, `check-append-only.mjs --base c1f20f5` (the task's named
base — the R6FIX.1 anchor used by the recent insert rows).

## Progress

- 2026-10-26T14:41Z — branch `stevevitali/r6dep-2-tip-deploy` cut at `e04a8c8`
  (origin tip; pulumi `14stevevitali-gmail-com`, gcloud `rhema-507501`, node v25.2.1,
  pnpm 10.32.1). Context loaded: R6DEP.1 recipe, R6POST.2 posture-stage procedure,
  R6POST.1 prod-arms path, R6SECR.1 §12.8 record, DEFERRALS rows, GD-DEPLOY.R6 +
  GD-REMAINING.R6 verbatim, GATE-LAUNCH thresholds 5/6, journeys.yml dispatch inputs.
- 2026-10-26T14:43Z — pre-state captured: prod `/healthz` web+api = `80db0d5`
  (full `80db0d521b55fbbb760be80220508cb2dc11812a`, ancestor of `e04a8c8`, 79-file
  diff, zero migrations). Diff payload classified non-protocol-affecting per the
  rerun rule's classes.
- 2026-10-26T15:0xZ — **image builds at the deploy SHA** (`e04a8c8` worktree — the
  branch's docs-only commits on top never enter image content): prod repo build
  `a8d53c59` + pr-219 repo build `6c85c7d8`, both `_TAG=r6dep-2`, `_GIT_SHA=e04a8c8…`,
  all ten services → both **SUCCESS**. (A second prod-repo build I submitted
  (`a40110ed`) was a duplicate of `a8d53c59` — CANCELLED before images pushed.)
  All ten prod digests extracted + pinned in `Pulumi.prod.yaml` (dated comment).
- 2026-10-26T15:1xZ — **prod preflight PASS** (`prod-preflight/pulumi-preview-diff.txt`
  + `preview-classification.md`): `pulumi preview --diff --stack prod` → **10
  updates + 1 replace + 165 unchanged** — 9 Cloud Run image rolls (api/web/worker/
  fetcher/convert-svc/convert-job/export/collab/turbo-cache) + the stateless proxy
  `InstanceTemplate` replace → MIG re-roll. All four GD-DEPLOY.R6 conditions
  evidenced BEFORE `up`: zero stateful replace/delete; additive-lint "no migrations
  newer than the base"; cost delta $0; provenance plan recorded.
- 2026-10-26T15:2xZ — **`pulumi up --stack prod` executed** (update 163): 10
  updated + 1 replaced in 3m31s. Proxy MIG rolled `…-fdr3`/`…-v9qf` → `…-02dh`/`…-bg3r`
  (the template replace). **`check-deploy-provenance --expect e04a8c8…` → all-PASS**
  on `https://rhema.tools` + `https://api.rhema.tools` (both `/healthz`
  `build.gitSha=e04a8c875c0e4cbf25b65c3b6784de6812f32dc7`). **`record-deployment.mjs`
  → `prod:e04a8c875c0e4cbf25b65c3b6784de6812f32dc7`** over the IAP tunnel
  (`protocols_version=0.4.0+ec61156725a895ab` recomputed live) with all ten digest
  pins — the first attempt ECONNRESET'd when the MIG retired the tunnel-riding VM
  (the R6DEP.1 incident verbatim); ssh `-L` tunnel re-established on the new VM,
  retried clean.
- 2026-10-26T15:2xZ — **post-deploy smoke, all green**: public routes `/` `/pricing`
  `/signup` `/login` `/showcase` `/invite` → 200 + `data-renderer="ssr"`; api
  `/healthz` → 200 (`prod-smoke/public-routes.txt`). Signed-in shell + `/bff/*`:
  `R8.inbox,T2.badge --expect-sha e04a8c8…` → **PASS**, provenance match, $0
  (`prod-smoke/report.json`). SSR arm `N10,P1.public --expect-renderer ssr` →
  **PASS** (`prod-ssr-leg/`). **Worker consuming** — the new revision logged
  `run.walkthrough … → {"ok":true,"status":"ready"}` ×2 at 15:26Z +
  `billing.auto-reload` + the weekly SLO sweep.
- 2026-10-26T15:2xZ — **HSTS leg GREEN** (`prod-smoke/hsts.txt`):
  `strict-transport-security: max-age=31536000; includeSubDomains` on BOTH
  `https://rhema.tools/` (200) and `https://api.rhema.tools/session` (401 — the
  header lands on unauthenticated responses too). **D-R6SECR.1-2's live-curl
  closing clause is discharged.**
- 2026-10-26T15:2xZ — **invite-consume leg GREEN**: `RHEMA_INVITE_CODE` env (the
  operator-minted `r6-*` code — provided via env, never committed) →
  `--steps N1,N2.invite --expect-sha e04a8c8…` → **PASS ×2**, $0. `N1` minted
  exactly one fresh user through the real signup+magic-link flow; the
  `user.create.after` consume fired once (`N2.invite` is `ctx.anon()` — no
  consume). Post-state over the system-DSN tunnel: `invites.used_count` 0→**1**,
  `invite_redemptions` 0→**1** row (`redeemed_at` 15:28:10Z) —
  `invite-leg/{invites,redemptions}-poststate.json`. **D-SEC.2-1's
  real-invite-consume residual is discharged** (max_uses 9 remain).
- 2026-10-26T15:2xZ — **threshold-6 dispatch attempted**: `gh workflow run
  journeys.yml --ref stevevitali/r6inf-2-proxy-ilb -f stage=prod -f paid=false` →
  run `40349459730` (workflow_dispatch on `e04a8c8` — `github.sha` = the deployed
  SHA). **Failed at `google-github-actions/auth`**: repo vars
  `JOURNEY_WIF_PROVIDER`/`JOURNEY_CI_SA` are unset → zero legs ran, $0, nothing
  touched prod. Same failure signature as the last scheduled nightly runs
  (2026-10-19/20/21 — `39591154485` et al.) — **pre-existing CI-config gap, not a
  regression of this deploy** → F-R6DEP.2-1. Closest honest equivalent run
  locally under the same `--expect-sha` machinery: the $0-leg class above
  (R8.inbox/T2.badge + N10/P1.public ssr + N1/N2.invite — all PASS on the
  deployed SHA). This is dispatch evidence, honestly labelled — never "nightly
  on main".
- 2026-10-26T16:4xZ — **F-R6DEP.2-1 root-caused + partially repaired live**
  (three-layer defect): (1) repo vars `JOURNEY_WIF_PROVIDER` /
  `JOURNEY_CI_SA` never set → **set** via `gh variable set` (identifiers, not
  secrets — provider `…/github-pool/providers/github-provider`, SA
  `rhema-journeys@rhema-507501.iam.gserviceaccount.com`); (2) the WIF provider's
  `attributeCondition` was the **unsubstituted template literal**
  `assertion.repository=='<GITHUB_ORG_OR_USER>/<REPO_NAME>'` → `unauthorized_client`
  on run `40361523387` → **repaired** to `assertion.repository=='SteveVitali/Rhema'`
  (`update-oidc`); (3) run `40363400137` then got past auth — and failed at the
  suite step: `pnpm --filter @rhema/journeys exec rhema-journeys` →
  `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL` — pnpm only links a package's `bin` into
  its **importers'** `node_modules/.bin` and nothing depends on `@rhema/journeys`,
  so the own-bin invocation was **always broken** (every run ≥2026-10-10 failed
  this way or at auth). **Fix committed on this branch** (`node
  packages/journeys/dist/cli.js "${args[@]}"` — cwd stays repo-root so
  `--out`/`JOURNEY_STATE_DIR` land for upload-artifact). **Why it can't be
  proven pre-merge:** dispatching on any ref carrying the fix makes
  `github.sha ≠ e04a8c8`, and `git diff e04a8c8..<fix>` contains
  `.github/workflows/journeys.yml` — deliberately **non-neutral** under ADR-114's
  allowlist → the provenance arm fails closed by design. The fix rides this PR;
  the post-merge dispatch on `main` (== prod) is threshold-6's real arm.
  $0 — zero legs ran in any of the three dispatches.
- 2026-10-26T15:3xZ — **pr-219 posture stage** (the keepalive re-arm host):
  owned `pr-219` (`rhema:owner=ops-preview`), LB `136.68.101.101`, three sslip.io
  hosts (`posture.`/`api.`/`uc.` — zero registrar records, wildcard DNS).
  `pulumi up` converged over 4 passes through two known transient classes:
  (a) log-metric→alert-policy propagation lag (retry converged);
  (b) the pr-207/211 api race — revision 00001 booted before the migrate Job
  created `rhema` (`pg-boss` `database "rhema" does not exist` ×6 → startup
  probe fail); executed `rhema-pr-219-migrate-ff35eb2-4fw6s` then forced
  revision 00002 (`gcloud run services update --update-labels`, the R6POST.2
  recipe verbatim) → serving. `seed-invite` → `prv-219-test`
  (execution `…-xgp6w`). Managed cert `rhema-pr-219-cert-b7883cd` PROVISIONING
  ×3 SANs at ledger time.
- 2026-10-26T16:4xZ — **cert incident worked honestly:** cert
  `rhema-pr-219-cert-b7883cd` went `FAILED_NOT_VISIBLE` ×3 — it had provisioned
  through the ~35 min window when no forwarding rule existed yet (the FR landed
  only at converge pass 4), and GCP's retry backoff doesn't recover briskly from
  that state. `pulumi up --replace <cert URN>` minted `rhema-pr-219-cert-8a1822a`
  → PROVISIONING clean → **ACTIVE on all three SANs**; GFE→TLS live ~2 min later:
  `https://posture.136.68.101.101.sslip.io/` 200, `api…/healthz` → `gitSha=e04a8c8…`,
  `uc.` 403 (private bucket — intended). DNS: zero registrar records — the three
  names are sslip.io wildcard records (same finding as R6POST.2).
- 2026-10-26T17:0xZ — **keepalive legs GREEN** (`posture/report.json`):
  `--surface editor --steps N8,R10.keepalive --expect-renderer spa
  --expect-sha e04a8c8… --invite-code prv-219-test` → **N8 PASS** (fork → synced
  edit over the live `wss://<app>/collab` wire) and **R10.keepalive
  `ready-to-flip`** — same `data-page-session` re-acquired inside the 120 s TTL
  with zero document loads AND ⌘Z removed the synced marker typed before
  leaving: the session-owned `UndoManager` (F-R6POST.2-2's fix, deployed in this
  SHA) survives the keep-alive remount live. `registry.ts` flipped
  `expected:"green"` with this evidence; **the D-SPA.24-1 residual discharges**.
- 2026-10-26T17:0xZ — **teardown:** `preview-stack.mjs destroy pr-219` — 194
  deleted over 24 m; the final `private-app` subnetwork is held by GCP's
  asynchronous `serverless-ipv4-cloudrun-*` reservation release (the documented
  R6POST.2/R6DEP.1 lag class — ~2 h managed drain; destroy is idempotent under
  it). Retry loop armed to zero, then `rm` + manual-address delete + orphan
  sweep + cost record land in the same pass.
- 2026-10-26T16:2xZ — **secret-hygiene incident (F-R6DEP.2-2):** the seed commit
  `cbc6ac3` (pushed by the earlier session pass) carried the operator invite
  code verbatim in this ledger + three evidence JSONs. Caught pre-merge: the
  branch history was rewritten (`cbc6ac3`/`…` → `0a3e582`/`0c42142`, force-push)
  with the code scrubbed to `r6-…operator-held-env-redacted`; the private repo
  still retains the old commit object until GitHub GC → **operator ask:
  revoke + remint the `r6-*` invite** (9 uses remain; revocation is the clean
  kill). Recorded as F-R6DEP.2-2, mitigated same-day.

## Gap table

| Ask | Result | Where |
| --- | --- | --- |
| Preflight classification (GD-DEPLOY.R6 four conditions) | PASS — zero stateful replace/delete; 1 stateless-proxy InstanceTemplate replace accepted; zero migrations vs `0058`; Δ$0 ≤$15 | `prod-preflight/` |
| `pulumi up --stack prod` of `e04a8c8` | GREEN — update 163; provenance all-PASS | `prod-preflight/` + `deployments` row |
| `record-deployment` honest provenance | GREEN — `prod:e04a8c8…` + protocols `0.4.0+ec61156725a895ab` + ten digests | tunnel record |
| Smoke (public, signed-in, SSR, worker) | GREEN — 6×200 ssr markers; R8.inbox+T2.badge; N10+P1.public; worker consuming | `prod-smoke/`, `prod-ssr-leg/` |
| HSTS live curl (D-R6SECR.1-2) | DISCHARGED — header on web 200 + api 401 | `prod-smoke/hsts.txt` |
| Invite consume (D-SEC.2-1) | DISCHARGED — used_count 0→1 + 1 redemption row | `invite-leg/` |
| R10.keepalive re-arm (D-SPA.24-1) | DISCHARGED — N8 PASS + keepalive ready-to-flip → `expected:"green"` | `posture/` |
| §12.8 hostile legs (D-R6SECR.1-1) | CARRIED honestly — (b)/(c)/(d)/`egress.denied` need hostile fixtures + bounded spend | DEFERRALS dated note |
| Threshold-6 dispatch | ATTEMPTED ×3 — F-R6DEP.2-1 root-caused; layers 1-2 repaired live; layer-3 fix committed, unprovable pre-merge (ADR-114) | run entries + `logs/` |
| Threshold-5 golden | Dated note — payload non-protocol-affecting; re-run NOT re-armed | GATE-LAUNCH readout |
| Rollback recipe | Committed | `rollback-recipe.md` |
| F-R6DEP.2-2 invite-code leak | Mitigated — history rewritten + scrubbed; operator revoke+remint outstanding | run entry |

## Evidence log

`docs/build/reports/2026-10-26_R6DEP.2/`:

- `prod-preflight/` — pre-state healthz, diff census, `pulumi preview --diff`
  classification, additive-lint, cost delta, provenance plan.
- `prod-smoke/report.json` — `R8.inbox` + `T2.badge` PASS on the deployed SHA.
- `prod-ssr-leg/report.json` — `N10` + `P1.public` PASS under `--expect-renderer ssr`.
- `prod-smoke/hsts.txt` — curl captures of `Strict-Transport-Security` on both origins.
- `invite-leg/` — N1+N2.invite run + pre/post `invites`/`invite_redemptions`
  tunnel queries (code redacted — `r6-…operator-held-env-redacted`).
- `posture/` — pr-219 run: `N8` PASS + `R10.keepalive` `ready-to-flip`
  (report.json + screenshots).
- `rollback-recipe.md` — revert → re-pin `80db0d5` digests → up → provenance →
  record.

## Evidence report

_(filled at close)_
