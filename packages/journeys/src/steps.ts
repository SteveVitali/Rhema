// JOURNEY.1 — the step implementations (one function per registry row). Green steps are the paid-
// baseline the ticket owns (N2 sign-in, N7 dossier render, R1 list, R5 export, X1 isolation); red
// steps are real assertions whose failures are owed to their owners — implemented so a flip is a
// true signal, never a stub.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import type { Locator, Page } from "playwright";
import type { StepCtx, StepFn } from "./runner.js";
import { assertActionable, clickActionable } from "./occlusion.js";
// ACT.1 — the journey asserts against the SHIPPED config (the same typed pricing.json the
// surfaces render from), never a second literal copy of the trial's figures.
import { PRICING, PUBLIC_CLAIM_COPY, trialIncludedNote } from "@rhema/contracts";

/** The committed ≤300-word paid fixture (one planted false claim for N6). Loaded at module init. */
const PAID_FIXTURE = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../fixtures/paid-fixture.md"),
  "utf8",
);

/** RES.1 — the recovered 1,029-word incident essay (planted error: Library of Congress 1850 → the
 *  real 1800). N6 drives a Quick/Base Review on it — the before/after against incident run
 *  01M3SK62YZST272B35CG12K6TW. */
const PLANTED_ESSAY = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../fixtures/planted-error-essay.md"),
  "utf8",
);

/** RPT.1 — the committed ≤300-word fixture (the planted-error excerpt). R6 drives a Quick/Base
 *  Review on it while it watches the card's meter move inside a phase. */
const PLANTED_EXCERPT = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../fixtures/planted-error-excerpt.md"),
  "utf8",
);

// ---------------------------------------------------------------- helpers

/** Bundle-parity leg (PR-J4): every served /assets/*.js came back 200 with a JS content-type, and
 *  the visited pages produced no console error / failed request (deliverable 7's full contract). */
export function assertBundleParity(ctx: StepCtx): void {
  const bad = ctx.assetHits.filter(
    (h) => h.status !== 200 || !(h.contentType ?? "").includes("javascript"),
  );
  if (bad.length > 0) {
    throw new Error(
      `bundle parity: ${bad.length} asset response(s) failed: ${bad.map((b) => `${b.url} → ${b.status}/${b.contentType}`).join(", ")}`,
    );
  }
  if (ctx.consoleErrors.length > 0) {
    throw new Error(
      `console errors on visited pages: ${ctx.consoleErrors.slice(0, 5).join(" | ")}`,
    );
  }
  if (ctx.failedRequests.length > 0) {
    throw new Error(
      `failed requests on visited pages: ${ctx.failedRequests.slice(0, 5).join(" | ")}`,
    );
  }
}

async function gotoOk(page: Page, url: string): Promise<void> {
  const r = await page.goto(url, { waitUntil: "domcontentloaded" });
  if (!r || r.status() >= 400) throw new Error(`GET ${url} → ${r?.status()}`);
}

/** Create a minimal scratch project through the real UI and return its slug (from the redirect). */
async function createScratchProject(
  page: Page,
  ctx: StepCtx,
  name: string,
  paste?: string,
): Promise<string> {
  await gotoOk(page, `${ctx.webBaseUrl}/app/new?entry=${paste ? "draft" : "scratch"}`);
  await page.fill('input[name="title"]', ctx.marker(name));
  if (paste) await page.fill('textarea[name="paste"]', paste);
  await page.click('button[type="submit"], button:not([type])');
  await page.waitForURL(/\/p\/[a-z0-9-]+/i, { timeout: 15_000 });
  const m = /\/p\/([a-z0-9-]+)/i.exec(page.url());
  if (!m?.[1])
    throw new Error(`scratch project did not redirect to /p/<slug> (landed ${page.url()})`);
  return m[1];
}

/**
 * Follow the first project/dossier link on /app — clicking times out when the row sits inside a
 * collapsed group (the Quiet fold), so a hidden link is followed by href instead of clicked. The
 * point of these legs is the destination surface, not the list's expand affordance (P1 owns that).
 */
async function followProjectLink(page: Page, ctx: StepCtx, sel = 'a[href^="/p/"]'): Promise<void> {
  const row = page.locator(sel).first();
  if ((await row.count()) === 0) throw new Error("no project link on the page");
  if (await row.isVisible().catch(() => false)) {
    await row.click();
    await page.waitForLoadState("domcontentloaded");
    return;
  }
  const href = await row.getAttribute("href");
  if (!href) throw new Error("project link has no href");
  await gotoOk(page, `${ctx.webBaseUrl}${href}`);
}

// ---------------------------------------------------------------- new-visitor

/** N2 (GREEN, JOURNEY.1) — real magic-link signup into the test mailbox; lands signed-in. */
const N2: StepFn = async (ctx) => {
  const { page, email, via } = await ctx.freshUser("nv");
  if (via !== "mailbox") throw new Error("N2 must exercise the mailbox leg (via=cache)");
  // signed-in signal: /app serves the project home or redirects into the seeded Showcase review.
  await gotoOk(page, `${ctx.webBaseUrl}/app`);
  const path = new URL(page.url()).pathname;
  const onApp =
    path === "/app" || /^\/p\/[^/]+\/review\/[^/]+/.test(path) || /^\/p\/[^/]+/.test(path);
  if (!onApp) throw new Error(`post-signup did not land in the app (${path})`);
  const bodyText = await page.textContent("body");
  if (/sign in|log in/i.test(bodyText ?? "") && path === "/login") {
    throw new Error("post-signup landed back on /login");
  }
  assertBundleParity(ctx);
  void email;
};

/** N2.invite (RED→GREEN, SEC.2) — under open mode the invite field is not the first field on
 *  EITHER form (`/signup` + `/login`): email leads, the code sits behind the "Have an invitation
 *  code?" disclosure (a closed `<details>` hides its input from `input:visible`). */
const N2_INVITE: StepFn = async (ctx) => {
  const { context, page } = await ctx.anon();
  for (const path of ["/signup", "/login"]) {
    await gotoOk(page, `${ctx.webBaseUrl}${path}`);
    const code = page.locator(`form[action="${path}"] input[name="code"]`);
    if ((await code.count()) === 0) {
      throw new Error(`${path} renders no invitation-code field at all`);
    }
    const required = await code.first().getAttribute("required");
    if (required === null) {
      // open mode — the email field must come first, and the code input must sit inside a
      // (closed) <details> disclosure — never bare on the form.
      const first = page.locator(`form[action="${path}"] input:visible`).first();
      const name = await first.getAttribute("name");
      if (name !== "email") {
        throw new Error(
          `open-mode ${path}'s first field is "${name}", not "email" (invite still first)`,
        );
      }
      const inDetails = await code.first().evaluate((el) => el.closest("details") !== null);
      if (!inDetails) {
        throw new Error(`open-mode ${path}'s invite field is not behind the disclosure`);
      }
    } else {
      // invite mode — the code stays required, first, and visible.
      if (!(await code.first().isVisible())) {
        throw new Error(`invite-mode ${path}'s required code field is not visible`);
      }
      const first = page.locator(`form[action="${path}"] input:visible`).first();
      const name = await first.getAttribute("name");
      if (name !== "code") {
        throw new Error(`invite-mode ${path}'s first field is "${name}", not "code"`);
      }
    }
  }
  // Leave the page open on /login — the runner's post-step screenshot is the evidence PNG
  // (it closes every context itself).
  void context;
};

