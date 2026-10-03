# ADR-082: Measured cost posture — the warm floor, not the documented $95, is the real floor; the $50 budget alert is the compensating control

- **Status:** Proposed
- **Date:** 2026-10-03
- **Ticket:** OPS.2
- **Requirement ids:** REQ-ARCH-28, REQ-ARCH-30
- **Spec:** §13.2; ADR-010 (the original ~$50 target / ~$95 always-on floor)

## Context

ADR-010 sized the prod always-on floor at ~$95/mo (Cloud SQL $25 + e2-medium GKE node $24 +
BASIC 1 GB Redis $33 + e2-small proxy $13) against the operator's ~$50 target. OPS.2 was asked to
*measure* the real bill. No public API returns billed actuals and no populated BigQuery billing
export exists (the `sig_billing_export` dataset is empty — the console-only export flip is
D-OPS.2-1), so `scripts/live/billing-read.mjs` recomputes the bill bottom-up: the deployed shapes
read off the live project via `gcloud`, priced at Cloud Billing Catalog API list prices — the same
price book the invoice is built from, with every matched SKU printed for auditability.

The 2026-10-03 recomputation: **≈ $285.80/mo** — roughly 3× the documented floor. The dominant
driver is the **Cloud Run warm floor at ≈ $152/mo** (7 services at `minScale=1`, plus `worker` and
`convert-svc` running `cpu-throttling=false` = instance-based billing ≈ $51.84/mo each at list),
which ADR-010's floor did not count at all. Redis ($35.77), the GKE node + boot disk ($28.46),
Cloud SQL + backups ($28.05), the HTTPS LB ($18.41), the proxy MIG ($12.63), NAT/IPs/secrets/AR/GCS
(≈ $10) fill out the rest. The gap to the earlier ~$70.95 cumulative figure is named in the OPS.2
ledger — reconciling recomputation vs actuals is the D-OPS.2-1 leg once the export lands.

## Decision

1. **Keep the warm floor but instrument it.** The posture is deliberate (cold-start latency on
   user surfaces; `cpuIdle=false` is required on the worker's queue-consumption loop and was
   chosen on convert-svc for the §13.5 20 s preview SLO). OPS.2 does not shrink it — the levers
   below are plan-only per the ticket's cost authorization — but it is now *measured*, which the
   ticket required before any lever talk.
2. **The $50/mo budget alert is the compensating control** (`infra/pulumi/billing.ts`, prod stage
   fact): thresholds at 50%/90%-forecast/100% email the billing admins. It watches actuals even
   while the export leg is open. `billingbudgets.googleapis.com` is enabled in-stack; a quota
   project (`GOOGLE_CLOUD_QUOTA_PROJECT` or an ADC `quota_project_id`) is required for the
   google-beta provider — recorded in the runbook.
3. **The billing-export dataset is provisioned** (`billing_export_prod`) so the console export
   flip is one operator step (D-OPS.2-1).
4. **Ranked levers, plan-only** (list-price deltas; none executed):
   - `convert-svc` `cpuIdle=false` → request-based `min=1`: **−$44/mo** (keeps one warm instance
     at the idle rate; SLO risk is cold-CPU, not cold-instance).
   - `export`/`fetcher` `minScale=1`→`0` (internal services, cold start tolerable): **−$19.4/mo**.
   - `api`/`collab`/`web` `minScale` review (user-facing latency): **−$29/mo** if all zeroed.
   - `worker` right-size 1 vCPU/1 GiB → 0.5 vCPU/512 MiB: **−$26/mo** (queue throughput risk —
     needs a soak, not a guess).
   - HA levers (all plan-only, forbidden to execute in OPS.2): Cloud SQL `REGIONAL` ≈ **+$25.55/mo**;
     `STANDARD_HA` Redis ≈ **+$35.77/mo**; proxy MIG ×2 ≈ **+$12.2/mo**.
5. **Recommendation.** The honest always-on floor is ~$285, not $95: either the operator revises
   the ~$50 target, or a later ticket executes the −$44/−$19/−$29 warm-floor levers toward ~$190
   and re-measures. ADR-010 is amended by reference, not rewritten (append-only).

## Consequences

- The measured bill is reproducible: `node scripts/live/billing-read.mjs` re-runs the same two
  sources at any later date; `--json` feeds ledgers.
- The budget alert fires at $25/$45-forecast/$50 — the operator's first signal if the actual bill
  confirms the recomputation (or if it was always this high).
- Cloud SQL HA pre-plan (runbook §cost): a ZONAL→REGIONAL `availabilityType` flip preserves
  backups + PITR settings and costs +$25.55; the maintenance-window + failover-rehearsal steps are
  documented, not executed.

## Revisit trigger
D-OPS.2-1's actuals landing: if the export shows a materially different total than the ~$285
recomputation (committed-use discounts, credits, or a wrong SKU mapping), amend the ranked-lever
deltas — the lever ORDER is unlikely to move (the warm floor dominates either way). If the operator
rules the ~$50 target immutable, the D-OPS.2-2 warm-floor levers become an execute ticket.
