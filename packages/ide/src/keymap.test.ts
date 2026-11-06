import { describe, expect, it } from "vitest";
import { CHEAT_SHEET, dispatchIdeKey, IDE_KEYMAP, shortcutFor, type KeyChord } from "./keymap.js";
import { chordViolations } from "./reserved-chords.js";

const chord = (key: string, over: Partial<KeyChord> = {}): KeyChord => ({
  key,
  metaKey: true,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...over,
});
const bare = (key: string, over: Partial<KeyChord> = {}): KeyChord => chord(key, { metaKey: false, ...over });

describe("§5.12 keymap — global mod chords", () => {
  it.each([
    ["k", {}, { kind: "palette" }],
    // REQ-KEYS-1 (R7SHELL.1a) — ⌘1/⌘2/⌘J are retired (Rule 2's number-key row); the pane chords
    // are `[`/`]` now (asserted below).
    ["1", {}, null],
    ["2", {}, null],
    ["j", {}, null],
    ["m", { shiftKey: true }, { kind: "view-menu" }],
    ["f", { shiftKey: true }, { kind: "focus-mode" }],
    ["l", { shiftKey: true }, { kind: "paper-theme" }],
    ["t", { shiftKey: true }, { kind: "triage" }],
    ["s", {}, { kind: "restore-point" }],
    ["r", { shiftKey: true }, { kind: "run-next" }],
    ["d", { shiftKey: true }, { kind: "sheet", workflow: "draft" }],
    ["e", { shiftKey: true }, { kind: "sheet", workflow: "review" }],
    ["v", { shiftKey: true }, { kind: "sheet", workflow: "revise" }],
    ["c", { shiftKey: true }, { kind: "compare-previous" }],
    ["g", {}, { kind: "goto-approval" }],
    ["i", {}, { kind: "inbox" }],
    [",", {}, { kind: "settings" }],
    ["z", {}, { kind: "undo" }],
    ["z", { shiftKey: true }, { kind: "redo" }],
  ])("⌘%s %j → %j", (key, over, action) => {
    expect(dispatchIdeKey(chord(key, over), "none")).toEqual(action);
  });

  it("⌘⇧A is reserved — dispatches nothing", () => {
    expect(dispatchIdeKey(chord("a", { shiftKey: true }), "none")).toBeNull();
  });

  it("ctrlKey counts as mod (non-mac)", () => {
    expect(dispatchIdeKey(chord("k", { metaKey: false, ctrlKey: true }), "none")).toEqual({ kind: "palette" });
  });
});

