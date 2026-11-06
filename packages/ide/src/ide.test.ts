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
import { ideCss, LAYOUT } from "@rhema/tokens";

const input = (over: Partial<LayoutInput> = {}): LayoutInput => ({
  ...DEFAULT_PANE_STATE,
  hasFindings: true,
  ...over,
});

describe("paneLayout() — the REQ-PANE-2 breakpoint table", () => {
  const hosted = (over: Partial<LayoutInput> = {}): LayoutInput =>
    input({ hosted: true, sidebarOpen: true, ...over });
  it("≥1440: sidebar expanded; the panel docks open by default when findings exist", () => {
    const l = paneLayout(1600, hosted());
    expect(l.margin).toBe("cards");
    expect(l.panel).toBe("docked");
    expect(l.panelOpen).toBe(true); // the derived default — never persisted until toggled
    expect(l.sidebar).toBe("expanded");
    expect(l.rail).toBe("visible");
    expect(l.statusBar).toBe("visible");
    // no findings ⇒ the default is closed, and the Margin hides
    expect(paneLayout(1600, hosted({ hasFindings: false })).panelOpen).toBe(false);
    // a stored intent always wins over the derived default
    expect(paneLayout(1600, hosted({ panelOpen: false, hasFindings: true })).panelOpen).toBe(false);
    expect(paneLayout(1600, hosted({ panelOpen: true, hasFindings: false })).panelOpen).toBe(true);
  });
  it("1280–1439: the panel docks; an open panel rails the sidebar", () => {
    const closed = paneLayout(1300, hosted({ panelOpen: false }));
    expect(closed.panel).toBe("docked");
    expect(closed.panelOpen).toBe(false);
    expect(closed.sidebar).toBe("expanded");
    const open = paneLayout(1300, hosted({ panelOpen: true }));
    expect(open.panelOpen).toBe(true);
    expect(open.sidebar).toBe("rail");
  });
  it("1024–1279: sidebar rail; the panel is an overlay (session intent only)", () => {
    const closed = paneLayout(1100, hosted({ panelOpen: true }));
    expect(closed.panel).toBe("overlay");
    expect(closed.sidebar).toBe("rail");
    expect(closed.panelOpen).toBe(true); // the session intent passes through verbatim
    expect(paneLayout(1100, hosted()).panelOpen).toBe(false); // closed by default
    expect(paneLayout(1279, hosted()).margin).toBe("ticks");
  });
  it("768–1023: sidebar drawer; the panel is a sheet (the Files pane is deleted — R7SHELL.2)", () => {
    const l = paneLayout(820, hosted({ panelOpen: true }));
    expect(l.mode).toBe("single");
    expect(l.sidebar).toBe("drawer");
    expect(l.panel).toBe("sheet");
    expect(l.panelOpen).toBe(true);
  });
  it("<768: phone — the non-hosted reader hides every pane; hosted panes become sheets", () => {
    const ssr = paneLayout(390, input({ panelOpen: true }));
    expect(ssr.mode).toBe("phone");
    expect(ssr.page).toBe("reader");
    expect(ssr.rail).toBe("hidden");
    expect(ssr.margin).toBe("hidden");
    expect(ssr.panel).toBe("hidden");
    expect(ssr.panelOpen).toBe(false);
    expect(ssr.statusBar).toBe("hidden");
    const hostedPhone = paneLayout(390, hosted({ panelOpen: true }));
    expect(hostedPhone.panel).toBe("sheet");
    expect(hostedPhone.sidebar).toBe("drawer");
  });
  it("Focus view: only the Page + finding ticks remain", () => {
    const l = paneLayout(1920, hosted({ view: "focus", panelOpen: true }));
    expect(l.rail).toBe("hidden");
    expect(l.panel).toBe("hidden");
    expect(l.panelOpen).toBe(false);
    expect(l.statusBar).toBe("hidden");
    expect(l.margin).toBe("ticks");
    expect(l.page).toBe("reader");
  });
  it("no findings ⇒ the Margin is hidden, not tick-collapsed", () => {
    expect(paneLayout(1600, hosted({ hasFindings: false })).margin).toBe("hidden");
  });
  it("View-menu 'finding cards off' forces ticks even when wide", () => {
    expect(paneLayout(1600, hosted({ findingCards: false })).margin).toBe("ticks");
  });
  it("Page measure clamps to the 80-ch ceiling", () => {
    // 4000px frame with everything closed → Page would exceed 80 ch; clamped.
    const l = paneLayout(4000, hosted({ panelOpen: false, hasFindings: false }));
    expect(l.pageCh).toBe(80);
  });
  it("the ADR-128 collapse order: panel → closed, margin → hidden — before the page drops below 45 ch", () => {
    // R7SHELL.2 — Files is gone, so the panel is the first yield now; the margin is second.
    const over = hosted({ panelOpen: true, panelWidth: 900 });
    const l = paneLayout(1280, over);
    expect(l.panelOpen).toBe(false); // step 1 — the panel yields
    // …and the floor is always restored at ≥768: the widest panes at the narrowest docked width
    for (const w of [768, 1024, 1280, 1440]) {
      const worst = paneLayout(w, hosted({ panelOpen: true, panelWidth: 480 }));
      expect(worst.pageCh).toBeGreaterThanOrEqual(LAYOUT.pageMinCh);
    }
    // no `files` key exists on the layout verdict (the region is deleted, not hidden).
    expect("files" in l).toBe(false);
    expect("filesOpen" in l).toBe(false);
  });
});

