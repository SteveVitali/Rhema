# SPA.9 — ide-chrome React layout: panes, palette, keymap, SSE feed

Manifest row 106 · stacks on `stevevitali/spa-8-safety-gates` @ `4dfcb19` · merge policy
**OPERATOR** — do not merge from the build environment · **$0** spend, no deploys, no
production writes.

Implements `docs/tickets/106_SPA.9__ide-chrome-layout.md` per `docs/design/24` (chrome polish),
`docs/design/25` §chrome + keymap, `docs/design/23` (chrome vs document-mount split), and
`docs/frontend-spa-spec.md` §5 — the `ide.ts` island's non-document logic ported to
layout-owned React.

**Deployable dark:** nothing renders unless a leaf is IDE-framed **and** flipped (the boot map
already AND-gates `ide-chrome`); unflipped leaves keep the SSR twin via `SsrHandoff`, unframed
leaves never had a shell. Shared-file diffs are additive-only (skip-link target on the page
region, REQ-UX-16 hover/focus CSS both renderers share, copy leaves, contract entries).

## Requirement IDs

**REQ-ISL-9 · REQ-ISL-10 · REQ-ISL-14 · REQ-ISL-15 · REQ-NAV-8 · REQ-UX-8 · REQ-UX-16 (chrome
leg) · REQ-SEQ-12 · REQ-BFF-24**

## What lands

### The layout gate (`contracts`, `chrome.tsx`)

- `SPA_IDE_FRAMED_ROUTES` — the 11 `routeId`s the SSR `ideContext` wraps in `IdeFrame`
  (`/p/$project` + import/import-preview/run/review/r/revisions/v/diff/a/export leaves).
- `IdeProjectLayout` (`_authenticated/p.$project.tsx`) mounts `<IdeChrome>` iff the matched
  leaf is framed AND `isSpaEnabled(boot, routeId)`; unframed ⇒ bare `<Outlet>` outside `.ide`.
- `__root.tsx` gains `QueryClientProvider` — the same per-boot client route context carries.

### The publish seam (`chrome-data.tsx`)

- `IdeChromeData` — the prop bag the SSR `ideContext` assembled — published bottom-up by
  surface leaves through `useIdeChromeData` into a plain React context (not route context, so
  leaves/tests stay router-decoupled). Surfaces publish data, never server-rendered DOM.

### The island port (`controller.ts`)

- Pane state/drag/menus, view + theme radio menus, command menu, the **zero-POST palette**
  (`⌘K` + bare `/`, local filter, Enter navigates via the router), cheat sheet, findings
  shortcuts, typography, authorship, restore-point/finding-action events, `?focus=1`
  apply-then-strip, `#finding-` deep links.
- `dispatchIdeKey` verbatim with event-target focus zones (page/input/margin/findings/none) —
  findings chords inert in page + input.
- localStorage keys + codecs verbatim (`rhema:panes:v1:*`, `rhema:font:v1`,
  `rhema:reader-step:v1`, `rhema:authorship:v1:*`, `rhema:theme:v1`, `rhema:paper:v1:*`) —
  mixed-mode coexistence with the still-mounted SSR island.
- Overlay focus-return to the opener; `window.location.assign` → router history for in-tree
  targets (the one deliberate delta).

### The SSE feed (`feed.ts`)

- Same-origin `EventSource` resuming at `?after=<lastSeq>`; `GET /bff/feed-labels` maps via the
  `["feed-labels"]` Query; fail-closed unknown templates; live density filtering; trailing-
  debounced `["bff"]` invalidation (`usage.tick` exempt); `aria-live` announcements; exactly
  one active source under StrictMode.

### REQ-UX-16 chrome polish

- Skip link before the rail (`data-skip-link` → `#ide-page`; `IdeShell` page region gains
  `id` + `tabIndex={-1}`); hover/`:focus-visible` on menu rows, desk tabs, status-bar buttons,
  palette rows — shared `ide-css`, so SSR gains it too.

### Contract + copy

- `dom-contract.ts`: +13 `ide-chrome` hooks (`data-skip-link` required; `data-advanced`,
  `data-authorship`, `data-ide-open-feed`, `data-round`, `data-active`, `data-disabled`,
  `data-armed`, `data-suggestion-replacement`; role `menuitemradio`; urlparams `q`/`after`/
  `triage`) — 65/65 emitted+asserted.
- `copy.ts`: `IDE_CHROME_LABELS` + `IDE_FEED_LABELS` hoisted leaf-only bags (containment),
  `COPY.ide.skipToPage`, palette `nextStep`.

## Tests

`apps/web/src/spa/ide-chrome.dom.test.tsx` (**29**) — SSR DOM parity + manifest emission,
keymap focus zones, palette zero-POST + local filter + Enter-nav, SSE resume/density/
invalidation/live-region/StrictMode-source-count, localStorage schema round-trips, skip-link
target focus, overlay focus-return, axe on the mounted chrome.

## Verification

`pnpm turbo build lint typecheck` **135/135** · `pnpm test` **470 files / 5,000 pass / 0 fail**
· `check:dom-contract` 491 entries, ide-chrome 65/65 · `check:licenses` 822 ·
`check:protocol-markers` armed + 169 files · `check:no-cookies` clean · `check:spa-budget`
ceilings held · `check:spa-env` 94 artifacts clean.

## Notes for the operator

- Chrome stays dark until `ide-chrome` AND a surface flag are set; nothing routes differently
  on prod today.
- Document content is unchanged — the Page/Desk/Timeline regions mount the surface's existing
  children; per-surface React mounts are the later surface tickets (export at position 8).
- `controller.ts` is a deliberate 1:1 port (1,161 vs the island's 1,152 lines) — the size
  overrun vs the ~600 guide is recorded in `runs/SPA.9.md` per the SPA.5–7 precedent.
- `D-SPA.6-1` stays OPEN (needs the chain merge+deploy + CI image digests +
  `rhema:spaSurfaces` stack config).
