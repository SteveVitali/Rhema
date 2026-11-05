# R7DEM.5b — the `/demo` hub: essay cards, "What to look at" cards, stable deep links, leg `D1.hub`

Ticket: `docs/tickets/221a_R7DEM.5b__demo-hub-cards.md` (manifest row 221a; Phase-4 Split
decision 4). Base: `stevevitali/r7dem-5-side-effects` @ `a25c73e7` (PR #255, unmerged).
mergePolicy=OPERATOR. $0 Stage A only — no preview per `GD-PREVIEW.R7`; zero prod mutations.

## Summary

Fills 220's `/demo` SSR frame: four essay cards in SPD (hero, "Take the guided tour") → GM →
POV → CoR order whose every displayed fact and count renders verbatim from 218a's `demoCardFacts`
snapshot DTOs, "What to look at" deep-link cards for GM/POV/CoR sourced from R1 §5/§4 with S-10
role vocabulary, the `demoDeepLink` builder + `DEMO_TOUR_ENTRY_HREF` constant 222 and R7TOUR.2
consume, the `D1.hub` leg body, and hub extensions of `R11.demo`/`P1.demo` — all held
`ready-to-flip` (registry steps stay `expected:"red"`; 224 flips them on the R7a phase preview).

## What changed

- `packages/contracts/src/demo.ts` — `DEMO_HUB_ESSAYS` (the card order, = non-fixture registry),
  `demoDeepLink(essay, route, hook)` (fail-closed: unregistered essay or a route resolving
  outside `DEMO_ROUTE_IDS` throws; emits the public `/demo/<essay>…#hook` form),
  `DEMO_TOUR_ENTRY_HREF` (SPD essay root).
- `apps/web/src/demo-data.ts` — `demoHubCards(root)`: reads each hub essay's `card-facts.json`
  snapshot `dto`; missing/malformed → skipped (the synthetic fixture honestly serves zero cards).
- `apps/web/src/demo-page.tsx` — `DemoHubPage{cards}`: title/subtitle (+ retitle note), publish
  label, word count, arc chip row, counts via `COPY.demo.hub.countsFmt`, "Read on Substack ↗" +
  "Open in Rhēma" (+ hero tour CTA), "What to look at" bullets (`COPY` text + `{n}` interpolation;
  `LOOK_AT` link table `{route,hook}`), provenance paragraph (agent-discourse repo link + S-10
  roles), byline "S. J. Sebastian". `demoHubDocument(cards)` for the `.ts` guard.
- `apps/web/src/demo.ts` — hub arm awaits `demoHubCards` then renders the document.
- `apps/web/src/copy.ts` — `demo.hub.*` + `demo.cards.lookAt.<essay>[]`.
- `apps/web/src/dom-contract.ts` — `data-demo-hub`, `data-demo-essay-card`, `data-demo-card-arc`,
  `data-demo-look-at`, `data-demo-provenance`, `data-demo-tour-entry` in the `demo` bucket.
- `packages/journeys/src/r7legs.ts` — `D1_HUB` body (N10 invariants, four ordered cards each
  visible + `assertActionable` after scroll-into-view, provenance paragraph); `R11_DEMO` hub
  card-parity extension; `P1_DEMO` hub no-overflow extension.
- `packages/journeys/src/demo-side-effects.ts` — the crawl seeds `/demo` so the recording proxy
  walks the hub in both entry points (local test + `--base` CLI).
- `packages/journeys/src/demo-hub-legs.local.test.ts` — the local Stage-A driver (three legs vs
  a local `dist/main.js`, anon + planted cookie); screenshots →
  `docs/build/reports/2026-11-04_r7dem-5b-legs/`.
- `apps/web/src/demo-hub.test.ts` — order + per-card equality vs committed snapshots,
  no-count-computation grep (P4-6), deep-link allowlist + `domContractMatch` resolution, cookie
  invariance, N10 head, honest card-free fixture.
- `docs/tickets/DEFERRALS.md` — `D-R7DEM.5b-1` (staging-verified → 224).

## Design decisions (owned)

- Card formatting is the hub's only arithmetic-free job: `fill()` interpolates COPY `{slot}`s
  from the DTO's structured numbers; the grep test bans counting machinery/`reduce`/`++`/raw
  record access in `demo-page.tsx`.
- `demoDeepLink` validates at build time (unregistered essay + non-allowlisted route throw); the
  hook's DOM-contract declaration is asserted by the test table (the contract manifest lives in
  `apps/web`, not importable from contracts).
