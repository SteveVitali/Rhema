// 250h_R7FIX.8 (F-R7DEP.3-1) — Stage A for the P1.pill desktop overlap. The deployed leg's
// `pillTextOverlap` measured the invisible `.ide-focus-exit` box over `[data-sync-pill]` at
// 1440×900 (`sync pill covers text at desktop: button "Exit focus · Esc"`, deterministic ×2 at
// `b8307a40`). The root cause was cascade order, not geometry: the hide rule
// `.ide-focus-exit { display: none }` tied the carrier's own `.ui-btn { display: inline-flex }`
// on specificity and lost on source order, so the focus-view-only button kept a live
// `position:fixed` hit-box at top-centre in EVERY view — an invisible overlay over the page
// strip's controls. The demo mounts the identical hosted `.ide` chrome and serves the same
// emitted `ideCss()` + `uiCss()` pair, so the asserts below are the leg's verbatim measure
// over the same stylesheet contract:
//
//   • write view — the authored gate is real: `[data-ide-focus-exit]` computes `display:none`
//     (zero rect; the pre-fix cascade left it `flex`/nonzero) and `pillTextOverlap` is null;
//   • focus view — the reader keeps BOTH affordances: the bare `f` chord engages
//     `data-view="focus"`, the exit pill gains its box, the strip (and its pill) is
//     `display:none` — they never coexist, so the probe still reports null; Esc restores
//     write;
//   • seeded negative — restyle the exit box over the strip pill and the probe MUST report
//     `button "Exit focus · Esc"`: a guard that cannot fail is not a guard.
//
// Requires apps/web's dist build + public/spa (turbo build) and bundled Chromium
// (`pnpm --filter @rhema/journeys exec playwright install chromium`). A missing piece is a
// skip on a dev box and a failure under CI (the unit job installs both).

import { spawn, type ChildProcess } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { DEMO_ESSAYS } from "@rhema/contracts";
import { pillTextOverlap } from "./steps.js";

const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const MAIN = join(REPO, "apps/web/dist/main.js");
const PORT = 44400 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;

let server: ChildProcess | undefined;
let browser: Browser | undefined;

