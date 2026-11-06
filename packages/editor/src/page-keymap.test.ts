// REQ-KEYS-1 (239) — the committed base-keymap list stays honest: `BASE_KEYMAP_CHORDS` lives in
// @rhema/contracts as data (the leaf package — no ProseMirror import, so the entry bundle never
// pulls the editor through the keymap checker), and THIS test owns the coverage assertion: every
// key in the real `pcBaseKeymap` + `macBaseKeymap` objects must be named in the list. A PM
// upgrade that adds a binding fails here instead of drifting silently.

import { describe, expect, it } from "vitest";
import { macBaseKeymap, pcBaseKeymap } from "prosemirror-commands";
import { BASE_KEYMAP_CHORDS, pmKeyToChord } from "@rhema/contracts/page-keymap";

describe("BASE_KEYMAP_CHORDS — the committed base-keymap coverage", () => {
  it("names every key in the real pcBaseKeymap + macBaseKeymap objects (no drift)", () => {
    const committed = new Set(BASE_KEYMAP_CHORDS.map((b) => b.actionKind.replace(/^pm:base:/, "")));
    for (const pmKey of Object.keys({ ...pcBaseKeymap, ...macBaseKeymap })) {
      expect(committed.has(pmKey), `committed list covers ${pmKey}`).toBe(true);
    }
    // and the list carries no phantom keys the upstream maps don't define
    const upstream = { ...pcBaseKeymap, ...macBaseKeymap };
    for (const key of committed) {
      expect(key in upstream, `${key} exists upstream`).toBe(true);
    }
  });

  it("canonicalizes PM key names the same way the checker reads chords", () => {
    expect(pmKeyToChord("Mod-Enter")).toBe("mod+enter");
    expect(pmKeyToChord("Shift-Mod-z")).toBe("mod+shift+z");
    expect(pmKeyToChord("Ctrl-Alt-Backspace")).toBe("mod+alt+backspace");
    expect(pmKeyToChord("Alt-d")).toBe("alt+d");
    expect(pmKeyToChord("Tab")).toBe("tab");
  });
});
