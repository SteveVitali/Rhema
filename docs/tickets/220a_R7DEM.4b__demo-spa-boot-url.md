# R7DEM.4b — Demo serving (SPA half): the S-1 URL spike, SPA boot fixes, document-navigation entry/exit, the imported-figure card, legs `R*.demo` + `P1.demo`

- **Sequence:** 220a of 254 · **Phase:** round 7 (R7a) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 220_R7DEM.4 (the registry and `DEMO_ROUTE_IDS`, the guard, `demoDataSource`, the
  shell and boot payload, `/bff/demo/feed-labels`, the asset route and the `demo` DOM bucket). Its
  stacked base carries 211 (ReadOnlyProject) and 218a (the figure image DTO).
- **Run:** `implement-spec spec=docs/tickets/220a_R7DEM.4b__demo-spa-boot-url.md`
- **Gate status:** none. No live act happens here (`GD-PREVIEW.R7`: no per-ticket preview).
- **Live stage:** Stage A only ($0): SPA DOM tests, and the `R*.demo`/`P1.demo` leg bodies run
  locally with bundled Chromium against a local web server serving `demoDataSource` (the demo path
  needs no API). The legs are held `ready-to-flip`; their Stage-B evidence is `staging-verified at
  the R7a phase preview (224)` through a DEFERRALS row, and 224 flips them.
- **Production mutations:** none
- **Size budget:** ~300 changed lines excl. tests and fixtures (Phase-4 Split decision 3).

