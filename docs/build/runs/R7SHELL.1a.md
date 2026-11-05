# R7SHELL.1a — AppShell layout route + persistent sidebar + in-shell states + narrow desktop (run ledger)

- **Spec:** `docs/tickets/226_R7SHELL.1a__app-shell-sidebar.md` (manifest row 226, phase round 7 /
  R7b). `GD-PREVIEW.R7` — no per-ticket preview; **$0**, repo-only; Stage A only (unit + DOM +
  integration tests plus a local build). mergePolicy=OPERATOR — never merge. LAUNCHED — prod
  serves `4bc8cf4a`; zero prod mutations.
- **Base:** `stevevitali/r7kit-2b-forms-guard` @ `7b197824` (chainTip; PRs #240–#263 unmerged per
  OPERATOR).
- **Branch:** `stevevitali/r7shell-1a-sidebar` · **Harness:** devin-desktop/swe-2-high/subagent
  · **Skills:** implement-spec + build-memory + self-review @ `~/agent-skills` (`e981ec5`)
- **Started:** 2026-11-05T06:50Z · **Closed:** (pending)
- **ci:** (pending)
- **Production mutations:** none.

## Deferrals read

`docs/tickets/DEFERRALS.md` read first. No `OPEN` row is unblocked by this ticket — the live R7
rows ride 224 (closed/DONE at prod `4bc8cf4a`), 250 (the R7b preview walk) or 253; this ticket
opens `D-R7SHELL.1a-1` (owner 250) per its AC.

## Requirements

From the ticket's In-scope: (1) the `AppShell` layout route wrapping every `/_authenticated`
leaf incl. the IDE, rail suppressed and its items in the sidebar, View menu on the status bar,
pending/error/404 in-shell; (2) the sidebar per spec §4.5 minus the Demo item (wordmark→`/app`,
New project, conditional Search, ≤8 recents + All projects, Inbox badge, Voices/Usage/Settings,
account menu, Lucide icons, collapsed tooltips, generated shortcuts); (3) per-user collapse
(localStorage keyed by user id — ledgered decision); (4) `/billing` → `/app/settings/billing`
both legs; (5) narrow desktop <768: drawer + 48 px top bar + full-height pane sheets, replacing
the CSS-phone hiding; (6) `reserved-chords.json` + checker, `[`/`]` bound, ⌘1/⌘2/⌘J retired,
version prev/next moved; (7) `shell`-bucket DOM hooks + U1.shell implemented held `ready-to-flip`;
(8) the ADR-128 REQ-IDE-2 banner; (9) the demo-boot AppShell variant.

## Acceptance criteria

Tracked in the ticket file; the gap table below carries one row per AC + the operating clauses.

## Plan

- `packages/ide`: keymap table (`IDE_KEYMAP`) + generated `CHEAT_SHEET` + `shortcutFor`;
  `reserved-chords.json` (rules 1–4 as data + the keep/transitional sets) + `assertChordsLegal`
  checker; `[`→sidebar, `]`→timeline, ⌘1/⌘2/⌘J retired, version prev/next → `⌥[`/`⌥]` (provisional,
  239 finalizes).
- `packages/tokens`: `LAYOUT.sidebarExpandedPx 248 / sidebarCollapsedPx 56 / topBarPx 48`;
  `ideCss()` gains the AppShell block, the hosted-IDE rail/phonebar suppression, and the <768
  CSS-phone hiding rescoped to `:not([data-ide-hosted])` with hosted sheet rules.
- `packages/ui`: `IdeShell` `hosted` prop (omits rail + phonebar, stamps `data-ide-hosted`);
  View menu button moves to the status bar.
- `apps/web`: `spa/app-shell.tsx` (workspace + demo variants), `_authenticated.tsx` mounts
  `<AppShell>` around `<Outlet>` + in-shell error/404, `billing.index.tsx` in-router redirect,
  `server.ts` `/billing` 302, `contracts` `/billing` `surfaces:null` row, `chrome.tsx` `hosted`
  + banner moved to the demo top bar, `controller.ts` `sidebar` action, `dom-contract.ts`
  `shell`-bucket hooks, `copy.ts` `COPY.appShell`, `lucide-react` dep.
- `packages/journeys`: real `U1.shell` body; registry row stays `expected:"red"`.

## Test matrix

| AC | Test |
|---|---|
| census | `app-shell.dom.test.tsx` — every generated route nests under `/_authenticated`; `_authenticated.tsx` mounts AppShell |
| one instance | remount-count via a mounted-AppShell counter across `/app`→`/p/x`→`/voices` |
| in-shell states | pending/error/404 DOM renders inside `data-app-shell` with sidebar present |
| /billing | router nav → `/app/settings/billing`; `app.request` GET `/billing` → 302 |
| collapse persistence | localStorage `rhema:sidebar:v1:<userId>` per user; wordmark→`/app`; no `href="/"` in AppShell |
| narrow desktop | topbar + drawer emitted; ide-css carries hosted sheet rules; hiding scoped `:not([data-ide-hosted])` |
| chords | checker fails on planted ⌘1/⌘⇧T; all `IDE_KEYMAP` bindings pass; dispatch honors `[`/`]`; cheat sheet generated |
| entry guard | `check:spa-entry-graph` + delta vs `spa-budget-baseline.json` |
| DOM contract | hooks land + `check:dom-contract` |
| demo variant | DOM test mounts both signedIn arms, records every request, asserts the item set |

