# R7SHELL.1a — AppShell layout route + persistent sidebar + in-shell states + narrow desktop

**Ticket:** `docs/tickets/226_R7SHELL.1a__app-shell-sidebar.md` (manifest row 226, R7b).
**Base:** `stevevitali/r7kit-2b-forms-guard` @ `7b197824` · **Branch:** `stevevitali/r7shell-1a-sidebar`
**mergePolicy=OPERATOR** — never merge. **Stage A only, $0** (GD-PREVIEW.R7): unit + DOM +
integration tests plus a local build; Stage B is `D-R7SHELL.1a-1` → 250_R7DEP.2.
**Entry delta vs `spa-budget-baseline.json` (@`04a4e98b`): +9.6 kB gz** (≤ 15 kB allowance held —
`check:spa-budget` prints the number; the AppShell module + lucide icons land in the entry).

## What lands

- **`AppShell`** (`apps/web/src/spa/app-shell.tsx`) — the one persistent authenticated layout.
  The `/_authenticated` route mounts `<AppShell><Outlet/></AppShell>`; every leaf nests inside it
  (a route-tree census test pins the parentage — planting a leaf outside fails). The demo-boot
  variant renders the wordmark as a `data-spa-native` document link, the demo top bar hosting the
  R7a banner, and the static frame — zero workspace items, zero session/workspace/credits reads.
- **The sidebar (REQ-SHELL-2, ADR-128):** wordmark → `/app` (SPA link — no `href="/"`, UXC-3),
  New project, Search (only where a palette provider is registered — the IDE palette in project
  scope; 228's global palette extends), ≤8 recent projects with state dots + All projects, Inbox
  with the REQ-IDE-2 badge, Voices/Usage/Settings, and the account menu (initials, credits from
  the `/bff/app` entitlement read — invariant 14, Billing → `/app/settings/billing`, Pricing as a
  document link until 249a, Theme through the existing `/ide/theme` write, Sign out document
  navigation). Lucide icons (the ADR-129 dep moves into `apps/web`), collapsed-mode tooltips,
  shortcuts generated from the keymap. The Demo item is withheld — 248's `data-spa-native` link.
- **Collapse is remembered per user** — `rhema:sidebar:v1:<userId>` (the ledgered decision —
  same per-user localStorage precedent as `rhema:panes:v1:<u>:<p>`; two users on one browser
  never share it). 248 px expanded / 56 px icon rail.
- **In-shell states (UXC-29/35, D6/D7):** `SpaNotFound`/`SpaRouteError` render inside the shell —
  an `InShell` context guard keeps them bare at leaf position inside the layout and lets them
  mount the shell themselves at a boundary position with no layout (the fuzzy root 404). Leaf
  pending components already render inside the layout.
- **`/billing` → `/app/settings/billing` (D6):** server-owned 302 (`app.get("/billing")`) +
  a `surfaces:null` document-route row + the in-router `billing.index` `throw redirect`.
- **Narrow desktop (REQ-SHELL-6, F4, UXC-21):** under 768 px the CSS-phone `display:none` hiding
  is rescoped to `:not([data-ide-hosted])` — a hosted IDE gets a 48 px top bar, an off-canvas
  sidebar drawer (+scrim), and its panes (files/timeline/desk) open as full-height sheets.
  Phone-UA SSR documents are untouched (247's ownership).
- **The hosted IDE:** `IdeShell` gains `hosted` — the rail and phonebar are never mounted inside
  the shell (DOM-level suppression, no capability hiding), and the rail's View menu moves to the
  status bar. `chrome.tsx` mounts `hosted` + drops the duplicated `DemoBanner`.
- **REQ-KEYS-1:** `IDE_KEYMAP` is the committed binding table — `CHEAT_SHEET` and `shortcutFor`
  (sidebar/menu tooltips) are generated from it. `[` toggles the sidebar, `]` toggles the
  right-side pane (Timeline today; 229 retargets). ⌘1/⌘2/⌘J retired; version prev/next moved to
  the provisional `⌥[`/`⌥]` (239 finalizes). `reserved-chords.json` carries Rules 1–4 as data
  (non-capturable, conventional-avoid, keep, transitional pinning each grandfathered chord to its
  ONE action) + the `chordViolations` checker — a planted ⌘1 or a second action on ⌘⇧T fails.
- **`shell`-bucket DOM hooks** declared + emitted + asserted (`check:dom-contract` green).
- **`U1.shell`** real leg body in `packages/journeys/src/r7legs.ts` — held `expected:"red"`,
  ready-to-flip at 250 (the accepted REQ-DACC-7 deviation).
- **ADR-128 banner** at REQ-IDE-2 in `docs/rhema-design-spec.md` (spec + requirements table).

## Evidence (achieved: engineered + fixture-verified)

- `pnpm turbo build lint typecheck` — green, no ceiling raised.
- `pnpm test` — full suite green (new: `app-shell.dom.test.tsx` 11 tests; `keymap.test.ts` 7 +
  checker parity, planted-violation fails).
- `pnpm check:spa-budget` — entry 173 kB gz, **delta +9.6 kB vs baseline** (the AppShell module + lucide icons — inside the ≤15 kB/ticket allowance).
- `node scripts/check-spa-entry-graph.mjs` — 7 entry chunks clean; the only new entry dep is
  `lucide-react` (ADR-129's stack).
- `pnpm check:dom-contract` — the `shell`-bucket hooks emitted + asserted.
- `bash ~/agent-skills/skills/build-memory/scripts/check-build-memory.sh .` — 0 violations.
- `node docs/build/tools/check-append-only.mjs --base stevevitali/r7kit-2b-forms-guard` — OK.

## Deferrals / carries / deviations

- Opens **D-R7SHELL.1a-1** (Stage-B `U1.shell` walk + screenshots → 250). U1.shell leg authored
  this ticket, held `ready-to-flip` — REQ-DACC-8's accepted deviation.
- Leaf headers/content chrome (`/app`'s own header row incl. its `href="/"` link) are 227's —
  out of scope here (the UXC-3 assert scopes to the shell chrome).
- Sidebar Demo item (248), global Search provider (228), right-panel retarget (229), rail
  deletion (230), phone-UA AppShell needs (247), pricing SPA surface (249a), Stage B (250).

## Out of scope / not done

No preview ($0), no production mutation, no merge, no new money/credits path, no renderer flags.
