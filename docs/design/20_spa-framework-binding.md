# 20_spa-framework-binding — Framework decision matrix + SPA/Hono binding architecture

**Stream:** B
**Researched:** 2026-10-07
**Author:** explore-subagent (framework/binding worker)
**Ledger rows covered:** B1
**Confidence overall:** high

**Operator-fixed constraints (recorded, not relitigated):** TanStack Router + TanStack Query;
hybrid SSR (public/marketing/login stay Hono SSR, auth'd surfaces become the SPA); Vite as the
bundler (ADR-007 amended); strangler migration behind per-surface flags with SSR as the fallback.

*(Note numbering: emitted requirements are `REQ-FW-1..12` — renamed from the worker's
`REQ-ARCH-*` draft because REQ-ARCH is the product spec's architecture namespace.)*

## Findings

### F1 — TanStack Router's async model is a 1:1 port of the existing guard+loader idiom

**Claim:** TanStack Router runs, per navigation, `validateSearch` → `beforeLoad` (serial,
top-down; throwing stops children) → `loader` (parallel) → `pendingComponent`/`component`/
`errorComponent`; `beforeLoad` is the documented home for auth redirects (`throw redirect(...)`),
which mirrors today's per-handler `deps.session(c)` guard exactly (session absent ⇒ `/login`).
**Status:** VERIFIED
**Evidence:** https://tanstack.com/router/latest/docs/framework/react/guide/data-loading (route
lifecycle ordering; `loaderDeps` re-run semantics; `shouldReload`);
https://github.com/TanStack/router/blob/main/docs/router/guide/authenticated-routes.md
("`beforeLoad` … a great place to check if a user is authenticated, and redirect them to a login
page"; parents run before children — one auth'd subtree root gates every descendant).
Code-side: `apps/web/src/server.ts:3184-3186` (canonical guard), `server.ts:422-425` (ApiError
401 ⇒ `/login`).
**Retrieved:** 2026-10-07T21:00:00Z
**Implication for the spec:** The "session absent ⇒ /login" rule becomes ONE `beforeLoad` on the
auth'd root route instead of ~100 per-handler checks; api-side 401 keeps the onError⇒/login
semantic as a thrown redirect from the BFF fetch wrapper.
**Outline delta:** CONFIRMS the framework choice; EXTENDS §auth with the router-level gate.

### F2 — TanStack Query composition is first-class and documented, not hand-rolled

**Claim:** The sanctioned pattern is `loader: ({context}) => context.queryClient.ensureQueryData(opts)`
with `useSuspenseQuery(opts)` in the component; `queryClient` rides router context via
`createRootRouteWithContext`; and `defaultPreloadStaleTime: 0` is REQUIRED so Router's own
preload cache never second-guesses Query freshness. Mutations, dedupe, background refetch, and
invalidation are Query's, which maps onto the DataSource-method endpoint inventory.
**Status:** VERIFIED
**Evidence:** https://tanstack.com/router/latest/docs/integrations/query ;
https://github.com/TanStack/router/blob/main/packages/react-router/skills/compositions/router-query/SKILL.md
("CRITICAL: Set defaultPreloadStaleTime: 0"); example wiring
https://github.com/TanStack/router/blob/24cc08f8/examples/react/basic-react-query/src/main.tsx
(`createRouter({context:{queryClient}, defaultPreload:'intent', defaultPreloadStaleTime:0})`).
TanStack Query is at v5.104.x as of 2026-10 (npm registry + TanStack/query releases).
**Retrieved:** 2026-10-07T21:00:00Z
**Implication for the spec:** Data fetching is "Query owns the cache; Router orchestrates it" —
loaders never hand-roll fetch state; the spec's endpoint table (REQ-DAT-1) seeds `queryOptions`
factories keyed per BFF endpoint.
**Outline delta:** CONFIRMS §data-layer; EXTENDS with the `defaultPreloadStaleTime: 0` obligation.

### F3 — Typed params + `validateSearch` subsume the `?`-param flash grammar

**Claim:** Path params (`$project`, `$runId`, …), `params.parse`, `validateSearch` (schema-typed
search), and `loaderDeps` (search→cache-key) are built in; links/navigation are type-checked
against the generated route tree. Today's `?saved=1`/`?notice=`/`?disposed=`/`?bulkdone=` echo
params become validated search fields on the matching routes; deep links keep resolving because
the URL space is unchanged.
**Status:** VERIFIED
**Evidence:** https://tanstack.com/router/latest/docs/framework/react/guide/data-loading
(`validateSearch`, `loaderDeps`); census flash vocabulary — docs/research/01_route-census.md F5,
REQ-INV-3; manifest paths — `apps/web/src/routes.tsx:72-140`.
**Retrieved:** 2026-10-07T21:00:00Z
**Implication for the spec:** Each SPA route declares `validateSearch` over exactly the flash
params its SSR twin consumes; mutation responses carry the same tokens as structured fields and
the client navigates with them (REQ-DAT-3).
**Outline delta:** EXTENDS §routing with a per-route search-schema contract.

### F4 — Route-level code splitting is built in; automatic splitting needs file-based routing + the Vite plugin

**Claim:** Components/error/pending/not-found are lazily loadable per route either via
`autoCodeSplitting` (file-based routing + `@tanstack/router-plugin` on Vite ONLY — not the CLI)
or `.lazy.tsx` / code-based `Route.lazy()`; critical config (params/search/loaders) stays eager.
**Status:** VERIFIED
**Evidence:** https://tanstack.com/router/latest/docs/guide/code-splitting ("automatic
code-splitting … ONLY available when you are using file-based routing with one of our supported
bundlers"); https://tanstack.com/router/latest/docs/routing/file-based-routing.md.
**Retrieved:** 2026-10-07T21:00:00Z
**Implication for the spec:** Since Vite is already admitted, file-based routing + the router
plugin buys codegen'd types AND automatic splitting for free; code-based routing remains viable
but forfeits auto-splitting (manual `lazy()` per route) — a real fork in the spec, see Open
questions.
**Outline delta:** EXTENDS §build.

### F5 — React Router 7's equivalent surface lives behind framework mode, which buys a second server runtime we do not need

**Claim:** RR7's typed params/loaderData/code-splitting/SPA+SSR strategies exist only in
framework mode — which requires its own Vite plugin, `routes.ts` route modules, `+types`
codegen, and (even for `ssr:false` SPA mode) a build-time server render via `@react-router/node`
with SSR-safe route modules. Data mode has loaders/actions but no first-class cache (the router
owns revalidation) and no typed search; declarative mode — what `apps/web` uses today for
`matchRoutes`/`StaticRouter` — has no data APIs at all.
**Status:** VERIFIED
**Evidence:** https://reactrouter.com/start/modes (mode/feature matrix; framework mode "wraps
Data Mode with a Vite plugin"); https://reactrouter.com/7.16.0/how-to/spa (`ssr:false` still
server-renders the root at build time; needs `@react-router/node`; routes must be SSR-safe);
https://reactrouter.com/7.17.0/start/framework/routing (`+types` codegen is a route-module
feature). Repo state: `react-router@^7.9.1` in `apps/web/package.json:48` used only server-side
(`render.tsx:3`, `routes.tsx:2,146`) — it never ships to a browser.
**Retrieved:** 2026-10-07T21:00:00Z
**Implication for the spec:** Choosing RR7 framework mode would spend the same Vite integration
cost for a runtime that wants to own document SSR and revalidation — both already owned by Hono
and Query here. RR7 library mode stays for the SSR manifest (no conflict: it never reaches the
bundle).
**Outline delta:** CONFIRMS the operator's pick; records the rejected alternative.

