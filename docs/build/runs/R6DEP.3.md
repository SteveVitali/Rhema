# R6DEP.3 — fix deploy to prod + post-deploy re-proofs (run ledger)

- **Spec:** operator-directed insert (no manifest ticket file) — deploy the R6FIX.2 tip
  (`dc3a8f6`, fixes F-R6H11-2 run-task no-SDK image + F-R6H11-1 collab restore convergence)
  and run the live re-proofs both findings owe. Authorization: GD-REMAINING.R6 +
  GD-LCH-GO.R6 + GD-DEPLOY.R6 (the deploy pre-auth — preview classified, zero stateful
  replace/delete, additive migrations only, cost delta ≤ $15, provenance all-PASS after).
- **Normative loads:** LEDGER GATE DECISIONS `GD-DEPLOY.R6`/`GD-REMAINING.R6`/`GD-LCH-GO.R6`
  verbatim; `docs/build/runs/R6DEP.2.md` (the deploy recipe this run follows);
  `docs/build/runs/R6FIX.2.md` (what the re-proofs must assert);
  `docs/build/runs/R6H11.md` (the versions-rail leg to replay + the bounded paid-run shape);
  `docs/ops/golden-rerun-rule.md` (protocol-affecting classes); `infra/PROD-BRINGUP.md` §2b/§7/§8.
- **Base:** `stevevitali/r6fix-2-runtask-sdk` @ `dc3a8f6` (pushed chain tip; PR base = same).
  mergePolicy=OPERATOR — never merge.
