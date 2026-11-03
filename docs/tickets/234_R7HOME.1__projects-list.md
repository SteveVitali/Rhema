# R7HOME.1 — Projects list (flat, recent, attention only when non-empty) + KIT-3 batch c1 (list, inbox)

- **Sequence:** 234 of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:**
  - 226_R7SHELL.1a: the list renders inside the AppShell and uses 225's DropdownMenu, Tooltip,
    Toast and Badge through that chain. In the stack it follows 227, which removed this surface's
    leaf header.
  - 225a_R7KIT.2b: TextField and EmptyState, and the GUARD-1 rule and its enablement list that
    batch c1 appends to.
  - This row merges after 224 (spec §5.1).
- **Run:** `implement-spec spec=docs/tickets/234_R7HOME.1__projects-list.md`
- **Gate status:** none
- **Live stage:** Stage A only ($0: unit, DOM and integration tests plus a local build). No owned
  preview (`GD-PREVIEW.R7`). Stage B is staging-verified at the R7b phase preview (250_R7DEP.2)
  through a DEFERRALS row, and prod Stage B rides 250. Any need for a live preview outside 224's
  and 250's windows → PAUSE for the operator.
- **Production mutations:** none
- **Size budget:** ~700 changed lines excl. generated/fixtures (M). Entry-delta allowance ≤ 15 kB
  gz (REQ-KIT-5), with the actual figure stated in the PR.

