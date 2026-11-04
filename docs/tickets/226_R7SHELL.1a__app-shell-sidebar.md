# R7SHELL.1a — AppShell layout route + persistent sidebar + in-shell states + narrow desktop

- **Sequence:** 226 of 254 · **Phase:** round 7 (R7b) · **Kind:** ticket
- **base_branch:** current checkout
- **Depends on:** 225_R7KIT.2. The sidebar is built from its primitives (Tooltip and
  DropdownMenu, the shell's only entry-graph allowance), and the entry delta is reported against
  its baseline. This row merges after 224 (spec §5.1).
- **Run:** `implement-spec spec=docs/tickets/226_R7SHELL.1a__app-shell-sidebar.md`
- **Gate status:** none
- **Live stage:** Stage A only ($0: unit, DOM and integration tests plus a local build).
  - No owned preview (`GD-PREVIEW.R7`). Stage B is staging-verified at the R7b phase preview
    (250_R7DEP.2) through a DEFERRALS row, and prod Stage B rides 250.
  - U1.shell is held `ready-to-flip` (nightly hazard), and 250 flips it.
  - Any need for a live preview outside 224's and 250's windows → PAUSE for the operator.
- **Production mutations:** none
- **Size budget:** ~800 changed lines excl. generated/fixtures (M). Entry-delta allowance ≤ 15 kB gz
  (REQ-KIT-5), with the actual figure stated in the PR.

## Goal
Every signed-in page lives in one persistent shell. A single `AppShell` layout route wraps every
`/_authenticated` leaf, the IDE included. It carries the ADR-128 collapsible left sidebar, so
navigation between workspace pages no longer unmounts the chrome. Pending, error and 404 states
render inside the shell. `/billing` resolves. A desktop window narrower than 768 px gets a drawer
and sheet instead of hidden panes. The keymap rules (REQ-KEYS-1) land for the sidebar and panel
chords. The per-leaf headers stay until 227 removes them.

## Load (read these — do not re-read others)
- `docs/round-7-draft-spec.md`:
  - §3.1 `GD-UX-SHELL.R7`, `GD-UX-KEYS.R7`; §3.2 ADR-128 (the REQ-IDE-2 item); §3.3 S-5 and S-14;
  - §4.5 REQ-SHELL-1, -2 and -6;
  - §4.12 REQ-KEYS-1 Rules 1–5;
  - §4.6 REQ-KIT-5; §4.17 REQ-DACC-7 (U1) and -8;
  - §5.4; §8.
- R6 `…/R6-ux-code-audit.md`:
  - §0 point 2; §3 (the header table and its "Differences" list); §6.1 (the < 768 desktop-UA row);
  - UXC-3, -9, -10, -12, -21, -29 and -35; Q2.
- R5 `…/R5-ux-browser-audit.md` A5, B3, D1, D6, D7 and F4.
- REVIEW RV-14, RV-22 and RV-33.
- Anchors (re-confirm at build time):
  - **The layout route:** `apps/web/src/spa/routes/_authenticated.tsx` (`component: Outlet`) and
    `apps/web/src/spa/routes/__root.tsx`.
  - **States:** `apps/web/src/spa/states.tsx`. `SurfaceShell`, `PendingShell`, `SpaNotFound` and
    `SpaRouteError` each render a bare `<main>`, and the 404 "Home" link is `href="/"`.
  - **IDE chrome:**
    - `apps/web/src/spa/ide/chrome.tsx` (`IdeProjectLayout`) and `controller.ts`;
    - `packages/ui/src/ide-shell.tsx` (the rail, about :186-205; the phonebar);
    - `packages/tokens/src/ide-css.ts:138-139` (desktop-UA CSS-phone `display:none !important`);
    - `packages/tokens/src/tokens.ts:212` `LAYOUT`.
  - **Keymap:** `packages/ide/src/keymap.ts`. `dispatchIdeKey` binds ⌘1, ⌘2 and ⌘J to pane
    toggles, and bare `[` / `]` to version-prev/next today. `CHEAT_SHEET` is hand-written.
  - **Routes:**
    - `packages/contracts/src/spa.ts` (`SPA_PREFIXES` already includes `/billing`;
      `SPA_DOCUMENT_ROUTES`; `spaRouteFor`);
    - `routes/_authenticated/settings_.billing.tsx` and `billing.return.tsx`;
    - the server's document handling for `/billing` in `apps/web/src/server.ts`.
  - **Contract and leg:** `apps/web/src/dom-contract.ts` (the `shell` bucket);
    `packages/journeys/src/registry.ts` (U1.shell, registered red by R7OPEN.1).
- `apps/web/AGENTS.md`; `packages/journeys/AGENTS.md`; `docs/tickets/00_MANIFEST.md` § Cross-cutting
  invariants and § Operating rules; `docs/tickets/DEFERRALS.md`.

## In scope — deliverables
1. **AppShell layout route** (REQ-SHELL-1).
   - `/_authenticated` renders `AppShell`, and the IDE layout nests inside it. While the IDE is
     hosted, its global rail (⌂ ◎ ▤ ⚙) is suppressed and its items live in the sidebar
     (REQ-IDE-2, UXC-10). The rail *code* and the Files strip are removed by 230.
   - The rail's View menu moves to the status bar, so it stays reachable.
   - The pending, error and 404 states render inside the shell [UXC-29/35, D6/D7].
2. **The sidebar** (REQ-SHELL-2), with every item in spec §4.5 except the **Demo** item, which
   248_R7TOUR.2 adds (REQ-TOUR-4).
   - The wordmark is an SPA link to `/app` [UXC-3].
   - **New project** links to today's create flow; 236 changes the behaviour.
   - **Search** renders only when a palette provider is registered: the IDE palette in project
     scope today, the global palette once 228 lands. No dead control ships [C6].
   - **Recent projects** shows up to 8 entries with status dots, plus "All projects".
   - The **Inbox** item carries the REQ-IDE-2 badge.
   - **Voices**, **Usage** and **Settings** links.
   - **Account menu** (DropdownMenu): initials, credits balance, Billing, Pricing (a document
     link; signed-in `/pricing` is REQ-PUB-1, owned by 249a_R7PUB.1), Theme (the existing theme write) and
     Sign out (`/logout`, a document navigation).
   - Lucide icons; tooltips when collapsed; shortcuts shown, generated from the keymap.
3. **Collapsible state** (REQ-SHELL-1). Expanded ≈ 248 px, collapsed to a 56 px icon rail; both
   widths are added to `LAYOUT`. The state is remembered per user, and two users on one browser do
   not share it. The toggle chord follows deliverable 6.
4. **`/billing` alias** (REQ-SHELL-1). `/billing` redirects to `/app/settings/billing` for both an
   SPA navigation and a document load [D6].
5. **Narrow desktop** (REQ-SHELL-6). Desktop UA below 768 px CSS width:
   - the sidebar is an off-canvas drawer behind a 48 px top bar with a menu button;
   - the IDE's side panes (Timeline and Desk today; 229 swaps in the right panel) open as a
     full-height sheet from a top-bar toggle;
   - this replaces the CSS-phone `display:none` hiding [F4, UXC-21].

   Phone-UA requests are untouched (S-5; owned by 247_R7RO.2).
6. **Keymap rules for the sidebar and panel chords** (REQ-KEYS-1 partial; RV-33).
   - Commit `reserved-chords.json` with Rules 1–4 as data (non-capturable set, conventional-avoid
     set, keep set), and a checker test that fails on any binding that violates them.
   - Bind `[` to toggle the sidebar and `]` to toggle the right-side pane (today's Timeline; 229
     retargets it to the right panel).
   - Retire ⌘1, ⌘2 and ⌘J.
   - Move version-prev/next off `[` / `]` to a rule-compliant binding. The table records it as
     provisional; 239 finalizes it.
   - `CHEAT_SHEET` and the tooltips are generated from the keymap. The remaining bindings are
     239's.
7. **DOM contract and leg.**
   - `shell`-bucket hooks for AppShell, the sidebar, its items and the account menu land in the
     same change.
   - U1.shell steps are implemented: sidebar identical on workspace and IDE pages, collapse
     persistence, in-shell 404, `/billing`, and the narrow-desktop drawer.
   - **The flip is held** (nightly hazard, P4-4; 209's note). The nightly runs `main`'s registry
     against prod, which serves R7a until 250 deploys. The row therefore stays `expected:"red"`,
     held `ready-to-flip`, and 250_R7DEP.2 flips it on its preview and prod evidence.
8. **ADR-128 banner.** A dated REQ-IDE-2 banner in the owning section of
   `docs/rhema-design-spec.md`, via ADR-128's shell.
9. **The demo-boot AppShell variant** (P4-3; REQ-DWEB-7 and REQ-DACC-3 re-asserted for the R7b
   chrome). Demo Pages skip the `/_authenticated` gate (220's boot fixes), but the AppShell still
   wraps them, so this ticket owns what the shell does in a demo boot. The mode comes from 221's
   single demo-mode read (`useDemoMode()`/`isDemo()` from boot).
   - **Rendered:** the wordmark, as a `data-spa-native` document link out of the demo; the demo
     top bar, which hosts the R7a demo banner with its H15-signed copy unchanged; and the static
     sidebar frame. None of these reads workspace data.
   - **Not rendered and never fetched:** New project, Recent projects, the Inbox item and its
     badge, Voices, Usage, Settings, and the account menu (initials, credits, theme write). A
     demo boot issues no session, workspace, credits or account read.
   - **"Back to your projects"** is a `data-spa-native` document link to `/app`. It renders only
     when `boot.demo.signedIn` is set (cookie presence, cosmetic; 220).
   - **Siblings.** Search follows 228's demo clause, the right panel follows 229's, and the chat
     composer follows 232's. 230's project section consumes this variant. The sidebar Demo entry
     stays 248's.
   - Tour beat 2 shows this sidebar, so 248 re-pins over this variant.

## Out of scope
- Removing the 14 leaf headers and framing the unframed surfaces: 227_R7SHELL.1b.
- The global ⌘K palette and `GET /search`: 228_R7SHELL.1c.
- The SplitPane engine, the right panel and the ≥ 768 breakpoints: 229_R7PANE.1.
- The project tree, removal of the IDE rail code and the Files strip: 230_R7SHELL.2.
- The sidebar "Demo" entry: 248_R7TOUR.2.
- Signed-in `/pricing`: 249a_R7PUB.1. The full keymap table and REQ-KEYS-2: 239_R7WRITE.2.
- Phone-UA real projects: 247_R7RO.2.

## Acceptance criteria
- [ ] A route-tree census test asserts that every `/_authenticated` leaf renders inside
      `AppShell`. Planting a leaf outside it fails the test. *(deterministic · layer: engineered)*
- [ ] Navigating between workspace leaves and into or out of a project keeps one AppShell
      instance mounted (an identity/remount-count test). *(deterministic · layer: engineered)*
- [ ] Pending, route-error and 404 each render inside the shell, with the sidebar present.
      *(deterministic · layer: engineered)*
- [ ] `/billing` reaches `/app/settings/billing` by SPA navigation and by document load.
      *(deterministic · layer: engineered)*
- [ ] Collapse state persists across a reload per user and is not shared between two users. The
      wordmark targets `/app`, and no `href="/"` remains in the AppShell.
      *(deterministic · layer: engineered)*
- [ ] The narrow-desktop tests pass at a desktop UA, 700 px wide:
      - the drawer and top bar render;
      - the sheet reaches the Timeline and Desk;
      - no desktop-UA `display:none` capability hiding remains.

      *(deterministic · layer: engineered)*
- [ ] The `reserved-chords.json` checker fails on a planted ⌘1 or ⌘⇧T binding. `[` and `]` are
      bound as specified, and the cheat sheet is generated from the keymap.
      *(deterministic · layer: engineered)*
- [ ] The entry-graph guard is green; only Tooltip and DropdownMenu enter the entry. The entry
      delta is ≤ 15 kB gz and is reported in the PR. *(deterministic · layer: engineered)*
- [ ] DOM-contract entries land in the same change, and `check:dom-contract` is green.
      *(deterministic · layer: engineered)*
- [ ] A demo-boot DOM test mounts the AppShell with `boot.demo` set, both signed in and signed
      out, and records every request. It asserts:
      - no `/session`, recent-projects, Inbox-count, credits/entitlement or account read, and no
        request outside 221's demo allowlist;
      - only the demo variant's items render, and no workspace item does;
      - "Back to your projects" is a `data-spa-native` link to `/app`, present only when signed in;
      - the demo top bar renders.

      The test fails if a workspace item or read is reintroduced in a demo boot.
      *(deterministic · layer: engineered)*
- [ ] **U1.shell is held `ready-to-flip`.** The steps are implemented, typecheck, and pass their
      unit tests. The registry row stays `expected:"red"` in this PR (nightly hazard), and the run
      record states that 250_R7DEP.2 flips it. *(deterministic · layer: engineered)*
- [ ] **Stage B is staging-verified at the R7b phase preview (250_R7DEP.2)** (`GD-PREVIEW.R7`: no
      per-ticket preview). This ticket opens a dated `DEFERRALS.md` row (`D-R7SHELL.1a-n`, owner
      250). The row names what 250 captures:
      - U1.shell green at the preview SHA (`--expect-sha`);
      - screenshots at 1440×900, 1024×768 and 700×900 (desktop UA);
      - one demo-boot page showing the demo variant.

      Unblock: 250's preview walk. Compensating control: the Stage-A tests above. 250 closes the
      row and flips the leg. *(agentic · layer: engineered here; staging-verified and
      live-executed at 250)*
- [ ] verification green; every new behaviour has a test that fails if it is removed; requirement ids stamped in the PR; anything not automatically verifiable is a `DEFERRALS.md` row with its compensating control; ADRs written for every deviation and owned decision; `BUILD_INDEX.md` row and `LEDGER.md` advanced; operating clauses met — dates from the clock, PR checks read and recorded, AC layers stated, no living-record pins, protected records only appended, gate words verbatim, harness in the run-ledger header. *(agentic — the universal phase-gate AC)*

## Requirement IDs to satisfy and stamp in the PR
REQ-SHELL-1, REQ-SHELL-2 (Demo item excepted, owned by 248), REQ-SHELL-6, REQ-KEYS-1 (rules plus
the sidebar and panel chords; table completed by 239), REQ-DACC-7 (U1; held `ready-to-flip`,
flipped by 250), REQ-KIT-5 (allowance). REQ-DWEB-7 and REQ-DACC-3 are re-asserted for the
demo-boot AppShell (REQ-DWEB-7 is owned by 221, and REQ-DACC-3 by 224).

## Cross-cutting invariants
- Manifest § Cross-cutting invariants:
  - 1 (vocabularies);
  - 12 (verify by walking the surface);
  - 14 (credits balance from the entitlement source, never a local number);
  - 17 (context budget).
- Spec §8:
  - 2 (money numbers sourced);
  - 3 (copy; no third-party harness name);
  - 4 (DOM contract in the same change; skipped legs reported as skipped);
  - 5 (budgets);
  - 7 (sizing).

## Operating clauses
- Cited from `docs/tickets/00_MANIFEST.md § Operating rules`; the gap table has one row per clause.

## Notes
- **Decisions this ticket owns:**
  - the `AppShell` structure and the shell-bucket hook names;
  - where per-user collapse state is stored (localStorage keyed by user id, or the existing
    `user.prefs` blob), recorded in the run ledger;
  - the `reserved-chords.json` schema and its checker (239 extends both);
  - the provisional version-prev/next binding;
  - suppressing the hosted IDE rail before 230 deletes it;
  - moving View to the status bar;
  - the demo-boot AppShell variant: its item set, the wordmark's demo target, and the demo
    top-bar slot (P4-3).
- **Shared decisions consumed:**
  - the primitives and the allowance list (225);
  - focus-ring discipline (210's REQ-COPY-7);
  - ReadOnlyProject (211): sidebar items for write actions honour it.
- **The Demo item is withheld.** REQ-SHELL-2 lists it, but §10 row 248 owns the sidebar Demo entry,
  so this ticket does not render it. 248 adds it as a `data-spa-native` document link (S-14).
- **DEFERRALS.** Close any `OPEN` row this unblocks (read the file first). The signed-in `/pricing`
  link stays a document navigation that redirects until 249a_R7PUB.1. If that is visible in 250's
  walk, record it as a known interim state, not a defect.
- **REQ-DACC-8 deviation.** DACC-8 has each owner flip its legs in its own PR. Under
  `GD-PREVIEW.R7` and the nightly hazard, this ticket implements U1.shell and holds it, and 250
  flips it. Record this in the run record as an accepted deviation for 252's list.
