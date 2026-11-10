# Web application

`@rhema/web` serves Rhema's public pages, authenticated application, and same-origin backend-for-frontend (BFF). It combines a Hono server with React, a Vite-built TanStack Router/Query application, and small browser bundles for server-rendered pages.

Start with the repository [development guide](../../docs/development.md) for installation and the [configuration reference](../../docs/configuration.md) for the services needed to run the application. This README describes the code in this checkout; a deployed instance's renderer and capabilities must be checked against its build SHA.

## Source map

| Path                                         | Responsibility                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------ |
| [`src/main.ts`](src/main.ts)                 | HTTP entry point, API connection, session forwarding, and auth proxy     |
| [`src/server.ts`](src/server.ts)             | Routes, SSR responses, BFF endpoints, and content security policy        |
| [`src/spa/`](src/spa/)                       | Authenticated client routes, queries, navigation, and editor integration |
| [`src/spa-shell.ts`](src/spa-shell.ts)       | SPA document and boot data                                               |
| [`src/client/`](src/client/)                 | Browser code mounted on SSR documents                                    |
| [`src/dom-contract.ts`](src/dom-contract.ts) | Selector vocabulary shared by component tests and browser journeys       |
| [`src/demo.ts`](src/demo.ts)             | Demo guard: `/demo*` and `/p/demo~*`/`/bff/p/demo~*` claim order, shell and twin routing |
| [`src/demo-data.ts`](src/demo-data.ts)   | `demoDataSource` — the snapshot-backed read seam over the committed corpus |
| [`src/spa/app-shell.tsx`](src/spa/app-shell.tsx) | The one authenticated chrome: sidebar, right panel, in-shell states |
| [`src/spa/read-only.tsx`](src/spa/read-only.tsx) | `ReadOnlyProject` derive/notice for `demo`, `showcase` and `run_lock` |
| [`src/spa/palette.tsx`](src/spa/palette.tsx) | The lazy global ⌘K palette over the tenant-scoped `/bff/search` twin |

The public funnel and the `/demo` hub remain server-rendered. Authenticated SPA documents serve the SPA shell; the Page family's only forced-SSR condition is a phone request — showcase and demo projects render inside the SPA read-only through `ReadOnlyProject`. Demo document GETs serve the same shell with a demo boot under the reserved `demo~<essay>` slug namespace, and their JSON twins forward to a nested app backed by `demoDataSource` (no session, no tenant reads; the anonymous-metrics beacon is the one sanctioned write). Client navigation uses one delegated link interceptor in [`nav-intercept.ts`](src/spa/nav-intercept.ts); leaf routes hand off to a document navigation when the server verdict requires SSR, and every link into or out of the demo namespace is a document navigation. Renderer query parameters, headers, and migration flags are retired.

See [architecture](../../docs/architecture.md) for the wider service boundary and [AGENTS.md](AGENTS.md) for implementation constraints.

## Build and iterate

Run these commands from the repository root after installation and the initial workspace build:

```bash
pnpm --filter @rhema/web build
pnpm --filter @rhema/web typecheck
pnpm exec vitest run apps/web
```

The package build runs TypeScript, then the island bundler, then Vite:

| Input                  | Output                                                 | Builder                      |
| ---------------------- | ------------------------------------------------------ | ---------------------------- |
| Server and SSR sources | `dist/`                                                | `tsc -b`                     |
| `src/client/`          | `public/ide.js`, `public/page.js`, `public/landing.js` | `build-client.mjs` / esbuild |
| Fontsource font assets | `public/fonts/`                                        | `build-client.mjs`           |
| `src/spa/`             | `public/spa/` and its Vite manifest                    | `vite build`                 |

`public/` is generated and gitignored. The generated TanStack route tree, `src/spa/routeTree.gen.ts`, is committed: edit `src/spa/routes/` and rebuild to regenerate it.

For a configured local instance, use separate terminals:

```bash
# Rebuild SPA assets when they change.
pnpm --filter @rhema/web dev:spa

# Rebuild the server and SSR sources.
pnpm --filter @rhema/web exec tsc -b --watch

# Serve compiled output; set the environment described in docs/configuration.md first.
pnpm --filter @rhema/web exec node --watch dist/main.js
```

Rebuild SSR islands separately with `pnpm --filter @rhema/web exec node build-client.mjs`. The SPA watcher builds files; it does not start an HTTP server. There is no configured Vite HMR server. Running `tsx src/main.ts` also does not start this server: its automatic entry point is the compiled `main.js`.

## Browser verification

Component tests use happy-dom, Testing Library, and axe-core. See [testing](../../docs/testing.md) for the distinction between component checks and deployed browser acceptance.

After building, run the relevant repository gates:

```bash
pnpm check:spa-budget
pnpm check:spa-env
pnpm check:dom-contract
pnpm check:protocol-markers
```

The budget configuration is [`spa-budget.json`](spa-budget.json). The environment gate rejects server secrets and retired renderer configuration in browser sources/artifacts. DOM changes must remain consistent with the manifest and assertions. User-surface acceptance additionally requires the [browser journeys](../../packages/journeys/README.md) against a served, SHA-verified deployment.
