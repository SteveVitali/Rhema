// REQ-KEYS-1/2 (239_R7WRITE.2) — the Page editor's key bindings as DATA, in the LEAF package so
// both consumers can read it without dragging the editor into the entry bundle: `pagePlugins()`
// (@rhema/editor) builds its `keymap()` from this table (the command set lives beside the
// schema), the reserved-chords checker (@rhema/ide) pins every row, and the format bubble's
// hints (`pageShortcutFor`) render from the same rows — no hand-typed chord anywhere.
// Every row carries `scope:"editor"` for the checker: inside the focused editor the user's own
// conventions (⌘B/⌘I/⌘Z…) are the expected chords — Rule 1 still applies (reserved-chords.ts).

export interface PageKeyBinding {
  /** the prosemirror-keymap key name (`Mod-z`, `Shift-Mod-z`, `Tab`). */
  readonly pmKey: string;
  /** the canonical chord the checker reads (`mod+z`, `mod+shift+z`, `tab`). */
  readonly chord: string;
  /** the display glyph (`⌘B`, `⌘I`) the format bubble/tooltips show. */
  readonly keys: string;
  /** the command discriminator plugins.ts resolves (`mark:strong`, `undo`, `list-sink`). */
  readonly actionKind: string;
  /** checker scope — editor-local bindings (Rule 1 only). */
  readonly scope: "editor";
}

export const PAGE_KEYMAP: readonly PageKeyBinding[] = [
  { pmKey: "Mod-z", chord: "mod+z", keys: "⌘Z", actionKind: "undo", scope: "editor" },
  { pmKey: "Mod-y", chord: "mod+y", keys: "⌘Y", actionKind: "redo", scope: "editor" },
  { pmKey: "Shift-Mod-z", chord: "mod+shift+z", keys: "⌘⇧Z", actionKind: "redo", scope: "editor" },
  { pmKey: "Mod-b", chord: "mod+b", keys: "⌘B", actionKind: "mark:strong", scope: "editor" },
  { pmKey: "Mod-i", chord: "mod+i", keys: "⌘I", actionKind: "mark:em", scope: "editor" },
  { pmKey: "Mod-`", chord: "mod+`", keys: "⌘`", actionKind: "mark:code", scope: "editor" },
  { pmKey: "Mod-Shift-s", chord: "mod+shift+s", keys: "⌘⇧S", actionKind: "mark:strike", scope: "editor" },
  { pmKey: "Enter", chord: "enter", keys: "⏎", actionKind: "split", scope: "editor" },
  { pmKey: "Backspace", chord: "backspace", keys: "⌫", actionKind: "join-backward", scope: "editor" },
  { pmKey: "Mod-Backspace", chord: "mod+backspace", keys: "⌘⌫", actionKind: "delete-selection", scope: "editor" },
  { pmKey: "Tab", chord: "tab", keys: "⇥", actionKind: "list-sink", scope: "editor" },
  { pmKey: "Shift-Tab", chord: "shift+tab", keys: "⇧⇥", actionKind: "list-lift", scope: "editor" },
];

/** The display glyph a bubble item/tooltip shows for one Page-editor command (REQ-KEYS-2). */
export function pageShortcutFor(actionKind: string): string | null {
  return PAGE_KEYMAP.find((b) => b.actionKind === actionKind)?.keys ?? null;
}

/** `Mod-Shift-z` → `mod+shift+z`; `Tab` → `tab`. `Mod`/`Ctrl` both canonicalize to `mod` — the
 *  checker's ⌘/Ctrl umbrella. */
export function pmKeyToChord(pmKey: string): string {
  const parts = pmKey.split("-");
  const key = parts.pop() ?? pmKey;
  const mods = new Set<string>();
  for (const p of parts) {
    if (p === "Mod" || p === "Ctrl") mods.add("mod");
    else if (p === "Alt") mods.add("alt");
    else if (p === "Shift") mods.add("shift");
  }
  const canon: string[] = [];
  if (mods.has("mod")) canon.push("mod");
  if (mods.has("alt")) canon.push("alt");
  if (mods.has("shift")) canon.push("shift");
  canon.push(key.toLowerCase()); // canonical key names are case-folded (`Enter` → `enter`)
  return canon.join("+");
}

/**
 * The upstream `keymap(baseKeymap)` rows — BOTH platform variants, committed as data so the leaf
 * package stays ProseMirror-free (the entry-bundle budget). The coverage test in
 * packages/editor asserts this list names every key in `pcBaseKeymap` + `macBaseKeymap`, so a
 * PM upgrade that adds a binding fails the check instead of drifting silently.
 */
export const BASE_KEYMAP_CHORDS: readonly { readonly chord: string; readonly actionKind: string; readonly scope: "editor" }[] = [
  // the exact pc + mac rows (prosemirror-commands 1.7), canonicalized through pmKeyToChord
  "Enter", "Mod-Enter", "Backspace", "Mod-Backspace", "Shift-Backspace", "Delete", "Mod-Delete",
  "Mod-a", "Ctrl-h", "Alt-Backspace", "Ctrl-d", "Ctrl-Alt-Backspace", "Alt-Delete", "Alt-d",
  "Ctrl-a", "Ctrl-e",
].map((pmKey) => ({
  chord: pmKeyToChord(pmKey),
  actionKind: `pm:base:${pmKey}`,
  scope: "editor" as const,
}));
