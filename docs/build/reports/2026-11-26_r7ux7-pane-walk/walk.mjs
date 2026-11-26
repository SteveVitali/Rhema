// 330_R7UX.7 (BL-98, REQ-PANE-1) — pr-424 headless walk: the divider's persisted split +
// double-click reset against the deployed preview tip. Real magic-link mint for a test
// identity (the pinned test@rhema.tools mailbox via JourneySessions — never a lifted
// cookie), scratch project via the real POST /app/new {entry:"scratch"}, then the real
// pointer path: drag [data-ide-handle="panel"] left → --panel-w + the rhema:panes:v2 blob
// carry the stored split → reload → the split renders back → dblclick the divider →
// --panel-w returns to the 320 default AND the panelWidth key leaves the blob → a second
// reload stays at the default. $0 — no inference.
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire("/Users/stevenvitali/.rhema-build/wt-r7ux7/packages/journeys/package.json");
const { chromium } = require("playwright");
const { JourneySessions, freshIdentity } = await import(
  "/Users/stevenvitali/.rhema-build/wt-r7ux7/packages/journeys/dist/session.js"
);
const { createGmailClient, TEST_MAILBOX } = await import(
  "/Users/stevenvitali/.rhema-build/wt-r7ux7/packages/journeys/dist/mailbox.js"
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
  viewport: { width: 1440, height: 960 }, // ≥1280 → the panel's DOCKED arm
  // invite-mode stage — the seeded `prv-<n>-test` admit, carried through the /signup form's real
  // `code` field (MAINT.6's wire shape).
  inviteCode: process.env.WALK_INVITE_CODE ?? "prv-424-test",
});

const email = freshIdentity("r7ux7", "pane");
// useCache: a mint from an earlier walk attempt of the same address is a live session — re-minting
// would also race the per-IP send bucket (a throttled re-send yields no fresh link and the mailbox
// leg picks the stale consumed one). First run still mints cold, exactly like the nightly N2 arm.
const signed = await sessions.signIn(email, { useCache: true });
const { page, context } = signed;
facts.signinVia = signed.via;
facts.email = email;

// the real create seam — POST /app/new {entry:"scratch"} (the leaf's own shape) → 302 /p/<slug>
const create = await context.request.post(`${BASE}/app/new`, {
  form: { entry: "scratch" },
  maxRedirects: 0,
});
facts.legs.create = { status: create.status(), location: create.headers()["location"] ?? null };
const slugMatch = /\/p\/([^/?]+)/.exec(facts.legs.create.location ?? "");
facts.projectSlug = slugMatch?.[1] ?? null;
if (!facts.projectSlug)
  throw new Error(`scratch create did not redirect to /p/<slug>: ${JSON.stringify(facts.legs.create)}`);

const ideRoot = () => page.locator(".ide").first();
const handle = () => page.locator('[data-ide-handle="panel"]').first();
const panelW = async () =>
  ideRoot().evaluate((el) => el.style.getPropertyValue("--panel-w"));
const ariaNow = async () => handle().getAttribute("aria-valuenow");
const panesBlob = async () =>
  page.evaluate(() => {
    const key = Object.keys(localStorage).find((k) => k.startsWith("rhema:panes:"));
    return key ? { key, blob: JSON.parse(localStorage.getItem(key)) } : { key: null, blob: null };
  });

await page.goto(`${BASE}/p/${facts.projectSlug}`, { waitUntil: "domcontentloaded" });
await handle().waitFor({ state: "attached", timeout: 30_000 });
await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
facts.legs.mounted = true;
facts.legs.initial = { panelW: await panelW(), ariaNow: await ariaNow() };

// ── AC1: a real pointer drag on the divider writes the stored split ──
// The controller's math is `ide.rect.right - clientX`; the .ide box is the full 1440 viewport,
// so clientX = 1020 ⇒ px = 420 ⇒ snaps (±24) to 400.
const box = await handle().boundingBox();
if (!box) throw new Error("no bounding box on [data-ide-handle=panel]");
await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await page.mouse.down();
for (let x = Math.round(box.x); x >= 1020; x -= 10) await page.mouse.move(x, box.y + box.height / 2);
await page.mouse.up();
await page.waitForTimeout(400);
facts.legs.afterDrag = {
  panelW: await panelW(),
  ariaNow: await ariaNow(),
  panes: await panesBlob(),
};
await page.screenshot({ path: `${OUT}/split-custom.png` });

// ── AC2: a reload renders the stored split ──
await page.reload({ waitUntil: "domcontentloaded" });
await handle().waitFor({ state: "attached", timeout: 30_000 });
await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
facts.legs.afterReload = {
  panelW: await panelW(),
  ariaNow: await ariaNow(),
  panes: await panesBlob(),
};
await page.screenshot({ path: `${OUT}/split-persisted.png` });

// ── AC3: a double-click on the divider restores the default AND clears the pref ──
await handle().dblclick();
await page.waitForTimeout(400);
facts.legs.afterDblclick = {
  panelW: await panelW(),
  ariaNow: await ariaNow(),
  panes: await panesBlob(),
};
await page.screenshot({ path: `${OUT}/split-reset.png` });

// ── AC4: the cleared pref survives a reload — the default, not the old split ──
await page.reload({ waitUntil: "domcontentloaded" });
await handle().waitFor({ state: "attached", timeout: 30_000 });
await page.waitForLoadState("networkidle", { timeout: 20_000 }).catch(() => undefined);
facts.legs.afterResetReload = {
  panelW: await panelW(),
  panes: await panesBlob(),
};

await browser.close();
const storedPx = facts.legs.afterDrag.panes?.blob?.panelWidth;
const persistedPx = facts.legs.afterReload.panes?.blob?.panelWidth;
const clearedKeyGone =
  facts.legs.afterDblclick.panes?.blob &&
  !("panelWidth" in facts.legs.afterDblclick.panes.blob);
const stillGone =
  !facts.legs.afterResetReload.panes?.blob ||
  !("panelWidth" in facts.legs.afterResetReload.panes.blob);
facts.verdict =
  typeof storedPx === "number" && storedPx !== 320 &&
  facts.legs.afterDrag.panelW === `${storedPx}px` &&
  persistedPx === storedPx &&
  facts.legs.afterReload.panelW === `${storedPx}px` &&
  facts.legs.afterDblclick.panelW === "320px" &&
  clearedKeyGone === true &&
  facts.legs.afterResetReload.panelW === "320px" &&
  stillGone === true
    ? "PASS"
    : "REVIEW";
writeFileSync(`${OUT}/walk-facts.json`, JSON.stringify(facts, null, 2) + "\n");
console.log(`walk verdict: ${facts.verdict}`);
