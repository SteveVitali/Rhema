// REQ-KEYS-1/2 (239_R7WRITE.2) — the Page key-binding table moved to @rhema/contracts (the leaf
// package): this module re-exports it so the package's own barrel keeps one import site, and
// plugins.ts builds its `keymap()` from the same rows the checker + bubble hints read.

export type { PageKeyBinding } from "@rhema/contracts/page-keymap";
export { PAGE_KEYMAP, BASE_KEYMAP_CHORDS, pageShortcutFor, pmKeyToChord } from "@rhema/contracts/page-keymap";
