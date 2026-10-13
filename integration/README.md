# `@rhema/integration-tests` — the Phase-0 FakeEngine integration suite (ledger G21)

The CI `integration` job (§13.2): "api + worker against a preview AlloyDB/Cloud SQL with a `FakeEngine`
replaying recorded fixtures: gates, orphan resume, cancel, cap exhaustion, stale task — ledger G21."

This workspace composes the **real** surfaces end-to-end in one process:

- `@rhema/api` (`createRunRoutes`) — the HTTP run-creation, gate-resolution and internal run API.
- `@rhema/worker` (`handleRunStart` / `handleRunReap` / `handleRunCancel` / `completeCancellation`) — the
  pg-boss run-lifecycle handlers.
- `@rhema/engine` `FakeEngine` — replays recorded SDK message fixtures through the real event mapper (no
  live model, no proxy, no cost).
- PGlite (`@rhema/orchestrator/testing`) — the real `@rhema/db` migrations + RLS, in-process.

`src/harness.ts` wires these; `src/g21.test.ts` drives the five G21 scenarios plus a delivered-run
**Phase-0 exit assessment** (`assessPhase0ExitForRun`: boundary `violations = 0`, sidecar
`parseStatus = ok`, cited ⇒ fetched, proxy-metered = SDK-reported ± 2%). The suite is deterministic and
runs in the normal unit job too; the CI `integration` job runs it explicitly (`vitest run integration`).

`src/server-postgres.test.ts` runs the migrations + real-project seed against a **server Postgres**
(`DATABASE_URL`, the CI `postgres:16` service) — closing D-P0.02-1; it skips when `DATABASE_URL` is unset.

## Live-stage drivers (operator-gated)

The package also carries the deployed-stage drivers the Phase-0→3 Stage-B legs ran — each is
fail-closed (an explicit authorization flag/env is required) and documented in its header:

- **Migrate/seed + provenance:** `live-migrate-seed.ts`, `live-prod-bringup.ts` (prod Cloud SQL
  migrate + protocol seed), `record-deployment.ts` (REQ-ARCH-39 `deployments` row),
  `record-provider-verification.ts` (D-P0.13-2).
- **Run drivers:** `live-launcher.ts` + `live-exit-driver.ts` + `run-live-exit.ts` (the live
  Phase-0-exit driver — posts real run-creation to the deployed api), `live-prepare-fixture.ts` /
  `live-prod-fixture.ts` (funding + project fixtures for dev/prod), `pod-loop.test.ts`.
- **Probes + accounting:** `two-tenant-probe.ts` (SEC.1/REQ-SPEC-30 — deterministic mode runs in
  `vitest`; the pointed-at-a-stage mode is the deployed-stage probe), `research-probe.ts` (RES.1's
  planted-error evidence probe), `instrumented-folder.ts` (D-P0.15-2 estimator folding from the
  proxy meter), `econ2-accounting.ts` (ECON.2's offline lever accounting), `metered-notice.ts`
  (ECON.1's paid-account notice sender), `unverified-scan-live.ts` + `citation-scan-live.ts`
  (RES.2/CITE.1 historical scans).

**Not covered here:** the golden-run scorer gate (nightly golden runs — D-P0.15-4 stays OPEN) and the
browser-journey suite, which lives in `@rhema/journeys` (REQ-SPEC-29). This suite proves the
**composition** deterministically; the drivers above proved it against the wire.
