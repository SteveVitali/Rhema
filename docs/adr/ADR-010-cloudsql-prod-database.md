# ADR-010: The production database is Cloud SQL for PostgreSQL, not AlloyDB

- **Status:** Accepted
- **Date:** 2026-09-17
- **Ticket:** PRB.15 (prod bring-up — Stage A amendment, same PR)
- **Requirement ids:** REQ-ARCH-28 (backup/retention), REQ-ARCH-38 (stage isolation),
  §13.1/§13.2/§13.3 (all amended 2026-09-17)
- **Supersedes:** the production-scoped half of the §13.1 "AlloyDB for PostgreSQL" stack choice
  (AlloyDB remains the dev/preview engine — only prod's engine changes)

## Context

PRB.15 Stage A originally stood prod up on the spec's AlloyDB shape (warm 4-vCPU primary, ~$270/mo
for the minimum always-on primary alone). The operator then stated the real prod budget:
**~$50/mo of infrastructure.** AlloyDB cannot fit that budget at any size — its smallest warm
primary is already ~5x the entire target. The spec's own provider table (§12, the AWS→GCP
amendment) foresaw this: "Postgres + RLS unchanged (**Cloud SQL is the simpler swap**)" — the
engines are interchangeable at the application layer, which is precisely why the swap is cheap.

Companion facts the same budget forced, recorded here so the prod shape is one decision:
a **zonal** (not regional) Standard GKE cluster with **one on-demand `e2-medium`** node, the
**smallest Memorystore BASIC** Redis (previously STANDARD_HA), and a **single-instance**
egress-proxy MIG.

## Decision

- **Prod runs Cloud SQL for PostgreSQL 16**, `db-g1-small` (1 shared vCPU / 1.7 GiB) — the minimal
  tier that is still describable as prod-ready. `db-f1-micro` is the absolute floor (~0.6 GiB) and
  was rejected as too thin to carry that word. ZONAL availability (REGIONAL is ~2x — the documented
  lever if prod outgrows the budget). Private-IP only, on the same VPC + the **same** Service
  Networking PSA peering AlloyDB and Memorystore already use (one reserved range, no second
  connection, no collision).
- **Dev and previews stay on AlloyDB.** Dev's cluster is already live; previews keep the
  small/paused AlloyDB shape the spec's stage line already allowed ("a small/paused AlloyDB **or
  Cloud SQL** instance"). The stage facts carry `database.engine` so Pulumi gates the resources per
  stage — AlloyDB objects are not created on prod, and vice versa.
- **Backups:** Cloud SQL automated daily backups with `backupRetentionDays` = 35 retained (the
  spec's 35-day spirit as the backup horizon) + **PITR with the 7-day transaction-log window**
  (Cloud SQL's hard cap — stated honestly; there is no 35-day continuous window on this engine).
  `deletionProtection` on for prod.
- **Warm, never paused:** `activationPolicy: ALWAYS`. The review-13 F32 cold-start concern is moot —
  a `db-g1-small` makes staying up affordable, which was the whole point of keeping a primary warm.
- **One bootstrap password feeds both engines:** `rhema:alloydbPassword` / the
  `rhema-<stack>-alloydb-password` secret id are kept (engine-agnostic; renaming would churn every
  seeded stack for zero security gain). The operator's DATABASE_URL config keys are unchanged —
  `rhema:appDatabaseUrl` is the canonical api key (`apiDatabaseUrl` reads as a fallback).
- **The app does not change.** It is engine-agnostic Postgres — pg-boss, RLS, the credit ledger,
  and every migration run identically; the swap is an infrastructure/engine choice, not a
  data-model rewrite.

## Consequences / residual risk

- **Honest cost floor:** db-g1-small ≈ $25/mo + e2-medium node ≈ $24/mo + Basic 1 GB Redis ≈ $33/mo
  + one e2-small proxy ≈ $13/mo ≈ **~$95/mo always-on before Cloud Run / LB / GCS / egress
  traffic** — the ~$50 target requires the GKE free-tier waiver on the billing account and/or a
  further documented lever (idling Redis or the proxy MIG off-hours). The runbook states this
  plainly rather than pretending the number fits.
- **Single-instance/zonal posture:** ZONAL Cloud SQL + a zonal cluster + a BASIC Redis + a 1-instance
  proxy MIG trade availability for cost. Failure modes are graceful — a dead proxy is fail-CLOSED
  (runs lose egress, never leak); Redis is fan-out/presence, not the system of record; the DB has
  backups + PITR. The levers to harden (REGIONAL, STANDARD_HA, MIG ×2, bigger nodes) are documented
  in `stages.ts`/`data.ts`/`compute.ts` comments.
- **Performance headroom:** a shared-core 1.7 GiB Postgres is much thinner than AlloyDB's minimum.
  Acceptable at beta traffic; the upgrade path is a `settings.tier` bump + REGIONAL availability,
  both single-line changes in the stage facts.
- **PITR granularity** drops from a 35-day continuous window to 7-day log replay + 35 daily
  snapshots. If a future compliance need wants longer point-in-time recovery, the answer is AlloyDB
  or exported backups — recorded here so it is a known cost of the budget decision, not a surprise.

## Revisit trigger

Revisit if (a) prod traffic outgrows `db-g1-small` (connection count, pg-boss queue depth, or query
latency against the 1.7 GiB shared-core box — bump `cloudSqlTier` + REGIONAL), (b) the infra budget
lifts past ~$300/mo and AlloyDB's continuous-backup granularity or read pools justify the swap back,
(c) a compliance need wants PITR beyond Cloud SQL's 7-day transaction-log window, or (d) prod hardens
and the companion cost posture (zonal cluster, BASIC Redis, single-instance proxy MIG) needs the HA
levers documented in `stages.ts`/`compute.ts` comments.
