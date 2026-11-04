# R7WRITE.2 — Source mode wrap + one toggle, paper theme from boot, the full browser-safe keymap

- **Sequence:** 239 of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 238_R7WRITE.1b. The Rich text / Source toggle lives in 237's header strip, and
  this ticket re-points 238's U5 source step. The keymap rules, the `reserved-chords.json` schema
  and checker, the sidebar and panel chords, and the generated cheat sheet and tooltips already
  landed in 226_R7SHELL.1a (spec §5.4, RV-33). This ticket extends them. Spec §10 row 239.
  Merges to `main` wait for 224_R7DEP.1 (spec §5.1).
- **Run:** `implement-spec spec=docs/tickets/239_R7WRITE.2__source-theme-keymap.md`
- **Gate status:** none. Code + tests; `mergePolicy: OPERATOR`.
- **Live stage:** Stage A only ($0: unit / DOM / shell tests, the U5 step body against a local
  build). **No owned preview** (`GD-PREVIEW.R7`). The Stage-B AC is owed to the R7b phase preview
  in 250_R7DEP.2 through a DEFERRALS row. U5.write stays `ready-to-flip` for 250 (238 owns it). A
  live need outside 250's preview window PAUSES for the operator.
- **Production mutations:** none
- **Size budget:** ~550 changed lines excl. generated/fixtures and the committed JSON table (M).
  Entry delta ≤ 15 kB gz.

## Goal
Three things change for the writer:
- Source mode reads like prose: it soft-wraps, uses prose typography, and has one clear toggle.
- The paper theme is correct from the first paint.
- Every keyboard shortcut is safe in every supported browser, and every shortcut is shown where it
  can be used.

The keymap stops colliding with browser chords. 226's committed `reserved-chords.json` and its
checker are extended to the complete binding table, which makes that permanent.

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md`:
  - §4.10 REQ-WRITE-5, REQ-WRITE-8;
  - §4.12 REQ-KEYS-1 (Rules 1–5) and REQ-KEYS-2;
  - §3.2 ADR-128 (the REQ-UX-8 / REQ-IDE-49 item: the `?` sheet is kept);
  - §5.4;
  - §8.
- `REVIEW-round-7-draft-spec.md` RV-14 (the complete-table mandate, ⌘. / ⌘\ / ⌘/ / Ctrl+K notes,
  and the layout note).
- `R6-ux-code-audit.md` §6.3 (Keymap) and §7 (Fonts / theme rows).
- `R5-ux-browser-audit.md` B12, B13, B15, I7 and I8.
- `apps/web/AGENTS.md`, `packages/journeys/AGENTS.md`.
- LEDGER § GATE DECISIONS `### Round 7` row `GD-PREVIEW.R7`.
- DEFERRALS round-7 sections plus row **D-PRB.07-1** (source-editor live exercise, PARTIAL).
- Manifest § Cross-cutting invariants and § Operating rules.
- Anchors (re-confirm at build time):
  - `packages/ide/src/keymap.ts`: `dispatchIdeKey` (about 20 mod chords, including ⌘1/⌘2/⌘J/⌘G/⌘,/⌘I/⌘S
    and ⌘⇧ M/F/L/T/R/D/E/V/C/Z, bare `[`/`]`/`/`/`?`) and `CHEAT_SHEET`;
  - `packages/ide/src/keymap.test.ts`;
  - `packages/ui/src/ide-shell.tsx` (around `:457-470`, the cheat-sheet render);
  - `apps/web/src/spa/ide/controller.ts` (around `:941`, dispatch);
  - `apps/web/src/client/ide.ts` (around `:696`; the island's keymap stays consistent with the
    table, and 247 shrinks it);
  - `packages/editor/src/plugins.ts:163-180` (PM keymap, checked against the rules);
  - `apps/web/src/spa/page-source-mode.ts:83-105`: CM extensions (`lineNumbers`, no
    `lineWrapping`, budget note);
  - `apps/web/src/spa/page-mount.tsx` (`sourceMode` state);
  - `apps/web/src/page-chrome.tsx:482` and `apps/web/src/page-data.ts` (`COPY.project.editCta`
    "Edit source");
  - `packages/ide/src/theme.ts` (`themeBootScript`, `paperStorageKey`, `parsePaperTheme`);
  - `apps/web/src/spa-shell.ts` (around `:151-209`, boot theme and `data-paper`).

