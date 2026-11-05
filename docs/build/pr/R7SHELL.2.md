# R7SHELL.2 — Project scope in the sidebar; Files becomes the project tree; IDE rails removed

- **Ticket:** `docs/tickets/230_R7SHELL.2__project-scope-sidebar.md` (manifest row 230)
- **Requirement IDs:** REQ-SHELL-4, REQ-KIT-5 (entry-delta allowance)
- **Base:** `stevevitali/r7pane-1-split-pane` (chain tip; R7PANE.1 PR #267)
- **Stage A only** ($0) — GD-PREVIEW.R7; Stage B deferred to 250 via `D-R7SHELL.2-1`.
- **mergePolicy: OPERATOR** — do not merge.

## What lands

- **Sidebar project scope** (`apps/web/src/spa/app-shell.tsx`): inside `/p/:slug` the current
  project entry expands into the seven items — Page · Outline · Figures · Versions · Reviews ·
  Export · Project settings — each an SPA link with `aria-current`; collapsed ⇒ icon + Tooltip;
  the current project is no longer repeated in Recent projects. Items: Lucide icons.
- **ReadOnlyProject**: write-only items (Export, Project settings) disable with the 211 reason
  (demo also gates the non-demo-served items). Demo boots render the section from the demo
  twins only — zero workspace reads (P4-3).
- **Files tree**: `ui/files-pane.tsx` rewritten as the ARIA tree (`role="tree"/"treeitem"/"group"`,
  roving tabindex + arrow-key walk at the mount site); Lucide kind icons; frozen/working
  `Badge` replaces lock glyphs (B10); "Files" label → `COPY.files.heading` (UXC-30); fed by the
  new light twin `GET /bff/p/:slug?view=tree` (`queries.ts` `projectTreeQuery`; demo-safe — the
  `view` param keeps the `/p/$project` routeId; gated on the leaf's SPA verdict).
- **Rail + Files strip DELETED** (not hidden): `ui/ide-shell.tsx`, `tokens/ide-css.ts`,
  `tokens.ts` LAYOUT (`railPx`/`files*`/`bpFilesTicksMarginPx` gone), `packages/ide` layout
  (`files` verdict gone; collapse order panel → margin; `paneDrag` panel-only), keymap
  `pane:"panel"`, `client/ide.ts` + `spa/ide/controller.ts` Files paths removed, `filesBody` /
  `sourceHref`/`data-files`/`data-files-mode`/`data-ide-files-toggle`/`data-current` retired.
- **Codec**: stored `filesOpen`/`filesWidth` parse tolerantly (defaults; never re-serialized).
- **DOM contract**: hooks retired/added in the same change; `check:dom-contract` green;
  every R7a tour target still resolves. `U1.shell` extended to reach all seven items from the
  Page — held `expected:"red"` (D-R7SHELL.2-1, owner 250).

## Acceptance criteria

- AC1 (no rail/Files strip in DOM; removal-catching tests): ide-shell.test + ide-chrome.dom +
  app-shell.dom + tokens.test assert `.ide-rail`/`.ide-files`/`data-files` absent. **engineered**
- AC2 (seven items SPA-navigate + active state; ReadOnlyProject disables write-only with
  reason): app-shell.dom.test — census of the seven `data-project-item`s, hrefs, `aria-current`,
  disabled-with-reason. **engineered**
- AC3 (tree roles + keyboard nav + Badges): `role="tree"/"treeitem"` + roving-tabindex walk +
  `data-lock-badge` on every row, no `data-lock-icon`. **engineered**
- AC4 (pre-change pane blob tolerates; reserved-chords green): codec test + chords checker.
  **engineered**
- AC5 (`check:dom-contract` green; tour targets resolve; entry delta ≤15 kB): green; +13.7 kB.
  **engineered**
- AC6 (Stage B deferred to 250): `D-R7SHELL.2-1` — extended `U1.shell` walk + 1440×900
  screenshots expanded/collapsed at `--expect-sha`. **met-engineered(D-R7SHELL.2-1)**
- AC7 (universal gate). **engineered**

## Verification

`pnpm turbo build lint typecheck` (138/138) · `pnpm test` · `pnpm check:dom-contract` ·
`pnpm check:spa-budget` (**entry delta +13.7 kB** of the ≤15.0 allowance vs `spa-budget-baseline.json`;
total JS +48.4 kB) · `check-build-memory.sh` · `check-append-only.mjs --base stevevitali/r7pane-1-split-pane`.

## Defers

`D-R7SHELL.2-1` — Stage-B `U1.shell` walk + screenshots at 250_R7DEP.2.

## Decisions recorded

`docs/adr/ADR-133-project-scope-sidebar-decisions.md` (item order/targets, write-only set,
`?view=tree` twin, codec removal, hook migration, tree keyboard walk, demo variant).
