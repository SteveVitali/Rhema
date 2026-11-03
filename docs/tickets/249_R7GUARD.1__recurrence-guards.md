# R7GUARD.1 — Recurrence guards: no-raw-controls enabled globally + the pane-occlusion check in CI

- **Sequence:** 249 of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 248_R7TOUR.2, plus every row that enables GUARD-1 for a batch, declared
  explicitly (Phase-4 P4-11: the earlier "reached transitively through 248" claim was false — 240
  and 242 hang off 227, and 241 off 236):
  - The final tour-target list is part of the occlusion set (REQ-PANE-4): 248.
  - Every migration batch has landed before the rule goes global: 232_R7TALK.1a (`chat-panel`),
    234_R7HOME.1 (batch c1), 240_R7KIT.3a and 240a_R7KIT.3a2 (batch a), 241_R7KIT.3b (batch b),
    242_R7KIT.3c2 (batch c2), 243_R7KIT.3d and 243a_R7KIT.3e (batch d).
  - The rule shipped "off" in 225a_R7KIT.2b (authoring moved there by Split decision 5). The U3 leg
    and `paneLayout()` wiring are 229_R7PANE.1's.
  - Merges to `main` wait for 224_R7DEP.1 (spec §5.1).
- **Run:** `implement-spec spec=docs/tickets/249_R7GUARD.1__recurrence-guards.md live_verification=false`
- **Gate status:** none
- **Live stage:** offline-only, Stage A ($0). The guard runs in CI against a locally served build.
  **No owned preview** (`GD-PREVIEW.R7`). Its Stage-B arm is U3.occlusion, walked by 250_R7DEP.2 at
  the R7b phase preview and at the deployed tip.
- **Production mutations:** none
- **Size budget:** M. About 350 changed lines, excluding fixtures. Residual-violation migration is
  bounded; see Notes.

## Goal
The defects round 7 fixed cannot quietly return, because CI enforces two guards:
- **No raw controls.** Raw `<button|input|select|textarea>` and inline
  spacing/type/colour/radius literals are lint errors across the whole UI scope, except for a named,
  committed list of no-JS/SSR exemptions.
- **No occlusion.** No Page text column, dossier letter column or tour target can sit under an
  un-scrimmed panel, overlay or menu at the reference sizes. No main column drops below 45 ch at
  ≥ 768 px.

## Load (read these — do not re-read others)
- **Spec** `docs/round-7-draft-spec.md`:
  - §4.16 REQ-GUARD-1…4;
  - §4.6 REQ-KIT-1 (styled native controls stay the permanent no-JS fallback, RV-36), KIT-2 and
    KIT-3 (the per-batch enablement);
  - §4.7 REQ-PANE-1, -2, -4;
  - §1 ("R7b done": the four guards run in CI);
  - §3.2 ADR-129;
  - §8.5.
- **Notes:**
  - R6 §4 (styling coverage) and §6.1 (geometry from `LAYOUT`);
  - R5 B1, B2, F1–F4 (the occlusion findings);
  - REVIEW RV-16 (guard scope), RV-26 (no un-scrimmed overlay; ch floor at ≥ 768), RV-36.
- **Anchors (re-confirm at build time):**
  - the no-raw-controls rule 225a_R7KIT.2b added under `tools/eslint-plugin-rhema/rules/`, with its
    registration in `tools/eslint-plugin-rhema/index.js`;
  - the per-batch enablement blocks that 232, 234, 240, 240a, 241, 242, 243 and 243a added to
    `eslint.config.js`;
  - `packages/ui/src/primitives/**`;
  - the KIT-1 base layer in `@rhema/ui` (`uiCss()`);
  - `packages/journeys/src/occlusion.ts`, and the U3.occlusion step in `steps.ts` / `registry.ts`;
  - `paneLayout()` and `LAYOUT` (`packages/tokens/src/tokens.ts`);
  - the final tour step table (248);
  - `.github/workflows/ci.yml` (the unit job installs chromium so browser tests are never vacuous),
    `docs/ci.md`, and the fast-path rules (ADR-115);
  - the GUARD-2 lint and DOM test from 244_R7COPY.1a, and the GUARD-3 harness from
    231_R7RELOAD.1. These are verified here, not rebuilt.

## In scope — deliverables
1. **REQ-GUARD-1, global** (REQ-GUARD-1).
   - The rule is `error` over `packages/ui/src/**` (except `primitives/**`) and
     `apps/web/src/**/*.tsx`. The per-batch blocks collapse into one global block.
   - The no-JS/SSR exemption list is committed as data: each entry names a file or component and
     gives its reason, and is styled by KIT-1.
   - The rule's own tests fail if it is weakened. They cover a raw `<button>`, an inline
     `style={{ padding: 8 }}`, a colour literal and a radius literal, and check that an exemption
     applies only to a listed entry.
   - A config-resolution test (ESLint `calculateConfigForFile` on a sample path per glob) fails if
     the scope narrows.
   - Residual violations are zero at close.
