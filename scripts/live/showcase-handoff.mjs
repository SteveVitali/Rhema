// VERIF.1 / D-SPACAP.3-1 leg (b) — the showcase forced-SSR in-SPA handoff arm, live on prod.
// From inside the SPA (/app project list), clicking the showcase row's Page-family link must
// make the leaf consult its twin (`project.showcase: true`) and hand the navigation back to
// the server (SsrHandoff → navigateDocument): a real document load lands data-renderer="ssr".
// Control: a non-showcase project row must stay in-SPA (no document nav; data-renderer="spa").
import { chromium } from "playwright";

const WEB = "https://rhema.tools";
const STATE = process.env.JOURNEY_STATE ?? ".journeys-state/test_jrn_a_rhema_tools.json";
const SHOWCASE_SLUG = process.env.SHOWCASE_SLUG ?? "showcase";
const CONTROL_SLUG = process.env.CONTROL_SLUG ?? "jrn-81466769aeb9-n9credits";

let browser;
try {
  browser = await chromium.launch({ channel: "chrome", headless: true });
} catch {
  browser = await chromium.launch({ headless: true });
}
const context = await browser.newContext({ storageState: STATE });
const page = await context.newPage();

const consoleErrors = [];
const pageErrors = [];
const failedRequests = [];
page.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
page.on("pageerror", (e) => pageErrors.push(String(e)));
page.on("requestfailed", (r) => failedRequests.push(`${r.url()} ${r.failure()?.errorText}`));

const results = {};

// (b) the in-SPA handoff: click the showcase row link from inside /app.
await page.goto(`${WEB}/app`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(`a[href="/p/${SHOWCASE_SLUG}"]`, { state: "attached", timeout: 30_000 });
let docNav = false;
page.on("framenavigated", (f) => {
  if (f === page.mainFrame() && f.url().includes(`/p/${SHOWCASE_SLUG}`)) docNav = true;
});
// the row links sit inside collapsed groups — dispatch a real click on the anchor; the
// delegated document interceptor routes it through the SPA link handler the same as a
// visible click.
await page.locator(`a[href="/p/${SHOWCASE_SLUG}"]`).first().evaluate((el) => el.click());
await page.waitForLoadState("domcontentloaded").catch(() => {});
await page.waitForSelector("html[data-renderer]", { timeout: 30_000 });
await page.waitForTimeout(1500);
results.showcase = {
  documentNavigated: docNav,
  url: page.url(),
  renderer: await page.locator("html").getAttribute("data-renderer"),
  ssrCause: await page.locator("html").getAttribute("data-ssr-cause"),
  pageJs: (await page.locator('script[src="/assets/page.js"]').count()) > 0,
  ideJs: (await page.locator('script[src="/assets/ide.js"]').count()) > 0,
  spaRootMounted: (await page.locator("#spa-root[data-mounted], [data-mounted]").count()) > 0,
};

// (c) control — a non-showcase project row keeps the SPA (client nav, twin mounts).
await page.goto(`${WEB}/app`, { waitUntil: "domcontentloaded" });
await page.waitForSelector(`a[href="/p/${CONTROL_SLUG}"]`, { state: "attached", timeout: 30_000 });
docNav = false;
const navs = [];
page.on("framenavigated", (f) => {
  if (f === page.mainFrame()) navs.push(f.url());
});
await page.locator(`a[href="/p/${CONTROL_SLUG}"]`).first().evaluate((el) => el.click());
await page.waitForTimeout(4000);
results.control = {
  documentNavigated: navs.length > 0,
  navs,
  url: page.url(),
  renderer: await page.locator("html").getAttribute("data-renderer"),
  mountedLeaf:
    (await page.locator("[data-page-view],[data-page-host],[data-ide-state],#spa-root [data-route]").count()) > 0,
};

results.consoleErrors = consoleErrors;
results.pageErrors = pageErrors;
results.failedRequests = failedRequests;

console.log(JSON.stringify(results, null, 2));
await browser.close();

const ok =
  results.showcase.documentNavigated === true &&
  results.showcase.renderer === "ssr" &&
  results.showcase.ssrCause === "showcase" &&
  results.showcase.pageJs &&
  results.showcase.ideJs &&
  results.control.renderer === "spa" &&
  consoleErrors.length === 0 &&
  pageErrors.length === 0;
console.log(ok ? "SHOWCASE-HANDOFF: PASS" : "SHOWCASE-HANDOFF: FAIL");
process.exit(ok ? 0 : 1);
