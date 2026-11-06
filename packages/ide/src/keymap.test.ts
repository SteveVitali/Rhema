import { describe, expect, it } from "vitest";
import { BASE_KEYMAP_CHORDS, PAGE_KEYMAP, pageShortcutFor } from "@rhema/contracts/page-keymap";
import { BUBBLE_MARK_HINTS } from "./menus.js";
import {
  canonicalChord, CHEAT_SHEET, dispatchIdeKey, IDE_KEYMAP, ISLAND_CHORDS, matchesChord, shortcutFor,
  type FocusZone, type KeyChord,
} from "./keymap.js";
import { chordViolations, RESERVED_CHORDS } from "./reserved-chords.js";
// the evidence fields (sources / old→new / keep reasons / layout note) are read straight from
// the JSON — the file is deliberately NOT exported through a runtime module (entry bundle).
import RESERVED_CHORD_EVIDENCE from "./reserved-chords-evidence.json" with { type: "json" };

const chord = (key: string, over: Partial<KeyChord> = {}): KeyChord => ({
  key,
  metaKey: true,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
});
const bare = (key: string, over: Partial<KeyChord> = {}): KeyChord => chord(key, { metaKey: false, ...over });

describe("REQ-KEYS-1 (239) — the re-homed global map", () => {
  it.each([
    ["k", {}, { kind: "palette" }],
    ["Enter", {}, { kind: "run-sheet" }],
    ["s", {}, { kind: "restore-point" }],
    ["z", {}, { kind: "undo" }],
    ["z", { shiftKey: true }, { kind: "redo" }],
    // every retired conventional chord now dispatches NOTHING
    ["m", { shiftKey: true }, null],
    ["f", { shiftKey: true }, null],
    ["l", { shiftKey: true }, null],
    ["t", { shiftKey: true }, null],
    ["r", { shiftKey: true }, null],
    ["d", { shiftKey: true }, null],
    ["e", { shiftKey: true }, null],
    ["v", { shiftKey: true }, null],
    ["c", { shiftKey: true }, null],
    ["g", {}, null],
    ["i", {}, null],
    [",", {}, null],
    ["1", {}, null],
    ["2", {}, null],
    ["j", {}, null],
  ])("⌘%s %j → %j", (key, over, action) => {
    expect(dispatchIdeKey(chord(key, over), "none")).toEqual(action);
  });

  it("ctrlKey counts as mod (non-mac)", () => {
    expect(dispatchIdeKey(chord("k", { metaKey: false, ctrlKey: true }), "none")).toEqual({ kind: "palette" });
  });

  it("the single-key re-homes dispatch in chrome zones", () => {
    expect(dispatchIdeKey(bare("v"), "none")).toEqual({ kind: "view-menu" });
    expect(dispatchIdeKey(bare("f"), "none")).toEqual({ kind: "focus-mode" });
    expect(dispatchIdeKey(bare("t"), "none")).toEqual({ kind: "triage" });
    expect(dispatchIdeKey(bare("t", { shiftKey: true }), "none")).toEqual({ kind: "paper-theme" });
    expect(dispatchIdeKey(bare("c"), "none")).toEqual({ kind: "compare-previous" });
    expect(dispatchIdeKey(bare("h"), "none")).toEqual({ kind: "version-prev" });
    expect(dispatchIdeKey(bare("l"), "none")).toEqual({ kind: "version-next" });
  });

  it("the provisional ⌥[ / ⌥] pair is gone (final home is h / l)", () => {
    expect(dispatchIdeKey(bare("[", { altKey: true }), "none")).toBeNull();
    expect(dispatchIdeKey(bare("]", { altKey: true }), "none")).toBeNull();
  });
});