2. **REQ-GUARD-4 / REQ-PANE-4 in CI** (REQ-GUARD-4, REQ-PANE-4).
   - A Playwright layout check runs at 1440×900, 1280×800, 1024×768 and 820×1180, plus 390×844
     emulated for the demo. It asserts:
     - zero intersection between the Page text column, the dossier letter column or any tour
       target and any open un-scrimmed panel, overlay or menu;
     - no main column under 45 ch at ≥ 768 px.
   - It runs against a locally served build:
     - the demo routes on the committed synthetic fixture (no DB or API, per ADR-126);
     - the IDE surfaces through the fixture harness U3 uses (re-confirm).
   - It shares one assertion implementation with the Stage-B U3.occlusion leg.
   - A negative fixture (an un-scrimmed overlay over the text column) fails it.
   - It fails hard when chromium is absent, so it is never a silent skip.
3. **Four-guard CI wiring** (REQ-GUARD-1…4).
   - A committed check asserts that GUARD-1 (lint), GUARD-2 (copy lint + DOM test), GUARD-3
     (no-reload harness) and GUARD-4 (this layout check) each run in a required CI job on the full
     path.
   - `docs/ci.md` names each guard and the job it runs in.
4. **CI cost note.** Record the layout check's added wall time from the CI read. It joins an existing
   full-mode job unless that read shows a material regression (round-6 CI-cost precedent, R6CI.1).

## Out of scope
- The rule's authoring, the primitives and the base layer: 225_R7KIT.2 / 225a_R7KIT.2b and
  210_R7KIT.1.
- The per-batch migrations: 232, 234, 240, 240a, 241, 242, 243, 243a. This ticket only sweeps
  residue.
- The landing / pricing refresh: 249a_R7PUB.1 (it lands after this row and must pass the global
  rule).
- The SplitPane engine and the breakpoints: 229_R7PANE.1.
- GUARD-2's lint: 244_R7COPY.1a.
- GUARD-3's harness: 231_R7RELOAD.1.
- The tour targets: 248_R7TOUR.2.
- The Stage-B walk at prod: 250_R7DEP.2.
- Drag-resize persistence/reset: BACKLOG (RV-31).

## Acceptance criteria
- [ ] `pnpm turbo lint` is green with the rule `error` over both globs. The config-resolution test
      proves the scope. The rule tests fail when the rule is removed or weakened. *(deterministic ·
      layer: engineered)*
- [ ] The exemption list is committed data, and every entry carries a reason. An unlisted raw
      control in an exempt-looking file fails lint. *(deterministic · layer: engineered)*
- [ ] The layout check runs in CI at the five sizes and is green on the R7b tip. The negative
      fixture fails it. It fails, rather than skips, without chromium. *(deterministic · layer:
      fixture-verified)*
- [ ] The four-guard wiring check is green, and `docs/ci.md` lists each guard's job. *(deterministic ·
      layer: engineered)*
- [ ] **Stage B owed to 250_R7DEP.2** (`GD-PREVIEW.R7`): this ticket opens `D-R7GUARD.1-1` (kind
      P; owner 250_R7DEP.2; dated from `date -u`; unblocked by: 250's preview walk and prod Stage
      B; how to verify: U3.occlusion green across the five sizes, with screenshots, at 250's preview
      SHA and at the deployed R7b SHA). Recorded here as owed, never claimed. *(agentic · layer:
      staging-verified at the R7b phase preview (250), then live-executed, carried)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-GUARD-1, REQ-GUARD-4, REQ-PANE-4 (CI arm). REQ-GUARD-2 and REQ-GUARD-3 are stamped
"wiring verified" only.

## Cross-cutting invariants
- Manifest § Cross-cutting invariants 1, 12, 17 (no preview is created here, per `GD-PREVIEW.R7`)
  and 20.
- Spec §8:
  - 8.4 (DOM-contract updates in the same change);
  - 8.5 (no ceiling raised without a ruling; `check:spa-budget`, `dom-contract` and `licenses` stay
    green);
  - 8.6;
  - 8.7.

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules` 1–10. The gap table has one row per
  clause.
- Rule 10: a docs-only `docs/ci.md` delta on a green head gets its own CI read.

## Notes
- **Owns:**
  - the global GUARD-1 enablement;
  - the committed no-JS/SSR exemption list;
  - the CI arm of GUARD-4 / PANE-4;
  - the four-guard wiring check.
- **Consumes:**
  - the rule (225a);
  - the U3 assertion code (229);
  - the tour-target list (248);
  - GUARD-2 (244);
  - GUARD-3 (231).
- **Residue bound.** If the global enablement surfaces more than about 150 lines of migration (a
  surface no batch covered), stop and request an insert row (manifest invariant 17). Never widen the
  exemption list to hide residue: an exemption needs a no-JS/SSR reason.
- **DEFERRALS.** Read first. The Stage-B arm is carried to 250 as `D-R7GUARD.1-1`, matching the
  round's `GD-PREVIEW.R7` rule that every Stage-B AC is a DEFERRALS row closed by the phase
  deploy.
