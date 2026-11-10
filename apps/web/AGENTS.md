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

## Shell

- `apps/web/src/spa/app-shell.tsx` — `AppShell` is the one chrome: the `/_authenticated` layout
  route wraps every signed-in leaf, so navigation never unmounts it and pending/error/404 states
  render inside it. The sidebar carries wordmark, New project, Search (only with a registered
  palette provider), ≤8 recent projects + "All projects", the Inbox badge, Voices/Usage/Settings,
  the account menu (Billing, Pricing, Theme via `/ide/theme`, Sign out as a document navigation),
  and the sidebar "Demo" entry. Collapse persists per user at `rhema:sidebar:v1:<userId>`;
  `[`/`]` toggle sidebar/panel from the keymap.
- `packages/ide/src/layout.ts` `paneLayout(width, input)` owns the breakpoints: docked ≥1280,
  scrimmed overlay 1024–1279, sheet <1024; ≥1440 defaults the panel open when findings exist;
  the sidebar auto-rails at 1280–1439; no main column falls below 45 ch at ≥768 px
  (REQ-PANE-2/4, pinned by the GUARD-4 probe).
- `apps/web/src/spa/palette.tsx` `GlobalPalette` is a **lazy** chunk — the entry graph carries
  only the binding; `check:spa-entry-graph` denies cmdk/palette in entry chunks. Its search rides
  `GET /bff/search` → the tenant-scoped `GET /search` on the api (`apps/api/src/search.ts`),
  `?project=<slug>` resolved through the same `bffProjectRow` tenant check as every /bff twin.
- The demo-boot variant renders the wordmark as a `data-spa-native` document link out of the
  demo, the R7a banner, and a static sidebar frame — no workspace item or account read issues.

## Primitives

- Component stack (ADR-129, REQ-DOPS-8): per-package `@radix-ui/react-*` primitives (no
  meta-package), `lucide-react`, and `cmdk` for Combobox/palette — exact-pinned in
  `packages/ui/package.json`, all MIT, verified by `check:licenses`. The SplitPane engine is
  in-house (`packages/ide/src/layout.ts`).
- `packages/ui/src/ui-css.ts` `uiCss()` is the generated stylesheet for `primitives/**`;
  `packages/ui/src/ui-tail-css.ts` `uiTailCss()` is the second generated block the migrate-tail
  rides (`.ui-t-*` utilities). Both inline into shell documents under their size bounds.
- **GUARD-1** (`rhema/no-raw-controls`, `error` over `packages/ui/src/**` except `primitives/**`
  and `apps/web/src/**/*.tsx`, tests excluded): raw form controls are banned outside
  `primitives/`. The committed no-JS/SSR exemption list
  `tools/eslint-plugin-rhema/rules/no-raw-controls-exemptions.js` names each file/component with
  its KIT-1-fallback reason; exemptions act inside the rule, so an unlisted raw control fails.

## ReadOnlyProject

- `packages/contracts/src/read-only-project.ts` — `ReadOnlyProject{reason:"demo"|"showcase"|"run_lock"}`
  is the ONE read-only mechanism (REQ-DWEB-14, S-3). It arrives on two carriers — the boot
  payload (`readOnlyProject`, the document-level demo/showcase stamp) and the Page-family JSON
  twins (`project.readOnlyProject`, incl. `run_lock`); both decode fail-closed and the twin wins.
- `apps/web/src/spa/read-only.tsx` — `readOnlyProjectFor(boot, twin)` / `useReadOnlyProject` /
  `readOnlyProjectNow` / `<ReadOnlyNotice>` (one notice per reason; `run_lock` reuses the Page's
  existing lock banner). Write controls hide/disable **before any request**; the server guards
  stay as defence in depth (the demo guard 405s every non-GET on its namespace).
- **Frozen versions are not read-only** — typing in a frozen version forks v(N+1)
  (REQ-WRITE-7). Never model "frozen" as a fourth reason.

## Demo

- `packages/contracts/src/demo.ts` owns the vocabulary: `DEMO_SLUG_PREFIX` (`demo~<essay>` —
  `~` is outside the api slug grammar so no tenant can collide), `DEMO_ESSAYS` (four public
  essays + the `fixture:true` synthetic), `DEMO_ROUTE_IDS` / `DEMO_DOCUMENT_ROUTE_IDS` (the
  document allowlist; `/p/$project/palette-search` is the only JSON-only member),
  `demoInternalPath`/`demoPublicPath`/`isDemoNamespacePath`, `DEMO_HUB_ESSAYS` (card order),
  `demoDeepLink`, `DEMO_TOUR_PARAM`.