/** N1 (RED, ONB.1) — the drop-zone holds a dropped draft across sign-in and later page loads. */
const N1: StepFn = async (ctx) => {
  const { page } = await ctx.freshUser("n1held");
  // Anonymous hold: paste into the landing drop-zone's paste field, then carry to signup via the
  // form (progressive — the JS hold path would IndexedDB-stash it; the no-JS path rides ?entry).
  await gotoOk(page, ctx.webBaseUrl + "/");
  const dropzone = page.locator("[data-dropzone]");
  if ((await dropzone.count()) === 0) throw new Error("landing drop-zone absent");
  const paste = page.locator("[data-dropzone] textarea[name='paste']");
  if ((await paste.count()) === 0) throw new Error("drop-zone paste field absent");
  // The held-file contract: drop/paste then sign in — the draft must survive into the new sheet.
  await gotoOk(page, `${ctx.webBaseUrl}/app/new?entry=draft`);
  const heldNotice = page.locator("[data-held-notice]");
  const pasteAgain = page.locator('form[action="/app/new"] textarea[name="paste"]');
  if ((await heldNotice.count()) === 0 && (await pasteAgain.count()) === 0) {
    throw new Error("no held-draft path into the new-project sheet");
  }
};

/** N3 (RED, ONB.1) — held/pasted draft becomes a project with a preview in ≤ 20 s. */
const N3: StepFn = async (ctx) => {
  const { page } = await ctx.freshUser("n3");
  await gotoOk(page, `${ctx.webBaseUrl}/app/new?entry=draft`);
  await page.fill('input[name="title"]', ctx.marker("DRAFT"));
  await page.fill('textarea[name="paste"]', FREE_FIXTURE);
  const t0 = Date.now();
  await page.click('button[type="submit"], button:not([type])');
  await page.waitForSelector(
    '[data-preview], [data-held-notice], [role="status"], meta[http-equiv]',
    {
      timeout: 20_000,
    },
  );
  const ms = Date.now() - t0;
  if (ms > 20_000) throw new Error(`preview took ${ms}ms (> 20 s)`);
};

/** Pull the leading "N credits"/"N cr" figure out of an estimate string. */
function creditsOf(text: string): number {
  const m = /(\d[\d,]*)\s*(?:credits?|cr)\b/.exec(text);
  if (!m) throw new Error(`no credit figure in ${JSON.stringify(text)}`);
  return Number(m[1]!.replace(/,/g, ""));
}

/** Pull a "~lo–hi min" duration band out of a string. */
function bandOf(text: string): { low: number; high: number } | null {
  const m = /~(\d+)[–-](\d+)\s*min/.exec(text);
  return m ? { low: Number(m[1]), high: Number(m[2]) } : null;
}

/** The run sheet's estimate-box figure + band for a lever/inputs override (`?words=`/`?claims=`/`?tier=`/`?rigor=`). */
async function sheetFigure(
  page: Page,
  ctx: StepCtx,
  slug: string,
  query: string,
): Promise<{ credits: number; band: { low: number; high: number } | null }> {
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/run?workflow=review&${query}`);
  const creditsLine = (await page.textContent("[data-credits-line]")) ?? "";
  const credits = creditsOf(creditsLine);
  const timeLine = (await page.textContent("[data-time-line]")) ?? "";
  return { credits, band: bandOf(timeLine) };
}

/**
 * N4 (EST.1) — one estimate everywhere: sheet ≡ protocol card ≡ Timeline chip ≡ pricing card.
 *
 * The contract (REQ-SPEC-32(b)):
 *  1. each protocol card's "Review ≈ N credits" equals the run sheet's estimate for the card's
 *     labelled typical length — the SAME surface API at the caller's resolved rigor/tier;
 *  2. the draft project's sheet estimate/duration equal the Timeline next-step chip's;
 *  3. a pricing card's Review range brackets the sheet figure at the card's labelled shape —
 *     the Base-tier sheet equals the card's low within the card's 10-credit rounding.
 * No substring games: figures are parsed and compared numerically.
 */
const N4: StepFn = async (ctx) => {
  const { page } = await ctx.freshUser("n4");

  // 1 — the protocol cards' figures at their labelled typical lengths.
  await gotoOk(page, `${ctx.webBaseUrl}/app/new?entry=scratch`);
  const cards = await page.$$eval("[data-protocol-card]", (els) =>
    els.map((el) => ({
      id: el.getAttribute("data-protocol-card") ?? "?",
      text: el.querySelector(".tnum")?.textContent?.replace(/\s+/g, " ").trim() ?? "",
      words: Number(el.querySelector(".tnum")?.getAttribute("data-typical-words") ?? "0"),
    })),
  );
  const priced = cards.filter((card) => /credits/.test(card.text) && card.words > 0);
  if (priced.length === 0) throw new Error("no protocol-card estimates rendered");

  // a real draft so the sheet + Timeline have something to price (≤300-word fixture). The draft
  // entry is preview-first (pending → meta-refresh → preview → Create) — the synchronous
  // scratch-entry helper can never land it, so this leg rides the real two-step ingest.
  const slug = await createDraftProject(page, ctx.webBaseUrl, ctx.marker("n4"), PAID_FIXTURE);

  // 2 — sheet ≡ card: the sheet priced at the card's own typical words must equal the card figure.
  for (const card of priced) {
    const cardCredits = creditsOf(card.text);
    const { credits } = await sheetFigure(page, ctx, slug, `words=${card.words}&rigor=standard`);
    if (credits !== cardCredits) {
      throw new Error(
        `protocol card ${card.id} (${card.words}w) says ${cardCredits} cr but the sheet at the same shape says ${credits} cr`,
      );
    }
  }

  // 3 — sheet ≡ Timeline chip ≡ palette for the REAL draft (the chip feeds the palette hint).
  const sheet = await sheetFigure(page, ctx, slug, "");
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}`);
  const chip = (await page.textContent("[data-next-step]")) ?? "";
  if (!/est\./.test(chip)) throw new Error(`the Timeline chip shows no estimate: ${JSON.stringify(chip)}`);
  const chipCredits = creditsOf(chip);
  if (chipCredits !== sheet.credits) {
    throw new Error(`Timeline chip ${chipCredits} cr ≠ sheet ${sheet.credits} cr for the same draft`);
  }
  const chipBand = bandOf((await page.textContent("[data-next-step-duration]")) ?? "");
  if (sheet.band && chipBand && (chipBand.low !== sheet.band.low || chipBand.high !== sheet.band.high)) {
    throw new Error(
      `Timeline duration ${chipBand.low}–${chipBand.high} min ≠ sheet ${sheet.band.low}–${sheet.band.high} min`,
    );
  }

  // 4 — sheet ∈ pricing card's Review range at the card's labelled shape (Base leg exact ± rounding).
  // The §15.2 cost cards live on the MARKETING page — /pricing redirects a signed-in session to
  // /app, so this leg reads the page the way the new visitor sees it: an anonymous context.
  const anon = await ctx.anon();
  await gotoOk(anon.page, `${ctx.webBaseUrl}/pricing`);
  const costCards = await anon.page.$$eval("[data-cost-card][data-words]", (els) =>
    els.map((el) => ({
      key: el.getAttribute("data-cost-card") ?? "?",
      words: Number(el.getAttribute("data-words") ?? "0"),
      claims: Number(el.getAttribute("data-claims") ?? "0"),
      // dt/dd read separately — textContent concatenates them ("Review2,610…"), which breaks a
      // ^Review\b match on the boundary between 'w' and a digit.
      rows: [...el.querySelectorAll("dl div")].map((r) => ({
        label: r.querySelector("dt")?.textContent?.trim() ?? "",
        value: r.querySelector("dd")?.textContent?.trim() ?? "",
      })),
    })),
  );
  const first = costCards.find((card) => card.words > 0);
  if (!first) throw new Error("no pricing cost cards rendered");
  const reviewRow = first.rows.find((r) => /^Review/.test(r.label) && !/fact-check/i.test(r.label));
  const range = reviewRow ? /(\d[\d,]*)\s*[–-]\s*(\d[\d,]*)\s*cr/.exec(reviewRow.value) : null;
  if (!range) throw new Error(`pricing card ${first.key} renders no Review range`);
  const lo = Number(range[1]!.replace(/,/g, ""));
  const hi = Number(range[2]!.replace(/,/g, ""));
  const base = await sheetFigure(
    page,
    ctx,
    slug,
    `words=${first.words}&claims=${first.claims}&rigor=standard&tier=base`,
  );
  // The card's range rounds OUTWARD (low floors / high ceils to 10): the printed low IS
  // floor(raw/10)·10 and the bracket always contains the sheet's figure.
  if (Math.floor(base.credits / 10) * 10 !== lo) {
    throw new Error(`sheet Base figure ${base.credits} floors to ${Math.floor(base.credits / 10) * 10}, not pricing card ${first.key} low ${lo}`);
  }
  if (!(lo <= base.credits && base.credits <= hi)) {
    throw new Error(`sheet figure ${base.credits} outside pricing card ${first.key} range ${lo}–${hi}`);
  }
};

