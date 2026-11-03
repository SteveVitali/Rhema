# R7KIT.3e — Dossier layout + claim ordinals + dossier-file migration (U4)

- **Sequence:** 243a of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:**
  - 243_R7KIT.3d: the rest of batch d is migrated and GUARD-1-enabled, so U4.controls can prove
    zero native-styled controls across the app once the dossier files land here.
  - Through 243: 232_R7TALK.1a / 237_R7WRITE.1a / 241_R7KIT.3b, and 229_R7PANE.1's right panel.
  - 233_R7TALK.1b: the right panel's Findings tab ("From Review of vN"), which the dossier's
    findings move into. Declared directly, because this ticket consumes it and 243 does not
    declare it.
  - Phase-4 Split decision 7 (the author's pre-declared cut of 243). Spec §10 row 243 (part).
    Merges to `main` wait for 224_R7DEP.1 (spec §5.1).
- **Run:** `implement-spec spec=docs/tickets/243a_R7KIT.3e__dossier-layout-claims.md`
- **Gate status:** none. Code + tests; `mergePolicy: OPERATOR`.
- **Live stage:** Stage A only ($0: unit / DOM / layout tests and the U4 probe against a local
  build). **No owned preview** (`GD-PREVIEW.R7`). **U4.controls** is held `ready-to-flip`
  (Phase-4 P4-4): 250_R7DEP.2 walks it on the R7b phase preview and flips it on prod evidence. A
  live need outside 250's preview window PAUSES for the operator.
- **Production mutations:** none
- **Size budget:** ~450 changed lines excl. generated/fixtures (M). Entry delta ≤ 15 kB gz.

## Goal
The dossier reads like the product:
- the letter is the main column at Page measure;
- the run card collapses to a one-line header;
- findings live in the right panel;
- the claim ledger is a section of the letter column;
- claim ordinals and verdicts read correctly.

The dossier composition files move to the primitives with GUARD-1 on, and U4.controls proves zero
native-styled controls across the app.

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md`:
  - §4.6 REQ-KIT-3 (batch d), REQ-KIT-2 (Chip variants), REQ-KIT-5;
  - §4.7 REQ-PANE-5;
  - §4.13 REQ-COPY-8;
  - §4.16 REQ-GUARD-1;
  - §4.17 REQ-DACC-7 (U4), REQ-DACC-8;
  - §5.5;
  - §8;
  - §10 owner map (U4 → R7KIT.3d), superseded by this row (see Notes).
- `docs/build/planning/2026-11-03_r7-demo/PHASE4-REVIEW-decomposition.md` Split decision 7 and
  P4-4.
- `R5-ux-browser-audit.md` C6 (the dossier part), C7, C8 (the visual-language part), C9, F1 and F3.
- `R6-ux-code-audit.md` §4 (by-file census: `dossier-view.tsx` 15 / 49) and §9 UXC-16.
- `apps/web/AGENTS.md`, `packages/journeys/AGENTS.md`.
- `docs/build/runs/R7KIT.3d.md` (243's run record: exemption format, chip usage).
- DEFERRALS round-7 sections. LEDGER § GATE DECISIONS `### Round 7` row `GD-PREVIEW.R7`; 209 Notes
  "Why the sub-assertions exist" (the nightly hazard).
- Manifest § Cross-cutting invariants and § Operating rules.
- Anchors (re-confirm at build time):
  - `apps/web/src/dossier-view.tsx` (1,002 lines; 15 / 49; the shared SSR + SPA composition and
    its DOM-contract hooks);
  - `apps/web/src/spa/surfaces/dossier.tsx`;
  - `packages/ui/src/dossier.tsx` (`:70` renders `[{ordinal}]`), `letter.tsx`, `claims.tsx`
    (`:94` renders `[{ordinal}]`) and `findings.tsx` (C6 chips);
  - the `dossier.dom.test.tsx` and `findings-surface.test.tsx` files;
  - 229's right panel and 233's Findings tab;
  - `packages/journeys/src/registry.ts` (the U4 row) and `steps.ts`;
  - the GUARD-1 config (243's batch-d block).

## In scope — deliverables
1. **Dossier-file migration** (REQ-KIT-3 batch d, the dossier part; UXC-16).
   - `dossier-view.tsx`, `spa/surfaces/dossier.tsx` and `packages/ui/src/{dossier,letter,claims,
     findings}.tsx` move to the 225 / 225a primitives with `uiCss()`. Hooks are preserved in the
     same change.
   - Letter, findings and claims chips use the static vs interactive Chip variants (C6, the
     dossier part).
   - REQ-GUARD-1 is enabled for these files in 243's batch-d block.
2. **Dossier layout** (REQ-PANE-5; C7, F1, F3).
   - The letter is the main column at Page measure, with a sticky in-column outline only at
     ≥ 1440.
   - The run card collapses to a one-line run header.
   - Findings move to the right panel's Findings tab, consuming 229 and 232/233's tab.
   - The colour-dot minimap is labelled or removed; record which.
   - The claim ledger becomes a section of the letter column.
   - SSR and SPA renderers stay attribute-identical through `dossier-view.tsx`.
3. **Claim ordinals** (REQ-COPY-8; C9). Show the source id or 1-based numbering, never `[0]`. A
   verdict is shown once.
4. **U4.controls leg** (REQ-DACC-7/8).
   - Build the computed-style probe: zero native-styled controls on 12 surfaces. This ticket names
     the 12 in the registry row, covering every KIT-3 batch's surfaces (incl. 240a's voices) plus
     the IDE Page, right panel and dossier.
   - **Nightly hazard** (209's note; P4-4). `main` receives this PR after 224, but prod serves R7a
     until 250 deploys, so a green-expected U4 would fail the nightly. The registry row stays
     `expected:"red"` with a `ready-to-flip` annotation naming 250_R7DEP.2, which walks it on the
     phase preview and flips it on prod evidence.

## Out of scope
- The rest of batch d (243_R7KIT.3d): right panel, gate cards, header strip residue, findings desk,
  compare, `run-sheet.tsx`, `approval-settings.tsx`, timeline chips.
- The chat composer and thread (232). Findings / Claims tab content rules (233, REQ-TALK-4).
- Markdown rendering of finding bodies and letters, and URL wrap (245_R7COPY.1b, REQ-COPY-3).
- Label table and jargon (244). Global GUARD-1 and the occlusion guard in CI (249_R7GUARD.1).
- Other batches' files (240/240a/241/242/234).

## Acceptance criteria
- [ ] GUARD-1 is on and passing for every dossier file migrated here. Each exemption names its
  no-JS reason. A seeded raw control fails the rule. *(deterministic · layer: engineered)*
- [ ] The dossier and findings DOM tests pass. `check:dom-contract` holds the SSR ↔ SPA attribute
  parity for `data-letter-view`, `data-claims-table`, `data-findings-*`, etc. *(deterministic ·
  layer: engineered)*
- [ ] Dossier layout tests cover:
  - the letter column holds 45–80 ch (target 68) at 1280 / 1440 / 1920;
  - the sticky outline renders only at ≥ 1440;
  - the run card renders as one line;
  - findings render in the right panel's Findings tab, not as a dossier column;
  - the claim ledger renders inside the letter column.

  *(deterministic · layer: engineered)*
- [ ] Claim rows render source ids or 1-based ordinals (a test with ordinal 0 in the fixture), and
  each claim's verdict text appears once. *(deterministic · layer: engineered)*
- [ ] **U4.controls, Stage A.** The probe passes on all 12 surfaces against a locally served build.
  The registry row names the 12 and stays `expected:"red"`, annotated `ready-to-flip` →
  250_R7DEP.2. *(deterministic · layer: engineered)*
- [ ] `check:spa-budget` passes, entry delta reported, with `spa-env` and the vocab lints.
  *(deterministic · layer: engineered)*
- [ ] **Stage B — staging-verified at the R7b phase preview (250).** No preview is stood up here
  (`GD-PREVIEW.R7`). This ticket opens `D-R7KIT.3e-1` (kind P; owner 250_R7DEP.2; dated from
  `date -u`; unblocked by: 250's preview walk; how to verify: U4.controls green at 250's preview
  SHA with `--expect-sha` and provenance PASS on web + api, plus screenshots under
  `docs/build/runs/R7KIT.3e/`):
  - the dossier at 1440 / 1280 / 1024 (C7, F1, F3 states);
  - the claim ledger (C9);
  - the right panel's Findings tab holding the dossier's findings.

  250 closes the row and flips U4.controls on prod evidence. This PR reports the AC owed, never
  green. *(agentic · layer: staging-verified at the R7b phase preview (250))*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-PANE-5, REQ-COPY-8, REQ-KIT-3 (batch d, the dossier composition files), REQ-GUARD-1 (batch-d
enablement for those files), REQ-KIT-5 (allowance), REQ-DACC-7 (U4), REQ-DACC-8 (U4, held
`ready-to-flip`; 250 flips). Findings: C6 (the dossier part), C7, C9, F1 (the dossier part), F3,
UXC-16 (dossier files).

## Cross-cutting invariants
- Manifest § Cross-cutting invariants:
  - 1, 9;
  - 11 (no dossier control becomes a run launcher);
  - 12;
  - 17 (context budget; no preview is created here, per `GD-PREVIEW.R7`).
- Spec §8 .3, .4 (DOM contract and SSR parity in the same change), .5 and .7.

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules` (1–10). The gap table has one row per
  clause.
- No preview is stood up here (`GD-PREVIEW.R7`). A live need outside 250's preview window PAUSES
  for the operator (gotcha 7).

## Notes
- **Origin.** Inserted at Phase 4 (Split decision 7, P4-13). REQ-PANE-5 and REQ-COPY-8 moved here
  from 243 with the dossier files they rewrite. The dossier is among U4's 12 surfaces, so the
  **U4.controls flip moved here** too.
- **Owner-map deviation (recorded).** Spec §10 names U4 → R7KIT.3d. Per Split decision 7 the owner
  is **R7KIT.3e** (this row); 209's owner table and the manifest record it. The spec's
  post-ratification note says §10 is superseded by the manifest's `### Round 7` table. The single
  owner rule (DACC-8) holds: only this row builds U4, and 250 flips it on prod evidence.
- **Owns:**
  - the dossier layout and the minimap decision;
  - the claim-ordinal rule;
  - the 12-surface U4 list;
  - **U4.controls** (built here, held `ready-to-flip`);
  - the dossier files' exemption entries.
- **Consumes:**
  - 225 / 225a's primitives (Chip variants, Tabs, Tooltip);
  - 229's right panel and 232/233's Findings tab;
  - 243's batch-d config block;
  - 241's number formatter at any number site touched.
- **Downstream.** 244, 245, 248 and 249 depend on this row (Split decision 7, P4-10, P4-11).
- **Tour:** the dossier letter, the right-panel Findings tab (beat 5) and the claim ledger (beat 6)
  are R7TOUR.2 targets (§5.5). Keep the demo-bucket hooks and list every moved target for 248.
- **DEFERRALS:** `D-R7KIT.3e-1` (Stage B → 250, `GD-PREVIEW.R7`) is opened by design.