describe("paneDrag() — the Page clamp collapses the adjacent pane", () => {
  const st = (over: Partial<PaneState> = {}): PaneState => ({ ...DEFAULT_PANE_STATE, ...over });
  it("a panel drag below the minimum closes it", () => {
    expect(paneDrag(st(), "panel", 90, 1920).panelOpen).toBe(false);
    // …but a width the frame can't hold even after every yield refuses the dragged pane.
    expect(paneDrag(st(), "panel", 1100, 1600).panelOpen).toBe(false);
  });
  it("a legal panel drag snaps to the snap points (R7SHELL.2: the Files drag is gone)", () => {
    const next = paneDrag(st(), "panel", 330, 1920);
    expect(next.panelOpen).toBe(true);
    expect(next.panelWidth).toBe(320); // snapped from 330 → 320
  });
});

describe("REQ-PANE-2 — the emitted CSS stays in parity with paneLayout() at every boundary", () => {
  // The ideCss() media blocks render paneLayout()'s table with zero JS. This pins each arm
  // against the function's own verdict at that width, so the two can never drift.
  const css = ideCss();
  const mediaBlock = (maxWidth: number, minWidth?: number): string => {
    const start = css.indexOf(minWidth != null ? `@media (min-width: ${minWidth}px) and (max-width: ${maxWidth}px) {` : `@media (max-width: ${maxWidth}px) {`);
    if (start < 0) return "";
    const rest = css.slice(start);
    const end = rest.indexOf("\n}");
    return end < 0 ? rest : rest.slice(0, end);
  };
  it("the media-query breakpoints ARE the LAYOUT tokens (no magic numbers)", () => {
    for (const bp of [LAYOUT.bpNarrowPx, LAYOUT.bpSingleColumnPx, LAYOUT.bpPhonePx]) {
      expect(css).toContain(`max-width: ${bp - 1}px`);
    }
  });
  it("<1280: Margin → ticks and NO panel overlay arm in that block (the Page reflows)", () => {
    expect(paneLayout(1280 - 1, input({ panelOpen: false })).margin).toBe("ticks");
    const block = mediaBlock(1280 - 1);
    expect(block).toContain(".ide-margin");
    expect(block).not.toContain(".ide-panel[data-open]");
  });
  it("1024–1279: Margin → ticks and the panel → scrimmed overlay", () => {
    expect(paneLayout(1280 - 1, input()).panel).toBe("overlay");
    // margin→ticks rides the single <1280 arm (it also covers the hosted <768 narrow-desktop);
    // the panel overlay arm is the ranged block.
    const ticks = mediaBlock(1280 - 1);
    expect(ticks).toContain(".ide-margin");
    const block = mediaBlock(1280 - 1, 1024);
    expect(block).toContain(".ide-panel[data-open] { position: absolute");
  });
  it("768–1023: the panel → sheet (the Files overlay arm is deleted — R7SHELL.2)", () => {
    expect(paneLayout(1024 - 1, input()).panel).toBe("sheet");
    // one <1024 arm covers the sheet (it also serves the hosted <768 surface; the
    // SSR phone hides the regions outright in the <768 block).
    const block = mediaBlock(1024 - 1);
    expect(block).toContain(".ide-panel[data-open] { position: absolute");
    expect(block).not.toContain(".ide-files");
  });
  it("<768: phone — every region display:none for the SSR reader", () => {
    expect(paneLayout(767, input()).mode).toBe("phone");
    const block = mediaBlock(768 - 1);
    expect(block).toContain("display: none !important");
  });
  it("the overlay/sheet scrim arms only under an open overlay-mode pane", () => {
    expect(css).toContain(".ide-scrim");
    expect(css).toContain("[data-panel='open'][data-panel-mode='overlay'] .ide-scrim");
    expect(css).toContain("[data-panel='open'][data-panel-mode='sheet'] .ide-scrim");
    // R7SHELL.2 — no Files scrim arm may exist.
    expect(css).not.toContain("data-files");
  });
  it("the sidebar advisory CSS exists for rail + drawer (REQ-PANE-2)", () => {
    expect(css).toContain(".app-shell[data-ide-sidebar='rail'] .app-shell-sidebar");
    expect(css).toContain(".app-shell[data-ide-sidebar='drawer'] .app-shell-sidebar");
  });
});

