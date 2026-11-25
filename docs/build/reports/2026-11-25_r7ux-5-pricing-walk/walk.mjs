// 328_R7UX.5 (BL-96) — pr-422 headless walk: the landing pricing teaser, one honest anchor.
// `/` is PUBLIC ($0, no auth). The script recomputes the expected anchor from the BUILT shared
// estimator/entitlement modules (the same dist code the web image serves), then reads the served
// section and asserts the single-anchor contract: no `N – N` credit range anywhere in
// data-section="pricing".
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire("/Users/stevenvitali/.rhema-build/wt-r7ux5/packages/journeys/package.json");
const { chromium } = require("playwright");
const { surfacePricer } = await import(
  "/Users/stevenvitali/.rhema-build/wt-r7ux5/packages/run-sheet/dist/surface.js"
);
const contracts = await import(
  "/Users/stevenvitali/.rhema-build/wt-r7ux5/packages/contracts/dist/index.js"
);
const {
  buildPricingPageData,
  reviewCardCredits,
  formatUsd,
  formatCredits,
  RIGOR_DISPLAY,
  MODEL_TIER_DISPLAY,
} = contracts;

const BASE = process.argv[2];
const OUT = process.argv[3];
if (!BASE || !OUT) throw new Error("usage: node walk.mjs <webOrigin> <outDir>");
mkdirSync(OUT, { recursive: true });

// ── the expected anchor, derived through the same built modules marketing.tsx calls ──
const pricer = surfacePricer();
const pricing = buildPricingPageData(undefined, pricer);
const essayCard = pricing.cards.find((card) => card.key === "essay") ?? pricing.cards[0];
const ent = pricing.trial.entitlement;
const teaserReview = reviewCardCredits(pricer, essayCard.words, essayCard.claims, ent.modelTier);
const expected = {
  words: essayCard.words.toLocaleString("en-US"),
  claims: String(essayCard.claims),
  rigor: RIGOR_DISPLAY[ent.rigor],
  tier: MODEL_TIER_DISPLAY[ent.modelTier],
  usd: teaserReview == null ? "—" : formatUsd(teaserReview),
  credits: teaserReview == null ? "—" : formatCredits(teaserReview),
  entitlement: ent,
};

const facts = { base: BASE, ts: new Date().toISOString(), expected };
const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 1440, height: 960 },
  userAgent: "Mozilla/5.0 R7UX5-Walk +RhemaJourney",
});
const page = await ctx.newPage();

const res = await page.goto(`${BASE}/`, { waitUntil: "networkidle" });
facts.landing = { status: res?.status() };

const section = page.locator('[data-section="pricing"]');
facts.landing.pricingSectionPresent = (await section.count()) === 1;
const sectionText = await section.textContent();
facts.landing.pricingSectionText = sectionText?.replace(/\s+/g, " ").trim();

// the teaser line: the <p> carrying the "{words} words · {claims} claims" copy
const teaser = section.locator("p", { hasText: "words ·" }).first();
facts.landing.teaserText = (await teaser.textContent())?.replace(/\s+/g, " ").trim();
await teaser.screenshot({ path: `${OUT}/landing-pricing-teaser.png` });
await section.screenshot({ path: `${OUT}/landing-pricing-section.png` });

// no credit RANGE may remain inside the pricing section (the old "2,600 – 11,730 credits")
facts.landing.rangeMatches = sectionText?.match(/\d[\d,]*\s*[–-]\s*\d[\d,]*\s*credits/g) ?? [];
// the derived anchor pieces must all be present
facts.landing.anchorPieces = Object.fromEntries(
  Object.entries({
    words: expected.words,
    claims: expected.claims,
    rigor: expected.rigor,
    tier: expected.tier,
    usd: expected.usd,
    credits: expected.credits,
  }).map(([k, v]) => [k, sectionText?.includes(v) === true]),
);

facts.verdict = {
  singleAnchor:
    facts.landing.pricingSectionPresent === true &&
    facts.landing.rangeMatches.length === 0 &&
    Object.values(facts.landing.anchorPieces).every(Boolean),
};

writeFileSync(`${OUT}/walk-facts.json`, JSON.stringify(facts, null, 2));
await browser.close();
console.log(JSON.stringify(facts, null, 2));