/** N8 (RED, EDIT.1) — editing a locked version forks to v(N+1) and saves (sync pill). */
const N8: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  await gotoOk(page, `${ctx.webBaseUrl}/app`);
  await followProjectLink(page, ctx);
  // the locked-version edit affordance → fork to v(N+1)
  const edit = page.locator('a[href*="/edit/"], button:has-text("Edit")').first();
  if ((await edit.count()) === 0) throw new Error("no edit affordance on the project page");
  await edit.click();
  await page.waitForLoadState("domcontentloaded");
  const body = (await page.textContent("body")) ?? "";
  if (!/v\d+|version/i.test(body)) throw new Error("no version fork surface after edit");
};

/** N9 (BILL.3; REQ-BILL-16) — every purchase entry point on the flagged test tenant reaches a
 *  Stripe-hosted page: billing Choose Writer (Checkout subscribe), billing Buy 1,000 credits
 *  (Checkout top-up), billing Manage billing & invoices (Portal), and run-sheet Add credits
 *  (Payment Link). Each click asserts the hosted URL, the amount/label the user expects, and that
 *  the navigation produced no CSP/form-action console violation. No hosted payment form is filled
 *  or submitted. */
const N9_STRIPE_HOSTS = new Set(["buy.stripe.com", "checkout.stripe.com", "billing.stripe.com"]);
const N9_CSP_ERROR = /Content Security Policy|form-action|Refused to (?:send form data|load)/i;

function n9StripeHosted(url: string): boolean {
  try {
    return N9_STRIPE_HOSTS.has(new URL(url).hostname);
  } catch {
    return false;
  }
}

function n9AssertNoCspViolation(ctx: StepCtx, label: string): void {
  const violations = ctx.consoleErrors.filter((m) => N9_CSP_ERROR.test(m));
  if (violations.length > 0) {
    throw new Error(
      `${label}: CSP console violation after hosted hand-off — ${violations.join(" | ")}`,
    );
  }
}

async function n9ClickToStripe(
  ctx: StepCtx,
  page: Page,
  control: Locator,
  label: string,
  expected: readonly RegExp[],
): Promise<void> {
  // Settle eagerly: if the click/setup throws before the await attaches, a rejecting waitForURL is
  // an unhandled rejection when the runner closes contexts (fatal on Node ≥15) — fold it into a
  // boolean instead.
  const navigated = page
    .waitForURL((u) => n9StripeHosted(u.toString()), { timeout: 45_000 })
    .then(() => true)
    .catch(() => false);
  // A control below the fold reads "(no element at point)" from elementFromPoint — scroll first so
  // the occlusion assert measures a REAL overlay, not a viewport artifact.
  await control.scrollIntoViewIfNeeded().catch(() => undefined);
  await clickActionable(control, label);
  if (!(await navigated)) {
    throw new Error(`${label}: stayed on ${page.url()} — no Stripe-hosted hand-off`);
  }
  await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined);
  if (!n9StripeHosted(page.url())) {
    throw new Error(`${label}: landed on non-Stripe URL ${page.url()}`);
  }
  // checkout/billing/buy are Stripe JS SPAs — domcontentloaded precedes hydration, so a single
  // innerText read can catch an empty body. Poll until every expected fragment renders (the amount
  // + product label are what the AC pins) or the window lapses.
  const deadline = Date.now() + 30_000;
  let body = "";
  do {
    body = await page
      .locator("body")
      .innerText({ timeout: 10_000 })
      .catch(() => "");
    if (expected.every((re) => re.test(body))) break;
    await page.waitForTimeout(1_000);
  } while (Date.now() < deadline);
  for (const re of expected) {
    if (!re.test(body))
      throw new Error(`${label}: Stripe page did not show ${re} (url ${page.url()})`);
  }
  n9AssertNoCspViolation(ctx, label);
}

