// The View menu's exact contents (§5.1 View menu; REQ-IDE-12): view Write·Read·Focus (a radio group —
// Focus is a view), then the toggles: finding cards on/off, inline suggestions on/off (visible only in
// Write/Read), Advanced ⌘⇧M. "Source" is NOT a View-menu entry — the source pane is a file in Files
// (§5.1's ruling; it only appears under Advanced inside the Files pane). The ticket test asserts Source's
// absence.

import type { ViewMode } from "./layout.js";
import { shortcutFor } from "./keymap.js";

export interface ViewMenuItem {
  readonly id: string;
  /** which views the row is visible in — absent ⇒ always. */
  readonly inViews?: readonly ViewMode[];
  /** the generated chord glyph (REQ-KEYS-2 — from the keymap, never hand-typed). */
  readonly keys?: string | null;
}

/** The View menu's radio group — exactly Write · Read · Focus (Focus carries the `f` chord). */
export const VIEW_MODES: readonly { id: ViewMode; keys?: string | null }[] = [
  { id: "write" },
  { id: "read" },
  { id: "focus", keys: shortcutFor("focus-mode") },
] as const;

/** The View menu's toggle rows, in order. `authorship` is P1.02's overlay (read-only decorations over
 *  the Page's blocks — off by default; it is session state, not pane state). R7FIX.1 (REQ-PANE-0)
 *  adds `panel` first — R7PANE.1's right-panel toggle, the on-demand pointer path below 1280
 *  where the panel is closed by default; the island renders it as `data-ide-panel-toggle`
 *  (overlay modes never persist). */
export const VIEW_MENU_TOGGLES: readonly ViewMenuItem[] = [
  { id: "panel", keys: shortcutFor("pane:panel") },
  { id: "findingCards" },
  { id: "suggestionsInline", inViews: ["write", "read"] },
  { id: "authorship", inViews: ["write", "read"] },
  { id: "advanced" },
] as const;

/** The exact, ordered view-menu model the shell renders (labels live in @rhema/ui's label table). */
export function viewMenuModel(view: ViewMode): readonly ViewMenuItem[] {
  return VIEW_MENU_TOGGLES.filter((t) => !t.inViews || t.inViews.includes(view));
}

/** Every id the menu can render — tests assert "source" is never among them (§5.1). */
export function viewMenuIds(view: ViewMode): string[] {
  return [...VIEW_MODES.map((m) => `view.${m.id}`), ...viewMenuModel(view).map((t) => t.id)];
}
