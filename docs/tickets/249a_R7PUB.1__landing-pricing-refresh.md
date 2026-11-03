# R7PUB.1 — Signed-in `/pricing` + the landing refresh (code and hero-recording slot)

- **Sequence:** 249a of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:**
  - 248_R7TOUR.2: the finished, re-pinned SPD tour that the hero loop will be recorded from, and
    the landing demo CTA's target (REQ-TOUR-4).
  - 249_R7GUARD.1: the global REQ-GUARD-1 rule and the four-guard CI wiring; the landing markup
    lands under them.
  - Consumes (ancestors in the stack): 225a_R7KIT.2b (Accordion), 226_R7SHELL.1a (the account
    menu), 244_R7COPY.1a (the REQ-COPY-6 H2/H3 copy fixes and the `GD-PUBDELTA.R7` delta list).
  - Phase-4 Split decision 9: moved out of 250_R7DEP.2's deliverables 3–5 (spec §10 footnote;
    REVIEW RV-32). Merges to `main` wait for 224_R7DEP.1 (spec §5.1).
- **Run:** `implement-spec spec=docs/tickets/249a_R7PUB.1__landing-pricing-refresh.md`
- **Gate status:** none. Code + tests; `mergePolicy: OPERATOR`.
- **Live stage:** Stage A only ($0: unit / DOM / SSR tests, a local Lighthouse-style LCP / CLS
  read, and a local `public-ssr-baseline` re-capture). **No owned preview** (`GD-PREVIEW.R7`).
  This overrides Split decision 9's "its own owned preview" suggestion: the operator capped round-7
  preview spend at $20 with one preview per phase. The hero recording is **captured and committed
  by 250_R7DEP.2** inside its R7b phase preview (spec §5.6: "captured from R7DEP.2's owned
  preview, after R7TOUR.2"). A live need outside 250's preview window PAUSES for the operator.
- **Production mutations:** none. Prod receives this code at 250 under `GD-DEPLOY.R7`.
- **Size budget:** ~450 changed lines excl. generated/fixtures (M). The SPA entry graph is
  unchanged (marketing is SSR); `check:spa-budget` stays green.

## Goal
The public surfaces carry the R7b refresh, ready for 250 to record and deploy:
- signed-in `/pricing` renders and is linked from the account menu;
- the landing gets a marketing layout, a serif display headline, the demo CTA, the copy fixes and
  an FAQ;
- a **hero-recording slot** is in place: lazy, muted, looping, reduced-motion safe, with zero CLS,
  rendering a static placeholder until 250 commits the recording;
- a committed capture recipe lets 250 record the loop from the preview's logged-out tour in one
  pass.

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md`:
  - §4.16 REQ-PUB-1, REQ-PUB-2;
  - §4.4 REQ-TOUR-4 (the landing CTA);
  - §4.13 REQ-COPY-6 (the H2/H3 public-copy fixes);
  - §4.17 REQ-DACC-6 (as extended by `GD-PUBDELTA.R7`);
  - §3.2 ADR-127 (corpus carve-out); §3.3 S-11 (pen name only);
  - §5.6; §8.
- `docs/build/planning/2026-11-03_r7-demo/PHASE4-REVIEW-decomposition.md` Split decision 9.
- Design spec REQ-GROWTH-3 (motion policy: looping, muted, ≤ 15 s, ≤ 2 MB, lazy; reduced-motion
  shows the poster only; CLS < 0.05; hero LCP < 2.5 s) and §15.1 (display serif).
- R4 §7 (marketing-claims constraints). R5 H1–H5. REVIEW RV-32.
- LEDGER § GATE DECISIONS `### Round 7` rows `GD-PREVIEW.R7`, `GD-PUBDELTA.R7`,
  `GD-UX-P1-BACKLOG.R7` (the full redesign is BACKLOG).
- `apps/web/AGENTS.md`, `packages/journeys/AGENTS.md` (the capture recipe reuses the D2.tour body).
- DEFERRALS round-7 sections. Manifest § Cross-cutting invariants and § Operating rules.
- Anchors (re-confirm at build time):
  - `apps/web/src/marketing.tsx`, `apps/web/src/copy.ts` and `lintGrowthCopy`;
  - the `/pricing` and `/showcase` routes in `apps/web/src/server.ts` (signed-in handling);
  - the account menu from 226_R7SHELL.1a;
  - the KIT-2 Accordion primitive (225a);
  - the static-asset path convention for web public assets and `apps/web/Dockerfile` (the asset
    must ship in the web image);
  - `LICENSES.md`, `licenses.exceptions.json` and `docs/adr/ADR-127*`;
  - `packages/journeys/src/steps.ts` (the D2.tour body as re-pinned by 248);
  - `scripts/live/public-ssr-baseline.mjs` (run locally; re-confirm its target flag).

## In scope — deliverables
1. **REQ-PUB-1.** Signed-in `/pricing` renders and is linked from the account menu. Signed-in
   `/showcase` keeps its redirect to the SPA Showcase.
2. **REQ-PUB-2, the landing** (scope-capped; the full redesign is `GD-UX-P1-BACKLOG.R7`):
   - a dedicated marketing layout and nav;
   - a serif display headline (§15.1);
   - the demo CTA (REQ-TOUR-4);
   - the REQ-COPY-6 H2/H3 fixes rendered in the new layout (the leaves are 244's);
   - the FAQ on Accordion, with styled native `<details>` as the no-JS fallback (KIT-1).
   - Every claim passes the launch-surface lint, with no efficacy phrasing (REQ-EVAL-19, R4 §7).
3. **The hero-recording slot** (REQ-PUB-2, REQ-GROWTH-3).
   - A hero component that plays a muted, looping, lazy-loaded clip with a poster frame;
     reduced-motion shows the poster only; the box reserves its aspect ratio so CLS is 0.
   - It keys on the committed asset's presence. Until 250 commits the clip and poster at the
     declared paths, it renders a static placeholder frame of the same dimensions, with no
     `<video>` and no corpus bytes. Both states are tested.
   - The asset paths and size budget (≤ 15 s, ≤ 2 MB) are declared in one place that the test and
     250's recipe both read.
4. **The capture recipe for 250** (REQ-PUB-2; spec §5.6).
   - A committed script that records the **logged-out** D2.tour body (248's) against a given base
     URL and `--expect-sha`, encodes the loop and a poster frame, and checks duration, bytes,
     muted and looping against the declared limits. It refuses a signed-in session, so no account
     identity is captured.
   - A dry run against a local build on the committed corpus proves the pipeline and the limits
     check. The dry-run clip is **not committed**; only 250's preview capture is.
5. **ADR-127 carve-out declaration** (REQ-PUB-2). The recording will show corpus content. Add the
   `LICENSES.md` / `licenses.exceptions.json` asset entry for the declared paths, and a dated note
   on ADR-127. 250 completes the entry with the committed file's bytes and sha256. Pen name only,
   per S-11.
6. **DACC-6, PUB side** (REQ-DACC-6). Re-capture `public-ssr-baseline` locally against this head's
   build. Only the enumerated deltas differ: the landing refresh and CTA, signed-in `/pricing`,
   and the `GD-PUBDELTA.R7` deltas already recorded by 240 and 244.

## Out of scope
- Capturing, encoding and committing the real recording, and the preview / prod Stage B
  (250_R7DEP.2).
- The tour itself (248). The copy leaves' wording (244; H15-signed demo copy via 248).
- The full marketing redesign (BACKLOG, `GD-UX-P1-BACKLOG.R7`).
- Any pricing, plan or credit-model change, and any new price claim outside the
  estimator/entitlement config (spec §8.2, §9; gotcha 5).

## Acceptance criteria
- [ ] PUB-1/2 behaviours have tests that fail if removed:
  - signed-in `/pricing`;
  - the account-menu link;
  - the `/showcase` redirect kept;
  - the marketing layout and display headline;
  - the reduced-motion poster;
  - the lazy loop, and the placeholder state when the asset is absent;
  - the FAQ Accordion with its no-JS fallback.

  *(deterministic · layer: engineered)*
- [ ] The launch-surface lint, `lintCopy` and `lintGrowthCopy` are green; no efficacy phrasing; pen
  name only. *(deterministic · layer: engineered)*
- [ ] The hero box reserves its dimensions (a layout test asserts no shift between placeholder and
  clip states). A local LCP / CLS read of the landing is recorded as a smoke (not REQ-GROWTH-3
  evidence). *(deterministic · layer: engineered)*
- [ ] The capture recipe's dry run on a local build produces a clip that passes the limits check;
  a seeded over-limit clip fails it; a signed-in session is refused. *(deterministic · layer:
  fixture-verified)*
- [ ] The ADR-127 asset declaration and the dated ADR note are committed; `check:licenses` is
  green. *(deterministic · layer: engineered)*
- [ ] `public-ssr-baseline`, re-captured locally, differs only by the enumerated DACC-6 deltas; the
  diff is committed in the run record. `check:spa-budget`, `spa-env`, `dom-contract`,
  `no-cookies` and the global GUARD-1 are green. *(deterministic · layer: engineered)*
- [ ] **Stage B — staging-verified at the R7b phase preview (250).** No preview is stood up here
  (`GD-PREVIEW.R7`). This ticket opens `D-R7PUB.1-1` (kind P; owner 250_R7DEP.2; dated from
  `date -u`; unblocked by: 250's preview walk; how to verify, committed under
  `docs/build/runs/R7PUB.1/` at 250's preview SHA with `--expect-sha`):
  - the hero recording captured with this ticket's recipe from the logged-out tour, committed, and
    passing the limits check;
  - the landing at 1440 and 390 with the clip, and the reduced-motion poster;
  - hero LCP and CLS measured on the preview against REQ-GROWTH-3;
  - signed-in `/pricing` and the account-menu link.

  250 closes the row; prod Stage B is 250's. This PR reports the AC owed, never green. *(agentic ·
  layer: staging-verified at the R7b phase preview (250))*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-PUB-1, REQ-PUB-2 (code, slot and capture recipe; the recording asset and B evidence are
250's), REQ-TOUR-4 (the landing CTA), REQ-DACC-6 (PUB-side local re-capture). Consumes REQ-COPY-6
(244's leaves) and REQ-GUARD-1 (global, 249). Findings: H1, H2, H3 (rendered), RV-32.

## Cross-cutting invariants
- Manifest § Cross-cutting invariants:
  - 1 (vocabulary; the harness is never named with a third-party product name);
  - 9 (no superiority or efficacy claim on the landing);
  - 14 (every price shown on `/pricing` comes from the estimator/entitlement config);
  - 17 (context budget; no preview is created here, per `GD-PREVIEW.R7`);
  - 18 (essay content is data: the recording is an asset under ADR-127, never a TS literal);
  - 20.
- Spec §8 .2 (no money change), .3 (copy; pen name), .4, .5 (licences; budgets) and .7.

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules` (1–10). The gap table has one row per
  clause.
- No preview is stood up here (`GD-PREVIEW.R7`). A live need outside 250's preview window PAUSES
  for the operator (gotcha 7).

## Notes
- **Origin.** Inserted at Phase 4 (Split decision 9, P4-13): 250 carried about 450 lines of
  R7PUB.1 code plus a second preview re-up on the heaviest live row. REQ-PUB-1 / REQ-PUB-2 (code)
  moved here; 250 keeps the preview walk, the recording capture, the deploy, Stage B, U6 and
  SPEED-5.
- **No own preview (override recorded).** Split decision 9 suggested this row record the hero loop
  from its own owned preview. `GD-PREVIEW.R7` (operator, 2026-11-03) caps round-7 preview spend at
  $20 with one preview per phase, so this row ships the slot and the recipe, and 250 captures the
  recording in its window. That is also spec §5.6's first option.
- **Owns:**
  - the marketing layout and the hero component;
  - the asset-path and limits declaration;
  - the capture recipe;
  - the ADR-127 asset declaration (250 completes its bytes / sha256).
- **Consumes:** 225a's Accordion, 226's account menu, 244's copy leaves and delta list, 248's tour
  body, 249's global guard.
- **DEFERRALS:** `D-R7PUB.1-1` (recording capture + Stage B → 250, `GD-PREVIEW.R7`) is opened by
  design.
