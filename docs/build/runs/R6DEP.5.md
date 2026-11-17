# R6DEP.5 — maintenance deploy of `main` to prod + the better-auth 1.7.25 schema-check finding (run ledger)

- **Spec:** operator-directed insert (no manifest ticket file) — deploy `main` to prod under the
  8-condition discipline. Original authorized target: main tip `669b586d`; **superseded** — the
  preview walk found a prod-fatal defect in that payload (below); the deploy target becomes the
  merge-tip of #385, which carries the fix. Authorization: operator ruling 2026-11-17 (deploy at
  merged main tip; preview → classified diff → `pulumi up` → provenance → deployments row →
  rollback recipe → CDN invalidation → four-fixture golden re-run at the committed $46.94
  estimate, ≤$100 cap, GD-GOLDEN-CAP.R6 one-shot). mergePolicy=OPERATOR — never merge.
- **Normative loads:** `docs/tickets/DEFERRALS.md` (read first); `infra/PROD-BRINGUP.md`;
  `docs/build/runs/R6DEP.4.md` (recipe); `docs/ops/golden-rerun-rule.md`;
  `docs/ops/deploy-neutral-paths.txt` via `scripts/deploy-neutral-paths.txt`.
- **Base:** `origin/main` @ `669b586da9d2121fa86da7f8a657d2158ad7fb0d` (pre-fork tip; deploy target
  moves to #385's merge SHA).
- **Branch:** `stevevitali/r6dep-1-main-deploy` (name predates the carrier-ID correction — the
  carrier is `301_R6DEP.5`; `R6DEP.1`–`.4` are prior deploy carriers).
- **Harness:** devin-cli/swe-2-high.
- **Started:** 2026-11-17T~07:00Z · **Closed:** (at close).

## Production mutations (named scope)

- `pulumi up --stack prod` (image rolls + the classified creates/updates below).
- `scripts/live/prod-migrate-seed.mjs` — **migrate-first ordering** (see § ordering hazard):
  applies `0063`/`0064`/`0065` under the HOT.1 additive gate while the old revision still serves.
- `scripts/live/record-deployment.mjs`.
- `scripts/live/cdn-invalidate-demo.mjs --path '/bff/p/demo~*'` (dry-run + actual, both committed).
- REQ-WRT writes under `GD-PREAUTH-ACTS.R6` (§ REQ-WRT legs).
- Golden re-run dispatch (`nightly-golden-driver`/`journeys` four-fixture cohort).
- Rollback: `git revert` + redeploy of `040e36a9fd676fe2f9e17e44d87219cf97658c1d` (digest pins in
  `Pulumi.prod.yaml` history); migration rollback = none needed (all three additive).

## Pre-state (recorded BEFORE mutations, 2026-11-17)

- prod `/healthz` web+api = `040e36a9fd676fe2f9e17e44d87219cf97658c1d`.
- prod `_migrations` max = `0062_drafts_discard.sql` (62 applied); `outbox` absent; pending
  verification census = 0 → migrations `0063_pgboss_queue_policies`, `0064_outbox`,
  `0065_account_issuer_default` owed.
- Evidence: `reports/2026-11-17_301_R6DEP.5/prestate-{healthz,db,pins}.txt`.
- Payload `040e36a9..669b586d`: outbox (0064 + drain), pg-boss queue policies (0063), Roman-ordinal
  draft-ledger parser fix, **better-auth 1.7.2 → 1.7.25** (RH-0 / GHSA-965c-763c-88jm),
  protocols version bump → **protocol-affecting** per `golden-rerun-rule.md` → four-fixture
  golden re-run armed.

## F-301_R6DEP.5-1 — the schema-check finding (deploy-gating, found by the preview walk)

- `pr-385` preview walked to green infra (post-ALIGN_COUNT fix), 64/64 migrations, provenance
  `669b586d` — then **every** `/api/auth/*` request returned 500, logged only as
  `BetterAuthError` (`stackForLog` strips the message; `BetterAuthError.stack` is `""` by the
  library's own constructor — the class is all the log can carry).
- Root cause: better-auth **1.7.25 added a runtime schema check** (`ctx.checkSchema` —
  `pg_catalog` introspection vs the adapter's expected shape) invoked on every auth request;
  a mismatch is cached and rethrown per-process. `0025`'s `account.issuer` **NOT NULL** (1.7.2's
  `{issuer, accountId}` key — 1.7.25 never writes `issuer`) is flagged "Required columns Better
  Auth never writes"; `account` INSERTs would fail regardless of the check.
- **Reproduced against the prod schema** — the identical finding (read-only introspection as
  `rhema_app_login` through the IAP tunnel) — the `669b586d` images would have 500'd all of prod
  auth. The preview was not env-specific; it caught a real landmine.
- Fix (on this branch): migration `0065` — `ALTER COLUMN issuer SET DEFAULT 'local:oauth:unused'`.
  `SET DEFAULT`, not `DROP NOT NULL`: the HOT.1 additive gate flags ANY `drop` token, and the
  column's nullability is dead metadata (nothing reads `issuer`). Makes the column non-required
  for the check (`atthasdef`) and lets inserts succeed.
- Regression coverage: `apps/api/src/auth-schema-check.test.ts` runs the real `createAuth` +
  `auth.handler` against the migrated PGlite schema via the pg.Pool-shaped shim the adapter's
  `"connect" in db` → PostgresDialect detection requires — passes at tip, correctly fails on a
  schema pinned pre-`0065`.
- `@rhema/db` gains a `./testing` export (`createTestDb`) — the `@rhema/orchestrator/testing`
  convention — so dependent packages can test against the migrated schema.

## Infra diff (pre-image re-pin preview, classified 2026-11-17)

`+8 create / ~5 update / 0 delete / 0 replace / 175 unchanged`:
- Creates: the `:80` HTTP→HTTPS redirect trio (BL-121), 2 uptime checks + 3 alert policies
  (OPS.5/#354 work — incl. `monitoring-absent`, which 400'd on preview create: DELTA absence
  conditions require `aggregations[].perSeriesAligner`; fixed via `ALIGN_COUNT` — the same shape
  was pending in the prod diff, so this also unblocks `pulumi up` there).
- Updates: AR cleanup policy (BL-122), 3 bucket lifecycle drops (BL-123), Cloud SQL
  `sslMode → ENCRYPTED_ONLY` (SEC.3) — in-place update, non-destructive.

## Ordering hazard (schema-check poisoned-cache)

The check caches a mismatch for the adapter's process lifetime (`schema-check.mjs`: "a mismatch is
kept … and rethrown on every later call without asking the store again"). If the new api served an
auth request before `0065` landed, that instance would stay broken until a revision roll. All three
migrations are additive against the running `040e36a9` (1.7.2 writes `issuer` explicitly; `0063` is
policy metadata; `0064` is a new table), so the order is **migrate-first → `pulumi up`** — the new
api's first auth request hits an already-correct schema. (Belt: post-up a no-op api revision roll
still clears any early-hit instance.)

## REQ-WRT legs (GD-PREAUTH-ACTS.R6, executed/verified 2026-11-17T12:4xZ)

- **REQ-WRT-1** (res2-retro-apply): verified **already applied** — `01M3EAAZ…` carries
  `delivery.label='unverified'` + `refundedCredits:56` + `platformFaultSettledAt 2026-10-21`;
  `01M3SK62…` resolved absent (act recorded 2026-10-21). Dry-run correctly MISMATCH-failed closed.
- **REQ-WRT-2** (bl38-stamp-rewrite): verified **already dispositioned** — `prod:d5a74cc` absent;
  the row now carries the full-sha id `prod:d5a74cc1c23047f471b9d32680ebac55fd8d0c4d`.
- **REQ-WRT-3** (hand-date-tombstone): **EXECUTED + VERIFIED** — `r6wrt1-tombstone-probe` project
  `01M7MRPYK1VH37H3AHA8CSZJSJ` (draft `01M7MRPYQ4DDGJ3CQ9X7SGSPAQ`) tombstoned `deleted_at`
  2026-10-18 (~30.04d) + `project.purge` job armed past-due; the worker tick fired it
  `completed_on 2026-11-17T12:46:36.440Z` (≈2s after arm) — project row gone, draft row gone
  (real tree delete). D-P1.04-2's destruction half discharged live (REQ-CLK-3 read).
  Artifacts `reports/2026-11-17_R6WRT.1/req-wrt-3/`.
- **T8 mint + BL-78 seeds**: **blocked pending jrn-a re-provision** — the ~26h test-tenant purge
  reaped `test+jrn-a@rhema.tools` entirely (no user row on prod). Its next sign-in — which the
  golden re-run's driver performs anyway — re-provisions the flagged workspace; both legs run
  after golden. (No improvisation onto a different tenant: the ruled scope is jrn-a.)
- Evidence: `reports/2026-11-17_R6WRT.1/req-wrt-{1,2,3}/`.

## Deploy execution (2026-11-17, prod `05c1e8dd` then `73902381`)

- #385 merged 13:23Z → tip `05c1e8dd` → all-10 build `8b2f2098` SUCCESS; `pr-385` re-walked
  (migrate-first applied `0065`, auth green — real `invite_required` 403 + `get-session` 200);
  prod `prod-migrate-seed` applied `0063/0064/0065` migrate-first (additive gate clean).
- `pulumi preview --diff` classified: +8 (redirect trio + monitoring), ~15 (AR policy, bucket
  lifecycles, `sslMode→ENCRYPTED_ONLY`, 9 image bumps, proxy MIG), 1 stateless template replace.
- **Update 179** partially landed → api revision `00109-65m` crash-looped: `pg_hba … no encryption`.

### F-R6DEP.5-1 — ENCRYPTED_ONLY precondition was false (deploy-blocking, parked)

- RH-35's premise — "every client DSN already carries `sslmode=require`" — was false on prod:
  the composed DSNs write as `SecretVersion.secretData` (write-only + `ignoreChanges`), so the
  stored versions still hold the original plaintext strings; node-postgres defaults to plaintext.
- **Update 180** reverted `sslMode → ALLOW_UNENCRYPTED_AND_ENCRYPTED` (verified on the instance);
  old api revision kept serving; `dep5`-suffix revision forced the `05c1e8dd` api live.
- Parked posture committed on **#387** (operator-merged → `73902381`). Re-land follow-up:
  re-seed stored DSN versions with `sslmode=require`, roll all consumers (incl. operator-seeded
  worker/system DSNs), verify encrypted, then re-flip — dated note appended on `D-R6SEC.3-1`.

### F-R6DEP.5-2 — origin guard 403'd every browser POST (write-path outage, fixed `73902381`)

- RH-23's same-origin mutation guard compared `Origin` to `c.req.url`'s origin — `http:` inside
  the container (TLS ends at the GFE) vs browsers' `https:` → ~13 min write-path outage.
- Web rolled back to prior digest (`72ee5c82`) → POSTs restored. **Residual:** the new api wraps
  verify links into `/auth/magic-link` (RH-32 interstitial, new-web-only) — magic-link sign-in
  was broken in the interim state (interstitial 404; api verify itself worked — direct verify
  minted jrn-a's session for the golden leg).
- Fix on **#386** (operator-merged): guard honors `x-forwarded-proto: https` (same signal the
  `Secure`-cookie stamp already trusts); regression test covers the exact prod shape — 16/16
  hardening + 121/121 server tests.

### Final deploy (`73902381`, update 182–183)

- all-10 build `9bb7468c` SUCCESS (first attempt `a2113755` failed on an operator `_AR`
  substitution typo — no infra impact); prod yaml re-pinned to the `73902381` digests.
- Update 182: 9 updates + 1 replace landed; api revision `00112-tcb` failed startup on a
  **transient** Secret Manager `accessSecretVersion` gRPC `CANCELLED` (~74 s retry → exit(1);
  `vpc-access-egress=private-ranges-only` means SM traffic does not transit the VPC/proxy).
  Forced fresh revision `dep5b` at the same digest → healthy, 100%. Targeted `pulumi refresh`
  (update 183) synced api state; residual stack diff is cosmetic (revision-name normalization +
  replaced-template delete-original) — converges on the next routine `up`.
- **Provenance PASS** both origins @ `73902381`; deployments row `prod:73902381…` written
  (rate_table `2026-11-17`); CDN invalidation `/bff/p/demo~*` **DONE**
  (`operation-1794940065478` @ 18:27:45Z on `rhema-prod-urlmap-6f2b86e`; dry-run + operation
  record in `reports/2026-11-17_301_R6DEP.5/cdn-invalidation/`).
- **Sign-in verified end-to-end live:** real magic link → interstitial 200 → confirm click →
  `/app` signed in; cookie `__Host-rhema.session_token` Secure/HttpOnly/host-only — the
  interstitial outage is resolved and the cookie contract holds.

### F-R6DEP.5-3 — journey legs don't know the interstitial confirm (harness gap, not a defect)

- Prod smoke at `73902381`: **N10 PASS $0**; N1/N3 reach the interstitial but `waitForURL`
  times out — the legs don't perform the RH-32 confirm click (anti-prefetch by design).
  Product flow verified manually (above). Owed: a journeys step update for the confirm gate —
  carried as backlog, not a product finding.
- T8 mint `--fresh` executed → leg **PASS $0**; BL-78 seeds executed — `mooted` dossier +
  `entitlement` arm live on jrn-a's re-provisioned workspace.

### Golden re-run (`r6dep5-a`) — COMPLETE, gate green

- 4/4 legs `completed` on prod `73902381`, jrn-a's `is_test` workspace (audited 10000-cr house
  grant): essay $9.91 (1756 cr), academic $10.05 (1869 cr), op-ed $6.56 (1205 cr),
  memo $5.19 (974 cr) — **$31.71 measured vs the $100 cap** (est. $46.94).
