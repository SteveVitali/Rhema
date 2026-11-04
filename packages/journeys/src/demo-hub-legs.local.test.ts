// 221a R7DEM.5b (REQ-DACC-1) — Stage A: run the REAL `D1.hub` leg body (`R7_LEGS_IMPLS`)
// locally — bundled Chromium against a LOCAL web server serving `demoDataSource` over the real
// corpus (the demo path needs no api; `API_BASE_URL` is a dead port). The signed-in arm plants
// `rhema-dev.session_token` (cookie PRESENCE == the cosmetic `boot.demo.signedIn` fact).
//
// Evidence: screenshots land in docs/build/reports/2026-11-04_r7dem-5b-legs/ — the
// ready-to-flip set 224 re-verifies on the R7a phase preview (D-R7DEM.5b-1). Requires apps/web's
// dist build + bundled Chromium; a missing piece is a skip on a dev box and a failure under CI.

import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { R7_LEGS_IMPLS } from "./r7legs.js";
import type { StepCtx } from "./runner.js";

const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const OUT = join(REPO, "docs/build/reports/2026-11-04_r7dem-5b-legs");
const MAIN = join(REPO, "apps/web/dist/main.js");
const PORT = 44400 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;

let server: ChildProcess | undefined;
let browser: Browser | undefined;

async function startServer(): Promise<boolean> {
  try {
    const p = spawn(process.execPath, [MAIN], {
      cwd: REPO,
      env: {
        ...process.env,
        PORT: String(PORT),
        API_BASE_URL: "http://127.0.0.1:1",
        RHEMA_BUILD_GIT_SHA: "r7dem5b-local",
      },
      stdio: ["ignore", "pipe", "pipe"],
    });
    server = p;
    for (let i = 0; i < 100; i++) {
      try {
        const r = await fetch(`${BASE}/healthz`);
        if (r.ok) return true;
      } catch {
        /* still booting */
      }
      await new Promise((r) => setTimeout(r, 200));
    }
    return false;
  } catch {
    return false;
  }
}

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
    step: { id: stepId, journey: "both", asserts: "", owner: "R7DEM.5b", expected: "red", paid: false },
    nonce: "local5b",
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
    marker: (n) => `local5b-${n}`,
    anon: async () => mk(false),
    freshUser: async () => mk(true),
    returningUser: async () => mk(true),
  };
}

describe("221a R7DEM.5b — the D1.hub leg body locally (ready-to-flip)", () => {
  it("runs D1.hub + the hub extensions of R11.demo/P1.demo against a local server", async () => {
    mkdirSync(OUT, { recursive: true });
    if (!(await startServer())) {
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
      for (const id of ["D1.hub", "R11.demo", "P1.demo"] as const) {
        const body = R7_LEGS_IMPLS[id];
        expect(body, `${id} must have a real body`).toBeTypeOf("function");
        await body!(makeCtx(id));
      }
    } finally {
      await browser.close();
      server?.kill();
    }
  }, 420_000);
});
