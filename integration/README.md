# Integration tests

`@rhema/integration-tests` exercises the API, worker, and orchestrator together. Most tests run locally without a model provider or cloud account: [`src/harness.ts`](src/harness.ts) composes real routes and handlers with `FakeEngine` message fixtures and an in-process PGlite database running the repository's migrations.

From the repository root, after the [initial build](../docs/development.md):

```bash
pnpm exec vitest run integration
```

These tests also run in the root test suite. CI's `integration` job runs them explicitly and supplies PostgreSQL 16 for the server-database checks.

## What the tests establish

- [`g21.test.ts`](src/g21.test.ts) covers run lifecycle scenarios including gates, orphan recovery, cancellation, cap exhaustion, and stale attempts, plus the Phase-0 delivery assessment.
- [`server-postgres.test.ts`](src/server-postgres.test.ts) applies migrations, seeds projects, and checks the restricted database role on a server PostgreSQL instance. It skips when `DATABASE_URL` is unset. Use a disposable test database with the expected CI credentials; this test changes schema, roles, and fixture data.
- [`two-tenant-probe.ts`](src/two-tenant-probe.ts) provides the shared tenant-isolation probe used by deterministic tests and authorized deployed-stage checks.

Passing the local suite establishes behavior with its fixtures and injected dependencies. It does not establish the state of a deployed service, live provider behavior, or editorial quality. Browser acceptance belongs to [`@rhema/journeys`](../packages/journeys/README.md); paid protocol validation follows the [golden rerun rule](../docs/ops/golden-rerun-rule.md).

## Operator drivers

This workspace also contains deployment and live-test drivers. They are operational tools with their own prerequisites and authorization checks; running the unit suite does not invoke them. Read the relevant source header and [deployment guidance](../infra/PROD-BRINGUP.md) before using one.

| Purpose                                                  | Sources                                                                                                                  |
| -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Migrate, seed, and record deployment/provider provenance | `live-migrate-seed.ts`, `live-prod-bringup.ts`, `record-deployment.ts`, `record-provider-verification.ts`                |
| Prepare fixtures and exercise live runs                  | `live-launcher.ts`, `live-exit-driver.ts`, `run-live-exit.ts`, `live-prepare-fixture.ts`, `live-prod-fixture.ts`         |
| Research, cost, and delivery investigations              | `research-probe.ts`, `instrumented-folder.ts`, `econ2-accounting.ts`, `unverified-scan-live.ts`, `citation-scan-live.ts` |
| Paid-account notification                                | `metered-notice.ts`                                                                                                      |

All listed files are under `src/`. Live runs, funding, email, migrations, and production probes require the corresponding operator-approved scope; their historical results are recorded in `docs/build/`.
