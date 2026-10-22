# R6OPS.1 — Production-readiness drills (REQ-DEP-2)

## Summary

Prove that recovery and alerting **work**, not just that they are configured — the five
REQ-DEP-2 deliverables executed live: a Cloud SQL PITR restore to a scratch instance
(verified, destroyed, verified absent), a preview rollback N → N−1 with provenance at both
legs, the egress-denied playbook run end-to-end on a canary `is_test` run, an honest
alert-delivery census, and the on-call runbook naming the responder and the real paging
path. Nothing here had ever been rehearsed live before (critique, 2026-10-20).

## What happened

1. **(a) PITR restore drill — PASS** (`restore-drill.mjs --execute`,
   `GD-PREAUTH-ACTS.R6`-scoped): pre-state snapshot at T0 (12 count tables + one tenant
   row), `--point-in-time 2026-10-22T14:14:39.351Z` clone into ONE scratch
   (`rhema-r6ops-drill-1792678479`), RUNNABLE at 14:24:10Z — **all 12 counts equal T0**
   (workspaces 333, runs 82, fetch_log 8,124, `_migrations` 58, …) and the tenant row
   reads back. **RTO 579 s** (clone-start → first verified read). Deleted, `describe`→404
   verified absent; the live prod instance was never a mutation target (reads only).
   Two live-found fixes recorded honestly: schema (`projects` has `title`/`created_at`,
   not `name`/`updated_at`) and `gcloud sql clone` sync-wait abort → `--async` + poll +
   delete-retry through 409s. Evidence: `restore-drill.json`.
2. **(b) Rollback drill — PASS on `pr-208`**: deployed N at the branch tip `18b3dee`
   (api+web `r6ops-1` digests pinned; support services pinned at the `r6dep-1` prod set —
   AR refuses cross-repo tag copies, so preview non-rolled services mirror prod exactly).
   `rhema-journeys --steps R1`: `/healthz` = `18b3dee` api+web, PASS. Repinned
   `serviceImages` + `gitSha` to the deployed `r6dep-1`/`dc7fb15` set (api@`8159bc…`,
   web@`1d4b5f…` — the **prior deployed image set**, not a rebuild), `up` rolled 3
   resources in 42 s, `/healthz` = `dc7fb15` api+web, R1 PASS. Teardown: destroy removed
   144/193 resources, then the private subnet sat on a GCP-managed
   `serverless-ipv4-cloudrun-*` reservation (Google-owned — manual delete correctly
   refused; the pr-206/pr-207 ≈2h20m GC-lag class); a drain loop finished `destroy` →
   `stack rm` → the 25-class orphan sweep — final state recorded in the closeout commit /
   `rollback-drill.md`.
3. **(c) Egress-denied playbook drill — PASS** (`egress-drill.mjs --execute`, the ticket's
   one authorized canary write): 4 planted `domain_blocklist` denies + the real
   `egress_denied_spike` pause signal on `is_test` run `r6ops1-egress-1792677564468` →
   worker pause-drain claimed the signal and parked the run (`waiting_gate` + blocking
   refusal gate, `on_expiry='cancel'`) in **2.4 s**; the playbook's deny-reason
   distribution read verbatim; the `egress_denied_10m` SLO probe's `NOT_FROM_TEST_RUN`
   exclusion held at **0 pre/post** (test tenants never page — ADR-020); rollback deleted
   all planted rows — **residue 0 across runs/signals/gates/events/fetch_log**. Seven-leg
   timeline in `egress-drill.json`. **Discharges D-P1.22-2's leg-(e) playbook half.**
4. **(d) Alert delivery — honestly documented** (`alert-delivery.md`): the worker's
   `OPS_ALERT_WEBHOOK_URL` → `rhema-prod-ops-alert-catcher` path is armed and paging —
   **488 `ops_alert_received` receipts** in the readable window across 4 signals
   (`balance_divergence`, `research_preflight_failed`, `run_success_rate_24h_pct`,
   `unverified_review_rate_7d_pct`). But **all 14 GCP Monitoring AlertPolicies have
   `notificationChannels: []`** and the project holds zero NotificationChannels —
   `rhema:opsAlertWebhookUrl` is unset on prod (**F-R6OPS.1-1**): Monitoring-side policies
   evaluate but cannot page until the operator provisions the channel (a prod write
   outside this ticket's authorized scope). `route-5xx` additionally has no worker-side
   emitter. Nothing is claimed proven that was not.
5. **(e) `docs/ops/on-call.md`** — the operator as the sole responder; the armed paging
   path (worker `alertSink` POST → ops-alert-catcher `ops_alert_received`) vs the unarmed
   Monitoring-channel path; signal → playbook map; test tenants never page; the channel
   provisioning step flagged for the operator.

## Also in this PR

- `scripts/live/restore-drill.mjs` + `.test.mjs` — the PITR drill driver (dry-run default;
  `--execute` requires `RESTORE_DRILL_ACK=yes` + `DATABASE_URL`; the only mutations are
  clone-into-SCRATCH and delete-SCRATCH — both pinned by source-scan tests) and the
  10-assertion contract suite.
- `scripts/live/egress-drill.mjs` + `.test.mjs` — the playbook driver (ACK+DSN arms,
  `is_test` refusal, unconditional rollback in `finally`, 5-table residue asserts) and
  its contract suite.
- `docs/ops/on-call.md` — deliverable (e).
- `docs/tickets/DEFERRALS.md` — dated note on D-P1.22-2 (playbook half discharged;
  residual legs named).
- Evidence: `docs/build/reports/2026-10-22_R6OPS.1/`.

**Requirement ids:** REQ-DEP-2
**Merge policy:** OPERATOR — this PR is not merged by the run; it stacks on
`stevevitali/r6dep-1-tip-deploy`.

## Verification

- `pnpm turbo build lint typecheck` — 135/135.
- `pnpm test` — 514 files / **6,052 passed** / 4 skipped / **0 failed** (targeted drill
  suites 19/19).
- All six `check:*` gates green (licenses 822 packages, protocol-markers 251 files,
  no-cookies 257 files, spa-budget, spa-env, dom-contract).
- `check-build-memory.sh` — warnings only; `check-append-only.mjs --base 1905cc4` OK.
- Live: (a) RTO 579 s PASS; (b) N + N−1 provenance-verified R1 PASS + teardown; (c) 2.4 s
  containment, residue 0; (d) 488 armed-sink receipts vs 14 channel-less policies
  (documented gap, nothing fabricated).
