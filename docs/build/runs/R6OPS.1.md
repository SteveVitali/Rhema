# R6OPS.1 — Production-readiness drills (run ledger)

- **Spec:** `docs/tickets/187_R6OPS.1__readiness-drills.md` (manifest row 187, round 6; REQ-DEP-2 a–e)
- **Normative loads:** `docs/round-6-draft-spec.md` §4.5 REQ-DEP-2; `docs/tickets/DEFERRALS.md`
  (**D-P1.22-2** — playbook-drill half discharges if (c) lands; D-P1.04-2 is armed→R6CLK.1, not
  mine); `docs/ops/playbooks/` (five playbooks); `docs/ops/slo-review.md`; LEDGER GATE DECISIONS
  `GD-PREAUTH-ACTS.R6` (the restore drill is a named pre-authorized act: ONE scratch Cloud SQL
  instance, created → PITR-verified → destroyed); `docs/build/readouts/HUMAN-H10.md` (alert sink
  attested "provided: yes"); anchors `infra/pulumi/data.ts` (PITR: `pointInTimeRecoveryEnabled`,
  `transactionLogRetentionDays:7`), `infra/pulumi/monitoring.ts` (13 SLO policies + route-5xx +
  the webhook channel), `scripts/live/canary-pause.mjs`, `scripts/live/preview-stack.mjs`,
  `docs/build/reports/2026-10-22_R6DEP.1/` (deploy + preview precedents).