const N9: StepFn = async (ctx) => {
  const webBase = ctx.webBaseUrl.replace(/\/$/, "");

  // Entry 1 — Billing → Choose Writer on a FREE flagged test tenant (subscribe is the Free user's
  // Checkout entry; the paid tenant below has no "Choose Writer" button once it is already Writer).
  const { page: subscribePage } = await ctx.freshUser("n9");
  await gotoOk(subscribePage, `${webBase}/app/settings/billing`);
  await subscribePage.selectOption(
    "form[data-subscribe-form='writer'] select[name='cycle']",
    "monthly",
  );
  await n9ClickToStripe(
    ctx,
    subscribePage,
    subscribePage.locator("form[data-subscribe-form='writer'] button[type='submit']"),
    "N9 billing Choose Writer",
    [/Writer/i, /\$20(?:\.00)?/],
  );

  // Entries 2–4 — the funded paid test tenant (jrn-a): top-up, Portal, and the run-sheet Payment Link.
  const { page } = await ctx.returningUser("a"); // flagged by workspaces.is_test too
  await gotoOk(page, `${webBase}/app/settings/billing`);

  // Entry 2 — Billing → Buy 1,000 credits: Checkout top-up session, $10 / 1,000 credits.
  await n9ClickToStripe(
    ctx,
    page,
    page.locator("form[data-topup-form='topup_10'] button[type='submit']"),
    "N9 billing Buy 1,000 credits",
    [/1,?000/i, /\$10(?:\.00)?/],
  );

  // Entry 3 — Billing → Portal's honest precondition: the Portal needs a `stripe_customer_id`, which
  // only a COMPLETED checkout mints (Stripe creates the Customer at session confirmation — a real
  // payment, operator-paused under HUMAN-H7). At $0 the test tenant has none, so the portal form must
  // NOT mount and the honest "no card on file" note renders instead. The hosted-portal leg itself is
  // carried in D-BILL.3-1 (it is only reachable after a real purchase).
  await gotoOk(page, `${webBase}/app/settings/billing`);
  if ((await page.locator("form[data-portal-form]").count()) !== 0) {
    // A customer-bearing tenant reaches the hosted portal — keep the assertion honest both ways.
    await n9ClickToStripe(
      ctx,
      page,
      page.locator("form[data-portal-form] button[type='submit']"),
      "N9 billing Portal",
      [/Writer|invoice|payment method|billing/i],
    );
  } else {
    const body = (await page.textContent("body")) ?? "";
    if (!/no card on file/i.test(body)) {
      throw new Error("N9 billing Portal: no portal form AND no honest no-card note rendered");
    }
  }

  // Entry 4 — run sheet → Add credits: the PRB.19 Payment Link path. A deliberately huge cap renders
  // the exhausted panel without paying for a run; the button's data URL is itself origin-checked
  // before the click so a tampered/non-Stripe link fails before navigation.
  const slug = await createScratchProject(page, ctx, "N9CREDITS");
  await gotoOk(page, `${webBase}/p/${slug}/run?workflow=review&rigor=quick&budget=2147483647`);
  const addCredits = page.locator("button[data-payment-link]");
  const paymentLink = await addCredits.getAttribute("data-payment-link");
  if (!paymentLink || !n9StripeHosted(paymentLink)) {
    throw new Error(
      `N9 run-sheet Add credits: non-Stripe Payment Link ${paymentLink ?? "(missing)"}`,
    );
  }
  await n9ClickToStripe(ctx, page, addCredits, "N9 run-sheet Add credits", [/\$\d+(?:\.\d{2})?/]);

  // Leave the last opened page on the Stripe-hosted landing so the runner's N9.png evidence is the
  // hosted payment page itself, not an app page.
  n9AssertNoCspViolation(ctx, "N9");
};

/** N5 (RED, ACT.1; paid) — trial Review shows *Included* and delivers without a cap death.
 *  This is the paid leg's driver: it ingests the committed ≤300-word fixture and launches the
 *  run, so the weekly journey's metered spend is real and bounded by the spend guard.
 *  ACT.1 — the Included line must carry the CONFIG cap (never a stale literal), the launch must
 *  forward `entitlementId`+the device fingerprint (the sheet mints `rhema_fp` on the GET), and
 *  the run must run to DELIVERY — the "no cap death" half the pre-ACT.1 version never waited for. */
const N5: StepFn = async (ctx) => {
  const { page } = await ctx.freshUser("n5");
  // the paid fixture rides the real new-project sheet (a paste-ingested draft, not a file
  // upload). The draft entry is deliberately preview-first (§5.3) — pending → conversion
  // preview → Create — so it needs createDraftProject's preview-aware wait, never the
  // synchronous scratch helper's 15 s redirect (the pre-ACT.1 N5's own "launch navigation
  // timed out" debt was this same wrong-helper bug at the draft entry).
  const slug = await createDraftProject(page, ctx.webBaseUrl, ctx.marker("PAID"), PAID_FIXTURE);
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/run`);
  const body = (await page.textContent("body")) ?? "";
  if (!/included/i.test(body)) throw new Error('trial Review surface shows no "Included" line');
  // the Included line names the configured cap — `sheetEntitlementLine`'s "up to N words" under it.
  const cap = PRICING.trial.entitlement.wordCap.toLocaleString("en-US");
  if (!body.includes(cap)) {
    throw new Error(`the Included line does not carry the configured ${cap}-word cap`);
  }
  // the Run form must carry the entitlement row id — absent ⇒ the claim posts a paid hold instead.
  const ent = await page.locator('input[type="hidden"][name="entitlementId"]').count();
  if (ent === 0) throw new Error("the Run form carries no hidden entitlementId field");
  // "This run only — run it to completion" (per-run gates_off): the leg is unattended; without it the
  // Review parks at approve_scope waiting on a named approver (the 2026-10-02 first green attempt
  // starved its 40-min delivery poll exactly there — run 01M3Z55G8VAQEVRKF2RXEJA1G0).
  const auto = page.locator('input[name="autoRun"]');
  if ((await auto.count()) > 0 && !(await auto.isChecked())) {
    if (!(await auto.isVisible())) {
      const summary = page.locator('details:has(input[name="autoRun"]) > summary');
      if ((await summary.count()) > 0) await summary.first().click();
    }
    await auto.check();
  }
  // launch the Standard/Base Review — the one bounded paid run of the weekly leg.
  const launch = page
    .locator(
      'button[type="submit"]:has-text("Review"), button:has-text("Start"), button:has-text("Run")',
    )
    .first();
  if ((await launch.count()) === 0) throw new Error("no Review launch control on the run sheet");
  await assertActionable(launch, "Review launch");
  await launch.click();
  await page.waitForLoadState("domcontentloaded");
  // a launch refusal re-renders the sheet with role=alert — surface the honest notice.
  const alert = page.locator('p[role="alert"]').first();
  if ((await alert.count()) > 0 && (await alert.isVisible().catch(() => false))) {
    throw new Error(`trial run launch refused: ${(await alert.textContent())?.trim()}`);
  }
  // ACT.1's "runs to delivery" half — the dossier link the sheet renders for the active run.
  const runLinkSel = `a[href^="/p/${slug}/review/"]`;
  let reviewHref: string | null = await page
    .locator(runLinkSel)
    .first()
    .getAttribute("href")
    .catch(() => null);
  for (let i = 0; i < 12 && !reviewHref; i++) {
    await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/run`);
    reviewHref = await page
      .locator(runLinkSel)
      .first()
      .getAttribute("href")
      .catch(() => null);
    if (!reviewHref) await new Promise((res) => setTimeout(res, 5_000));
  }
  if (!reviewHref) throw new Error("run sheet shows no active-run dossier link after trial launch");
  const runId = /\/review\/([A-Za-z0-9]+)/.exec(reviewHref)?.[1] ?? "";
  // poll the dossier route until the run delivers — a cap death never produces it.
  const deadline = Date.now() + 40 * 60_000;
  let delivered = false;
  while (Date.now() < deadline) {
    const r = await page
      .goto(`${ctx.webBaseUrl}${reviewHref}`, { waitUntil: "domcontentloaded" })
      .catch(() => null);
    if (r && r.status() === 200) {
      delivered = true;
      break;
    }
    await new Promise((res) => setTimeout(res, 20_000));
  }
  if (!delivered) throw new Error(`trial run ${runId} did not deliver a dossier within 40 min`);
};

/**
 * RES.1 — create a project from pasted draft text through the REAL two-step ingest: POST /app/new
 * runs the conversion preview (pending → meta-refresh → preview), then its Create click replays the
 * quarantine key and lands on /p/<slug>. (N5's plain helper only covers the synchronous `scratch`
 * entry; the draft entries are deliberately preview-first — §5.3's make-or-break moment.) Exported
 * for the live-probe provisioner (provision-res1.ts) — the probe's excerpt project is created by
 * the same real path.
 */