## Progress

- Phase 0 — branched `stevevitali/r7shell-1a-sidebar` @ `7b197824`; DEFERRALS read (no row this
  ticket unblocks); spec Load docs + anchors read.
- Phase 1 — plan + test matrix above; baseline `spa-budget-baseline.json` @`04a4e98b` read.
- Phase 2 — implemented: `app-shell.tsx` (workspace + demo variants, per-user collapse,
  `isSpaEnabled`-gated reads, InShell guard for boundaries), `_authenticated` layout + in-shell
  states in `states.tsx`, `billing.index.tsx` + server 302 + contracts `surfaces:null` row,
  `IdeShell hosted` + View→status bar, `ide-css` AppShell block + hosted suppression + rescoped
  <768 hiding + sheets, `keymap.ts` table + `reserved-chords.{json,ts}` checker + generated
  CHEAT_SHEET/`shortcutFor`, controller `sidebar` action, `shell`-bucket hooks, `COPY.appShell`,
  lucide-react dep, real `U1.shell` leg (held red), REQ-IDE-2 banner (body + table),
  `DEFERRALS` row `D-R7SHELL.1a-1`, ADR-131 (storage + chord-schema decisions).
- Phase 3 — self-review + fix loop: `data-count` kept emitted (sidebar badge) + owner updated;
  hosted parity made hosted-vs-hosted in the SSR/React twin test; retired-chord call sites
  updated (`[data-ide-files-toggle]` pointer path, `]`, `⌥[`/`⌥]`); `role="navigation"` on
  `<aside>` removed (axe `aria-allowed-role`; the `<aside>` landmark + `role="group"` groups
  carry the semantics); `const C = COPY.appShell` alias removed (copy-containment scans full
  leaf refs); queries gated by the leaf's spa verdict (unflipped leaves spend zero reads);
  sidebar `<nav>` → `role="group"` divs (a leaf's `nav a` selector must not reach chrome);
  listener-census pin updated (the shell's per-boot arm is named).

## Gap table

| Requirement / AC | Status | Evidence |
|---|---|---|
| REQ-SHELL-1 one layout route over every `/_authenticated` leaf incl. IDE | MET | `_authenticated.tsx`; census test (`app-shell.dom.test.tsx`) |
| One mounted instance across workspace↔project nav | MET | same-file identity test |
| Sidebar item set (wordmark→`/app`, New project, Search-if-provider, ≤8 recents + All projects, Inbox badge, Voices/Usage/Settings, account menu, Lucide, tooltips, generated shortcuts) | MET | item-set test; `shortcutFor` |
| Per-user collapse persistence | MET | `rhema:sidebar:v1:<u>` test |
| In-shell pending/error/404 | MET | `InShellContext` + in-shell 404 test; leaf boundaries render inside the layout |
| `/billing` → `/app/settings/billing` both legs | MET | `billing.index.tsx` + `app.get("/billing")` + `surfaces:null` |
| REQ-SHELL-6 <768 drawer/topbar/sheets; hiding replaced not kept | MET | ide-css rescope + drawer test; leg covers the walk |
| REQ-KEYS-1 rules-as-data + checker + `[`/`]` + retirements + version-step move | MET | `reserved-chords.json` + `chordViolations`; keymap tests (planted fails) |
| REQ-KIT-5 entry graph + ≤15 kB allowance + delta report | MET | entry-graph clean; **+9.6 kB** vs baseline |
| REQ-DACC-7/8 `U1.shell` authored, held ready-to-flip | MET (deviation accepted by ticket) | `r7legs.ts` `U1_SHELL`; registry stays `expected:"red"` |
| DOM contract hooks + tests | MET | `dom-contract.ts` `shell` bucket; `check:dom-contract` |
| Demo-boot variant (wordmark doc-link, banner top bar, static frame, no workspace items, zero reads, signed-in arm) | MET | demo-variant tests |
| REQ-IDE-2 ADR-128 banner | MET | `rhema-design-spec.md` §4.1 + requirements table |
| Stage B (deployed walk + screenshots at 1440/1024/700 + demo page) | DEFERRED | `D-R7SHELL.1a-1` → 250 (GD-PREVIEW.R7; $0) |
| Leaf-header removal | OUT OF SCOPE — 227 | noted in PR |
| Demo sidebar item / global palette / right-panel retarget / rail deletion / phone-UA shell / `/pricing` SPA | OUT OF SCOPE — 248/228/229/230/247/249a | noted in PR |

Decisions: ADR-131 (sidebar storage + reserved-chords schema). `MET-DIFFERENTLY`: none beyond
the ticket's own ready-to-flip disposition for `U1.shell`.

## Evidence log

(Phase 5 — pending the full-suite re-run)

## Evidence report

(Phase 6)
