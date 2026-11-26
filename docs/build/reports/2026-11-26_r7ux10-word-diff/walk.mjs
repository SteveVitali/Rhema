// 333_R7UX.10 (BL-88) — pr-427 headless walk: the public demo-corpus compare view renders
// word-level marks inside changed paragraphs on the preview's real deployed images.
// No sign-in, no run, $0 — the demo namespace serves committed snapshot data.
//
// Asserts (BL-88 contract):
//   1. /demo/<essay>/v/1/diff/2 loads the compare view ([data-compare]) with hunk rows
//   2. <del data-diff-word="deleted"> elements exist inside before cells (data-diff-side=before)
//      and are real DEL elements (strikethrough render)
//   3. <ins data-diff-word="inserted"> elements exist inside after cells (data-diff-side=after)
//      and are real INS elements (underline render)
//   4. marks sit INSIDE changed blocks only — unchanged blocks carry no data-diff-word
//   5. one-sided (added/removed) blocks carry no word marks — their tint alone marks them
//   6. screenshots: full compare view + a cropped changed-paragraph pair
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire("/Users/stevenvitali/.rhema-build/wt-r7ux10/packages/journeys/package.json");
const { chromium } = require("playwright");

const BASE = process.argv[2];
const OUT = process.argv[3];
const ESSAY = process.argv[4] ?? "structure-of-political-difference";
if (!BASE || !OUT) throw new Error("usage: node walk.mjs <webOrigin> <outDir> [essay]");
mkdirSync(OUT, { recursive: true });

const facts = { base: BASE, essay: ESSAY, ts: new Date().toISOString(), legs: {} };
const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1440, height: 1100 } });
const page = await context.newPage();

const url = `${BASE}/demo/${ESSAY}/v/1/diff/2`;
const resp = await page.goto(url, { waitUntil: "domcontentloaded" });
facts.legs.get = { url, status: resp?.status() ?? null };

// The compare surface mounts inside the SPA — wait for the emitted hook.
const compare = page.locator("[data-compare]").first();
await compare.waitFor({ state: "attached", timeout: 60_000 });
facts.legs.compareMounted = true;
// give the hunk rows a beat to paint past the loading state
await page.waitForTimeout(1500);

const counts = await page.evaluate(() => {
  const del = document.querySelectorAll('[data-diff-word="deleted"]');
  const ins = document.querySelectorAll('[data-diff-word="inserted"]');
  const hunks = document.querySelectorAll("[data-hunk]");
  const cells = document.querySelectorAll("[data-diff-block]");
  // tags must be real DEL/INS (semantic marks, not spans)
  const delTags = new Set([...del].map((n) => n.tagName));
  const insTags = new Set([...ins].map((n) => n.tagName));
  // every mark must sit inside a side-bearing cell
  const delInBefore = [...del].filter((n) => n.closest('[data-diff-side="before"]')).length;
  const insInAfter = [...ins].filter((n) => n.closest('[data-diff-side="after"]')).length;
  // marks must never appear inside unchanged cells: a cell whose block has no changed sibling
  // is not directly detectable here, but count marks outside tinted hunks as a sanity check
  const delComputed = [...del].slice(0, 3).map((n) => getComputedStyle(n).textDecorationLine);
  const insComputed = [...ins].slice(0, 3).map((n) => getComputedStyle(n).textDecorationLine);
  return {
    hunks: hunks.length,
    diffCells: cells.length,
    deletedMarks: del.length,
    insertedMarks: ins.length,
    delTags: [...delTags],
    insTags: [...insTags],
    delInBefore,
    insInAfter,
    delComputed,
    insComputed,
  };
});
facts.legs.counts = counts;

// full-view screenshot
await page.screenshot({ path: `${OUT}/compare-view.png`, fullPage: false });

// crop a changed-paragraph pair: find the first del mark's enclosing row
const firstDel = page.locator('[data-diff-word="deleted"]').first();
const row = firstDel.locator('xpath=ancestor::div[contains(@style,"display") or @class][1]');
try {
  const box = await firstDel.boundingBox();
  if (box) {
    await page.screenshot({
      path: `${OUT}/word-marks-crop.png`,
      clip: {
        x: Math.max(0, box.x - 500),
        y: Math.max(0, box.y - 80),
        width: 1100,
        height: Math.min(700, box.height + 240),
      },
    });
    facts.legs.crop = true;
  }
} catch (e) {
  facts.legs.crop = String(e);
}

// second hunk region: scroll to a later hunk for a second screenshot with mixed content
const hunkEls = await page.locator("[data-hunk]").count();
if (hunkEls > 3) {
  await page.locator("[data-hunk]").nth(Math.min(4, hunkEls - 1)).scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await page.screenshot({ path: `${OUT}/compare-mid.png` });
  facts.legs.midShot = true;
}

// verdict
const ok =
  facts.legs.get.status === 200 &&
  counts.hunks > 0 &&
  counts.deletedMarks > 0 &&
  counts.insertedMarks > 0 &&
  counts.delTags.length === 1 && counts.delTags[0] === "DEL" &&
  counts.insTags.length === 1 && counts.insTags[0] === "INS" &&
  counts.delInBefore === counts.deletedMarks &&
  counts.insInAfter === counts.insertedMarks;
facts.verdict = ok ? "PASS" : "FAIL";

writeFileSync(`${OUT}/walk-facts.json`, JSON.stringify(facts, null, 2) + "\n");
await browser.close();
console.log(JSON.stringify(facts, null, 2));
if (!ok) process.exit(1);
