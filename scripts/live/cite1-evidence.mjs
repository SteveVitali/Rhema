// CITE.1/DEF.4 funded-leg evidence walk — UNCOMMITTED scratch driver (the ledger cites it by hash).
// Replays N11's dossier-chip asserts and R9's two-request refund flow against a delivered run,
// using the cached magic-link storageState (test+jrn-a). Prints JSON evidence; saves PNGs.
//
//   MODE=n11|refund SLUG=<slug> RUN_ID=<id> OUT_DIR=<dir> [RUN_B_ID=<id> SLUG_B=<slug>]
//   node packages/journeys/cite1-evidence.tmp.mjs
import { chromium } from "playwright";
import { readFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

const WEB = (process.env.JOURNEY_WEB_URL ?? "https://rhema.tools").replace(/\/+$/, "");
const MODE = process.env.MODE ?? "n11";
const SLUG = process.env.SLUG ?? "";
const RUN_ID = process.env.RUN_ID ?? "";
const OUT_DIR = process.env.OUT_DIR ?? "docs/build/reports/cite1-evidence";
const STATE = ".journeys-state/test_jrn_a_rhema_tools.json";
mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({ storageState: STATE });
const page = await ctx.newPage();
const out = { mode: MODE, runId: RUN_ID };

const gotoOk = async (url) => {
  const r = await page.goto(url, { waitUntil: "domcontentloaded" });
  if (!r || r.status() >= 400) throw new Error(`GET ${url} → ${r?.status()}`);
};

async function dossierAsserts(slug, runId, tag) {
  await gotoOk(`${WEB}/p/${slug}/review/${runId}`);
  const urlRows = page.locator("span[data-claim-url]");
  const total = await urlRows.count();
  const uncovered = await page.locator('span[data-claim-url][data-url-in-log="false"]').count();
  const chips = await page.locator('a[data-fetched="true"], a[data-fetched="search"]').count();
  const evidenceLis = await page.locator("div[data-finding-evidence] li:has(> a)").count();
  const stamped = evidenceLis > 0
    ? await page.locator("div[data-finding-evidence] li:has(> [data-fetched-chip])").count()
    : 0;
  const verdictRows = await page.locator("[data-verdict]").count();
  await page.screenshot({ path: join(OUT_DIR, `${tag}-dossier.png`), fullPage: true });
  return { total, uncovered, chips, evidenceLis, stamped, verdictRows };
}

async function spendable() {
  await gotoOk(`${WEB}/usage`);
  const text = (await page.locator("[data-usage-balance]").textContent()) ?? "";
  const m = /(\d[\d,]*)\s*cr/i.exec(text);
  return m?.[1] != null ? Number(m[1].replace(/,/g, "")) : null;
}

async function refundLeg(slug, runId, tag) {
  await gotoOk(`${WEB}/p/${slug}/r/${runId}`);
  const cta = page.locator("[data-refund-cta]").first();
  const ctaVisible = await cta.isVisible().catch(() => false);
  const ctaText = ctaVisible ? ((await cta.textContent()) ?? "").trim() : null;
  if (!ctaVisible) return { tag, cta: false };
  const n = /(\d[\d,]*)\s*cr/i.exec(ctaText ?? "")?.[1];
  await page.screenshot({ path: join(OUT_DIR, `${tag}-pre.png`), fullPage: true });
  await cta.click();
  await page.waitForLoadState("domcontentloaded");
  const refunded = await page.locator('[data-refund-state="refunded"]').first().textContent().catch(() => null);
  const pending = await page.locator('[data-refund-state="pending_review"]').first().textContent().catch(() => null);
  const denied = await page.locator('[data-refund-state="denied"]').first().textContent().catch(() => null);
  await page.screenshot({ path: join(OUT_DIR, `${tag}-post.png`), fullPage: true });
  return { tag, cta: true, ctaText, ctaN: n != null ? Number(n.replace(/,/g, "")) : null,
           refunded: refunded?.trim() ?? null, pending: pending?.trim() ?? null, denied: denied?.trim() ?? null };
}

try {
  if (MODE === "n11") {
    out.dossier = await dossierAsserts(SLUG, RUN_ID, "n11");
  } else if (MODE === "refund") {
    out.before = await spendable();
    out.legA = await refundLeg(SLUG, RUN_ID, "r9a");
    out.afterA = await spendable();
    if (process.env.RUN_B_ID && process.env.SLUG_B) {
      out.legB = await refundLeg(process.env.SLUG_B, process.env.RUN_B_ID, "r9b");
      out.afterB = await spendable();
    }
  }
  console.log("[evidence]", JSON.stringify(out, null, 1));
} finally {
  await browser.close();
}
