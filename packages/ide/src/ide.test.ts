// P1.01 — the IDE shell's deterministic spec tests: §5.1 yield order at the named breakpoints, the Page
// clamp + collapse-instead-of-violate drags, the persistence codec, the theme cycles + boot script, the
// View menu's exact contents, and the disclosure table.

import { describe, it, expect } from "vitest";
import {
  paneLayout,
  paneDrag,
  DEFAULT_PANE_STATE,
  parsePaneState,
  serializePaneState,
  paneStorageKey,
  resolveAppTheme,
  cyclePaperTheme,
  cycleAppTheme,
  parseAppTheme,
  parsePaperTheme,
  themeBootScript,
  viewMenuIds,
  viewMenuModel,
  CONTROL_DISCLOSURE,
  controlVisible,
} from "./index.js";
import type { LayoutInput, PaneState } from "./index.js";

const input = (over: Partial<LayoutInput> = {}): LayoutInput => ({
  ...DEFAULT_PANE_STATE,
  hasFindings: true,
  ...over,
});

describe("paneLayout() — the §5.1 yield order", () => {
  it("1600px: all regions up — files strip by default, margin cards, timeline pane", () => {
    const l = paneLayout(1600, input());
    expect(l.files).toBe("strip");
    expect(l.margin).toBe("cards");
    expect(l.timeline).toBe("pane");
    expect(l.rail).toBe("visible");
    expect(l.statusBar).toBe("visible");
    expect(l.desk).toBe("closed");
  });
  it("1600px with Files open: Margin → ticks and Timeline → overlay", () => {
    const l = paneLayout(1600 - 1, input({ filesOpen: true }));
    expect(l.files).toBe("open");
    expect(l.margin).toBe("ticks");
    expect(l.timeline).toBe("overlay");
    // but at ≥1600 with files open, margin stays cards and timeline stays a pane
    const wide = paneLayout(1600, input({ filesOpen: true }));
    expect(wide.margin).toBe("cards");
    expect(wide.timeline).toBe("pane");
  });
  it("1280px boundary: still full; below 1280 margin→ticks + timeline→overlay regardless of Files", () => {
    const at = paneLayout(1280, input());
    expect(at.margin).toBe("cards");
    expect(at.timeline).toBe("pane");
    const below = paneLayout(1280 - 1, input());
    expect(below.margin).toBe("ticks");
    expect(below.timeline).toBe("overlay");
  });
  it("1024px boundary: below it the open Timeline becomes a sheet and open Files an overlay", () => {
    const l = paneLayout(1024 - 1, input({ filesOpen: true }));
    expect(l.mode).toBe("single");
    expect(l.files).toBe("overlay");
    expect(l.timeline).toBe("sheet");
  });
  it("~768px: phone — reader-only Page; rail/files/timeline/desk/status all hide", () => {
    const l = paneLayout(767, input({ filesOpen: true, deskOpen: true }));
    expect(l.mode).toBe("phone");
    expect(l.page).toBe("reader");
    expect(l.rail).toBe("hidden");
    expect(l.files).toBe("hidden");
    expect(l.margin).toBe("hidden");
    expect(l.timeline).toBe("hidden");
    expect(l.desk).toBe("hidden");
    expect(l.statusBar).toBe("hidden");
  });
  it("Focus view: only the Page + finding ticks remain", () => {
    const l = paneLayout(1920, input({ view: "focus", filesOpen: true, deskOpen: true }));
    expect(l.rail).toBe("hidden");
    expect(l.files).toBe("hidden");
    expect(l.timeline).toBe("hidden");
    expect(l.desk).toBe("hidden");
    expect(l.statusBar).toBe("hidden");
    expect(l.margin).toBe("ticks");
    expect(l.page).toBe("reader");
  });
  it("no findings ⇒ the Margin is hidden, not tick-collapsed", () => {
    expect(paneLayout(1600, input({ hasFindings: false })).margin).toBe("hidden");
  });
  it("View-menu 'finding cards off' forces ticks even when wide", () => {
    expect(paneLayout(1600, input({ findingCards: false })).margin).toBe("ticks");
  });
  it("Page measure clamps to the 80-ch ceiling", () => {
    // 4000px frame with everything closed → Page would exceed 80 ch; clamped.
    const l = paneLayout(4000, input({ timelineOpen: false, hasFindings: false }));
    expect(l.pageCh).toBe(80);
  });
});

describe("paneDrag() — the Page clamp collapses the adjacent pane", () => {
  const st = (over: Partial<PaneState> = {}): PaneState => ({ ...DEFAULT_PANE_STATE, ...over });
  it("a Files drag below the minimum collapses to the strip", () => {
    expect(paneDrag(st({ filesOpen: true }), "files", 100, 1920).filesOpen).toBe(false);
  });
  it("a Files drag that would shrink Page below 45ch collapses Files instead", () => {
    // 1600px, timeline already at its widest pane (480): a 480-px Files leaves the Page ≈31ch.
    const next = paneDrag(st({ timelineWidth: 480 }), "files", 480, 1600);
    expect(next.filesOpen).toBe(false);
    // …and the same drag at a wider viewport is legal.
    expect(paneDrag(st({ timelineWidth: 480 }), "files", 480, 2000).filesOpen).toBe(true);
  });
  it("a legal Files drag snaps to the snap points", () => {
    const next = paneDrag(st(), "files", 250, 1920);
    expect(next.filesOpen).toBe(true);
    expect(next.filesWidth).toBe(240); // snapped from 250 → 240
  });
  it("a Timeline drag below the minimum closes it; a violating width collapses it", () => {
    expect(paneDrag(st(), "timeline", 90, 1920).timelineOpen).toBe(false);
    // 1600px with Files at its widest: a 480-px Timeline leaves the Page ≈31ch → collapse.
    const next = paneDrag(st({ filesOpen: true, filesWidth: 480 }), "timeline", 480, 1600);
    expect(next.timelineOpen).toBe(false);
    expect(paneDrag(st({ filesOpen: true, filesWidth: 480 }), "timeline", 480, 2000).timelineOpen).toBe(true);
  });
  it("a Desk drag below the minimum closes the drawer", () => {
    expect(paneDrag(st({ deskOpen: true }), "desk", 40, 1920).deskOpen).toBe(false);
  });
});