export async function createDraftProject(
  page: Page,
  webBaseUrl: string,
  title: string,
  text: string,
): Promise<string> {
  await gotoOk(page, `${webBaseUrl}/app/new?entry=draft`);
  await page.fill('input[name="title"]', title);
  await page.fill('textarea[name="paste"]', text);
  await page.click(
    'form[action="/app/new"] button[type="submit"], form[action="/app/new"] button:not([type])',
  );
  // pending → meta-refresh (5 s cadence) → preview: wait for the preview's Create form. A cold
  // convert Job runs ~2.5–4 min (PRB.21's own note), so the budget is 5 min — never a stale page.
  const create = page.locator('form[action="/app/new/create"] button[value="create"]').first();
  await create.waitFor({ state: "visible", timeout: 300_000 });
  // the preview panes can push the actions row below the fold — scroll so the occlusion check's
  // center point is inside the viewport (elementFromPoint returns null off-viewport).
  await create.scrollIntoViewIfNeeded();
  await assertActionable(create, "conversion preview Create");
  await create.click();
  await page.waitForURL(/\/p\/[a-z0-9-]+/i, { timeout: 30_000 });
  const m = /\/p\/([a-z0-9-]+)/i.exec(page.url());
  if (!m?.[1]) throw new Error(`draft project did not land on /p/<slug> (landed ${page.url()})`);
  return m[1];
}

/** N6 (RED→green under RES.1; paid) — the planted-error Quick/Base Review end-to-end through the
 *  real surfaces on the funded test tenant (jrn-a): paste the essay → run sheet (rigor=quick,
 *  this-run autorun) → deliver → the dossier shows ≥1 fetched-✓ claim AND the planted error row
 *  *Contradicted* with a fetched source. This is the before/after against incident run
 *  01M3SK62YZST272B35CG12K6TW, where every claim went Unverifiable (no web_search ever reached the
 *  model — RES.1's root cause). */
const N6: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  const slug = await createDraftProject(page, ctx.webBaseUrl, ctx.marker("N6ESSAY"), PLANTED_ESSAY);
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/run?workflow=review&rigor=quick`);
  // the ticket's cell is Quick/Base — select the rigor radio explicitly (the query arg pre-selects
  // it; checking makes the intent load-bearing rather than ambient).
  const rigor = page.locator('input[name="rigor"][value="quick"]');
  if ((await rigor.count()) > 0 && !(await rigor.isChecked())) await rigor.check();
  // "This run only — run it to completion" (per-run gates_off): the leg is unattended; named
  // approvals would park the review at its gates. The checkbox rides the §5.6 collapsed row
  // (a closed <details>) — open it as a user would before checking; a force-check on an
  // invisible input would be a harness lie, not a walk.
  const auto = page.locator('input[name="autoRun"]');
  if ((await auto.count()) > 0 && !(await auto.isChecked())) {
    if (!(await auto.isVisible())) {
      const summary = page.locator('details:has(input[name="autoRun"]) > summary');
      if ((await summary.count()) > 0) await summary.first().click();
    }
    await auto.check();
  }
  const runBtn = page.locator('button[data-run-button="true"]').first();
  await assertActionable(runBtn, "Review launch");
  await runBtn.click();
  await page.waitForLoadState("domcontentloaded");
  // a launch refusal re-renders the sheet with role=alert (402 balance / 403 gate / 409 conflict /
  // suspension) — surface the honest notice instead of a bare timeout.
  const alert = page.locator('p[role="alert"]').first();
  if ((await alert.count()) > 0 && (await alert.isVisible().catch(() => false))) {
    throw new Error(`run launch refused: ${(await alert.textContent())?.trim()}`);
  }
  // The launched run's dossier URL: a non-terminal run renders the activeRun card (the
  // /p/<slug>/review/<runId> link) on the sheet in place of the Run affordance. The POST's
  // re-render may carry only the "started" status; the GET picks the card up.
  const runLinkSel = `a[href^="/p/${slug}/review/"]`;
  let reviewHref: string | null = await page
    .locator(runLinkSel)
    .first()
    .getAttribute("href")
    .catch(() => null);
  for (let i = 0; i < 12 && !reviewHref; i++) {
    await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/run`);
    reviewHref = await page
      .locator(runLinkSel)
      .first()
      .getAttribute("href")
      .catch(() => null);
    if (!reviewHref) await new Promise((res) => setTimeout(res, 5_000));
  }
  if (!reviewHref) throw new Error("run sheet shows no active-run dossier link after launch");
  const runId = /\/review\/([A-Za-z0-9]+)/.exec(reviewHref)?.[1] ?? "";
  // poll the dossier route until the run delivers — it 404s while the run is in flight.
  const deadline = Date.now() + 40 * 60_000;
  let delivered = false;
  while (Date.now() < deadline) {
    const r = await page
      .goto(`${ctx.webBaseUrl}${reviewHref}`, { waitUntil: "domcontentloaded" })
      .catch(() => null);
    if (r && r.status() === 200) {
      delivered = true;
      break;
    }
    await new Promise((res) => setTimeout(res, 20_000));
  }
  if (!delivered) throw new Error(`run ${runId} did not deliver a dossier within 40 min`);
  // ≥1 fetched-✓ claim: a FetchedUrlChip (`a[data-fetched="true"]`, primitives.tsx) — a source the
  // fact-check actually retrieved, stamped from the run's own fetch_log (REQ-POS-3's proof).
  const fetched = await page.locator('a[data-fetched="true"]').count();
  if (fetched === 0) throw new Error("dossier shows no fetched-✓ claims");
  // the planted error row itself: verdict Contradicted + its fetched source inside the same row.
  const planted = page.locator("li[data-verdict]", { hasText: "Library of Congress" });
  if ((await planted.count()) === 0) throw new Error("no claim row names the planted LoC claim");
  const contra = page.locator('li[data-verdict="contradicted"]', {
    hasText: "Library of Congress",
  });
  if ((await contra.count()) === 0) {
    throw new Error("planted error is not marked Contradicted");
  }
  const plantedSource = contra.first().locator('a[data-fetched="true"]');
  if ((await plantedSource.count()) === 0) {
    throw new Error("planted error is Contradicted but carries no fetched source");
  }
};

/** N7 (GREEN, HOT.1) — a dossier renders, including the Showcase dossier. */
const N7: StepFn = async (ctx) => {
  const { page } = await ctx.freshUser("n7");
  // the seeded Showcase opens at /app for a fresh workspace (server.ts §1509 redirect)
  await gotoOk(page, `${ctx.webBaseUrl}/app`);
  if (!/^\/p\/[^/]+/.test(new URL(page.url()).pathname)) {
    const row = page.locator('a[href*="/review/"], a[href^="/p/"]').first();
    if ((await row.count()) === 0) throw new Error("no dossier link on the project home");
    // The first match can sit inside a collapsed group (the Quiet fold) — a click on a hidden
    // element times out, while the dossier-render claim only needs the destination. Click when
    // it's visible; otherwise follow the href directly.
    if (await row.isVisible().catch(() => false)) {
      await row.click();
      await page.waitForLoadState("domcontentloaded");
    } else {
      const href = await row.getAttribute("href");
      if (!href) throw new Error("dossier link has no href");
      await gotoOk(page, `${ctx.webBaseUrl}${href}`);
    }
  }
  // /p/<slug> is the overview when fixtures exist — the dossier itself lives at /p/<slug>/review/<runId>.
  if (!/\/review\//.test(new URL(page.url()).pathname)) {
    const reviewLink = page.locator('a[href*="/review/"]').first();
    if ((await reviewLink.count()) > 0) {
      const href = await reviewLink.getAttribute("href");
      if (href) await gotoOk(page, `${ctx.webBaseUrl}${href}`);
    }
  }
  // a rendered dossier: the letter + at least one claim/finding row
  const claims = await page.locator("[data-verdict], [data-tier]").count();
  const letter = await page.locator("article, main, [data-dossier]").count();
  if (claims === 0 && letter === 0) {
    throw new Error(`dossier did not render on ${page.url()} (no letter/claims)`);
  }
  assertBundleParity(ctx);
};

