#!/usr/bin/env node
// R6POST.1 / REQ-POST-9 — the axe + reduced-motion arm on production `/` (public funnel).
// axe-core 4.13.0 injected via CDP evaluate (CSP-safe — same mechanism as journeys steps.ts
// assertAxeClean). Reduced-motion leg: emulate prefers-reduced-motion=reduce, assert the hero
// renders complete/static (no animated reveal pending) and the page is still fully usable.
// Run from repo root: node docs/build/reports/2026-10-22_R6POST.1/post9-axe-reducemotion.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright", {
  paths: ["./packages/journeys"],
}));
const axeSource = readFileSync(
  require.resolve("axe-core", { paths: ["./packages/journeys"] }),
  "utf8",
);

const OUT = "docs/build/reports/2026-10-22_R6POST.1/post9-axe-reducemotion.json";
const URL_ = "https://rhema.tools/";

// same channel the suite uses — `playwright install chrome` (ADR-020), not the bundled headless shell
const browser = await chromium.launch({ channel: "chrome", headless: true });
const evidence = { at: new Date().toISOString(), url: URL_ };

try {
  // --- 1. axe WCAG pass on the real (non-reduced) render -------------------------------------
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    const consoleErrors = [];
    page.on("pageerror", (e) => consoleErrors.push(String(e.message)));
    await page.goto(URL_, { waitUntil: "load" });
    await page.evaluate(axeSource);
    const res = await page.evaluate(async () => {
      const r = await globalThis.axe.run(document, {
        runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
      });
      return {
        violations: r.violations.map((v) => ({
          id: v.id,
          impact: v.impact,
          nodes: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
          count: v.nodes.length,
        })),
        passes: r.passes.length,
        incomplete: r.incomplete.map((v) => v.id),
      };
    });
    evidence.axe = { ...res, consoleErrors };
    await ctx.close();
  }

  // --- 2. reduced-motion leg ------------------------------------------------------------------
  {
    const ctx = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      reducedMotion: "reduce",
    });
    const page = await ctx.newPage();
    await page.goto(URL_, { waitUntil: "load" });
    await page.waitForTimeout(400);
    evidence.reducedMotion = await page.evaluate(() => {
      const animated = [];
      for (const el of Array.from(document.querySelectorAll("body *"))) {
        const cs = getComputedStyle(el);
        if (cs.animationName !== "none" || cs.transitionDuration !== "0s") {
          const dur = parseFloat(cs.transitionDuration) || 0;
          const adur = parseFloat(cs.animationDuration) || 0;
          if (dur > 0.2 || adur > 0.2) {
            animated.push({
              tag: el.tagName.toLowerCase(),
              cls: (el.getAttribute("class") ?? "").slice(0, 60),
              animation: cs.animationName,
              animationDuration: cs.animationDuration,
              transitionDuration: cs.transitionDuration,
            });
          }
        }
      }
      const reveals = Array.from(
        document.querySelectorAll("[data-reveal], [data-animate], .reveal, [data-revealed]"),
      ).map((el) => ({
        sel: el.tagName.toLowerCase(),
        state: el.getAttribute("data-revealed") ?? getComputedStyle(el).opacity,
      }));
      return {
        mediaReduced: matchMedia("(prefers-reduced-motion: reduce)").matches,
        animatedElements: animated,
        revealElements: reveals,
        heroVisible: !!document.querySelector("h1"),
      };
    });
    await page.screenshot({ path: "docs/build/reports/2026-10-22_R6POST.1/post9/reduced-motion.png", fullPage: false });
    await ctx.close();
  }

  // --- 3. native LCP + CLS via PerformanceObserver (unthrottled cross-check of Lighthouse) -----
  {
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await ctx.newPage();
    await page.addInitScript(() => {
      globalThis.__vitals = { lcp: 0, cls: 0 };
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) globalThis.__vitals.lcp = e.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) if (!e.hadRecentInput) globalThis.__vitals.cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    await page.goto(URL_, { waitUntil: "networkidle" });
    await page.waitForTimeout(1500);
    evidence.vitals = await page.evaluate(() => globalThis.__vitals);
    await ctx.close();
  }

  evidence.verdict =
    evidence.axe.violations.length === 0 &&
    evidence.reducedMotion.mediaReduced === true &&
    evidence.reducedMotion.animatedElements.length === 0 &&
    evidence.vitals.lcp > 0 && evidence.vitals.lcp < 2500 &&
    evidence.vitals.cls < 0.05
      ? "PASS"
      : "REVIEW";
} finally {
  await browser.close();
}

writeFileSync(OUT, JSON.stringify(evidence, null, 1));
console.log(JSON.stringify(evidence, null, 1));
process.exit(evidence.verdict === "PASS" ? 0 : 1);