- Every floor green per leg: `schemaValid`, `citedFetched`, `attestationViolations=0`, and
  severity counts inside `GOLDEN_LIVE_FLOORS` (blocking ≤4, major ≤12, minor ≤14, note ≤18).
  Measured doc: `reports/2026-11-17_301_R6DEP.5/golden-scores.json` (driver-verbatim queries;
  the driver's DB watch had dropped ECONNRESET mid-MIG-roll, so measurement ran by the same
  queries on memo completion — re-dispatch would have minted fresh idempotency keys → double
  spend).
- `--execute --scores` leg: manifest written (`evals/fixtures/nightly-manifest.json`, 4
  fixtures) → `gateFixtures` **PASS ×4 (7 floor checks each), "Promotion OK"**.
- Memo carried one transient `ERR 42703` in-flight — **dispositioned 2026-11-17 (second look):
  a probe artifact, not a product or harness error.** Zero error-type rows in `run_events` /
  `run_events_internal` for the run; zero 42703 hits in api/web/worker/run-task logs across the
  window. The 42703 was emitted by the ad-hoc event-summary probe itself (it selected a column
  the current schema lacks). Run completed clean, review within floors — nothing owed.

## Pending (as of this write)

1. The committed-vs-applied re-pin commit for `Pulumi.prod.yaml` — **PR #388 open**, awaiting
   operator merge (mergePolicy: OPERATOR).
2. Final records commit (this ledger + LEDGER/index + reports + DEFERRALS dated notes) —
   gitleaks + append-only green; the repo-wide build-memory structural check reports only
   pre-existing violations (none introduced by this change set).
3. Watch sweep continues: worker clean post-roll; all 15 alert policies enabled post-deploy;
   alert *states* (SLO-burn/no-data-silence/edge-health etc.) are standing-watch information
   for the named owners, not new findings from this deploy.
