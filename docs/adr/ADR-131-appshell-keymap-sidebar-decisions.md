# ADR-131: AppShell decisions — sidebar collapse storage and the reserved-chords schema

- **Status:** accepted
- **Date:** 2026-11-05
- **Ticket:** 226_R7SHELL.1a (REQ-SHELL-1/2/6, REQ-KEYS-1)
- **Spec:** `docs/round-7-draft-spec.md` §4.5–§4.9 (ADR-128), RV-14/33

## Context

R7SHELL.1a lands the one persistent `AppShell` with the ADR-128 sidebar. Two sub-decisions were
ticket-owned and needed a home:

1. **Where the sidebar collapse preference lives.** The shell is the *same chrome* across every
   authenticated surface; the pref is a per-user convenience, never workspace data. Precedents in
   the tree: `rhema:panes:v1:<userId>:<projectId>` (IDE pane widths/heights, localStorage),
   `rhema:theme:v1` (app theme, localStorage mirrored to the server only as a courtesy write).
   A server-side settings read would add a twin + a query dependency to the shell's first paint
   for a purely cosmetic state.

2. **How the browser-safe keymap rules are checked.** REQ-KEYS-1 asks for the rules "as data"
   with a checker; RV-33 wants the tooltips and the `?` sheet generated from the keymap rather
   than hand-written beside it.

## Decision

1. The collapse state is `localStorage["rhema:sidebar:v1:<userId>"]` (`"collapsed"|"expanded"`).
   Per-user keyed — two users on one browser never share it — and degrades to session-only state
   when storage is unavailable. It is never a URL param, never server state, and never read by a
   leaf. `sidebarStorageKey(userId)` in `apps/web/src/spa/app-shell.tsx` is the single seam.
2. `packages/ide/src/reserved-chords.json` carries four sets: `nonCapturable` (Rule 1 — always
   illegal), `conventionalAvoid` (Rule 2), `keep` (Rule 4 — chords the spec keeps: ⌘K, ⌘⏎, ⌘S),
   and `transitional`, a chord→action map that pins each grandfathered conventional-avoid binding
   to its ONE existing action until 239_R7WRITE.2 retires the set. The checker
   (`chordViolations` in `reserved-chords.ts`) therefore fails both a planted ⌘1 binding and a
   second action planted on a grandfathered chord like ⌘⇧T. `IDE_KEYMAP` in `keymap.ts` is the
   committed binding table every dispatch chord is declared on; `CHEAT_SHEET` and `shortcutFor`
   are generated from it.

## Consequences

- The shell's first paint needs no network read for collapse; the pref cannot leak across users.
- 239's final keymap edits exactly the JSON's `transitional`/`conventionalAvoid` sets and the
  table — the checker keeps the drift channel closed in CI.
- ⌥[`/`⌥]` version stepping is explicitly provisional (marked in the table's comment) until 239.

## Revisit trigger

Revisit when 239_R7WRITE.2 finalizes the IDE keymap — the `transitional`/`conventionalAvoid`
sets and the provisional `⌥[`/`⌥]` version-stepping binding are designed to be edited then —
or when sidebar preferences need cross-device persistence (the per-user `localStorage` key is
intentionally device-local), or if a second authenticated-shell variant needs to share the
collapse seam with the workspace AppShell.
