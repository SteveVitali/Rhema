# R7KIT.3a2 — Migrate voices to the primitives (batch a, part 2)

- **Sequence:** 240a of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:**
  - 240_R7KIT.3a: the batch-a GUARD-1 config block this ticket extends, and the voice source-kind
    label map (REQ-KIT-4, D4) this surface renders through.
  - Through 240: 227_R7SHELL.1b (voices framed in the shell) and 225a_R7KIT.2b (the form
    primitives and the `rhema/no-raw-controls` rule).
  - Phase-4 Split decision 6 (the author's pre-declared cut of 240). Spec §10 row 240 (part).
    Merges to `main` wait for 224_R7DEP.1 (spec §5.1).
- **Run:** `implement-spec spec=docs/tickets/240a_R7KIT.3a2__migrate-voices.md`
- **Gate status:** none. Code + tests; `mergePolicy: OPERATOR`.
- **Live stage:** Stage A only ($0: unit / DOM tests against a local build). **No owned preview**
  (`GD-PREVIEW.R7`). The Stage-B AC is owed to the R7b phase preview in 250_R7DEP.2 through a
  DEFERRALS row. A live need outside 250's preview window PAUSES for the operator.
- **Production mutations:** none
- **Size budget:** ~400 changed lines excl. generated/fixtures (M). Entry delta ≤ 15 kB gz.

## Goal
The voices surface stops looking unfinished, finishing batch a:
- every control on `voices.tsx` is a `@rhema/ui` primitive;
- no inline spacing / type / colour / radius literal remains;
- REQ-GUARD-1 covers `voices.tsx`;
- voice source kinds render as labels, never as `substack_export`-style keys.

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md`:
  - §4.6 REQ-KIT-3 (batch a), REQ-KIT-4 (the D4 bullet), REQ-KIT-5;
  - §4.16 REQ-GUARD-1 (per-batch enablement, the no-JS exemption list);
  - §8.
- `docs/build/planning/2026-11-03_r7-demo/PHASE4-REVIEW-decomposition.md` Split decision 6.
- `R6-ux-code-audit.md` §4 (controls census: voices 9/55) and §9 UXC-16.
- `R5-ux-browser-audit.md` D4 (and A2 for the class).
- `apps/web/AGENTS.md`.
- `docs/build/runs/R7KIT.3a.md` (240's run record: the batch-a config block, the exemption-entry
  format, the source-kind label map).
- DEFERRALS round-7 sections. LEDGER § GATE DECISIONS `### Round 7` row `GD-PREVIEW.R7`.
- Manifest § Cross-cutting invariants and § Operating rules.
- Anchors (re-confirm at build time):
  - `apps/web/src/spa/surfaces/voices.tsx` (1,352 lines; about 68 raw controls incl. 13 hidden,
    about 244 `style={…}`; the source-kind meta line; the native file input);
  - the voices `*.dom.test.tsx` file;
  - `apps/web/src/copy.ts` (voices leaves) and 240's source-kind label map;
  - the 225 / 225a primitives (incl. the dropzone);
  - the GUARD-1 batch-a block in `eslint.config.js`.

## In scope — deliverables
1. **Voices migration** (REQ-KIT-3 batch a; UXC-16 for this file).
   - Every `<button|input|select|textarea>` on the voices list and detail becomes a 225 / 225a
     primitive.
   - The native file input becomes the 225 dropzone or primitive.
   - Inline literals go through `uiCss()` classes or tokens.
   - DOM-contract hooks are preserved; any rename lands in `dom-contract.ts` in the same change.
   - Hidden inputs and no-JS-only forms go on GUARD-1's named exemption list with a reason each.
2. **REQ-GUARD-1 enabled** for `voices.tsx`, by adding it to 240's batch-a config block.
3. **Source kinds as labels** (REQ-KIT-4, D4). The voices surface renders source kinds through
   240's COPY-owned map. No new map is created here; 244 folds the map later.

## Out of scope
- Settings, billing and usage, the UA parser, the plan-value round-down and the label map itself
  (240_R7KIT.3a).
- The single label-table mechanism and REQ-GUARD-2 (244_R7COPY.1a).
- `errorCopy` on the voices error site (245a_R7COPY.1c). Voice-sample monospace (245_R7COPY.1b).
- Any voice-model, ingestion or pricing behaviour change.

## Acceptance criteria
- [ ] GUARD-1 is on for `voices.tsx` and passes. A seeded raw `<button>` in a voices fixture fails
  the rule. Each new exemption entry names its no-JS reason. *(deterministic · layer: engineered)*
- [ ] The existing voices DOM tests and `check:dom-contract` pass with hooks preserved.
  *(deterministic · layer: engineered)*
- [ ] No source-kind or option key (snake_case) appears in the voices list or detail rendered text
  outside `data-*`, per a DOM assertion. *(deterministic · layer: engineered)*
- [ ] `check:spa-budget` passes, entry delta reported, with `spa-env` and the vocab lints.
  *(deterministic · layer: engineered)*
- [ ] **Stage B — staging-verified at the R7b phase preview (250).** No preview is stood up here
  (`GD-PREVIEW.R7`). This ticket opens `D-R7KIT.3a2-1` (kind P; owner 250_R7DEP.2; dated from
  `date -u`; unblocked by: 250's preview walk; how to verify: voices list and detail screenshots
  at 250's preview SHA, `--expect-sha`, provenance PASS, committed under
  `docs/build/runs/R7KIT.3a2/`, plus a computed-style probe on voices with zero native-styled
  controls). 250 closes the row. This PR reports the AC owed, never green. *(agentic · layer:
  staging-verified at the R7b phase preview (250))*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-KIT-3 (batch a: voices), REQ-GUARD-1 (batch-a enablement for `voices.tsx`), REQ-KIT-4 (the D4
bullet on the voices surface), REQ-KIT-5 (allowance). Findings: D4 (voices), UXC-16 (voices).

## Cross-cutting invariants
- Manifest § Cross-cutting invariants:
  - 1, 9, 12;
  - 17 (context budget; no preview is created here, per `GD-PREVIEW.R7`);
  - 20 (UX recurrence guards: GUARD-1 on once migrated; entry delta ≤ 15 kB gz).
- Spec §8 .3, .4, .5 (licences; budget) and .7.

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules` (1–10). The gap table has one row per
  clause.
- No preview is stood up here (`GD-PREVIEW.R7`). A live need outside 250's preview window PAUSES
  for the operator (gotcha 7).

## Notes
- **Origin.** Inserted at Phase 4 (Split decision 6, P4-13): 240's batch a measured over M
  (about 118 raw controls and 560 inline style props). This is the author's pre-declared cut. The
  REQ stamps moved with it: REQ-KIT-3 / REQ-GUARD-1 (voices part) and REQ-KIT-4 (D4 on voices).
- **Owns:** batch a's GUARD-1 exemption entries for `voices.tsx`.
- **Consumes:** 225 / 225a's primitives and `uiCss()`; 227's framing; 240's config block and
  source-kind map.
- **U4.controls.** If the 12-surface U4 list (243a_R7KIT.3e) names voices, this migration is what
  makes that probe pass. 249 depends on this row explicitly (P4-11).
- **DEFERRALS:** `D-R7KIT.3a2-1` (Stage B → 250, `GD-PREVIEW.R7`) is opened by design.
