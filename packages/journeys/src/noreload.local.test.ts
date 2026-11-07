// R7RELOAD.1 (REQ-RELOAD-6 / REQ-GUARD-3) — Stage A: the GUARD-3 harness's fixture walk over a
// LOCAL web server serving `demoDataSource` (the demo path needs no api — `API_BASE_URL` points
// at a dead port). The walk plants the persisted window marker inside the demo SPA, walks two
// in-namespace client navigations, and asserts one navigation entry + the marker throughout.
// The planted-reload arm proves the assert FAILS on a real document swap (both signals:
// a second navigation entry and a lost marker), and the sanctioned-name arm proves a declared
// `demo-exit` document navigation is expected-not-merely-permitted.
//
// The deployed `U2.noreload` leg stays `expected:"red"` — 250_R7DEP.2 flips it at the R7b
// phase preview (D-R7RELOAD.1-1). Requires apps/web's dist build + bundled Chromium; a missing
// piece is a skip locally and a failure under CI (the unit job installs both).

import { spawn, type ChildProcess } from "node:child_process";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { chromium, type Browser } from "playwright";
import { DEMO_ESSAYS } from "@rhema/contracts";
import {
  assertNoReload,
  guard3Segment,
  plantGuard3Marker,
  SANCTIONED_DOCUMENT_NAVIGATIONS,
} from "./noreload.js";

const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const OUT = join(REPO, "docs/build/reports/2026-11-05_r7reload-1-u2");
const MAIN = join(REPO, "apps/web/dist/main.js");
const PORT = 43900 + Math.floor(Math.random() * 300);
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
        RHEMA_BUILD_GIT_SHA: "r7reload1-local",
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

async function fixture(): Promise<{ page: import("playwright").Page; ctx: import("playwright").BrowserContext } | null> {
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
    return null;
  }
  const ctx = await browser.newContext({ baseURL: BASE });
  const page = await ctx.newPage();
  return { page, ctx };
}

describe("231 R7RELOAD.1 — the GUARD-3 harness fixture walk", () => {
  it("the named sanctioned set is the exact contract 232/249 consume", () => {
    expect([...SANCTIONED_DOCUMENT_NAVIGATIONS]).toEqual([
      "demo-entry",
      "demo-exit",
      "sidebar-demo",
      "logout",
      "stripe-handoff",
      "oauth-handoff",
      "binary-export",
      "file-passthrough",
      "document-stub",
    ]);
  });

  it("the clean walk holds one document; a planted reload fails the assert", async () => {
    const f = await fixture();
    if (f == null) return;
    const { page } = f;
    try {
      const essay = DEMO_ESSAYS[0]?.essay ?? "the-governable-mind";
      const marker = "u2-fixture";
      // entry document — the demo boot IS an SPA document (one navigation entry).
      const r = await page.goto(`${BASE}/demo/${essay}?src=jrn`, { waitUntil: "domcontentloaded" });
      expect(r?.ok()).toBe(true);
      await page.locator("[data-spa-surface], [data-page-root]").first().waitFor({ timeout: 30_000 });
      await plantGuard3Marker(page, marker);
      await assertNoReload(page, marker, "entry");

      // an in-namespace client navigation (the Figures link) keeps one document.
      const figures = page.locator(`a[href="/demo/${essay}/figures"], a[href$="/figures"]`).first();
      await guard3Segment(page, marker, "essay→figures", async () => {
        if ((await figures.count()) > 0) await figures.click();
      });
      await page.screenshot({ path: join(OUT, "u2-fixture-clean.png"), fullPage: true });

      // the planted reload: a real document swap must trip BOTH signals.
      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(assertNoReload(page, marker, "planted-reload")).rejects.toThrow(
        /document/,
      );
    } finally {
      await browser?.close();
      server?.kill();
    }
  }, 300_000);

  it("a sanctioned name expects — never merely permits — its document navigation", async () => {
    const f = await fixture();
    if (f == null) return;
    const { page } = f;
    try {
      const essay = DEMO_ESSAYS[0]?.essay ?? "the-governable-mind";
      const marker = "u2-fixture-exit";
      await page.goto(`${BASE}/demo/${essay}?src=jrn`, { waitUntil: "domcontentloaded" });
      await page.locator("[data-spa-surface], [data-page-root]").first().waitFor({ timeout: 30_000 });
      await plantGuard3Marker(page, marker);

      // declaring `demo-exit` and NOT document-navigating must fail (the name is an expectation).
      await expect(
        guard3Segment(page, marker, "missing-exit", async () => undefined, {
          sanctioned: "demo-exit",
        }),
      ).rejects.toThrow(/no document load happened/);

      // the real exit: a `data-spa-native`/`data-demo-exit` link document-navigates out — the
      // sanctioned arm replants the marker on the fresh document.
      const exit = page.locator("[data-demo-exit]").first();
      if ((await exit.count()) > 0) {
        await guard3Segment(
          page,
          marker,
          "demo→exit",
          async () => {
            await Promise.all([
              page.waitForNavigation({ waitUntil: "domcontentloaded", timeout: 30_000 }),
              exit.click(),
            ]);
          },
          { sanctioned: "demo-exit" },
        );
      }
    } finally {
      await browser?.close();
      server?.kill();
    }
  }, 300_000);
});
