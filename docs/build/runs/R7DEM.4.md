# R7DEM.4 — Demo serving (server half)

- **Spec:** `docs/tickets/220_R7DEM.4__demo-serving.md` (row 220 of 254, round 7 R7a)
- **Base:** `stevevitali/r7data-1-real-corpus` @ `81d4145` · **Branch:** `stevevitali/r7dem-4-demo-serving`
- **Harness:** devin-desktop/swe-2-high/subagent · **Skills:** agent-skills (implement-spec)
- **Started:** 2026-11-04 · **Closed:** —
- **Live stage:** Stage A only ($0) — unit/header/integration/module-graph tests + a local web
  server. No preview (`GD-PREVIEW.R7`), no network act, zero production mutations; production SHA
  `4938b8e` untouched.
- **Requirements:** REQ-DWEB-1/2/3/4/5/6(server)/8/10/17, REQ-DOPS-2; contributes to REQ-DWEB-9.

## Deferrals read

`docs/tickets/DEFERRALS.md` read at run start. No OPEN row is unblocked by this ticket. Opened:
`D-R7DEM.4-1` — the Stage-B capture list (deployed `/demo` + twins + asset + write refusals +
cache posture) owed to 224_R7DEP.1.

## Test matrix (ticket ACs → legs)

| AC / deliverable | Layer | Evidence |
|---|---|---|
| REQ-DWEB-1 registry (`demo~` prefix, `isDemoSlug`, `DEMO_ROUTE_IDS`, `/demo` public) | unit | `contracts/src/demo.test.ts` (4) — slug round-trip, `isDemoSlug`↔`spaRouteFor` agreement, `demo~zzz` prefix-vs-registered; `spa.test.ts` public list |
| Namespace never collides (api slug grammar) | unit | `project-routes.test.ts` — `slugify` emits only `[a-z0-9-]` on `demo~`-shaped titles |
| REQ-DWEB-2/4 guard before session/API; zero DS calls; 405 `demo_read_only`; terminal 404 | integration | `demo.test.ts` §7 sweep — writes×6 → 405 (JSON + SSR notice); 13 non-allowlisted/unknown GETs → 404, never `data-renderer="spa"`; every leg asserts `calls == []` (recording+throwing outer DataSource) |
| REQ-DWEB-3 demoDataSource boundary | unit + module-graph | `demo.test.ts` — `DemoUnsupported` on `getBillingBalance`/`getInbox`; runtime-import walk (no `fetch(`, no `process.env`, no api-client/db/live-clients/demo-corpus runtime import); no JSON `import`; absent from `tools/system-pool-boundary.json`; eslint `no-restricted-imports` block on `demo-data.ts` |
| REQ-DWEB-5 read-only twins, cookie-invariant, no Set-Cookie | integration | `demo.test.ts` — 10 twin paths × (anon, session-cookie) → 200, byte-identical bodies, no `set-cookie`; `readOnlyProject{demo}`, `readOnly:true`, no `collabWsUrl`, no `activeRun` |
| REQ-DWEB-6 boot `demo:{essay,slug,signedIn,build}`; no principal; `signedIn` cosmetic; all-device `spa` | integration | `demo.test.ts` — boot JSON parsed from the served shell: demo block, `theme:{}`, no `principal`, `project.slug`, every `DEMO_DOCUMENT_ROUTE_IDS` `"spa"` on desktop AND a phone UA; `signedIn` flips only on cookie presence |
| REQ-DWEB-8 single CSP nonce, truthful `data-renderer`/`data-route` | integration | `demo.test.ts` — every `<script>` on `/demo`, `/demo/<essay>`, `/p/demo~*` carries exactly one `nonce=` matching the CSP header |
| REQ-DWEB-10 SHA-keyed twin cache | integration | `demo.test.ts` — `cache-control: public, max-age=300, s-maxage=86400`, `etag:"demo-<sha>-<digest24>"`, HEAD parity; shell `no-cache` on both URL forms |
| REQ-DWEB-17 asset route | integration | `demo.test.ts` — real PNG → 200 `image/png` + `immutable`; markdown/index/traversal/unknown-essay/unlisted-media → 404 |
| REQ-DWEB-9 `/demo` hub frame + N10 head | integration | `demo.test.ts` — `data-demo-root`, title, description+OG+Twitter; `doc-meta` demo titles |
| REQ-DOPS-2 corpus in the web image | build | `@rhema/demo-corpus` prod dep + Dockerfile `test -s` assertion on `corpus/PROVENANCE.md`, `snapshots/projects.json`, a per-essay index |
| DOM-contract demo bucket | gate | `dom-contract.ts` `demo:` bucket (`data-demo-root`, `data-demo-readonly-notice`); `check:dom-contract` — 2 emitted, 2 asserted |
| §7 test 8 — local server, no api | live-local | `node dist/main.js` with `API_BASE_URL=http://127.0.0.1:59999` (unreachable): `/demo` 200 + `data-demo-root`; `/demo/the-governable-mind` 200 shell `no-cache`, boot `demo{signedIn:false,build:localtest}`; twin `readOnlyProject{demo}` + `readOnly:true` + no collabWsUrl + `public,s-maxage=86400` + `etag`; POST → 405 `demo_read_only`; `/p/demo~x/run`, `/p/demo~zzz`, `/bff/p/demo~zzz`, `/demo/unknown-essay` → 404; asset PNG → 200 `image/png` `immutable`; `index.json` → 404; cookie-vs-anon twin byte-identical; `/bff/demo/feed-labels` 200 anon; signed-in cookie → `signedIn:true` |

