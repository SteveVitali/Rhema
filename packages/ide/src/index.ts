export type { ViewMode, DeskTab, PaneState, PaneLayout, LayoutInput } from "./layout.js";
export { paneLayout, paneDrag, snapTo } from "./layout.js";
export {
  PANE_STORAGE_VERSION,
  DEFAULT_PANE_STATE,
  paneStorageKey,
  parsePaneState,
  serializePaneState,
} from "./state.js";
export {
  APP_THEMES,
  PAPER_THEMES,
  THEME_STORAGE_KEY,
  paperStorageKey,
  parseAppTheme,
  parsePaperTheme,
  resolveAppTheme,
  cyclePaperTheme,
  cycleAppTheme,
  themeBootScript,
} from "./theme.js";
export type { AppTheme, PaperTheme } from "./theme.js";
export { VIEW_MODES, VIEW_MENU_TOGGLES, viewMenuModel, viewMenuIds } from "./view-menu.js";
export type { ViewMenuItem } from "./view-menu.js";
export { CONTROL_DISCLOSURE, controlVisible } from "./disclosure.js";
export type { DisclosureTier } from "./disclosure.js";
// P1.05 — the live feed's row formatter (SSR + island share it; REQ-IDE-14).
export { feedTabForContractDensity, feedRowVisible, formatFeedRow } from "./feed-row.js";
export type { FeedDensityTab, FeedLabelMaps } from "./feed-row.js";
// P1.06 — the §5.12 keymap dispatcher + the ⌘K palette model (REQ-IDE-49, REQ-CHAT-28).
export { dispatchIdeKey, CHEAT_SHEET } from "./keymap.js";
export type { FocusZone, KeyChord, IdeAction } from "./keymap.js";
export { buildPalette, paletteModel, commandForVerb } from "./palette.js";
export type { PaletteData, PaletteModel, PaletteRow, PaletteSection, PaletteTarget, CommandRowModel } from "./palette.js";
// P1.06 — the selection popover + the Timeline context-menu item models (§7.4; REQ-CHAT-22).
export { selectionMenuItems, contextMenuItems } from "./menus.js";
export type { CommandMenuItem } from "./menus.js";
