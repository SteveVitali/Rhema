# R7DEM.4 — Demo serving (server half)

- **Ticket:** `docs/tickets/220_R7DEM.4__demo-serving.md` (manifest row 220 of 254)
- **Base:** `stevevitali/r7data-1-real-corpus` @ `81d4145` · **Branch:** `stevevitali/r7dem-4-demo-serving`
- **Stage A only** — $0, local. No preview (`GD-PREVIEW.R7`), no deploy, no paid inference, zero
  production mutations (`4938b8e`). Stage-B legs are carried by `D-R7DEM.4-1` → 224_R7DEP.1.
- **ADR:** completes ADR-126's server-side **Decision** via a dated note; carries the dated
  REQ-ED-12/ADR-108 amendment for the demo leg (demo Pages render SPA read-only on every device
  class — no SsrHandoff on a phone UA).

## What this does

Serves the committed 218/218a snapshot corpus publicly: anonymous visitors read real essays'
editorial records through the same SPA and the same `/bff` twins — with no session, no tenant,
and no DB or API read on any demo path.

- **Registry + vocabulary** (`@rhema/contracts/src/demo.ts`): `DEMO_SLUG_PREFIX = "demo~"` (the
  api slug grammar can't emit `~`, so the namespace can never collide), the `DEMO_ESSAYS`
  registry (4 real essays + the synthetic fixture flagged `fixture:true`), `isDemoSlug` /
  `demoEssayFor` helpers, and `DEMO_ROUTE_IDS` — the 9 document routeIds plus the
  `palette-search` endpoint shared by server guard and SPA. `/demo` joins `SPA_PUBLIC_ROUTES`.
- **The demo guard** (`apps/web/src/demo.ts`): one `app.use("*")` before `/session` and every
  `/p`/`/bff` handler. Claims `/demo`, `/demo/<essay>/…`, `/p/demo~*`, `/bff/p/demo~*`.
  Non-GET/HEAD → 405 `demo_read_only` (JSON, or a terminal SSR notice); unregistered `demo~`
  slug or non-allowlisted GET → terminal 404, never the shell. Zero DataSource calls — the test
  suite builds the outer app with a throwing, recording source to prove it.
- **`demoDataSource`** (`apps/web/src/demo-data.ts`): snapshot envelopes read lazily off disk,
  `demo~` slugs mapped back to corpus keys. Provisional 25-method `Pick` (DWEB-3 amendment —
  221's regenerated walk finalizes it); every other key throws `DemoUnsupported` (a rejected
  promise). Its module graph has no `fetch`, no `process.env`, no runtime import of
  api-client/db/live-clients/demo-corpus — eslint rule + module-graph scan test enforce it.
  `DemoError{status}` adapts to `ApiError` at the seam; the one slug-less seam (`getRunReport`)
  resolves via a per-request essay hint on `DEMO_SESSION`.
- **Nested JSON app (S-2):** a second `createWebApp({demo:true, collabWsUrl:undefined})` answers
  allowlisted twins through a cookie/authorization-stripped forward; `set-cookie` is deleted on
  return → byte-identical bodies across cookie states. `deps.demo` drives `readOnly:true` +
  `ReadOnlyProject{reason:"demo"}` on every twin and `ideContext`'s out-of-demo palette drops.
- **Boot + documents:** `/demo` is a public SSR document (N10 head contract) carrying
  `data-demo-root` for 221a's hub. `/demo/<essay>/…` and `/p/demo~<essay>/…` serve the outer
  app's shell with `demo:{essay, slug, signedIn, build}` on the boot — no `principal`,
  `theme:{}`, `signedIn` = cookie presence only, and every in-scope routeId `spa` on every
  device class. Single CSP nonce per `<script>`.
- **Cache posture (S-13/RV-11):** twins answer `public, max-age=300, s-maxage=86400` + a strong
  ETag (snapshot hash + deploy SHA); the shell sends `no-cache`. Boot carries the build SHA for
  220a's `?b=<sha>` twin fetches.
- **Asset route (REQ-DWEB-17):** `GET /bff/demo/asset/:essay/:file` serves only the essay
  index's `kind:"image"` entries (the PROVENANCE-admitted set), an extension→content-type
  allowlist, traversal refusal, `immutable` cache. `/bff/demo/feed-labels` serves the shared
  maps publicly (the SPA's labels read needs no session).
- **Corpus in the image (REQ-DOPS-2):** `@rhema/demo-corpus` becomes a prod dep so
  `pnpm deploy` ships `corpus/` + `snapshots/`; the Dockerfile fails the build if either is
  absent. The runtime root resolves from the installed package; tests pin `fixtures/synthetic`.
- **`demo` DOM-contract bucket:** `data-demo-root` + `data-demo-readonly-notice` declared,
  emitted, asserted (`check:dom-contract` green).
- **RV-35 honored:** the guard's header literals live in `demo.ts`, outside `check:no-cookies`
  TARGETS — no `never-cookies exempt` annotations needed.

## Test matrix

- R3 §7's sweep in `apps/web/src/demo.test.ts` (36 tests): registry/path facts; DataSource
  coverage + `DemoUnsupported`; write refusal before any DataSource; anonymous + signed-in boot;
  twins/cache/ETag; asset allowlist/traversal; single nonce; byte-identical twins across cookie
  states; `data-demo-root` hub; doc-meta titles; the module-graph scan; system-pool absence.
- `contracts/src/demo.test.ts` (4) — `isDemoSlug`↔`spaRouteFor` agreement per registered essay ×
  routeId; registry round-trips; `demo~zzz` prefix-vs-registered arms.
- `project-routes.test.ts` — `slugify` can never emit `~` (the collision property).
- Census updates: `routes.test.ts` public set + `/demo`; `dom-contract.test.tsx` + `demo` bucket;
  `renderer-overrides.test.ts` pins hold verbatim (the per-site `readOnlyProject:` literals stay
  inline, each gaining the demo arm).

## Verification

- `pnpm turbo build lint typecheck` — 138/138 tasks.
- `pnpm exec vitest run apps/web/src` — 1404/1404 tests.
- `pnpm test` — full suite green (count in `docs/build/runs/R7DEM.4.md`).
- `check:dom-contract` · `check:spa-budget` · `check:spa-env` · `check:protocol-markers` ·
  `check:no-cookies` · `check:demo-corpus` — all green; no ceilings raised.
- Local server (`node dist/main.js`, `API_BASE_URL` unreachable): `/demo`, `/demo/<essay>`,
  `/p/demo~*`, twins, asset, feed-labels, 405/404 refusals, cookie-invariant twins, `no-cache`/
  `public`/`immutable` postures, `signedIn` cosmetic flag — all verified against the real
  committed corpus with zero API reads.

## Out of scope (owned elsewhere)

220a: SPA boot detection, `/demo/<essay>` → internal-path rewrite or 302 fallback (S-1), `?b=`
fetch arm, client feed-labels/readOnlyProject wiring. 221/221a: side-effect gating table +
regenerated walk, capture-phase submit listener, demo hub cards. 223: REQ-TOUR-9 metrics
exception. 224: preview/deploy/CDN + `D-R7DEM.4-1`'s Stage-B capture list.

## Carries / operator asks

- `D-R7DEM.4-1` — Stage-B demo-surface verification at the deployed tip (capture list in row).
- mergePolicy OPERATOR — this PR does not merge; it stacks on `stevevitali/r7data-1-real-corpus`.
