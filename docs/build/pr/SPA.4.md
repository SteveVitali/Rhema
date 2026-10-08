# SPA.4 — SPA skeleton: router tree day-one, auth gate, bffFetch, SsrHandoff, head manager

Manifest row 101 · stacks on `stevevitali/spa-3-shell-document` @ `e61185a` · merge policy
**OPERATOR** — do not merge from the build environment · **$0** spend, no deploys, no
production writes.

Implements `docs/tickets/101_SPA.4__spa-skeleton.md` per `docs/frontend-spa-spec.md` §3.2–3.4/§7,
`docs/design/20_spa-framework-binding.md` (bffFetch contract, QueryClient shape),
`docs/design/25_spa-navigation-ia.md` (route tree, SsrHandoff, search grammar), and
`docs/design/27_spa-acceptance-mechanics.md` (settle markers).

**Deployable dark:** nothing in `src/spa` renders until a surface flag flips a route's boot-map
entry to `"spa"` — every registered route's leaf resolves its verdict from the server-built
`data-spa-boot.surfaces` map and hands unflipped routes straight back to the server via
`SsrHandoff` (a real document navigation; the server re-runs the fixed handler order). Flag-∅
requests never receive the shell at all (SPA.3's server consult) — and a shell that somehow
serves flag-∅ hands every route back, converging in ≤1 boundary cross. No SSR fallback deleted;
no flag set anywhere.

## Requirement IDs

**REQ-FW-1 · REQ-FW-2 · REQ-FW-3 · REQ-FW-4 · REQ-FW-5 · REQ-FW-6 · REQ-FW-7 · REQ-FW-8 ·
REQ-FW-9 · REQ-FW-10 · REQ-FW-11 · REQ-NAV-1 · REQ-NAV-2 · REQ-NAV-3 · REQ-NAV-4 · REQ-NAV-5 ·
REQ-NAV-7 · REQ-NAV-9 · REQ-NAV-10 · REQ-NAV-11 · REQ-BND-6 · REQ-BND-7 · REQ-BND-8 · REQ-BND-9 ·
REQ-BND-10 · REQ-DAT-7 · REQ-DAT-13 · REQ-VFY-3 · REQ-UX-1 · REQ-UX-2 · REQ-UX-6 · REQ-UX-7 ·
REQ-UX-9 · REQ-UX-11 · REQ-UX-12 · REQ-TL-9 · REQ-INV-2**

## What lands

- **`src/spa/main.tsx` + committed `routeTree.gen.ts`** — `createSpaRouter`/`mountSpa` under
  `StrictMode` (the double-mount contract); router options per contract
  (`defaultPreload:"intent"`, `defaultPreloadStaleTime:0`, `scrollRestoration`,
  `notFoundMode:"fuzzy"` — all pinned by test); `defaultPendingComponent`/`NotFound`/`Error`
  components bound. The generated tree is committed AND regenerates byte-identically
  (`vite build` → `diff` clean). All 36 authenticated document routes register day one under the
  `_authenticated` pathless layout — every `SPA_DOCUMENT_ROUTES` routeId is present in
  `router.routesByPath`, asserted at runtime (REQ-NAV-1, REQ-TL-9).
- **`routes/_authenticated.tsx`** — the ONE auth boundary: `beforeLoad` resolves
  `ensureQueryData(sessionQuery)`; a `BffError 401` throws `redirect({href:"/login",
  reloadDocument:true})` — a real document navigation since `/login` stays SSR (REQ-FW-5,
  REQ-BND-7, REQ-INV-2 auth-gate leg). Non-401 failures propagate to the designed error
  boundary — never a forged sign-out.
- **`src/spa/bff.ts`** — the ONE transport: same-origin `/…` paths only (`//` and absolute URLs
  rejected — the cookie never rides cross-origin, REQ-DAT-7), `credentials:"same-origin"`,
  `accept: application/json`, non-2xx → `BffError{status, code, detail?, requestId}` preserving
  the server's `{error, detail?}` envelope + `x-rhema-request-id`. The 401 leg invalidates
  `["session"]` (setQueryData-undefined + `refetchType:"none"` invalidate — NOT `removeQueries`,
  which would cancel the in-flight ensure and surface a CancelledError instead of the redirect)
  and document-navigates `/login`. Exactly one fetch per call — POSTs never auto-retry
  (REQ-FW-6, REQ-DAT-2/3, REQ-BFF-30).
- **`src/spa/queries.ts`** — per-boot `QueryClient` (never a module singleton — REQ-BFF-10):
  HTTP answers never retry (`BffError` → false); transport drops retry ≤2; mutations never retry.
  `sessionQuery` = `["session"]` → `GET /session` (REQ-BFF-18's pinned path — NOT `/bff/session`),
  `staleTime:30s`, seeded from `data-spa-boot` at mount (a seed, not a grant — stays refetchable).
  `feedLabelsQuery` = `["feed-labels"]` → `GET /bff/feed-labels`, `staleTime:Infinity`
  (deploy-versioned server copy, REQ-BFF-24).
- **`GET /bff/feed-labels` (`server.ts`)** — session-gated, returns the same `feedLabelMaps()`
  object SSR embeds as `data-feed-labels`; 401 anonymous. **`data.ts` `checkSession`** promoted
  from raw `fetch` to the typed api-client `getSession()` seam (REQ-DAT-13 — the boolean
  contract is unchanged: any non-2xx ⇒ false).
- **`src/spa/boot.ts` + `src/spa-boot.ts`** — the wire contract (`SpaBoot` type) moved to a
  browser-safe shared leaf consumed by both the shell producer and the client reader;
  `readSpaBoot` decodes the embed fail-closed (malformed/missing ⇒ null ⇒ every route
  SsrHandoffs); `isSpaEnabled` reads the server's per-route verdict — the client can shrink the
  effective flag set, never grow it (REQ-BND-10, REQ-SEQ-2 posture).
- **`src/spa/head.tsx`** — the client head manager: per committed navigation, `document.title`
  via the shared `docMetaFor` (parity with SSR — REQ-BND-8), focus to the route's `<h1>` (or the
  `#hash` target — deep-link parity), a polite `role="status"` live-region echo of the title,
  `data-route="<spaRouteFor id>"` stamped immediately and `data-mounted` only once the match has
  resolved (REQ-VFY-3's `[data-route][data-mounted]` probe contract) (REQ-UX-7/9, REQ-NAV-7).
- **`src/spa/states.tsx`** — `SsrHandoff` (document-nav to the current URL — the strangler
  exit), `SurfaceBoundary`/`surfaceComponent` (the per-leaf flag verdict → stub or handoff),
  `PendingShell` (skeleton rows, never blank — REQ-UX-6), `SpaRouteError` (`COPY.spaError`
  strings — designed state, distinct from auth redirects), `SpaNotFound` (server-owned
  redirect-only paths — `surfaces===null` — document-navigate so the canonical 302 answers; the
  client owns the rest of SPA-space not-found, REQ-NAV-10).
- **`src/spa/doc-meta.ts`** — `docMetaFor` extracted verbatim out of `render.tsx` into a
  browser-safe module (the client can't import the server renderer graph); `render.tsx`
  re-exports so existing sites are untouched.
- **`src/spa/search.ts`** — `validateSearchParams`/`oneParam`/`strParam`: forward-compatible
  grammar (unknown keys pass through; pinned keys narrow against closed sets — REQ-NAV-3).
- **`src/spa/dom.ts`** — `navigateDocument` over the `spaRuntime.assign` seam (tests observe the
  document navigation without stubbing `window.location`).
- **43 route files** under `routes/_authenticated/` — every leaf is a ~10-line
  `createFileRoute` stub whose component is `surfaceComponent("<routeId>")` (a literal
  `component:` property per file so the autoCodeSplitting plugin hoists each leaf into its own
  lazy chunk — `check:spa-budget` shows ~0.1 kB per leaf, entry 529 kB ≤ ceilings). Layout routes
  (`p.$project`, `app.settings`, `settings`, `usage`) provide `Outlet`s; `p.$project`'s loader
  warms `feedLabelsQuery` via `ensureQueryData` (the loader pattern the surface tickets extend).
  Redirect-only server routes (`/settings`, `/app/settings`, `/app/usage/r/$runId`,
  `/p/$p/edit/$d`, `/p/$p/f/$fid`) resolve `surfaces===null` → always `SsrHandoff`.
- **`tree.test.ts`** — pins the two load-bearing file invariants: `routeTree.gen.ts` is
  committed/regenerated and names every contract routeId; no route file eagerly imports the
  server/SSR graph (`render`, `data`, `page-data`, `server`, `spa-shell`, `feed-labels`, …) and
  no route file contains a `dynamic import()` (REQ-TL-9).

## CSP + credentials floor

No inline scripts added — the shell still emits only nonce'd `<script>` tags; `bffFetch` carries
no credential material (cookie rides `same-origin`); the boot embed stays principal-public-fields
only. No protocol/eval IP in the bundle (REQ-ARCH-33). Canonical-vocabulary + banned-strings
lint green.

## Test evidence

- `spa/boot.test.ts` 8 (embed parse/malformed/absent; surface-map verdicts; seed-not-grant) ·
  `spa/bff.test.ts` 6 (same-origin guard, `{error,detail}` + requestId, 401 → invalidate + nav,
  POST no-retry) · `spa/spa.dom.test.tsx` 19 happy-dom legs (mount + `[data-route]`/`data-mounted`
  settle contract; 401 → `/login` doc-nav; unflipped leaf → `SsrHandoff` doc-nav same-URL;
  `surfaces===null` not-found → doc-nav; title/h1-focus/live-region per nav; hash-target focus;
  pending skeleton never blank; non-401 → designed error, not `/login`; router options pin;
  `routesByPath` covers every `SPA_DOCUMENT_ROUTES` routeId) · `spa/tree.test.ts` 3.
- Server half: `spa-shell.test.ts` +2 (`/bff/feed-labels` 401 + verbatim maps; `GET /session`
  contract re-pinned).
- Gate: `turbo build lint typecheck` **135/135** · full `pnpm test` **457 files / 4,686 pass /
  4 skip / 0 fail** · `check:spa-budget` **OK** (entry 529 kB within ceilings; every leaf ~0.1 kB)
  · `routeTree.gen.ts` regen byte-stable · frozen-lockfile N/A (no manifest changes).

## Deviations / owned decisions

- **Size budget:** the diff is ~1.9k lines excl. generated — over the ticket's ~600 guide. The
  overage is structural: REQ-NAV-1's day-one registration forces 43 route files (~500 lines of
  boilerplate stubs) and every new behavior carries its own test (~600 lines of test). No fat
  found to cut; recorded honestly.
- **`docMetaFor` moved, not duplicated** — the client title parity requirement forced a
  browser-safe module; `render.tsx` re-exports to keep the import graph stable.
- **`checkSession` promotion** (REQ-DAT-13 leg): raw fetch → typed `getSession()`; the boolean
  contract is preserved (any non-2xx ⇒ false) rather than distinguishing error kinds the
  consumer never reads.
- **Intent prefetch** is the router-level `defaultPreload:"intent"` (design/20 F2) — there are no
  primary-nav `<Link>`s in the skeleton; the option is pinned by test and the mechanism warms the
  lazy leaf chunk + route loaders on hover/focus when nav links land (SPA.9 chrome).
- **Deferred:** nothing new — every AC is deterministic-engineered. No DEFERRALS row opened or
  closed.

**CI:** `gh pr checks --watch=false` recorded in `runs/SPA.4.md`; inherited
`integration`/privsep red on the chain is classified under GD-MAINT.4-1, not repaired.