### F6 — TanStack Start is SSR + server functions over Router — capabilities the Hono host already provides

**Claim:** Start = Router + full-document SSR/streaming, server functions (typed RPC), API
routes, middleware, and full-stack deployment builds; TanStack's own guidance is that if you
know you will not need those, Router alone is the right tool. Our hybrid keeps SSR on Hono
(public funnel) and the BFF on Hono (auth'd JSON/SSE/binary), so every Start-specific feature
duplicates infrastructure that exists and is prod-verified.
**Status:** VERIFIED
**Evidence:** https://github.com/TanStack/router/blob/main/docs/start/framework/react/overview.md
("if you know with certainty that you will not need any of the above features … use TanStack
Router alone"); https://tanstack.com/start/latest/docs/framework/react/comparison (capability
matrix vs Next/RR); note TanStack Router's own SSR guide warns the DIY-SSR APIs are experimental
until Start stabilizes — reinforcing "no SSR in the SPA half".
**Retrieved:** 2026-10-07T21:00:00Z
**Implication for the spec:** The spec takes Router as an SPA library inside a Hono-served
document; no server functions, no Start runtime, no second server framework.
**Outline delta:** CONFIRMS the operator's pick; records the rejected alternative.

### F7 — The SPA mounts inside the existing Hono document pipeline with zero CSP changes

**Claim:** `renderDocument` (render.tsx:115-179) already produces the complete document head —
`themeCss()` + `ideCss()` inline styles, the pre-paint `themeBootScript()` IIFE, route-aware
title/meta — and the post-response middleware nonces every `<script>` on HTML responses and
serves `script-src 'self' 'nonce-…'` (server.ts:341-371), which already admits same-origin
bundles like today's `/assets/ide.js`. A SPA document is the same head + `<div id="root">` +
a deferred module script; the CSP middleware stamps it untouched.
**Status:** VERIFIED
**Evidence:** `apps/web/src/render.tsx:88-93,149-177`; `apps/web/src/server.ts:323-372` (CSP,
nonce injection, `connect-src` incl. collab origin, `form-action` Stripe/Google allowlists);
`apps/web/client-entries.mjs:5` + `server.ts:5645-5654` (asset route + empty-404 convention).
**Retrieved:** 2026-10-07T21:00:00Z
**Implication for the spec:** Add a `renderSpaDocument()` sibling (same head contract; mount
div; `/assets/spa/<entry>.js` module tag; optional boot JSON blob). No CSP relaxation — the
bundle is `'self'`; no `unsafe-eval` (Vite production output complies).
**Outline delta:** EXTENDS §shell-document; CONFIRMS CSP posture is preserved by construction.

### F8 — The auth'd document set is ~33 manifest entries → one route tree; ~20 BFF endpoints + redirects stay server-side

**Claim:** Every auth'd GET document route in `routes.tsx` (`/app`, `/app/new`, `/app/inbox`,
`/p/:project` + ~20 project children, `/voices*`, `/v/:persona`, `/app/settings/*`,
`/settings/*` aliases, `/usage`, `/p/:project/usage`, `/billing/return`) maps 1:1 onto a
TanStack route (`/p/$project`, …). Redirect-only routes (`/settings`, `/app/settings` legacy
302s, `/app/usage/r/:runId`, `/p/:project/f/:fid`, `/p/:project/edit/:draftId` GET) and the
~20 non-HTML transports (SSE, beacons, downloads, presigned 302, `/api/auth/*`, `/assets/*`)
stay Hono registrations — they are never client routes.
**Status:** VERIFIED
**Evidence:** `apps/web/src/routes.tsx:72-140`; census F1/F3/F8 + REQ-INV-1/4/8;
`docs/research/03_data-layer-audit.md` coverage table (~30 surface rows with per-route
extraction notes).
**Retrieved:** 2026-10-07T21:00:00Z
**Implication for the spec:** The SPA route tree is generated/mirrored from the existing manifest
paths verbatim — URL space unchanged (canonical §4.2 preserved); the server keeps owning every
non-GET-document registration regardless of flag state.
**Outline delta:** EXTENDS §route-mapping with the keep-server-side list.