## Goal
`/app` stops hiding the writer's work. It becomes a flat, always-expanded list sorted by last edit
[A1, A10]. "Waiting on you" and "Running" are pinned above the list only when they are non-empty.
"QUIET", "Unfiled" and "Sheet" chips are retired. One compact toolbar applies filters instantly.
Each row has one hover action plus a ⋯ menu, and lifecycle actions are optimistic with Undo. The
list and the Inbox move onto the primitives (KIT-3 batch c1), and REQ-GUARD-1 is enabled for
their files.

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md`:
  - §3.1 `GD-UX-HOME-LIST.R7`; §3.2 ADR-128 (REQ-IDE-4 / REQ-IDE-6 items);
  - §4.9 REQ-HOME-1; §4.6 REQ-KIT-3 (batch c1) and REQ-KIT-5; §4.16 REQ-GUARD-1;
  - §7 (A6/A8 are fixed by HOME-1); §8.2.
- R6 `…/R6-ux-code-audit.md` §5 (the QUIET filing), UXC-17 and Q1. R5
  `…/R5-ux-browser-audit.md` A1, A2, A3, A5 (list part), A6, A7, A8, A9, A10, A11, and D2 (inbox
  controls only; notice markdown is 245's).
- Anchors (re-confirm at build time):
  - **API:** `apps/api/src/project-list.ts`. `ProjectGroupKey` is at ≈:23; `projectGroupKey` at
    ≈:130 makes `quiet` the fallback; `listProjectStates` is at ≈:335.
  - **State map:** `apps/web/src/state-map.ts` ≈:174-213. It holds the hard-coded
    `GROUP_LABELS`, the collapsed-quiet rule and the "N Unfiled · M with a Voice" summary;
    `groupByVoice` follows at ≈:216.
  - **List UI:** `packages/ui/src/project-list.tsx` (`ProjectRow` ≈:179, `ProjectGroupList`
    ≈:340, `VoiceGroupList` ≈:427, uppercase header ≈:315, hard-coded "Project actions" and
    "· Show"/"· Hide").
  - **Home surface:** `apps/web/src/spa/surfaces/project-home.tsx`. The filter form and its Apply
    buttons are at ≈:299-329. The POST forms are `/app/grouping` and the row menu's
    `/p/:slug/{archive,unarchive,duplicate,delete}`. Broad invalidation is
    `invalidateQueries(["bff"])` at ≈:207.
  - **Other:** `apps/web/src/spa/surfaces/inbox.tsx`; `apps/web/src/spa/search.ts`
    (`validateSearch` narrowing); the shared estimate source for row ⋯ paid items (re-confirm
    `apps/api/src/surface-estimates.ts`); `apps/web/src/dom-contract.ts`; the list/inbox steps in
    `packages/journeys/src/steps.ts`.
- Primitives: 225's DropdownMenu, Tooltip, Toast and Badge; 225a's TextField and EmptyState.
  Also 225a's GUARD-1 rule and its enablement list; `apps/web/AGENTS.md`;
  `docs/tickets/00_MANIFEST.md` § Cross-cutting invariants and § Operating rules;
  `docs/tickets/DEFERRALS.md`.

## In scope — deliverables
1. **Flat list** (REQ-HOME-1) [A1, A7, A9, A10].
   - Always expanded, sorted by last edit.
   - A row shows title, protocol, voice (only if set), version and state, last edited, and a
     status dot with a legend tooltip.
   - "Waiting on you" and "Running" sections render only when non-empty.
   - "QUIET", "Unfiled" and "Sheet" chips are retired, and the remaining labels move to COPY.
   - The api keeps deriving its group key; "quiet" is no longer a rendered label.
2. **Toolbar** (REQ-HOME-1) [A3, A8, UXC-17].
   - Search, a filter menu (protocol, voice, archived, recently deleted), a sort menu, and an
     optional remembered Group-by on the existing grouping preference.
   - Filters apply instantly with no Apply buttons; the no-JS submit stays inside `<noscript>`.
   - Only non-default params go in the URL, and `?archived` encodes cleanly [A11].
3. **Row actions** (REQ-HOME-1) [A7, A11].
   - One hover action (Open) plus a ⋯ DropdownMenu.
   - Paid items show estimates from the shared estimator and **open the run sheet**. The sheet
     stays the only run creator.
   - Archive, unarchive, duplicate, delete and restore are optimistic, with an Undo toast.
   - Invalidation is scoped, not `["bff"]`. Disabled no-op items are not shown.
4. **KIT-3 batch c1** (REQ-KIT-3; REQ-GUARD-1).
   - The project list and Inbox controls migrate to the primitives, with DOM-contract hooks
     preserved.
   - REQ-GUARD-1 is enabled for `packages/ui/src/project-list.tsx` and
     `apps/web/src/spa/surfaces/{project-home,inbox}.tsx`.
5. **ADR-128 banner.** A dated REQ-IDE-4 / REQ-IDE-6 banner in `docs/rhema-design-spec.md` § 5.2:
   - the flat list;
   - attention sections only when non-empty;
   - Group-by is opt-in;
   - "Quiet" retired as a label;
   - new projects stay Unfiled in the voice taxonomy.

## Out of scope
- New-project creation behaviour (REQ-HOME-3): 236. Inbox notice markdown rendering
  (REQ-COPY-3): 245.
- The banned-term lint (REQ-COPY-6 / REQ-GUARD-2): 244. This ticket only removes the strings it
  touches.
- Global GUARD-1 enablement: 249. Signed-in pricing: 249a_R7PUB.1.

## Acceptance criteria
- [ ] With a fixture of mixed projects, all rows are visible on load, no group is collapsed, and
      no "QUIET", "Unfiled" or "Sheet" text renders. The attention sections are absent when
      empty and present when not. *(deterministic · layer: engineered)*
- [ ] Filter, sort and search apply without an Apply click. The URL carries only non-default
      params (round-trip test). *(deterministic · layer: engineered)*
- [ ] Archive is applied optimistically and Undo restores the row. The test fails if Undo is
      removed. A failed mutation rolls back with an error toast.
      *(deterministic · layer: engineered)*
- [ ] Paid ⋯ items show the shared estimator's figure (from a fixture) and open the run sheet. No
      row action creates a run directly. *(deterministic · layer: engineered)*
- [ ] REQ-GUARD-1 is enabled for the three files and `pnpm turbo lint` is green.
      `check:dom-contract` is green. The entry delta is ≤ 15 kB gz and reported.
      *(deterministic · layer: engineered)*
- [ ] **Stage B is staging-verified at the R7b phase preview (250_R7DEP.2)** (`GD-PREVIEW.R7`: no
      per-ticket preview). This ticket opens a dated `DEFERRALS.md` row (`D-R7HOME.1-n`, owner
      250). The row names what 250 captures:
      - on a workspace with at least 6 projects, at the preview SHA (`--expect-sha`): the flat
        list, a filter, a sort, and archive followed by Undo;
      - no native-styled control visible on `/app` or `/app/inbox`;
      - screenshots of each.

      Unblock: 250's preview walk. Compensating control: the Stage-A tests above.
      *(agentic · layer: engineered here; staging-verified and live-executed at 250)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-HOME-1, REQ-KIT-3 (batch c1), REQ-GUARD-1 (enabled for batch c1 files), REQ-KIT-5 (allowance)

## Cross-cutting invariants
- Manifest § Cross-cutting invariants:
  - 1;
  - 11 (the run sheet is the only run creator and the only paywall);
  - 13 (lifecycle writes stay tenant-scoped);
  - 14 (estimates from the one estimator);
  - 12, 17.
- Spec §8: 2 (numbers sourced; value claims round down), 3, 4, 5, 7.

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`; the gap table has one row per clause.

## Notes
- **Decisions this ticket owns:**
  - the row anatomy and status-dot legend;
  - the toolbar shape;
  - the optimistic/Undo pattern, which later batches reuse;
  - the scoped query keys for the list.
- **Shared decisions consumed:** the primitives (225, 225a) and the GUARD-1 mechanism (225a);
  AppShell (226); header removal (227).
- **Restore after delete.** If the "recently deleted" restore endpoint is absent, the delete Undo
  uses the existing un-delete path. If there is none, open a DEFERRALS row; do not invent a
  destructive shortcut.