## In scope — deliverables
1. **Source mode** (REQ-WRITE-5; I7, I8).
   - CodeMirror soft-wraps (`EditorView.lineWrapping`) with prose typography: a serif reading face
     at Page measure, and no monospace prose.
   - The line-number gutter's fate is this ticket's call; record it.
   - The CodeMirror group stays under its budget ceiling (no lang-markdown grammar).
   - There is **one** "Rich text / Source" toggle, in 237's header strip.
   - The "Edit source" link (`editCta`) and the floating "Source" chip are removed.
2. **Paper theme from boot** (REQ-WRITE-8; B15). The per-user × project paper policy is applied
   before first paint on both hard loads and SPA navigations into a project. There is no dark →
   light flip. Boot carries it, and the localStorage mirror is the offline source.
3. **REQ-KEYS-1, the full table.**
   - Every `dispatchIdeKey` binding gets an old → new row under Rules 1–5. The table includes:
     - 226's `[` / `]` sidebar and panel chords and its ⌘1 / ⌘2 / ⌘J retirement, kept as they are;
     - the **final** home for version prev/next, replacing 226's provisional binding;
     - an inbox chord that frees ⌘I for editor italic;
     - Rule 4's ⌘K (contextual link per 237) and ⌘⏎;
     - Rule 5's Source-mode precedence, which needs a source focus zone so that CodeMirror's own
       bindings win while it has focus.
   - The result extends 226's `reserved-chords.json` within 226's schema. A schema change is a
     recorded, additive extension. The file gains:
     - a source citation per non-capturable row (Chrome / Safari / Firefox × macOS / Windows /
       Linux);
     - the full old → new binding table;
     - the layout note (RV-14).
   - 226's checker is extended to cover the PM keymap (`pagePlugins()`) and the island, as well as
     `dispatchIdeKey`.
4. **REQ-KEYS-2.**
   - 226 already generates the `?` cheat sheet (kept) and the sidebar tooltips from the keymap.
     This ticket extends generation to every remaining surface: menus (Run ▾, ⋯, the View menu),
     the header-strip tooltips and 237's bubble items.
   - No hand-typed chord string remains in COPY or UI; a test asserts this.
5. **Lands ADR-128's REQ-UX-8 / REQ-IDE-49 item:** a dated banner in the owning section, citing
   ADR-128 (spec §3.2).
6. **U5 regression.** Re-point U5.write's source step at the new toggle. The step body keeps
   passing against a local build; the registry row stays `expected:"red"` / `ready-to-flip` for
   250 (nightly hazard, P4-4).

## Out of scope
- The sidebar and panel chords, the JSON schema and checker, and the cheat-sheet and tooltip
  generator (226, already landed; consumed and extended, never forked).
- Focus-mode exit (212). This ticket only re-homes its chord if a rule requires it.
- The slash menu (BACKLOG). Token-level streaming (BACKLOG).
- Shrinking the phone island (247_R7RO.2). This ticket keeps the island's bindings rule-conformant
  and does not re-architect it.

