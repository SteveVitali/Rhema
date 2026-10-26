#!/usr/bin/env node
// R6POST.1 — POST-3 (deep-link restore, D-CAP.1-1) + POST-5b (entitlement render probes,
// D-MAINT.3-1) on prod, as the flagged jrn-a session (storageState minted by the run-B suite).
// Run from repo root: node docs/build/reports/2026-10-22_R6POST.1/post3-post5-probe.mjs
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require(require.resolve("playwright", {
  paths: ["./packages/journeys"],
}));

const RDIR = "docs/build/reports/2026-10-22_R6POST.1";
const STATE = ".journeys-state/test_jrn_a_rhema_tools.json";
const WEB = "https://rhema.tools";
const SLUG = "jrn-bl78-mooted";
const RUN = "bl78_d025c50e-5564-487b-a140-fb13a296d501";
const MOOTED_FID = "bl78_047beb10-e10d-46e0-ba70-38019e73cc5b";

const evidence = { at: new Date().toISOString(), web: WEB, legs: {} };
const browser = await chromium.launch({ channel: "chrome", headless: true });

try {
  const ctx = await browser.newContext({
    storageState: STATE,
    viewport: { width: 1440, height: 900 },
  });
  const page = await ctx.newPage();
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  // ---- POST-3: deep-link restore ------------------------------------------------------------
  // GET /p/<slug>/f/<fid> → 302 → /p/<slug>/review/<runId>#<anchor>; the dossier must render the
  // finding in its surrounding context (the anchor row inside the findings pane, not a bare 200).
  const resp = await page.goto(`${WEB}/p/${SLUG}/f/${MOOTED_FID}`, { waitUntil: "load" });
  const landed = page.url();
  evidence.legs.deepLink = {
    requested: `/p/${SLUG}/f/${MOOTED_FID}`,
    landed,
    firstStatus: resp?.status(),
    redirectedToDossierAnchor: new RegExp(`/p/${SLUG}/review/${RUN}#`).test(landed),
    anchor: landed.split("#")[1] ?? null,
  };
  await page.waitForTimeout(1200);
  // context/layout assertions: the findings pane + anchor row + surrounding cards render
  const layout = await page.evaluate((anchor) => {
    const anchored = anchor ? document.getElementById(anchor) ?? document.querySelector(`[id="${anchor}"]`) : null;
    const byData = anchor ? document.querySelector(`[data-finding-id="${anchor.replace(/^f-/, "")}"], [id*="${anchor.replace(/^f-/, "")}"]`) : null;
    const target = anchored ?? byData;
    const anyFindingCards = document.querySelectorAll("[data-finding], [data-finding-id], article, [data-card]").length;
    const scrollEl = target ?? null;
    const rect = scrollEl?.getBoundingClientRect() ?? null;
    return {
      anchoredBy: anchored ? "id" : byData ? "data" : null,
      findingCardCount: anyFindingCards,
      targetInViewport: rect ? rect.top < innerHeight && rect.bottom > 0 : false,
      hasFindingsPane: !!document.querySelector("[data-findings], [id='findings'], main"),
      title: document.title.slice(0, 120),
      bodyLen: document.body.innerText.length,
    };
  }, evidence.legs.deepLink.anchor);
  evidence.legs.deepLink.layout = layout;
  await page.screenshot({ path: `${RDIR}/post3-deeplink.png`, fullPage: false });
  evidence.legs.deepLink.verdict =
    evidence.legs.deepLink.redirectedToDossierAnchor && layout.anchoredBy != null ? "PASS" : "REVIEW";

  // ---- POST-5b: entitlement render probes ----------------------------------------------------
  // matched shape review/standard/base → `Included` + hidden entitlementId
  await page.goto(`${WEB}/p/${SLUG}/run?workflow=review&rigor=standard&modelTier=base`, {
    waitUntil: "load",
  });
  await page.waitForTimeout(1500);
  evidence.legs.entitlementMatched = await page.evaluate(() => {
    const included = document.querySelector("[data-included]");
    const hidden = document.querySelector("input[name='entitlementId']");
    const estimateBox = document.querySelector("[data-estimate-box]");
    const body = document.body.innerText;
    return {
      dataIncluded: included?.getAttribute("data-included") ?? null,
      hiddenEntitlementId: hidden ? "present (value redacted)" : null,
      estimateBoxPresent: !!estimateBox,
      includedText: included ? included.innerText.slice(0, 160) : null,
      hasFundedEstimate: /estimat|credits|\$/i.test(body.slice(0, 4000)),
    };
  });
  await page.screenshot({ path: `${RDIR}/post5-entitlement-matched.png` });
  evidence.legs.entitlementMatched.verdict =
    evidence.legs.entitlementMatched.dataIncluded === "true" &&
    evidence.legs.entitlementMatched.hiddenEntitlementId != null
      ? "PASS"
      : "REVIEW";

  // mismatched shape (rigor=quick — NOT the entitled review/standard/base) → funded estimate, no
  // data-included, no hidden entitlementId (MAINT.3's suppression arm). The "funded estimate"
  // contract = the credits breakdown copy renders (the `data-estimate-box` hook is absent on the
  // insufficient-balance variant the seeded tenant lands in — the honest funded figure + cap copy
  // is the arm), NOT `data-included`/hidden-id.
  await page.goto(`${WEB}/p/${SLUG}/run?workflow=review&rigor=quick&modelTier=base`, {
    waitUntil: "load",
  });
  await page.waitForTimeout(1500);
  evidence.legs.entitlementMismatched = await page.evaluate(() => {
    const included = document.querySelector("[data-included]");
    const hidden = document.querySelector("input[name='entitlementId']");
    const body = document.body.innerText;
    return {
      dataIncludedPresent: !!included,
      hiddenEntitlementIdPresent: !!hidden,
      // the funded-estimate signals: a "Why this estimate" breakdown line and/or the cap-credits
      // figure — credits arithmetic, never the "Included" claim.
      fundedEstimateRendered: /Why this estimate|≈\s*\d+\s*cr|cap \(\d+\)|credits/i.test(body),
      estimateExcerpt: (body.match(/Why this estimate[^\n]{0,220}/)?.[0] ?? null),
      includedClaimRendered: /Included — your trial|covers up to/i.test(body),
    };
  });
  await page.screenshot({ path: `${RDIR}/post5-entitlement-mismatched.png` });
  evidence.legs.entitlementMismatched.verdict =
    !evidence.legs.entitlementMismatched.dataIncludedPresent &&
    !evidence.legs.entitlementMismatched.hiddenEntitlementIdPresent &&
    evidence.legs.entitlementMismatched.fundedEstimateRendered &&
    !evidence.legs.entitlementMismatched.includedClaimRendered
      ? "PASS"
      : "REVIEW";

  evidence.consoleErrors = consoleErrors;
} finally {
  await browser.close();
}

writeFileSync(`${RDIR}/post3-post5-probes.json`, JSON.stringify(evidence, null, 1));
console.log(JSON.stringify(evidence, null, 1));
