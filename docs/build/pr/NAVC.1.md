# NAVC.1 — delegated same-origin click interceptor

Manifest row 154 · stacks on `stevevitali/verif-1-composed-ffbb8ad` · merge policy
**OPERATOR** — do not merge from the build environment · contract
`docs/tickets/154_NAVC.1__delegated-interceptor.md` · run ledger
`docs/build/runs/NAVC.1.md`.

## What lands

Every same-origin in-tree anchor activation inside the SPA now routes through the
router instead of a document reload — **one** delegated bubble-phase `click`
listener on `document`, installed by `mountSpa` and nowhere else.

- **`spa/nav-intercept.ts` (new)** — `handleSpaClick` implements the spec §2.1
  ordered pipeline verbatim: `closest("a[href]")` → `defaultPrevented` → primary
  button → modifiers → contenteditable → `target`/`download`/`data-spa-native` →
  same-origin URL parse (fail-closed) → hash-only skip → in-tree match via
  `router.getMatchedRoutes` (fuzzy `**` remainders rejected) → `RELOAD_STUB_IDS`
  → `preventDefault` + navigate. (REQ-NAVM-1, REQ-NAVM-2)
- **`spa/main.tsx`** — installs the interceptor from `mountSpa` only;
  `createSpaRouter` stays interceptor-free so router-direct DOM suites are
  unaffected. `defaultPreload: "intent"` is **removed** with an audit comment —
  hover/focus preloads would execute side-effecting loaders (the handoff POST,
  email-confirm token consumption, mark-read GETs). (REQ-NAVM-7)
- **Push semantics** — intercepted activations call `router.navigate({ href })`
  with the verbatim `pathname+search+hash`; never `replace`, `resetScroll` never
  overridden. (REQ-NAVM-3)
- **Reload stubs by route id** — `/app/usage/r/$runId`, `/p/:project/edit/$draftId`,
  `/p/:project/f/$fid` are classified by generated route id (never `spaRouteFor`)
  and document-navigate the verbatim href through `navigateDocument` — the server's
  302 still answers. (REQ-NAVM-4)
- **Renderer boundary preserved** — the interceptor consults nothing about boot
  `surfaces`, `deviceClass`, `isSpaEnabled`, or `twinForcesSsr`; forced-SSR stays a
  server + leaf-pipeline verdict. (REQ-NAVM-6)
- **`data-spa-native`** — new shared `dom-contract` row; emitted on the three
  non-document GET families (`/usage.csv`, `/p/:project/export/ai-use/{md,docx}`,
  `/app/settings/data/export/download`); `check:dom-contract` green.
  (REQ-NAVM-8, REQ-NAVC-13)
- **`state-map.ts`** — latent `/voices/<id>` dead links corrected to `/v/:persona`
  (spec §2.8).

## Tests

`spa/intercept.dom.test.tsx` (new, 46 tests over the real routeTree) covers every
§2.1 guard row: pre-defaulted events, non-primary buttons, each modifier,
contenteditable + `contenteditable="false"` islands, `_blank`/`_self`/`download`/
`data-spa-native`, external + protocol-relative + opaque schemes, hash-only skips
vs search-delta intercepts, public funnel, unknown SPA paths, all three non-doc
GETs, all three reload stubs, `/settings` + `/app/settings` client-redirect
resolution, verbatim query/hash, absolute same-origin hrefs, synthetic `.click()`,
navKey commit/skip semantics, and install/dispose behavior. (REQ-NAVT-8)

**OQ1 pinned:** at `@tanstack/router-core@1.171.33`, a
`redirect({ reloadDocument: true })` mid-`beforeLoad` resolves to
`window.location.replace(href)` — the suite asserts the committed push precedes
the replace, so the eaten history slot matches spec §2.4's design.

## Out of scope (contract)

SsrHandoff replace-mode navigation and the `spaRuntime` spy migration are NAVC.5's
(`154a`); `data-nav-count`/settle semantics NAVC.2; registry/freshness NAVC.3;
live R10 legs NAVC.4; component ports to `<Link>` deferred. The stale SsrHandoff
AC row is reconciled by a dated append-only note on the contract.

## Verify

`pnpm turbo build lint typecheck` 135/135 · `intercept.dom.test.tsx` 46/46 ·
full `pnpm test` green · `check:licenses`/`protocol-markers`/`no-cookies`/
`spa-budget`/`spa-env`/`dom-contract` all green · `check-build-memory.sh`
0 violations · `check-append-only` OK · $0 spend, no deploys, no prod writes.

Requirement ids: REQ-NAVM-1 REQ-NAVM-2 REQ-NAVM-3 REQ-NAVM-4 REQ-NAVM-6 REQ-NAVM-7
REQ-NAVM-8 REQ-NAVC-13 REQ-NAVT-8
