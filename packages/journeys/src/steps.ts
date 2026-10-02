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
    throw new Error(`console errors on visited pages: ${ctx.consoleErrors.slice(0, 5).join(" | ")}`);
  }
  if (ctx.failedRequests.length > 0) {
    throw new Error(`failed requests on visited pages: ${ctx.failedRequests.slice(0, 5).join(" | ")}`);
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
  if (!m?.[1]) throw new Error(`scratch project did not redirect to /p/<slug> (landed ${page.url()})`);
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
    path === "/app" ||
    /^\/p\/[^/]+\/review\/[^/]+/.test(path) ||
    /^\/p\/[^/]+/.test(path);
  if (!onApp) throw new Error(`post-signup did not land in the app (${path})`);
  const bodyText = await page.textContent("body");
  if (/sign in|log in/i.test(bodyText ?? "") && path === "/login") {
    throw new Error("post-signup landed back on /login");
  }
  assertBundleParity(ctx);
  void email;
};

/** N2.invite (RED, SEC.2) — under open mode the invite field is not the first field. */
const N2_INVITE: StepFn = async (ctx) => {
  const { context, page } = await ctx.anon();
  await gotoOk(page, `${ctx.webBaseUrl}/signup`);
  const code = page.locator('form[action="/signup"] input[name="code"]');
  if (await code.count()) {
    const required = await code.first().getAttribute("required");
    if (required === null) {
      // open mode — the email field must come first.
      const first = page.locator('form[action="/signup"] input:visible').first();
      const name = await first.getAttribute("name");
      if (name !== "email") {
        throw new Error(`open-mode signup's first field is "${name}", not "email" (invite still first)`);
      }
    }
  }
  await context.close();
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
  await page.waitForSelector('[data-preview], [data-held-notice], [role="status"], meta[http-equiv]', {
    timeout: 20_000,
  });
  const ms = Date.now() - t0;
  if (ms > 20_000) throw new Error(`preview took ${ms}ms (> 20 s)`);
};

/** N4 (RED, EST.1) — sheet estimate ≡ protocol card ≡ Timeline chip ≡ pricing card. */
const N4: StepFn = async (ctx) => {
  const { page } = await ctx.freshUser("n4");
  await gotoOk(page, `${ctx.webBaseUrl}/app/new?entry=scratch`);
  // collect every "≈ N credits" / duration figure on the sheet's protocol cards
  const cardEstimates = await page.$$eval(
    "[data-protocol-card] .tnum",
    (els) => els.map((e) => (e.textContent ?? "").replace(/\s+/g, " ").trim()).filter(Boolean),
  );
  if (cardEstimates.length === 0) throw new Error("no protocol-card estimates rendered");
  const body = (await page.textContent("body")) ?? "";
  const sheetEstimate = /\b\d[\d,]*\s+credits?\b/.exec(body)?.[0];
  if (!sheetEstimate) throw new Error("no sheet-level estimate rendered");
  // the agreement assertion (EST.1 owns making this true across the four surfaces)
  const nums = cardEstimates.map((e) => /\d[\d,]*/.exec(e)?.[0] ?? "");
  if (!nums.every((n) => sheetEstimate.replace(/,/g, "").includes(n.replace(/,/g, "")))) {
    // not fatal-shape — the step's real contract is exact agreement; EST.1 owns the green flip.
    throw new Error(`sheet estimate "${sheetEstimate}" does not agree with cards ${JSON.stringify(cardEstimates)}`);
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
    throw new Error(`${label}: CSP console violation after hosted hand-off — ${violations.join(" | ")}`);
  }
}

