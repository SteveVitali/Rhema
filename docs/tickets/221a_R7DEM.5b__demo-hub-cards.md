# R7DEM.5b — The `/demo` hub: essay cards, "What to look at" cards, stable deep links, leg `D1.hub`

- **Sequence:** 221a of 254 · **Phase:** round 7 (R7a) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 221_R7DEM.5 (the side-effect allowlist and recording-proxy re-run entry point the
  hub must stay inside; the single demo-mode read; the completed `demo` DOM bucket; the label
  renders). Its stacked base carries 220's `/demo` SSR frame (`data-demo-root`) and registry, 220a's
  navigation predicate and `R*.demo`/`P1.demo` bodies, and 218a's `demoCardFacts`.
- **Run:** `implement-spec spec=docs/tickets/221a_R7DEM.5b__demo-hub-cards.md`
- **Gate status:** none. No live act happens here (`GD-PREVIEW.R7`: no per-ticket preview).
- **Live stage:** Stage A only ($0): SSR/DOM tests, and the `D1.hub` leg body plus the hub
  extensions of `R*.demo`/`P1.demo` run locally with bundled Chromium against a local web server.
  The legs are held `ready-to-flip`; their Stage-B evidence is `staging-verified at the R7a phase
  preview (224)` through a DEFERRALS row, and 224 flips them.
- **Production mutations:** none
- **Size budget:** ~250 changed lines excl. tests and fixtures (Phase-4 Split decision 4).

## Goal
Fill the `/demo` hub: four essay cards whose facts and counts are **rendered from 218a's structured
card facts** (never re-derived), "What to look at" cards for GM, POV and CoR, and stable deep links
into every essay. After this ticket, a visitor lands on `/demo`, chooses an essay and opens it
read-only; the hub's hero CTA points at the tour 222 builds.

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md` sections:
  - §3.3 S-6, S-10, S-11, S-14;
  - §4.4 REQ-TOUR-1, REQ-TOUR-3, REQ-TOUR-8;
  - §4.17 REQ-DACC-1, REQ-DACC-4, REQ-DACC-5;
  - §8 items 3, 4, 5.
- `R1-corpus-census.md` §5 (the card bullets) and §6 (the published-version plan for card
  titles).
- `R3-serving-and-demo-mode.md` §6 (DOM contract, copy containment).
- R4 sections: §1 (the proposed `D1.hub` leg); §3 (DOM contract, copy containment, launch-surface
  lint, `lintCopy`); §7 (what the demo may and may not say).
- REVIEW RV-30 (the counting rule; retitle).
- Anchors (re-confirm at build time):
  - 218a's `demoCardFacts` export and card-facts snapshot in `packages/demo-corpus`;
  - 220's `/demo` SSR frame and `doc-meta` entry in `apps/web/src/server.ts` / `routes.tsx`;
  - 220's registry and `DEMO_ROUTE_IDS` in `packages/contracts`;
  - 221's recording-proxy entry point and `demo` DOM bucket in `apps/web/src/dom-contract.ts`;
  - `apps/web/src/copy.ts`; `apps/web/src/spa/copy-containment.test.ts`;
  - `packages/journeys/src/registry.ts`, `steps.ts`.

## In scope — deliverables
1. **The hub `/demo`** (SSR, filling 220's frame) *(REQ-TOUR-1 render)*.
   - Four essay cards in the order SPD (hero, "Take the guided tour"), GM, POV, CoR.
   - Each card shows, **from 218a's `demoCardFacts` output only**:
     - title and subtitle, with a retitle note where one exists;
     - the publish date;
     - the snapshot body word count;
     - the arc as a row of steps;
     - the counts (e.g. "6 major · 12 minor · 6 strengths · 27 claims checked", RV-30), formatted
       here from 218a's structured numbers;
     - "Read on Substack ↗" and "Open in Rhēma".
   - A provenance paragraph naming agent-discourse (open source; Rhēma's protocols port it) and
     the S-10 roles.
   - The byline "S. J. Sebastian".
   - The hero CTA points at a tour-entry href constant this ticket exports for 222.
   - Copy lives in `COPY` under `demo.hub.*`/`demo.cards.*`. Corpus text arrives as data, never
     as literals in SPA source.
2. **The counts equality assertion** (P4-6). A test renders each card and asserts its displayed
   numbers equal 218a's `demoCardFacts(snapshot)` for that essay. This ticket contains no counting
   logic: a grep test fails if a count is computed in `apps/web` hub code.
3. **"What to look at" cards** for GM, POV and CoR: 3–5 bullets each, sourced from R1 §5, with
   deep links and S-10 role vocabulary. Counts inside bullets are interpolated from 218a's card
   facts. *(REQ-TOUR-3)*
4. **Stable deep links.** A `demoDeepLink(essay, route, hook)` builder produces
   `/demo/<essay>/…#hook` (or the 220a fallback form). A test proves every card bullet's link
   resolves to an allowlisted route and a declared DOM-contract hook. 222 reuses the builder for
   tour steps. *(REQ-TOUR-8)*
5. **The hub hooks** (`data-demo-hub`, `data-demo-essay-card`, any others) added to the `demo`
   bucket, each declared, emitted and asserted. *(contributes to REQ-DWEB-12, owned by 221)*
6. **Side-effect check.** 221's recording-proxy re-run entry point passes over `/demo` with the
   filled hub.