describe("pane persistence (per user + project, never the URL)", () => {
  it("round-trips the codec and keys storage by user+project", () => {
    const s = { ...DEFAULT_PANE_STATE, panelTab: "feed" as const, panelOpen: true, advanced: true };
    expect(parsePaneState(serializePaneState(s))).toEqual(s);
    expect(paneStorageKey("u1", "p1")).not.toBe(paneStorageKey("u1", "p2"));
    expect(paneStorageKey("u1", "p1")).not.toBe(paneStorageKey("u2", "p1"));
  });
  it("panelOpen stays three-state: absent means 'derive the default'", () => {
    const blob = serializePaneState(DEFAULT_PANE_STATE);
    expect(JSON.parse(blob)).not.toHaveProperty("panelOpen");
    expect(parsePaneState(blob).panelOpen).toBeUndefined();
    // an explicit intent round-trips
    expect(parsePaneState(serializePaneState({ ...DEFAULT_PANE_STATE, panelOpen: false })).panelOpen).toBe(false);
  });
  it("a malformed or wrong-version blob falls back to defaults — never throws", () => {
    expect(parsePaneState("not json")).toEqual(DEFAULT_PANE_STATE);
    expect(parsePaneState('{"v":99,"filesOpen":true}')).toEqual(DEFAULT_PANE_STATE);
    expect(parsePaneState(null)).toEqual(DEFAULT_PANE_STATE);
    // R7SHELL.2 — a pre-change v2 blob's removed keys (`filesOpen`/`filesWidth`) are ignored:
    // the read is total and yields the defaults for the deleted fields.
    const stale = parsePaneState('{"v":2,"filesOpen":true,"filesWidth":480,"panelOpen":true}');
    expect("filesOpen" in stale).toBe(false);
    expect("filesWidth" in stale).toBe(false);
    expect(stale.panelOpen).toBe(true);
  });
  it("v1→v2 migration is total: an open Desk wins the tab; open Timeline maps the timeline tab", () => {
    // both open ⇒ the Desk's tab + a concrete open intent; the Timeline width is the panel width
    const m = parsePaneState('{"v":1,"view":"read","filesOpen":true,"filesWidth":320,"timelineOpen":true,"timelineWidth":400,"deskOpen":true,"deskHeight":280,"deskTab":"feed","findingCards":false,"advanced":true,"readerStep":2}');
    expect(m).toEqual({
      view: "read",
      panelOpen: true,
      panelWidth: 400,
      panelTab: "feed",
      findingCards: false,
      suggestionsInline: true,
      advanced: true,
      readerStep: 2,
    });
    // Desk closed + Timeline open ⇒ the timeline tab
    expect(parsePaneState('{"v":1,"timelineOpen":true,"deskOpen":false,"deskTab":"claims"}')).toMatchObject({ panelOpen: true, panelTab: "timeline" });
    // both closed ⇒ closed panel on the Desk's last tab
    expect(parsePaneState('{"v":1,"timelineOpen":false,"deskOpen":false,"deskTab":"claims"}')).toMatchObject({ panelOpen: false, panelTab: "claims" });
    // a v1 blob with garbage v2-era keys is ignored per-key
    expect(parsePaneState('{"v":1,"panelTab":"bogus","deskTab":"feed","deskOpen":true}')).toMatchObject({ panelTab: "feed" });
  });
  it("REQ-WRITE-4 — view=focus is session-scoped: never serialized, never restored (R7FIX.1)", () => {
    // a stored blob carrying focus (written by pre-R7FIX.1 code or by ?focus=1) coerces to write —
    // the rest of the arrangement survives.
    const stored = serializePaneState({ ...DEFAULT_PANE_STATE, view: "focus", panelOpen: true });
    expect(JSON.parse(stored)).toMatchObject({ view: "write", panelOpen: true });
    expect(parsePaneState('{"v":2,"view":"focus","filesOpen":true}')).toMatchObject({
      view: "write",
    });
    // write/read round-trip unchanged.
    for (const view of ["write", "read"] as const) {
      expect(parsePaneState(serializePaneState({ ...DEFAULT_PANE_STATE, view })).view).toBe(view);
    }
  });
});

describe("theme policy (REQ-IDE-38 amended)", () => {
  it("auto resolves against the OS; literal prefs pass through", () => {
    expect(resolveAppTheme("auto", true)).toBe("light");
    expect(resolveAppTheme("auto", false)).toBe("dark");
    expect(resolveAppTheme("light", false)).toBe("light");
    expect(resolveAppTheme("dark", true)).toBe("dark");
  });
  it("⇧T cycles the paper theme light → follow → dark → light (R7WRITE.2's re-homed chord)", () => {
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
  it("is Write/Read/Focus + the right panel (R7PANE.1 on-demand path) + finding cards + inline suggestions + Authorship (P1.02) + Advanced", () => {
    expect(viewMenuIds("write")).toEqual([
      "view.write",
      "view.read",
      "view.focus",
      "panel",
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
  it("the §5.1 Advanced members are classified advanced and gated through the `v` View menu", () => {
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
