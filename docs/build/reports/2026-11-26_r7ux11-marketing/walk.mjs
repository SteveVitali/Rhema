// 334_R7UX.11 (BL-89 / UXC-13 remainder) — pr-428 headless walk: the public landing page rides
// the dedicated §15.1 marketing chrome on the preview's real deployed images. No sign-in, no
// run, $0 — the whole surface is SSR.
//
// Asserts (BL-89 contract):
//   1. / serves the marketing header ([data-mk-nav]) — never the app shell
//   2. the §15.1 nav set in order: product · workflows · demo · pricing · changelog ·
//      Docs(pending placeholder) · signIn · cta, every in-page anchor routing to a real id
//   3. /demo stays a document navigation (data-spa-native + data-demo-entry="nav")
//   4. all twelve sections render in order (hero … final-cta); footer repeats the section map
//   5. the no-JS document carries the same chrome + content (SSG leg, JS disabled)
//   6. /pricing rides the same chrome signed-out (REQ-PUB-1's /app arm needs a session — N/A here)
//   7. screenshots: hero + every section + footer + a mobile-width pair
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire("/Users/stevenvitali/.rhema-build/wt-r7ux11/packages/journeys/package.json");
const { chromium } = require("playwright");

const BASE = process.argv[2];
const OUT = process.argv[3];
if (!BASE || !OUT) throw new Error("usage: node walk.mjs <webOrigin> <outDir>");
mkdirSync(OUT, { recursive: true });

const SECTIONS = ["hero", "dossier", "workflow", "seat", "voices", "runs", "models", "proof", "pricing", "changelog", "faq", "final-cta"];
const facts = { base: BASE, ts: new Date().toISOString(), legs: {} };
const browser = await chromium.launch();

// ---- leg 1-4: / desktop ------------------------------------------------------------
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const resp = await page.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
facts.legs.get = { url: `${BASE}/`, status: resp?.status() ?? null };
await page.waitForTimeout(1200);

const dom = await page.evaluate(() => {
  const header = document.querySelector("[data-mk-nav]");
  const nav = header ? header.querySelector("nav") : null;
  const items = nav ? [...nav.querySelectorAll("[data-mk-nav-item]")].map((n) => ({
    key: n.getAttribute("data-mk-nav-item"),
    href: n.getAttribute("href"),
    text: (n.textContent ?? "").trim(),
    spaNative: n.hasAttribute("data-spa-native"),
    demoEntry: n.getAttribute("data-demo-entry"),
  })) : [];
  const pending = nav ? [...nav.querySelectorAll("[data-mk-nav-pending]")].map((n) => ({
    key: n.getAttribute("data-mk-nav-pending"),
    tag: n.tagName,
    hasHref: n.hasAttribute("href"),
    title: n.getAttribute("title"),
  })) : [];
  const sections = [...document.querySelectorAll("[data-section]")].map((s) => ({
    key: s.getAttribute("data-section"),
    id: s.id,
    text: (s.textContent ?? "").trim().slice(0, 60),
  }));
  const footer = document.querySelector("[data-mk-footer]");
  const appShell = ["data-app-shell", "data-app-sidebar", "data-shell-wordmark", "data-shell-account"]
    .filter((h) => document.querySelector(`[${h}]`));
  return {
    hasMkNav: !!header,
    headerSticky: header ? getComputedStyle(header).position : null,
    items,
    pending,
    sections,
    hasFooter: !!footer,
    footerFaq: footer ? !!footer.querySelector('a[href="/#faq"]') : false,
    footerLegal: footer ? !!footer.querySelector("[data-legal-nav]") : false,
    appShell,
    wordmark: header ? !!header.querySelector('a[href="/"]') : false,
  };
});
facts.legs.landing = dom;

// screenshots: hero viewport, then each section scrolled into view
await page.screenshot({ path: `${OUT}/hero.png` });
for (const id of SECTIONS.slice(1)) {
  const el = page.locator(`#${id}`);
  if ((await el.count()) === 0) continue;
  await el.scrollIntoViewIfNeeded();
  await page.waitForTimeout(350);
  await page.screenshot({ path: `${OUT}/sec-${id}.png` });
}
// footer
await page.locator("[data-mk-footer]").scrollIntoViewIfNeeded();
await page.waitForTimeout(350);
await page.screenshot({ path: `${OUT}/footer.png` });
facts.legs.sectionShots = true;

// ---- leg 5: no-JS document ----------------------------------------------------------
const noJs = await browser.newContext({ javaScriptEnabled: false });
const noJsPage = await noJs.newPage();
await noJsPage.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
const noJsFacts = await noJsPage.evaluate(() => ({
  mkNav: !!document.querySelector("[data-mk-nav]"),
  headerItems: [...document.querySelectorAll("[data-mk-nav] nav [data-mk-nav-item]")].map((n) => n.getAttribute("data-mk-nav-item")),
  footerItems: [...document.querySelectorAll("[data-mk-footer] [data-mk-nav-item]")].map((n) => n.getAttribute("data-mk-nav-item")),
  sections: [...document.querySelectorAll("[data-section]")].map((s) => s.id),
  footer: !!document.querySelector("[data-mk-footer]"),
}));
await noJs.close();
facts.legs.noJs = noJsFacts;

