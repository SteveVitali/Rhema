// R7PANE.1 (REQ-PANE-1/2/4, carried REQ-WRITE-4) — the OFFLINE occlusion harness: the real
// `<IdeShell>` markup + the real `ideCss()`/`themeCss()` loaded into bundled Chromium, measured
// at the REQ-PANE-4 sizes (1440×900, 1280×800, 1024×768, 820×1180) plus the 1279/1280 boundary.
// No network, no app — the fixture pins the right-panel geometry (docked/overlay/sheet), the
// scrim, and the focus-exit pill against real layout; the retired Desk's status-bar collision
// is gone with the drawer. The controller→attribute half is pinned by the happy-dom legs in
// apps/web/src/spa/ide-chrome.dom.test.tsx; the two halves cover the full path. The
// `U3.occlusion` leg re-asserts these checks against a deployed surface (held `ready-to-flip`).
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
  margin: { heading: "Findings", ticksLabel: "Finding markers" },
  timeline: { heading: "Timeline", empty: "No runs yet", close: "Close Timeline" },
  panel: {
    heading: "Panel",
    resize: "Resize the panel",
    tabs: { chat: "Chat", findings: "Findings", claims: "Claims", timeline: "Timeline", feed: "Live feed" },
    emptyChat: "e",
    emptyFeed: "e",
    emptyFindings: "e",
    emptyClaims: "e",
    findingsTable: { finding: "Finding", severity: "Severity", kind: "Kind", status: "Status" },
    close: "Close panel",
  },
  statusBar: {
    view: "View",
    theme: "Theme",
    paper: "Paper",
    creditsFmt: "{n} cr",
    versionPrefix: "",
    wordsFmt: "{n} words",
    readMinFmt: "{n} min",
  },
  viewMenu: {
    heading: "View",
    views: { write: "Write", read: "Read", focus: "Focus" },
    findingCards: "Finding cards",
    suggestionsInline: "Inline suggestions",
    authorship: "Authorship",
    advanced: "Advanced",
    fontSerif: "Serif",
    fontSans: "Sans",
    readerBigger: "Bigger",
    readerSmaller: "Smaller",
    panel: "Right panel",
  },
  themes: {
    dark: "Dark",
    light: "Light",
    auto: "Auto",
    paperLight: "Light",
    paperFollow: "Follow",
    paperDark: "Dark",
  },
  palette: {
    dialogLabel: "Palette",
    placeholder: "Search",
    emptyLabel: "Empty",
    sectionLabels: {},
  },
  cheatsheet: { heading: "Keys", closeLabel: "Close" },
  focusExit: "Exit focus · Esc",
};

interface FixtureOpts {
  panel?: "open" | "closed";
  panelMode?: string;
  view?: "write" | "read" | "focus";
}

