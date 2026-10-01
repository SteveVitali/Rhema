import { describe, expect, it } from "vitest";
import { dispatchIdeKey, type KeyChord } from "./keymap.js";

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
    ["1", {}, { kind: "pane", pane: "files" }],
    ["2", {}, { kind: "pane", pane: "timeline" }],
    ["j", {}, { kind: "pane", pane: "desk" }],
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

  it("[ and ] step versions (not while typing)", () => {
    expect(dispatchIdeKey(bare("["), "none")).toEqual({ kind: "version-prev" });
    expect(dispatchIdeKey(bare("]"), "none")).toEqual({ kind: "version-next" });
    expect(dispatchIdeKey(bare("["), "page")).toBeNull();
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