- `apps/web/src/demo.ts` is the guard, registered before `/session` and every `/p`/`/bff`
  handler: non-GET/HEAD → 405 `demo_read_only`; unregistered `demo~` slug or a path outside the
  allowlist → terminal 404; document GETs → the outer app's `spaShellDocument` with the demo
  boot (one CSP nonce, REQ-DWEB-8); twin GETs → the nested `createWebApp({demo:true})` with
  cookie/authorization stripped and `set-cookie` deleted on return.
- `apps/web/src/demo-data.ts` `demoDataSource(root)` answers every twin read from committed
  `snapshots/` chunks — **no DB and no API reads on any demo path**. `defaultDemoCorpusRoot()`
  resolves the installed `@rhema/demo-corpus` package; `RHEMA_DEMO_CORPUS_ROOT` overrides (tests
  and the recording harness pass `fixtures/synthetic`). `GET /bff/demo/asset/:essay/:file` is
  the allowlisted immutable asset route (png/jpg/jpeg/webp only).
- **The one sanctioned write** (REQ-TOUR-9): the beacon `POST /a/demo` → api
  `POST /analytics/demo` → `demo_events` via the insert-only role. sendBeacon `text/plain` JSON
  ≤256 B, per-instance 60/min token bucket, no session forwarded, always 204. It sits OUTSIDE
  the demo guard's claimed paths.
- Caching (S-13): twins stamp `public, max-age=300, s-maxage=86400` + ETag and the boot carries
  `?b=<sha>` so cross-deploy staleness is impossible; the shell is `no-cache`. Deploys end with
  the recorded CDN invalidation of `/bff/p/demo~*` (`scripts/live/cdn-invalidate-demo.mjs`).
- Entry/exit (S-14): every link *into* `/demo*` is `data-spa-native` — a document navigation —
  so the demo boot always carries `demo` and the workspace QueryClient is never shared. The
  SPA's TanStack `rewrite` maps `/demo/<essay>/…` ↔ `/p/demo~<essay>/…` (`demoInternalPath`).
- The recording proxy (`demoDataSourceTrace` via `RHEMA_DEMO_DS_TRACE`) logs the DataSource
  methods a walk reaches, regenerating the implemented-call table; never set it in a deployed env.
- The tour (`apps/web/src/spa/demo-tour.ts` `DEMO_TOUR_STEPS`, 11 steps on SPD) rides
  `?tour=<stepId>` on the public URL — never a cookie — and never auto-starts (REQ-GROWTH-12);
  ←/→/Esc bind only while a step is active and never inside text input.

## Keymap

- `packages/ide/src/keymap.ts` `IDE_KEYMAP` is the committed binding table; `dispatchIdeKey`
  is the pure (event, focus zone, pending prefix) → `IdeAction` dispatcher. `input`/`page`/
  `source` focus narrows dispatch (only ⌘K in input; only ⌘S in the CodeMirror source zone);
  findings chords fire only in `margin`/`findings` zones.
- REQ-KEYS-1's five rules live as data in `packages/ide/src/reserved-chords.json`:
  `nonCapturable` (Rule 1 — chords browsers never deliver), `conventionalAvoid` (Rule 2),
  `keep` (Rule 4 — ⌘K/⌘⏎/⌘S), `transitional` (empty since the remap completed). Rule 3's
  bare-key/`g`/`r`-sequence idiom and Rule 5's source-focus precedence are in the dispatcher.
  `packages/ide/src/reserved-chords.ts` is the TEST-only checker the pin test runs
  (`chordViolations` must be empty over `IDE_KEYMAP` + `ISLAND_CHORDS`); never import it from
  runtime code — it must stay out of the entry bundle.
- The `?` sheet is **generated**: `CHEAT_SHEET` maps every `IDE_KEYMAP` row, and
  `shortcutFor(actionKind)` is the only way a tooltip or menu shows a chord — never a literal.

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
   can bypass TanStack entirely. The demo boundary is the other sanctioned class (S-14): every
   link into or out of `/demo*` is `data-spa-native` by name — sidebar "Demo", landing, the
   Showcase link, the demo wordmark — never an SPA hop that would leak the workspace boot.
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