## Design notes (owned decisions — ADR-126 dated note 2026-11-04)

- **Nested app for twins only.** `createWebApp({demo:true, session: per-request DEMO_SESSION})`
  serves `/bff/p/demo~*` + `palette-search`; documents never leave the outer app (single nonce,
  REQ-DWEB-8). `DemoError → ApiError` at the seam keeps the shared compositions' 404 arms.
- **`demo` flag on the nested app** drives `readOnlyProject{demo}` + `readOnly:true` on the twins
  and `ideContext`'s out-of-demo drops (settings goto rows, New-obligation row, `runNextHref`,
  `themeUrl`/`paperThemeUrl`; `paletteSearchUrl` stays).
- **Demo surface verdict is a boot fact** — `DEMO_DOCUMENT_ROUTE_IDS` serve `spa` on every
  device class (ADR-126's REQ-ED-12 amendment, dated note).
- **`getRunReport` essay hint.** The one slug-less seam resolves via `x-rhema-demo-essay` in the
  per-request session the nested resolver stamps; no-hint callers get a unique-scan fallback
  (ambiguous ⇒ 404, never the wrong essay's record).
- **Provisional 25-method set** (R3 §1 + `searchPalette`, per the DWEB-3 amendment); every other
  key throws `DemoUnsupported` as a rejected promise so degrade-catches see an absent seam.
- **`demo.ts` outside `check:no-cookies` TARGETS** (RV-35): the cookie strip + `set-cookie`
  delete live there; `server.ts` gained no credential-shaped literals.

## Out of scope (ticket-stated)

220a's SPA boot/URL rewrite + `?b=` fetch arm; 221/221a's side-effect gating table + hub cards +
capture listener; the REQ-TOUR-9 non-GET exception (223); preview/deploy/CDN (224 →
`D-R7DEM.4-1`).

## Verification

- `pnpm turbo build lint typecheck` — 138/138 tasks green.
- `pnpm exec vitest run apps/web/src` — 1404/1404.
- Focused: `demo.test.ts` 36/36 · `contracts/demo.test.ts` 4/4 · `spa.test.ts` 11/11 ·
  `project-routes.test.ts` 18/18.
- `pnpm test` — two full passes. First pass: **one failure** —
  `project.test.ts` AC3 scanned `apps/web/src` for the bare strings `demo-corpus`/`snapshots/`
  and flagged this ticket's server-only `demo-data.ts` (a runtime fs read — the intended serve
  path, not a bundle import); the check now keys on import specifiers, the real bundle vector
  (18/18 green after `45c8bed5`). Second pass completed with zero failures; CI's
  `typecheck/lint/unit` leg runs the same suite at head.
- Gates: `check:dom-contract` OK (demo: 2/2) · `check:spa-budget` OK · `check:spa-env` OK ·
  `check:protocol-markers` OK · `check:no-cookies` OK (261 files) · `check:demo-corpus` clean.
- Local server: `node dist/main.js` on :18080, `API_BASE_URL` unreachable — every demo leg above
  verified live against the real committed corpus.

ci: **pass #253@`45c8bed5`** (run 41796038051 — all seven legs + `ci-pass` anchor; record `docs/build/logs/ci-R7DEM.4.json`)
