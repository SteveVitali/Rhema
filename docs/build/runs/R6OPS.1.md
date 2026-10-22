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

- [ ] Restore drill PASS: counts match the restore point; scratch destroyed (verified absent) *(live-executed)*
- [ ] Rollback drill PASS on the preview; teardown verified *(staging-verified)*
- [ ] Playbook drill timeline + canary residue 0 *(live-executed)*
- [ ] Every alert policy has a recorded page receipt at the operator sink *(live-executed)* — or the
      documented gap per the ticket's honesty clause
- [ ] Universal phase-gate AC *(agentic)*

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
- (pending)

## Gap table

(pending — Phase 4)

## Evidence log

`docs/build/reports/2026-10-22_R6OPS.1/`:
(pending)

## Evidence report

(pending — Phase 6.4)