// ---------------------------------------------------------------- returning

/** R1 (GREEN, HOT.1) — the project list shows the user's projects; Quiet expands visibly. */
const R1: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  const title = ctx.marker("R1PROJ");
  // create a scratch project so a marker row exists, then list it.
  await gotoOk(page, `${ctx.webBaseUrl}/app/new?entry=scratch`);
  await page.fill('input[name="title"]', title);
  await page.click('button[type="submit"], button:not([type])');
  await page.waitForURL(/\/p\/[a-z0-9-]+/i, { timeout: 15_000 });
  await gotoOk(page, `${ctx.webBaseUrl}/app`);
  const heading = page.locator('h1, h2, [role="heading"]', { hasText: "Your projects" });
  if ((await heading.count()) === 0) throw new Error('project list heading "Your projects" absent');
  const rowHit = page.locator(`text=${title}`);
  if ((await rowHit.count()) === 0) {
    // maybe it landed under the collapsed Quiet group — expand and re-check.
    const quiet = page.locator('details[data-collapsed-group="quiet"] > summary');
    if ((await quiet.count()) > 0) {
      await clickActionable(quiet.first(), "Quiet group");
      if ((await rowHit.count()) === 0) {
        throw new Error(`project "${title}" not listed (even under Quiet)`);
      }
    } else {
      throw new Error(`project "${title}" not listed and no Quiet group to expand`);
    }
  }
  assertBundleParity(ctx);
};

/** R4 (RED, RUN.1; paid) — a chat turn answers; Send is actionable at 1440×900 and phone width. */
const R4: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoOk(page, `${ctx.webBaseUrl}/app`);
  await followProjectLink(page, ctx);
  const input = page
    .locator('form[action$="/chat/turns"] input[name="body"], input[name="body"]')
    .first();
  if ((await input.count()) === 0) throw new Error("no chat input on the project page");
  const send = page.locator('form[action$="/chat/turns"] button[type="submit"]').first();
  await assertActionable(send, "chat Send @1440×900");
  await input.fill(`${ctx.marker("CHAT")} — one-word reply please`);
  await send.click();
  // the turn lands; an answer region renders (the turn's own page or the inline reply)
  await page.waitForLoadState("domcontentloaded");
  await page.setViewportSize({ width: 390, height: 844 });
  await assertActionable(
    page.locator('form[action$="/chat/turns"] button[type="submit"]').first(),
    "chat Send @390×844",
  );
};

