# R7WRITE.1a — Format bubble + page header strip

- **Sequence:** 237 of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:**
  - 230_R7SHELL.2: the header strip sits above the paper in the project-scope layout that 230
    finishes on top of 229's SplitPane. The bubble's agent group routes through the right panel
    229 provides.
  - 227_R7SHELL.1b: the `Project › Surface` breadcrumb the strip consumes (declared per Phase-4
    P4-15; formerly row-order reliance).
  - 228_R7SHELL.1c: ⌘K with no selection falls through to its global palette (P4-15).
  - Spec §10 row 237 (†, split from RV-24's row 220). Merges to `main` wait for 224_R7DEP.1
    (spec §5.1).
- **Run:** `implement-spec spec=docs/tickets/237_R7WRITE.1a__format-bubble-header-strip.md`
- **Gate status:** none. Code + tests; `mergePolicy: OPERATOR`.
- **Live stage:** Stage A only ($0: unit / DOM / geometry tests and local builds). **No owned
  preview** (`GD-PREVIEW.R7`). The Stage-B AC is owed to the R7b phase preview in 250_R7DEP.2
  through a DEFERRALS row. A live need outside 250's preview window PAUSES for the operator.
- **Production mutations:** none
- **Size budget:** ~550 changed lines excl. generated/fixtures (M). The entry-delta allowance is
  ≤ 15 kB gz (REQ-KIT-5); report the actual figure.

## Goal
The writing surface gets real formatting and real chrome:
- A floating **format bubble** appears above any selection. It never covers the selected lines,
  and it replaces today's agent-only popover that opens underneath.
- A **page header strip** sits above the paper and holds the breadcrumb, the version chip, the
  sync state, the ReadOnlyProject notice and the project actions.
- Product chrome stops being typeset inside the document card.

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md`:
  - §4.10 (REQ-WRITE-1, REQ-WRITE-6; WRITE-3 is BACKLOG);
  - §4.12 Rule 4 (contextual ⌘K);
  - §4.6 REQ-KIT-2/5;
  - §3.3 S-3 (ReadOnlyProject);
  - §5.5 (tour targets);
  - §8;
  - §10 rows 237/238/239.
- `docs/build/planning/2026-11-03_r7-demo/R6-ux-code-audit.md` §6.3 (editor ergonomics), §9
  UXC-22 and UXC-24, §10 WP9.
- `R5-ux-browser-audit.md` B4, B5, B8, B11 and I6.
- `apps/web/AGENTS.md` and `packages/journeys/AGENTS.md`.
- LEDGER § GATE DECISIONS `### Round 7` row `GD-PREVIEW.R7`.
- `docs/tickets/DEFERRALS.md`, the round-7 sections (gotcha 1).
- `docs/tickets/00_MANIFEST.md` § Cross-cutting invariants and § Operating rules.
- Anchors (re-confirm at build time):
  - `packages/ide/src/menus.ts` `selectionMenuItems()`, which ships the "not available yet"
    Line edit and Cut to length items;
  - `apps/web/src/spa/ide/controller.ts`, around `:834`: `openCmdMenu(…, rect.bottom + 8, "selection")`,
    the below-selection placement;
  - `packages/editor/src/plugins.ts` `pagePlugins()` keymap and `schema.ts` marks/nodes
    (`link`, `heading`, `blockquote`, `list`);
  - `packages/ui/src/page-editor.tsx:317-430`: `bannerStyle`, `data-sync-pill`,
    `data-page-banner="version|lock|readonly"`, and the proposal cards inside the paper;
  - `apps/web/src/page-chrome.tsx` project action link row (`COPY.project.*`, around `:470-490`);
  - `apps/web/src/spa/page-mount.tsx`;
  - `apps/web/src/dom-contract.ts`.

## In scope — deliverables
1. **Format bubble** on a non-collapsed Page selection (REQ-WRITE-1; UXC-22, I6).
   - It is placed **above** the selection and flips only when there is no room. It never
     intersects the selected lines' rects.
   - Group 1 is Bold, Italic, Link, H2, H3, Quote, Bulleted and Numbered, as PM commands over the
     existing schema.
   - Group 2 holds the agent actions. Each carries a cost hint from the shared estimator and routes
     to the run sheet (invariant 11; REQ-CHAT-25: no item POSTs).
   - The "not available yet" items are removed, not disabled.
   - Esc dismisses the bubble and returns focus to the selection.
   - Leading slot: `selectionMenuItems()`'s model gains the first-item slot that 238 fills with
     **Comment**. No dead item renders before then.
2. **Contextual ⌘K = Link** while a Page selection exists, and the palette otherwise (REQ-KEYS-1
   Rule 4; REQ-WRITE-1). It is implemented in the dispatcher's `page` zone; 239 pins it in the table.
3. **Page header strip** above the paper (REQ-WRITE-6; B4, B5, B11, UXC-24).
   - Contents:
     - the breadcrumb (consumes 227's `Project › Surface` breadcrumb);
     - a version chip with a frozen/working badge;
     - the one sync indicator, moved out of the paper (ADR-049's single indicator is preserved);
     - the ReadOnlyProject notice (consumes 211);
     - actions: **Run ▾** with estimates from the shared estimator, **Export**, and **⋯**.
   - The proposal cards and the version/lock banners move out of `.paper`.
   - Banners use an informational style, never input-like (B5).
   - There is no card-in-card border at the page measure (B11).
   - The `page-chrome.tsx` hyperlink action row ("Import a draft · Run review · Export · Edit
     source") is replaced by the strip's actions. **Edit source** survives until 239 removes it.
   - B8's false-affordance chips are fixed in passing, because Run ▾ is a real menu.
4. **ReadOnlyProject conformance** (S-3; REQ-DWEB-14 consumed). For `demo`, `showcase` and
   `run_lock` the bubble shows neither formatting nor agent items. The strip hides or disables every
   write action *before* any request, with the reason's one notice. Demo pages issue zero non-GET
   (DACC-3).
5. **DOM contract.** New hooks (`data-format-bubble`, `data-page-header`, etc.) are declared in
   `dom-contract.ts`, emitted and asserted. Existing `data-sync-pill` / `data-page-banner*` hooks
   keep their contract or are renamed in the same change (spec §8.4). Tour-target hooks in the demo
   bucket (220/221) are kept. Any moved target is recorded for 248.

## Out of scope
- The Comment item, anchored Guidance, the fork toast and Undo (238_R7WRITE.1b).
- Source-mode wrap, the Rich text / Source toggle, removing "Edit source", the paper theme from
  boot, the full keymap table and the generated shortcut hints (239_R7WRITE.2).
- Focus-mode exit (212_R7FIX.1, landed in R7a).
- Migrating the IDE's remaining raw controls (243_R7KIT.3d). This ticket uses the 225 primitives
  for everything it adds or moves.
- The slash menu (REQ-WRITE-3 → BACKLOG). Word-level diff marks (`GD-UX-P1-BACKLOG.R7`).

## Acceptance criteria
- [ ] The bubble opens above the selection. A DOM/geometry test asserts that its rect does not
  intersect the selection's client rects at top-of-page, mid-page and bottom-of-viewport
  selections, and that it flips only when there is no room above. *(deterministic · layer:
  engineered)*
- [ ] Each formatting item applies its mark/node to the selection: Bold, Italic, Link (via the
  bubble and via ⌘K-with-selection), H2, H3, Quote, Bulleted and Numbered. Each has a PM-state test,
  and the collab-bound state has one too. ⌘K with no selection still opens the palette.
  *(deterministic · layer: engineered)*
- [ ] Agent items carry estimator-sourced cost hints and open the run sheet with no POST. No
  "not available yet" item renders. Esc dismisses and restores the selection. *(deterministic ·
  layer: engineered)*
- [ ] The header strip renders the breadcrumb, version chip (frozen/working), sync state,
  ReadOnlyProject notice and Run ▾ / Export / ⋯ above the paper. `.paper` contains no banner,
  pill or proposal card. A component test asserts both. *(deterministic · layer: engineered)*
- [ ] Under `ReadOnlyProject{demo|showcase|run_lock}`, the bubble has no write or agent items and
  the strip's write actions are absent or disabled, with the reason notice. A request spy records
  zero non-GET. *(deterministic · layer: engineered)*
- [ ] `check:dom-contract`, `check:spa-budget` (entry delta ≤ 15 kB gz, reported), `spa-env`,
  `protocol-markers` and the vocab lints are green. *(deterministic · layer: engineered)*
- [ ] **Stage B — staging-verified at the R7b phase preview (250).** No preview is stood up here
  (`GD-PREVIEW.R7`). This ticket opens `D-R7WRITE.1a-1` (kind P; owner 250_R7DEP.2; dated from
  `date -u`; why deferred: "GD-PREVIEW.R7 — Stage B rides the R7b phase preview"; unblocked by:
  250's preview walk; how to verify: these screenshots at 250's preview SHA, `--expect-sha`,
  provenance PASS on web + api, committed under `docs/build/runs/R7WRITE.1a/`):
  - the bubble above a selection;
  - the header strip at 1440 and at 1024;
  - a read-only Showcase Page with no bubble write items (B4, B5, B11, I6 states).

  250 closes the row. This PR reports the AC owed, never green. *(agentic · layer:
  staging-verified at the R7b phase preview (250))*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-WRITE-1, REQ-WRITE-6; REQ-KEYS-1 (Rule 4, contextual ⌘K only); consumes REQ-DWEB-14 and
REQ-KIT-2; REQ-KIT-5 (allowance). Findings discharged: UXC-22, UXC-24, B4, B5, B11, I6 (B8 in
passing).

## Cross-cutting invariants
- Manifest § Cross-cutting invariants:
  - 1 (vocabulary lint);
  - 9 (copy rules);
  - 11 (the run sheet is the only launcher; the bubble never POSTs);
  - 12 (verified by walking it);
  - 14 (cost hints from the one estimator);
  - 17 (context budget; no preview is created here, per `GD-PREVIEW.R7`).
- Spec §8:
  - .2 (no money change; estimator-sourced numbers);
  - .3 (copy, reserved strings);
  - .4 (DOM contract in the same change; Stage B at the head SHA; skipped legs reported);
  - .5 (budgets);
  - .7 (≤ M).

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules` (1–10). The gap table has one row per
  clause.
- No preview is stood up in this ticket (`GD-PREVIEW.R7`). A live need outside 250's preview
  window PAUSES for the operator (gotcha 7).

## Notes
- **Owns:**
  - the bubble placement rule (above, flipping only for lack of room);
  - the bubble item model, including the reserved first slot for 238;
  - the header-strip composition and its DOM hooks;
  - the contextual-⌘K behaviour (the table entry itself is 239's).
- **Consumes:**
  - 225/225a's primitives (DropdownMenu/Tooltip/IconButton from 225, Popover from 225a; any heavy
    primitive loads in a leaf chunk per REQ-KIT-5);
  - 227's breadcrumb and 228's palette fall-through (declared dependencies, P4-15);
  - 211's ReadOnlyProject;
  - 229/230's layout;
  - the shared estimator.
- **Tour:** the page header strip and the bubble are R7TOUR.2 targets (§5.5). Keep the demo-bucket
  hooks stable and list every moved target in the run record for 248.
- **DEFERRALS:** `D-R7WRITE.1a-1` (Stage B → 250's R7b phase preview walk, `GD-PREVIEW.R7`) is
  opened by design. The B AC is never claimed green here.