describe("REQ-KEYS-1 — the two-key sequences (Rule 3)", () => {
  it("g arms the go-to prefix; p/i/v/s complete it", () => {
    expect(dispatchIdeKey(bare("g"), "none")).toEqual({ kind: "prefix", prefix: "g" });
    expect(dispatchIdeKey(bare("p"), "none", "g")).toEqual({ kind: "goto-projects" });
    expect(dispatchIdeKey(bare("i"), "none", "g")).toEqual({ kind: "inbox" });
    expect(dispatchIdeKey(bare("v"), "none", "g")).toEqual({ kind: "goto-voices" });
    expect(dispatchIdeKey(bare("s"), "none", "g")).toEqual({ kind: "settings" });
  });

  it("r arms the run prefix; d/r/v/n complete it", () => {
    expect(dispatchIdeKey(bare("r"), "none")).toEqual({ kind: "prefix", prefix: "r" });
    expect(dispatchIdeKey(bare("d"), "none", "r")).toEqual({ kind: "sheet", workflow: "draft" });
    expect(dispatchIdeKey(bare("r"), "none", "r")).toEqual({ kind: "sheet", workflow: "review" });
    expect(dispatchIdeKey(bare("v"), "none", "r")).toEqual({ kind: "sheet", workflow: "revise" });
    expect(dispatchIdeKey(bare("n"), "none", "r")).toEqual({ kind: "run-next" });
  });

  it("an unknown second key lapses the prefix and dispatches normally", () => {
    expect(dispatchIdeKey(bare("?"), "none", "g")).toEqual({ kind: "cheatsheet" });
    expect(dispatchIdeKey(bare("["), "none", "r")).toEqual({ kind: "sidebar" });
    expect(dispatchIdeKey(bare("x"), "none", "g")).toBeNull();
  });

  it("prefixes are inert while typing (input/page/source zones)", () => {
    for (const zone of ["input", "page", "source"] as const) {
      expect(dispatchIdeKey(bare("g"), zone)).toBeNull();
      expect(dispatchIdeKey(bare("p"), zone, "g")).toBeNull();
      expect(dispatchIdeKey(bare("d"), zone, "r")).toBeNull();
    }
  });
});

describe("§5.12 — bare keys and focus scoping", () => {
  it("? opens the cheat sheet (not while typing)", () => {
    expect(dispatchIdeKey(bare("?", { shiftKey: true }), "none")).toEqual({ kind: "cheatsheet" });
    expect(dispatchIdeKey(bare("?"), "input")).toBeNull();
    expect(dispatchIdeKey(bare("?"), "page")).toBeNull();
  });

  it("[ toggles the sidebar and ] the right-side pane (not while typing)", () => {
    expect(dispatchIdeKey(bare("["), "none")).toEqual({ kind: "sidebar" });
    expect(dispatchIdeKey(bare("]"), "none")).toEqual({ kind: "pane", pane: "panel" });
    expect(dispatchIdeKey(bare("["), "page")).toBeNull();
    expect(dispatchIdeKey(bare("]"), "input")).toBeNull();
  });

  it("bare / opens the palette in command mode", () => {
    expect(dispatchIdeKey(bare("/"), "none")).toEqual({ kind: "palette" });
  });

  it.each(["page", "input", "source"] as const)("findings chords are INERT in %s (caret-safe)", (zone) => {
    for (const k of ["j", "k", "p", "a", "d", "r", "f", "e", "Enter", "Escape"]) {
      expect(dispatchIdeKey(bare(k), zone)).toBeNull();
    }
    // even ⌥ chords stay inert in the Page
    expect(dispatchIdeKey(bare("j", { altKey: true }), zone)).toBeNull();
  });

  it("findings chords dispatch only under Margin/Findings focus — and win over the global bare map there", () => {
    expect(dispatchIdeKey(bare("j"), "margin")).toEqual({ kind: "finding-next" });
    expect(dispatchIdeKey(bare("k"), "findings")).toEqual({ kind: "finding-prev" });
    expect(dispatchIdeKey(bare("p"), "margin")).toEqual({ kind: "finding-apply" });
    expect(dispatchIdeKey(bare("a"), "findings")).toEqual({ kind: "finding-disposition", disposition: "accept" });
    expect(dispatchIdeKey(bare("d"), "findings")).toEqual({ kind: "finding-disposition", disposition: "adapt" });
    expect(dispatchIdeKey(bare("r"), "findings")).toEqual({ kind: "finding-disposition", disposition: "rebut" });
    expect(dispatchIdeKey(bare("f"), "findings")).toEqual({ kind: "finding-disposition", disposition: "defer" });
    expect(dispatchIdeKey(bare("e"), "findings")).toEqual({ kind: "finding-disposition", disposition: "escalate" });
    expect(dispatchIdeKey(bare("Enter"), "findings")).toEqual({ kind: "finding-open" });
    expect(dispatchIdeKey(bare("Escape"), "findings")).toEqual({ kind: "finding-escape" });
    expect(dispatchIdeKey(bare("j", { altKey: true }), "findings")).toEqual({ kind: "finding-anchor-next" });
    // but NOT in the none zone (bare keys don't fire on bare chrome)
    expect(dispatchIdeKey(bare("j"), "none")).toBeNull();
  });

  it("the findings chords keep their zone precedence — `r`/`f` are Rebut/Defer, never the prefixes", () => {
    expect(dispatchIdeKey(bare("r"), "findings")).toEqual({ kind: "finding-disposition", disposition: "rebut" });
    expect(dispatchIdeKey(bare("f"), "margin")).toEqual({ kind: "finding-disposition", disposition: "defer" });
    // and the unclaimed global keys still fire in those zones
    expect(dispatchIdeKey(bare("g"), "findings")).toEqual({ kind: "prefix", prefix: "g" });
    expect(dispatchIdeKey(bare("t"), "margin")).toEqual({ kind: "triage" });
    expect(dispatchIdeKey(bare("d"), "findings", "r")).toEqual({ kind: "sheet", workflow: "draft" });
  });

  it("input focus narrows mod chords to ⌘K only (the field keeps its editing)", () => {
    expect(dispatchIdeKey(chord("k"), "input")).toEqual({ kind: "palette" });
    expect(dispatchIdeKey(chord("s"), "input")).toBeNull();
    expect(dispatchIdeKey(chord("1"), "input")).toBeNull();
  });
});

