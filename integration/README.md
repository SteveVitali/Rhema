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

**Not covered here (H0-deferred):** the *live* three-project dev runs against real GCP + the Anthropic API
(the §17 exit criterion's agentic half) — see `docs/phase0-exit-readout.md` and `docs/tickets/DEFERRALS.md`.
This suite proves the **composition** deterministically; the live runs prove it against the wire.
