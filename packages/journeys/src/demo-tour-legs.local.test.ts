// 222 R7DEM.6a (REQ-TOUR-2/-4, REQ-DACC-1/2) — Stage A: run the REAL `D2.tour` leg body
// (`R7_LEGS_IMPLS`) locally, with bundled Chromium against a LOCAL web server serving
// `demoDataSource` (the demo path needs no api — `API_BASE_URL` points at a dead port).
// Per-step screenshots land in docs/build/reports/2026-11-04_r7dem-6a-tour/ at desktop,
// narrow-desktop and phone widths — the ready-to-flip evidence set 224 re-verifies on the
// R7a phase preview (D-R7DEM.6a-1). The registry row stays `expected:"red"`.

import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext, type Page } from "playwright";
import { R7_LEGS_IMPLS } from "./r7legs.js";
import type { StepCtx } from "./runner.js";

const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const OUT = join(REPO, "docs/build/reports/2026-11-04_r7dem-6a-tour");
const MAIN = join(REPO, "apps/web/dist/main.js");
const PORT = 43400 + Math.floor(Math.random() * 400);
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
        API_BASE_URL: "http://127.0.0.1:1",
        RHEMA_BUILD_GIT_SHA: "r7dem6a-local",
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

function makeCtx(stepId: string): StepCtx {
  const pages: Page[] = [];
  let documentLoads = 0; // the runner's same-origin document-response counter, locally
  const mk = async (signedIn: boolean) => {
    const context: BrowserContext = await browser!.newContext({ baseURL: BASE });
    if (signedIn) {
      await context.addCookies([
        { name: "rhema-dev.session_token", value: "local-standin", url: BASE },
      ]);
    }
    const page = await context.newPage();
    page.on("response", (r) => {
      try {
        if (
          r.request().resourceType() === "document" &&
          new URL(r.url()).origin === new URL(BASE).origin
        ) {
          documentLoads += 1;
        }
      } catch {
        /* count conservatively */
      }
    });
    pages.push(page);
    return { context, page, email: "local-standin@rhema.tools", via: "planted-cookie" };
  };
  return {
    step: { id: stepId, journey: "new-visitor", asserts: "", owner: "R7DEM.6a", expected: "red", paid: false },
    nonce: "local6a",
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
      return documentLoads;
    },
    marker: (n) => `local6a-${n}`,
    anon: async () => mk(false),
    freshUser: async () => mk(true),
    returningUser: async () => mk(true),
  };
}

describe("222 R7DEM.6a — the D2.tour leg body locally (ready-to-flip)", () => {
  it("walks all 11 steps at three widths against a local demoDataSource server", async () => {
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
      const body = R7_LEGS_IMPLS["D2.tour"];
      expect(body, "D2.tour must have a real body").toBeTypeOf("function");
      await body!(makeCtx("D2.tour")); // throws on any failed assert — the leg's own contract
    } finally {
      await browser.close();
      server?.kill();
    }
  }, 600_000);
});