describe("pane persistence (per user + project, never the URL)", () => {
  it("round-trips the codec and keys storage by user+project", () => {
    const s = { ...DEFAULT_PANE_STATE, filesOpen: true, deskTab: "feed" as const, advanced: true };
    expect(parsePaneState(serializePaneState(s))).toEqual(s);
    expect(paneStorageKey("u1", "p1")).not.toBe(paneStorageKey("u1", "p2"));
    expect(paneStorageKey("u1", "p1")).not.toBe(paneStorageKey("u2", "p1"));
  });
  it("a malformed or wrong-version blob falls back to defaults — never throws", () => {
    expect(parsePaneState("not json")).toEqual(DEFAULT_PANE_STATE);
    expect(parsePaneState('{"v":99,"filesOpen":true}')).toEqual(DEFAULT_PANE_STATE);
    expect(parsePaneState(null)).toEqual(DEFAULT_PANE_STATE);
    // partial keys merge over defaults
    expect(parsePaneState('{"v":1,"filesOpen":true}').filesOpen).toBe(true);
    expect(parsePaneState('{"v":1,"filesOpen":true}').timelineOpen).toBe(true);
  });
});

describe("theme policy (REQ-IDE-38 amended)", () => {
  it("auto resolves against the OS; literal prefs pass through", () => {
    expect(resolveAppTheme("auto", true)).toBe("light");
    expect(resolveAppTheme("auto", false)).toBe("dark");
    expect(resolveAppTheme("light", false)).toBe("light");
    expect(resolveAppTheme("dark", true)).toBe("dark");
  });
  it("⌘⇧L cycles the paper theme light → follow → dark → light", () => {
    expect(cyclePaperTheme("light")).toBe("follow");
    expect(cyclePaperTheme("follow")).toBe("dark");
    expect(cyclePaperTheme("dark")).toBe("light");
  });
  it("the app theme cycles dark → light → auto → dark", () => {
    expect(cycleAppTheme("dark")).toBe("light");
    expect(cycleAppTheme("light")).toBe("auto");
    expect(cycleAppTheme("auto")).toBe("dark");
  });
  it("parsers fall back: app → dark, paper → light (the pinned-light default)", () => {
    expect(parseAppTheme("bogus")).toBe("dark");
    expect(parsePaperTheme("bogus")).toBe("light");
    expect(parsePaperTheme(undefined)).toBe("light");
  });
  it("the boot script is a synchronous, dependency-free IIFE that sets data-theme + data-paper", () => {
    const s = themeBootScript();
    expect(s).toContain("data-theme");
    expect(s).toContain("data-paper");
    expect(s).toContain("prefers-color-scheme: light");
    expect(s).toContain("localStorage");
    expect(s).not.toContain("import");
    expect(s.startsWith("!function()")).toBe(true);
  });
});

describe("the View menu (§5.1 — exact contents; Source absent)", () => {
  it("is Write/Read/Focus + finding cards + inline suggestions + Authorship (P1.02) + Advanced", () => {
    expect(viewMenuIds("write")).toEqual([
      "view.write",
      "view.read",
      "view.focus",
      "findingCards",
      "suggestionsInline",
      "authorship",
      "advanced",
    ]);
  });
  it("Source is NEVER a View-menu entry (it lives in Files, under Advanced)", () => {
    for (const v of ["write", "read", "focus"] as const) {
      expect(viewMenuIds(v)).not.toContain("source");
      expect(viewMenuIds(v).join()).not.toMatch(/source/i);
    }
  });
  it("inline-suggestions hides in Focus (it's a Write/Read toggle)", () => {
    expect(viewMenuModel("focus").map((t) => t.id)).not.toContain("suggestionsInline");
    expect(viewMenuModel("write").map((t) => t.id)).toContain("suggestionsInline");
    // P1.02 — the Authorship overlay is also a Write/Read toggle (Focus is the clean read).
    expect(viewMenuModel("focus").map((t) => t.id)).not.toContain("authorship");
    expect(viewMenuModel("read").map((t) => t.id)).toContain("authorship");
  });
});

describe("progressive disclosure (§5.1 three tiers)", () => {
  it("the §5.1 Advanced members are classified advanced and gated by ⌘⇧M", () => {
    for (const c of ["view.source", "raw.tokens", "model.tier", "model.names", "memory.files", "restore.old", "feed.verbose"]) {
      expect(CONTROL_DISCLOSURE[c], c).toBe("advanced");
      expect(controlVisible(c, false), `${c} hidden`).toBe(false);
      expect(controlVisible(c, true), `${c} shown`).toBe(true);
    }
  });
  it("default and on-demand controls are never gated", () => {
    expect(controlVisible("page.read", false)).toBe(true);
    expect(controlVisible("desk.chat", false)).toBe(true);
    expect(controlVisible("unclassified.future", false)).toBe(true);
  });
});
