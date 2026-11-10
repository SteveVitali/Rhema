// R7PANE.1 (REQ-PANE-4, REQ-DACC-7) — Stage A: run the real `U3.occlusion` probe
// (`u3ProbePage` — the shared body the deployed leg calls) locally, with bundled Chromium
// against a LOCAL web server serving `demoDataSource` (the demo path needs no api —
// `API_BASE_URL` points at a dead port). The demo mounts the identical hosted `.ide`
// geometry, so the probe at all five sizes IS the leg's layout check over a local build.
// The deployed leg (`U3.occlusion`) stays `expected:"red"` — 250_R7DEP.2 flips it at the
// phase preview per D-R7PANE.1-1.
//
// 249_R7GUARD.1 adds the REQ-PANE-4 tour-target arm and the negative fixtures:
//   • the tour arm walks every TOUR_STEPS step at all five sizes — its mark mounts on the
//     step's own `?tour=` URL, then `u3UnscrimmedViolation` (the same in-page census the
//     deployed leg's demo arm calls) asserts no open un-scrimmed panel/overlay/menu
//     intersects the target;
//   • the seeded-fail legs prove the guard fires: a fixed `.ide-panel` over `.ide-page
//     .paper` fails `u3ProbePage`, and a fixed overlay over a tour target's centre fails
//     `u3UnscrimmedViolation` — a guard that cannot fail is not a guard.
//
// Requires apps/web's dist build + public/spa (turbo build) and bundled Chromium
// (`pnpm --filter @rhema/journeys exec playwright install chromium`). A missing piece is a
// skip on a dev box and a failure under CI (the unit job installs both).

import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { DEMO_ESSAYS } from "@rhema/contracts";
import { u3ProbePage, u3UnscrimmedViolation } from "./u3-probe.js";
import { TOUR_STEPS } from "./r7legs.js";

const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const OUT = join(REPO, "docs/build/reports/2026-11-05_r7pane-1-u3");
const GUARD_OUT = join(REPO, "docs/build/reports/2026-11-07_r7guard-1-u3");
const MAIN = join(REPO, "apps/web/dist/main.js");
const PORT = 43600 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;

/** REQ-PANE-4's reference sizes — the fifth is the emulated demo width. */
const SIZES = [
  [1440, 900],
  [1280, 800],
  [1024, 768],
  [820, 1180],
  [390, 844],
] as const;

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
        RHEMA_BUILD_GIT_SHA: "r7pane1-local",
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

const TOUR_ESSAY = "structure-of-political-difference";

describe("229 R7PANE.1 — the U3.occlusion probe over a local build (ready-to-flip)", () => {
  it("the five REQ-PANE-4 sizes against a local demoDataSource server", async () => {
    mkdirSync(OUT, { recursive: true });
    const base = await bootOrSkip();
    if (base == null) return;
    try {
      const essay = DEMO_ESSAYS[0]?.essay ?? "the-governable-mind";
      const ctx = await browser!.newContext({ baseURL: BASE });
      const page = await ctx.newPage();
      for (const [w, h] of SIZES) {
        const r = await page.goto(`${BASE}/demo/${essay}?src=jrn`, {
          waitUntil: "domcontentloaded",
        });
        expect(r?.ok(), `demo page at ${w}×${h}`).toBe(true);
        // the demo surface IS the hosted IDE chrome — the same probe the deployed leg calls.
        await u3ProbePage(page, w, h, {
          demo: true,
          shot: join(OUT, `u3-occlusion-${w}x${h}.png`),
        });
      }
      await ctx.close();
    } finally {
      await browser?.close();
      server?.kill();
    }
  }, 600_000);
});