## Acceptance criteria
- [ ] `reserved-chords.json` (226's file, extended) holds the complete table. The extended checker
  fails if any binding in `dispatchIdeKey`, `pagePlugins()` or `client/ide.ts`:
  - is non-capturable on a supported browser × OS (Rule 1);
  - or is a Rule-2 conventional chord without the recorded exception (⌘S restore-point).

  A seeded violation in a fixture proves the test bites. *(deterministic · layer: engineered)*
- [ ] Every pre-existing action keeps a binding or a recorded removal, and the old → new table
  covers all of them. `keymap.test.ts` cases cover zone scoping:
  - `input` / `page` / `source` / `margin` / `findings`;
  - Source-mode precedence (Rule 5).

  *(deterministic · layer: engineered)*
- [ ] The `?` sheet, menu hints and tooltips render from the table. No literal chord string
  remains in COPY, `@rhema/ui` or SPA surfaces outside the generator (a grep test).
  *(deterministic · layer: engineered)*
- [ ] Source mode wraps: a DOM test with a long prose line asserts no horizontal overflow of the
  source host at a 360 px pane, and prose typography is applied. Exactly one toggle exists, and the
  `editCta` / "Source" chip hooks are gone, with `check:dom-contract` updated in the same change.
  *(deterministic · layer: engineered)*
- [ ] The paper theme is applied pre-paint: an SSR / shell test asserts `data-paper` is present in
  the first document bytes for a project with a stored policy. An SPA-navigation test asserts there
  is no intermediate paper value. *(deterministic · layer: engineered)*
- [ ] `check:spa-budget` passes (CodeMirror group under its ceiling; entry delta reported), along
  with `spa-env` and `dom-contract`. *(deterministic · layer: engineered)*
- [ ] The re-pointed U5.write step body passes against a locally served build. *(deterministic ·
  layer: engineered)*
- [ ] **Stage B — staging-verified at the R7b phase preview (250).** No preview is stood up here
  (`GD-PREVIEW.R7`). This ticket opens `D-R7WRITE.2-1` (kind P; owner 250_R7DEP.2; dated from
  `date -u`; unblocked by: 250's preview walk; how to verify: these states at 250's preview SHA,
  `--expect-sha`, provenance PASS, committed under `docs/build/runs/R7WRITE.2/`):
  - a wrapped Source-mode screenshot;
  - the `?` sheet showing the new table;
  - paper-theme screenshots on a hard load and an SPA navigation (I7, I8, B13, B15 states);
  - U5.write green with the re-pointed source step.

  The row tells 250 to append that evidence to D-PRB.07-1, which is not closed unless its own
  criterion is met. 250 closes `D-R7WRITE.2-1`. This PR reports the AC owed, never green.
  *(agentic · layer: staging-verified at the R7b phase preview (250))*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-WRITE-5, REQ-WRITE-8, REQ-KEYS-1 (full table), REQ-KEYS-2; ADR-128 (the REQ-UX-8 /
REQ-IDE-49 item). Findings: I7, I8, B13, B15 (and the B12 chord discoverability remainder);
RV-14.

## Cross-cutting invariants
- Manifest § Cross-cutting invariants 1, 9, 12 and 17 (no preview is created here, per
  `GD-PREVIEW.R7`).
- Spec §8:
  - .3 (copy; the harness is never named with a third-party product name);
  - .4;
  - .5 (the CodeMirror and entry budgets; no ceiling raised without a ruling);
  - .6 (the ADR-128 banner is append-only);
  - .7.

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules` (1–10). The gap table has one row per
  clause.
- No preview is stood up in this ticket (`GD-PREVIEW.R7`). A live need outside 250's preview
  window PAUSES for the operator (gotcha 7).

## Notes
- **Owns:**
  - the complete keymap table, its per-row sources and the final version-prev/next binding (226
    owns the schema and checker, which this ticket extends);
  - the extension of the checker to the PM keymap and the island;
  - generated hints beyond the sheet and sidebar;
  - the source focus zone;
  - the single source toggle;
  - pre-paint paper application.
- **Consumes:**
  - 226's rules, `[` / `]` chords, JSON schema, checker and generator;
  - 237's contextual ⌘K and header strip;
  - 238's U5 leg.
- **Facts are cited, not tested live.** The Rule-1 non-capturable facts cannot be proven in
  Playwright for OS-level chords. Each JSON row cites its documentation source. This is evidence
  class A, per the spec.
- **Island bindings** are made rule-conformant here and deleted, as far as they go, by 247.
- **D-PRB.07-1** is an H11-era operator leg (mode-switch plus typed round-trip). This ticket's
  preview evidence is captured by 250 (via `D-R7WRITE.2-1`); the operator leg's disposition stays
  with its owner.