### F9 — The browser's data path is already same-origin + credential-free; loaders reuse it verbatim

**Claim:** Today's islands fetch with `credentials:"same-origin"` and no token in the bundle;
non-ok JSON carries `{error:<code>}` (the `ApiError.code` contract, preserved end-to-end by
`chatFail`); 401-on-data ⇒ `/login`. A `bffFetch` wrapper reproduces this exactly: `fetch(path,
{credentials:"same-origin"})`, parse `{error,detail}` on failure into an `ApiError`-shaped
throw, `redirect("/login")` on 401.
**Status:** VERIFIED
**Evidence:** `docs/research/02_island-contract-map.md` F10 (no bundle holds a token);
`packages/api-client/src/index.ts:2592-2606` (ApiError), `:3301-3318` (`{error}` extraction);
`apps/web/src/server.ts:627-702` (`chatFail` status/code passthrough); REQ-DAT-2 envelope.
**Retrieved:** 2026-10-07T21:00:00Z
**Implication for the spec:** One thin client module (`spa/lib/bff.ts`) is the ONLY transport —
Query `queryFn`s and `mutationFn`s call it; it owns envelope parsing, the 401 redirect, and the
`degraded`/telemetry signal equivalents.
**Outline delta:** CONFIRMS §BFF binding; EXTENDS with the 401⇒redirect obligation.

### F10 — The strangler flag fits the existing deps-injection + fail-closed-flag convention

**Claim:** `WebDeps` is the injection seam (server.ts:121-163); `signupMode` is the precedent —
env-parsed via `parseSignupMode`, unset/unparseable ⇒ `invite` (fails closed, main.ts:108).
A per-surface flag (`spaSurfaces?: ReadonlySet<string>`, env `SPA_SURFACES` CSV, fail-closed to
∅) slots into the same pattern: each auth'd GET handler consults it before choosing
`renderSpaDocument` vs the existing SSR render — same path, two documents.
**Status:** VERIFIED
**Evidence:** `apps/web/src/server.ts:121-163` (WebDeps), `apps/web/src/main.ts:107-110`
(`parseSignupMode` fail-closed; `collabWsUrl` optional-dep pattern);
`packages/contracts` `parseSignupMode` import (main.ts:8-13).
**Retrieved:** 2026-10-07T21:00:00Z
**Implication for the spec:** Flag evaluation is server-side per request — flag off ⇒ byte-for-byte
today's SSR document; flag on ⇒ SPA document on the SAME URL (no `/spa/` shadow routes, no
subdomain). This is what makes SSR the honest fallback and keeps shared/deep links valid in
both worlds.
**Outline delta:** EXTENDS §migration-sequencing with the flag mechanism.

### F11 — Type sharing: `import type` from `@rhema/api-client` is sufficient and free; the runtime client does NOT cross to the browser

