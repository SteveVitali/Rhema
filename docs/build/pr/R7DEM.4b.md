# PR — R7DEM.4b: Demo serving (SPA half)

- **Ticket:** `docs/tickets/220a_R7DEM.4b__demo-spa-boot-url.md` (seq 220a of 254)
- **Base:** `stevevitali/r7dem-4-demo-serving` (stacked; merge policy OPERATOR — do not merge)
- **Branch:** `stevevitali/r7dem-4b-demo-spa`
- **Scope:** Stage A only ($0) — repo + local server proof; no preview, no live act.

## What lands

| Area | Change |
|---|---|
| S-1 URL spike | TanStack `rewrite` on `createRouter`: `/demo/<essay>/…` ↔ `/p/demo~<essay>/…` (registered-gated; `/demo` hub + unregistered essays excluded → server 404). Both R3 P7 open questions answered + pinned by tests: `navigate({href})` output-rewrites raw `/p/demo~` anchors; `getMatchedRoutes` is rewrite-agnostic so `nav-intercept` feeds the input form. Zero `/p/${slug}` emitters touched. |
| Boot fixes (the three /login-breakers) | `_authenticated` gate skip when `boot.demo` + path predicate (in-SPA `/app` hops still gate); `demoFeedLabelsQuery` warms `["feed-labels"]` from public `/bff/demo/feed-labels`; `sessionQuery` disabled in the demo chrome (`userId="demo"`); handoff `beforeLoad` no-op; `onSessionExpired` no-op in demo; demo QueryClient `staleTime: Infinity` + `refetchOnWindowFocus: false`; `readSpaBoot` decodes `demo`. |
| S-13 | `bffFetch` appends `?b=<build>` on `/bff/p/demo~*` + `/bff/demo/*` reads. |
| S-14 boundary | `nav-intercept` predicate: href into `/demo*` or `/p/demo~*` from a non-demo boot (and a non-demo href inside a demo boot) = document navigation, both directions — the demo never shares the workspace QueryClient. |
| Exits | `DemoBanner` (`data-demo-banner`) mounted inside the IDE frame + on unframed leaves via a new `IdeShell banner` slot; every `data-demo-exit` carries `data-spa-native`; `signedIn` picks Back-to-projects vs Create/Sign-in. |
| S-7 figures | `specKind:"image"`/`provenance:"imported"` rows + card arm render `<img>` through `/bff/demo/asset/<essay>/<file>`; no spec/SVG/run provenance invented, no write surface. |
| Demo-data guards | `runLineLabel` + `RunCard` tolerate the replayed runs' null credit/time fields (S-9 "not recorded") — the real-corpus index leaf crashed without them. |
| Legs | `R11.demo` (returningUser vs anon — same content, `demo.signedIn` cosmetic) + `P1.demo` (real-iPhone-UA context at 390 + 320, spa/phone verdict, no editable PM or desktop-capability subtree, axe clean, no overflow) — real bodies, `expected:"red"`, ready-to-flip. |
| Records | `D-R7DEM.4b-1` opened (Stage-B → 224); ADR-126 dated addendum; run ledger `runs/R7DEM.4b.md`; local-leg screenshots in `docs/build/reports/2026-11-04_r7dem-4b-legs/`. |

## AC / evidence

- S-1 outcome: ADR-126 addendum + `spa/demo.dom.test.tsx` (12 legs incl. both P7 answers). **engineered**
- Demo boot never `/login`/`/session`/`/bff/feed-labels`, logged out or cookied; phone-UA arm: SPA, no `SsrHandoff`, PM not editable — same test file. **engineered**
- Entry doc-nav → `boot.demo`; every `data-demo-exit` is `data-spa-native` — boundary-predicate legs in the same file. **engineered**
- Figures image card via asset route, no spec/SVG — DOM test legs. **engineered**
- `R11.demo`/`P1.demo` bodies pass locally (planted cookie + logged out; 1440/390/320) — `packages/journeys/src/demo-legs.local.test.ts` drives the REAL `R7_LEGS_IMPLS` bodies vs `apps/web/dist/main.js` serving `demoDataSource`; screenshots committed. **fixture-verified**
- `check:dom-contract`, `check:spa-env`, `check:spa-budget`, `check:protocol-markers` green; no ceiling raised. **engineered**
- `D-R7DEM.4b-1` open with the capture list. **staging-verified owed to 224**

## Verification at head

- `pnpm turbo build lint typecheck` — green (touched closure).
- `pnpm exec vitest run apps/web/src packages/contracts/src packages/ui/src` — 1,852 pass / 1 fix (copy-containment leaf).
- `packages/journeys` — runner/registry tests green; the two leg bodies green locally via the committed driver.
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` — 0 violations.

## Deferrals

- **Opened:** `D-R7DEM.4b-1` — Stage-B deployed verification at 224 (legs green at the preview, entry/exit doc-navs, S-1 behaviour on the deployed router, joint D-R7DEM.4-1 capture list).
- **Closed:** none (no newly unblocked rows).