function fixture(opts: FixtureOpts = {}): string {
  const markup = renderToStaticMarkup(
    h(
      IdeShell,
      {
        hosted: true,
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
  // stamp the pane attrs the controller derives from paneLayout() — `data-open` on the panel
  // aside rides its effective open state.
  const stamped = markup
    .replace('data-panel="closed"', `data-panel="${opts.panel ?? "closed"}"`)
    .replace('data-view="write"', `data-view="${opts.view ?? "write"}"`);
  const modes = `data-pane-mode="wide" ${opts.panelMode ? `data-panel-mode="${opts.panelMode}"` : ""}`;
  const final = stamped.replace(
    '<aside class="ide-panel"',
    `<aside class="ide-panel"${opts.panel === "open" ? " data-open" : ""}`,
  );
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

async function probe(opts: FixtureOpts, w: number, hgt: number): Promise<Probe | null> {
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
        return at === el || el.contains(at)
          ? null
          : at
            ? `${at.tagName}.${at.className}`
            : "(none)";
      };
      const scrim = document.querySelector<HTMLElement>("[data-ide-scrim]");
      return {
        boxes: {
          paper: box(".ide-page .paper"),
          panel: box(".ide-panel"),
          margin: box(".ide-margin"),
          panelHead: box(".ide-panel-head"),
          statusbar: box(".ide-statusbar"),
          page: box(".ide-page"),
        },
        positions: {
          panel: document.querySelector(".ide-panel")
            ? getComputedStyle(document.querySelector(".ide-panel") as Element).position
            : "(none)",
        },
        scrimShown: scrim != null && getComputedStyle(scrim).display !== "none",
        covers: {
          panelTab: center("[data-ide-panel-tab='chat']"),
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
): boolean =>
  a != null &&
  b != null &&
  a.x < b.x + b.w &&
  b.x < a.x + a.w &&
  a.y < b.y + b.h &&
  b.y < a.y + a.h;

describe("REQ-PANE-1/2/4 — offline occlusion harness (the U3.occlusion Stage-A evidence)", () => {
  it("1440×900 + panel open: the panel DOCKS (no overlay arm) and the Page column reflows under it", async () => {
    const p = await probe(
      { panel: "open", panelMode: "docked" },
      1440,
      900,
    );
    if (!p) {
      if (process.env.CI) throw new Error("playwright chromium missing under CI");
      console.warn("playwright browsers not installed — skipping layout assertions");
      return;
    }
    // paneLayout() says: docked at ≥1280 — the <1600 arm carries no overlay.
    expect(
      paneLayout(1440, { ...DEFAULT_PANE_STATE, panelOpen: true, hasFindings: true }).panel,
    ).toBe("docked");
    expect(p.positions.panel).not.toBe("absolute");
    // the Page column reflows: its box never intersects the docked panel's.
    expect(intersects(p.boxes.paper, p.boxes.panel)).toBe(false);
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
    for (const [w, expectedMode] of [
      [1280, "docked"],
      [1279, "overlay"],
    ] as const) {
      const opts: FixtureOpts =
        expectedMode === "docked"
          ? { panel: "open", panelMode: "docked" }
          : { panel: "open", panelMode: "overlay" };
      const p = await probe(opts, w, 800);
      expect(paneLayout(w, { ...DEFAULT_PANE_STATE, panelOpen: true, hasFindings: true }).panel).toBe(
        expectedMode,
      );
      expect(p?.positions.panel, `panel position at ${w}`).toBe(
        expectedMode === "overlay" ? "absolute" : "static",
      );
      expect(p?.scrimShown, `scrim at ${w}`).toBe(expectedMode === "overlay");
      if (expectedMode === "overlay") {
        // the scrimmed overlay may cover the paper — the scrim, never bare chrome, is what sits
        // between them.
        expect(p.scrimShown).toBe(true);
      } else {
        expect(intersects(p?.boxes.paper ?? null, p?.boxes.panel ?? null)).toBe(false);
      }
    }
  }, 90_000);

  it("1024×768: the open overlay carries a scrim that covers the Page (never un-scrimmed)", async () => {
    const p = await probe({ panel: "open", panelMode: "overlay" }, 1024, 768);
    if (!p) {
      if (process.env.CI) throw new Error("playwright chromium missing under CI");
      return;
    }
    expect(p.positions.panel).toBe("absolute");
    expect(p.scrimShown).toBe(true);
    // the scrim sits between the page and the overlay — the paper's centre hit-tests the scrim.
    expect(p.covers.paperCenter).toBe("DIV.ide-scrim");
  }, 60_000);

  it("820×1180: the sheet is scrimmed too; a closed panel covers nothing", async () => {
    const open = await probe({ panel: "open", panelMode: "sheet" }, 820, 1180);
    if (!open) {
      if (process.env.CI) throw new Error("playwright chromium missing under CI");
      return;
    }
    expect(open.positions.panel).toBe("absolute");
    expect(open.scrimShown).toBe(true);
    const closed = await probe({ panel: "closed", panelMode: "sheet" }, 820, 1180);
    expect(closed?.scrimShown).toBe(false);
    expect(intersects(closed?.boxes.paper ?? null, closed?.boxes.panel ?? null)).toBe(false);
  }, 90_000);

  it("the panel head never intersects the status bar — the B2 collision is gone with the drawer", async () => {
    const b = await getBrowser();
    if (!b) {
      if (process.env.CI) throw new Error("playwright chromium missing under CI");
      return;
    }
    for (const [w, hgt] of [
      [1440, 757],
      [1440, 900],
      [1280, 800],
      [1024, 768],
      [820, 1180],
    ] as const) {
      const p = await probe({ panel: "open", panelMode: w < 1280 ? (w < 1024 ? "sheet" : "overlay") : "docked" }, w, hgt);
      // the in-flow panel head sits strictly inside the frame; a tab is clickable at every size.
      expect(p?.covers.panelTab, `panel tab covered @${w}×${hgt}`).toBeNull();
      // …and the docked panel never overlaps the status bar region vertically.
      if (w >= 1280) {
        expect(
          intersects(p?.boxes.panelHead ?? null, p?.boxes.statusbar ?? null),
          `panel head ∩ statusbar @${w}×${hgt}`,
        ).toBe(false);
      }
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
      const hidden = await page
        .locator("[data-ide-focus-exit]")
        .evaluate((el) => getComputedStyle(el).display);
      expect(hidden).toBe("none");
    } finally {
      await page.close();
    }
  }, 60_000);
});