**Claim:** `@rhema/api-client` exports ~198 DTO types plus re-exported `@rhema/contracts` DTOs
(index.ts:5-47), is a declared dependency of `@rhema/web` (package.json:34), is protocol-free
(REQ-ARCH-33 header), and `verbatimModuleSyntax` (tsconfig.base.json:22) erases `import type`
at build — zero bundle bytes. The runtime `createApiClient` is bound to the api origin with
injected `SessionHeaders` (server-side cookie forwarding); the browser must instead call the
same-origin BFF, so the runtime is NOT reused — only the types.
**Status:** VERIFIED
**Evidence:** `packages/api-client/src/index.ts:1-73` (DTO exports + injectable-fetch design
comment), `apps/web/package.json:34`, `tsconfig.base.json:22`, `apps/web/tsconfig.client.json`
(Bundler resolution, DOM lib — the config the SPA sources typecheck under).
**Retrieved:** 2026-10-07T21:00:00Z
**Implication for the spec:** No new shared package is needed for DTOs; the BFF endpoint
responses ARE these DTOs (REQ-DAT-1), so `queryOptions<T>` factories import them directly. A
new package (`@rhema/spa-client` or similar) is only warranted if the BFF wrapper grows its own
generated surface — flagged as an open question, recommended: no.
**Outline delta:** EXTENDS §type-sharing with a concrete rule: types shared, transports not.

### F12 — ADR amendment mechanics: append-only; a change is a NEW ADR; next free id is ADR-106

**Claim:** `docs/adr/_TEMPLATE.md` states "Decisions are IMMUTABLE: a change is a NEW ADR";
in-place `## Amended <date>` appendices exist for narrow corrections (ADR-048:54, ADR-076:58)
but ADR-007's ban is a scope-wide reversal (bundler admitted) — convention points to a new ADR
that names what it amends (precedent: ADR-037 "Amends (display only)" header; ADR-012 cites
ADR-007 as "predecessor ruling"). The newest ADR is ADR-105; the README index is generated by
`build-memory adr-index` and must never be hand-edited (AGENTS.md).
**Status:** VERIFIED
**Evidence:** `docs/adr/_TEMPLATE.md:5-6,29`; `docs/adr/ADR-048-…:54`; `docs/adr/ADR-076-…:58`;
`docs/adr/README.md:1-5` (generated; validator diffs a regeneration); ADR-105 is the highest id.
**Retrieved:** 2026-10-07T21:00:00Z
**Implication for the spec:** Land ONE new ADR-106 that amends ADR-007's no-Vite ruling and
ADR-012's island-only ruling for the auth'd-SPA scope (draft text below); regenerate
`docs/adr/README.md`; do not edit the old ADRs (optionally each gets a dated pointer line at
implementation time, per the ADR-048 appendix convention).
**Outline delta:** EXTENDS §migration with the ADR mechanics.

## Decision matrix (spec rationale section)

| Axis | **TanStack Router + Query (chosen)** | React Router 7 | TanStack Start |
|---|---|---|---|
| Server model | SPA library; mounts in any document. Hono keeps SSR + BFF. | Framework mode wants to own the document pipeline + its own Vite plugin/runtime (`@react-router/node` required even for `ssr:false`). | Full-stack: SSR/streaming/server functions/API routes — duplicates the landed Hono host. |
| Data layer | Router orchestrates; Query owns cache/dedupe/SWR/retries/mutations — matches the DataSource-method endpoint inventory. | Loader/action pairs with router-owned revalidation; Query integration is hand-rolled. | Server functions (typed RPC) — a second BFF we don't need. |
| Type safety | Generated route tree: typed params, `validateSearch` schemas, typed `Link`/`navigate`. | `+types` codegen only in framework mode; search is untyped `URLSearchParams`. | Same as Router. |
| Search params | First-class + validated — maps the `?saved`/`?notice` flash grammar directly. | Untyped. | Same as Router. |
| Code splitting | `autoCodeSplitting` via the Vite router plugin (file-based) or `.lazy()` (code-based). | Route-module splitting in framework mode only. | Included. |
| Auth gate | One `beforeLoad` on the auth'd root route = today's `deps.session` guard, hoisted. | `loader` throw + `redirect`. | `beforeLoad` + server middleware. |
| Migration fit | Per-surface mount; SSR fallback untouched; strangler-friendly. | SPA mode is one build output — weaker per-surface granularity. | Wholesale framework adoption; heaviest. |
| Cost/risk | Two new deps + Vite build inside `@rhema/web`; `tsc -b` graph untouched for the server. | Same Vite cost PLUS a runtime that owns concerns already owned here. | Highest: new server framework, deployment model. |

## Binding architecture (the design)

### 1. Documents and mount

