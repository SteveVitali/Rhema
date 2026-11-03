# AGENTS.md — Web

## Purpose

- Serve the public website, authenticated writing workspace, and same-origin backend for the browser.
- Root `AGENTS.md` applies. For visual acceptance, also read `packages/journeys/AGENTS.md`.

## Architecture

- Hono SSR host + Vite-built TanStack Router/Query SPA + BFF. React Router is a server-only
  manifest/matching dependency; it must not enter the browser graph.
- Public routes in `packages/contracts/src/spa.ts` `SPA_PUBLIC_ROUTES` stay SSR, including the
  funnel and legal/trust pages. Authenticated documents serve the SPA shell after their session
  checks, except server-owned redirects and the five forced-SSR Page-family GETs.
- Page SSR is a **server verdict**: `isPhoneRequest(c)` alone (ADR-128/R7RO.1 — the showcase
  arm is removed; a showcase row renders inside the SPA read-only through
  `ReadOnlyProject{reason:"showcase"}`). The boot `surfaces` map carries the phone verdict;
  the JSON twin carries `project.showcase` + `project.readOnlyProject` as row facts. No leaf
  chooses a renderer for a twin fact any more; `SsrHandoff` remains the boot-verdict fallback.

## Key Files

| File                                | Lines (approx) | Purpose                                                |
| ----------------------------------- | -------------- | ------------------------------------------------------ |
| `apps/web/src/server.ts`            | ~6.9k          | Document routes, JSON twins, and dual-mode actions.    |
| `apps/web/src/spa-shell.ts`         | ~250           | Shell document and server-authored boot metadata.      |
| `apps/web/src/spa/main.tsx`         | ~100           | Router construction, session seed, and SPA mount.      |
| `apps/web/src/spa/nav-intercept.ts` | ~150           | Ordered delegated-link guard pipeline.                 |
| `apps/web/src/spa/queries.ts`       | ~1.3k          | Endpoint-shaped query keys and shared data operations. |
| `apps/web/src/dom-contract.ts`      | ~1.6k          | Declared selector vocabulary for tests and journeys.   |

## Build & Test

- Run from the repository root; the dependency build is needed for workspace exports.

```bash
pnpm turbo build --filter=@rhema/web...
pnpm --filter @rhema/web typecheck
pnpm --filter @rhema/web lint
pnpm exec vitest run apps/web/src
pnpm check:dom-contract
pnpm check:spa-budget
pnpm check:spa-env
pnpm check:protocol-markers
```

- `pnpm --filter @rhema/web dev:spa` watches a Vite build; it does not start an application server.
- `apps/web/vitest.config.ts` and root `vitest.config.ts` route `*.dom.test.{ts,tsx}` to happy-dom
  with `apps/web/test-setup.ts`, Testing Library, and axe-core. Keep those configs aligned.
- DOM tests disable layout-dependent axe rules; browser journey accessibility/layout evidence is
  the authoritative tier. Record any deferred journey-level axe work honestly.

## Code Conventions

- **Reads:** typed `/bff/*` twins through `bffFetch` in `apps/web/src/spa/bff.ts`. It accepts only
  same-origin `/…` paths, sends `credentials: "same-origin"`, and issues one request. Never retry
  client POSTs. Non-2xx throws `BffError { status, code, detail?, requestId? }`; 401 clears the
  session query and document-navigates to `/login`.
- **Writes:** use the existing no-JS form path. `apps/web/src/bff.ts` negotiates on `content-type`
  or `accept`: JSON gets `{ ok: true, redirect?, flash?, data?, pending?, url? }`; forms retain
  the equivalent 302 + flash URL. `url` is only an allowlist-validated external handoff.
- **Errors:** JSON gets `{ error: "<stable_code>", detail? }`, never a redirect. Use the shared
  responder's status mapping (including upstream server errors → 502). On stale 400/404/409,
  reread and invalidate the owning Query keys.
- **Queries:** loaders orchestrate `ensureQueryData`; keys mirror endpoint segments. Keep
  `defaultPreloadStaleTime: 0`; leaves use `useQuery` + `SurfaceShell`, not `useSuspenseQuery`.
