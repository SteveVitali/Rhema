# SLO review rule — REQ-ARCH-34 (§13.5)

Recorded for the launch checklist (P1.22). This file IS the REQ-ARCH-34 record.

## The rule

> SLOs are reviewed weekly; a breach pauses feature work on that surface until the budget recovers.

- **Weekly review.** Once a week (prod starts this on the first real week post-bringup) the on-call
  walks the `rhema-prod — §13.5 SLOs` dashboard (infra/pulumi/monitoring.ts) row by row and records the
  reading per signal: run-start p95, event-delivery p95, success rate, gate-resume p95, autosave p95,
  API availability burn, orphan/mirror/boundary zero-counts, egress-denied spike count, provider error
  share, cost drift, proxy-vs-SDK divergence, absorbed-adjustment share.
- **Breach ⇒ pause.** When a signal breaches its §13.5 alert row and stays breached into the review
  window, feature work on that surface pauses until the budget recovers. "The surface" is the signal's
  owning layer (e.g. `run_start_latency_p95_s` → the run-launch path; `provider_429_5xx_pct_5m` → the
  egress-proxy/provider path).
- **Breach ⇒ playbook.** Every alert row has a playbook in `docs/ops/playbooks/`. A paging breach is
  handled by its playbook, not improvised.
- **Unmeasured signals.** Signals with no data path are listed `unmeasured` in `probeSlos`
  (`packages/orchestrator/src/slo.ts`) — the §17 readout and this review carry them verbatim; an
  unmeasured signal is never reported as green.

## Where the numbers come from

| Signal | Source |
|---|---|
| DB-backed signals (9) | `slo.probe` sweep — `apps/worker/src/main.ts`, `packages/orchestrator/src/slo.ts` |
| API availability | Cloud Monitoring request SLI + `Slo` resource — `infra/pulumi/monitoring.ts` |
| Cost drift | `usage.reconcile` nightly → alertSink — `apps/worker/src/billing-jobs.ts` |

## Incidents

Every breach that pages is recorded in `docs/build/LEDGER.md` OPEN FINDINGS until the budget recovers,
with the playbook used. Recurring breaches of the same signal in consecutive weeks get a named deferral
or a fix ticket — never a silently-raised threshold.
