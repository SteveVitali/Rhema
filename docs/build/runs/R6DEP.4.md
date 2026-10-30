# R6DEP.4 — maintenance deploy of `main` to prod + nightly literal-arm evidence (run ledger)

- **Spec:** operator-directed insert (no manifest ticket file) — deploy `main` tip `4938b8e`
  (payload: the #231 `rl:testidentity` limiter fix + records) so the threshold-6 literal arm can
  read. Authorization: GD-DEPLOY.R6 + post-launch posture (additive-only, zero stateful
  replace/delete). mergePolicy=OPERATOR — never merge.
- **Normative loads:** `docs/tickets/DEFERRALS.md` (read first); LEDGER GATE DECISIONS
  `GD-DEPLOY.R6`/`GD-THRESH6.R6`/`GD-REMAINING.R6`; `docs/build/runs/R6DEP.3.md` (recipe);
  `docs/ops/golden-rerun-rule.md`; `docs/build/runs/N9.md`; `scripts/live/reseat-n9-fixture.mjs`.
- **Base:** `origin/main` @ `4938b8e4024777417c5a8ed9f518f9afb4bebd08`.
- **Branch:** `stevevitali/r6dep-4-limiter-deploy` · **Harness:** devin-desktop/swe-2-high/subagent
  · **Skills:** implement-spec + build-memory + self-review @ `~/agent-skills` (`e981ec5`)
- **Started:** 2026-10-30T04:46Z · **Closed:** (at close)
- **Deploy SHA:** `4938b8e4024777417c5a8ed9f518f9afb4bebd08` (main tip; later commits on this
  branch are records/workflow/IaC — non-image).
- **Production mutations (named scope):** `pulumi up --stack prod` (image rolls + `+1` project
  IAMMember `roles/cloudsql.client` on the journeys WIF principalSet — additive create);
  `scripts/live/record-deployment.mjs`; fixture substrate writes on the `is_test` jrn-a tenant via
  the established `reseat-n9-fixture.mjs`/`fixture-substrate.ts` seams (DSN over IAP tunnel);
  `gh workflow run journeys.yml` dispatches (free legs, `paid=false`).
  Rollback: `git revert` + redeploy of `b953c55e3b9b877e3147332a405d05def4cbaf88` (prior digests
  in `Pulumi.prod.yaml` history); fixture rows are `delete`-one-row reversible.
- **Pre-state (recorded BEFORE mutations, 2026-10-30T04:5xZ):**
  - prod `/healthz` web+api = `b953c55e` (verified by nightly report.json provenance match).
  - prod `_migrations` max = `0060_stripe_event_redrive.sql` (applied 2026-10-28) — **no new
    migrations** in the payload; nothing to apply.
  - `b953c55e..4938b8e` code diff: api `auth.ts`/`signup.ts`/`index.ts`/`server.ts` + tests (the
    #231 `rl:testidentity` bounded bucket), `Pulumi.prod.yaml` re-pins, `Pulumi.pr-230.yaml`
    leftover, docs/records/READMEs. **Non-protocol-affecting** per `golden-rerun-rule.md` (auth
    admission/transport class — no protocol seeds/manifests/rubrics/phase machinery, no run path,
    no proxy research policy, no run-boundary security fix) → the golden re-run rule does NOT
    re-arm; threshold-5 dated note records it.
  - jrn-a ws `01M63VEG3JAE0MMRC649A4SD1M` (`is_test`, acct `01M63VEG3JHKNG5GRKHZE78VDF`, created
    10-29T12:51Z — purges ~14:51Z today, 26h window); `sub_jrna_bill3_fixture` stranded on dead
    acct `01M4XCGEPFEYYGATEBNB2YJBQF` → jrn-a reads tier=free → `topups_require_plan` → N9 Entry 2
    absent. **N9 = substrate drift, not product regression** (§14.2 correct).
  - `account_exports` `t8exp_29a491e70c5c46a1aa2f` ready+expired on the CURRENT ws (the 10-30 mint).
  - `subscriptions`/`workspaces`/`billing_accounts` no RLS; `account_exports` FORCE RLS;
    `rhema_app_login` ∈ `rhema_app`.

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows in blast radius:

- **D-OBS.1-3** — nightly JOURNEY.1 green on deployed SHA. Dated tail owed on this deploy's
  outcome (moves deployed SHA to `4938b8e`; the limiter + env-gap arms now live).
- **D-SPA.28-1** — REQ-SEQ-10 entry gate needs ≥1 nightly green since last flip; dated tail owed.
- **D-MAINT.4-1** — already DONE (PARTIAL per earlier rows — verify status cell).
- **F-R6SWP.1-4** (env-gap) + **F-R6SWP.1-5** (limiter) — the findings this deploy discharges.

## Requirements (operator directive — deliverables)

1. `pulumi preview --diff --stack prod` classified (expect image bumps + stateless proxy template
   replace; zero stateful) → `pulumi up` → provenance `gitSha=4938b8e` on web+api →
   `record-deployment` → smoke (public 200s, signed-in leg, worker consuming).
2. Migration check — DONE: max applied 0060 = repo max; nothing owed.
3. Post-deploy `gh workflow run journeys.yml --ref main -f stage=prod -f paid=false
   -f expect-sha=4938b8e…` → poll to completion → honest tally; signup legs green (limiter
   live), env-gap legs green (secrets bound+wired), N9 diagnosed.
4. GATE-LAUNCH threshold-6 dated note (run URL + verdict).
5. Real product regression ⇒ PAUSE + report (none expected — N9 was substrate).

## Findings this run (diagnosed from dispatch `40965117844` report.json, 19 fail / 25 pass / 21 skip)

- **~14 legs 429'd on `test+*` signups** (T1/T2×2/T3/T4/T5/T12F/T13F/T17/R10.keepalive/X1×5) —
  the #231 `rl:testidentity` bucket, rides this deploy's api image.
- **R6F + T7** `needs JOURNEY_DATABASE_URL`; **T8** `JOURNEY_T8_EXPORT_TOKEN` — the operator-bound
  secrets (10-30) could NEVER have reached the runner: (a) `journeys.yml` never maps
  `secrets.JOURNEY_*` into the job env (Actions never auto-injects), and (b) the bound DSN's host
  is the VPC-private Cloud SQL IP `10.46.0.3` — no connectivity path. **F-R6DEP4-1.** Fixed on
  this branch: env injection + `JOURNEY_DATABASE_URL` host→`127.0.0.1:15433` rewrite through a
  Cloud SQL Auth Proxy step (sha256-pinned v2.15.2, ADC = the WIF credentials) + `roles/cloudsql.client`
  IAMMember on the repo principalSet (`infra/pulumi/journeys.ts`). Paid arm untouched: app-login
  DSN can't satisfy the spend guard's `pg_roles` probe → the weekly cron keeps its no-db
  attestation verbatim (env+proxy gated on `!paid`).
- **N9** "Buy 1,000 credits: not in the DOM" — jrn-a free-tier substrate drift (fixture sub on
  dead acct; the ~26h purge re-mints the ws daily). Self-healing arm committed:
  `packages/journeys/src/fixture-substrate.ts` `ensureJrnaPaidFixture()` (writer/past_due row on
  the CURRENT acct — `subscriptions` is account-scoped, no RLS) + `ensureT8ExpiredExport()`
  (re-mints the SAME token hash on the CURRENT ws under `set_config('app.tenant_id')` — the bound
  static token survives every purge). N9 calls it after `returningUser("a")`; T8 before its 410
  probe. Exercised live over the tunnel this run: `sub_jrna_journey_seed` seated on
  `01M63VEG3JHKNG5GRKHZE78VDF` + `t8exp_jrn_5c4ef3991b1d22` minted expired (belt for the
  row-id-vs-token ambiguity in the bound secret — either value now 410s).

## Plan

1. Diagnose 40965117844 (done above) + fixture arms live-tested over the IAP tunnel.
2. Image build all-10 @ `4938b8e` (`_TAG=r6dep-4`, vendored SDK present, gate fail-closed).
3. Pin digests in `Pulumi.prod.yaml` → `pulumi preview --diff` classify → `pulumi up`
   (images + IAMMember + expected stateless proxy template replace) → provenance
   `--expect 4938b8e…` → `record-deployment` → smoke.
4. Push branch → dispatch `--ref stevevitali/r6dep-4-limiter-deploy` (exercises the workflow
   env-wiring + self-healing arms end-to-end) → poll. Then `--ref main` (the directive's literal
   arm — signup legs green on the deployed SHA; env-gap legs honest-red until merge) → poll.
5. Records: this ledger + pr/R6DEP.4.md + BUILD_INDEX 237 + LEDGER + DEFERRALS tails
   (D-OBS.1-3, D-SPA.28-1) + GATE-LAUNCH threshold-6 note + ci-boundary.

## Test matrix

| AC → leg | kind |
|---|---|
| Fixture arms: `ensureJrnaPaidFixture` seats writer/past_due on current acct; `ensureT8ExpiredExport` mints the bound token's hash under tenant ctx | live — executed over the tunnel 2026-10-30T05:0xZ |
| Workflow env arm: secrets reach the runner; proxy carries the private DSN | live — the branch dispatch's T7/R6F/T12F/T13F/T8 outcomes |
| Limiter fix live: ~14 `test+*` signup legs pass | live — dispatch report |
| N9 durable: Entry 2 `[data-topup-form]` mounts | live — dispatch N9 outcome |
| Provenance `gitSha=4938b8e` web+api | live — check-deploy-provenance |
| Verify | `pnpm --filter @rhema/journeys typecheck` (done — clean); journeys lint/tests; check-build-memory; append-only vs `4938b8e` |

## Progress

- 2026-10-30T04:46Z — branch cut at `4938b8e`; DEFERRALS/LEDGER/BUILD_INDEX read.
- 2026-10-30T04:5xZ — nightly 40965117844 report.json diagnosed (above); jrn-a fixture drift
  verified live; `_migrations` max 0060 (nothing owed); `t8exp_29a491e…` row confirmed present.
- 2026-10-30T05:0xZ — `fixture-substrate.ts` committed-arm written; exercised live over the
  tunnel: `sub_jrna_journey_seed` writer/past_due INSERTED on current acct (N9 seated for
  `--ref main` tonight, until ~14:51Z purge); `t8exp_jrn_5c4ef3991b1d22` minted.
- 2026-10-30T05:0xZ — `journeys.yml` env-injection + proxy step; `infra/pulumi/journeys.ts`
  `roles/cloudsql.client` IAMMember; `pnpm --filter @rhema/journeys typecheck` + build clean.
- 2026-10-30T05:0xZ — IAP tunnel `rhema-prod-proxy-6vxq` → 127.0.0.1:15433→10.46.0.3:5432 up;
  system DSN staged gitignored 0600 `docs/build/logs/r6dep4-system-dsn.txt`.
- 2026-10-30T05:0xZ — Cloud Build submitted all-10 @ `4938b8e` `_TAG=r6dep-4` (in flight).

## Gap table / Evidence log / Evidence report

(filled at close)
- 2026-10-30T05:11Z — **Cloud Build `c6d7dedb-37c6-4808-b287-c3b1a4397bb6` SUCCESS — all 10**
  at `4938b8e4024777417c5a8ed9f518f9afb4bebd08`, `_TAG=r6dep-4` (vendored-SDK gate fail-closed).
  Digests: api `7fa61aa9`, web `ad5d5cd1`, worker `aaefca88`, fetcher `ff23f011`,
  convert `3db54baa`, export `f4e9fa77`, collab `34e9300a`, turbo-cache `8bf03ad3`,
  run-task `f8d4c6d8`, egress-proxy `7f844844` — all pinned in `Pulumi.prod.yaml` w/ dated comment.
- **Commit `26f1fcd`**: journeys.yml env-injection+proxy, fixture-substrate.ts, steps.ts N9 arm,
  stb5a.ts T8 arm, infra/pulumi/journeys.ts cloudsql.client, this ledger. Code commit BEFORE
  `pulumi up` so the program (journeys.ts IAM) applies in the same up.
- 2026-10-30T05:1xZ — `pulumi preview --diff` classified: **+1 create (IAMMember
  ci-journeys-cloudsql-client), ~10 update (image rolls), +-1 replace (stateless proxy
  InstanceTemplate only), 165 unchanged — zero stateful replace/delete**, cost Δ≈$0 → all four
  GD-DEPLOY.R6 conditions hold. **`pulumi up` update 169 SUCCEEDED 05:1xZ (1m31s).**
- 2026-10-30T05:1xZ — **provenance all-PASS**: web+api `/healthz` `gitSha=4938b8e4024777417c5a8ed9f518f9afb4bebd08`.
- Tunnel: old `6vxq` STOPPING (MIG rolled); re-establish via `rhema-prod-proxy-v27m` (b) or `r847` (f).
  Next: record-deployment (DATABASE_URL=system-DSN-file GIT_SHA=4938b8e… STAGE=prod
  IMAGE_DIGESTS='{api:7fa61aa9,web:ad5d5cd1,worker:aaefca88,fetcher:ff23f011,convert:3db54baa,export:f4e9fa77,collab:34e9300a,egress-proxy:7f844844,run-task:f8d4c6d8}'),
  smoke, push, dispatch `--ref stevevitali/r6dep-4-limiter-deploy` then `--ref main` (expect-sha
  4938b8e…), poll, closeout (BUILD_INDEX 237, LEDGER, DEFERRALS D-OBS.1-3/D-SPA.28-1, GATE-LAUNCH
  threshold-6 note, pr/R6DEP.4.md, PR, check-build-memory, append-only --base 4938b8e, ci-boundary).
- 2026-10-30T05:2xZ — **`record-deployment` wrote `prod:4938b8e…`** (protocols
  `0.4.0+9c2b880dbee74bd8`, all 10 digests, over the re-established IAP tunnel
  `rhema-prod-proxy-v27m`→15433). **Smoke:** public routes 6×200
  (`/` `/pricing` `/signup` `/login` `/showcase` `/invite`); api `/healthz` 4938b8e.
- 2026-10-30T05:2xZ — branch `stevevitali/r6dep-4-limiter-deploy` pushed @ `26f1fcd`.
- 2026-10-30T05:16Z — **branch dispatch `41007476023`** (`--ref stevevitali/r6dep-4-limiter-deploy`,
  stage=prod paid=false expect-sha=4938b8e…) — exercises the env-wiring + self-healing arms.
  `--ref main` dispatch queued after (sequential — mailbox/session safety).
