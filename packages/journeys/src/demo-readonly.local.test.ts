// 221 R7DEM.5 (REQ-DACC-1/3/5) — Stage A: run the REAL `D3.readonly` leg body locally —
// bundled Chromium against a LOCAL web server serving `demoDataSource` over the REAL corpus
// (the default corpus root; no api — `API_BASE_URL` points at a dead port). The planted
// `rhema-dev.session_token` cookie is the returningUser stand-in (cookie PRESENCE == the
// cosmetic `boot.demo.signedIn` fact on the demo path).
//
// Evidence: screenshots land in docs/build/reports/2026-11-04_r7dem-5-legs/ — the
// ready-to-flip set 224 re-verifies on the R7a phase preview (D-R7DEM.5-1).
//
// Requires apps/web's dist build + public/spa (turbo build) and bundled Chromium. A missing
// piece is a skip on a dev box and a failure under CI.

import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { chromium, type Browser, type BrowserContext } from "playwright";
import { R7_LEGS_IMPLS } from "./r7legs.js";
import type { StepCtx } from "./runner.js";

const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const OUT = join(REPO, "docs/build/reports/2026-11-04_r7dem-5-legs");
const MAIN = join(REPO, "apps/web/dist/main.js");
const PORT = 44000 + Math.floor(Math.random() * 400);
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
        RHEMA_BUILD_GIT_SHA: "r7dem5-local",
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
  const mk = async (signedIn: boolean) => {
    const context: BrowserContext = await browser!.newContext({ baseURL: BASE });
    if (signedIn) {
      await context.addCookies([
        { name: "rhema-dev.session_token", value: "local-standin", url: BASE },
      ]);
    }
    const page = await context.newPage();
    return { context, page, email: "local-standin@rhema.tools", via: "planted-cookie" };
  };
  return {
    step: { id: stepId, journey: "both", asserts: "", owner: "R7DEM.5", expected: "red", paid: false },
    nonce: "local5",
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
    marker: (n) => `local5-${n}`,
    anon: async () => mk(false),
    freshUser: async () => mk(true),
    returningUser: async () => mk(true),
  };
}

describe("221 R7DEM.5 — the D3.readonly leg body locally (ready-to-flip)", () => {
  it("runs the body against a local demoDataSource server, anon + planted cookie", async () => {
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
      const body = R7_LEGS_IMPLS["D3.readonly"];
      expect(body, "D3.readonly must have a real body").toBeTypeOf("function");
      await body!(makeCtx("D3.readonly"));
    } finally {
      await browser.close();
      server?.kill();
    }
  }, 420_000);
});