## Goal
Make the SPA boot and navigate the demo correctly on top of 220's server: the `/demo/<essay>/…` URL
works (by router rewrite, or the 302 fallback), a demo boot never reaches `/login` or a session
read, every entry into and exit from the demo is a document navigation, the Figures list shows
imported images as images, and the `R*.demo` and `P1.demo` leg bodies are written and proven
locally, ready for 224 to flip.

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md` sections:
  - §3.2 ADR-126;
  - §3.3 S-1, S-5, S-7, S-14;
  - §4.3 REQ-DWEB-6, 9, 11, 16;
  - §4.17 REQ-DACC-1, REQ-DACC-4 (restated DACC-4);
  - §8 items 1, 4, 5.
- `R3-serving-and-demo-mode.md` (**normative**): §0 headline finding 2; §3 "Recommendation" P1–P7;
  §4 rows 11–13 only (the three `/login`-breakers); §6 (DOM contract, budget, spa-env);
  "Requirements emitted" WEB-6, 9, 11.
- R4 `R4-acceptance-deploy-conventions.md` §1 (the registry/runner, the proposed `R*.demo` and
  `P1.demo` legs, renderer).
- `apps/web/AGENTS.md`, `packages/journeys/AGENTS.md`.
- Anchors (re-confirm at build time):
  - `apps/web/src/spa/boot.ts` (`readSpaBoot`/`getSpaBoot`);
  - `apps/web/src/spa/routes/_authenticated.tsx` (`beforeLoad`);
  - `apps/web/src/spa/routes/_authenticated/p.$project.tsx` (the feed-labels loader);
  - `apps/web/src/spa/ide/chrome.tsx` (`sessionQuery`);
  - `apps/web/src/spa/bff.ts` (`onSessionExpired`);
  - `apps/web/src/spa/main.tsx` (`createRouter`, QueryClient);
  - `apps/web/src/spa/nav-intercept.ts` (`data-spa-native`, ~L71);
  - `apps/web/src/spa/surfaces/figures.tsx`;
  - `apps/web/src/dom-contract.ts`;
  - `packages/journeys/src/registry.ts` + `steps.ts`; `packages/journeys/src/occlusion.test.ts`
    (the offline bundled-Chromium precedent);
  - 220's registry in `packages/contracts` and the shell in `apps/web/src/server.ts`.

## In scope — deliverables
1. **The S-1 URL spike**, time-boxed to half a day (S-1). Wire TanStack Router `rewrite`, mapping
   `/demo/<essay>/…` ↔ `/p/demo~<essay>/…`. Answer R3 P7's two open questions with a test.
   - If the spike fails, ship the fallback: a 302 from `/demo/:essay/*` to `/p/demo~:essay/*`
     (added to 220's server), with `/demo/<essay>` as the entry alias.
   - Either way, record the outcome and its evidence as a dated decision appended to ADR-126 and
     in the run record. There are no `/p/${slug}` href rewrites. *(REQ-DWEB-9; S-1)*
2. **SPA boot fixes for the three `/login`-breakers** (R3 §0.2; §4 rows 11–13; §3 P1–P4).
   - The `_authenticated` gate is skipped when both `boot.demo` and the path predicate hold.
   - Feed labels come from 220's public `GET /bff/demo/feed-labels`.
   - `sessionQuery` is disabled in demo mode; `onSessionExpired` never redirects a demo boot.
   - The handoff `beforeLoad` is a no-op.
   - The demo QueryClient uses `staleTime: Infinity` and no refetch-on-focus.
   - All other SPA side effects belong to 221. *(REQ-DWEB-6 client half)*
3. **Exits and entries are document navigations.**
   - Every demo exit (sign up, sign in, back to projects) carries `data-spa-native` and the
     `data-demo-exit` hook.
   - The SPA click interceptor treats any href into `/demo*` or `/p/demo~*` from a non-demo boot
     as a document navigation, **by predicate**, so no entry link can share the workspace
     QueryClient.
   - Two DOM tests: one proves that entering from a signed-in SPA page yields a fresh document
     with `boot.demo`; one proves the exits leave the same way.
   - 222 adds the entry links themselves.
   - *(REQ-DWEB-11, REQ-DWEB-16; S-14)*
4. **The imported-figure card** (P4-21; S-7). The read-only Figures list in
   `apps/web/src/spa/surfaces/figures.tsx` renders 218a's `{specKind:"image",
   provenance:"imported"}` card through 220's asset route, with no vega/mermaid/SVG invented. DOM
   test on the synthetic fixture's image. *(REQ-DWEB-17 render; S-7)*
5. **DOM contract.** Add the hooks this ticket emits (`data-demo-exit`, the figure image card hook,
   any others) to 220's `demo` bucket; each declared, emitted and asserted.
6. **Legs `R*.demo` and `P1.demo`** (owner R7DEM.4b per P4-5; registered red by R7OPEN.1).
   - `R*.demo`: signed-in `/demo` renders the same content as logged out, via `returningUser`.
   - `P1.demo`: demo Pages render SPA-compact at 390 and 320 px, axe clean, with no
     desktop-capability subtree (restated DACC-4; the real-UA context pattern per D-FIX.1-2).
   - Leg assertions derive their expectations from the snapshot or registry, never hard-coded
     essay text.
   - Stage A: run both leg bodies locally against a local web server — logged out, and with a
     planted session cookie standing in for `returningUser` (signed-in is cookie presence only) —
     at desktop, narrow-desktop and phone widths; commit the local screenshots as `ready-to-flip`
     evidence.
   - **Held `ready-to-flip`** (`GD-PREVIEW.R7` + 209's nightly-hazard note): the registry steps
     stay `expected:"red"` in this PR; 224 flips them to green citing its prod evidence. 221a
     extends both bodies to the filled hub.
   - *(REQ-DACC-1, REQ-DACC-4)*
7. **The staging DEFERRALS row** (`GD-PREVIEW.R7`). Open `D-R7DEM.4b-1`: why deferred =
   "GD-PREVIEW.R7: no per-ticket preview · withholds: REQ-DWEB-6/-9/-11/-16 B evidence; `R*.demo`
   and `P1.demo` green"; unblocked by = "224_R7DEP.1 Part A (the R7a phase preview)"; how to
   verify = what 224 captures: `R*.demo` (real `returningUser`) and `P1.demo` green on the preview
   with `--expect-sha`, logged out and logged in, at desktop, narrow-desktop and phone widths, with
   screenshots; the signed-in-SPA → `/demo` document-navigation entry and the exits on the
   preview; the S-1 URL behaviour on the deployed router; then the flips at prod.

## Out of scope
- The server: registry, guard, `demoDataSource`, nested JSON app, shell/boot payload, twins,
  asset route, `/demo` SSR frame, image assertion, R3 §7 tests 1–8: 220_R7DEM.4.
- The regenerated side-effect table, recording proxy and every other R3 §4 row; `D3.readonly`:
  221_R7DEM.5. The hub content and cards, `D1.hub` and the hub extensions of `R*.demo`/`P1.demo`:
  221a_R7DEM.5b.
- The entry links on landing, `/showcase` and the footer: 222_R7DEM.6a.
- Any preview and the leg flips to green: 224_R7DEP.1.

## Acceptance criteria
- [ ] The S-1 spike's outcome (rewrite works, or the fallback ships) is recorded with evidence in
      ADR-126 and the run record. A test pins the chosen URL behaviour. *(deterministic · layer:
      engineered)*
- [ ] A demo boot issues no `/session` or `/bff/feed-labels` request and never navigates to
      `/login`, logged out or with a cookie. A phone-UA DOM test shows SPA with no `SsrHandoff`,
      and the PM view is not editable. *(deterministic · layer: engineered)*
- [ ] Entering `/demo*` from a signed-in SPA page is a document navigation that yields
      `boot.demo`. Every `data-demo-exit` is `data-spa-native`. *(deterministic · layer:
      engineered)*
- [ ] The Figures list renders the fixture's imported image card via the asset route with no
      spec/SVG (DOM test). *(deterministic · layer: engineered)*
- [ ] `R*.demo` and `P1.demo` leg bodies pass locally against a local web server at three widths
      (logged out + planted cookie), screenshots committed; the registry steps stay `red`
      (`ready-to-flip`). *(agentic · layer: fixture-verified)*
- [ ] `check:dom-contract`, `check:spa-env` and `check:spa-budget` are green with no ceiling
      raised. *(deterministic · layer: engineered)*
- [ ] **Stage B → `staging-verified at the R7a phase preview (224)`:** `D-R7DEM.4b-1` is open with
      the capture list in deliverable 7; no preview is stood up here. *(agentic · layer:
      staging-verified, owed to 224)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-DWEB-6 (client half), REQ-DWEB-9, REQ-DWEB-11, REQ-DWEB-16. It contributes to REQ-DWEB-17
(the imported-figure card render), REQ-DACC-1 and REQ-DACC-4 (legs `R*.demo` and `P1.demo`, held
`ready-to-flip`).

## Cross-cutting invariants
- `docs/tickets/00_MANIFEST.md` § Cross-cutting invariants:
  - 3 (no private text in bundles);
  - 12 (a user surface is verified by walking it — locally here, deployed at 224);
  - 17 (context budget; no owned preview in this ticket).
- Spec §8: 1 (no API/DB read on the demo path); 4 (browser proof, DOM contract in the same change);
  5 (budgets and checks green, no ceiling raised); 6 (ADR-126 append-only); 7 (sizing).
- `apps/web/AGENTS.md` gotchas 1–5 and 8: demo is a path fact, never a renderer flag; the rewrite
  lives in `createRouter`; exits are document navigations.

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`; the gap table has one row per clause.

## Notes
- **Decisions this ticket owns:**
  - the S-1 outcome (rewrite vs 302 fallback);
  - the document-navigation predicate in `nav-intercept.ts`;
  - the imported-figure card render (P4-21 — the manifest § Decomposition decisions records
    "figure image card → R7DEM.4b"; 242 preserves the variant in R7b).
- **Shared decisions it consumes:** `DEMO_ROUTE_IDS`, the boot payload and the asset route (220);
  `ReadOnlyProject` (211); the figure image DTO (218a).
- **Split record.** Phase-4 Split decision 3 (P4-13). The leg owner for `R*.demo` and `P1.demo` is
  R7DEM.4b (P4-5); 221a extends them.
- **Data discipline (S-12).** Synthetic fixture only; no real-corpus byte enters this PR.
- **Preview (`GD-PREVIEW.R7`).** No owned preview here; a need for one outside 224/250 PAUSES for
  the operator.
- **DEFERRALS interactions:**
  - **D-FIX.1-2:** `P1.demo` uses the real-UA context pattern, but does not close the row.
  - **D-OPS.1-1:** the signed-in leg at 224 adds evidence only.