- Correct ✓: add a JSON twin, loader, leaf, declared DOM hooks, and matching assertions together.
  Wrong ✗: fetch directly from the browser API origin or invent a selector only in a test.
- Client imports of `@rhema/api-client` are type-only. Private protocol/eval packages and
  `process.env` are forbidden. Runtime configuration comes from server-rendered boot JSON;
  do not introduce a new `import.meta.env` reader.
- Edit routes under `apps/web/src/spa/routes`; Vite regenerates committed
  `apps/web/src/spa/routeTree.gen.ts`. Never hand-edit that tree or generated public bundles.

## Critical Gotchas

1. **Do not resurrect renderer controls.** `?ssr=1`, `?renderer=spa`, `x-rhema-renderer`,
   `SPA_OVERRIDES`, the `SPA_SURFACES` environment variable, and `rhema:spaSurfaces` are retired.
   `SPA_SURFACES`, `SPA_IDE_FRAMED_*`, and `SPA_DOCUMENT_ROUTES` remain contract vocabulary;
   the census still builds metadata, but none is an activation flag. A `surfaces: null` route
   is a server-owned redirect registered as a `reloadDocument` stub.
2. **Keep one navigation interceptor.** `mountSpa`, never `createSpaRouter`, installs the single
   bubble-phase document click listener. Preserve the ordered guards in
   `apps/web/src/spa/nav-intercept.ts`: claimed event, non-primary button, modifiers,
   contenteditable, target/download/`data-spa-native`, foreign origin, hash-only navigation,
   out-of-tree match, then `RELOAD_STUB_IDS`. These stay native or take document navigation.
   In-tree interception is unconditional: no `surfaces`, `deviceClass`, `twinForcesSsr`, or
   `spaRouteFor` check. Clicks push; intent preloading is disabled because loaders can have effects.
3. **Use the document-navigation seam.** `navigateDocument` / `replaceDocument` in
   `apps/web/src/spa/dom.ts` share the `spaRuntime` arms. Logout, external handoffs, and binaries
   are document navigations. Keep the IDE controller's native `hashchange` listener: those hops
   can bypass TanStack entirely.
4. **Preserve settle evidence.** Every served document starts `data-nav-count="0"`; HeadManager
   ticks committed transitions and removes `data-mounted` while navigation is pending.
   `data-page-session` on `[data-page-root]` identifies the keep-alive session. Keep `data-renderer`
   and `data-route` truthful on both renderers; tests must distinguish client and document navigation.
5. **Selectors are a contract.** Declare hooks, roles, and field names in
   `apps/web/src/dom-contract.ts`, emit them, and assert them. `check:dom-contract` requires
   journeys ⊆ manifest ⊆ emitted and asserted selectors; a made-up hook is not acceptable.
6. **SSR islands are permanent while mounted.** `apps/web/client-entries.mjs` lists
   `ide`, `page`, and `landing`; `page.js` / `ide.js` still mount on forced-SSR Pages and SSR IDE
   documents. `outline` and `editor` entries are retired. Remove an entry only when no served
   document can mount it; removing `page`/`ide` changes the REQ-ED-12 design.
7. **Source mode does not replace the editor.** `apps/web/src/spa/page-source-mode.ts` dynamically
   imports plain-text CodeMirror 6 in the `codemirror` async group. Do not add the Markdown language
   bundle without resolving the bundle ceiling. Commits use `applySourceMarkdown` in
   `packages/editor/src/source-mode.ts` (three-way top-level-block merge); ProseMirror remains
   mounted and dispatching inside `data-pm-host`.
8. **A local build proves no deployment.** Surface acceptance needs a served route, screenshot,
   controls, and the expected deployed SHA. Ordered activation lives in
   `docs/build/INTEGRATION_PLAN.md`; renderer rollback is `git revert` + redeploy, never a flag flip.

## Terminology

- **Page family:** document/editor surfaces whose phone/showcase variants retain SSR.
- **Twin:** a typed JSON read for the same data as its document route.
- **Island:** a browser enhancement mounted on an SSR document.

## Do / Don't

- **Do:** check both JSON and form outcomes when changing an action, then walk the affected surface.
- **Don't:** make client-side guesses about authorization, renderer selection, or deployed capability.
