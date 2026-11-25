// 327_R7UX.4 (BL-95) — pr-421 headless walk: landing sample dossier vs the in-app
// (demo-namespace) dossier, side-by-side. Both surfaces are PUBLIC ($0, no auth):
//   - landing `/`            → data-section="dossier" + data-section="faq"
//   - /demo/constitution-of-reason/review/v2-review → the in-app `.paper` dossier sheet
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire("/Users/stevenvitali/.rhema-build/wt-r7ux4/packages/journeys/package.json");
const { chromium } = require("playwright");

const BASE = process.argv[2];
const OUT = process.argv[3];
if (!BASE || !OUT) throw new Error("usage: node walk.mjs <webOrigin> <outDir>");
mkdirSync(OUT, { recursive: true });

const facts = { base: BASE, ts: new Date().toISOString() };
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  userAgent: "Mozilla/5.0 R7UX4-Walk +RhemaJourney",
});
const page = await ctx.newPage();

// ── 1. landing: the sample dossier + the FAQ ─────────────────────────────
await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
facts.landing = {};

// the dossier article IS the .paper sheet under the light pin
const dossier = page.locator('[data-section="dossier"] [data-dossier="true"]');
facts.landing.dossierPresent = (await dossier.count()) === 1;
facts.landing.paperScoped = await page.evaluate(() => {
  const el = document.querySelector('[data-section="dossier"] [data-dossier="true"]');
  if (!el) return null;
  return {
    classes: el.className,
    pin: el.parentElement?.getAttribute("data-paper"),
    font: getComputedStyle(el).fontFamily,
    bg: getComputedStyle(el).backgroundColor,
    color: getComputedStyle(el).color,
    letterFont: getComputedStyle(el.querySelector(".ui-letter-p") ?? el).fontFamily,
  };
});
await dossier.screenshot({ path: `${OUT}/landing-dossier.png` });
await page.locator('[data-section="dossier"]').screenshot({ path: `${OUT}/landing-dossier-section.png` });

// FAQ: native <details> + styled chevron, opens with no JS in the mechanism
const faqItems = page.locator("[data-faq-item]");
facts.landing.faqItems = await faqItems.count();
const first = faqItems.first();
facts.landing.faq = {
  tagName: await first.evaluate((el) => el.tagName),
  chevronSvg: (await first.locator("summary svg.ui-accordion-chevron").count()) === 1,
  ariaExpanded: await first.getAttribute("aria-expanded"),
  markerStyle: await first.locator("summary").evaluate((s) => getComputedStyle(s).listStyleType),
};
const chevronEl = first.locator("summary svg.ui-accordion-chevron");
facts.landing.faq.chevronTransformClosed = await chevronEl.evaluate((el) => getComputedStyle(el).transform);
await page.locator('[data-section="faq"]').screenshot({ path: `${OUT}/landing-faq-closed.png` });
// real user click — the native toggle; no aria-expanded, no handler
await first.locator("summary").click();
facts.landing.faq.openAfterClick = await first.evaluate((el) => el.open);
facts.landing.faq.chevronTransformOpen = await chevronEl.evaluate((el) => getComputedStyle(el).transform);
await first.screenshot({ path: `${OUT}/landing-faq-item-open.png` });
await first.locator("summary").click();
facts.landing.faq.closedAfterSecondClick = await first.evaluate((el) => !el.open);

// ── 2. the in-app dossier (demo namespace, public read) ─────────────────
const res = await page.goto(`${BASE}/demo/constitution-of-reason/review/v2-review`, {
  waitUntil: "networkidle",
});
await page.waitForTimeout(4000); // the demo dossier hydrates off the JSON twin — let the letter mount
facts.demo = { status: res?.status(), url: page.url() };
const inapp = page.locator(".paper [data-letter-view]").first();
facts.demo.dossierPresent = (await inapp.count()) === 1;
facts.demo.paperScoped = await page.evaluate(() => {
  const el = document.querySelector("[data-letter-view]");
  if (!el) return null;
  const paper = el.closest(".paper");
  const htmlPin = document.documentElement.getAttribute("data-paper");
  return {
    classes: el.className,
    insidePaper: !!paper,
    htmlPin,
    font: getComputedStyle(el).fontFamily,
    bg: getComputedStyle(paper ?? el).backgroundColor,
    color: getComputedStyle(el).color,
    letterFont: getComputedStyle(el.querySelector(".ui-letter-p") ?? el).fontFamily,
    claimFont: getComputedStyle(el.querySelector(".ui-claim") ?? el).fontFamily,
  };
});
if (facts.demo.dossierPresent) {
  await inapp.screenshot({ path: `${OUT}/inapp-dossier.png` });
  const paper = page.locator(".paper").first();
  if (await paper.count()) await paper.screenshot({ path: `${OUT}/inapp-paper-sheet.png` });
}
await page.screenshot({ path: `${OUT}/inapp-page.png`, fullPage: false });

// ── 3. the side-by-side verdict ──────────────────────────────────────────
facts.verdict = {
  sameMechanism: facts.landing.paperScoped?.pin === "light"
    && facts.landing.paperScoped.classes?.includes("paper")
    && facts.demo.paperScoped?.insidePaper === true
    && facts.demo.paperScoped?.htmlPin === "light",
  sameSerif:
    !!facts.landing.paperScoped?.letterFont &&
    facts.landing.paperScoped.letterFont === facts.demo.paperScoped?.letterFont,
  sameBg: facts.landing.paperScoped?.bg === facts.demo.paperScoped?.bg,
  sameFg: facts.landing.paperScoped?.color === facts.demo.paperScoped?.color,
  faqNoJs:
    facts.landing.faq.ariaExpanded === null
    && facts.landing.faq.openAfterClick === true
    && facts.landing.faq.closedAfterSecondClick === true,
  chevronRestyled:
    facts.landing.faq.markerStyle === "none"
    && facts.landing.faq.chevronTransformOpen !== facts.landing.faq.chevronTransformClosed,
};

writeFileSync(`${OUT}/walk-facts.json`, JSON.stringify(facts, null, 2));
await browser.close();
console.log(JSON.stringify(facts, null, 2));
