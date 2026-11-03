// R7FIX.1 (REQ-PANE-0 / REQ-WRITE-4) — the OFFLINE occlusion harness: the real `<IdeShell>`
// markup + the real `ideCss()`/`themeCss()` loaded into bundled Chromium, measured at the four
// Stage-B reference sizes (1440×900, 1280×800, 1024×768, 820×1180) plus the 1440×757 laptop
// height and the 1279/1280 boundary. No network, no app — the fixture pins pane geometry, the
// scrim, the Desk-head/status-bar gap, and the focus-exit pill against real layout. The
// controller→attribute half is pinned by the happy-dom legs in
// apps/web/src/spa/ide-chrome.dom.test.tsx; the two halves cover the full path.
//
// Needs bundled Chromium (pnpm --filter @rhema/journeys exec playwright install chromium); on a
// dev box without browsers this file skips — under CI a missing browser is a real failure.

import { describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { renderToStaticMarkup } from "react-dom/server";
import { createElement as h } from "react";
import { IdeShell } from "@rhema/ui";
import { ideCss, themeCss } from "@rhema/tokens";
import { paneLayout, DEFAULT_PANE_STATE } from "@rhema/ide";

const LABELS = {
  rail: { home: "Home", inbox: "Inbox", settings: "Settings", project: "Project navigation" },
  files: { heading: "Files", empty: "empty", close: "Close Files", open: "Files", sourceFile: "Source" },
  margin: { heading: "Findings", ticksLabel: "Finding markers" },
  timeline: { heading: "Timeline", empty: "No runs yet", close: "Close Timeline" },
  desk: {
    heading: "Desk",
    tabs: { chat: "Chat", feed: "Live feed", findings: "Findings", claims: "Claims" },
    emptyChat: "e", emptyFeed: "e", emptyFindings: "e", emptyClaims: "e",
    findingsTable: { finding: "Finding", severity: "Severity", kind: "Kind", status: "Status" },
    close: "Close Desk",
  },
  statusBar: {
    view: "View", theme: "Theme", paper: "Paper",
    creditsFmt: "{n} cr", versionPrefix: "", wordsFmt: "{n} words", readMinFmt: "{n} min",
  },
  viewMenu: {
    heading: "View",
    views: { write: "Write", read: "Read", focus: "Focus" },
    findingCards: "Finding cards", suggestionsInline: "Inline suggestions", authorship: "Authorship",
    advanced: "Advanced", fontSerif: "Serif", fontSans: "Sans",
    readerBigger: "Bigger", readerSmaller: "Smaller", timeline: "Timeline",
  },
  themes: { dark: "Dark", light: "Light", auto: "Auto", paperLight: "Light", paperFollow: "Follow", paperDark: "Dark" },
  palette: { dialogLabel: "Palette", placeholder: "Search", emptyLabel: "Empty", sectionLabels: {} },
  cheatsheet: { heading: "Keys", closeLabel: "Close" },
  focusExit: "Exit focus · Esc",
};

interface FixtureOpts {
  files?: "strip" | "open";
  timeline?: "open" | "closed";
  timelineMode?: string;
  filesMode?: string;
  desk?: "open" | "closed";
  view?: "write" | "read" | "focus";
}

function fixture(opts: FixtureOpts = {}): string {
  const markup = renderToStaticMarkup(
    h(
      IdeShell,
      {
        project: { slug: "alpha", title: "Alpha" },
        userId: "u1",
        projectId: "p1",
        findings: [
          { id: "f1", severity: "blocking", kind: "claim", excerpt: "claim one" },
          { id: "f2", severity: "minor", kind: "claim", excerpt: "claim two" },
        ],
        labels: LABELS,
      },
      h("div", null, "page text ".repeat(80)),
    ),
  );
  // stamp the pane attrs the controller derives from paneLayout() — `data-open` on the timeline
  // aside rides its effective open state.
  const stamped = markup
    .replace('data-timeline="closed"', `data-timeline="${opts.timeline ?? "closed"}"`)
    .replace('data-files="strip"', `data-files="${opts.files ?? "strip"}"`)
    .replace('data-desk="closed"', `data-desk="${opts.desk ?? "closed"}"`)
    .replace('data-view="write"', `data-view="${opts.view ?? "write"}"`);
  const modes = `data-pane-mode="wide" ${opts.timelineMode ? `data-timeline-mode="${opts.timelineMode}"` : ""} ${opts.filesMode ? `data-files-mode="${opts.filesMode}"` : ""}${opts.timeline === "open" ? " data-open-set" : ""}`;
  const final = stamped.replace("<aside class=\"ide-timeline\"", `<aside class="ide-timeline"${opts.timeline === "open" ? " data-open" : ""}`);
  return `<!doctype html><html><head><style>${themeCss("dark")}${ideCss()}</style></head><body style="margin:0">${final.replace('data-ide="1"', `data-ide="1" ${modes}`)}</body></html>`;
}

let browser: Browser | undefined;
async function getBrowser(): Promise<Browser | undefined> {
  if (browser) return browser;
  try {
    browser = await chromium.launch({ headless: true });
    return browser;
  } catch {
    return undefined;
  }
}

interface Probe {
  boxes: Record<string, { x: number; y: number; w: number; h: number } | null>;
  positions: Record<string, string>;
  scrimShown: boolean;
  covers: Record<string, string | null>;
}

async function probe(
  opts: FixtureOpts,
  w: number,
  hgt: number,
): Promise<Probe | null> {
  const b = await getBrowser();
  if (!b) return null;
  const page = await b.newPage({ viewport: { width: w, height: hgt } });
  try {
    await page.setContent(fixture(opts));
    return await page.evaluate(() => {
      const box = (sel: string) => {
        const el = document.querySelector(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return { x: r.left, y: r.top, w: r.width, h: r.height };
      };
      const center = (sel: string) => {
        const el = document.querySelector<HTMLElement>(sel);
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return at === el || el.contains(at) ? null : at ? `${at.tagName}.${at.className}` : "(none)";
      };
      const scrim = document.querySelector<HTMLElement>("[data-ide-scrim]");
      return {
        boxes: {
          paper: box(".ide-page .paper"),
          timeline: box(".ide-timeline"),
          files: box(".ide-files"),
          margin: box(".ide-margin"),
          deskHead: box(".ide-desk-head"),
          statusbar: box(".ide-statusbar"),
          page: box(".ide-page"),
        },
        positions: {
          timeline: document.querySelector(".ide-timeline") ? getComputedStyle(document.querySelector(".ide-timeline") as Element).position : "(none)",
          files: getComputedStyle(document.querySelector(".ide-files") as Element).position,
        },
        scrimShown: scrim != null && getComputedStyle(scrim).display !== "none",
        covers: {
          deskTab: center("[data-ide-desk-tab='chat']"),
          paperCenter: center(".ide-page .paper"),
        },
      };
    });
  } finally {
    await page.close();
  }
}

const intersects = (
  a: { x: number; y: number; w: number; h: number } | null,
  b: { x: number; y: number; w: number; h: number } | null,
): boolean => a != null && b != null && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("REQ-PANE-0 — offline occlusion harness (the U3.stopgap Stage-A evidence)", () => {
  it("1440×900 + Files open: the Timeline DOCKS (no overlay arm) and the Page column reflows under it", async () => {
    const p = await probe({ files: "open", timeline: "open", filesMode: "open", timelineMode: "pane" }, 1440, 900);
    if (!p) {
      if (process.env.CI) throw new Error("playwright chromium missing under CI");
      console.warn("playwright browsers not installed — skipping layout assertions");
      return;
    }
    // paneLayout() says: docked at ≥1280 — the <1600 arm carries no overlay.
    expect(paneLayout(1440, { ...DEFAULT_PANE_STATE, filesOpen: true, hasFindings: true }).timeline).toBe("pane");
    expect(p.positions.timeline).not.toBe("absolute");
    // B1 — the Page column reflows: its box never intersects the docked Timeline's.
    expect(intersects(p.boxes.paper, p.boxes.timeline)).toBe(false);
    // …and nothing un-scrimmed sits over the paper's centre point.
    expect(p.covers.paperCenter).toBeNull();
  }, 60_000);

  it("1280×800 stays docked; 1279 goes overlay+scrim (the paneLayout()↔CSS boundary)", async () => {
    const b = await getBrowser();
    if (!b) {
      if (process.env.CI) throw new Error("playwright chromium missing under CI");
      console.warn("playwright browsers not installed — skipping layout assertions");
      return;
    }
    for (const [w, expectedMode] of [[1280, "pane"], [1279, "overlay"]] as const) {
      const opts: FixtureOpts =
        expectedMode === "pane"
          ? { timeline: "open", timelineMode: "pane" }
          : { timeline: "open", timelineMode: "overlay" };
      const p = await probe(opts, w, 800);
      expect(paneLayout(w, { ...DEFAULT_PANE_STATE, hasFindings: true }).timeline).toBe(expectedMode);
      expect(p?.positions.timeline, `timeline position at ${w}`).toBe(expectedMode === "overlay" ? "absolute" : "static");
      expect(p?.scrimShown, `scrim at ${w}`).toBe(expectedMode === "overlay");
      if (expectedMode === "overlay") {
        // the scrimmed overlay may cover the paper — the scrim, never bare chrome, is what sits
        // between them.
        expect(p.scrimShown).toBe(true);
      } else {
        expect(intersects(p?.boxes.paper ?? null, p?.boxes.timeline ?? null)).toBe(false);
      }
    }
  }, 90_000);

  it("1024×768: the open overlay carries a scrim that covers the Page (never un-scrimmed)", async () => {
    const p = await probe({ timeline: "open", timelineMode: "overlay" }, 1024, 768);
    if (!p) {
      if (process.env.CI) throw new Error("playwright chromium missing under CI");
      return;
    }
    expect(p.positions.timeline).toBe("absolute");
    expect(p.scrimShown).toBe(true);
    // the scrim sits between the page and the overlay — the paper's centre hit-tests the scrim.
    expect(p.covers.paperCenter).toBe("DIV.ide-scrim");
  }, 60_000);

  it("820×1180: the sheet is scrimmed too; a closed Timeline covers nothing", async () => {
    const open = await probe({ timeline: "open", timelineMode: "sheet" }, 820, 1180);
    if (!open) {
      if (process.env.CI) throw new Error("playwright chromium missing under CI");
      return;
    }
    expect(open.positions.timeline).toBe("absolute");
    expect(open.scrimShown).toBe(true);
    const closed = await probe({ timeline: "closed", timelineMode: "sheet" }, 820, 1180);
    expect(closed?.scrimShown).toBe(false);
    expect(intersects(closed?.boxes.paper ?? null, closed?.boxes.timeline ?? null)).toBe(false);
  }, 90_000);

  it("the Desk head never intersects the status bar — 1440×757 laptop height and the four sizes", async () => {
    const b = await getBrowser();
    if (!b) {
      if (process.env.CI) throw new Error("playwright chromium missing under CI");
      return;
    }
    for (const [w, hgt] of [[1440, 757], [1440, 900], [1280, 800], [1024, 768], [820, 1180]] as const) {
      const p = await probe({ desk: "open" }, w, hgt);
      // B2 — the head's box sits strictly above the status bar's and a tab is clickable.
      expect(intersects(p?.boxes.deskHead ?? null, p?.boxes.statusbar ?? null), `desk head ∩ statusbar @${w}×${hgt}`).toBe(false);
      expect(p?.covers.deskTab, `desk tab covered @${w}×${hgt}`).toBeNull();
    }
  }, 120_000);

  it("the focus-view exit pill: hidden until hover or keyboard focus, present only in focus view", async () => {
    const b = await getBrowser();
    if (!b) {
      if (process.env.CI) throw new Error("playwright chromium missing under CI");
      return;
    }
    const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
    try {
      await page.setContent(fixture({ view: "focus" }));
      const pill = page.locator("[data-ide-focus-exit]");
      expect(await pill.count()).toBe(1);
      const before = await pill.evaluate((el) => getComputedStyle(el).opacity);
      expect(before).toBe("0");
      await pill.hover();
      await page.waitForTimeout(300); // the --dur-pane reveal transition
      const onHover = await pill.evaluate((el) => getComputedStyle(el).opacity);
      expect(onHover).toBe("1");
      // keyboard reveal: focus is the pill's other entry path.
      await page.evaluate(() => {
        (document.activeElement as HTMLElement | null)?.blur();
        (document.querySelector("[data-ide-focus-exit]") as HTMLElement).focus();
      });
      await page.waitForTimeout(300);
      const onFocus = await pill.evaluate((el) => getComputedStyle(el).opacity);
      expect(onFocus).toBe("1");
      // outside focus view it never mounts an affordance.
      await page.setContent(fixture({ view: "write" }));
      const hidden = await page.locator("[data-ide-focus-exit]").evaluate((el) => getComputedStyle(el).display);
      expect(hidden).toBe("none");
    } finally {
      await page.close();
    }
  }, 60_000);
});