describe("REQ-KEYS-1 Rule 5 — the source focus zone (CodeMirror wins)", () => {
  const ALL_MOD = ["k", "s", "g", "i", ",", "z", "m", "f", "l", "t", "r", "d", "e", "v", "c", "Enter"];
  it("only ⌘S dispatches in source focus — the buffer's commit mint", () => {
    for (const k of ALL_MOD) {
      const want = k === "s" ? { kind: "restore-point" } : null;
      expect(dispatchIdeKey(chord(k), "source"), `⌘${k}`).toEqual(want);
      expect(dispatchIdeKey(chord(k, { shiftKey: true }), "source"), `⌘⇧${k}`).toBeNull();
    }
  });

  it("⌘⏎ belongs to CodeMirror in source (CM's insertBlankLine wins over the run sheet)", () => {
    expect(dispatchIdeKey(chord("Enter"), "source")).toBeNull();
    // …while on the Page it still opens the run sheet (Rule 4).
    expect(dispatchIdeKey(chord("Enter"), "page")).toEqual({ kind: "run-sheet" });
  });

  it("every bare key is inert in source (typing — sequences never arm)", () => {
    for (const k of ["g", "r", "f", "t", "v", "c", "h", "l", "[", "]", "?", "/", "j"]) {
      expect(dispatchIdeKey(bare(k), "source"), k).toBeNull();
    }
  });
});

