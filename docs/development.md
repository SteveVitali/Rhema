# Development

The quickest useful contributor loop is to build the workspace and run the tests around your
change. Most route, editor, database and orchestration work can be exercised without cloud
accounts or a live model. This guide also shows how to inspect the web host locally and explains
where a provisioned backend becomes necessary.

For contribution and review expectations, start with [CONTRIBUTING](../CONTRIBUTING.md). For
code navigation, see [Architecture](./architecture.md). The CI cadence policy previously on this
page is preserved in [CI](./ci.md#maintainer-cadence-policy).

## Install and build

Use **Node.js 22.x, at least 22.12**, to match CI and satisfy the Vite build, and **pnpm 10.32.1**,
the version pinned in [`package.json`](../package.json). If pnpm is not installed, install that
exact version with `npm install --global pnpm@10.32.1`, or use another method from the
[pnpm installation guide](https://pnpm.io/installation) with the same version pin. Run these
commands from the repository root:

```bash
node --version
pnpm --version
pnpm install --frozen-lockfile
pnpm turbo build lint typecheck
```

The build compiles the TypeScript project graph, server code, and browser bundles. It does not
start the application or provision services. Keep the lockfile unchanged unless your change
actually updates dependencies.

No remote-cache credentials or private evaluation checkout are required. Leave
`RHEMA_EVALS_PATH` unset to use the evaluation stub. The current tree includes the real protocol
workspace; replacing it for a public distribution is a separate
[release-preparation task](./open-source-readiness.md).

Build before testing: Vitest transpiles test source, but many workspace imports resolve through
the packages' built `dist/` exports. After a shared-package change, rebuild its consumers before
interpreting their test results.

## Make a focused change

For an editor change:

```bash
pnpm turbo build lint typecheck --filter=@rhema/editor...
pnpm exec vitest run packages/editor
```

For web route or component work:

```bash
pnpm turbo build lint typecheck --filter=@rhema/web...
pnpm exec vitest run apps/web/src/server.test.ts
```

The trailing `...` includes the selected package's workspace dependencies. It does not select
all downstream consumers; use the full build/check command before submitting changes that cross
package boundaries. To keep a test file running while you edit:

```bash
pnpm exec vitest apps/web/src/server.test.ts
```

Choose additional tests based on the behavior you changed. [Testing](./testing.md) explains the
component, database, integration and deployed-browser layers and their prerequisites.

## Inspect the web host

After building the web package, you can serve its public pages and generated assets:

```bash
PORT=3000 API_BASE_URL=http://127.0.0.1:8081 APP_BASE_URL=http://localhost:3000 \
  pnpm --filter @rhema/web start
```

Open [localhost:3000](http://localhost:3000) or check
[the health endpoint](http://localhost:3000/healthz). Here `8081` is an explicit local API address;
the command does not start an API. Public page rendering is useful for layout work, while
sign-in, authenticated data, imports, collaboration and runs need their configured services.
Use a fresh browser session when inspecting the host without a backend.

For a watched build, use separate terminals from the repository root:

```bash
# Terminal 1: rebuild server TypeScript and its referenced packages.
pnpm --filter @rhema/web exec tsc -b --watch
```

```bash
# Terminal 2: rebuild the SPA assets.
pnpm --filter @rhema/web dev:spa
```

```bash
# Terminal 3: restart the compiled server when its output changes.
PORT=3000 API_BASE_URL=http://127.0.0.1:8081 APP_BASE_URL=http://localhost:3000 \
  pnpm --filter @rhema/web exec node --watch dist/main.js
```

Refresh the browser after the watched build finishes. `dev:spa` runs `vite build --watch`; there
is no configured Vite HMR server. Changes to the permanent SSR browser entry points under
`apps/web/src/client/` need their separate build:

```bash
pnpm --filter @rhema/web exec node build-client.mjs
```

The compiled entry point matters: `src/main.ts` auto-starts only when invoked as `main.js`.
Running `tsx watch src/main.ts` does not start this server.

## Inspect the public demo

The demo is served by the same web host — no API, account, database, or model is involved. Build
the workspace (which installs `@rhema/demo-corpus`), start the host as above, and open
[localhost:3000/demo](http://localhost:3000/demo). With no override, the host resolves the corpus
root from the installed `@rhema/demo-corpus` package and serves the committed corpus snapshots.

To run the demo against the committed **synthetic fixture** instead — the invented
`the-borrowed-commons` essay every demo test exercises — point the corpus root at it:

```bash
PORT=3000 API_BASE_URL=http://127.0.0.1:8081 APP_BASE_URL=http://localhost:3000 \
  RHEMA_DEMO_CORPUS_ROOT=packages/demo-corpus/fixtures/synthetic \
  pnpm --filter @rhema/web start
```

The fixture slug is `demo~the-borrowed-commons` (`/demo/the-borrowed-commons`); it is served but
never listed as a public hub card. Demo pages are read-only on every device class.

## Before opening a pull request

Run the full build, lint and type checks, plus the tests relevant to your change. For the full
test suite, first read [its optional database and Docker behavior](./testing.md#full-local-suite).
Browser changes also need the bundle and DOM-contract checks documented there. A user-visible
change requires a deployed browser journey for final acceptance; a successful local build alone
does not verify the served experience.

Follow [CONTRIBUTING](../CONTRIBUTING.md) for PR scope and evidence. The
[CI guide](./ci.md) explains which additional checks run remotely and why a Markdown-only edit
does not always qualify for the fast path.

## Common setup problems

| Symptom                                                           | Check                                                                                                                                                            |
| ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Vite or Rolldown fails on an old Node release                     | Use Node 22.12 or newer within the CI's 22.x line.                                                                                                               |
| A test cannot resolve `@rhema/*` or a `dist/` entry               | Run the workspace build, or build the affected package and its dependency closure.                                                                               |
| An install unexpectedly links a private evaluation package        | Unset `RHEMA_EVALS_PATH` and reinstall with the pinned pnpm version.                                                                                             |
| The local web host renders pages but sign-in or data actions fail | Check the API and integration prerequisites in [Configuration](./configuration.md).                                                                              |
| Editing an SSR browser entry point appears to have no effect      | Re-run `build-client.mjs`, then refresh the page. The SPA watcher does not build these entry points.                                                             |
| A clean run-task Docker build refuses to proceed                  | Live images require the separately supplied [SDK trees](../apps/run-task/vendor/README.md). The CI placeholder is only for checks that do not execute the model. |
