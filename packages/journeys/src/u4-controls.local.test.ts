// 243a_R7KIT.3e (REQ-GUARD-1, REQ-DACC-7) — Stage A: run the real `U4.controls` probe
// (`u4ProbePage` — the shared body the deployed leg calls) locally, with bundled Chromium
// against a LOCAL web server serving `demoDataSource` (the demo path needs no api —
// `API_BASE_URL` points at a dead port). The demo mounts the identical migrated kit, so the
// probe over the demo-servable surfaces IS the Stage-A half of the leg; a seeded-fail leg
// proves the probe detects a raw control. The deployed leg stays `expected:"red"` — the
// workspace-only surfaces (list/inbox/settings/billing/usage/voices/new/run-sheet/export)
// need the authenticated walk; 250_R7DEP.2 runs the full 12 at the deployed SHA per
// D-R7KIT.3e-1.
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
import { U4_SURFACES, assertU4Clean, u4ProbePage } from "./u4-probe.js";

const REPO = resolve(fileURLToPath(new URL(".", import.meta.url)), "../../..");
const OUT = join(REPO, "docs/build/reports/2026-11-06_r7kit-3e-u4");
const MAIN = join(REPO, "apps/web/dist/main.js");
const PORT = 44100 + Math.floor(Math.random() * 400);
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
        RHEMA_BUILD_GIT_SHA: "r7kit3e-local",
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

/** the demo dossier's run id — the essay's own twin resolves it, like demoSeedsFor does. */
async function demoRunId(essay: string): Promise<string | null> {
  for (const path of [`/bff/p/demo~${essay}/timeline`, `/bff/p/demo~${essay}/versions`]) {
    try {
      const r = await fetch(`${BASE}${path}`);
      if (!r.ok) continue;
      const twin = (await r.json()) as {
        runs?: { runId?: string; state?: string }[];
        versions?: { reviews?: { runId?: string }[] }[];
      };
      const run =
        twin.runs?.find((x) => x.state === "completed")?.runId ??
        twin.runs?.[0]?.runId ??
        twin.versions?.flatMap((v) => v.reviews ?? [])[0]?.runId;
      if (run != null && run !== "") return run;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

describe("243a R7KIT.3e — the U4.controls probe over a local build (ready-to-flip)", () => {
  it("the 12-surface list is named and the demo-servable surfaces + a seeded-fail leg prove the probe", async () => {
    mkdirSync(OUT, { recursive: true });
    // every KIT-3 batch is represented in the registry's surface list.
    expect(U4_SURFACES.map((s) => s.id)).toEqual([
      "project-list",
      "inbox",
      "settings",
      "billing",
      "usage",
      "voices",
      "new-project",
      "ide-page-panel",
      "run-sheet",
      "export",
      "outline-figures",
      "dossier",
    ]);
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

      // The demo-servable half of the 12: the IDE Page + right panel, and the dossier — the
      // same probe body the deployed leg calls, the same exemption containers.
      const probed: string[] = [];
      const ideSurface = U4_SURFACES.find((s) => s.id === "ide-page-panel")!;
      const r = await page.goto(`${BASE}/demo/${essay}?src=jrn`, { waitUntil: "domcontentloaded" });
      expect(r?.ok(), "demo IDE page").toBe(true);
      await page.locator("[data-ide]").first().waitFor({ timeout: 30_000 });
      const pageShot = join(OUT, "u4-controls-ide-page-panel.png");
      await page.screenshot({ path: pageShot, fullPage: true });
      assertU4Clean("ide-page-panel(local)", await u4ProbePage(page, ideSurface));
      probed.push("ide-page-panel");

      const runId = await demoRunId(essay);
      if (runId != null) {
        const dossierSurface = U4_SURFACES.find((s) => s.id === "dossier")!;
        const dr = await page.goto(`${BASE}/demo/${essay}/review/${runId}?src=jrn`, {
          waitUntil: "domcontentloaded",
        });
        if (dr?.ok()) {
          await page.locator("[data-letter-view]").first().waitFor({ timeout: 30_000 });
          await page.screenshot({ path: join(OUT, "u4-controls-dossier.png"), fullPage: true });
          assertU4Clean("dossier(local)", await u4ProbePage(page, dossierSurface));
          probed.push("dossier");
        }
      } else {
        console.warn("no demo dossier run id — the deployed walk owes the dossier arm");
      }
      expect(probed).toContain("ide-page-panel");

      // the seeded-fail leg: a raw control the kit does not own must fail the probe.
      const seeded = await ctx.newPage();
      await seeded.goto(`${BASE}/demo/${essay}?src=jrn`, { waitUntil: "domcontentloaded" });
      await seeded.locator("[data-ide]").first().waitFor({ timeout: 30_000 });
      await seeded.evaluate(() => {
        const b = document.createElement("button");
        b.textContent = "seeded raw control";
        document.body.appendChild(b);
      });
      const found = await u4ProbePage(seeded);
      expect(
        found.some((f) => f.tag === "button"),
        "the probe must flag a seeded raw <button>",
      ).toBe(true);
      await seeded.close();
      await ctx.close();
    } finally {
      await browser?.close();
      server?.kill();
    }
  }, 600_000);
});