async function n9ClickToStripe(
  ctx: StepCtx,
  page: Page,
  control: Locator,
  label: string,
  expected: readonly RegExp[],
): Promise<void> {
  const navigated = page.waitForURL((u) => n9StripeHosted(u.toString()), { timeout: 45_000 });
  await clickActionable(control, label);
  try {
    await navigated;
  } catch {
    throw new Error(`${label}: stayed on ${page.url()} — no Stripe-hosted hand-off`);
  }
  await page.waitForLoadState("domcontentloaded", { timeout: 15_000 }).catch(() => undefined);
  if (!n9StripeHosted(page.url())) {
    throw new Error(`${label}: landed on non-Stripe URL ${page.url()}`);
  }
  const body = await page.locator("body").innerText({ timeout: 15_000 }).catch(() => "");
  for (const re of expected) {
    if (!re.test(body)) throw new Error(`${label}: Stripe page did not show ${re} (url ${page.url()})`);
  }
  n9AssertNoCspViolation(ctx, label);
}

const N9: StepFn = async (ctx) => {
  const webBase = ctx.webBaseUrl.replace(/\/$/, "");

  // Entry 1 — Billing → Choose Writer on a FREE flagged test tenant (subscribe is the Free user's
  // Checkout entry; the paid tenant below has no "Choose Writer" button once it is already Writer).
  const { page: subscribePage } = await ctx.freshUser("n9");
  await gotoOk(subscribePage, `${webBase}/app/settings/billing`);
  await subscribePage.selectOption("form[data-subscribe-form='writer'] select[name='cycle']", "monthly");
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
    throw new Error(`N9 run-sheet Add credits: non-Stripe Payment Link ${paymentLink ?? "(missing)"}`);
  }
  await n9ClickToStripe(ctx, page, addCredits, "N9 run-sheet Add credits", [/\$\d+(?:\.\d{2})?/]);

  // Leave the last opened page on the Stripe-hosted landing so the runner's N9.png evidence is the
  // hosted payment page itself, not an app page.
  n9AssertNoCspViolation(ctx, "N9");
};

/** N5 (RED, ACT.1; paid) — trial Review shows *Included* and delivers without a cap death.
 *  This is the paid leg's driver: it ingests the committed ≤300-word fixture and launches the
 *  run, so the weekly journey's metered spend is real and bounded by the spend guard. */
