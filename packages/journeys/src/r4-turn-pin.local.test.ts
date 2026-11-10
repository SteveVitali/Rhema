// 250i R7FIX.9 (F-PAIDU6-1) — Stage A: R4's turn pick resolves the REAL turn id, never R7b's
// `data-chat-turn="optimistic"` placeholder. The paid run at `b8307a40` failed on exactly this:
// the leg's `[data-chat-turn]` `.last()` read the pending-bubble marker row
// (`packages/ui/src/chat-panel.tsx`) → `turns/optimistic` → 404 → deadline fail while the funded
// `chat_turn` run `01M70QP0XCS5BZ9TPPCYYVA0J8` completed behind it (paid-u6-run.md).
//
// The leg-verbatim exported `resolveChatTurnId` runs here over a LOCAL web server
// (`demoDataSource`, no api) on a REAL served document, with the verbatim R7b placeholder row
// injected into the transcript — the paid run's exact DOM state:
//   1. POST-envelope arm — the send's `{data.runId}` resolves the real id while the DOM's
//      `.last()` still reads "optimistic" (the defect condition itself).
//   2. form-post fallback — a non-runId response (the SSR/HTML arm) → the NEWEST non-`optimistic`
//      transcript row wins.
//   3. negative — a placeholder-only transcript + no runId → `null`, never "optimistic"
//      (and the leg now throws on `null` — no silent skip).
// Requires apps/web's dist build + bundled Chromium; a missing piece is a skip on a dev box
// and a failure under CI.

import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { resolveChatTurnId } from "./steps.js";

const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const OUT = join(REPO, "docs/build/reports/2026-11-09_r7fix-9-r4-pin");
const MAIN = join(REPO, "apps/web/dist/main.js");
const PORT = 44500 + Math.floor(Math.random() * 400);
const BASE = `http://127.0.0.1:${PORT}`;

/** The verbatim R7b pending-bubble marker row (ui/chat-panel.tsx — the `.last()` trap). */
const OPTIMISTIC_ROW =
  '<li class="chat-turn" data-chat-turn="optimistic">' +
  '<div class="chat-bubble chat-bubble-user" data-chat-bubble="user"></div></li>';
const RUN_ID = "01R4PINLOCAL00000000000001";

let server: ChildProcess | undefined;
let browser: Browser | undefined;
let page: Page | undefined;

async function startServer(): Promise<boolean> {
  try {
    const p = spawn(process.execPath, [MAIN], {
      cwd: REPO,
      env: {
        ...process.env,
        PORT: String(PORT),
        API_BASE_URL: "http://127.0.0.1:1", // dead on purpose — the demo path never fetches it
        RHEMA_BUILD_GIT_SHA: "r7fix9-local",
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

/** Open a real served document (the public demo essay — SSR `.ide` + the chat transcript host). */
async function openDemoDoc(): Promise<void> {
  await page!.goto(`${BASE}/demo/the-governable-mind`, { waitUntil: "domcontentloaded" });
  await page!.locator("[data-chat-log], .ide").first().waitFor({ timeout: 15_000 });
}

/** Stamp the transcript's `data-chat-turn` rows verbatim (`rows` in DOM order — newest first). */
async function seedTranscript(rows: readonly string[]): Promise<void> {
  await page!.evaluate(
    (items) => {
      const host =
        document.querySelector("[data-chat-log]") ??
        document.querySelector(".ide") ??
        document.body;
      let list = host.querySelector("ul.chat-turn-list");
      if (list == null) {
        list = document.createElement("ul");
        list.className = "chat-turn-list";
        host.appendChild(list);
      }
      list.innerHTML = items.join("");
    },
    rows as unknown as string[],
  );
}

const stampedRow = (id: string): string =>
  `<li class="chat-turn" data-chat-turn="${id}"><div class="chat-bubble"></div></li>`;

describe("250i R7FIX.9 — R4's turn pick resolves the real turn, never `optimistic`", () => {
  it("POST-envelope, DOM fallback, and the placeholder negative", async () => {
    mkdirSync(OUT, { recursive: true });
    if (!(await startServer())) {
      if (process.env.CI)
        throw new Error("local web server did not start (apps/web build missing?)");
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
      const context = await browser.newContext({ baseURL: BASE });
      page = await context.newPage();
      await openDemoDoc();

      // --- arm 1: the POST envelope's runId wins while `.last()` still reads the placeholder ---
      // the paid run's exact DOM: a stamped history row + the pending marker LAST.
      await seedTranscript([stampedRow("01OLDTURN0000000000000001"), OPTIMISTIC_ROW]);
      await page.route("**/p/*/chat/turns", (route) => {
        if (route.request().method() !== "POST") return route.continue();
        return route.fulfill({
          status: 200,
          contentType: "application/json",
          body: JSON.stringify({
            ok: true,
            redirect: "/p/x#chat",
            data: { runId: RUN_ID, state: "queued", deduped: false },
          }),
        });
      });
      const posted = page.waitForResponse(
        (r) =>
          r.request().method() === "POST" &&
          /\/p\/[^/]+\/chat\/turns$/.test(new URL(r.url()).pathname),
        { timeout: 10_000 },
      );
      await page.evaluate(() =>
        fetch("/p/demo~x/chat/turns", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ threadId: "t", message: "hi" }),
        }),
      );
      // the defect condition itself, asserted present: `.last()` STILL reads the placeholder.
      expect(await page.locator("[data-chat-turn]").last().getAttribute("data-chat-turn")).toBe(
        "optimistic",
      );
      expect(await resolveChatTurnId(page, posted, 2_000)).toBe(RUN_ID);

      // --- arm 2: the form-post fallback — newest non-`optimistic` row ---
      // a response that carries no `data.runId` (the SSR arm's HTML/envelope-less answer):
      // the real server's own /healthz JSON is enough (parses, no runId) — the fallback then
      // must pick the NEWEST stamped row, never the trailing placeholder.
      await seedTranscript([
        stampedRow(RUN_ID),
        stampedRow("01OLDTURN0000000000000001"),
        OPTIMISTIC_ROW,
      ]);
      const htmlPosted = page.waitForResponse("**/healthz", { timeout: 10_000 });
      await page.evaluate(() => fetch("/healthz"));
      expect(await resolveChatTurnId(page, htmlPosted, 2_000)).toBe(RUN_ID);

      // --- arm 3 (negative): placeholder-only transcript + no runId → null, NEVER "optimistic" ---
      await seedTranscript([OPTIMISTIC_ROW]);
      const nonePosted = page.waitForResponse("**/healthz", { timeout: 10_000 });
      await page.evaluate(() => fetch("/healthz"));
      expect(await resolveChatTurnId(page, nonePosted, 1_500)).toBeNull();

      await page.screenshot({ path: join(OUT, "r4-turn-pin.png"), fullPage: true });
      await context.close();
    } finally {
      await browser.close();
      server?.kill();
    }
  }, 120_000);
});