- **Public/funnel documents are unchanged** (`/`, `/invite`, `/pricing`, `/signup`, `/login`,
  `/logout`, `/showcase`, plus `/api/auth/*`, beacons, assets, healthz — REQ-INV-6). They stay
  Hono SSR + islands; `landing.js` keeps the drop-zone hold contract.
- **Auth'd GET document routes gain a fork:** the handler first checks
  `deps.spaSurfaces?.has(<surface>)`; off ⇒ today's `renderDocument(...)`; on ⇒
  `renderSpaDocument(url, boot)` — a new sibling in `render.tsx` emitting:
  - the identical `<head>` contract (favicon, viewport, `themeCss()`, `ideCss()` for IDE-flagged
    surfaces, the nonce'd `themeBootScript()` IIFE — REQ-ISL-15 parity, no wrong-theme flash);
  - `<body>` = `<div id="root">` + a skeleton shell (styled by the theme stylesheet — see Open
    questions) + `<script type="module" src="/assets/spa/app.js">` + an optional
    `<script type="application/json" data-spa-boot>` blob (principal id, theme pref, project
    slug, surface flag set — seeds Query/router context so the first paint isn't a waterfall);
  - the existing CSP middleware nonces it untouched; `script-src 'self'` admits the bundle.
- **Asset serving** extends the existing convention: `vite build` emits `public/spa/*`;
  `server.ts` mounts `GET /assets/spa/*` next to the `CLIENT_ENTRIES` loop; the HOT.1
  built⇒served parity test extends to the SPA manifest (`manifest.json` from Vite).
- **Boundary crossings are document navigations.** `<Link>` is SPA-internal only; links to
  public/auth paths (e.g. `/login`, `/pricing`, sign-out) use hard navigation
  (`<a href>` / `router.navigate({ reloadDocument: true })` / `window.location.assign`),
  because those paths are not in the client route tree. Likewise a flagged-off user's SSR page
  links into a flagged-on surface (or vice versa) cross as normal GETs — the SAME URL serves
  either document, which is exactly why the flag lives server-side.

### 2. Route tree

- `apps/web/src/spa/routes/` (file-based; see F4/Open question 2) mirrors `routes.tsx` for the
  auth'd subset, verbatim paths: `/app`, `/app/new`, `/app/inbox`, `/p/$project`,
  `/p/$project/r/$runId`, `/p/$project/review/$runId`, `/p/$project/v/$v`,
  `/p/$project/v/$n/diff/$m`, `/p/$project/a/$artifactId`, `/p/$project/outline`,
  `/p/$project/figures*`, `/p/$project/visualize`, `/p/$project/settings`, `/p/$project/export`,
  `/p/$project/import`, `/p/$project/voice/reseed`, `/p/$project/obligations/new`, `/voices`,
  `/voices/new`, `/v/$persona`, `/app/settings/*`, `/usage`, `/p/$project/usage`,
  `/app/settings/billing`, `/billing/return`.
- **Redirect-only and alias routes stay server 302s** (REQ-INV-8): `/settings`,
  `/app/settings` bare, `/settings/billing`, `/app/usage/r/$runId`, `/p/$project/f/$fid`,
  `/p/$project/edit/$draftId` GET. The SPA route tree does not register them; a client-side
  hit on those paths falls through to a hard navigation or the server's redirect.
- A single root `beforeLoad` under the auth'd tree resolves session presence (from the boot
  blob or `GET /bff/session`-equivalent) and throws the `/login` redirect — F1.
- Each route declares `validateSearch` over its SSR twin's consumed params (F3) and
  `loaderDeps`/`loader` composing `queryOptions` per REQ-DAT-1's endpoint table.

### 3. Loader → BFF → Query binding

- **`bff.ts`** (the only transport): `fetch(path, { credentials: "same-origin", headers:
  { accept: "application/json", … } })`; non-ok ⇒ parse `{error, detail}` and throw an
  `ApiError`-shaped error preserving `code` at the upstream status (REQ-DAT-2); 401 ⇒ hard
  redirect to `/login` (`window.location.assign` — `/login` is outside the tree).
- **Reads:** `loader: ({ context, params, deps }) =>
  context.queryClient.ensureQueryData(dossierQuery(params.project, params.runId))`;
  components `useSuspenseQuery` — no loading flash on revisit, background revalidation free.
  `defaultPreload: "intent"`, `defaultPreloadStaleTime: 0` (F2).
- **Query keys** derive from the BFF endpoint inventory (REQ-DAT-1/4): e.g.
  `["project", slug, "dossier", runId]`, `["project", slug, "feed", afterSeq]`,
  `["settings", section]`. Composite surfaces either get one BFF aggregate endpoint ⇒ one key,
  or a documented fan-out ⇒ a key per seam.
- **Mutations:** `useMutation` → BFF JSON POST → the response carries today's redirect/flash
  outcome as structured fields (REQ-DAT-3: `{notice, saved, disposed, redirect, url}`); the
  client then `router.navigate`s (typed params) and/or `invalidateQueries` the affected keys.
  External hand-offs (Stripe checkout/portal/payment-link, OAuth) arrive as `{url}` and are
  executed as `window.location.assign(url)` — navigations, not form posts, so `form-action`
  doesn't bind them; the server-side allowlist validation (ADR-027/MAINT.5) is unchanged.
- **Non-JSON transports stay as-is** (REQ-INV-4, REQ-DAT-8): `EventSource` on
  `/p/$project/r/$runId/events?after=`; collab WSS via the injected `collabWsUrl`; binary
  downloads as navigations; presigned PUTs direct-to-GCS; `sendBeacon` for dwell/acq.
- **Degradation:** optional seams keep the REQ-DAT-12 contract — BFF serializes
  absent/degraded as `null`; Query's error path + per-query `retry`/`staleTime` config encodes
  "hide the affordance, never fail the page."

### 4. Strangler mechanics

- `SPA_SURFACES` env → `parseSpaSurfaces()` (fail-closed ∅, same shape as `parseSignupMode`) →
  `WebDeps.spaSurfaces`. Surface keys are the census's surface groups (`home`, `inbox`,
  `project`, `dossier`, `page`, `outline`, `figures`, `voices`, `settings`, `billing`,
  `usage`, `export`, `import`, `run-sheet`, …).