7. **Legs.**
   - `D1.hub` (owner R7DEM.5b): N10 invariants on `/demo`, four cards visible and actionable
     (`assertActionable`), and the provenance paragraph present.
   - Extend 220a's `R*.demo` and `P1.demo` bodies to the filled hub.
   - Stage A: run the bodies locally against a local web server at desktop, narrow-desktop and
     phone widths (logged out + planted cookie); commit the screenshots as `ready-to-flip`
     evidence.
   - **Held `ready-to-flip`** (`GD-PREVIEW.R7` + 209's nightly-hazard note): steps stay `red`; 224
     flips them citing prod evidence.
   - *(REQ-DACC-1, REQ-DACC-4, REQ-DACC-5)*
8. **The staging DEFERRALS row** (`GD-PREVIEW.R7`). Open `D-R7DEM.5b-1`: why deferred =
   "GD-PREVIEW.R7: no per-ticket preview · withholds: REQ-TOUR-1 B evidence; `D1.hub` green; the
   real-corpus hub/card text verified"; unblocked by = "224_R7DEP.1 Part A (the R7a phase preview,
   at a SHA carrying 219)"; how to verify = what 224 captures: `D1.hub` and the extended `R*.demo`
   / `P1.demo` green on the preview with `--expect-sha`, logged out and logged in, at three widths,
   with screenshots; the four real cards' facts equal `demoCardFacts` on the real snapshots; then
   the flips at prod.

## Out of scope
- Card facts and counts themselves (`demoCardFacts`, the bucket selection over 213's rule):
  218a_R7DEM.3b, sole owner.
- The recording proxy, effect closure, label renders, excluded refs, escalations, lazy tour seam
  and `D3.readonly`: 221_R7DEM.5.
- The `/demo` SSR frame and registry: 220_R7DEM.4. The navigation predicate and the base
  `R*.demo`/`P1.demo` bodies: 220a_R7DEM.4b.
- The tour, its entry links on landing, `/showcase` and the footer (REQ-TOUR-4) and their B
  evidence: 222_R7DEM.6a. R4 proposed that `D1.hub` assert those entry links; that sub-assertion
  moves to 222, because the links do not exist until 222.
- Copy sign-off: HUMAN-H15 (223a). Any preview and the leg flips: 224_R7DEP.1.

## Acceptance criteria
- [ ] Hub cards render the four essays in the order SPD, GM, POV, CoR. Every displayed fact and
      count equals 218a's `demoCardFacts` for that essay (equality test), and no hub code computes
      a count (grep test). *(deterministic · layer: engineered)*
- [ ] Every card and "What to look at" deep link resolves to an allowlisted route and a declared
      hook. The tour-entry href constant is exported. *(deterministic · layer: engineered)*
- [ ] Demo hub copy passes `lintCopy`, copy containment and the launch-surface lint. No "author"
      is used for an agent (S-10). *(deterministic · layer: engineered)*
- [ ] `check:dom-contract` and `check:spa-budget` are green; 221's recording proxy passes over the
      filled hub. *(deterministic · layer: fixture-verified)*
- [ ] `D1.hub` and the extended `R*.demo`/`P1.demo` bodies pass locally at three widths,
      screenshots committed; the registry steps stay `red` (`ready-to-flip`). *(agentic · layer:
      fixture-verified)*
- [ ] **Stage B → `staging-verified at the R7a phase preview (224)`:** `D-R7DEM.5b-1` is open with
      the capture list in deliverable 8; no preview is stood up here. *(agentic · layer:
      staging-verified, owed to 224)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-TOUR-1 (hub render; card data is 218a's), REQ-TOUR-3, REQ-TOUR-8. It contributes to
REQ-DWEB-12 (hub hooks), REQ-DACC-1, REQ-DACC-4 and REQ-DACC-5 (leg `D1.hub`; extends `R*.demo`
and `P1.demo`; all held `ready-to-flip`).

## Cross-cutting invariants
- Manifest § Cross-cutting invariants 1 (vocabulary), 9 (no superiority claim), 12 (walk the
  surface — locally here, deployed at 224), 16 (cohort hygiene: leg identities are `is_test` when
  224 runs them) and 17 (context budget; no owned preview in this ticket).
- Spec §8: 3 (copy: S-10 roles, no efficacy, essay content is data); 4 (DOM contract in the same
  change); 5 (budgets green); 7 (sizing).

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`; the gap table has one row per clause.

## Notes
- **Decisions this ticket owns:**
  - the hub layout and card presentation (formatting of 218a's numbers);
  - the deep-link builder `demoDeepLink` and the tour-entry href constant (consumed by 222 and
    R7TOUR.2).
- **Shared decisions it consumes:** card facts and counts (218a, sole owner per P4-6); the
  allowlist and re-run entry point (221); `DEMO_ROUTE_IDS` (220); the URL form (220a).
- **Split record.** Phase-4 Split decision 4 (P4-13): REQ-TOUR-1/3/8, `D1.hub` and the
  `R*.demo`/`P1.demo` extensions moved here from 221.
- **Data discipline (S-12).** It develops on the synthetic fixture. Real titles, counts and card
  bullets are verified at 224's preview walk (`D-R7DEM.5b-1`). The bullet *structure* and the
  equality to `demoCardFacts` are tested on the synthetic fixture. Card copy is signed at HUMAN-H15.
- **DEFERRALS interactions:** **D-FIX.1-2:** the `P1.demo` extension reuses the real-UA pattern,
  but does not close the row.
