# a2_tanstack-api — Runtime API surface for delegated click interception
**Stream:** A · **Researched:** 2026-10-14 · **Ledger rows covered:** A2 · **Confidence:** high (types + shipped src both read)

**Installed:** `@tanstack/react-router@1.170.40` exact pin → `@tanstack/router-core@1.171.33` + `@tanstack/history@1.162.4`; codegen `router-plugin@1.168.41`. Router methods live on `RouterCore` — `apps/web` may only import `@tanstack/react-router` (dep rule).

### F1 — `matchRoute` is the WRONG tool for href→route resolution
It's an active-state predicate (tests *current* location against a `to` pattern), not an arbitrary-path resolver. Do not use it for the interceptor.

### F2 — `router.navigate({href})` semantics (already used for mutation redirects)
- schemeless href → `buildAndCommitLocation` (client push/replace); **`?search`/`#hash` preserved verbatim**.
- scheme'd href or `reloadDocument:true` → `documentNavigation` → `location.href`/`replace` (+ `isDangerousProtocol` allowlist + `useBlocker` consult).
- Out-of-tree schemeless path → commits → fuzzy not-found → `SpaNotFound` → `surfaces===null` → `SsrHandoff` doc-nav (works, two-hop).
- Same-URL click → revalidates in place (no history write). `replace`/`resetScroll`/`hashScrollIntoView`/`viewTransition`/`ignoreBlocker` options exist.

### F3 — `<Link>`'s click guard — the exact reference semantics (`link.js:144-158`)
Guards in order: `!linkDisabled` → **no modifier keys** (meta/alt/ctrl/shift) → `!e.defaultPrevented` → `target` absent-or-`"_self"` → `e.button===0` → `preventDefault` + `router.navigate`. External (scheme'd) links early-return native. **`download` is never checked** — a delegated handler over arbitrary `a[href]` MUST add `!hasAttribute("download")` or downloads get suppressed (deliberate Link divergence).

### F4 — Correct in-tree predicate (public typed API)
```ts
const [/* branch */, rawParams, foundRoute] = router.getMatchedRoutes(pathname);
const inTree = foundRoute != null
  ? !(foundRoute.path !== '/' && rawParams['**'] != null)
  : trimPathRight(pathname) === '';
```
`getMatchedRoutes(pathname)` → `[matchedRoutes, rawParams, foundRoute]` — the lightweight trie probe; `**` leftover = not-found marker (mirrors `matchRoutesInternal`'s own predicate). `routesByPath`/`routesById` are keyed by templates (can't resolve concrete URLs); `findRouteMatch`/`parseHref`/`flatRoutes` are private or nonexistent — avoid.

### F5 — `reloadDocument` stubs are real in-tree routes
Server-owned GETs are `createFileRoute` + `beforeLoad` throwing `redirect({href: publicHref, reloadDocument:true})` — resolved via `navigate({reloadDocument:true, replace:true})` → `location.replace` (single history slot). So an intercepted click on a stub self-doc-navs correctly. **Optional** short-circuit: `spaRouteFor(pathname).surfaces === null` → direct `navigateDocument` (skips a render; `packages/contracts/src/spa.ts:192-261`).

### F6 — Same-origin test must be hand-rolled
`getUrlScheme`/`isDangerousProtocol` live in router-core (not a declared dep; not re-exported). Hand-roll: `const u = new URL(a.href, location.origin); u.origin === location.origin` covers absolute/protocol-relative/scheme'd in one shot; `u.pathname + u.search + u.hash` is the clean `navigate` input. Fails closed on `javascript:`/`data:` (opaque origin → native/no-op).

### F7 — Existing app seams
`navigateDocument` (`spa/dom.ts` — `spaRuntime.assign` test seam), `spaRouteFor` classifier, `SpaNotFound` fallback already exist. Optional `router.preloadRoute({to})` on `pointerover`/`focusin` gives Link-parity intent prefetch (correctness doesn't depend on it).

### F8 — Decision table (recommended shape)
Link-parity event guards (+`download`) → same-origin `URL.origin` test → `getMatchedRoutes` in-tree test → `router.navigate({href: path+search+hash})`; everything else → no-op (native).

## Open questions
1. Same-origin **absolute** hrefs — strip `location.origin` and SPA-nav (recommended) vs leave native?
2. `download` guard — confirm the deliberate divergence from strict Link parity.
3. Stub short-circuit (`spaRouteFor().surfaces===null` → `navigateDocument`) vs let `beforeLoad` doc-nav (one extra hop)? Both correct — spec picks.
4. `stopPropagation` audit — does any surface call it in a way that starves a delegated document listener? (grep at spec time)
5. `preloadRoute` intent-parity — implement or accept no-preload?

## Spec requirements emitted
- **REQ-NAVC-1** — Event guards mirror `useLinkProps` `handleClick` + **`!hasAttribute("download")`**.
- **REQ-NAVC-2** — External determination hand-rolled (`new URL(a.href, location.origin)` origin test); router-core helpers not importable.
- **REQ-NAVC-3** — In-tree test = `router.getMatchedRoutes(pathname)` + the `foundRoute`/`rawParams['**']` not-found predicate (public typed API; `matchRoute`/`routesByPath`/privates are wrong).
- **REQ-NAVC-4** — In-tree → `preventDefault` + `router.navigate({href: pathname+search+hash})` (search/hash verbatim; stubs self-doc-nav; same-URL revalidates).
- **REQ-NAVC-5** — Out-of-tree → no interception (covers `/logout`, `/bff/*`, `/api/*`, binaries, public funnel).
- **REQ-NAVC-6** — Spec decisions: absolute-URL origin-stripping; optional `preloadRoute` intent-parity.