- Flag ON + missing bundle artifact ⇒ the existing empty-404 asset convention turns the SPA
  document into a styled shell with no script — acceptable degradation; a `?ssr=1`-style escape
  hatch is an open question for journeys/debugging (Open question 4).
- Because URL space is identical in both modes, the JOURNEY.1 registry and every deep link
  survive flag flips by construction.

### 5. Type sharing

- **Rule:** SPA code does `import type { …Dto } from "@rhema/api-client"` (already a declared
  dep; `verbatimModuleSyntax` erases the import). Shared pure mapping modules
  (`@rhema/findings-core`, `@rhema/run-sheet` view builders, `feedRowsFor`) MAY be imported for
  real if a spec row decides client-side view-model mapping (REQ-DAT-5) — they are plain TS —
  but the marker/license gates still scan the emitted bundle.
- **Not shared:** `createApiClient` (api-origin base URL + server-side `SessionHeaders`
  injection), `DataSource`, anything touching Node APIs. The browser runtime is `bff.ts` only.

### 6. Build wiring

- `@rhema/web` gains devDeps `vite`, `@tanstack/router-plugin` (if file-based), and deps
  `@tanstack/react-router`, `@tanstack/react-query`. The server graph (`tsc -b`, NodeNext) is
  untouched — Vite owns only `src/spa/**` → `public/spa/`; `tsconfig.client.json`'s include
  extends to `src/spa` (or a `tsconfig.spa.json` sibling; same Bundler-resolution pattern).
- React stays at repo version (^18.3.1) — Query v5/Router support React 18; a React-19 bump is
  a separate decision (Open question 5).
- `react-router` remains for SSR `matchRoutes`/`StaticRouter` — server-side only, never in the
  client bundle.

## Draft ADR — `docs/adr/ADR-106-spa-shell-tanstack-vite.md` (write verbatim at spec time)

