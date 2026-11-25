// 329_R7UX.6 (BL-97) — pr-423 headless walk: the slash menu's acceptance legs against the
// deployed preview tip. Real magic-link mint for a test identity (the pinned test@rhema.tools
// mailbox via JourneySessions — never a lifted cookie), scratch project via the real
// POST /app/new {entry:"scratch"}, then the PM view's real keyboard path: type "/" →
// [data-slash-menu] emits → typed "he" filters → ArrowDown+Enter inserts h3 → "/" again →
// Escape dismisses (typed text stays). $0 — no inference.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire("/Users/stevenvitali/.rhema-build/wt-r7ux6/packages/journeys/package.json");
const { chromium } = require("playwright");
const { JourneySessions, freshIdentity } = await import(
  "/Users/stevenvitali/.rhema-build/wt-r7ux6/packages/journeys/dist/session.js"
);
const { createGmailClient, TEST_MAILBOX } = await import(
  "/Users/stevenvitali/.rhema-build/wt-r7ux6/packages/journeys/dist/mailbox.js"
);

const BASE = process.argv[2];
const OUT = process.argv[3];
if (!BASE || !OUT) throw new Error("usage: node walk.mjs <webOrigin> <outDir>");
mkdirSync(OUT, { recursive: true });

const facts = { base: BASE, ts: new Date().toISOString(), legs: {} };
const browser = await chromium.launch();
const mailbox = createGmailClient(TEST_MAILBOX);
const sessions = new JourneySessions({
  browser,
  mailbox,
  webBaseUrl: BASE,
  stateDir: `${OUT}/.state`, // local session cache (live cookies) — P-1: never commit this dir
  viewport: { width: 1440, height: 960 },
  // invite-mode stage — the seeded `prv-<n>-test` admit, carried through the /signup form's real
  // `code` field (MAINT.6's wire shape).
  inviteCode: process.env.WALK_INVITE_CODE ?? "prv-423-test",
});

const email = freshIdentity("r7ux6", "slash");
// useCache: a mint from an earlier walk attempt of the same address is a live session — re-minting
// would also race the per-IP send bucket (a throttled re-send yields no fresh link and the mailbox
// leg picks the stale consumed one). First run still mints cold, exactly like the nightly N2 arm.
const signed = await sessions.signIn(email, { useCache: true });
const { page, context } = signed;
facts.signinVia = signed.via;
facts.email = email;

// the real create seam — POST /app/new {entry:"scratch"} (the leaf's own shape) → 302 /p/<slug>
// (maxRedirects: 0 — the Location header IS the create reply).
const create = await context.request.post(`${BASE}/app/new`, {
  form: { entry: "scratch" },
  maxRedirects: 0,
});
facts.legs.create = { status: create.status(), location: create.headers()["location"] ?? null };
const slugMatch = /\/p\/([^/?]+)/.exec(facts.legs.create.location ?? "");
facts.projectSlug = slugMatch?.[1] ?? null;
if (!facts.projectSlug)
  throw new Error(`scratch create did not redirect to /p/<slug>: ${JSON.stringify(facts.legs.create)}`);

await page.goto(`${BASE}/p/${facts.projectSlug}`, { waitUntil: "domcontentloaded" });
// the live EditorView mount stamp
await page.locator("[data-page-view]").first().waitFor({ state: "attached", timeout: 30_000 });
await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
facts.legs.pageMounted = true;

// click into the ProseMirror editable so the caret lands in the (empty) first paragraph
const pm = page.locator(".ProseMirror").first();
await pm.click();
await page.waitForTimeout(200);

// ── AC1: `/` at block start emits [data-slash-menu] ──
await page.keyboard.type("/");
await page.locator("[data-slash-menu]").waitFor({ state: "attached", timeout: 10_000 });
facts.legs.menuOpened = true;
const items0 = await page.locator("[data-slash-item]").allTextContents();
facts.legs.initialRows = items0;
await page.screenshot({ path: `${OUT}/slash-menu-open.png` });
await page.locator("[data-slash-menu]").screenshot({ path: `${OUT}/slash-menu-box.png` });

// ── AC2: typed text filters the rows ──
await page.keyboard.type("he");
await page.waitForTimeout(300);
const itemsHe = await page.locator("[data-slash-item]").evaluateAll((els) =>
  els.map((e) => e.getAttribute("data-slash-item")),
);
facts.legs.filteredRows = itemsHe;
await page.locator("[data-slash-menu]").screenshot({ path: `${OUT}/slash-menu-filtered.png` });

// ── AC3: ArrowDown + Enter inserts the second row (h3), the `/` is consumed ──
await page.keyboard.press("ArrowDown");
await page.waitForTimeout(150);
facts.legs.activeAfterArrow = await page
  .locator("[data-slash-item][data-highlighted]")
  .getAttribute("data-slash-item");
await page.keyboard.press("Enter");
await page.waitForTimeout(400);
facts.legs.menuClosedAfterEnter = (await page.locator("[data-slash-menu]").count()) === 0;
const docText = await pm.textContent();
facts.legs.docAfterEnter = { hasH3: (await pm.locator("h3").count()) > 0, noSlash: !docText.includes("/") };
await page.screenshot({ path: `${OUT}/slash-menu-after-insert.png` });

// ── AC4: Escape dismisses, text stays ──
await page.keyboard.press("Enter"); // new paragraph
await page.keyboard.type("/qu");
await page.locator("[data-slash-menu]").waitFor({ state: "attached", timeout: 10_000 });
await page.keyboard.press("Escape");
await page.waitForTimeout(300);
facts.legs.menuClosedAfterEscape = (await page.locator("[data-slash-menu]").count()) === 0;
facts.legs.textKeptAfterEscape = (await pm.textContent()).includes("/qu");
await page.screenshot({ path: `${OUT}/slash-menu-after-escape.png` });

await browser.close();
facts.verdict =
  facts.legs.menuOpened === true &&
  facts.legs.filteredRows.length > 0 && facts.legs.filteredRows.length < facts.legs.initialRows.length &&
  facts.legs.menuClosedAfterEnter === true && facts.legs.docAfterEnter.hasH3 === true && facts.legs.docAfterEnter.noSlash === true &&
  facts.legs.menuClosedAfterEscape === true && facts.legs.textKeptAfterEscape === true
    ? "PASS"
    : "REVIEW";
writeFileSync(`${OUT}/walk-facts.json`, JSON.stringify(facts, null, 2) + "\n");
console.log(`walk verdict: ${facts.verdict}`);