- Tour-entry href = the SPD essay root (tour URL state stays 222's).

## Verification

- `pnpm turbo build lint typecheck` — green (web, contracts, journeys + closure).
- Focused vitest: `demo-hub.test.ts` 8/8; `demo.test.ts`, `copy.test.ts`, `demo.dom.test.tsx`,
  `demo-effects.dom.test.tsx`, `demo-bundle.test.ts`, `demo-dossier-snapshot.test.ts`,
  `contracts/demo.test.ts` — 89 pass.
- `pnpm check:dom-contract`, `check:spa-budget` — green.
- `demo-hub-legs.local.test.ts` — `D1.hub` + extended `R11.demo`/`P1.demo` vs local
  `dist/main.js` at 1440/1024/390 (+ phone 390/320), anon + planted cookie — green; screenshots
  committed under `docs/build/reports/2026-11-04_r7dem-5b-legs/`.
- `demo-side-effects.local.test.ts` — the recording proxy re-ran over `/demo` (hub now seeded
  into every walk): zero violations, full route coverage, negative leg detected; regenerated
  `docs/demo-side-effects.md`.
- Not run: full `pnpm test` (root vitest sweep) — focused suites above cover the touched surface;
  CI runs the full sweep.

## AC → evidence

| AC | layer | status | evidence |
|---|---|---|---|
| Four cards SPD→GM→POV→CoR; facts equal `demoCardFacts`; no count computed | engineered | met | `demo-hub.test.ts` equality leg + grep leg |
| Deep links resolve (allowlisted route + declared hook); tour-entry href exported | engineered | met | `demo-hub.test.ts` REQ-TOUR-8 leg; `contracts/demo.test.ts` |
| `lintCopy` + copy containment + launch-surface clean; no "author" for an agent | engineered | met | `copy.test.ts`; S-10 vocabulary in `demo.hub.*`/`demo.cards.*` |
| `check:dom-contract` + `check:spa-budget` green; recording proxy clean on the hub | fixture-verified | met | both checks + `demo-side-effects.local.test.ts` re-run (3/3) |
| `D1.hub` + extensions pass locally at 3 widths; steps stay `red` | fixture-verified | met | `demo-hub-legs.local.test.ts` green; registry unchanged (`expected:"red"`) |
| Stage B → 224 (`staging-verified`) | staging-verified | met-engineered(D-R7DEM.5b-1) | DEFERRALS row + ready-to-flip evidence |

## Requirement IDs

REQ-TOUR-1, REQ-TOUR-3, REQ-TOUR-8. Contributes: REQ-DWEB-12 (hub hooks), REQ-DACC-1, REQ-DACC-4,
REQ-DACC-5 (`D1.hub` + `R*.demo`/`P1.demo` extensions, held `ready-to-flip`).

## Deferrals

- **Opened:** `D-R7DEM.5b-1` — `GD-PREVIEW.R7`: Stage-B (`D1.hub` + extended `R*.demo`/`P1.demo`
  green on the R7a preview at a SHA carrying 219; real-corpus card equality; REQ-TOUR-1 B
  evidence) owed to 224.
- **Closed:** none. **Interactions:** D-FIX.1-2 (the P1.demo extension reuses its real-UA
  pattern; the row stays OPEN — ticket-scoped non-closure).