```markdown
# ADR-106: Auth'd surfaces migrate to a TanStack Router + Query SPA built with Vite — amends ADR-007, ADR-012

- **Status:** Proposed
- **Date:** 2026-10-07
- **Ticket:** frontend-SPA migration (synthesize-spec stream B, row B1; owner ticket TBD)
- **Requirement ids:** REQ-FW-1 … REQ-FW-12 (docs/design/20_spa-framework-binding.md);
  amends ADR-007 (no-Vite/no-framework-mode ruling) and ADR-012 (island-only interactivity
  ruling) for the authenticated-surface scope
- **Spec:** docs/frontend-spa-brief.md; docs/design/20_spa-framework-binding.md

## Context

ADR-007 banned Vite and React Router framework mode for the REQ-BETA-21 throwaway shell: the
green gate was `tsc -b` only, and spending toolchain integration on a discardable shell was
poor value. ADR-012 extended that posture to P1.01: the IDE mounts as attribute-driven esbuild
islands on the Hono SSR host, no hydration, no framework mode. Both ADRs were scoped — ADR-007's
own revisit trigger was the real SPA arriving, and ADR-012's was a surface needing a
client-owned document tree.

The operator has now fixed the direction (frontend-spa-brief, 2026-10-07): auth'd app surfaces
become a real React SPA — "snappy, modern, no page refreshes" — while public/marketing/login
stay Hono SSR; TanStack Router + TanStack Query is the chosen stack; Vite is the bundler;
migration is strangler-style behind per-surface flags with SSR as the fallback. The forces that
made ADR-007/012 correct (green-gate simplicity, no client interactivity needed at beta) no
longer hold for the auth'd product.

## Decision

- `apps/web` ships a Vite-built SPA bundle (TanStack Router + TanStack Query) mounted inside a
  Hono-served shell document; Hono remains the server host and the same-origin BFF.
- **ADR-007 is amended** for the auth'd scope: its "no bundler" ruling applied to the throwaway
  beta shell and is retired; SSR documents still build under `tsc -b` — Vite owns only the
  client bundle.
- **ADR-012 is amended** per surface: the attribute-driven island idiom is superseded as each
  surface's flag flips; islands remain the fallback implementation while a flag is off.
- The same URL serves SSR HTML (flag off) or the SPA document (flag on) — the flag is a
  server-side, fail-closed `SPA_SURFACES` set injected through `WebDeps`.
- CSP posture is unchanged: `script-src 'self' 'nonce-…'`, no `unsafe-eval`, the `form-action`
  Stripe/Google allowlists intact (outbound hand-offs remain navigations, now client-initiated
  from `{url}` JSON responses).
- The session cookie stays on `rhema.tools`; the browser calls same-origin BFF endpoints with
  `credentials:"same-origin"`; the ADR-040 web→api stamp is unchanged; no bundle holds a
  credential (REQ-ARCH-33).

## Consequences

- Good: client routing + Query caching deliver the no-refresh, snappy surface; the URL space,
  auth boundary, BFF, and CSP are preserved by construction; SSR remains a working fallback
  throughout migration; both ADRs' revisit conditions are met rather than violated.
- Good: `@tanstack/*` types + `@rhema/api-client` DTO `import type`s give end-to-end type
  safety with zero shipped runtime cost.
- Bad: two rendering idioms (SSR documents + islands vs SPA) coexist for the flag period —
  deliberately, this time, and bounded by the flag set.
- Bad: the green gate gains a Vite build; `check:protocol-markers`, `check:licenses`, and the
  asset-parity discipline extend to `public/spa/*`.
- React Router stays as a server-side manifest/match library for SSR; it is not shipped to
  browsers.

## Alternatives considered

- **React Router 7 (data or framework mode):** framework mode wants its own Vite plugin, route
  modules, and `@react-router/node` even for `ssr:false`, re-buying the toolchain ADR-007
  priced out while duplicating document/caching concerns Hono + Query own; library/data modes
  lack typed search and first-class cache semantics.
- **TanStack Start:** full-document SSR + server functions — server capabilities the landed
  Hono host already provides; rejected per TanStack's own guidance.
- **Hydrate the existing SSR markup (`hydrateRoot`):** the SSR component tree is the OLD pages;
  it cannot hydrate into the new SPA tree, and keeping markup parity across both idioms was
  rejected by ADR-012 for the same reason.

## Revisit trigger

Reopen if the hybrid split itself is reversed (e.g., public surfaces move into the SPA, or the
BFF moves off `apps/web`), if TanStack Router/Query exits maintained status, or if a hard
requirement for server-rendered auth'd HTML emerges (which would re-open the Start/RR7
framework-mode comparison).
```

*(At implementation: also append a dated one-line pointer to ADR-007 and ADR-012 per the
ADR-048 `## Amended <date>` appendix convention, and regenerate `docs/adr/README.md` via
`build-memory adr-index` — never hand-edit it.)*

## Open questions

1. **SPA document's pre-mount markup.** Bare `<div id="root">` + themed skeleton (simplest; a
   one-time first-paint cost per session, amortized by client navs thereafter) vs shipping the
   SSR shell regions for instant paint (duplicates markup). The brief's "first paint never
   regressed knowingly" clause is scoped to public/SEO surfaces, but the spec should pin the
   auth'd answer explicitly — recommend themed skeleton + boot-JSON seeding.
2. **File-based vs code-based routing.** File-based + `@tanstack/router-plugin` unlocks
   `autoCodeSplitting` and generated types but adds codegen to the build (routeTree.gen.ts —
   check-in or gitignore decision; AGENTS.md's "no cross-package relative imports" is
   unaffected). Code-based keeps explicit `createRoute` trees closer to today's `routes.tsx`
   manifest at the cost of manual `.lazy()` splitting. Recommend file-based; needs a spec line.
3. **`?ssr=1` request-level escape hatch** — useful for journeys debugging and incident triage
   during the flag period; or is the env flag the only switch? (Req-level override must not
   weaken the auth boundary — it only picks the document shape.)
4. **Boot-seed vs `GET /bff/session`.** The root `beforeLoad` needs session presence: embed the
   principal in `data-spa-boot` JSON (one fewer round-trip, mirrors `ideContext`'s principal)
   or fetch a session endpoint. Boot blob is recommended; the endpoint is needed anyway for
   cache-less hard loads after expiry.
5. **React 19.** Repo pins `^18.3.1`; TanStack supports 18. Upgrading to 19 (for the SPA's sake
   or wholesale) is a separate operator-level decision — SSR `renderToStaticMarkup` path is
   compatible either way.
6. **Error-boundary parity.** SSR's `notFoundElement`/bare-500 posture maps to
   `notFoundComponent`/`defaultErrorComponent`; whether SPA errors keep the "one structured
   line + request id" telemetry channel (ADR-053) needs a stream-B companion row — the BFF
   error envelope carries the request id today only via headers.
7. **editor.js/Source-mode disposition and the Page collab binding** are row B-mates'
   (island→React mapping) concerns; flagged here because the collab island is the largest
   single chunk and may want its own lazy-loaded route-level chunk boundary.

## Spec requirements emitted

1. **REQ-FW-1** — The SPA SHALL be TanStack Router + TanStack Query, bundled by Vite, mounted
   inside a Hono-served shell document; no second server framework (no TanStack Start, no
   React Router framework mode) SHALL be introduced. ADR-007/ADR-012 SHALL be amended by a new
   ADR-106 per the append-only convention.
2. **REQ-FW-2** — The public/funnel document set (REQ-INV-6: `/`, `/invite`, `/pricing`,
   `/signup`, `/login`, `/logout`, `/showcase`, `/api/auth/*`, beacons, assets, `/healthz`)
   SHALL remain Hono SSR + islands and SHALL NOT enter the client route tree.
3. **REQ-FW-3** — Every auth'd GET document route SHALL serve either the SSR document or the
   SPA document on the SAME URL, selected by a server-side, fail-closed, per-surface flag set
   injected through `WebDeps` (the `signupMode` pattern); flag off ⇒ byte-identical today's SSR.
4. **REQ-FW-4** — The SPA route tree SHALL mirror the `routes.tsx` manifest paths verbatim
   for the auth'd subset; redirect-only/alias routes (REQ-INV-8) SHALL remain server-side 302s
   and SHALL NOT be registered as client routes; the §4.2 canonical URL space SHALL NOT change.
5. **REQ-FW-5** — The auth boundary SHALL be a single `beforeLoad` on the auth'd route-tree
   root (session absent ⇒ redirect to `/login`); BFF 401 responses SHALL produce the same
   outcome; public-page reverse-gating (`signedIn` ⇒ `/app`) stays server-side.
6. **REQ-FW-6** — All SPA data traffic SHALL flow through ONE same-origin client module
   (`bffFetch`): `credentials:"same-origin"`, `accept: application/json`, `{error:<code>,
   detail?}` parsed into an `ApiError`-shaped throw preserving the upstream code/status
   (REQ-DAT-2); no credential SHALL exist in the bundle (REQ-ARCH-33).
7. **REQ-FW-7** — Route `loader`s SHALL orchestrate TanStack Query (`ensureQueryData` +
   `useSuspenseQuery`; `defaultPreloadStaleTime: 0`); query keys SHALL derive from the REQ-DAT-1
   endpoint inventory; mutations SHALL be Query mutations whose structured responses carry the
   former 302+flash outcomes (REQ-DAT-3) and drive typed `router.navigate`/targeted
   `invalidateQueries`.
8. **REQ-FW-8** — Non-JSON transports SHALL be unchanged: same-origin SSE `EventSource` with
   `?after`/`Last-Event-ID`, the collab WSS upgrade, binary downloads as navigations, presigned
   PUTs direct-to-GCS, `sendBeacon` sinks. External hand-offs (Stripe, Google OAuth) SHALL be
   client-initiated navigations to server-issued allowlisted `{url}` values.
9. **REQ-FW-9** — DTO types SHALL be shared via `import type` from `@rhema/api-client`
   (already a declared dep of `@rhema/web`; erased by `verbatimModuleSyntax`); the runtime
   `createApiClient`/`DataSource` SHALL NOT ship to the browser.
10. **REQ-FW-10** — The SPA document SHALL carry the same `<head>` contract as SSR documents
    (theme stylesheet, nonce'd pre-paint theme boot, favicon/viewport meta) and the existing
    CSP middleware SHALL stamp it unchanged (`script-src 'self' 'nonce-…'`, no `unsafe-eval`,
    `form-action` allowlists intact); a missing bundle artifact SHALL degrade per the existing
    empty-404 asset convention.
11. **REQ-FW-11** — Cross-boundary navigation (SPA ↔ public/SSR paths) SHALL be a document
    navigation, never an in-router navigation; every flash/search param an SSR twin consumes
    SHALL be declared in the SPA route's `validateSearch` so deep links resolve identically in
    both modes.
12. **REQ-FW-12** — The build SHALL add Vite to `@rhema/web` for `src/spa` only (the `tsc -b`
    server graph is untouched); `check:protocol-markers`, `check:licenses`, the canonical-vocab
    lint, and the built⇒served asset-parity test SHALL cover `public/spa/*`; the client
    typecheck SHALL extend the `tsconfig.client.json` pattern (Bundler resolution, DOM lib).
