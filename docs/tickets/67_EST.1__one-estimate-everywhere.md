# EST.1 — One estimate everywhere (and a tier the user can choose)

- **Sequence:** 67 (round 3) · **Phase:** round 3 — launch readiness · **Kind:** ticket · **Tag:** money
- **base_branch:** current checkout (the chain tip the previous round-3 row left; stacked PR)
- **Depends on:** ECON.1
- **Scope (one line):** every pre-run figure a user sees — protocol cards, Timeline chip, run sheet (incl. the post-confirm re-render), palette, pricing cost cards + "what it covers", landing figures, duration ranges — comes from ECON.1's calibrated estimator through one surface API; the sheet shows and changes the model tier within plan rules; "Why this estimate?" adds up; the estimate route 400s an invalid tier; the lever-matrix perf flake is fixed.
- **Spec §§:** 5.6 (items 1–6, 9, 10), 6.5 (rigor presets, Advanced unbundles the tier), 14.1, 14.2 ("What it covers"), 14.4 (REQ-BILL-5/6), 15.1 (landing pricing section), 15.2 (cost-range cards, FAQ), Appendix A.9 2026-09-30 note (REQ-IDE-13, REQ-SPEC-32)
- **REQ coverage:** REQ-SPEC-32(b) (primary), REQ-IDE-13 (amended; primary), REQ-GROWTH-4 (primary), REQ-BILL-1, REQ-BILL-5, REQ-GROWTH-6, REQ-GROWTH-9, REQ-PERSONA-5 (tier half), REQ-SPEC-16 (stamp in the PR)
- **Absorbs (backlog):** BL-57 (PR-E1, PR-E3 — pre-run figures half), BL-58 (PR-E2), BL-11(a) (D-DEF.3-2), BL-12 (X-lever-matrix-flake)
- **Run:** `implement-spec spec=docs/tickets/67_EST.1__one-estimate-everywhere.md`
- **Gate status:** none beyond the round-3 standing authorization (ADR-013) — this ticket changes what users are *shown*, not what they are charged (the metered-debit flip is ECON.1's operator pause); the Stage B journey needs JOURNEY.1's test mailbox + funded test tenant (HUMAN-H7) — if still unticked, the journey legs follow the H7 DEFERRALS rule
- **Live stage:** Stage A: code + tests ($0). Stage B: deploy (pre-authorized `pulumi up prod` if the preview is clean), claim pre-pass refinements + at most one paid run on JOURNEY.1's ≤300-word fixture at a user-selected Base tier ≤$10 metered

## Goal
On 2026-09-30 the same 1,003-word essay was priced by six surfaces that disagreed 10–20× (PR-E1): protocol card
"Review ≈ 5,231", landing "600–2,680 cr", pricing "Quick ≈ 170 · Standard ≈ 280", Timeline "est. 3,721", sheet
"$37.21" (Standard/Balanced) or "$10.15" (Quick/Base), a post-confirm "5,180 words · 21 claims · $15.97"; 632 cr was
charged. The tier was never the user's (PR-E2), durations disagreed (PR-E3), and "Why this estimate? 4 claims × 40 cr ≈
440" neither multiplied nor summed. After this ticket one estimator API — fed by ECON.1's calibration store — prices
every surface for the same inputs, the user picks the model tier within plan rules, and a contract test fails the
moment any surface drifts from it (REQ-SPEC-32(b)).

## Load (read these — do not re-read others)
- `docs/build/planning/2026-09-30_planning-ledger.md` — row 67, § Shared decisions (EST.1 owns "the one estimator API
  for surfaces"; consumes ECON.1's cost cards / calibration store and HOT.1's `claims` config), § Journey step registry (N4).
- `docs/build/reports/2026-09-30_prod-design-review.md` — PR-E1, PR-E2, PR-E3 (and PR-E6 for context only).
- `docs/adr/ADR-014-charge-what-we-meter-interim-trial.md` §3 (one estimator), §6 (tier choice); ADR-016 (journeys).
- DEFERRALS row `D-DEF.3-2`; BACKLOG rows BL-11, BL-12, BL-57, BL-58.
- Spec §5.6, §6.5 table, §14.2 "What it covers", §15.2 cost cards + FAQ, the Appendix A.9 note.
- ECON.1's landed run ledger `docs/build/runs/ECON.1.md` + its ADR(s) — the calibration store API, the cost-card shape,
  whether cards carry durations, and the corrected §6.5 presets. **Consume; do not re-derive.**
- Code (anchors — re-confirm at build time):
  - `apps/web/src/server.ts` ~5058 `normalizeTier` (always called with `""` → the rigor preset's tier) at ~3373
    (`POST /p/:project/run`) and ~5099 (`buildSheet`); ~5105 the `|| 5180` fallback (the §5.6 mock's figure); ~3390 the
    POST handler's `buildSheet({ workflow, rigor, ...toggleQuery }, …)` with no `ctx`/`words` — **the post-confirm
    "5,180 words · 21 claims" is this hard-coded fallback, not another draft** (0.004 × 5,180 ≈ 21).
  - `apps/web/src/server.ts` ~2075 (`prefs.defaultModelTier`) and ~2379 (`modelTierDefault`) — written, never read by the
    sheet; `apps/api/src/project-routes.ts` `model_tier_default`; `apps/api/src/sheet-context.ts` (reads `user.prefs`).
  - `apps/api/src/project-routes.ts` ~100–116 protocol cards: `buildEstimate({ rigor:"standard", modelTier:"balanced" })`
    hard-coded; `apps/web/src/pages.tsx` ~1100 renders `Review ≈ ${n} credits`.
  - `apps/api/src/timeline-routes.ts` ~466–479 Timeline next step: Standard/**Balanced** hard-coded → the palette hint
    `packages/ide/src/palette.ts` ~95.
  - `packages/contracts/src/domain/pricing-page.ts` (whole) — a **second estimator** over modelled `costCardTerms`
    (`pricing.json`), consumed by `apps/web/src/marketing.tsx` ~65 (landing) and ~227 (pricing).
  - `packages/run-sheet/src/estimate.ts` ~23 `CLAIMS_PER_WORD` 0.004 (1,003 words ⇒ 4 claims; the review inventoried 16);
    `packages/run-sheet/src/view.ts` ~290–309 `whyLine` (prints the unscaled per-claim rate, totals with a hidden scale,
    omits the fixed/phase terms).
  - `packages/run-sheet/src/lever-matrix.ts` ~18 `timeBandFor` = credits/25…credits/15 (3,721 ⇒ "149–248 min");
    `packages/findings-core/src/run-card.ts` ~458 `ETA_PRIOR_MS_PER_PHASE` 5 min × 7 phases × [0.8, 1.5] ⇒ "28–53 min".
  - `packages/run-sheet/src/lever-matrix.test.ts` ~8–18 (the <100 ms asserts); `apps/api/src/estimate-routes.ts` ~131
    (checks `modelTier` presence only); `apps/api/src/run-routes.ts` ~378–380 (`trial_base_only`, `modelTierAllowed` —
    the server truth the sheet must mirror).

## In scope — deliverables
1. **The one surface-estimator API** (owned decision → ADR): a single function/endpoint every surface calls with
   `(workflow, rigor, tier, words, claims?, toggles?, scope?)` returning `{estimate, cap, low/high range, durationRange,
   claimCount, why[]}` from `estimatorSpec` + ECON.1's calibration store. It honours package boundaries (contracts stays a
   leaf; marketing figures are computed server-side through it). `pricing-page.ts`'s modelled terms stop being a price
   source (REQ-SPEC-32(b), REQ-GROWTH-4).
2. **Every surface re-pointed:** protocol cards (the user's resolved tier at the card's labelled typical length), the
   Timeline chip + palette hint (the head draft's real word count at the user's resolved rigor/tier — identical to the
   sheet's default), the run sheet (GET and every re-render, incl. POST success/402/403/409 — no `5180` fallback; a
   missing count renders "—" and "refining…", never a mock figure), the pricing cost-range cards + FAQ figure (REQ-GROWTH-6/9),
   and the landing pricing section (REQ-SPEC-32(b)).
3. **"What it covers" recomputed** from ECON.1's cost cards for each plan (REQ-GROWTH-4) and re-enabled through HOT.1's
   `claims` config **only where computed**; a plan whose figure cannot be computed keeps the line hidden.
4. **Tier control on the sheet** (REQ-IDE-13 amended; ADR-014 §6): the sheet shows the run's model tier and changes it
   within plan rules; Free/trial = Base only, Balanced/Frontier shown locked with their price; defaults resolve explicit
   choice → project `model_tier_default` → account `prefs.defaultModelTier` → the rigor notch's §6.5 default, clamped to
   the plan (the account/project settings stop being dead). The POST forwards the chosen tier (never `normalizeTier("")`);
   the api validates it (`modelTierAllowed`, trial Base) and freezes it on the run (REQ-BILL-6). The insufficient-balance
   panel's "use Base" is an actionable control, and no disclosure advises a tier the user cannot select (REQ-PERSONA-5).
5. **"Why this estimate?"** lists terms whose displayed products are arithmetically true and sum to the estimate (± the
   rounding line it states); the claim count shown is the refined pre-pass count when present, else a provisional count
   from ECON.1-calibrated claim density per protocol, labelled provisional (REQ-BILL-5, REQ-SPEC-16).
6. **Duration ranges** from the calibration store's measured wall-clock per (workflow, rigor, tier, size) bucket, gate
   waits excluded (if ECON.1's cards lack durations, add the column — additive migration only); the sheet, protocol card
   and the run card's *initial* ETA prior use it (the in-run ETA from real step durations is RPT.1's).
7. **Estimate route validation** (BL-11(a), closes D-DEF.3-2): unknown `modelTier`/`rigor`/`workflow` → 400 with a named
   error; no `estimate_cache` or `usage_records` row, no NaN `run.estimated` emit.
8. **Lever-matrix flake** (BL-12): keep §5.6 item 2's ≤100 ms recompute budget, measured robustly (warm-up + median of k,
   or an isolated perf project outside the parallel suite) — never deleted or loosened past the spec budget.
9. **Contract tests over every price surface** (REQ-SPEC-32(b)): a fixture matrix of inputs rendered through each surface
   equals the API's output; a static check fails on a hand-typed credit/dollar figure in price copy.

## Out of scope
- Debit mode, cost cards, the calibration store, cap derivation, the §6.5 preset fix (PR-E6) — **ECON.1**.
- The live meter, run report, phase durations inside a run, `/usage` history — **RPT.1**.
- The trial's *Included* rendering, trial/landing/pricing **claims** (the claim render model), pricing-page content
  defects ("Run word cap" row, "Start free", Team price) — **ACT.1** (ACT.1 consumes this ticket's API).
- Pricing phone overflow — **UX.2**; copy jargon — **UX.1**; COGS reduction — **ECON.2**; scoped second-read guidance
  (BL-11(b)) — **DEF.4**.

## Acceptance criteria
- [ ] For a fixture matrix of (workflow, rigor, tier, words), the protocol card, Timeline chip, palette hint, sheet (GET
      and POST re-render), pricing card range and landing figure each equal the surface API's output for the same inputs;
      the test fails if any surface calls `buildEstimate`/`costCardTerms` directly. *(deterministic)*
- [ ] The POST re-render after a successful Run click shows the draft's real word/claim counts; a test posting a
      1,003-word draft fails if "5,180" or "21 claims" appears. *(deterministic)*
- [ ] A Free/trial account's sheet offers only Base (others locked with price); a paid account's tier change reprices
      in place and the created run's frozen `model_tier` equals the choice; project → account → notch defaults resolve in
      that order; a forged Balanced POST from a trial account is refused 403 `trial_base_only`. *(deterministic)*
- [ ] "Why this estimate?" terms multiply correctly and sum to the shown estimate within the stated rounding, at every
      rigor × tier for three fixture drafts. *(deterministic)*
- [ ] Duration ranges on the sheet, protocol card and the run card's initial ETA come from the calibrated bucket; no
      `credits/25`-style derivation remains (grep-asserted). *(deterministic)*
- [ ] `POST /projects/:id/estimates` with `modelTier:"standard"` → 400 named error, zero `estimate_cache`/`usage_records`
      rows; live the same on prod (closes D-DEF.3-2). *(deterministic + live HTTP)*
- [ ] `lever-matrix` perf assertion passes 20/20 full-suite runs locally/CI while still failing when the matrix build is
      made O(n²) (a mutation check recorded in the run ledger). *(deterministic)*
- [ ] "What it covers" lines render only when computed from cost cards (HOT.1 `claims` flag on for exactly those). *(deterministic)*
- [ ] **Journey step N4 green** on the deployed stage via the JOURNEY.1 harness: for the fixture draft, the sheet's
      estimate and duration equal the Timeline chip and palette, lie inside the pricing card's range for its size band,
      and the protocol card matches the API at its labelled length; the step's expected-red flag is flipped; screenshots
      committed. *(agentic — live, $0)*
- [ ] One paid run on the ≤300-word fixture at a user-selected Base tier: its frozen tier/estimate/cap equal what the
      sheet showed and the metered actual is recorded against the printed range in the run ledger (≤$10). *(agentic — live)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-SPEC-32(b), REQ-IDE-13 (amended), REQ-GROWTH-4, REQ-BILL-1, REQ-BILL-5, REQ-GROWTH-6, REQ-GROWTH-9, REQ-PERSONA-5
(tier half), REQ-SPEC-16; touches REQ-BILL-6 (tier frozen — primary owner RPT.1).

## Cross-cutting invariants
- Manifest #1 (model tiers / rigor vocabulary verbatim; no raw model names outside small type), #7 (Σ debits ≤ cap; never
  silent billing), #9 (no superiority claim in any figure copy), #11 (the sheet is the only paywall; `RunButton` requires
  an estimate), #12 (REQ-SPEC-29 — N4 by walking it; deployed provenance = chain-tip SHA), #13 (REQ-SPEC-30 — new reads
  of `user.prefs`/project defaults go through the user-serving pool, never the system pool), #14 (REQ-SPEC-32 — no
  hand-written or modelled-only figure reaches a surface).

## Notes
- **Owned decisions → write ADRs:** (a) the surface-estimator API's shape and home (which package; how marketing pages
  reach it without contracts importing protocols); (b) the tier-default resolution order vs §6.5's "model default" column
  (proposal above — record it; ADR-014 §6 is the constraint); (c) the lever-matrix timing method.
- **Shared decisions consumed:** ECON.1 — calibration store, cost cards, cap derivation (caps come from it, never this
  ticket); HOT.1 — the `claims` visibility config (re-confirm its name/location). EST.1's API is consumed by ACT.1 (claims)
  and UX.1. HOT.1 and JOURNEY.1 landed earlier in the chain and are consumed, not re-built.
- Sequencing hazard: if ECON.1's `debitMode` flip is still operator-paused at build time, the sheet still shows the
  calibrated estimate/cap (the calibrated caps shipped with ECON.1); record in the run ledger which mode prod was in.
- The Timeline/protocol-card reads are "decorative, never fail the read" today — keep that posture, but a failed estimate
  renders "—", never a stale or modelled number.
- **DEFERRALS rule:** anything not verifiable at build time (e.g. the journey blocked on H7's test mailbox) becomes a
  `D-EST.1-<n>` row; close D-DEF.3-2 with evidence when the live 400 is observed.
