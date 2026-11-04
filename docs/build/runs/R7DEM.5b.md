# R7DEM.5b — run ledger — The `/demo` hub: essay cards, "What to look at" cards, stable deep links, leg `D1.hub`

- Spec: `docs/tickets/221a_R7DEM.5b__demo-hub-cards.md` (manifest row 221a, Phase 4 split decision 4)
- Base: `stevevitali/r7dem-5-side-effects` @ `a25c73e7` (PR #255, unmerged — mergePolicy OPERATOR)
- Branch: `stevevitali/r7dem-5b-hub`
- Config: implement-spec full rigor; Stage A only ($0, no preview per GD-PREVIEW.R7); prod untouched
- Harness: devin-desktop/swe-2-high/subagent
- Skills: `e981ec5`
- Started: 2026-11-04T12:03Z

## Deferrals read

`docs/tickets/DEFERRALS.md` read in full at run start (grep over every OPEN/PARTIAL row).
Interactions found:

- **D-FIX.1-2** (OPEN): the `P1.demo` extension reuses its real-UA phone pattern — the ticket
  names this row an interaction but does not close it (T15/T16's paid halves stay clock-owed).
- **D-R7DEM.4-1 / D-R7DEM.4b-1 / D-R7DEM.5-1** (OPEN): Stage-B demo captures owed to 224. This
  ticket's hub work does not discharge them; 224's capture list already covers the shared walk.
- **D-R7DEM.2c-1** (OPEN): REQ-CONV-17 parser residual — owner 253_R7REC.1, untouched.
- Nothing this ticket unblocks — no row is verifiable-closable here.

## Requirements (from the ticket)

1. The hub `/demo` SSR fills 220's frame: four essay cards SPD (hero + "Take the guided tour"),
   GM, POV, CoR; every card fact rendered **from `demoCardFacts` output only** (title/subtitle +
   retitle note, publish date, body word count, arc row, counts RV-30, "Read on Substack ↗",
   "Open in Rhēma"); provenance paragraph (agent-discourse open source + repo link; S-10 roles);
   byline "S. J. Sebastian"; hero CTA → exported tour-entry href for 222; copy in `COPY.demo.hub.*`
   / `demo.cards.*`; corpus text as data. (REQ-TOUR-1)
2. Counts equality assertion (P4-6): rendered numbers == `demoCardFacts(snapshot)` per essay;
   grep test fails if a count is computed in `apps/web` hub code.
3. "What to look at" cards for GM/POV/CoR: 3–5 bullets each from R1 §5 (POV from R1 §4's beat
   sheet — §5 covers GM/SPD/CoR; the ticket assigns POV), deep links, S-10 vocabulary, counts
   interpolated from card facts. (REQ-TOUR-3)
4. `demoDeepLink(essay, route, hook)` → `/demo/<essay>/…#hook` (or the 220a fallback); every card
   bullet's link resolves to an allowlisted route + a declared DOM-contract hook. Exported for
   222/R7TOUR.2. (REQ-TOUR-8)
5. Hub hooks (`data-demo-hub`, `data-demo-essay-card`, others) declared/emitted/asserted in the
   `demo` bucket. (contributes REQ-DWEB-12)
6. 221's recording-proxy re-run entry point passes over `/demo` with the filled hub.
7. `D1.hub` real body: N10 invariants, four cards visible + `assertActionable`, provenance
   paragraph; extend 220a's `R11.demo`/`P1.demo` bodies to the filled hub; run locally at
   desktop/narrow-desktop/phone widths, logged out + planted cookie; screenshots committed as
   ready-to-flip evidence; registry rows stay `red`. (REQ-DACC-1/4/5)
8. DEFERRALS row `D-R7DEM.5b-1` (GD-PREVIEW.R7 → 224).

## Acceptance criteria

See the ticket's AC block — tracked one row per AC in the gap table below.

## Plan

- `packages/contracts/src/demo.ts`: `DEMO_HUB_ESSAYS` (SPD→GM→POV→CoR, the non-fixture registry
  order restated for the hub), `demoDeepLink(essay, route, hook)` — validates the essay is
  registered AND the mapped internal path resolves to `DEMO_ROUTE_IDS`, returns the public
  `/demo/<essay>…#hook` form; `DEMO_TOUR_ENTRY_HREF` = the SPD essay-root deep link 222's tour
  consumes. (+ `demo.test.ts` coverage.)
- `apps/web/src/demo-data.ts`: `demoHubCards(root)` — reads `snapshots/<essay>/card-facts.json`
  (`dto` slot of the snapshot envelope) for each `DEMO_HUB_ESSAYS` row; a missing/malformed
  envelope skips that essay (synthetic fixture serves zero public cards, honestly).
- `apps/web/src/demo-page.tsx`: `DemoHubPage({ cards })` — the frame's fill: hero (SPD) + three
  cards, arc chips, counts formatted via `COPY.demo.hub.countsFmt`, Substack + "Open in Rhēma"
  actions, "What to look at" bullet lists (COPY text + `{n}` interpolation from the card's own
  facts; link table `{route,hook}` per bullet), provenance paragraph (agent-discourse link), byline.
- `apps/web/src/copy.ts`: `demo.hub.*` + `demo.cards.lookAt.<essay>[]` (array leaves, the
  `landing.dossier.bullets` precedent).
- `apps/web/src/dom-contract.ts`: `data-demo-hub`, `data-demo-essay-card`, `data-demo-look-at`,
  `data-demo-provenance`, `data-demo-tour-entry`, `data-demo-card-arc` in the `demo` bucket.
- `apps/web/src/demo.ts`: the hub arm awaits `demoHubCards(corpusRoot)` and renders
  `<DemoHubPage cards=…>`; `routes.tsx` keeps `<DemoHubPage cards={[]} />` for the census element.
- `packages/journeys/src/r7legs.ts`: `D1_HUB` body (N10 invariants, four ordered cards each
  visible + actionable, provenance paragraph); extend `R11_DEMO` (card parity signed-in vs anon)
  + `P1_DEMO` (hub no-overflow + cards at 390/320); `crawlDemo` seeds `/demo` so the recording
  proxy walks the hub in both entry points.
- `packages/journeys/src/demo-hub-legs.local.test.ts`: `D1.hub` locally (3 widths, anon + cookie),
  screenshots → `docs/build/reports/2026-11-04_r7dem-5b-legs/`.
- `apps/web/src/demo-hub.test.ts`: order, per-card fact equality vs the committed snapshots, the
  no-count-computation grep, deep-link resolution (allowlist + `domContractMatch`), cookie
  invariance, N10 head.
- `docs/tickets/DEFERRALS.md`: `D-R7DEM.5b-1` (staging-verified → 224).

## Test matrix

| AC | test |
|---|---|
| four cards, order, facts equality | `demo-hub.test.ts` — GET /demo on the real corpus root; per-essay dto → expected count string in HTML |
| no count computed in hub code | grep scan of `demo-page.tsx`/`demo-hub*` for `deliveredRecordCounts|findingsAt|claimsAt|statusMeters|.reduce(|++` |
| deep links resolve | table walk: `demoInternalPath` → registered, `spaRouteFor` → `DEMO_ROUTE_IDS`, `domContractMatch(hook)` |
| `demoDeepLink` behavior | `contracts/src/demo.test.ts` — form, unregistered essay throws, non-allowlisted route throws, hook suffix |
| copy lints | `copy.test.ts` lintCopy (new leaves), copy-containment, launch-surface |
| DOM contract | `pnpm check:dom-contract` |
| recording proxy over hub | `demo-side-effects.local.test.ts` re-run (hub seeded into the crawl) |
| D1.hub + extensions | `demo-hub-legs.local.test.ts` locally × {1440,1024,390} × {anon, planted cookie} |

## Progress

- 12:03Z — branch `stevevitali/r7dem-5b-hub` off `a25c73e7`; Load docs read; anchors confirmed
  (219's real corpus + card-facts committed; `demoCardFacts` sole owner; `DEMO_ESSAYS` registry;
  `data-demo-*` bucket; `R7_LEGS_IMPLS` wiring; recording-proxy entry points).

## Gap table

(pending — Phase 4)

## Evidence log

(pending — Phase 5)

## Evidence report

(pending — Phase 6)