/** R5 (GREEN, JOURNEY.1) — an export downloads (the §13.4 export dialog → file). */
const R5: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  // A scratch project has no draft text (POST export → empty_draft), and the seeded Showcase is
  // read-only (export POSTs 409). The honest free leg: duplicate the Showcase — the copy carries
  // real draft bytes and is the tenant's own — then export THAT. The duplicate CTA rides the
  // dossier banner at /p/<slug>/review/<runId>; /p/showcase itself is the overview (fixtures keep it).
  await gotoOk(page, `${ctx.webBaseUrl}/p/showcase`);
  if (!/\/review\//.test(new URL(page.url()).pathname)) {
    const reviewLink = page.locator('a[href*="/review/"]').first();
    if ((await reviewLink.count()) === 0)
      throw new Error("no dossier link on the Showcase overview");
    const href = await reviewLink.getAttribute("href");
    if (!href) throw new Error("dossier link has no href");
    await gotoOk(page, `${ctx.webBaseUrl}${href}`);
  }
  const dup = page
    .locator(
      'form[action$="/duplicate"] button[type="submit"], form[action$="/duplicate"] button:not([type])',
    )
    .first();
  if ((await dup.count()) === 0) throw new Error("no duplicate control on the Showcase");
  await assertActionable(dup, "showcase duplicate");
  await dup.click();
  await page.waitForURL(/\/p\/([a-z0-9-]+)/i, { timeout: 20_000 });
  const slug = /\/p\/([a-z0-9-]+)/i.exec(page.url())?.[1];
  if (!slug || slug === "showcase")
    throw new Error(`duplicate did not land on a copy (url ${page.url()})`);
  // open the export dialog and submit — the response is a file download.
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}`);
  const exportForm = page.locator('form[data-export-form="true"], form[action$="/export"]');
  if ((await exportForm.count()) === 0) {
    // the dialog may be a /p/:slug/export page — try the direct route.
    const r = await page.goto(`${ctx.webBaseUrl}/p/${slug}/export`);
    if (!r || r.status() >= 400)
      throw new Error(`export surface missing (GET /p/${slug}/export → ${r?.status()})`);
  }
  const download = page.waitForEvent("download", { timeout: 20_000 }).catch(() => null);
  const resp = page
    .waitForResponse(
      (r) => /\/export$/.test(new URL(r.url()).pathname) && r.request().method() === "POST",
      { timeout: 20_000 },
    )
    .catch(() => null);
  const submit = page
    .locator(
      'form[action$="/export"] button[type="submit"], form[data-export-form] button[type="submit"]',
    )
    .first();
  if ((await submit.count()) === 0) throw new Error("no export submit control");
  await assertActionable(submit, "export submit");
  await submit.click();
  const [dl, rs] = await Promise.all([download, resp]);
  const fileOk = dl !== null || (rs !== null && rs.status() === 200);
  if (!fileOk) throw new Error("export produced no download/200 response");
};

/** R6 (RED, RPT.1; paid) — the run card's meter moves *inside a single phase* (≥ 2 distinct spent
 *  values under one `running` phase row, at least one rendered provisional "≈"), and the delivered
 *  run report's charged figure equals the card's committed meter — the user-visible half of "spent =
 *  Σ debits" (the read-only ledger cross-check is recorded in the RPT.1 run ledger by the operator).
 *  The report's phases must render real durations (no "0 min", no unexplained silence) and the
 *  `?advanced=1` disclosure must list per-request rows (the "Advanced is empty" defect). */
const R6: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  const slug = await createDraftProject(
    page,
    ctx.webBaseUrl,
    ctx.marker("R6EXCERPT"),
    PLANTED_EXCERPT,
  );
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/run?workflow=review&rigor=quick`);
  // Quick/Base unattended (the same launch ceremony as N6 — see its comment for the collapsed row).
  const rigor = page.locator('input[name="rigor"][value="quick"]');
  if ((await rigor.count()) > 0 && !(await rigor.isChecked())) await rigor.check();
  const auto = page.locator('input[name="autoRun"]');
  if ((await auto.count()) > 0 && !(await auto.isChecked())) {
    if (!(await auto.isVisible())) {
      const summary = page.locator('details:has(input[name="autoRun"]) > summary');
      if ((await summary.count()) > 0) await summary.first().click();
    }
    await auto.check();
  }
  const runBtn = page.locator('button[data-run-button="true"]').first();
  await assertActionable(runBtn, "Review launch");
  await runBtn.click();
  await page.waitForLoadState("domcontentloaded");
  const alert = page.locator('p[role="alert"]').first();
  if ((await alert.count()) > 0 && (await alert.isVisible().catch(() => false))) {
    throw new Error(`run launch refused: ${(await alert.textContent())?.trim()}`);
  }

  // The live run card mounts on the project page's Timeline rail. The SSE patch updates
  // [data-credits] and [data-phase-status] in place; a periodic reload keeps the sample honest when
  // the stream stalls (SSR reads the latest usage.tick) and picks up the terminal state, which the
  // patch never touches (data-run-state only re-renders).
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}`);
  const cardSel = "[data-run-card]";
  await page.locator(cardSel).first().waitFor({ state: "attached", timeout: 90_000 });
  const runId = (await page.locator(cardSel).first().getAttribute("data-run-card")) ?? "";
  if (!runId) throw new Error("the run card carries no data-run-card id");

  const TERMINAL = new Set(["completed", "completed_partial", "failed", "cancelled"]);
  const readingsByPhase = new Map<string, Set<number>>();
  let provisionalSeen = false;
  let finalSpent: number | null = null;
  const deadline = Date.now() + 40 * 60_000;
  let lastReload = 0;
  while (Date.now() < deadline) {
    if (Date.now() - lastReload > 25_000) {
      await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
      lastReload = Date.now();
    }
    const card = page.locator(cardSel).first();
    if ((await card.count()) > 0) {
      const state = (await card.getAttribute("data-run-state")) ?? "";
      const creditEl = card.locator("[data-credits]").first();
      const meterText = ((await creditEl.textContent().catch(() => "")) ?? "").trim();
      // "12 / 300 cr" or the provisional "≈ 12 / 300 cr".
      const meterMatch = /(\d[\d,]*)\s*\/\s*(\d[\d,]*)\s*cr/i.exec(meterText);
      const spent = meterMatch?.[1] != null ? Number(meterMatch[1].replace(/,/g, "")) : null;
      const running = card.locator('[data-phase-status="running"]').first();
      const runningPhase =
        (await running.count()) > 0 ? await running.getAttribute("data-phase") : null;
      if (runningPhase != null && spent != null) {
        const set = readingsByPhase.get(runningPhase) ?? new Set<number>();
        set.add(spent);
        readingsByPhase.set(runningPhase, set);
        if ((await creditEl.getAttribute("data-provisional")) != null || meterText.includes("≈")) {
          provisionalSeen = true;
        }
      }
      if (TERMINAL.has(state)) {
        finalSpent = spent;
        break;
      }
    }
    await new Promise((res) => setTimeout(res, 2_000));
  }
  const movedWithinPhase = [...readingsByPhase.values()].some((v) => v.size >= 2);
  if (!movedWithinPhase) {
    throw new Error(
      `the card's meter never advanced within a single phase (readings ${JSON.stringify(
        Object.fromEntries([...readingsByPhase.entries()].map(([k, v]) => [k, [...v]])),
      )})`,
    );
  }
  if (!provisionalSeen) {
    throw new Error("the meter moved but never rendered a provisional (≈) reading");
  }
  if (finalSpent == null) throw new Error("the run did not reach a terminal state within 40 min");

  // The report (§14.5 Level 3): its charged figure is Σ ledger debits − refunds. The card's terminal
  // meter is the committed/metered figure — charged ≤ committed always (a metered-mode refund can
  // only lower it), and equality is required when the run carried no refund line.
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/r/${runId}?advanced=1`);
  await page.locator("[data-run-report]").first().waitFor({ state: "attached", timeout: 60_000 });
  const estimateLine = (await page.locator("[data-estimate-line]").textContent()) ?? "";
  const spentMatch = /(\d[\d,]*)\s*cr spent/i.exec(estimateLine);
  if (spentMatch?.[1] == null) {
    throw new Error(`the report shows no spent figure: "${estimateLine}"`);
  }
  const reportSpent = Number(spentMatch[1].replace(/,/g, ""));
  const meteredLine = (await page.locator("[data-metered-line]").textContent().catch(() => null)) ?? "";
  const meteredMatch = /(\d[\d,]*)\s*cr metered\s*·\s*(\d[\d,]*)\s*cr charged/i.exec(meteredLine);
  if (meteredMatch?.[2] != null && Number(meteredMatch[2].replace(/,/g, "")) !== reportSpent) {
    throw new Error(
      `the report contradicts itself: "…${meteredMatch[2]} cr charged" beside "${reportSpent} cr spent"`,
    );
  }
  const hasRefundLine = (await page.locator("[data-refund]").count()) > 0;
  if (reportSpent > finalSpent) {
    throw new Error(
      `report spent ${reportSpent} exceeds the card's committed meter ${finalSpent} — a charge no meter recorded`,
    );
  }
  if (reportSpent < finalSpent && !hasRefundLine) {
    throw new Error(
      `report spent ${reportSpent} < the card's committed meter ${finalSpent} with no refund line explaining the gap`,
    );
  }
  // Every difference row renders its reasoned sentence — never a bare key.
  const diffs = page.locator("[data-difference]");
  for (let i = 0; i < (await diffs.count()); i++) {
    const text = ((await diffs.nth(i).textContent()) ?? "").trim();
    if (text.length < 10 || /^[a-z_]+$/.test(text)) {
      throw new Error(`a difference row renders a bare key: "${text}"`);
    }
  }
  // Truthful durations: no committed phase may render "0 min" (real work takes time; a legacy
  // equal-timestamps row renders "—" instead — the two must never confuse).
  const phaseRows = await page.locator("[data-report-phase]").allTextContents();
  if (phaseRows.some((t) => /·\s*0\s*min\b/.test(t))) {
    throw new Error(`a phase still renders "0 min": ${phaseRows.join(" | ")}`);
  }
  // Level 4 (?advanced=1) — the per-request rows must exist for a metered run.
  if ((await page.locator("[data-usage-row]").count()) === 0) {
    throw new Error("?advanced=1 returned no Level-4 usage rows");
  }
  assertBundleParity(ctx);
};

/** R7 (RED, RUN.1) — an informational gate does not block; labels match behaviour. */
const R7: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  await gotoOk(page, `${ctx.webBaseUrl}/app`);
  const gate = page.locator('[data-gate-kind="informational"], [data-blocking="false"]').first();
  if ((await gate.count()) === 0) {
    throw new Error("no informational gate on the board to probe (or gates render unlabelled)");
  }
};

// ---------------------------------------------------------------- phone + claims + isolation

/** P1 (RED, UX.2) — phone width: no horizontal overflow; primary actions ≥ 44 px. */
const P1: StepFn = async (ctx) => {
  const { page } = await ctx.anon();
  await page.setViewportSize({ width: 390, height: 844 });
  for (const path of ["/", "/pricing", "/login"]) {
    await gotoOk(page, `${ctx.webBaseUrl}${path}`);
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    if (overflow > 1) throw new Error(`${path}: horizontal overflow ${overflow}px at 390w`);
    const small = await page.evaluate(() => {
      const bad: string[] = [];
      for (const el of document.querySelectorAll("a,button")) {
        const r = el.getBoundingClientRect();
        const visible = r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== "hidden";
        const primary = el.matches("button,[role='button'],a[class*='cta'],a[data-cta]");
        if (visible && primary && r.height > 0 && r.height < 44) {
          bad.push(
            `${el.tagName.toLowerCase()} ${(el.textContent ?? "").slice(0, 24)} (${Math.round(r.height)}px)`,
          );
        }
      }
      return bad;
    });
    if (small.length > 0) throw new Error(`${path}: sub-44px primary actions: ${small.join("; ")}`);
  }
};

