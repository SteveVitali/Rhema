# R7PANE.1 — SplitPane engine, breakpoints, and the right panel (Desk bodies moved unchanged)

- **Sequence:** 229 of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:**
  - 226_R7SHELL.1a: the sidebar is the left column of the new layout, and the < 768 sheet
    mechanism, the `]` chord and the demo-boot variant are 226's.
  - 225a_R7KIT.2b: Tabs, for the right panel.
  - This ticket builds on 212_R7FIX.1's stopgap (`paneLayout()` wired as the runtime geometry
    source). It is in the R7b base because the stack forks after 213 (P4-16).
  - This row merges after 224 (spec §5.1).
- **Run:** `implement-spec spec=docs/tickets/229_R7PANE.1__split-pane-engine.md`
- **Gate status:** none
- **Live stage:** Stage A only ($0: unit and DOM tests plus Playwright layout checks over a local
  build).
  - No owned preview (`GD-PREVIEW.R7`). Stage B is staging-verified at the R7b phase preview
    (250_R7DEP.2) through a DEFERRALS row, and prod Stage B rides 250.
  - U3.occlusion is held `ready-to-flip` (nightly hazard), and 250 flips it.
  - Any need for a live preview outside 224's and 250's windows → PAUSE for the operator.
- **Production mutations:** none
- **Size budget:** ~850 changed lines excl. generated/fixtures (M, upper bound). Entry-delta
  allowance ≤ 15 kB gz (REQ-KIT-5), with the actual figure stated in the PR. A runtime split
  clause is pre-declared in Notes (P4-14).