describe("249 R7GUARD.1 — the GUARD-4 tour-target arm + negative fixtures", () => {
  it("no tour target sits under an un-scrimmed overlay at any of the five sizes", async () => {
    mkdirSync(GUARD_OUT, { recursive: true });
    const base = await bootOrSkip();
    if (base == null) return;
    try {
      const ctx = await browser!.newContext({ baseURL: BASE });
      const page = await ctx.newPage();
      for (const [w, h] of SIZES) {
        await page.setViewportSize({ width: w, height: h });
        for (const step of TOUR_STEPS) {
          const r = await page.goto(
            `${BASE}/demo/${TOUR_ESSAY}${step.route}?${step.search != null ? `${step.search}&` : ""}tour=${step.id}&src=jrn`,
            { waitUntil: "domcontentloaded" },
          );
          expect(r?.ok(), `tour step ${step.id} at ${w}×${h}`).toBe(true);
          // the mark mounts once the step's target renders — its presence is the walk's
          // own evidence (the engine opens the declared panelTab before locating).
          const mark = page.locator(`[data-demo-tour-step="${step.id}"]`);
          await mark.waitFor({ timeout: 30_000 });
          const bad = await u3UnscrimmedViolation(page, [{ id: step.id, selector: step.target }]);
          expect(bad, `tour target ${step.id} at ${w}×${h}`).toBeNull();
        }
        await page.screenshot({
          path: join(GUARD_OUT, `u3-tour-targets-${w}x${h}.png`),
          fullPage: true,
        });
      }
      await ctx.close();
    } finally {
      await browser?.close();
      server?.kill();
    }
  }, 600_000);

  it("the negative fixtures: an un-scrimmed overlay over the Page column fails the probe, and one over a tour target fails the tour arm", async () => {
    mkdirSync(GUARD_OUT, { recursive: true });
    const base = await bootOrSkip();
    if (base == null) return;
    try {
      const essay = DEMO_ESSAYS[0]?.essay ?? "the-governable-mind";
      const ctx = await browser!.newContext({ baseURL: BASE });

      // (a) the column arm — restyle the REAL `.ide-panel` so it floats fixed over `.ide-page
      // .paper` with no scrim armed: exactly the R5 defect (the probe inspects the first
      // `.ide-panel` — a decoy element appended after it would never be seen).
      const seeded = await ctx.newPage();
      await seeded.setViewportSize({ width: 1440, height: 900 }); // pre-resize: the probe measures after setViewportSize
      const r = await seeded.goto(`${BASE}/demo/${essay}?src=jrn`, {
        waitUntil: "domcontentloaded",
      });
      expect(r?.ok(), "seeded page").toBe(true);
      await seeded.locator("[data-ide]").first().waitFor({ timeout: 30_000 });
      await seeded.evaluate(() => {
        const panel = document.querySelector<HTMLElement>(".ide-panel")!;
        const paper = document.querySelector(".ide-page .paper")!.getBoundingClientRect();
        panel.style.cssText =
          `position:fixed;left:${paper.left + paper.width / 2 - 100}px;` +
          `top:${paper.top + paper.height / 2 - 100}px;width:200px;height:200px;` +
          `display:block;z-index:50;background:red;`;
      });
      await expect(
        u3ProbePage(seeded, 1440, 900, { demo: true }),
        "an un-scrimmed overlay over the Page column must fail the probe",
      ).rejects.toThrow(/un-scrimmed|occlu/i);

      // (b) the tour arm — a fixed overlay over the active target's centre must produce a
      // violation; the verdict step's letter-section target is a pointed target.
      const tourSeeded = await ctx.newPage();
      await tourSeeded.setViewportSize({ width: 1440, height: 900 });
      const tr = await tourSeeded.goto(
        `${BASE}/demo/${TOUR_ESSAY}/review/v1-review?tour=verdict&src=jrn`,
        {
          waitUntil: "domcontentloaded",
        },
      );
      expect(tr?.ok(), "seeded tour page").toBe(true);
      await tourSeeded.locator('[data-demo-tour-step="verdict"]').waitFor({ timeout: 30_000 });
      const clean = await u3UnscrimmedViolation(tourSeeded, [
        { id: "verdict", selector: '[data-letter-section="verdict"]' },
      ]);
      expect(clean, "the unseeded step is the control — no violation before injection").toBeNull();
      await tourSeeded.evaluate(() => {
        const t = document
          .querySelector('[data-letter-section="verdict"]')!
          .getBoundingClientRect();
        const d = document.createElement("div");
        d.className = "ui-menu";
        d.style.cssText =
          `position:fixed;left:${t.left + t.width / 2 - 60}px;` +
          `top:${t.top + t.height / 2 - 30}px;width:120px;height:60px;z-index:50;background:red;`;
        document.body.appendChild(d);
      });
      const seededBad = await u3UnscrimmedViolation(tourSeeded, [
        { id: "verdict", selector: '[data-letter-section="verdict"]' },
      ]);
      expect(
        seededBad,
        "an un-scrimmed overlay over the tour target's centre must fail the tour arm",
      ).not.toBeNull();
      // the mark arm: an overlay stamped [data-demo-tour] over the centre is caught by the
      // same centre-point semantics the D2.tour leg applies to the real mark.
      await tourSeeded.evaluate(() => {
        const t = document
          .querySelector('[data-letter-section="verdict"]')!
          .getBoundingClientRect();
        const d = document.createElement("div");
        d.setAttribute("data-demo-tour", "");
        d.style.cssText =
          `position:fixed;left:${t.left + t.width / 2 - 60}px;` +
          `top:${t.top + t.height / 2 - 30}px;width:120px;height:60px;z-index:50;background:red;`;
        document.body.appendChild(d);
      });
      const markBad = await u3UnscrimmedViolation(tourSeeded, [
        { id: "verdict", selector: '[data-letter-section="verdict"]' },
      ]);
      expect(markBad, "a [data-demo-tour] overlay over the centre must fail too").not.toBeNull();

      await seeded.close();
      await tourSeeded.close();
      await ctx.close();
    } finally {
      await browser?.close();
      server?.kill();
    }
  }, 600_000);
});
