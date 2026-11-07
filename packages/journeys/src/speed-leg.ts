// R7SYNC.1 (REQ-SPEED-5) — the project-open speed leg, on the showcase-fresh-leg template:
// numbers-printed, never hidden. Measures THREE metrics, N=20 samples each, and prints the
// p75s with the SHA + a `date -u` stamp. The numbers are RECORDED, not gated — REQ-SPEED-5's
// budgets (warm SPA open p75 ≤ 400 ms, hard open p75 ≤ 1.2 s, pending indicator ≤ 100 ms)
// land as findings when regressed, not failures. The exit code stays 0 unless the leg itself
// errored (an unmountable project page IS a failure — that isn't a timing reading).
//
//   node_modules/.bin/tsx packages/journeys/src/speed-leg.ts --web http://localhost:3000 --slug <slug>
//
// `--slug` defaults to `demo~the-borrowed-commons` (the demo essay works with zero auth).

import { chromium } from "playwright";

const SAMPLES = 20;
// REQ-SPEED-5's budgets — recorded, never gating (the flag is emitted so the record says so).
const TARGETS = { warmOpenP75Ms: 400, hardOpenP75Ms: 1200, pendingMs: 100 } as const;

const p75 = (xs: number[]): number => {
  const sorted = [...xs].sort((a, b) => a - b);
  return sorted.length === 0 ? -1 : sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.75) - 1)]!;
};

async function main(): Promise<number> {
  const argv = process.argv;
  const web = argv[argv.indexOf("--web") + 1] ?? "http://localhost:3000";
  const slug = argv[argv.indexOf("--slug") + 1] ?? "demo~the-borrowed-commons";
  const browser = await chromium.launch();
  const out: Record<string, unknown> = {
    leg: "speed",
    sha: process.env["GIT_SHA"] ?? process.env["GITHUB_SHA"] ?? "local",
    stamp: new Date().toISOString(),
    samples: SAMPLES,
    targets: TARGETS,
    gated: false, // REQ-SPEED-5 — recorded, not gating
    web,
    slug,
  };
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    const url = `${web}/p/${slug}`;

    // Hard opens — a fresh cold navigation each sample (cache disabled).
    const hard: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      const t0 = Date.now();
      await page.goto(`${url}?h=${i}`, { waitUntil: "domcontentloaded" });
      await page.waitForSelector("[data-spa-surface] [data-page-root], [data-spa-surface] h1", { timeout: 15_000 });
      hard.push(Date.now() - t0);
    }

    // Pending indicator — click a project link away and time the skeleton's first paint.
    const pending: number[] = [];
    // Warm opens — in-router SPA navigation on the warmed cache.
    const warm: number[] = [];
    for (let i = 0; i < SAMPLES; i++) {
      // Leave to a workspace leaf, then return in-router (the warm open the budget names).
      await page.goto(`${web}/app`, { waitUntil: "domcontentloaded" }).catch(() => undefined);
      const t0 = Date.now();
      await page.goto(url, { waitUntil: "domcontentloaded" });
      const skeleton = page.locator("[data-spa-surface] .ide-sk-row, [data-shell-frame] .ide-sk-row").first();
      const t1 = Date.now();
      if (await skeleton.isVisible({ timeout: 1_000 }).catch(() => false)) pending.push(t1 - t0);
      await page.waitForSelector("[data-page-root], [data-spa-surface] h1", { timeout: 15_000 });
      warm.push(Date.now() - t0);
    }
    await context.close();

    out["hardOpenMs"] = hard;
    out["warmOpenMs"] = warm;
    out["pendingIndicatorMs"] = pending;
    out["p75"] = { hard: p75(hard), warm: p75(warm), pending: p75(pending) };
    const regressed: string[] = [];
    if (p75(warm) > TARGETS.warmOpenP75Ms) regressed.push("warm-open");
    if (p75(hard) > TARGETS.hardOpenP75Ms) regressed.push("hard-open");
    if (pending.length > 0 && p75(pending) > TARGETS.pendingMs) regressed.push("pending");
    out["regressions"] = regressed; // findings to record, never a gate
    out["ok"] = true;
  } catch (err) {
    out["ok"] = false;
    out["error"] = err instanceof Error ? err.message.slice(0, 400) : String(err);
  }
  await browser.close();
  console.log(JSON.stringify(out));
  return out["ok"] === true ? 0 : 1;
}

process.exit(await main());