## Goal
The IDE stops overlaying the writer's text. Its layout becomes sidebar | Page | right panel on a
real SplitPane engine. The layout reflows, holds the page measure at ≥ 768 px, resizes from the
keyboard, and follows the ADR-128 breakpoint table. The bottom Desk retires. Its four tab bodies,
plus the Timeline, move **unchanged** into a right panel with tabs Chat · Findings · Claims ·
Timeline · Live feed (RV-25), so nothing becomes unreachable between merges. R7TALK.* restyle those
bodies later. The U3 occlusion leg is implemented and held `ready-to-flip`, and 250 flips it.

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md`:
  - §3.2 ADR-128 (the REQ-IDE-8 / DS §5.1 item) and ADR-129 (the SplitPane choice);
  - §4.7 REQ-PANE-1, -2 and -3; REQ-PANE-0 as landed by 212; REQ-PANE-4 (the U3 assertions);
  - §4.5 REQ-SHELL-6; §4.6 REQ-KIT-5; §4.17 REQ-DACC-7 (U3); §4.17 REQ-DOPS-8;
  - §5.4; §7 (PANE drag polish goes to BACKLOG); §8.
- R6 `…/R6-ux-code-audit.md` §6.1 (the geometry table), §6.2, UXC-19, -20 and -26. R5
  `…/R5-ux-browser-audit.md` B1, B2, B16, F1, F2 and F3.
- REVIEW RV-15, RV-25, RV-26 and RV-31.
- Anchors (re-confirm at build time):
  - **`packages/ui/src/ide-shell.tsx`:**
    - the Desk section (≈:294-320, with `data-desk`, `data-desk-tab`, `data-desk-panel`, and the
      `chatBody` / `deskFindingsBody` / feed props);
    - `deskOpen` (≈:161);
    - the Timeline aside;
    - the resize handles, `aria-hidden tabIndex=-1` (≈:236 and :268).
  - **Geometry:**
    - `packages/tokens/src/ide-css.ts` ≈:110-139;
    - `packages/tokens/src/tokens.ts:212` `LAYOUT`;
    - `packages/ide/src/layout.ts` (`paneLayout()`, `PaneState`, `DeskTab`);
    - `packages/ide/src/state.ts` (`PANE_STORAGE_VERSION = 1`, `DEFAULT_PANE_STATE`, the
      `DESK_TABS` codec).
  - **Chrome:** `apps/web/src/spa/ide/{chrome.tsx,controller.ts,chrome-data.tsx}`.
  - **Occlusion probe:** `packages/journeys/src/occlusion.ts`, plus 212's stopgap probe.
  - **Contract:** `apps/web/src/dom-contract.ts` (the `data-pane` and desk hooks); the R7a tour
    step targets (222's schema).
- `apps/web/AGENTS.md`; `packages/journeys/AGENTS.md`; `docs/tickets/00_MANIFEST.md` § Cross-cutting
  invariants and § Operating rules; `docs/tickets/DEFERRALS.md`.

## In scope — deliverables
1. **SplitPane choice** (ADR-129; REQ-PANE-1).
   - Choose `react-resizable-panels` or an in-house SplitPane under the budget rule, using a
     measured or reasoned entry/leaf delta for each.
   - Append the choice to ADR-129.
   - If the library is chosen: an exact pin, a green `check:licenses`, and an ADR-129 listing
     (REQ-DOPS-8's conditions; 225 owns that REQ).
2. **Layout** (REQ-PANE-1).
   - Sidebar | Page | right panel, reflowing, with no un-scrimmed overlay at any width (RV-26).
   - At ≥ 768 px the page measure stays within REQ-IDE-9 (45–80 ch, target 68). Panels collapse
     in a fixed priority order, which is recorded in ADR-128, before the page drops below 45 ch.
   - `role="separator"` handles with `aria-valuenow`/min/max and arrow-key resize [UXC-26].
   - Drag persistence and double-click reset are **not** built. They stay BACKLOG (RV-31).
3. **Breakpoints** (REQ-PANE-2), exactly per the §4.7 table:
   - at 1280–1439 the sidebar auto-collapses when the panel opens;
   - at 1024–1279 the panel is an overlay **with a scrim**, closed by default, dismissed by Esc or
     an outside click, and never persisted from overlay mode;
   - at 768–1023 it is a full-height sheet on demand;
   - below 768 the right panel becomes the content of 226's REQ-SHELL-6 sheet.
4. **Right panel; the Desk retires** (REQ-PANE-3).
   - Tabs Chat · Findings · Claims · Timeline · Live feed.
   - The existing Desk tab bodies and the Timeline aside content move in **unchanged**: no
     restyle and no data change.
   - The bottom Desk DOM and the Desk/status-bar collision are removed [B2, B16].
   - 226's `]` chord retargets to the panel.
   - The pane-state codec bumps its version, with a total migration from v1 (`deskOpen` /
     `deskTab` / `timelineOpen` map to the panel state; malformed input falls back to defaults).
     The REQ-SEQ-12 storage discipline is kept.
5. **Single geometry source.** `paneLayout()` stays the runtime source of truth. It is extended
   for sidebar and panel and stays unit-tested.
6. **DOM contract, tour safety and the leg.**
   - Desk and pane hooks migrate through `dom-contract.ts` in the same change.
   - Every R7a tour/demo target hook stays resolvable, by keeping or aliasing it, so that D2.tour
     does not regress before 248 re-pins.
   - The U3.occlusion steps are implemented at 1440×900, 1280×800, 1024×768, 820×1180 and
     390×844 (emulated, demo). They pass against a local build where the layout check can run.
   - **The flip is held** (nightly hazard, P4-4; 209's note). Prod serves R7a until 250 deploys,
     so the row stays `expected:"red"`, held `ready-to-flip`. 250_R7DEP.2 flips it. 224 flips
     only the R7a sub-assertion `U3.stopgap`.
7. **ADR-128 banner.** A dated REQ-IDE-8 / DS §5.1 banner in `docs/rhema-design-spec.md`.
8. **Demo boot** (P4-3; 226's demo-boot variant). In a demo boot the right panel renders only
   from demo data:
   - the tabs whose bodies would read workspace data or open a stream are hidden or disabled.
     These are Chat (232 owns the composer's demo clause) and the Live feed's `EventSource` tail
     (221's gating is preserved);
   - Findings, Claims and Timeline render from the demo twins, as the Desk did in R7a;
   - the panel issues no request outside 221's demo allowlist, and its open/size state stays
     local.

## Out of scope
- The chat thread, composer and tab memory/default rule (REQ-TALK-1/2/3): 232_R7TALK.1a.
- Findings/Claims version labelling (REQ-TALK-4): 233.
- Dossier layout (REQ-PANE-5): 243_R7KIT.3d.
- The project tree and Files, and removal of the rail code and Files strip: 230_R7SHELL.2.
- The occlusion guard in CI (REQ-GUARD-4 / REQ-PANE-4 enablement): 249_R7GUARD.1. Phone-UA
  layout: 247.
- Drag persistence and reset: BACKLOG (§7).

## Acceptance criteria
- [ ] At 1440×900, 1280×800, 1024×768 and 820×1180, no open un-scrimmed panel, overlay or menu
      intersects the Page text column, and no main column is < 45 ch at ≥ 768 px (Playwright
      layout check over a local build). *(deterministic · layer: fixture-verified)*
- [ ] `paneLayout()` unit tests cover the priority-order collapse and the 45-ch floor at every
      table width. *(deterministic · layer: engineered)*
- [ ] The separators resize by arrow key and expose their ARIA values.
      *(deterministic · layer: engineered)*
- [ ] Overlay mode shows a scrim, closes on Esc or an outside click, and never writes its open
      state to storage. *(deterministic · layer: engineered)*
- [ ] Each moved tab body's rendered markup equals the pre-move Desk body for the same fixture (a
      snapshot taken before the move). This proves RV-25's "unchanged".
      *(deterministic · layer: engineered)*
- [ ] Chat, Findings, Claims, Timeline and Live feed are actionable (`assertActionable`) at every
      table width. *(deterministic · layer: fixture-verified)*
- [ ] The v1 → v2 pane-codec migration is total. A malformed blob falls back per key.
      *(deterministic · layer: engineered)*
- [ ] Every R7a tour target hook resolves at the ticket head (a test over 222's step list).
      *(deterministic · layer: engineered)*
- [ ] The entry delta is ≤ 15 kB gz and reported, and `check:licenses` is green if a dependency
      was added. *(deterministic · layer: engineered)*
- [ ] A demo-boot DOM test opens the right panel with `boot.demo` set and records every request.
      Chat and the Live feed tail are hidden or disabled, no `EventSource` is constructed, and no
      request leaves 221's allowlist. The test fails if a demo boot issues a workspace or stream
      request from the panel. *(deterministic · layer: engineered)*
- [ ] **U3.occlusion is held `ready-to-flip`.** The steps are implemented and typecheck, and the
      local-build layout check above passes. The registry row stays `expected:"red"` in this PR
      (nightly hazard), and the run record states that 250_R7DEP.2 flips it.
      *(deterministic · layer: engineered)*
- [ ] **Stage B is staging-verified at the R7b phase preview (250_R7DEP.2)** (`GD-PREVIEW.R7`: no
      per-ticket preview). This ticket opens a dated `DEFERRALS.md` row (`D-R7PANE.1-n`, owner
      250). The row names what 250 captures:
      - U3.occlusion green at all 5 sizes at the preview SHA (`--expect-sha`);
      - a screenshot per size.

      Unblock: 250's preview walk. Compensating control: the fixture-verified layout and
      actionability checks above. 250 closes the row and flips the leg.
      *(agentic · layer: fixture-verified here; staging-verified and live-executed at 250)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-PANE-1, REQ-PANE-2, REQ-PANE-3, REQ-DACC-7 (U3; held `ready-to-flip`, flipped by 250),
REQ-KIT-5 (allowance). REQ-DOPS-8 is re-asserted if the library is chosen. REQ-DWEB-7 is
re-asserted for the demo-boot panel (owned by 221).

## Cross-cutting invariants
- Manifest § Cross-cutting invariants 2 (licence allowlist), 12 (walk the surface; at 250's
  preview), 17 (context budget).
- Spec §8: 4 (DOM contract in the same change; skipped legs reported), 5 (budgets and licences),
  6 (ADR-128/129 via banners), 7 (sizing).

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`; the gap table has one row per clause.

