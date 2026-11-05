// 220a R7DEM.4b (REQ-DACC-1, REQ-DACC-4 restated) — Stage A: run the REAL `R11.demo` and
// `P1.demo` leg bodies (`R7_LEGS_IMPLS`) locally, with bundled Chromium against a LOCAL web
// server serving `demoDataSource` (the demo path needs no api — `API_BASE_URL` points at a
// dead port; the guard answers every demo request). The signed-in arm uses a planted
// `rhema-dev.session_token` cookie as the `returningUser` stand-in — `boot.demo.signedIn`
// is cookie PRESENCE only, so the stand-in exercises the identical server code path
// (logged out runs the same bodies through `ctx.anon()`).
//
// Evidence: screenshots land in docs/build/reports/2026-11-04_r7dem-4b-legs/ — the
// ready-to-flip set 224 re-verifies on the R7a phase preview (D-R7DEM.4b-1).
//
// Requires apps/web's dist build + public/spa (turbo build) and bundled Chromium
// (`pnpm --filter @rhema/journeys exec playwright install chromium`). A missing piece is a
// skip on a dev box and a failure under CI (the unit job installs both).

import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { R7_LEGS_IMPLS } from "./r7legs.js";
import type { StepCtx } from "./runner.js";

const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const OUT = join(REPO, "docs/build/reports/2026-11-04_r7dem-4b-legs");
const MAIN = join(REPO, "apps/web/dist/main.js");
const PORT = 43200 + Math.floor(Math.random() * 400);
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
        RHEMA_BUILD_GIT_SHA: "r7dem4b-local",
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

/** A StepCtx stand-in for the local walk — anon() is real; returningUser plants the dev
 *  session cookie (cookie presence == the cosmetic signedIn fact on the demo path). */
function makeCtx(stepId: string): StepCtx {
  const pages: Page[] = [];
  const mk = async (signedIn: boolean) => {
    const context: BrowserContext = await browser!.newContext({ baseURL: BASE });
    if (signedIn) {
      await context.addCookies([
        { name: "rhema-dev.session_token", value: "local-standin", url: BASE },
      ]);
    }
    const page = await context.newPage();
    pages.push(page);
    return { context, page, email: "local-standin@rhema.tools", via: "planted-cookie" };
  };
  return {
    step: { id: stepId, journey: "both", asserts: "", owner: "R7DEM.4b", expected: "red", paid: false },
    nonce: "local4b",
    browser: browser!,
    webBaseUrl: BASE,
    apiBaseUrl: "http://127.0.0.1:1",
    mailbox: null as never,
    sessions: null as never,
    consoleErrors: [],
    failedRequests: [],
    assetHits: [],
    outDir: OUT,
    expectRenderer: null,
    rendererScope: null,
    inviteCode: undefined,
    get documentLoads() {
      return 0;
    },
    marker: (n) => `local4b-${n}`,
    anon: async () => mk(false),
    freshUser: async () => mk(true),
    returningUser: async () => mk(true),
  };
}

describe("220a R7DEM.4b — the R*.demo + P1.demo leg bodies locally (ready-to-flip)", () => {
  it("runs both bodies against a local demoDataSource server at all widths", async () => {
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
      for (const id of ["R11.demo", "P1.demo"] as const) {
        const body = R7_LEGS_IMPLS[id];
        expect(body, `${id} must have a real body`).toBeTypeOf("function");
        await body!(makeCtx(id)); // throws on any failed assert — the leg's own contract
      }
    } finally {
      await browser.close();
      server?.kill();
    }
  }, 300_000);
});