describe("REQ-KEYS-1 — the reserved-chords checker (extended)", () => {
  it("every committed binding passes the rules (the complete table)", () => {
    expect(chordViolations(IDE_KEYMAP)).toEqual([]);
  });

  it("the ProseMirror Page keymap + upstream base maps pass (editor scope — Rule 1 only)", () => {
    expect(chordViolations(PAGE_KEYMAP)).toEqual([]);
    expect(chordViolations(BASE_KEYMAP_CHORDS)).toEqual([]);
  });

  it("the island's out-of-dispatcher chords pass", () => {
    expect(chordViolations(ISLAND_CHORDS)).toEqual([]);
  });

  it("fails on a planted ⌘1 binding (Rule 2's number-key row)", () => {
    const v = chordViolations([{ chord: "mod+1", actionKind: "pane:files" }]);
    expect(v).toEqual([{ chord: "mod+1", action: "pane:files", verdict: "conventional-avoid" }]);
  });

  it("fails on a non-capturable chord even when keep-listed actions bind elsewhere", () => {
    const v = chordViolations([{ chord: "mod+t", actionKind: "palette" }]);
    expect(v).toEqual([{ chord: "mod+t", action: "palette", verdict: "non-capturable" }]);
  });

  it("fails on a planted conventional chord inside a sequence (each key is checked)", () => {
    const v = chordViolations([{ chord: "g mod+1", actionKind: "goto-projects" }]);
    expect(v).toEqual([{ chord: "g mod+1", action: "goto-projects", verdict: "conventional-avoid" }]);
  });

  it("fails on a planted conventional chord without the recorded exception — the seeded fixture", () => {
    // a fixture binding table with a seeded ⌘, chord (Chrome settings) must not pass.
    const seeded = [...IDE_KEYMAP, { chord: "mod+,", keys: "⌘,", actionKind: "goto-voices", action: "Voices" }];
    expect(chordViolations(seeded)).toEqual([
      { chord: "mod+,", action: "goto-voices", verdict: "conventional-avoid" },
    ]);
  });

  it("the transitional grandfather map is empty — the remap is complete", () => {
    expect(Object.keys(RESERVED_CHORDS.transitional)).toEqual([]);
    // and a planted old grandfathered chord now fails as conventional-avoid, not transitional.
    const v = chordViolations([{ chord: "mod+shift+t", actionKind: "triage" }]);
    expect(v).toEqual([{ chord: "mod+shift+t", action: "triage", verdict: "conventional-avoid" }]);
  });

  it("the old→new table covers every pre-226 + 226-era action and carries sources + the layout note", () => {
    const actions = new Set(RESERVED_CHORD_EVIDENCE.oldToNew.map((r) => r.action));
    for (const a of [
      "palette", "view-menu", "focus-mode", "paper-theme", "triage", "restore-point",
      "run-next", "sheet:draft", "sheet:review", "sheet:revise", "goto-approval", "inbox",
      "settings", "compare-previous", "version-prev", "version-next", "cheatsheet",
    ]) {
      expect(actions.has(a), `old→new covers ${a}`).toBe(true);
    }
    for (const c of RESERVED_CHORDS.nonCapturable) {
      expect(RESERVED_CHORD_EVIDENCE.nonCapturableSources[c], `source for ${c}`).toBeTruthy();
    }
    expect(RESERVED_CHORD_EVIDENCE.layoutNote).toMatch(/layout/i);
    expect(RESERVED_CHORD_EVIDENCE.keepReasons["mod+s"]).toMatch(/save/i);
  });

  it("every mod/bare/sequence binding in the table still dispatches its declared action", () => {
    const toChord = (ch: string): { first: KeyChord; second: KeyChord | null } => {
      const parts = ch.split(" ");
      const one = (s: string): KeyChord => {
        const canon = s.split("+").pop()!;
        const key = canon.length === 1 ? canon : canon[0]!.toUpperCase() + canon.slice(1); // event-key casing
        return {
          key,
          metaKey: s.startsWith("mod+"),
          ctrlKey: false,
          shiftKey: s.includes("shift+"),
          altKey: s.startsWith("alt+"),
        };
      };
      return { first: one(parts[0]!), second: parts[1] ? one(parts[1]) : null };
    };
    const findingsKinds = new Set(["finding-disposition:accept", "finding-disposition:adapt", "finding-disposition:rebut", "finding-disposition:defer", "finding-disposition:escalate"]);
    for (const b of IDE_KEYMAP) {
      const zone: FocusZone = b.scope === "findings" ? "findings" : "none";
      const { first, second } = toChord(b.chord);
      const firstAction = dispatchIdeKey(first, zone);
      let action = firstAction;
      if (second != null) {
        expect(firstAction?.kind, `${b.keys} arms a prefix`).toBe("prefix");
        action = dispatchIdeKey(second, zone, firstAction?.kind === "prefix" ? firstAction.prefix : null);
      }
      const want = b.actionKind.split(":")[0];
      if (b.chord === "/" || findingsKinds.has(b.actionKind)) continue; // `/` shares palette; dispositions share a kind
      expect(action?.kind ?? "(null)", `${b.keys} → ${b.actionKind}`).toBe(want);
    }
  });

  it("the bubble's committed mark hints match the PM keymap's glyphs (REQ-KEYS-2 — no drift)", () => {
    expect(BUBBLE_MARK_HINTS.bold).toBe(pageShortcutFor("mark:strong"));
    expect(BUBBLE_MARK_HINTS.italic).toBe(pageShortcutFor("mark:em"));
    expect(BUBBLE_MARK_HINTS.link).toBe(shortcutFor("palette"));
  });

  it("the cheat sheet + tooltips are generated from the keymap", () => {
    expect(CHEAT_SHEET.length).toBe(IDE_KEYMAP.length);
    expect(CHEAT_SHEET.map((r) => r.keys)).toEqual(IDE_KEYMAP.map((b) => b.keys));
    expect(shortcutFor("sidebar")).toBe("[");
    expect(shortcutFor("pane:panel")).toBe("]");
    expect(shortcutFor("palette")).toBe("⌘K");
    expect(shortcutFor("inbox")).toBe("g i");
  });

  it("matchesChord drives the island's declared chords (⌘S restore point)", () => {
    for (const b of ISLAND_CHORDS) {
      expect(matchesChord({ key: "s", metaKey: true }, b.chord)).toBe(true);
    }
    expect(canonicalChord({ key: "t", shiftKey: true })).toBe("shift+t");
    expect(matchesChord({ key: "t", shiftKey: true }, "shift+t")).toBe(true);
    expect(matchesChord({ key: "s", metaKey: true }, "mod+enter")).toBe(false);
  });
});