## Notes
- **Decisions this ticket owns:**
  - the SplitPane implementation (ADR-129 amendment);
  - the panel-collapse priority order;
  - the v2 pane-state schema and its migration;
  - the right-panel hook names.
- **Shared decisions consumed:**
  - the stopgap geometry and `paneLayout()` wiring (212, which owns REQ-PANE-0);
  - the < 768 sheet and the `]` chord (226);
  - the primitives (225a: Tabs; 225: Sheet);
  - the demo-boot variant (226) and the demo-mode read (221).
- **Who touches the Desk bodies next.** 232 and 233 restyle the bodies this ticket moves. 243
  owns PANE-5 and the remaining IDE control migration.
- **DEFERRALS.** If any table width cannot meet the 45-ch floor with every panel collapsed, record
  it as a dated row with its evidence. Do not loosen the check.
- **REQ-DACC-8 deviation.** DACC-8 has the owner flip U3 in its own PR. Under `GD-PREVIEW.R7` and
  the nightly hazard, 250 flips it instead. Record this in the run record as an accepted
  deviation for 252's list.
- **Runtime split clause** (P4-14; invariant 17). If the run must split, the worker requests it
  at this seam, and orchestrate-build writes the split back to the manifest:
  - **(a)** the engine, `paneLayout()`, the breakpoints, and the Desk → panel move. That is
    deliverables 1–3 and 5, deliverable 4 without the codec bump, and the demo-boot panel clause
    (deliverable 8);
  - **(b)** the codec v2 migration (deliverable 4's codec bullet), the U3 leg (deliverable 6's
    leg bullets, held `ready-to-flip`) and the ADR banner (deliverable 7).

  (b) stacks on (a).