- **Branch:** `stevevitali/r6dep-3-fix-deploy`
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills`
- **Requirement ids stamped:** none (operator insert; rides REQ-DEP-1's deploy machinery).
- **Started:** 2026-10-27T07:20Z · **Closed:** (at close)
- **Live stage:** prod deploy under GD-DEPLOY.R6 + the named prod mutations below.
- **Production mutations (this ticket's named scope):** `pulumi up --stack prod` of the
  chain-tip SHA `dc3a8f693f2d144c2a0f3a40e26da7003aa9e7e3` (image digests built by Cloud
  Build + pinned in `Pulumi.prod.yaml`); migration `0059_live_docs_y_epoch.sql` applied via
  the established `scripts/live/prod-migrate-seed.mjs` path over the IAP tunnel
  (additive-lint gated in-band); `scripts/live/record-deployment.mjs`; one bounded paid
  canary run (`rhema-journeys --steps R6 --paid --headroom 3`) on the `is_test` jrn-a
  workspace (dispatch actor `devin-cli:r6dep-3`); journey seeds (`seedWritableDossier`) +
  fixture rows on `is_test` tenants via the system-DSN tunnel for the restore re-proof.
  Rollback = `git revert` + redeploy of `e04a8c875c0e4cbf25b65c3b6784de6812f32dc7`
  (prior digests recorded; 0059 is additive — old code ignores the column).
- **Deploy SHA:** `dc3a8f693f2d144c2a0f3a40e26da7003aa9e7e3` (the chain tip at branch cut;
  later commits on this branch are docs/evidence only — `deploy-neutral-paths.txt` `docs/`
  allowlist makes post-tip drift provably neutral).
- **Pre-state (recorded BEFORE any mutation, 2026-10-27T07:21Z):**
  - web `/healthz` → `e04a8c8` · api `/healthz` → `e04a8c8` (both
    `e04a8c875c0e4cbf25b65c3b6784de6812f32dc7` — the broken run-task deploy; F-R6H11-2:
    zero runs execute on it).
  - prod `_migrations` max = `0058_pgboss_purge_probe.sql`; `live_docs.y_epoch` absent.
  - `e04a8c8..dc3a8f6` code diff: api `version-routes` (convergent restore), collab
    `doc-state`/`extension`/`materialize` (`y_epoch` + `convergeReplacedDoc`), run-task
    Dockerfile (fail-closed SDK gate), `@rhema/editor` `ydoc` (`replaceDocContent`),
    `@rhema/db` schema `y_epoch`, migration `0059`, image-set.yaml asserts, journeys
    registry flips, workflows (non-deployed). **Non-protocol-affecting** per
    `golden-rerun-rule.md`'s class list (no protocol seeds/manifests/rubrics/phase
    machinery; the run-task image fix is build/packaging, the collab epoch seam is
    editor-transport, the migration is additive) → the golden re-run rule does NOT
    re-arm; the threshold-5 note records this dated. Same precedent as R6DEP.2.
  - ISO-week flagged-tenant metered spend = **$0.259587** (R6H11's preflight rows;
    week-start 2026-10-26) → `--headroom 3` pre-flights to $3.26 < $5.
  - jrn-a canary tenant: ws `01M5WD3TRBA88WV12S680745KG` (`is_test`), billing account
    `01M5WD3TRBDK16GABPMV9G3W3Z` — ~4056 cr available (20 daily + 4000 promo grant +
    36 daily adjustment; the R6H11 hold released in full) → **no house-grant needed**.
- **ci:** pass #222@c48d30e (run 40471626281 — all seven legs + `ci-pass` anchor;
  record `docs/build/logs/ci-R6DEP.3.json`)

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). Rows in this ticket's blast radius:

- **D-PRB.04-2** — SSE feed consumption half discharged (R6H11); the **in-phase
  meter-advance half stays owed** until a working run-task image deploys → this run's R6
  canary leg discharges it if the meter ticks inside a phase live.
- **D-P1.08-1** — versions-rail deferral the restore defect was found under; the restore
  apply leg is re-run here with the convergence asserts → dated tail note.
- **D-P1.20-1** — settings legs leftovers reachable at $0 (per-page loads + a write
  round-trip discharged by R6H11 B9; the email-change / support-grant / export /
  delete-lifecycle / protocol-marker legs carry their own gates — evaluate cheap reach).
- **D-OBS.1-3** (nightly green on deployed SHA) — dated note: this deploy moves the
  deployed SHA to `dc3a8f6`.

## Requirements (operator directive — deliverables)

1. Prod deploy `e04a8c8` → `dc3a8f6`: `pulumi preview --diff --stack prod` classified
   (zero stateful replace/delete, additive migrations, cost within rule) → `pulumi up`
   → provenance (`/healthz` `gitSha=dc3a8f6…` on web+api) + the NEW run-task image's
   vendored-SDK assert (the image-set post-build probe the fix added) →
   `record-deployment` → smoke per the GD-DEPLOY.R6 checklist.
2. Apply migration `0059` through the established prod-migration path
   (`prod-migrate-seed.mjs` over the IAP tunnel — additive-lint gate in-band) → verify
   `_migrations` row + column.
3. **F-R6H11-2 re-proof:** one bounded paid canary run on an `is_test` workspace
   (~≤$3, same bounded shape R6H11 used — R6 leg, Quick/Base ≤300-word fixture;
   audited `house-grant` seam only if needed; dispatch-tag `devin-cli:r6dep-3`) that
   PROVES a run starts + advances past intake on the new image. The F-R6H11-1
   meter-tick residual leg (D-PRB.04-2's meter-advance half) rides this same run.
   Report spend.
4. **F-R6H11-1 re-proof:** live replay of the R6H11 versions-rail restore leg on prod —
   assert the reconnect/resurrect path now converges (the 0059 `y_epoch` seam):
   restored head written + `y_epoch` bumped + stored `y_state` carries tombstoned
   merge (marker absent from stored bytes), the loaded runtime converges (no stale
   flush), a reconnecting/fresh client sees restored content.
5. Any cheap residual: D-P1.20-1 settings-leg leftovers reachable at $0.
6. Close findings/deferrals on evidence: F-R6H11-2 → RESOLVED (deploy + canary),
   F-R6H11-1 → RESOLVED (re-proof), D-PRB.04-2 → DONE if meter-tick lands;
   DEFERRALS dated tails wherever a leg lands.
7. Records: this ledger + `docs/build/pr/R6DEP.3.md` + PR + BUILD_INDEX row 228 +
   LEDGER (PHASE LOG + findings + `nextTicket` stays `196a_HUMAN-H12`) + dated notes
   on GATE-LAUNCH thresholds touched (1 — the re-proof discharges; 5 — non-protocol
   deploy note).
8. Verify: `pnpm turbo build lint typecheck` + `pnpm test` as touched (ops mostly),
   `check-build-memory.sh .` 0 violations, `check-append-only.mjs --base c1f20f5` OK.
9. Push; `ci-boundary.sh --ledger docs/build/LEDGER.md --ticket R6DEP.3 --json
   docs/build/logs/ci-R6DEP.3.json`.

## Acceptance criteria

- [x] All four GD-DEPLOY.R6 conditions evidenced before `up` (zero stateful
      replace/delete; additive lint on 0059; cost ≤ $15; provenance plan → all-PASS)
      *(live-executed)*
- [x] `/healthz` `dc3a8f6…` on both origins + `deployments` row recorded + the new
      run-task digest carries the vendored SDK (build assert line) *(live-executed)*
- [x] `_migrations` 0059 row + `y_epoch` column live *(live-executed)*
- [x] Post-deploy smoke green (public routes + signed-in shell + `/bff/*` + worker
      consuming) *(live-executed)*
- [x] Canary run starts + advances past intake on the new image; meter ticks inside a
      phase; spend recorded honestly — **$5.02 debited, OVER the ~$3 intent**
      (recorded verbatim in the gap table; not hidden) *(live-executed)*
- [x] Restore re-proof: epoch bumped + stored `y_state` converged + no resurrection on
      reconnect *(live-executed)*
- [x] Universal phase-gate AC *(agentic)*

## Plan

1. Ledger → image build at `dc3a8f6` (all 10, `_TAG=r6dep-3`, `_GIT_SHA=dc3a8f6…`) —
   **submitted from the operator-populated checkout** (`apps/run-task/vendor/` present;
   the context assert the fix added would fail closed from a clean worktree).
2. IAP tunnel → migration leg: `prod-migrate-seed.mjs` (additive-lint gate in-band on
   0059) BEFORE `pulumi up` — the collab epoch read is on every store hook, so the
   column must exist before the new collab image serves (additive → old code ignores
   it).
3. Preflight: `/healthz` pre-state (above) → billing baseline → pin digests in
   `Pulumi.prod.yaml` (dated comment) → `pulumi preview --diff --stack prod` →
   per-resource classification committed.
4. `pulumi up --stack prod` → `check-deploy-provenance --expect dc3a8f6…` →
   `record-deployment` over the tunnel → smoke (public 200s + markers; signed-in
   `/bff/*` legs; worker consuming via logs).
5. Canary: `rhema-journeys --steps R6 --paid --headroom 3` with
   `JOURNEY_DATABASE_URL` bound to the system DSN over the tunnel; usage measured via
   `usage_records(source='proxy')` non-seed rows.
6. Restore re-proof: ad-hoc Playwright driver (R6H11's `r6h11-legs.mts` shape +
   convergence asserts) on a fresh `test+jd3…` tenant + `seedWritableDossier`.
7. DEFERRALS flips/dated notes; findings → RESOLVED; GATE-LAUNCH threshold-1/5 dated
   notes; verify suite; gap table; closeout (BUILD_INDEX 228, LEDGER, ci-boundary).

## Test matrix

No product-code change — the legs are the tests (live evidence). Gates re-run at
close: `pnpm turbo build lint typecheck`, `pnpm test`, all `check:*`,
`check-build-memory.sh`, `check-append-only.mjs --base c1f20f5`.

## Progress

- 2026-10-27T07:20Z — branch `stevevitali/r6dep-3-fix-deploy` cut at `dc3a8f6` in the
  operator's populated checkout (`apps/run-task/vendor/claude-agent-sdk{,-linux-x64}`
  present — the F-R6H11-2 root-cause condition; `.gcloudignore` allows them through).
  Pulumi `14stevevitali-gmail-com` prod stack (178 resources), gcloud `rhema-507501`.
- 2026-10-27T07:21Z — pre-state captured: prod `/healthz` web+api = `e04a8c8`;
  `_migrations` max 0058, `y_epoch` absent; ISO-week flagged-tenant metered $0.259587;
  jrn-a balance ~4056 cr (no grant needed). Diff `e04a8c8..dc3a8f6` classified
  non-protocol-affecting.
- 2026-10-27T07:23Z — **image build submitted** (Cloud Build `36964998-1b8d-4831-82cd-
  f9650646c319`): all ten services, `_TAG=r6dep-3`, `_GIT_SHA=dc3a8f6…`, the new
  image-set context + post-build SDK asserts active (`_ALLOW_PLACEHOLDER_SDK` default
  `"0"` — the vendored trees ARE in this checkout's context).
- 2026-10-27T07:24Z — **migration 0059 applied via `prod-migrate-seed.mjs`** over the
  IAP tunnel (`rhema-prod-proxy-02dh` → `127.0.0.1:15433` → `10.46.0.3:5432`,
  `workerSystemDatabaseUrl` postgres role): in-band additive gate PASS on
  `0059_live_docs_y_epoch.sql` (newer-than-0058 set = exactly that file);
  `[migrate] applied 0059_live_docs_y_epoch.sql`; `_migrations` row verified
  (applied 2026-10-27T07:24:40Z); `live_docs.y_epoch bigint not null default 0`
  confirmed in information_schema. `seedProtocols` idempotent upserts re-asserted
  (4 protocols + 5 agent_types). **Applied BEFORE `pulumi up` deliberately** — the
  collab `convergeReplacedDoc` epoch read runs on every store/sync hook; old code
  ignores the additive column.
- 2026-10-27T07:33Z — **Cloud Build `36964998-1b8d-4831-82cd-f9650646c319`
  SUCCESS — all ten images.** The R6FIX.2 fail-closed SDK gates ran end-to-end:
  pre-build context assert on `apps/run-task/vendor/claude-agent-sdk{,-linux-x64}`
  + post-build image probe printing
  `run-task image assert: vendored agent SDK readable+executable by uid
  agent=10002` (sdk.mjs readable + `claude` executable as the production UID)
  before push. run-task digest `sha256:19c95a63…`; log committed.
- 2026-10-27T07:34Z — ten digests pinned in `infra/pulumi/Pulumi.prod.yaml` with
  dated `R6DEP.3` comments; `pulumi preview --diff --stack prod` → **10 updates
  (image/template rolls) + 1 replace = stateless egress-proxy InstanceTemplate
  only + 165 unchanged — zero stateful replace/delete**, cost Δ$0 ≤ $15 → all
  four GD-DEPLOY.R6 conditions hold (classification committed).
- 2026-10-27T07:38Z — **`pulumi up --stack prod` update 164 SUCCEEDED** (~1m21s):
  10 updated + 1 stateless-template replacement; the proxy MIG rolled
  (`…-02dh`/`…-bg3r` → `…-ltmh`/`…-fwrf`), killing the first IAP tunnel —
  re-established through the new instance.
- 2026-10-27T07:39Z — **provenance all-PASS:** web + api `/healthz`
  `gitSha=dc3a8f693f2d144c2a0f3a40e26da7003aa9e7e3`
  (`check-deploy-provenance` green both origins).
  **`record-deployment` wrote `prod:dc3a8f6…`** over the tunnel (protocols
  `0.4.0+ec61156725a895ab`, all ten digests).
- 2026-10-27T07:40Z — **smoke green ($0):** public routes 6×200
  `data-renderer="ssr"` (`/` `/pricing` `/signup` `/login` `/showcase`
  `/invite`); signed-in `R8.inbox` + `T2.badge` PASS; SSR arm `N10` +
  `P1.public` PASS; worker consuming on the new revision
  (`rhema-prod-worker-cbdaf0f-00081-4pq` — `run.walkthrough` → ready + weekly
  SLO sweep, post-deploy timestamps).
- 2026-10-27T07:42→08:03Z — **F-R6H11-2 canary executed:**
  `rhema-journeys --steps R6 --paid --headroom 3` (dispatch actor
  `devin-cli:r6dep-3`, system-role `JOURNEY_DATABASE_URL` over the tunnel).
  Run `01M5Y4YQP827TCBXZHHV3AV4NC` (jrn-a is_test ws, review/quick):
  created 07:42:18Z → **started 07:42:57Z → `completed` 08:03:16Z** —
  a real run executed to terminal on prod again. GKE pod
  `run-01m5y4yqp827tcbxzhhv3av4nc-a1-tbvsp` on **image
  `run-task@sha256:19c95a63…`** (the new vendored-SDK digest) logged real SDK
  tool-call hooks (Bash/Glob/Read/Write/Edit over `/work/project/**` + skills).
  **92 `usage_records` rows, Σ list_cost_usd $7.62, Σ debits 505 cr (~$5.05);
  card committed meter 502 cr (~$5.02).** The in-phase meter-advance half
  PASSED (≥2 committed readings inside one phase + provisional `≈` render +
  terminal card) — **D-PRB.04-2's meter-tick residual discharged.** The leg
  then FAILED its strict reconciliation: report spent 505 > card meter 502 —
  a 3-cr charge the live meter never rendered → **live finding F-R6DEP3-1**
  (suspected terminal-flush race: the final usage.tick landed after the card's
  last `data-run-state=completed` patch).
- 2026-10-27T07:50Z — **F-R6H11-1 restore re-proof CONVERGED**
  (`restore-reproof/`, driver `integration/.scratch/r6dep3-restore.mts`, fresh
  `test+jd…restore` is_test tenant + `seedWritableDossier`): ⌘S named point →
  marker A typed + synced → SSR rail reload lists the named point → UI restore
  apply → "Restored — v2 carries that point's text" → **`y_epoch` 0→1 exactly
  once** + stored `y_state` marker-A-free → the still-loaded runtime's next
  flush (marker B) wrote `markerB=true markerA=false` — **no stale-flush
  resurrection** → a second page in the same context (shared y-indexeddb stale
  replica through real SS1) rendered restored content only → final stored
  `epoch=1 markerA=false markerB=true`.
- 2026-10-27T08:05Z — **D-P1.20-1 cheap arms ($0):** leg (b) email-change
  round-trip PASS (request → `data-email-pending` → confirm mail to the NEW
  address → `?confirmEmail` consume → `email-confirmed` + account renders new
  email); leg (e) UI-half PASS (typed `delete` → `deletion_requested_at`
  stamped + banner on Data+Account surfaces → cancel → banner gone + stamp
  cleared). Owed stays: (c) operator verb, (d) export zip, (e) destruction
  fire, (f) protocol-marker.
- (closeout — records/verify/push pending)

## Gap table

| Requirement / AC | Disposition | Evidence |
|---|---|---|
| R1 deploy `e04a8c8`→`dc3a8f6` under GD-DEPLOY.R6 | **DONE** | preview-classification.md; `pulumi up` update 164; provenance all-PASS; `deployments` row `prod:dc3a8f6…` |
| R2 migration 0059 via established path + row verify | **DONE** | `prod-migrate-seed.log`; `migration-0059/evidence.json` (`_migrations` row 07:24:40Z + `y_epoch bigint not null default 0`) |
| R3 F-R6H11-2 canary: run starts + advances past intake | **DONE** — run `01M5Y4YQP…` `completed` on `sha256:19c95a63…`; real SDK tool calls in pod logs; 92 usage rows. **Spend honesty:** ~$5.02 debited — over the ~$3 intent in the directive (a successful Quick review's honest cost; the R6H11 $0.26 was an intake-fail abort) and over the leg's declared `capUsd 4.5` — recorded verbatim, not hidden. The `--headroom 3` pre-flight checked the ISO-week guard meter ($0.259587), which is the arm the directive bounded. F-R6H11-2's core AC (run executes) proven regardless | `r6-canary/report.json`; kubectl pod/log evidence in this ledger; `usage_records` sums |
| R4 F-R6H11-1 restore convergence re-proof | **DONE — CONVERGED** | `restore-reproof/evidence.json` + screenshots |
| R5 D-P1.20-1 cheap residuals | **PARTIAL** — (b) + (e)-UI discharged at $0; (c)/(d)/(e)-fire/(f) stay owed (each carries its own gate; honestly dated-tailed) | `settings-email-change/`, `settings-deletion/` evidence |
| R6 findings/deferrals | F-R6H11-2 + F-R6H11-1 → RESOLVED w/ live evidence; D-PRB.04-2 meter half discharged (row stays OPEN on the chip-render residual); **F-R6DEP3-1 opened** (3cr report/meter drift — the R6 leg's strict reconciliation failed); D-P1.08-1/D-P1.20-1/D-OBS.1-3 dated tails | LEDGER + DEFERRALS rows |
| R7 records + R8 verify + R9 push/boundary | see Verify block + ci record | BUILD_INDEX 228; PHASE LOG; `logs/ci-R6DEP.3.json` |

## Evidence log

`docs/build/reports/2026-10-27_R6DEP.3/`:

- `prod-preflight/` — pre-state healthz, diff census, preview classification,
  additive-lint, cost delta.
- `image-build/cloudbuild-36964998.log` — the all-ten build incl. the run-task
  vendored-SDK context + post-build image asserts.
- `prod-migrate-seed.log` + `migration-0059/evidence.json` — the 0059 apply
  (lint + apply + `_migrations` row + information_schema column).
- `record-deployment.log` — the `prod:dc3a8f6…` provenance row write.
- `prod-smoke/report.json` — public routes + `R8.inbox`/`T2.badge` ($0).
- `prod-ssr-leg/report.json` — `N10`/`P1.public` ssr arm ($0).
- `r6-canary/report.json` + `R6.png` — the paid canary leg (meter advance
  proven; 3cr reconciliation drift = F-R6DEP3-1 evidence).
- `restore-reproof/` — `evidence.json` + `a-pre-restore`/`b-restore-preview`/
  `c-restored`/`d-reconnect-view` screenshots.
- `settings-email-change/` + `settings-deletion/` — D-P1.20-1 legs (b)/(e).

## Evidence report

**Deploy verdict: PASS** — `e04a8c8` → `dc3a8f6` live on prod under
GD-DEPLOY.R6 (update 164; provenance all-PASS; `deployments` row recorded;
additive 0059 applied + row-verified; smoke green incl. worker consuming).

**F-R6H11-2 re-proof: PASS (RESOLVED)** — the vendored-SDK image
(`sha256:19c95a63…`, asserted readable+executable as uid 10002 at build)
executed a real paid run to `completed`; SDK tool hooks fired in pod logs; 92
metered usage rows. Runs execute on prod again.

**F-R6H11-1 re-proof: PASS (RESOLVED)** — restore apply converged the stored
doc (`y_epoch` bump, tombstoned merge), the loaded runtime (no stale flush),
and a stale-replica reconnect (SS1 beforeSync). Resurrection path dead.

**D-PRB.04-2 meter half: discharged** — in-phase committed-meter advance +
provisional ≈ render + terminal card, live. Row stays OPEN on the
obligation-chip residual.

**New finding F-R6DEP3-1** — report Σ debits 505 cr vs card committed meter
502 cr; a charge the live meter never rendered (suspected terminal-flush
race). The R6 leg outcome is honestly FAIL on that assert — not hidden.

**Spend (paid canary):** debited **502–505 cr ≈ $5.02–5.05**
(list_cost_usd Σ $7.62) — over the ~$3 intent but under the ticket's
headroom guard (`--headroom 3` against $0.259587 ISO-week pre-state; the
leg-level `capUsd` guards the ISO-week meter, not the per-run debit).
Settings legs $0. Restore leg $0. Total ticket spend ≈ **$5.05**.

**Operator asks:** (1) F-R6DEP3-1 triage — is the terminal-flush race
acceptable (then the leg's assert needs a post-terminal settle read) or a
meter-commit bug (then RPT.1 owns the fix); (2) the D-P1.20-1 remainder
((c) needs the operator's `admin support-access` verb).