async function startServer(): Promise<string | null> {
  try {
    const p = spawn(process.execPath, [MAIN], {
      cwd: REPO,
      env: {
        ...process.env,
        PORT: String(PORT),
        API_BASE_URL: "http://127.0.0.1:1", // dead on purpose — the demo path never fetches it
        RHEMA_BUILD_GIT_SHA: "r7fix8-local",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server = p;
    for (let i = 0; i < 100; i++) {
      try {
        const r = await fetch(`${BASE}/healthz`);
        if (r.ok) return BASE;
      } catch {
        /* still booting */
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return null;
  } catch {
    return null;
  }
}

/** Boot the local server + bundled Chromium, or skip (dev) / fail (CI) — never a silent pass. */
async function bootOrSkip(): Promise<string | null> {
  const base = await startServer();
  if (base == null) {
    if (process.env.CI) throw new Error("local web server did not start (apps/web build missing?)");
    console.warn("local web server unavailable — skipping");
    return null;
  }
  try {
    browser = await chromium.launch({ headless: true });
  } catch {
    if (process.env.CI) throw new Error("playwright chromium missing under CI");
    console.warn("playwright browsers not installed — skipping");
    server?.kill();
    return null;
  }
  return base;
}

const rect = (page: Page, sel: string) =>
  page
    .locator(sel)
    .first()
    .evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height, display: getComputedStyle(el).display };
    })
    .catch(() => null);

describe("250h R7FIX.8 — the focus-exit pill's hide rule owns write view; both affordances kept (F-R7DEP.3-1)", () => {
  it("write view: the exit pill has NO box (display:none) and the pill overlap probe is null; focus view: the exit shows while the strip's pill hides — still no overlap", async () => {
    const base = await bootOrSkip();
    if (base == null) return;
    try {
      const essay = DEMO_ESSAYS[0]?.essay ?? "the-governable-mind";
      const ctx = await browser!.newContext({
        baseURL: BASE,
        viewport: { width: 1440, height: 900 },
      });
      const page = await ctx.newPage();
      const r = await page.goto(`${BASE}/demo/${essay}?src=jrn`, {
        waitUntil: "domcontentloaded",
      });
      expect(r?.ok(), "demo page at 1440×900").toBe(true);
      await page.locator("[data-ide]").waitFor({ timeout: 30_000 });
      await page.locator("[data-sync-pill]").first().waitFor({ timeout: 30_000 });

      // ---- write view — the authored gate: no box at all outside focus view. The pre-fix
      // cascade computed `display:flex` here (the defect's own signature). ----
      const exitBox = await rect(page, "[data-ide-focus-exit]");
      expect(exitBox?.display, "the exit pill is display:none in write view").toBe("none");
      expect(exitBox?.w ?? 0, "the exit pill owns no layout box in write view").toBe(0);
      const pillBox = await rect(page, "[data-sync-pill]");
      expect(pillBox && pillBox.w > 0, "the sync pill renders in write view").toBe(true);
      expect(
        await pillTextOverlap(page),
        "the leg's verbatim probe is clean in write view",
      ).toBeNull();

      // ---- focus view — the re-homed bare `f` chord engages it (chrome zone only — blur any
      // typing zone first, the same arm U2/U3 take); the exit pill gains its box while the
      // strip (and its pill) is display:none — the two never coexist. ----
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      await page.keyboard.press("f");
      await page.waitForFunction(
        () => document.querySelector("[data-ide]")?.getAttribute("data-view") === "focus",
        { timeout: 10_000 },
      );
      const exitBoxFocus = await rect(page, "[data-ide-focus-exit]");
      expect(
        exitBoxFocus && exitBoxFocus.w > 0,
        "the exit pill mounts its affordance in focus view (REQ-WRITE-4)",
      ).toBe(true);
      const pillBoxFocus = await rect(page, "[data-sync-pill]");
      // the strip ancestor is `display:none` — the pill keeps its own `display` value but owns
      // no layout box (the discriminating fact, not the computed token).
      expect(
        (pillBoxFocus?.w ?? 0) + (pillBoxFocus?.h ?? 0),
        "the pill owns no box in focus view (the strip is display:none)",
      ).toBe(0);
      expect(
        await pillTextOverlap(page),
        "no overlap in focus view — the affordances never coexist",
      ).toBeNull();
      await page.keyboard.press("Escape");
      await page.waitForFunction(
        () => document.querySelector("[data-ide]")?.getAttribute("data-view") === "write",
        { timeout: 10_000 },
      );
      await ctx.close();
    } finally {
      await browser?.close();
      server?.kill();
    }
  }, 600_000);

  it("the seeded negative: a restyled exit box over the strip pill fails the verbatim probe (the guard can fail)", async () => {
    const base = await bootOrSkip();
    if (base == null) return;
    try {
      const essay = DEMO_ESSAYS[0]?.essay ?? "the-governable-mind";
      const ctx = await browser!.newContext({
        baseURL: BASE,
        viewport: { width: 1440, height: 900 },
      });
      const page = await ctx.newPage();
      const r = await page.goto(`${BASE}/demo/${essay}?src=jrn`, {
        waitUntil: "domcontentloaded",
      });
      expect(r?.ok(), "demo page at 1440×900").toBe(true);
      await page.locator("[data-sync-pill]").first().waitFor({ timeout: 30_000 });
      // the control — clean before injection (the fix's own state).
      expect(await pillTextOverlap(page), "unseeded control: no overlap").toBeNull();
      // Re-seat the exit button's box over the strip pill — the exact defect class the deployed
      // leg caught (a live fixed box under the strip's controls).
      await page.evaluate(() => {
        const pill = document.querySelector<HTMLElement>("[data-sync-pill]")!;
        const exit = document.querySelector<HTMLElement>("[data-ide-focus-exit]")!;
        const pr = pill.getBoundingClientRect();
        exit.style.display = "inline-flex";
        exit.style.transform = "none";
        exit.style.left = `${Math.round(pr.left)}px`;
        exit.style.top = `${Math.round(pr.top)}px`;
      });
      const bad = await pillTextOverlap(page);
      expect(bad, "a live exit box over the pill must fail the probe").not.toBeNull();
      expect(bad).toContain("Exit focus");
      await ctx.close();
    } finally {
      await browser?.close();
      server?.kill();
    }
  }, 600_000);
});