describe("§5.12 — bare keys and focus scoping", () => {
  it("? opens the cheat sheet (not while typing)", () => {
    expect(dispatchIdeKey(bare("?", { shiftKey: true }), "none")).toEqual({ kind: "cheatsheet" });
    expect(dispatchIdeKey(bare("?"), "input")).toBeNull();
    expect(dispatchIdeKey(bare("?"), "page")).toBeNull();
  });

  // REQ-KEYS-1 (R7SHELL.1a) — `[` toggles the AppShell sidebar, `]` toggles the right-side pane
  // (the Timeline today; 229 retargets); version stepping moved to the provisional ⌥-bracket pair.
  it("[ toggles the sidebar and ] the right-side pane (not while typing)", () => {
    expect(dispatchIdeKey(bare("["), "none")).toEqual({ kind: "sidebar" });
    expect(dispatchIdeKey(bare("]"), "none")).toEqual({ kind: "pane", pane: "timeline" });
    expect(dispatchIdeKey(bare("["), "page")).toBeNull();
    expect(dispatchIdeKey(bare("]"), "input")).toBeNull();
  });

  it("⌥[ and ⌥] step versions (the provisional pair, not while typing)", () => {
    expect(dispatchIdeKey(bare("[", { altKey: true }), "none")).toEqual({ kind: "version-prev" });
    expect(dispatchIdeKey(bare("]", { altKey: true }), "none")).toEqual({ kind: "version-next" });
    expect(dispatchIdeKey(bare("[", { altKey: true }), "page")).toBeNull();
  });

  it("bare / opens the palette in command mode", () => {
    expect(dispatchIdeKey(bare("/"), "none")).toEqual({ kind: "palette" });
  });

  it.each(["page", "input"] as const)("findings chords are INERT in %s (caret-safe)", (zone) => {
    for (const k of ["j", "k", "p", "a", "d", "r", "f", "e", "Enter", "Escape"]) {
      expect(dispatchIdeKey(bare(k), zone)).toBeNull();
    }
    // even ⌥ chords stay inert in the Page
    expect(dispatchIdeKey(bare("j", { altKey: true }), zone)).toBeNull();
  });

  it("findings chords dispatch only under Margin/Findings focus", () => {
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

  it("input focus narrows mod chords to ⌘K only (the field keeps its editing)", () => {
    expect(dispatchIdeKey(chord("k"), "input")).toEqual({ kind: "palette" });
    expect(dispatchIdeKey(chord("s"), "input")).toBeNull();
    expect(dispatchIdeKey(chord("1"), "input")).toBeNull();
  });
});

describe("REQ-KEYS-1 — the reserved-chords checker (R7SHELL.1a)", () => {
  it("every committed binding passes the rules", () => {
    expect(chordViolations(IDE_KEYMAP)).toEqual([]);
  });

  it("fails on a planted ⌘1 binding (Rule 2's number-key row)", () => {
    const v = chordViolations([{ chord: "mod+1", actionKind: "pane:files" }]);
    expect(v).toEqual([{ chord: "mod+1", action: "pane:files", verdict: "conventional-avoid" }]);
  });

  it("fails on a planted second ⌘⇧T action (transitional pins the ONE grandfathered action)", () => {
    const v = chordViolations([{ chord: "mod+shift+t", actionKind: "sidebar" }]);
    expect(v).toEqual([{ chord: "mod+shift+t", action: "sidebar", verdict: "transitional-mismatch" }]);
    // …while the grandfathered triage binding itself still passes.
    expect(chordViolations([{ chord: "mod+shift+t", actionKind: "triage" }])).toEqual([]);
  });

  it("fails on a non-capturable chord even when keep-listed actions bind elsewhere", () => {
    const v = chordViolations([{ chord: "mod+t", actionKind: "palette" }]);
    expect(v).toEqual([{ chord: "mod+t", action: "palette", verdict: "non-capturable" }]);
  });

  it("every mod/bare binding in the table still dispatches its declared action", () => {
    // Drive each table row's chord through the dispatcher — the table can't drift from the map.
    const zones: Record<string, "none" | "findings"> = { findings: "findings" };
    const toChord = (ch: string): KeyChord => ({
      key: ch.split("+").pop()!,
      metaKey: ch.startsWith("mod+"),
      ctrlKey: false,
      shiftKey: ch.includes("shift+"),
      altKey: ch.startsWith("alt+"),
    });
    for (const b of IDE_KEYMAP) {
      if (b.actionKind.startsWith("finding-disposition:") || b.chord === "/") continue;
      const zone = b.scope === "findings" ? zones.findings! : "none";
      const action = dispatchIdeKey(toChord(b.chord), zone);
      const want = b.actionKind.split(":")[0];
      expect(action?.kind ?? "(null)", `${b.keys} → ${b.actionKind}`).toBe(want);
    }
  });

  it("the cheat sheet + tooltips are generated from the keymap", () => {
    expect(CHEAT_SHEET.length).toBe(IDE_KEYMAP.length);
    expect(CHEAT_SHEET.map((r) => r.keys)).toEqual(IDE_KEYMAP.map((b) => b.keys));
    expect(shortcutFor("sidebar")).toBe("[");
    expect(shortcutFor("pane:timeline")).toBe("]");
    expect(shortcutFor("palette")).toBe("⌘K");
  });
});