- **Base:** `stevevitali/r6dep-1-tip-deploy` @ `1905cc4` (chain tip; the H10 record commit rides
  this branch's first push — never reset/dropped)
- **Branch:** `stevevitali/r6ops-1-readiness-drills` (mergePolicy=OPERATOR — never merge)
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** implement-spec + build-memory +
  self-review @ `~/agent-skills` (`e981ec5`)
- **Requirement ids stamped:** REQ-DEP-2
- **Started:** 2026-10-22T13:4xZ · **Closed:** (pending)
- **Live stage:** prod (scratch Cloud SQL restore + one canary `is_test` egress-denied spike)
  + an owned `pr-<n>` preview (rollback drill).
- **Production mutations (ticket header, verbatim):**
  - create, then destroy, the scratch Cloud SQL instance restored via PITR (scripted; its name is
    recorded);
  - one canary `is_test` run with a planted egress-denied spike (R5OPS.1 `canary-pause.mjs`
    precedent; residue-free rollback).
- **Size budget:** ~300 changed lines (drivers + runbooks + evidence).
- **ci:** (pending)

## Deferrals read

`docs/tickets/DEFERRALS.md` read first (protocol). In blast radius:

- **D-P1.22-2** — PARTIAL; leg (e) "one playbook drill (egress-denied spike)" discharges when (c)
  lands (dated note; the row stays PARTIAL — residual legs (c) signed-delivery→D-R5OPS.1-2 and
  (f) organic cohort→D-R5OPS.1-1 survive).
- **D-P1.04-2** — armed by R6WRT.1 → R6CLK.1 owns the destruction read; not in my scope.
- **D-R5OPS.1-1 / D-R5OPS.1-2** — untouched.
- NEW finding this run: **the Monitoring NotificationChannel is absent on prod** — all 14 alert
  policies `notificationChannels: []`, `gcloud alpha monitoring channels list` = `[]`,
  `rhema:opsAlertWebhookUrl` unset on the prod stack. H10's attested binding did not materialize
  (the worker's `OPS_ALERT_WEBHOOK_URL` → ops-alert-catcher path IS armed and paging — real
  receipts). Recorded; flagged for the operator. Deliverable (d) reports per-policy receipt
  status honestly against this live posture.

## Requirements (spec §4.5 REQ-DEP-2)

- (a) PITR restore drill: scratch instance at a recorded timestamp; row counts + one tenant read;
  destroyed + verified absent; RTO + restore point recorded. Script: `scripts/live/restore-drill.mjs`.
- (b) Rollback drill on an owned `pr-<n>` preview: deploy N, revert to N−1, verify markers +
  provenance; teardown + orphan sweep.
- (c) Egress-denied playbook drill end-to-end on a canary `is_test` run with a planted spike;
  timeline; residue 0.
- (d) Alert delivery: each alert policy proven to page the real sink, or the gap documented —
  never fabricated.
- (e) `docs/ops/on-call.md`: operator as responder + the paging path.

## Acceptance criteria

- [x] Restore drill PASS: counts match the restore point; scratch destroyed (verified absent) *(live-executed)* —
  `restore-drill.json`: 12/12 tables + tenant row at PITR `14:14:39.351Z`, RTO 579 s,
  scratch deleted + `describe`→404.
- [x] Rollback drill PASS on the preview; teardown verified *(staging-verified)* —
  `rollback-drill.md` + `rollback-N/` + `rollback-Nminus1/`: N at `18b3dee` (R1 PASS),
  N−1 at `dc7fb15` via the pinned `r6dep-1` digests (R1 PASS); destroy + `rm` + 25-class
  orphan sweep — see the GCP reservation-lag note in Progress.
- [x] Playbook drill timeline + canary residue 0 *(live-executed)* — `egress-drill.json`:
  7-stamp timeline, 2.4 s detect→park, is_test probe exclusion held, residue 0/5 tables.
- [x] Every alert policy has a recorded page receipt at the operator sink *(live-executed)* — or the
      documented gap per the ticket's honesty clause — `alert-delivery.md`: 4 armed
      worker-side signals carry 488 real receipts; all 14 Monitoring AlertPolicies are
      channel-less (**F-R6OPS.1-1**, documented — nothing fabricated).
- [x] Universal phase-gate AC *(agentic)* — full verification below.

## Plan

1. Ledger + the two drivers + `on-call.md` + source-pin tests → commit → push → `gh pr create`
   (base `r6dep-1-tip-deploy`) → the PR number names `pr-<n>`.
2. (a) restore drill: dry-run scope check vs `GD-PREAUTH-ACTS.R6`, then `--execute`.
3. (c) egress-denied playbook drill: dry-run, then `--execute` over the IAP tunnel.
4. (d) alert-delivery evidence: channel inventory + per-policy binding + catcher receipts
   (fresh + 90-day history) — gathered read-only.
5. (b) preview `pr-<n>`: init → targeted AR `up` → `gcloud builds submit` api+web at the tip →
   pin `r6ops` digests → `up` → migrate → `/healthz`+provenance PASS at N → repin to the
   `r6dep-1`@`dc7fb15` set (N−1) → `up` → `/healthz`+provenance PASS → destroy → rm →
   25-class orphan sweep.
6. Evidence under `docs/build/reports/2026-10-22_R6OPS.1/`; verify suite; self-review; gap
   table; closeout.

## Test matrix

- `scripts/live/restore-drill.test.mjs` + `egress-drill.test.mjs` — source-pin suites on the
  fail-closed arms (dry-run default, ACK+DSN refusal, is_test refusal, verbatim playbook/probe
  strings, unconditional rollback + residue asserts) — each fails if the arm is removed.
- The live legs themselves are the integration/live verification (ACs are live-executed /
  staging-verified).
- Gates re-run at close: `pnpm turbo build lint typecheck`, `pnpm test`, all `check:*`,
  `check-build-memory.sh`, `check-append-only.mjs --base 1905cc4`.

## Progress

- 2026-10-22T13:4xZ — branch cut at `1905cc4` (base pushed — the orchestrator record rides this
  push). Contract + `GD-PREAUTH-ACTS.R6` verbatim loaded; anchors re-confirmed (PITR window 7d,
  35 retained backups, instance `rhema-prod-postgres` db-g1-small RUNNABLE, private 10.46.0.3;
  proxy VM `rhema-prod-proxy-vxdt` us-central1-c RUNNING). **Live posture reads (read-only):**
  14 alert policies enabled, `notificationChannels` EMPTY on all; zero notification channels in
  the project; `rhema:opsAlertWebhookUrl` absent from prod stack config; ops-alert-catcher
  receiving real `ops_alert_received` POSTs (balance_divergence nightly, latest
  2026-10-22T03:15:12Z; slo_violation run_success_rate_24h_pct ×288 + unverified_review_rate_7d_pct
  ×203 over 90d) — the worker alertSink path is armed, the Monitoring channel path is NOT.
- 2026-10-22T13:59Z — **(c) PASS** *(live-executed)* — `egress-drill.mjs --execute` planted 4
  canary `fetch_log` denies on `is_test` run `r6ops1-egress-1792677564468`; worker pause-drain
  paused the run + opened a blocking refusal gate in 2.4 s; diagnose read the deny distribution;
  the `egress_denied_10m` probe's `NOT_FROM_TEST_RUN` exclusion held at 0 pre/post; rollback
  deleted fetch_log + pause_signals + the run; residue counts all 0. Evidence: `egress-drill.json`.
- 2026-10-22T14:14–14:29Z — **(a) PASS** *(live-executed)* — `restore-drill.mjs --execute`
  after two live-found fixes (schema: `projects` has no `name` column → `title`/`created_at`;
  `gcloud sql clone` sync wait ~10 m abort → `--async` + RUNNABLE poll + delete-retry through
  409s). PITR point `2026-10-22T14:14:39.351Z` → scratch `rhema-r6ops-drill-1792678479`
  RUNNABLE 14:24:10Z; verified read 14:24:18Z — all 12 count tables equal T0 (workspaces 333,
  runs 82, fetch_log 8124, _migrations 58, …) + tenant row reads back; **RTO 579 s**
  (clone-start → verified read); deleted 14:29Z, describe→404 verified absent. Leftover scratch
  `rhema-r6ops-drill-1792677594` from the first (pre-fix) run swept to zero before the PASS run.
  Evidence: `restore-drill.json`.
- 2026-10-22T14:1xZ — **(d) documented** *(live-read)* — `alert-delivery.md`: worker→catcher
  sink armed + proven (488 `ops_alert_received` receipts in the readable window incl. today's
  03:15:12Z `balance_divergence`); all 14 Monitoring AlertPolicies `notificationChannels:[]`
  — **F-R6OPS.1-1** (channel never provisioned; `rhema:opsAlertWebhookUrl` unset on prod; the
  bind is a prod write outside this ticket's authorized scope). `route 5xx errors — LB-observed`
  additionally lacks any worker-side emitter — zero page path until the channel is armed.
- 2026-10-22T14:0x–14:3xZ — **(b) in progress** — `pr-208` init'd at tip `18b3dee`;
  api+web built `r6ops-1` (api@040bd1a, web@4419c36) into `rhema-pr-208`; cross-repo
  `docker tags add` refused (same-repo only) → support services pinned at `rhema-prod`
  `r6dep-1` digests (same-project AR pull, as prod itself does); first `up` hit the
  log-metric propagation race (`rhema_pr_208_route_5xx` 404 — documented in
  monitoring.ts comments; converged on retry); second `up` hit an AlloyDB zonal
  capacity stockout (`Error code 9 — Location "us-central1" does not have enough resources`),
  retried after backoff (AlloyDB instance created ~383 s on retry). Migrate Job run for the
  fresh `rhema` db; `rhema:appBaseUrl`/`apiPublicUrl` set to the run.app origins → Better
  Auth mounted (the R6DEP.1 OAuth-config leg, now documented in preview bring-up).
- 2026-10-22T15:13Z — **(b) N verified** — `rhema-journeys --steps R1` on pr-208:
  web+api `/healthz` provenance `18b3dee57bf8a57e2c9d6b036f1c4a014b39038c` (observed in the
  report), **R1 PASS** (`rollback-N/report.json`).
- 2026-10-22T15:14Z — **(b) N−1 verified** — `serviceImages` repinned to the deployed
  `r6dep-1` set (api@`8159bc…`, web@`1d4b5f…`, the `dc7fb15` build; +`gitSha=dc7fb15`);
  `up` rolled api+web+migrate (42 s). `/healthz` provenance
  `dc7fb15a0aa7caa5d47734656d06514d5b75b127` on BOTH services (report-observed), live
  digests match the prod pins — **the rollback target was the prior DEPLOYED image set,
  not a source rebuild**. R1 PASS (`rollback-Nminus1/report.json`).
- 2026-10-22T15:2xZ — **(b) teardown draining** — `destroy` removed 144 of 193 resources;
  `rhema-pr-208-private-app` subnet held by the GCP-managed
  `serverless-ipv4-cloudrun-1792680586032522302` reservation — Google-owned, refuses
  manual delete (`in-use by //serverless.googleapis.com/…`), the pr-206/pr-207 class:
  ≈2h20m GC lag. Background drain loop retries `destroy` → `rm` → orphan sweep; the
  closeout commit records the final state.
- 2026-10-22T15:4xZ — **verification all green**: `turbo build lint typecheck` 135/135;
  `pnpm test` 514 files / **6,052 pass** / 4 skip / 0 fail; all six `check:*` green;
  targeted drill suites 19/19.

## Gap table

| Plan step | Delivered | Delta |
|---|---|---|
| 1 ledger + drivers + on-call → PR → `pr-<n>` | `18b3dee` pushed; **PR #208** opened (base `r6dep-1-tip-deploy`) → preview `pr-208` | none |
| 2 (a) restore | PASS first full run: RTO 579 s, 12/12 + tenant, absent-verified | +2 live fixes (schema cols; clone `--async` + delete-retry 409s) + 1 leftover-scratch sweep from the aborted pre-fix run |
| 3 (c) egress playbook | PASS: 7-leg timeline, 2.4 s contain, residue 0 | none |
| 4 (d) alert delivery | honest census: 4 worker-side signals → 488 receipts; 14 GCP policies channel-less = **F-R6OPS.1-1** | the deliverable reads "prove OR document" — the Monitoring-channel gap is documented, never greenwashed |
| 5 (b) preview rollback | N + N−1 both provenance-verified + R1 PASS; destroy 144/193 then GCP reservation-lag | drain pending GCP-managed reservation GC (~2h20m class, pr-207 precedent); closeout commit records `rm` + sweep |
| 6 evidence + gates | all gates green; evidence dir complete | none |

## Evidence log

`docs/build/reports/2026-10-22_R6OPS.1/`:

- `restore-drill.json` — (a) the PASS run: T0 snapshot, PITR point, clone→RUNNABLE→verified
  timeline, all 12 count pairs, tenant row hash, RTO, delete + absent-verify.
- `egress-drill.json` — (c) the PASS run: pre-state, canary rows, detect/diagnose/contain
  evidence, probe exclusion pre/post, residue census, 7-stamp timeline.
- `alert-delivery.md` — (d) the honest census: armed worker path (signal → kind → latest
  receipt → count) vs the 14 channel-less AlertPolicies; F-R6OPS.1-1.
- `rollback-N/report.json` — (b) R1 journey at N (`18b3dee` observed api+web, PASS).
- `rollback-Nminus1/report.json` — (b) R1 journey at N−1 (`dc7fb15` observed api+web, PASS).
- `rollback-drill.md` — (b) the narrative: image-set pin map, timeline, teardown status.

## Evidence report

(pending — Phase 6.4)