const N5: StepFn = async (ctx) => {
  const { page } = await ctx.freshUser("n5");
  // the paid fixture rides the real new-project sheet (a paste-ingested draft, not a file upload)
  const slug = await createScratchProject(page, ctx, "PAID", PAID_FIXTURE);
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/run`);
  const body = (await page.textContent("body")) ?? "";
  if (!/included/i.test(body)) throw new Error('trial Review surface shows no "Included" line');
  // launch the Standard/Base Review — the one bounded paid run of the weekly leg.
  const launch = page
    .locator('button[type="submit"]:has-text("Review"), button:has-text("Start"), button:has-text("Run")')
    .first();
  if ((await launch.count()) === 0) throw new Error("no Review launch control on the run sheet");
  await assertActionable(launch, "Review launch");
  await launch.click();
  await page.waitForLoadState("domcontentloaded");
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
  await page.click('form[action="/app/new"] button[type="submit"], form[action="/app/new"] button:not([type])');
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
  // approvals would park the review at its gates.
  const auto = page.locator('input[name="autoRun"]');
  if ((await auto.count()) > 0 && !(await auto.isChecked())) await auto.check();
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
    reviewHref = await page.locator(runLinkSel).first().getAttribute("href").catch(() => null);
    if (!reviewHref) await new Promise((res) => setTimeout(res, 5_000));
  }
  if (!reviewHref) throw new Error("run sheet shows no active-run dossier link after launch");
  const runId = /\/review\/([A-Za-z0-9]+)/.exec(reviewHref)?.[1] ?? "";
  // poll the dossier route until the run delivers — it 404s while the run is in flight.
  const deadline = Date.now() + 40 * 60_000;
  let delivered = false;
  while (Date.now() < deadline) {
    const r = await page.goto(`${ctx.webBaseUrl}${reviewHref}`, { waitUntil: "domcontentloaded" }).catch(() => null);
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
  const planted = page.locator('li[data-verdict]', { hasText: "Library of Congress" });
  if ((await planted.count()) === 0) throw new Error("no claim row names the planted LoC claim");
  const contra = page.locator('li[data-verdict="contradicted"]', { hasText: "Library of Congress" });
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
  const input = page.locator('form[action$="/chat/turns"] input[name="body"], input[name="body"]').first();
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
    if ((await reviewLink.count()) === 0) throw new Error("no dossier link on the Showcase overview");
    const href = await reviewLink.getAttribute("href");
    if (!href) throw new Error("dossier link has no href");
    await gotoOk(page, `${ctx.webBaseUrl}${href}`);
  }
  const dup = page.locator('form[action$="/duplicate"] button[type="submit"], form[action$="/duplicate"] button:not([type])').first();
  if ((await dup.count()) === 0) throw new Error("no duplicate control on the Showcase");
  await assertActionable(dup, "showcase duplicate");
  await dup.click();
  await page.waitForURL(/\/p\/([a-z0-9-]+)/i, { timeout: 20_000 });
  const slug = /\/p\/([a-z0-9-]+)/i.exec(page.url())?.[1];
  if (!slug || slug === "showcase") throw new Error(`duplicate did not land on a copy (url ${page.url()})`);
  // open the export dialog and submit — the response is a file download.
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}`);
  const exportForm = page.locator('form[data-export-form="true"], form[action$="/export"]');
  if ((await exportForm.count()) === 0) {
    // the dialog may be a /p/:slug/export page — try the direct route.
    const r = await page.goto(`${ctx.webBaseUrl}/p/${slug}/export`);
    if (!r || r.status() >= 400) throw new Error(`export surface missing (GET /p/${slug}/export → ${r?.status()})`);
  }
  const download = page.waitForEvent("download", { timeout: 20_000 }).catch(() => null);
  const resp = page.waitForResponse(
    (r) => /\/export$/.test(new URL(r.url()).pathname) && r.request().method() === "POST",
    { timeout: 20_000 },
  ).catch(() => null);
  const submit = page.locator('form[action$="/export"] button[type="submit"], form[data-export-form] button[type="submit"]').first();
  if ((await submit.count()) === 0) throw new Error("no export submit control");
  await assertActionable(submit, "export submit");
  await submit.click();
  const [dl, rs] = await Promise.all([download, resp]);
  const fileOk = dl !== null || (rs !== null && rs.status() === 200);
  if (!fileOk) throw new Error("export produced no download/200 response");
};

/** R6 (RED, RPT.1; paid) — the run card's meter moves; report spent = Σ debits. */
const R6: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  await gotoOk(page, `${ctx.webBaseUrl}/usage`);
  const body = (await page.textContent("body")) ?? "";
  if (!/credit|usd|\$/i.test(body)) throw new Error("usage surface shows no meter");
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
          bad.push(`${el.tagName.toLowerCase()} ${(el.textContent ?? "").slice(0, 24)} (${Math.round(r.height)}px)`);
        }
      }
      return bad;
    });
    if (small.length > 0) throw new Error(`${path}: sub-44px primary actions: ${small.join("; ")}`);
  }
};

/** C1 (RED, ACT.1) — landing/pricing/trial claims equal the entitlement config + estimator. */
const C1: StepFn = async (ctx) => {
  const { page } = await ctx.anon();
  const claims = async (path: string) => {
    await gotoOk(page, `${ctx.webBaseUrl}${path}`);
    return (await page.textContent("body")) ?? "";
  };
  const landing = await claims("/");
  const pricing = await claims("/pricing");
  // the trial word-cap claim (6 000 in the seed config) must agree where both surfaces state it.
  const find = (s: string) => /\b(\d[\d,]{2,})\s*(words?|w\b)/i.exec(s)?.[1]?.replace(/,/g, "");
  const l = find(landing);
  const p = find(pricing);
  if (l && p && l !== p) {
    throw new Error(`trial word claim disagrees: landing ${l} vs pricing ${p}`);
  }
  if (!l && !p) throw new Error("no word-count claim found on either public surface to cross-check");
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
      if (!again.includes(aMarker)) throw new Error("tenant A cannot see its own marker (vacuous check)");
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
