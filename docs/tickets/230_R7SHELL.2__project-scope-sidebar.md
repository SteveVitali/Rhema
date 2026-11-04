# R7SHELL.2 — Project scope in the sidebar; Files becomes the project tree; IDE rails removed

- **Sequence:** 230 of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 229_R7PANE.1. The SplitPane layout's left column is where the project tree
  lives, and the rail and Files columns are removed from its geometry. 225a's primitives are
  reached through 229; this ticket needs only 225's Badge and Tooltip directly.
  This row merges after 224 (spec §5.1).
- **Run:** `implement-spec spec=docs/tickets/230_R7SHELL.2__project-scope-sidebar.md`
- **Gate status:** none
- **Live stage:** Stage A only ($0: unit and DOM tests plus a local build). No owned preview
  (`GD-PREVIEW.R7`). Stage B is staging-verified at the R7b phase preview (250_R7DEP.2) through a
  DEFERRALS row, and prod Stage B rides 250. Any need for a live preview outside 224's and 250's
  windows → PAUSE for the operator.
- **Production mutations:** none
- **Size budget:** ~550 changed lines excl. generated/fixtures (M). Entry-delta allowance ≤ 15 kB
  gz (REQ-KIT-5), with the actual figure stated in the PR.

## Goal
Inside a project, the sidebar's current-project entry expands into Page, Outline, Figures,
Versions, Reviews, Export and Project settings. The Files pane becomes that entry's expanded
tree. The IDE's icon rail and its second 36 px Files rail are deleted, not just hidden. The user
then sees one left column with a project name on it, instead of two cryptic glyph rails [B3].

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md` §3.2 ADR-128 (REQ-IDE-2), §4.5 REQ-SHELL-4 (and -2 for the item
  layout), §4.6 REQ-KIT-5, §5.4, §8.
- R6 `…/R6-ux-code-audit.md` §3 (the IDE row), §6.2 (glyph icons), UXC-10, UXC-26 (the icons
  part) and UXC-30 (the hard-coded "Files"). R5 `…/R5-ux-browser-audit.md` B3 and B10.
- Anchors (re-confirm at build time):
  - **Files and versions:** `packages/ui/src/files-pane.tsx` (hard-coded "Files" ≈:116) and
    `packages/ui/src/version-rail.tsx`.
  - **The rails:** `packages/ui/src/ide-shell.tsx`. The rail markup is suppressed since 226; the
    Files strip is still there.
  - **Files data:** `apps/web/src/spa/ide/chrome-data.tsx`, where leaves publish it.
  - **Geometry:** the rail and files rules in `packages/tokens/src/ide-css.ts`; the `rail` and
    `files` widths in `packages/tokens/src/tokens.ts` `LAYOUT`.
  - **Pane state and keymap:** `packages/ide/src/state.ts` (`filesOpen`, `filesWidth`) and
    `packages/ide/src/keymap.ts` (the `pane: "files"` action).
  - **Contract:** `apps/web/src/dom-contract.ts` (the rail and Files hooks).
- 226's sidebar (recent projects, item layout); 229's SplitPane geometry and pane codec;
  `apps/web/AGENTS.md`; `docs/tickets/00_MANIFEST.md` § Cross-cutting invariants and § Operating
  rules; `docs/tickets/DEFERRALS.md`.

## In scope — deliverables
1. **Project section** (REQ-SHELL-4). In project scope the current project's sidebar entry
   expands into Page (the head draft), Outline, Figures, Versions, Reviews, Export and Project
   settings.
   - All items are SPA links with an active state.
   - When the sidebar is collapsed, they show as icon plus tooltip.
   - Write-only items honour ReadOnlyProject (211).
   - The current project is not repeated in Recent projects.
2. **Files tree** (REQ-SHELL-4).
   - The Files pane's content (its outline / drafts / rounds groups) renders as the expanded tree
     under the project entry, with tree roles and keyboard navigation.
   - Lucide icons replace glyphs, and a frozen/working Badge replaces the lock glyph on every row
     [B10].
   - The "Files" label moves to COPY [UXC-30].
   - It renders whatever "outline exists" source the files data carries. Coherence with the
     outline route is 236's (REQ-HOME-6).
3. **Removal.**
   - Delete the IDE icon rail code and the 36 px Files strip from `ide-shell.tsx` and
     `ide-css.ts`, along with their `LAYOUT` widths.
   - Drop the files pane fields from the pane state, with a tolerant codec read.
   - Remove the `files` pane action from the keymap and update `reserved-chords.json`.
   - Update the `paneLayout()` inputs: the sidebar width replaces rail + files.
4. **DOM contract and journeys.**
   - Rail and Files hooks are retired or migrated in the same change, and tree hooks are added.
   - Every R7a tour target hook stays resolvable, by keeping or aliasing it, until 248.
   - The U1.shell walk is extended so each of the seven project items is reached from the Page.
     Its steps pass their Stage-A tests, and the leg stays held `ready-to-flip` for 250 (nightly
     hazard).

## Out of scope
- "Outline exists" coherence and the Project settings page content: 236_R7HOME.2b.
- The Versions/compare surfaces themselves, and their KIT migration: 243. The export surface and
  its migration: 241.
- The sidebar Demo entry: 248. The full keymap: 239.

## Acceptance criteria
- [ ] No IDE route renders the icon rail or the Files strip in its DOM. A test fails if either
      is reintroduced. *(deterministic · layer: engineered)*
- [ ] Each of the seven project items navigates by SPA navigation with the correct active state.
      In a ReadOnlyProject, write-only items are hidden or disabled with their reason.
      *(deterministic · layer: engineered)*
- [ ] The Files tree is keyboard-navigable (tree role tests) and shows Badges, not lock glyphs.
      *(deterministic · layer: engineered)*
- [ ] Reading a pre-change pane blob does not throw and yields defaults for the removed keys. The
      reserved-chords checker is green. *(deterministic · layer: engineered)*
- [ ] `check:dom-contract` is green; every R7a tour target resolves; the entry delta is ≤ 15 kB
      gz and reported. *(deterministic · layer: engineered)*
- [ ] **Stage B is staging-verified at the R7b phase preview (250_R7DEP.2)** (`GD-PREVIEW.R7`: no
      per-ticket preview). This ticket opens a dated `DEFERRALS.md` row (`D-R7SHELL.2-n`, owner
      250). The row names what 250 captures:
      - the extended U1.shell walk passing at the preview SHA (`--expect-sha`);
      - screenshots of the expanded project section at 1440×900, expanded and with the sidebar
        collapsed.

      Unblock: 250's preview walk. Compensating control: the Stage-A tests above.
      *(agentic · layer: engineered here; staging-verified and live-executed at 250)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-SHELL-4, REQ-KIT-5 (allowance)

## Cross-cutting invariants
- Manifest § Cross-cutting invariants 1, 12, 17.
- Spec §8: 3 (copy), 4 (DOM contract in the same change), 5 (budgets), 7 (sizing).

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`; the gap table has one row per clause.

## Notes
- **Decisions this ticket owns:** the order and icons of the project items, the tree hook names,
  and the removal of the files pane state.
- **Shared decisions consumed:**
  - the sidebar structure and the U1 walk (226);
  - SplitPane geometry and the pane codec (229);
  - ReadOnlyProject (211);
  - the demo-boot variant (226). In a demo boot the project section renders only from the demo
    twins and issues no workspace read.
- **Tour targets.** This ticket touches tour targets, so 248 depends on it (spec §5.5).
