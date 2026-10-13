# ADR-092: The purge-schedule witness is a bounded SECURITY DEFINER probe, not a pgboss grant

- **Status:** Proposed
- **Date:** 2026-10-04
- **Ticket:** CAP.3
- **Requirement ids:** REQ-DATA-15, REQ-SPEC-30
- **Spec:** §5.11, §11.4

## Context

D-STB.5a-3: journey T7 asserts the `project.purge` queue row (`start_after` = tombstone+30d,
`singletonKey project.purge:<id>`) but `rhema_app_login` has no `pgboss` schema grant and no
system DSN exists to bind `JOURNEY_DATABASE_URL`. Options were a scoped DSN or a bounded read.

## Decision

Migration `0058_pgboss_purge_probe.sql` creates
`public.rhema_project_purge_schedule(project_id) → table(next_run_after timestamptz)` —
SECURITY DEFINER, `set search_path = ''`, reading `pgboss.job` filtered to the `project.purge`
queue + the row's `singletonKey`, returning ONLY the scheduled time (never the job payload), with
`GRANT EXECUTE … TO rhema_app`. The function body is dynamic plpgsql (`EXECUTE format`) so the
migration applies on migration-only test databases where `pgboss.job` doesn't exist; T7 calls the
probe and falls back to the raw `pgboss.job` read on `42883`/`42501` → owed.

## Consequences

- The app role gains visibility of exactly one queue's schedule column — the queue system stays
  system-owned; no new DSN or secret is needed.
- The probe is the allowlisted-intentional-scan class of REQ-SPEC-30, exercised by tests only
  post-0058 (older deploys → owed).

## Alternatives considered

- Grant `SELECT` on `pgboss.job` to a reporting role: exposes every queue's payloads; rejected.
- Document a system `JOURNEY_DATABASE_URL`: works, but Pulumi-composes the system DSN — no
  Secret Manager secret exists, so the probe is the more durable path (the DSN remains the
  fallback in T7).

## Revisit trigger

Reopen if pg-boss changes its schema (the probe must be reviewed per pg-boss upgrade), or if more
queue observability is needed — extend with per-queue probes, never a blanket grant.
