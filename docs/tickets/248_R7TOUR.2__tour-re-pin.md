# R7TOUR.2 — Re-pin the SPD guided tour on the final R7b surfaces + the sidebar Demo entry

- **Sequence:** 248 of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** every R7b row that moves a tour target (spec §5.5, REVIEW RV-12). The tour must be
  pinned after the last DOM change to its targets:
  - 227_R7SHELL.1b (leaf headers removed; framed surfaces);
  - 230_R7SHELL.2 (project scope in the sidebar; Files tree);
  - 236_R7HOME.2b (a project opens to its Page);
  - 237_R7WRITE.1a (format bubble + page header strip / version chip);
  - 243a_R7KIT.3e (REQ-PANE-5 dossier layout: letter column, Findings tab, claim ledger section;
    through it 243_R7KIT.3d's IDE surfaces — re-pointed by Phase-4 Split decision 7);
  - 244_R7COPY.1a (labels + jargon: the visible text the leg asserts);
  - 246_R7SYNC.1 (timeline/state coherence + REQ-SPEED prefetch).
  - Declared per Phase-4 P4-10 (spec §5.5's "COPY.1" covers both 244 and 245, and these rows move
    or constrain targets the re-pin consumes):
    - 228_R7SHELL.1c (the palette the DWEB-7 proxy walks);
    - 231_R7RELOAD.1 (the GUARD-3 named exclusion list the Demo item joins);
    - 232_R7TALK.1a (the chat tab the proxy walks);
    - 233_R7TALK.1b (the Findings tab's "From Review of vN", beat 5);
    - 239_R7WRITE.2 (`reserved-chords.json`, the tour-key collision test);
    - 242_R7KIT.3c2 (the Figures list, beat 7);
    - 245_R7COPY.1b (rendered finding / letter prose the tour shows);
    - 245a_R7COPY.1c (error copy on any tour-reachable refusal).
  - Transitively 226_R7SHELL.1a (sidebar) and 229_R7PANE.1 (sidebar | Page | right panel). The R7a
    tour this ticket re-pins is 222_R7DEM.6a's.
  - **No soft block on 247a_HUMAN-H16** any more: `GD-PREVIEW.R7` moved that session into 250's
    preview window (P4-10's "soft 247a" is overridden; see 247a's header).
  - Merges to `main` wait for 224_R7DEP.1 (spec §5.1).
- **Run:** `implement-spec spec=docs/tickets/248_R7TOUR.2__tour-re-pin.md`
- **Gate status:** none. Tour-copy approval is the operator's merge read of the changed-leaf list
  (`GD-TOURSIGN.R7`, "Read the diff at merge (Recommended)"); no new HUMAN row.
- **Live stage:** Stage A only ($0: unit / DOM tests, the DWEB-7 recording proxy and the D2.tour
  step body against a locally served build on the committed corpus; no DB or API per ADR-126).
  **No owned preview** (`GD-PREVIEW.R7`). The re-pinned **D2.tour** is held `ready-to-flip`
  (P4-4); 250_R7DEP.2 walks it on the R7b phase preview and flips it on prod evidence. A live need
  outside 250's preview window PAUSES for the operator.
- **Production mutations:** none. Prod Stage B at the deployed R7b SHA belongs to 250_R7DEP.2.
- **Size budget:** M. About 350 changed lines, excluding screenshots and the regenerated side-effect
  table.

## Goal
The SPD guided tour (REQ-TOUR-2) runs end to end on the finished R7b surfaces:
- every step's route, target hook and placement points at the final DOM;
- the coach mark never covers its target;
- the demo path still makes zero reads and zero writes outside its allowlist, proven by re-running
  the DWEB-7 recording proxy over the final compositions;
- signed-in users reach the demo from the sidebar "Demo" item, which is a document navigation
  (S-14).

The D2.tour leg is green again on these surfaces, with per-step screenshots.

## Load (read these — do not re-read others)
- **Spec** `docs/round-7-draft-spec.md`:
  - §4.4 REQ-TOUR-2 (mechanics, copy rules, the 11-beat script), REQ-TOUR-4, REQ-TOUR-5,
    REQ-TOUR-8;
  - §4.3 REQ-DWEB-7 (the R7b re-run clause) and REQ-DWEB-16;
  - §3.3 S-6, S-7, S-8, S-10, S-14;
  - §3.2 ADR-128 (the REQ-GROWTH-12 bullet: non-modal, never auto-starts; the new regions);
  - §4.7 REQ-PANE-2 (breakpoint table), REQ-PANE-4 (tour targets are in the occlusion set),
    REQ-PANE-5;
  - §4.12 REQ-KEYS-1 (the tour's ←/→/Esc must not collide with the committed table);
  - §4.17 REQ-DACC-2, -5, -8 and the §10 owner map (D2.tour → R7DEM.6a / R7TOUR.2);
  - §5.5; §8.
- **Notes:**
  - R3 §4 (SPA side-effect inventory) and §2 (inputs outside the DataSource seam);
  - R4 §1 (the D2.tour leg shape: per-step coach mark, un-occluded target, Next/Back actionable,
    navigation mechanism). R4 names a different hero essay; the spec's SPD wins (spec §0);
  - REVIEW RV-10, RV-12, RV-29.
- **Records (gate words):** LEDGER § GATE DECISIONS `### Round 7` rows `GD-TOURSIGN.R7` and
  `GD-PREVIEW.R7`; 244's run record (any `D-R7COPY.1a-1` leaves routed here).
- **Anchors (re-confirm at build time):**
  - the tour step table and its selector-pinning unit test from 222_R7DEM.6a (path in
    `docs/build/runs/R7DEM.6a.md`);
  - the `demo` bucket in `apps/web/src/dom-contract.ts`;
  - the `demo.tour.*` leaves in `apps/web/src/copy.ts`, and `lintGrowthCopy` `FUNNEL_SCOPE`;
  - the recording proxy and regenerated side-effect table from 221_R7DEM.5 (path in
    `docs/build/runs/R7DEM.5.md`);
  - the AppShell sidebar from 226_R7SHELL.1a;
  - the `data-spa-native` guard in `apps/web/src/spa/nav-intercept.ts`;
  - the GUARD-3 named document-navigation exclusion list from 231_R7RELOAD.1;
  - `reserved-chords.json` from 239_R7WRITE.2;
  - in `packages/journeys/src/`: `steps.ts` (the D2.tour body), `registry.ts`, `settle.ts`
    (`settleClientNav` / `settleDocumentNav`) and `occlusion.ts` (`assertActionable`);
  - the snapshot files under `packages/demo-corpus/` from 219_R7DATA.1, for the verbatim file:line
    citations.

## In scope — deliverables
1. **Re-pin every step** (REQ-TOUR-2, REQ-DACC-5).
   - Each of the 11 beats gets its final `route`, `target` (a DOM-contract hook), `placement` and
     `advance` on the R7b surfaces:
     - beat 2 introduces the panels once, as sidebar | Page | right panel (ADR-128);
     - beat 5 lives in the right panel's Findings tab (REQ-PANE-5);
     - beat 6 lives in the claim-ledger section of the letter column;
     - beat 7 is the Figure 2 image in the Page and the Figures list (S-7);
     - beat 9 is What-changed (S-8);
     - beat 11 is the CTA.
   - Updates to the DOM contract land in the same change.
   - The pinning test holds: every step target is in the `demo` bucket and is emitted and asserted.
2. **Re-verify the mechanics on the final geometry** (REQ-TOUR-2, REQ-PANE-4).
   - The tour stays non-modal: no focus trap, free roam on exit, never auto-starts.
   - ←/→/Esc conflict with no entry in `reserved-chords.json`, and do not swallow the
     sidebar/panel keys (`[`, `]`).
   - Where a beat's target sits in a panel that is closed at that width (REQ-PANE-2), the step
     opens the panel (a scrimmed overlay or sheet) or retargets. It never points at a hidden or
     occluded node.
3. **Copy deltas** (REQ-TOUR-2, REQ-TOUR-5).
   - Change only the copy that a surface change forces.
   - Every quoted fragment stays verbatim from the snapshot, with its file:line listed in the PR.
   - Every count stays snapshot-derived (RV-29).
   - Demo role vocabulary per S-10; no efficacy phrasing; the launch-surface lint is green.
   - The PR lists each changed `demo.tour.*` leaf, before and after, because HUMAN-H15 signed the
     R7a wording. That list is the approval surface: the operator's merge of this PR approves it
     (`GD-TOURSIGN.R7`).
   - Any H15-signed `demo.*` leaf that 244 routed here under `D-R7COPY.1a-1` (a banned internal
     term, P4-24) is changed here, appears in the same before/after list, and its temporary lint
     allow entry is removed. `D-R7COPY.1a-1` closes with this PR.
4. **Deep links** (REQ-TOUR-8). Each step's `/demo/<essay>/…#hook` resolves on the final surfaces.
5. **Sidebar "Demo" entry** (REQ-TOUR-4 R7b part, REQ-DWEB-16, S-14).
   - It is a document navigation (`data-spa-native`), with a declared hook, a Lucide icon and a
     collapsed-state tooltip.
   - It is added by name to the GUARD-3 exclusion list.
   - A DOM test proves it navigates by document.
   - A journey assertion proves that entering from a signed-in SPA page yields a fresh document
     carrying `boot.demo`, and that the workspace QueryClient is not shared.
   - REQ-SHELL-2 (226) lists Demo among the sidebar contents. If 226 already emitted the item, this
     ticket verifies and completes it rather than adding a second one.
6. **DWEB-7 re-run** (REQ-DWEB-7, ADR-126, spec §8.1).
   - The recording proxy walks every `DEMO_ROUTE_ID` over the final compositions, including the
     sidebar, right panel, palette, chat tab, and hover/focus prefetch. It fails on any request
     outside the allowlist: GETs to demo twins and assets, plus the REQ-TOUR-9 POST.
   - The regenerated side-effect table is committed.
   - Any R7b leak is gated in demo mode through the existing ReadOnlyProject / `demoDataSource`
     seams. Examples: recent projects, the Inbox badge, the credits balance, `GET /search`, a chat
     send, a `PREFETCH_SAFE` prefetch outside demo twins, a `CLIENT_ANALYTICS_EVENTS` emission.
7. **D2.tour on the final surfaces** (REQ-DACC-1, REQ-DACC-2).
   - Update the step body: per-step coach-mark text, an un-occluded target, Next/Back actionable,
     the declared navigation mechanism, and the end on `/signup?src=demo` (logged out) or "New
     project" (logged in).
   - The re-pinned body passes against a locally served build at 1440×900, 1024×768 and 390×844
     (emulated), with a local screenshot per step in the run record (Stage A).
   - **Nightly hazard** (209's note; 222's precedent; P4-4). Prod serves R7a surfaces until 250
     deploys, and this PR reaches `main` first, so a green-expected re-pinned D2.tour would fail the
     nightly against R7a. Hold the re-pinned leg as `ready-to-flip` (Stage-A evidence attached),
     and record that 250_R7DEP.2 walks it on the phase preview and flips it on prod evidence.
   - D2.tour's single owner is 222_R7DEM.6a; this row re-flips it under 209's recorded sanction
     (P4-23). If any R7b ticket re-registered D2.tour `expected:"red"`, 250 flips it back on prod
     evidence (`packages/journeys/AGENTS.md` § Code Conventions).

## Out of scope
- The tour step schema and the R7a tour: 222_R7DEM.6a owns them.
- The demo DOM-contract bucket's design: 220_R7DEM.4 / 221_R7DEM.5.
- ReadOnlyProject's design: 211_R7RO.1.
- The occlusion guard in CI: 249_R7GUARD.1. This ticket supplies the final tour-target list it
  consumes.
- The keymap table: 239_R7WRITE.2.
- Prod deploy, CDN invalidation and prod Stage B: 250_R7DEP.2.
- The landing hero recording: 249a_R7PUB.1 lands the slot; 250_R7DEP.2 captures and commits the
  recording from its phase preview (REQ-PUB-2).

## Acceptance criteria
- [ ] Every step's target is a declared `demo` hook that is emitted and asserted. The pinning test
      fails if a target is renamed or dropped. `check:dom-contract` is green. *(deterministic ·
      layer: engineered)*
- [ ] A DOM test proves the tour is non-modal: no focus trap, Esc exits to free roam, no auto-start
      in a signed-in first session. A test fails if a tour key collides with
      `reserved-chords.json`. *(deterministic · layer: engineered)*
- [ ] Every quoted fragment in a changed `demo.tour.*` leaf matches its snapshot file:line, and
      every count is computed from the snapshot. The PR lists each changed leaf before and after.
      *(deterministic · layer: fixture-verified)*
- [ ] The sidebar Demo item is a document navigation. A DOM test and a journey assertion show a
      fresh document with `boot.demo` and no shared QueryClient. It is on the GUARD-3 exclusion
      list by name. The journey assertion runs against a local build here; its deployed half rides
      `D-R7TOUR.2-1`. *(deterministic · layer: engineered)*
- [ ] The DWEB-7 recording proxy is green over every `DEMO_ROUTE_ID` on the final compositions,
      with zero requests outside the allowlist. The regenerated side-effect table is committed. A
      seeded off-allowlist request makes the proxy fail. *(deterministic · layer: fixture-verified)*
- [ ] **D2.tour, Stage A.** The re-pinned body passes against a locally served build at the three
      widths, held `ready-to-flip` → 250_R7DEP.2. D1.hub, D3.readonly, R\*.demo and P1.demo pass
      locally as regression (not owned here). Any regression in a demo-path seam is fixed here; any
      other regression becomes an `F-R7TOUR.2-n` row. *(deterministic · layer: fixture-verified)*
- [ ] **Stage B — staging-verified at the R7b phase preview (250).** No preview is stood up here
      (`GD-PREVIEW.R7`). This ticket opens `D-R7TOUR.2-1` (kind P; owner 250_R7DEP.2; dated from
      `date -u`; unblocked by: 250's preview walk; how to verify: D2.tour green at 250's preview
      SHA with `--expect-sha`, a screenshot per step at the three widths, and the sidebar Demo
      entry's fresh-document journey assertion, committed under `docs/build/runs/R7TOUR.2/`). 250
      closes the row and flips D2.tour on prod evidence. This PR reports the AC owed, never green.
      *(agentic · layer: staging-verified at the R7b phase preview (250))*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-TOUR-2 (R7b re-pin), REQ-TOUR-4 (sidebar Demo, the R7b part), REQ-TOUR-5, REQ-TOUR-8,
REQ-DWEB-7 (R7b re-run), REQ-DWEB-16, REQ-DACC-2, REQ-DACC-5 (D2.tour re-flip, under REQ-DACC-1/8)

## Cross-cutting invariants
- Manifest § Cross-cutting invariants:
  - 1 (vocabulary);
  - 9 (no superiority claim);
  - 12 (verified by walking it: preview provenance = this tip);
  - 13 (tenant isolation: the demo makes no tenant read);
  - 17 (context budget; no preview is created here, per `GD-PREVIEW.R7`).
- Spec §8:
  - 8.1 (the demo path makes no API/DB read; the TOUR-9 insert is the only exception);
  - 8.3 (copy and role vocabulary; essay content is data);
  - 8.4 (DOM-contract updates in the same change; a skipped leg is reported skipped);
  - 8.5 (`check:spa-budget`, `spa-env`, `dom-contract` and `no-cookies` stay green);
  - 8.7.

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules` 1–10. The gap table has one row per
  clause.
- Rule 3: this row reaches `engineered` / `fixture-verified`; the preview walk
  (`staging-verified`) and the prod flip (`live-executed`) are R7DEP.2's.
- Rule 5: `GD-TOURSIGN.R7`'s words are recorded verbatim in the PR body beside the changed-leaf
  list.
- No preview is stood up here (`GD-PREVIEW.R7`). A live need outside 250's preview window PAUSES
  for the operator (gotcha 7).

## Notes
- **Owns:** the D2.tour re-flip on R7b surfaces; the sidebar Demo item's document-navigation wiring;
  the round-7 R7b regeneration of the side-effect table.
- **Consumes:**
  - the step schema (222);
  - ReadOnlyProject (211);
  - the demo DOM bucket (220/221);
  - the keymap rules (226) and the full table (239);
  - `paneLayout()` and the breakpoints (229).
- **Leak-fix bound.** A demo-mode leak found in deliverable 6 is fixed here when the fix is a gate in
  the existing seam. If it needs a new seam or more than about 100 lines, stop and request an insert
  row rather than stretching (manifest invariant 17).
- **Copy sign-off (`GD-TOURSIGN.R7`).** The operator ruled "Read the diff at merge (Recommended)":
  every changed `demo.tour.*` leaf is listed before/after in the PR, the operator's merge is the
  approval, and no new HUMAN row exists. If the operator asks for a re-sign, that is a new ruling,
  recorded verbatim.
- **H16 timing.** Because H16 now happens in 250's window (after this row), an H16 finding that
  moves a tour target becomes an insert row that re-runs this row's pinning test; it is not
  absorbed here.
- **DEFERRALS.** Read first (gotcha 1). `D-R7TOUR.2-1` (Stage B → 250, `GD-PREVIEW.R7`) is opened
  by design under `## R7TOUR.2`; any other leg that cannot run locally gets its own `D-R7TOUR.2-n`
  row there, unblocked by R7DEP.2's preview walk. `D-R7COPY.1a-1`, if 244 opened it, closes here.