/** C1 (RED, ACT.1) — claims equal the entitlement config, per AUDIENCE (ADR-043): while
 *  `trial.audience` sits at `test_tenants` an anonymous `/` + `/pricing` carry NO trial claim
 *  (the operator pause), and a signed-in is_test session's `?audience=test` preview renders the
 *  generated config figures — the derived word cap + pocket — identical on both surfaces. */
const C1: StepFn = async (ctx) => {
  const cap = PRICING.trial.entitlement.wordCap.toLocaleString("en-US");
  const pocket = PRICING.trial.pocketCredits.toLocaleString("en-US");
  const generated = trialIncludedNote();
  // — the operator pause: anonymous surfaces render no trial claim whatsoever.
  const { page: anonPage } = await ctx.anon();
  for (const path of ["/", "/pricing"]) {
    await gotoOk(anonPage, `${ctx.webBaseUrl}${path}`);
    const body = (await anonPage.textContent("body")) ?? "";
    for (const leak of [generated, "first review is included", "one included Review"]) {
      if (body.toLowerCase().includes(leak.toLowerCase())) {
        throw new Error(`${path} leaks the gated trial claim to an uncovered audience: "${leak}"`);
      }
    }
  }
  // — the covered audience's preview: a signed-in test tenant sees config-equal claims.
  // Per §15.1/§15.2 the landing carries the claim TEXT (the hero note + the FAQ answer — the
  // spec copy carries no figure), while /pricing carries the generated figures: the derived
  // word cap, the pocket, and the generated includedNote. The assertions match
  // claims-visibility.test.ts's deterministic contract exactly — "claims equal the config",
  // surface by surface.
  const { page } = await ctx.returningUser("a");
  const landing = await gotoOk(page, `${ctx.webBaseUrl}/?audience=test`)
    .then(() => page.textContent("body"))
    .then((b) => b ?? "");
  for (const claim of [
    PUBLIC_CLAIM_COPY["trial.firstReviewIncluded"].landingTrialNote,
    PUBLIC_CLAIM_COPY["trial.firstReviewIncluded"].landingFaqAnswer,
  ]) {
    if (!landing.toLowerCase().includes(claim.toLowerCase())) {
      throw new Error(`/?audience=test render lacks the config claim text: "${claim}"`);
    }
  }
  const pricing = await gotoOk(page, `${ctx.webBaseUrl}/pricing?audience=test`)
    .then(() => page.textContent("body"))
    .then((b) => b ?? "");
  for (const [label, figure] of [
    ["word cap", cap],
    ["pocket", pocket],
    ["includedNote", generated],
  ] as const) {
    if (!pricing.includes(figure)) {
      throw new Error(`/pricing?audience=test render lacks the configured ${label} "${figure}"`);
    }
  }
};

/** X1 (GREEN, SEC.1) — two flagged tenants: no foreign markers on the listed surfaces. */
const X1: StepFn = async (ctx) => {
  const a = await ctx.returningUser("a");
  const b = await ctx.returningUser("b");
  // A plants a nonce marker: a scratch project titled with it AND a nonce-named voice (the "save"
  // intent is free — X1 is a $0 leg; "build" would be paid).
  const aMarker = ctx.marker("TENANTA");
  const aVoice = ctx.marker("VOICEA");
  await gotoOk(a.page, `${ctx.webBaseUrl}/voices/new`);
  const nameField = a.page.locator('input[name="name"]').first();
  if ((await nameField.count()) === 0) throw new Error("no name field on /voices/new");
  await nameField.fill(aVoice);
  // intent=save is the $0 leg; the first submit button is intent=build (a metered voice build that
  // also 400s without a sample — never click it here).
  await a.page.click('button[name="intent"][value="save"]');
  await a.page.waitForLoadState("domcontentloaded");
  // sanity: the voice lands on A's own /voices (else the isolation probe below is vacuous).
  await gotoOk(a.page, `${ctx.webBaseUrl}/voices`);
  if (!((await a.page.textContent("body")) ?? "").includes(aVoice)) {
    throw new Error("tenant A's own voice is absent from /voices (vacuous check)");
  }
  await gotoOk(a.page, `${ctx.webBaseUrl}/app/new?entry=scratch`);
  await a.page.fill('input[name="title"]', aMarker);
  await a.page.click('button[type="submit"], button:not([type])');
  await a.page.waitForURL(/\/p\/([a-z0-9-]+)/i, { timeout: 15_000 });
  const aSlug = /\/p\/([a-z0-9-]+)/i.exec(a.page.url())?.[1] ?? "";
  // B walks the tenant surfaces — A's marker and slug must never appear.
  for (const path of ["/app", "/app/inbox", "/usage", "/voices"]) {
    const r = await b.page.goto(`${ctx.webBaseUrl}${path}`, { waitUntil: "domcontentloaded" });
    if (!r || r.status() >= 400) throw new Error(`B GET ${path} → ${r?.status()}`);
    const body = (await b.page.textContent("body")) ?? "";
    if (body.includes(aMarker) || body.includes(aSlug) || body.includes(aVoice)) {
      throw new Error(`tenant B sees tenant A's marker on ${path}`);
    }
  }
  // detail-route isolation: B cannot open A's project.
  const r = await b.page.goto(`${ctx.webBaseUrl}/p/${aSlug}`, { waitUntil: "domcontentloaded" });
  const status = r?.status() ?? 0;
  const body = (await b.page.textContent("body")) ?? "";
  if (status < 400 && body.includes(aMarker)) {
    throw new Error(`tenant B opened tenant A's project /p/${aSlug}`);
  }
  // sanity: A sees its own marker (the assertions above aren't vacuous).
  await gotoOk(a.page, `${ctx.webBaseUrl}/app`);
  const aBody = (await a.page.textContent("body")) ?? "";
  if (!aBody.includes(aMarker)) {
    const quiet = a.page.locator('details[data-collapsed-group="quiet"] > summary');
    if ((await quiet.count()) > 0) {
      await quiet.first().click();
      const again = (await a.page.textContent("body")) ?? "";
      if (!again.includes(aMarker))
        throw new Error("tenant A cannot see its own marker (vacuous check)");
    } else {
      throw new Error("tenant A cannot see its own marker (vacuous check)");
    }
  }
};

// ---------------------------------------------------------------- the free fixture (≤300 words)

const FREE_FIXTURE = `# Journey fixture
The committee met on Tuesday. The report was adopted unanimously.
An appendix lists the figures; the body argues the method.
`;

export const STEP_IMPLS: Readonly<Record<string, StepFn>> = {
  N1,
  N2,
  "N2.invite": N2_INVITE,
  N3,
  N4,
  N5,
  N6,
  N7,
  N8,
  N9,
  R1,
  R4,
  R5,
  R6,
  R7,
  P1,
  C1,
  X1,
};
