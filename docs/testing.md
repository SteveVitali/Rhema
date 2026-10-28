# Testing

Rhema tests behavior at several boundaries: pure functions, database transactions, HTTP routes,
browser components, composed run lifecycles, container isolation, and the deployed user journey.
Start with the smallest layer that reproduces your change, then cover the boundaries it crosses.

Install and build the workspace using [Development](./development.md) first. Commands below run
from the repository root unless stated otherwise.

## Focused tests

```bash
# One test file.
pnpm exec vitest run packages/editor/src/roundtrip.test.ts

# A package's tests.
pnpm exec vitest run packages/editor

# The API/worker/FakeEngine composition and other integration tests.
env -u DATABASE_URL pnpm exec vitest run integration

# Watch one file while editing.
pnpm exec vitest packages/editor/src/roundtrip.test.ts
```

The [root Vitest configuration](../vitest.config.ts) includes tests under `packages`, `apps`,
`infra`, `integration`, `tools` and `scripts`. Tests are colocated with source. The default
environment is Node; web `*.dom.test.tsx` and `*.dom.test.ts` files use happy-dom through the
root and [web configurations](../apps/web/vitest.config.ts).

Component tests use Testing Library and the shared [setup file](../apps/web/test-setup.ts).
Use the selectors in the [DOM contract](../apps/web/src/dom-contract.ts); test and journey hooks
are part of the maintained interface. happy-dom does not prove real layout or control
occlusion, so browser acceptance remains a separate layer.

## Full local suite

Install the browser used by the deterministic layout test, then run the suite with no external
database binding:

```bash
pnpm --filter @rhema/journeys exec playwright install chromium
env -u DATABASE_URL pnpm test
```

This includes the in-process integration tests; it does not launch the deployed journey suite
or paid model runs. Most database tests use PGlite with the real migrations. The
[integration harness](../integration/src/harness.ts) composes real API routes and worker
handlers with `FakeEngine`, which replays recorded model events.

Two environment-dependent cases matter when reading the result:

- **Chromium:** the [occlusion test](../packages/journeys/src/occlusion.test.ts) warns and omits
  its layout assertions locally if the browser is unavailable; in CI that is an error. Install
  Chromium so this coverage is real.
- **Docker:** if Docker is usable on a local non-CI host, the
  [privilege-separation test](../apps/run-task/src/privsep.docker.test.ts) builds a run-task
  image and performs privileged container/kernel checks. It can download build dependencies.
  Without Docker it skips. The authoritative Linux CI integration job opts in explicitly with
  `RHEMA_DOCKER_TESTS=1`.

Do not interpret a skipped environment-dependent leg as proof that it passed. Include skips
and the environment you used in your PR validation notes. For a faster iteration loop, run
the focused files first; the PGlite-heavy full suite can take substantially longer.

## Server-Postgres tests

[`integration/src/server-postgres.test.ts`](../integration/src/server-postgres.test.ts) exercises
the migrations, seed and restricted database role against PostgreSQL 16. It skips when
`DATABASE_URL` is unset.

**Use a fresh, disposable local database.** This test applies migrations, inserts fixtures,
changes the `rhema_app_login` password, and changes its login state. Its restricted-role probe
expects the test administrator credentials `postgres:postgres`, as in CI. Do not point it at
an existing development, preview or production database.

Once a disposable PostgreSQL 16 server is ready on local port `55432` with those test
credentials:

```bash
DATABASE_URL=postgresql://postgres:postgres@127.0.0.1:55432/postgres \
  pnpm exec vitest run integration/src/server-postgres.test.ts
```

CI provisions its own `postgres:16` service for this test. The in-process suite does not require
you to run a PostgreSQL service.

## Build and source checks

```bash
pnpm turbo build lint typecheck
pnpm check:licenses
pnpm check:protocol-markers
pnpm check:no-cookies
pnpm check:spa-budget
pnpm check:spa-env
pnpm check:dom-contract
```

| Check                    | What it establishes                                                                       |
| ------------------------ | ----------------------------------------------------------------------------------------- |
| Build / lint / typecheck | The package graph compiles and follows the TypeScript and ESLint contracts.               |
| `check:licenses`         | Installed dependencies satisfy the licence allowlist and recorded exceptions.             |
| `check:protocol-markers` | Scanned public artifacts do not contain the private protocol/evaluation markers.          |
| `check:no-cookies`       | The ingestion surface has no supported user-supplied credential/cookie input.             |
| `check:spa-budget`       | Built SPA assets satisfy the committed gzip size ceilings.                                |
| `check:spa-env`          | Browser source/artifacts do not contain the banned server environment or secret patterns. |
| `check:dom-contract`     | Journey/test selectors agree with the declared, emitted and asserted DOM vocabulary.      |

Build the web package before running artifact scans and size checks. For a web-only build:

```bash
pnpm turbo build --filter=@rhema/web...
```

For migration changes, CI additionally runs
[`check-additive-migrations.mjs`](../scripts/check-additive-migrations.mjs) against the PR base.
For image and sandbox changes, the Docker legs in [CI](./ci.md) provide coverage that a Node
test run cannot.

## Deployed browser journeys

The [Playwright journey suite](../packages/journeys/README.md) walks a configured deployment
using real test sessions, visible text, actionable controls, screenshots, and deployment
provenance. It is the acceptance layer for user-facing changes. Its registry records which
steps must already pass and which remain owed.

This suite needs an authorized stage, the test mailbox/identity setup, and the expected deployed
revision. Build its CLI with:

```bash
pnpm --filter @rhema/journeys build
```

Then use `node packages/journeys/dist/cli.js` with the stage-specific arguments documented in the
package guide. Do not use `pnpm --filter @rhema/journeys exec rhema-journeys`: the package's own
binary is not linked into its own executable search path.

Paid steps require a separate authorized budget and the enforced spend checks. Neither the
ordinary local test command nor a documentation change authorizes running them. The
[journey guide](../packages/journeys/README.md) owns the system-role database requirement,
headroom, weekly bound, and funded-window rules.