// ---- leg 6: /pricing signed-out rides the same chrome --------------------------------
const pricingPage = await context.newPage();
const pResp = await pricingPage.goto(`${BASE}/pricing`, { waitUntil: "domcontentloaded" });
await pricingPage.waitForTimeout(800);
const pricingDom = await pricingPage.evaluate(() => ({
  mkNav: !!document.querySelector("[data-mk-nav]"),
  items: [...document.querySelectorAll("[data-mk-nav-item]")].map((n) => n.getAttribute("data-mk-nav-item")),
  signIn: !!document.querySelector('[data-mk-nav-item="signIn"][href="/login"]'),
  appShell: !!document.querySelector("[data-app-shell]"),
  footer: !!document.querySelector("[data-mk-footer]"),
}));
facts.legs.pricing = { status: pResp?.status() ?? null, ...pricingDom };
await pricingPage.screenshot({ path: `${OUT}/pricing.png` });
await context.close();

// ---- leg 7: mobile width ------------------------------------------------------------
const mob = await browser.newContext({ viewport: { width: 390, height: 844 } });
const mPage = await mob.newPage();
await mPage.goto(`${BASE}/`, { waitUntil: "domcontentloaded" });
await mPage.waitForTimeout(1200);
await mPage.screenshot({ path: `${OUT}/mobile-top.png` });
await mPage.locator("#workflow").scrollIntoViewIfNeeded();
await mPage.waitForTimeout(350);
await mPage.screenshot({ path: `${OUT}/mobile-mid.png` });
const mobFacts = await mPage.evaluate(() => ({
  mkNav: !!document.querySelector("[data-mk-nav]"),
  headerItems: document.querySelectorAll("[data-mk-nav] nav [data-mk-nav-item]").length,
  sections: document.querySelectorAll("[data-section]").length,
  overflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth,
}));
await mob.close();
facts.legs.mobile = mobFacts;

// ---- verdict ------------------------------------------------------------------------
const navKeys = dom.items.map((i) => i.key);
const ok =
  facts.legs.get.status === 200 &&
  dom.hasMkNav === true &&
  dom.appShell.length === 0 &&
  JSON.stringify(navKeys) === JSON.stringify(["product", "workflows", "demo", "pricing", "changelog", "signIn", "cta"]) &&
  dom.items.find((i) => i.key === "product")?.href === "/#dossier" &&
  dom.items.find((i) => i.key === "workflows")?.href === "/#workflow" &&
  dom.items.find((i) => i.key === "changelog")?.href === "/#changelog" &&
  dom.items.find((i) => i.key === "demo")?.href === "/demo" &&
  dom.items.find((i) => i.key === "demo")?.spaNative === true &&
  dom.items.find((i) => i.key === "demo")?.demoEntry === "nav" &&
  dom.items.find((i) => i.key === "pricing")?.href === "/pricing" &&
  dom.items.find((i) => i.key === "signIn")?.href === "/login" &&
  dom.items.find((i) => i.key === "cta")?.href === "/signup" &&
  dom.pending.length === 1 && dom.pending[0].key === "docs" && dom.pending[0].hasHref === false &&
  JSON.stringify(dom.sections.map((s) => s.id)) === JSON.stringify(SECTIONS) &&
  dom.hasFooter === true && dom.footerFaq === true && dom.footerLegal === true &&
  noJsFacts.mkNav === true &&
  JSON.stringify(noJsFacts.headerItems) === JSON.stringify(["product", "workflows", "demo", "pricing", "changelog", "signIn", "cta"]) &&
  JSON.stringify(noJsFacts.footerItems) === JSON.stringify(["product", "workflows", "demo", "pricing", "changelog", "faq"]) &&
  JSON.stringify(noJsFacts.sections) === JSON.stringify(SECTIONS) && noJsFacts.footer === true &&
  facts.legs.pricing.status === 200 && pricingDom.mkNav === true && pricingDom.signIn === true &&
  pricingDom.appShell === false && pricingDom.footer === true &&
  mobFacts.mkNav === true && mobFacts.headerItems === 7 && mobFacts.sections === 12 && mobFacts.overflowX === false;
facts.verdict = ok ? "PASS" : "FAIL";

writeFileSync(`${OUT}/walk-facts.json`, JSON.stringify(facts, null, 2) + "\n");
await browser.close();
console.log(JSON.stringify(facts, null, 2));
if (!ok) process.exit(1);
