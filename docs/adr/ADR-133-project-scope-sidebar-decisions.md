# ADR-133: R7SHELL.2 project-scope sidebar decisions

- **Status:** accepted
- **Date:** 2026-11-05
- **Ticket:** 230_R7SHELL.2 (REQ-SHELL-4, REQ-KIT-5)
- **Spec:** `docs/tickets/230_R7SHELL.2__project-scope-sidebar.md`

## Context

230_R7SHELL.2 moves project scope into the AppShell sidebar: the current project entry
expands into seven items; the Files pane's content becomes the entry's expanded tree; the
IDE icon rail and the 36-px Files strip are deleted from DOM and geometry (REQ-SHELL-4,
REQ-KIT-5). The ticket assigns the item order and icons, the tree hook names, and the files
pane-state removal as ticket-owned decisions.

## Decisions

1. **Item order and targets** (ticket-owned): Page → `/p/:slug` (active on index + `/a/*` +
   `/edit/*`); Outline → `/outline`; Figures → `/figures` (active also on `/f/*`, `/visualize`);
   Versions → `/v/working` (the versions surface — active on `/v/*`, `/revisions/*`);
   Reviews → `/review/<latest review runId>` derived from the tree's rounds rows, fallback
   `/p/:slug` (the overview carries dossier cards) — active on `/review/*`, `/r/*`;
   Export → `/export`; Project settings → `/settings` (active also on `/voice/*`).
   Versions uses `v/working` because there is no versions index today; the versions/compare
   surfaces are 243's.
2. **Write-only items** under `ReadOnlyProject` = Export and Project settings — disabled with
   the reason (211's `readOnlyReasonText`). In a demo boot the demo-served set is
   Page/Figures/Versions/Reviews; the rest disable with the demo reason.
3. **Tree twin**: `GET /bff/p/:slug?view=tree` — a light arm on the existing twin route (the
   `view` param keeps the `/p/$project` routeId, so the demo allowlist needs no change and the
   nested demo app serves it verbatim). It carries the project facts + the `getFiles` sections;
   `run_lock` is deliberately not derived (page-level only — the sidebar's write-only gating
   covers showcase/demo). The query is gated on the leaf's SPA verdict — an unflipped leaf's
   `SsrHandoff` must not issue a sidebar BFF read.
4. **Codec compatibility**: `filesOpen`/`filesWidth` are removed keys; the v2 codec is total
   over known keys so a pre-change blob parses with defaults and never re-serializes the keys.
   The `files` pane action is gone from `IdeAction`; `reserved-chords.json` needs no row
   (chords only — no files chord existed).
5. **DOM contract**: `data-files`, `data-files-mode`, `data-ide-files-toggle`, `data-current`
   retired in the same change; the tree hooks are `data-shell-project`,
   `data-shell-current-project`, `data-project-item`, `data-project-tree` plus the existing
   `data-files-pane` family; `data-lock-badge` declares the frozen/working Badge (B10).
6. **Keyboard walk**: `role="tree"/"treeitem"/"group"` markup in `ui/files-pane.tsx` (SSR-safe,
   no DOM lib); the ARIA-treeview arrow-key walk lives at the mount site
   (`spa/app-shell.tsx`'s `onProjectTreeKeyDown`) — the same mount-side DOM rule as the other
   islands.
7. **Demo-boot variant**: the demo sidebar renders the project section from the demo twins
   only (`demoDataSource.getFiles` behind `/bff/p/demo~*`) — no workspace read issues (P4-3).

## Consequences

- `.ide-rail`/`.ide-files` CSS, LAYOUT rail/files widths, `paneDrag`'s files arm, Files
  overlay/session state, `filesBody`/`sourceHref` chrome props — all deleted. The ADR-128
  collapse order is now panel → margin.
- The SSR phone document keeps `.ide-phonebar` only (`!hosted`); its Files/rail markup is gone.
- `U1.shell` extended to reach all seven items from the Page; still `expected:"red"` (held
  ready-to-flip → 250, D-R7SHELL.2-1).

## Revisit trigger

- 236_R7HOME.2b lands "outline exists" coherence or a real Project settings page — the
  `settings` item's target and the tree's outline source then take the landed shape.
- 243's Versions/compare surfaces gain an index route — the `versions` item re-points from
  `/v/working`.
- 248 re-enables rail/Files-strip hooks for any surface, or the tour targets the retired
  `data-files*` hooks — the alias window in `dom-contract.ts` closes then.
- 250_R7DEP.2's staged `U1.shell` walk fails a step — the failing item's target/active map
  is the first suspect.
