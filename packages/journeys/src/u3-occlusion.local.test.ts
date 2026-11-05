// R7PANE.1 (REQ-PANE-4, REQ-DACC-7) — Stage A: run the real `U3.occlusion` probe
// (`u3ProbePage` — the shared body the deployed leg calls) locally, with bundled Chromium
// against a LOCAL web server serving `demoDataSource` (the demo path needs no api —
// `API_BASE_URL` points at a dead port). The demo mounts the identical hosted `.ide`
// geometry, so the probe at all five sizes IS the leg's layout check over a local build.
// The deployed leg (`U3.occlusion`) stays `expected:"red"` — 250_R7DEP.2 flips it at the
// phase preview per D-R7PANE.1-1.
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
import { u3ProbePage } from "./u3-probe.js";

const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const OUT = join(REPO, "docs/build/reports/2026-11-05_r7pane-1-u3");
const MAIN = join(REPO, "apps/web/dist/main.js");
const PORT = 43600 + Math.floor(Math.random() * 400);
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

describe("229 R7PANE.1 — the U3.occlusion probe over a local build (ready-to-flip)", () => {
  it("the five REQ-PANE-4 sizes against a local demoDataSource server", async () => {
    mkdirSync(OUT, { recursive: true });
    const base = await startServer();
    if (base == null) {
      if (process.env.CI) throw new Error("local web server did not start (apps/web build missing?)");
      console.warn("local web server unavailable — skipping");
      return;
    }
    try {
      browser = await chromium.launch({ headless: true });
    } catch {
      if (process.env.CI) throw new Error("playwright chromium missing under CI");
      console.warn("playwright browsers not installed — skipping");
      return;
    }
    try {
      const essay = DEMO_ESSAYS[0]?.essay ?? "the-governable-mind";
      const ctx = await browser.newContext({ baseURL: BASE });
      const page = await ctx.newPage();
      for (const [w, h] of [
        [1440, 900],
        [1280, 800],
        [1024, 768],
        [820, 1180],
        [390, 844],
      ] as const) {
        const r = await page.goto(`${BASE}/demo/${essay}?src=jrn`, { waitUntil: "domcontentloaded" });
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
