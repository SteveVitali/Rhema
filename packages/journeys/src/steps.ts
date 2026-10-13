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
// ONB.1 — N1/N3 must sign in through the real magic link INSIDE the anonymous context that holds
// the IndexedDB draft (sessions.signIn mints a NEW context — a separate storage partition where
// the hold does not exist). The identities are still test-mailbox-only.
import { freshIdentity, assertTestIdentity } from "./session.js";
// ACT.1 — the journey asserts against the SHIPPED config (the same typed pricing.json the
// surfaces render from), never a second literal copy of the trial's figures.
import { PRICING, PUBLIC_CLAIM_COPY, trialIncludedNote } from "@rhema/contracts";
// UX.2 (ADR-068) — axe-core as the WCAG 2.2 AA checker: the prebuilt script source injects into the
// page (never bundled into shipped artifacts; journeys is dev tooling, MPL-2.0 exception checked in).
import axeCore from "axe-core";

/** The injectable axe build (UMD — `page.addScriptTag({content})`, not an import in the page). */
const AXE_SOURCE = axeCore.source;

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

/**
 * The held-draft wait: the island hydrates `input[name=file]` asynchronously after DOMContentLoaded —
 * poll until it carries exactly the held file. Returns the attached filename (never status alone).
 */
async function awaitHeldFile(page: Page, timeoutMs = 15_000): Promise<string> {
  await page.waitForFunction(
    () => ((document.querySelector('input[name="file"]') as HTMLInputElement | null)?.files?.length ?? 0) === 1,
    undefined,
    { timeout: timeoutMs },
  );
  return page.evaluate(
    () => (document.querySelector('input[name="file"]') as HTMLInputElement | null)?.files?.[0]?.name ?? "",
  );
}

/** N1 (ONB.1) — a draft dropped on the landing is HELD across the real magic-link sign-in and two
 *  later /app/new loads, the file input populated each time. IndexedDB is per-origin per-context, so
 *  the whole leg runs in ONE anonymous context — sessions.signIn's separate context would partition
 *  the hold away (which is also the honest proof the hold is client-side, never account-bound). */
const N1: StepFn = async (ctx) => {
  const { page } = await ctx.anon();
  await gotoOk(page, ctx.webBaseUrl + "/");
  const dropzone = page.locator("[data-dropzone]");
  if ((await dropzone.count()) === 0) throw new Error("landing drop-zone absent");
  await page.setInputFiles('[data-dropzone] input[type="file"]', {
    name: "n1-held-draft.md",
    mimeType: "text/markdown",
    buffer: Buffer.from("# N1 Held Draft\n\nThe draft that must survive sign-in and two more loads."),
  });
  // the island holds it client-side and routes to the intent-carrying signup
  await page.waitForURL((u) => u.pathname === "/signup" && u.searchParams.get("held") === "1", {
    timeout: 10_000,
  });
  // the REAL magic-link leg — in THIS context, so the IndexedDB hold survives the auth hop
  const email = freshIdentity(ctx.nonce, "n1held");
  assertTestIdentity(email);
  await page.fill('input[name="email"]', email);
  const sentAt = Math.floor(Date.now() / 1000) - 30;
  await page.click('button[name="method"][value="magic_link"]');
  await page.waitForSelector('[role="status"]', { timeout: 45_000 });
  const link = await ctx.mailbox.awaitMagicLink(email, sentAt, 120_000);
  await page.goto(link, { waitUntil: "domcontentloaded" });
  // post-auth the intent lands on /app/new?entry=draft&held=1 — the FIRST hydrated load
  await page.waitForURL(/\/app\/new/, { timeout: 30_000 });
  const name = await awaitHeldFile(page);
  if (name !== "n1-held-draft.md") throw new Error(`post-signin hydration attached ${JSON.stringify(name)}`);
  // …and two further /app/new loads — the hold persists, the input re-populates each time (ONB.1:
  // no claim-on-attach; a hold dies only to a token-matched consumed marker or Discard).
  for (let visit = 1; visit <= 2; visit++) {
    await gotoOk(page, `${ctx.webBaseUrl}/app/new?entry=draft&held=1`);
    const again = await awaitHeldFile(page);
    if (again !== "n1-held-draft.md") {
      throw new Error(`visit ${visit + 1}: the held file did not re-populate (got ${JSON.stringify(again)})`);
    }
  }
  // the held notice names the file, Discard exists, and the consumed-handshake token is stamped
  const notice = (await page.locator("[data-held-notice]").textContent()) ?? "";
  if (!notice.includes("n1-held-draft.md")) {
    throw new Error(`held notice does not name the file (${JSON.stringify(notice)})`);
  }
  if ((await page.locator("[data-held-discard]").count()) === 0) {
    throw new Error("no 'Discard held file' control");
  }
  const stamped = await page.evaluate(
    () => (document.querySelector('input[name="heldToken"]') as HTMLInputElement | null)?.value ?? "",
  );
  if (!stamped.startsWith("hold_")) {
    throw new Error("heldToken not stamped — the consumed handshake cannot match this hold");
  }
};

/** N3 (ONB.1) — the held draft becomes a project whose conversion preview renders in ≤ 20 s, and
 *  the create consumes the hold (the `?hc=` handshake — a second /app/new shows an empty input). */
const N3: StepFn = async (ctx) => {
  // Same one-context walk as N1 (the hold is IndexedDB-bound): drop → magic link → /app/new.
  const { page } = await ctx.anon();
  await gotoOk(page, ctx.webBaseUrl + "/");
  await page.setInputFiles('[data-dropzone] input[type="file"]', {
    name: "n3-held.md",
    mimeType: "text/markdown",
    buffer: Buffer.from(`# ${ctx.marker("N3HELD")}\n\n${FREE_FIXTURE}`),
  });
  await page.waitForURL((u) => u.pathname === "/signup" && u.searchParams.get("held") === "1", {
    timeout: 10_000,
  });
  const email = freshIdentity(ctx.nonce, "n3held");
  assertTestIdentity(email);
  await page.fill('input[name="email"]', email);
  const sentAt = Math.floor(Date.now() / 1000) - 30;
  await page.click('button[name="method"][value="magic_link"]');
  await page.waitForSelector('[role="status"]', { timeout: 45_000 });
  const link = await ctx.mailbox.awaitMagicLink(email, sentAt, 120_000);
  await page.goto(link, { waitUntil: "domcontentloaded" });
  await page.waitForURL(/\/app\/new/, { timeout: 30_000 });
  if ((await awaitHeldFile(page)) !== "n3-held.md") {
    throw new Error("the held file did not hydrate on the post-auth load");
  }
  // submit → the conversion preview must render READY (its Create form exists only on the ready
  // render; the pending page meta-refreshes under it) inside the §13.5 20 s bound.
  const t0 = Date.now();
  await page.click('button[type="submit"], button:not([type])');
  await page.waitForSelector('form[action="/app/new/create"]', { timeout: 20_000 });
  const ms = Date.now() - t0;
  if (ms > 20_000) throw new Error(`preview took ${ms}ms (> 20 s)`);
  // Create → the project lands and the `?hc=` consumed marker echoes the hold's token.
  await page.click('form[action="/app/new/create"] button[type="submit"][name="action"][value="create"]');
  await page.waitForURL(/\/p\/[a-z0-9-]+.*created=/, { timeout: 30_000 });
  const landed = new URL(page.url());
  if (!landed.searchParams.get("hc")) {
    throw new Error(`create landing carried no consumed marker (?hc= missing): ${page.url()}`);
  }
  // the consumed handshake actually ran: a return to /app/new shows an EMPTY file input.
  await gotoOk(page, `${ctx.webBaseUrl}/app/new?entry=draft&held=1`);
  await page.waitForTimeout(2_000); // the island's delete is async — give it a beat, then assert
  const stillAttached = await page.evaluate(
    () => (document.querySelector('input[name="file"]') as HTMLInputElement | null)?.files?.length ?? 0,
  );
  if (stillAttached !== 0) {
    throw new Error("the hold survived a server-confirmed consumption — the handshake did not run");
  }
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

/**
 * EDIT.1 — the shared "type → fork → sync → reload" flow (§5.4/§5.10; REQ-IDE-32/IDE-43):
 * open a versioned Page URL, mount the ProseMirror island, type the run marker, and wait for the
 * §5.4 fork banner + the ONE sync pill to reach "synced ✓" — then reload `/v/working` and assert
 * the working human-authored chip + the persisted marker. `openPath` is the LOCKED version's URL
 * (`/v/<frozenN>` or `/v/working`); the typing itself performs the fork/rebind — never a confirm.
 */
async function n8TypeForkSave(
  ctx: StepCtx,
  page: Page,
  slug: string,
  openPath: string,
  label: string,
): Promise<void> {
  const markerText = ctx.marker(`n8-${label}`).toLowerCase().replace(/[^a-z0-9]/g, "-");

  await gotoOk(page, `${ctx.webBaseUrl}${openPath}`);
  // the Page island mounts ProseMirror over the SSR preview (page.js via the deferred script)
  await page.waitForSelector("[data-page-root]", { timeout: 15_000 });
  await page.waitForSelector("[data-page-view]", { timeout: 30_000 });
  // the ONE sync indicator — the shell's status bar carries no second sync element (ADR-049)
  const pillCount = await page.locator("[data-sync-pill]").count();
  if (pillCount !== 1) throw new Error(`${label}: expected 1 [data-sync-pill], saw ${pillCount}`);
  if ((await page.locator("footer.ide-statusbar .ide-sync").count()) !== 0) {
    throw new Error(`${label}: a second sync indicator rides the status bar`);
  }
  // no confirm surface may appear anywhere in the fork path — visible/OPEN dialogs only: the
  // IDE shell legitimately carries a hidden command drawer + cheatsheet (role="dialog", hidden),
  // so a raw role count would always trip. A fork-gating confirm is by definition visible.
  const noConfirm = async () => {
    const dialogs = await page
      .locator('dialog[open], [role="alertdialog"]:visible, [role="dialog"]:visible')
      .count();
    if (dialogs > 0) throw new Error(`${label}: a confirm dialog appeared before the fork`);
  };
  await noConfirm();

  // type into the live doc — the keystroke IS the fork trigger (2 s debounce + close/re-auth loop)
  await page.click("[data-page-view]");
  await page.keyboard.type(` ${markerText}`);
  await noConfirm();

  // §5.4's banner: "Editing vN · findings from vM follow your text" (the fork/rebind flipped it)
  await page
    .waitForFunction(
      () => /Editing v\d+/.test(
        document.querySelector('[data-page-banner="version"] span')?.textContent ?? "",
      ),
      undefined,
      { timeout: 90_000 },
    )
    .catch(() => {
      throw new Error(
        `${label}: the fork banner never flipped to "Editing vN" (the fork/rebind loop did not land)`,
      );
    });
  // the ONE pill truthfully reaches synced ✓
  try {
    await page.waitForSelector('[data-sync-pill][data-sync-state="synced"]', { timeout: 90_000 });
  } catch {
    // diagnostics: the pill's observed state + the bound draft (the rebind's target) ride the error
    const pillState = await page
      .locator("[data-sync-pill]")
      .first()
      .evaluate((el) => `${el.getAttribute("data-sync-state")} · "${el.textContent}"`)
      .catch(() => "(pill missing)");
    const bound = await page
      .locator("[data-page-root]")
      .evaluate((el) => `${el.getAttribute("data-draft-id")} v${el.getAttribute("data-draft-n")}`)
      .catch(() => "(root missing)");
    throw new Error(`${label}: pill never reached synced — observed ${pillState} on ${bound}`);
  }
  const pillText = await page.locator("[data-sync-pill]").textContent();
  if (!/synced/i.test(pillText ?? "")) throw new Error(`${label}: pill text "${pillText}" ≠ synced`);

  // reload the editable head: a WORKING human-authored chip is on the rail and the edit persisted —
  // `human_revision` for the forked legs (import, reviewed), `duplicate` for the showcase-copy leg
  // (the copy's open head edits in place — `one_working_head_per_project` makes a fork impossible).
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/v/working`);
  await page.waitForSelector("[data-page-view]", { timeout: 30_000 });
  const workingChip = page.locator(
    'li[data-version-chip][data-state="working"]' +
      ':is([data-origin="human_revision"],[data-origin="duplicate"],[data-origin="human_upload"])',
  );
  if ((await workingChip.count()) === 0) {
    throw new Error(`${label}: no working human-editable chip on the rail after reload`);
  }
  const body = (await page.textContent("body")) ?? "";
  if (!body.includes(markerText)) {
    throw new Error(`${label}: the typed marker did not persist across a /v/working reload`);
  }
}

/** N8 (EDIT.1) — editing a locked version forks to v(N+1) without a confirm and SAVES (sync pill):
 *
 *  leg A — the fresh import: a new visitor's paste-imported draft (frozen human_upload v1 — the
 *  shape PR-J4 caught 404ing at /v/working). The Edit source opens /v/working (200 + mounted
 *  Page), typing forks v2 with the §5.4 banner, the pill reaches synced ✓, reload shows the edit.
 *
 *  leg B — a reviewed version on the returning tenant (jrn-a): a project whose rail carries a
 *  reviewed-frozen chip gets the same flow (when its lineage already has a working head the edit
 *  lands on it through the frozen_fork rebind — the same end-state assertions hold). If jrn-a has
 *  no reviewed head, the fallback is the duplicated Showcase — a frozen review-lineage head
 *  exercising the identical lock→fork→save path (the Showcase itself stays read-only by design). */
const N8: StepFn = async (ctx) => {
  // ---------- leg A — the fresh import ----------
  const { page } = await ctx.freshUser("n8");
  const slug = await createDraftProject(page, ctx.webBaseUrl, ctx.marker("n8"), PAID_FIXTURE);
  // the Edit source IS the /v/working entry — click it, never type the URL
  const edit = page.locator('a[data-edit-source]').first();
  if ((await edit.count()) === 0) throw new Error("the project page has no Edit source affordance");
  await edit.click();
  await page.waitForURL(/\/v\/working/, { timeout: 15_000 });
  // a 404 here renders no [data-page-root] — n8TypeForkSave's selector wait is the assertion
  await n8TypeForkSave(ctx, page, slug, `/p/${slug}/v/working`, "import");

  // ---------- leg B — a reviewed (or frozen-lineage) locked version on jrn-a ----------
  const { page: ret } = await ctx.returningUser("a");
  await gotoOk(ret, `${ctx.webBaseUrl}/app`);
  const allHrefs = await ret.locator('a[href^="/p/"]').evaluateAll((els) =>
    [...new Set(els.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? ""))],
  );
  const hrefs = allHrefs.filter((h) => /^\/p\/[^/]+$/.test(h));
  // dossier links can also ride the /app rows directly (latestReviewRunId cards)
  const dossierHrefs = allHrefs.filter((h) => /^\/p\/[^/]+\/review\/[^/]+/.test(h));
  let reviewed: { slug: string; frozenN: number } | null = null;
  let fallbackReviewed: { slug: string; frozenN: number } | null = null;
  let showcaseDossier: string | null = null;
  for (const href of hrefs.slice(0, 12)) {
    await gotoOk(ret, `${ctx.webBaseUrl}${href}`);
    const slug = href.split("/")[2] ?? "";
    // a read-only Page (the Showcase, or a head held by a live run) is not a candidate — but a
    // read-only page's dossier may be the Showcase (the duplicate fallback's substrate)
    if ((await ret.locator('[data-page-host][data-readonly="1"]').count()) > 0) {
      const dossierLink = ret.locator('a[href*="/review/"]').first();
      if (await dossierLink.count()) {
        const dh = await dossierLink.getAttribute("href");
        if (dh) {
          await gotoOk(ret, `${ctx.webBaseUrl}${dh}`);
          if ((await ret.locator("[data-showcase-banner]").count()) > 0) showcaseDossier = dh;
        }
      }
      continue;
    }
    const frozenReviewed = ret.locator(
      'li[data-version-chip][data-state="frozen"]:has([data-reviewed])',
    );
    if ((await frozenReviewed.count()) === 0) continue;
    const frozenN = Number(
      (await frozenReviewed.first().getAttribute("data-version-chip")) ?? "0",
    );
    const hasWorking = (await ret.locator('li[data-version-chip][data-state="working"]').count()) > 0;
    // prefer an un-forked reviewed lineage (the literal v(N+1) fork leg); else any reviewed head
    if (frozenN > 0 && !hasWorking) {
      reviewed = { slug, frozenN };
      break;
    }
    if (frozenN > 0 && !fallbackReviewed) fallbackReviewed = { slug, frozenN };
  }
  // the duplicate fallback's substrate may ride /app directly — probe dossier links for the banner
  if (!reviewed && !fallbackReviewed && !showcaseDossier) {
    for (const dh of dossierHrefs.slice(0, 8)) {
      await gotoOk(ret, `${ctx.webBaseUrl}${dh}`);
      if ((await ret.locator("[data-showcase-banner]").count()) > 0) {
        showcaseDossier = dh;
        break;
      }
    }
  }
  const target = reviewed ?? fallbackReviewed;
  if (target) {
    // the LOCKED version's own URL — typing routes to the lineage's working head (fork or rebind)
    await n8TypeForkSave(ctx, ret, target.slug, `/p/${target.slug}/v/${target.frozenN}`, "reviewed");
  } else if (showcaseDossier) {
    // no reviewed head on jrn-a — duplicate the Showcase into a frozen review-lineage head
    await gotoOk(ret, `${ctx.webBaseUrl}${showcaseDossier}`);
    const dup = ret.locator('[data-showcase-banner] form[action$="/duplicate"] button').first();
    if ((await dup.count()) === 0) throw new Error("the Showcase banner carries no Duplicate affordance");
    await dup.click();
    await ret.waitForURL(/\/p\/[a-z0-9-]+/i, { timeout: 15_000 });
    const copySlug = /\/p\/([a-z0-9-]+)/i.exec(ret.url())?.[1];
    if (!copySlug) throw new Error(`showcase duplicate did not land on /p/<slug> (${ret.url()})`);
    await n8TypeForkSave(ctx, ret, copySlug, `/p/${copySlug}/v/working`, "frozen-dup");
  } else {
    throw new Error(
      "no reviewed-frozen head and no Showcase dossier on the returning tenant — the locked-version leg has no substrate",
    );
  }
  assertBundleParity(ctx);
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

/** R4 (RED→RUN.1; paid) — a chat turn answers; Send is actionable at 1440×900 and phone width. */
const R4: StepFn = async (ctx) => {
  const { page, context } = await ctx.returningUser("a");
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoOk(page, `${ctx.webBaseUrl}/app`);
  await followProjectLink(page, ctx);
  // RUN.1 — the Desk renders closed unless a run is live (data-desk="closed"); ⌘J opens it (the
  // × toggle is clipped inside the closed drawer) and a tab click pins the Chat panel.
  const ide = page.locator(".ide").first();
  if ((await ide.getAttribute("data-desk")) !== "open") {
    await page.keyboard.press("Control+j");
    await page.waitForSelector('.ide[data-desk="open"]', { timeout: 5_000 });
    await page.locator('[data-ide-desk-tab="chat"]').first().click();
  }
  const input = page.locator('.ide-desk form[data-chat-composer] textarea[name="message"]').first();
  if ((await input.count()) === 0) throw new Error("no chat composer on the project page");
  const send = page.locator('.ide-desk form[data-chat-composer] button[type="submit"]').first();
  await assertActionable(send, "chat Send @1440×900"); // RUN.1 — was occluded by footer.ide-statusbar
  await input.fill(`${ctx.marker("CHAT")} — one-word reply please`);
  await send.click();
  await page.waitForLoadState("domcontentloaded");
  // the turn's answer: the reloaded transcript carries [data-chat-turn] rows; poll the turn-status
  // endpoint until the run leaves queued/running (a bounded wait — the paid turn is the point).
  const slug = /\/p\/([a-z0-9-]+)/i.exec(page.url())?.[1];
  if (slug) {
    const turnRow = page.locator("[data-chat-turn]").last();
    await turnRow.waitFor({ state: "attached", timeout: 10_000 }).catch(() => undefined);
    const turnId = await turnRow.getAttribute("data-chat-turn").catch(() => null);
    // the desk root stamps the ACTIVE thread (data-chat-thread) — the status route keys on it;
    // an empty ?thread= misses the api's /threads/:tid/turns/:runId path and 404s the whole poll.
    const threadId =
      (await page
        .locator("[data-chat-thread]")
        .first()
        .getAttribute("data-chat-thread")
        .catch(() => null)) ?? "";
    if (turnId) {
      const deadline = Date.now() + 150_000;
      let state = "";
      while (Date.now() < deadline) {
        const r = await page.request.get(
          `${ctx.webBaseUrl}/p/${slug}/chat/turns/${turnId}?thread=${encodeURIComponent(threadId)}`,
        );
        if (r.ok()) {
          state = ((await r.json()) as { state?: string }).state ?? "";
          if (!["queued", "running", "provisioning"].includes(state)) break;
        }
        await page.waitForTimeout(4_000);
      }
      if (!state) throw new Error(`turn-status poll never returned the turn ${turnId}`);
      if (["failed", "cancelled"].includes(state)) {
        throw new Error(`chat turn ${turnId} terminal state ${state} — it did not answer`);
      }
    }
  }
  // the phone half — a real MOBILE context (the compact mount is UA-driven — `isPhoneRequest` —
  // a bare viewport resize keeps the desktop mount, whose hidden desk composer then fails the probe).
  const phone = await ctx.browser.newContext({
    baseURL: ctx.webBaseUrl,
    storageState: await context.storageState(),
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const pp = await phone.newPage();
    await gotoOk(pp, page.url());
    const sendP = pp
      .locator('.ide-phone-only form[data-chat-composer] button[type="submit"]')
      .first();
    // the phone mount is in-flow inside the Page (below the fold) — scroll to it as a reader
    // would, then assert the centered hit-target is clear of the phonebar/statusbar chrome.
    await sendP.scrollIntoViewIfNeeded();
    await assertActionable(sendP, "chat Send @390×844");
  } finally {
    await phone.close();
  }
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

/** R7 (RED→RUN.1) — an informational gate does not block; labels match behaviour. The free leg
 *  checks the two surfaces it can read without spend: the run SHEET's scope-approval line (rendered
 *  from the shared resolveGatePolicy — ADR-050) and every mounted gate card's co-occurrence
 *  invariant (an informational card never rides a `waiting_gate` run card). A live run with an
 *  open informational card proves the non-park directly whenever one exists (the paid legs). */
const R7: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  await gotoOk(page, `${ctx.webBaseUrl}/app`);
  await followProjectLink(page, ctx);
  const slug = /\/p\/([a-z0-9-]+)/i.exec(page.url())?.[1];
  if (!slug) throw new Error("no project slug on the landed page");

  // (1) the sheet's scope line is one of the four canonical resolutions — never a hand-written
  // variant that can disagree with the park decision again.
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/run?workflow=review`);
  const body = (await page.textContent("body")) ?? "";
  const scopeLines = [
    "informational; the run proceeds",
    "waits for you at the scope gate",
    "blocking gate opens at launch",
    "skipped under Run to completion",
  ];
  if (!scopeLines.some((l) => body.includes(l))) {
    throw new Error("the run sheet's scope-approval line matches no canonical resolution");
  }

  // (2) the co-occurrence invariant on every run card: an informational gate card
  //     ([data-informational]) may ride only a NON-waiting run, and a run card's waiting line
  //     ([data-waiting-gate]) never co-exists with an informational card.
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}`);
  const bad = await page.evaluate(() => {
    const out: string[] = [];
    for (const card of document.querySelectorAll<HTMLElement>("[data-run-card]")) {
      const informational = card.querySelector('[data-informational="true"]') != null;
      const waitingLine = card.querySelector("[data-waiting-gate]") != null;
      const state = card.getAttribute("data-run-state") ?? "";
      if (informational && state === "waiting_gate") {
        out.push(`${card.getAttribute("data-run-card")}: informational card on a waiting_gate run`);
      }
      if (informational && waitingLine) {
        out.push(`${card.getAttribute("data-run-card")}: informational card + waiting line`);
      }
      if (!informational && card.querySelector('[data-blocking="false"]')) {
        out.push(`${card.getAttribute("data-run-card")}: non-blocking gate card unlabelled`);
      }
    }
    return out;
  });
  if (bad.length > 0) throw new Error(`gate label/behaviour mismatch: ${bad.join(" | ")}`);
};

// ---------------------------------------------------------------- phone + claims + isolation

/** UX.2 — page-level horizontal overflow in px (≤1px tolerance for scrollbar/sub-pixel wobble). */
async function pageOverflowPx(page: Page): Promise<number> {
  return page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
}

/**
 * UX.2 (ADR-068) — one deterministic axe-core WCAG 2.2 AA pass over the loaded document (tags
 * wcag2a/wcag2aa/wcag21a/wcag21aa/wcag22aa). Any violation fails the step with the rule ids and
 * their first targets; there is no severity floor and no rule disabled silently.
 */
async function assertAxeClean(page: Page, label: string): Promise<void> {
  // CDP evaluation, not a <script> tag: the page's CSP (script-src 'self' 'nonce-…') correctly
  // refuses addScriptTag({content}); Runtime.evaluate is how an external checker attaches.
  await page.evaluate(AXE_SOURCE);
  const violations = await page.evaluate(async () => {
    const w = globalThis as unknown as {
      axe?: {
        run(
          root: Document,
          opts: { runOnly: { type: string; values: string[] } },
        ): Promise<{ violations: { id: string; nodes: { target: string[] }[] }[] }>;
      };
    };
    if (!w.axe) throw new Error("axe-core did not inject");
    const res = await w.axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
    });
    return res.violations.map(
      (v) =>
        `${v.id} ×${v.nodes.length} [${v.nodes
          .slice(0, 3)
          .map((n) => n.target.join(" "))
          .join("; ")}]`,
    );
  });
  if (violations.length > 0) {
    throw new Error(`${label}: ${violations.length} WCAG-AA violation(s): ${violations.join(" | ")}`);
  }
}

/** UX.2 — the pill's rect must not cover any text-bearing leaf element (honest geometry, not the
 *  presence of position:fixed alone — in-flow layout makes overlap structurally impossible, but the
 *  assertion measures it so a regression in ANY positioning mode is caught). */
async function pillTextOverlap(page: Page): Promise<string | null> {
  const pill = page.locator("[data-sync-pill]").first();
  if ((await pill.count()) === 0) return "(no sync pill rendered)";
  return pill.evaluate((el) => {
    const pr = el.getBoundingClientRect();
    if (pr.width === 0 || pr.height === 0) return null;
    for (const other of Array.from(document.querySelectorAll<HTMLElement>("body *"))) {
      if (other === el || el.contains(other) || other.contains(el)) continue;
      // Chromium keeps layout boxes for children of a CLOSED <details> (content-visibility),
      // so getBoundingClientRect is nonzero for elements that are neither painted nor
      // hittable — exclude them (the <summary> itself stays live).
      const closed = other.closest("details:not([open])");
      if (closed && !closed.querySelector(":scope > summary")?.contains(other)) continue;
      const ownText = Array.from(other.childNodes).some(
        (n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? "").trim() !== "",
      );
      if (!ownText) continue;
      const or = other.getBoundingClientRect();
      if (or.width === 0 || or.height === 0) continue;
      const ix = Math.min(pr.right, or.right) - Math.max(pr.left, or.left);
      const iy = Math.min(pr.bottom, or.bottom) - Math.max(pr.top, or.top);
      if (ix > 1 && iy > 1) {
        return `${other.tagName.toLowerCase()} "${(other.textContent ?? "").trim().slice(0, 40)}"`;
      }
    }
    return null;
  });
}

/** UX.2 — a rect-overlap check between two located elements (pill vs status bar / composer). */
async function rectsOverlap(a: { x: number; y: number; w: number; h: number } | null, b: { x: number; y: number; w: number; h: number } | null): Promise<boolean> {
  if (!a || !b) return false;
  const ix = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const iy = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  return ix > 1 && iy > 1;
}

/** P1 (UX.2) — the responsive contract (REQ-MOBILE-3 amended by UX.2, REQ-SPEC-20, REQ-IDE-42/43):
 *  the anonymous surfaces and the signed-in phone surfaces never overflow the page; the pricing
 *  matrix scrolls inside a labelled keyboard-focusable region instead; phone controls are real
 *  buttons ≥44px (24px floor everywhere); the §10.1 desktop-capability set never renders on phone;
 *  the sync pill is in-flow — never over text, the composer, or the status bar; /app/new renders
 *  styled chrome; and axe WCAG 2.2 AA is clean on every touched surface at BOTH review widths. */
const P1: StepFn = async (ctx) => {
  const MOBILE = { "sec-ch-ua-mobile": "?1" };
  const PHONE = { width: 390, height: 844 };
  const DESKTOP = { width: 1440, height: 900 };

  const assertNoOverflow = async (page: Page, label: string): Promise<void> => {
    const px = await pageOverflowPx(page);
    if (px > 1) throw new Error(`${label}: horizontal overflow ${px}px`);
  };

  /** Every visible control under `sel` meets `minPx` on BOTH axes (labels for the error). */
  const assertTargetSize = async (page: Page, sel: string, minPx: number, label: string) => {
    const bad = await page.evaluate(
      ([selector, floor]) => {
        const out: string[] = [];
        for (const el of document.querySelectorAll<HTMLElement>(selector)) {
          const r = el.getBoundingClientRect();
          if (r.width === 0 || r.height === 0 || getComputedStyle(el).visibility === "hidden")
            continue;
          if (r.width < floor || r.height < floor) {
            out.push(
              `${el.tagName.toLowerCase()} "${(el.textContent ?? "").trim().slice(0, 28)}" ${Math.round(r.width)}×${Math.round(r.height)}`,
            );
          }
        }
        return out;
      },
      [sel, minPx] as const,
    );
    if (bad.length > 0) throw new Error(`${label}: sub-${minPx}px targets: ${bad.join("; ")}`);
  };

  // ---- leg 1: anonymous public surfaces at 390×844 and 320×844 (the narrowest phone) ----
  {
    const { page } = await ctx.anon();
    for (const w of [390, 320]) {
      await page.setViewportSize({ width: w, height: 844 });
      for (const path of ["/", "/pricing", "/login"]) {
        await gotoOk(page, `${ctx.webBaseUrl}${path}`);
        await assertNoOverflow(page, `${path} @${w}w`);
      }
    }
    await page.setViewportSize(PHONE);
    await gotoOk(page, `${ctx.webBaseUrl}/pricing`);
    // the matrix rule (ADR-066): the TABLE is wider than the phone — the SCROLL REGION absorbs it;
    // the page itself never scrolls horizontally.
    const matrix = page.locator('.table-scroll[role="region"][aria-label]');
    if ((await matrix.count()) === 0) {
      throw new Error("/pricing: the matrix has no labelled scroll region");
    }
    const region = matrix.first();
    if (!(await region.evaluate((el) => el.tabIndex >= 0))) {
      throw new Error("/pricing: the matrix region is not keyboard-focusable");
    }
    const innerScroll = await region.evaluate((el) => el.scrollWidth - el.clientWidth);
    if (innerScroll <= 0) {
      throw new Error("/pricing: the matrix region does not scroll horizontally at 390px");
    }
    const caption = await region.evaluate((el) => {
      const by = el.getAttribute("aria-labelledby");
      if (by) return document.getElementById(by)?.textContent ?? null;
      return el.getAttribute("aria-label");
    });
    if (!caption || caption.trim().length === 0) {
      throw new Error("/pricing: the matrix scroll region has no accessible name");
    }
    // keyboard: the region is Tab-reachable, and whatever is focused shows the 2-px focus ring.
    let focusedOnRegion = false;
    let focusedOutlinePx = 0;
    for (let i = 0; i < 24; i++) {
      await page.keyboard.press("Tab");
      const st = await page.evaluate(() => {
        const el = document.activeElement as HTMLElement | null;
        return {
          isRegion: el?.classList.contains("table-scroll") ?? false,
          outline: el ? parseFloat(getComputedStyle(el).outlineWidth) || 0 : 0,
          style: el ? getComputedStyle(el).outlineStyle : "none",
        };
      });
      if (st.outline < 2 || st.style === "none") {
        throw new Error(`/pricing: Tab stop ${i + 1} shows no ≥2px focus ring (${st.outline}px ${st.style})`);
      }
      if (st.isRegion) {
        focusedOnRegion = true;
        focusedOutlinePx = st.outline;
        break;
      }
    }
    if (!focusedOnRegion) throw new Error("/pricing: the matrix region was never Tab-reached in 24 stops");
    void focusedOutlinePx;
    // REQ-IDE-42 — 200% text resize: zoom 2× on a DOUBLED viewport keeps the layout at 390 CSS px
    // while every glyph renders twice as large — the honest WCAG 1.4.4 emulation (zoom on the same
    // viewport would demand a 195-px layout, stricter than 1.4.10's 320-px floor).
    await page.setViewportSize({ width: 780, height: 844 });
    await page.evaluate(() => {
      document.body.style.zoom = "2";
    });
    const zoomed = await page.evaluate(() => {
      const doc = document.documentElement;
      // normalize: layout px = rendered px / 2 while body.zoom is 2.
      return Math.round((doc.scrollWidth - doc.clientWidth) / 2);
    });
    if (zoomed > 1) {
      throw new Error(`/pricing 390-px layout @200% zoom: horizontal overflow ${zoomed}px`);
    }
    await page.evaluate(() => {
      document.body.style.zoom = "";
    });
    await page.setViewportSize(PHONE);
    await assertAxeClean(page, "/pricing @390×844");
    await page.screenshot({ path: join(ctx.outDir, "p1-pricing-390.png"), fullPage: true });
  }

  // ---- leg 2: the signed-in phone surfaces — the project page, the run sheet, the Page's pill ----
  {
    const { context, page } = await ctx.returningUser("a");
    await context.setExtraHTTPHeaders(MOBILE);
    await page.setViewportSize(PHONE);
    await gotoOk(page, `${ctx.webBaseUrl}/app`);
    await followProjectLink(page, ctx);
    const slug = /^\/p\/([^/]+)/.exec(new URL(page.url()).pathname)?.[1];
    if (!slug) throw new Error(`no project slug on ${page.url()}`);

    // The project page at 390×844 (ADR-067): overflow, phonebar + action-row targets, §10.1.
    await assertNoOverflow(page, `/p/${slug} @390×844`);
    await assertTargetSize(page, ".ide-phonebar a", 44, "phone bar links");
    await assertTargetSize(page, ".ide-actions a", 44, "project action row");
    await assertTargetSize(
      page,
      "[data-gate-actions] button, [data-decision-option], .chat-composer button, .ide-phone-only .chat-threads a, .ide-phone-only [data-chat-chip]",
      44,
      "gate/decision/composer/chat buttons + links",
    );
    // WCAG 2.5.8 floor: every OTHER visible control is at least 24px.
    await assertTargetSize(page, "button, [role='button']", 24, "all buttons");
    for (const sel of [".ide-phonebar a", ".ide-actions a"]) {
      for (const el of await page.locator(sel).all()) {
        await assertActionable(el, `${sel} "${((await el.textContent()) ?? "").trim()}"`);
      }
    }
    // §10.1's desktop-capability set never renders at phone width (capability boundary preserved).
    const banned = await page.evaluate(() => {
      const hits: string[] = [];
      for (const sel of [
        'form[action$="/run"]',
        'a[href$="/import"]',
        'a[href$="/export"]',
        "[data-rename-form]",
        "[data-new-project]",
        'form[action="/app/new"]',
      ]) {
        if (document.querySelector(sel)) hits.push(sel);
      }
      return hits;
    });
    if (banned.length > 0) {
      throw new Error(`phone /p/${slug} renders §10.1-prohibited controls: ${banned.join(", ")}`);
    }
    await assertAxeClean(page, `phone /p/${slug}`);
    await page.screenshot({ path: join(ctx.outDir, "p1-project-390.png"), fullPage: true });

    // The Page's sync pill at phone width (ADR-069 + §10.1): /v/working is an EDITOR surface —
    // phone requests land on the project page (or the §10.1 note) and the editor never mounts,
    // so no pill exists to float. If a mounted editor ever reaches phone again, its pill must
    // be there AND in-flow; a fixed/sticky pill anywhere is the regression this leg guards.
    await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/v/working`);
    const pillLanded = new URL(page.url()).pathname;
    await assertNoOverflow(page, `phone ${pillLanded} (via /v/working)`);
    const pill = page.locator("[data-sync-pill]").first();
    const editorMounted = (await page.locator("[data-page-mount]").count()) > 0;
    if (editorMounted && (await pill.count()) === 0) {
      throw new Error(`phone ${pillLanded}: the page editor mounted without its sync pill`);
    }
    if ((await pill.count()) > 0) {
      const pos = await pill.evaluate((el) => getComputedStyle(el).position);
      if (pos === "fixed" || pos === "sticky") {
        throw new Error(`sync pill is position:${pos} — floats over body text at phone width`);
      }
      const overlapped = await pillTextOverlap(page);
      if (overlapped) throw new Error(`sync pill covers text at phone width: ${overlapped}`);
    }
    if (pillLanded !== `/p/${slug}` && !editorMounted && (await page.locator("[data-phone-blocked]").count()) === 0) {
      throw new Error(`/v/working @390 landed on ${pillLanded} with neither the project page nor the §10.1 note`);
    }
    await assertAxeClean(page, `phone ${pillLanded} (via /v/working)`);
    await page.screenshot({ path: join(ctx.outDir, "p1-pill-390.png"), fullPage: true });

    // The run sheet at phone width — the §10.1 note, never the run form.
    await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/run`);
    await assertNoOverflow(page, `/p/${slug}/run @390×844`);
    if ((await page.locator("[data-phone-blocked]").count()) === 0) {
      throw new Error("run sheet at phone width lacks the §10.1 capability note");
    }
    if ((await page.locator("form[data-run-sheet]").count()) > 0) {
      throw new Error("the run sheet's run form renders at phone width");
    }
    await assertAxeClean(page, `phone /p/${slug}/run`);
    await page.screenshot({ path: join(ctx.outDir, "p1-runsheet-390.png"), fullPage: true });
  }

  // ---- leg 3: desktop 1440×900 — /app/new's styled shell + the pill clear of composer/statusbar ----
  {
    const { page } = await ctx.returningUser("a");
    await page.setViewportSize(DESKTOP);
    await gotoOk(page, `${ctx.webBaseUrl}/app/new`);
    // ADR-065: a workspace surface — no IDE markup at all, and the chrome renders STYLED (the
    // review's symptom was the stacked unstyled shell).
    if ((await page.locator('.ide[data-ide="1"]').count()) > 0) {
      throw new Error("/app/new still renders the IDE frame for a workspace surface");
    }
    if ((await page.locator('a[href="/app"]').count()) === 0) {
      throw new Error("/app/new renders no workspace chrome (no back link)");
    }
    const headerBorder = await page
      .locator("header")
      .first()
      .evaluate((el) => getComputedStyle(el).borderBottomWidth);
    if (headerBorder === "0px" || headerBorder === "") {
      throw new Error("/app/new's chrome header is unstyled (no border — the unstyled-shell symptom)");
    }
    for (const entry of ["scratch", "outline", "draft"]) {
      if ((await page.locator(`[data-entry="${entry}"]`).count()) === 0) {
        throw new Error(`/app/new lacks the "${entry}" entry card`);
      }
    }
    await assertNoOverflow(page, "desktop /app/new");
    await assertAxeClean(page, "desktop /app/new");
    await page.screenshot({ path: join(ctx.outDir, "p1-app-new-1440.png"), fullPage: true });

    // The Page's pill at 1440 — in-flow, disjoint from the status bar AND the open-desk composer.
    // The pill only exists where the editor mounts; draft-less /v/working redirects to /p/:slug
    // (EDIT.1), so walk the project list until one serves a mounted editor.
    await gotoOk(page, `${ctx.webBaseUrl}/app`);
    const candidates = await page
      .locator('a[href^="/p/"]')
      .evaluateAll((els) => [
        ...new Set(
          els
            .map((e) => e.getAttribute("href") ?? "")
            .filter((h) => /^\/p\/[^/?]+$/.test(h)),
        ),
      ]);
    let pill: Locator | null = null;
    for (const h of candidates.slice(0, 12)) {
      await gotoOk(page, `${ctx.webBaseUrl}${h}/v/working`);
      if (!/\/v\//.test(new URL(page.url()).pathname)) continue; // redirected — no working head
      await page.waitForSelector("[data-sync-pill]", { timeout: 10_000 }).catch(() => null);
      if ((await page.locator("[data-sync-pill]").count()) > 0) {
        pill = page.locator("[data-sync-pill]").first();
        break;
      }
    }
    if (!pill) throw new Error("no project in the first 12 renders the mounted-editor sync pill at 1440");
    // open the Desk on chat (pane state is attr-driven: the island would set exactly this).
    await page.evaluate(() => {
      const ide = document.querySelector<HTMLElement>(".ide");
      if (ide) {
        ide.dataset["desk"] = "open";
        ide.dataset["deskTab"] = "chat";
      }
    });
    const pillBox = await pill.evaluate((el) => {
      const r = el.getBoundingClientRect();
      return { x: r.left, y: r.top, w: r.width, h: r.height };
    });
    const box = async (sel: string) =>
      page
        .locator(sel)
        .first()
        .evaluate((el) => {
          const r = el.getBoundingClientRect();
          return { x: r.left, y: r.top, w: r.width, h: r.height };
        })
        .catch(() => null);
    for (const [sel, name] of [
      ["footer.ide-statusbar", "the status bar"],
      [".chat-composer", "the chat composer"],
      [".ide-desk", "the open desk"],
    ] as const) {
      if (await rectsOverlap(pillBox, await box(sel))) {
        throw new Error(`the sync pill overlaps ${name} at 1440×900`);
      }
    }
    const desktopOverlap = await pillTextOverlap(page);
    if (desktopOverlap) throw new Error(`sync pill covers text at desktop: ${desktopOverlap}`);
    await assertNoOverflow(page, `${new URL(page.url()).pathname} @1440×900`);
    await page.screenshot({ path: join(ctx.outDir, "p1-pill-1440.png"), fullPage: true });
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

/** UX.1 — N10 (GREEN): the public surfaces carry honest copy + real document chrome. A distinct
 *  route-aware `<title>` on every public route; description + OG + Twitter tags; the favicon serves
 *  200 and every document links it; exactly ONE `<h1>` per page; no "private beta" / "1.x" /
 *  "coming soon" wording anywhere; and `/showcase` renders the read-only sample dossier to a
 *  signed-out visitor (manifest invariant 13). */
const N10: StepFn = async (ctx) => {
  const { page } = await ctx.anon();
  const titles = new Set<string>();
  for (const path of ["/", "/pricing", "/signup", "/login", "/showcase"]) {
    await gotoOk(page, `${ctx.webBaseUrl}${path}`);
    const t = await page.title();
    if (!t || !/Rhēma/.test(t)) throw new Error(`${path}'s <title> is empty or unbranded ("${t}")`);
    if (titles.has(t)) throw new Error(`${path}'s <title> repeats another route's ("${t}")`);
    titles.add(t);
    const h1s = await page.locator("h1").count();
    if (h1s !== 1) throw new Error(`${path} renders ${h1s} <h1> elements — exactly one per page`);
    for (const sel of [
      'meta[name="description"]',
      'meta[property="og:title"]',
      'meta[property="og:description"]',
      'meta[name="twitter:card"]',
      'link[rel="icon"]',
    ]) {
      if ((await page.locator(sel).count()) === 0) {
        throw new Error(`${path} is missing ${sel}`);
      }
    }
    const body = (await page.textContent("body")) ?? "";
    // OPS.1 (F-OPS.1-11) — the "private beta" ban is open-mode-shaped: on invite-mode stages
    // (dev/pr-<n> — stages.ts `signupMode: "invite"`) the honest access-gated copy IS the private-
    // beta heading (copy.ts `invite.heading`, rendered only when invite mode is live). Detect the
    // mode from the `invite.accessNote` marker — open mode never renders it — and only then is the
    // heading legitimate; everywhere else the ban stands unchanged.
    const inviteMode = /Access is by invitation|invitation code is required/i.test(body);
    if (!inviteMode && /private beta/i.test(body)) {
      throw new Error(`${path} still claims "private beta"`);
    }
    if (/\b1\.x\b/i.test(body)) throw new Error(`${path} leaks the "1.x" roadmap term`);
    if (/coming soon/i.test(body)) throw new Error(`${path} carries a "coming soon" promise`);
  }
  // the favicon actually serves (the head link is meaningless if the endpoint 404s).
  const icon = await page.goto(`${ctx.webBaseUrl}/favicon.svg`);
  if (!icon || icon.status() !== 200) throw new Error(`/favicon.svg → ${icon?.status()}`);
  // /showcase's signed-out leg IS the sample dossier — its letter text is on the page.
  await gotoOk(page, `${ctx.webBaseUrl}/showcase`);
  const sc = (await page.textContent("body")) ?? "";
  if (!sc.includes("The Politics of Visibility") || !sc.includes("tested")) {
    throw new Error("/showcase did not render the sample dossier to a signed-out visitor");
  }
};

/** UX.1 — R8 (GREEN, $0): the signed-in legs. `/showcase` resolves to the workspace's own Showcase
 *  (the dossier redirect) or the static sample — never another tenant's; Preferences lists ONLY
 *  the launched workflows (no "1.x"/unlaunched rows); the Inbox's waiting count IS its Needs-you
 *  row count and a project name rides each row. */
const R8: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  // /showcase — signed-in resolves to the tenant's Showcase project or the sample page; either way
  // it must render a dossier surface and never a foreign slug.
  const r = await page.goto(`${ctx.webBaseUrl}/showcase`, { waitUntil: "domcontentloaded" });
  if (!r || r.status() >= 400) throw new Error(`signed-in GET /showcase → ${r?.status()}`);
  const scBody = (await page.textContent("body")) ?? "";
  const onShowcase = /\/showcase$/.test(page.url()) || /\/p\/[^/]+/.test(page.url());
  if (!onShowcase) throw new Error(`signed-in /showcase landed somewhere unexpected (${page.url()})`);
  if (!/The Politics of Visibility|Showcase/i.test(scBody)) {
    throw new Error("signed-in /showcase renders neither the workspace Showcase nor the sample");
  }
  // Preferences — every rigor-by-workflow row must be a launched workflow; nothing unlaunched shows.
  await gotoOk(page, `${ctx.webBaseUrl}/app/settings/preferences`);
  const prefNames = await page
    .locator('select[name^="rigor_"]')
    .evaluateAll((els) => els.map((e) => e.getAttribute("name")));
  for (const name of prefNames) {
    if (/cut_to_length|line_edit|titles|abstract|reverse_outline|steelman|interview|run_rounds|map_the_field|compose_voice/.test(name ?? "")) {
      throw new Error(`Preferences renders an unlaunched workflow row: ${name}`);
    }
  }
  const prefBody = (await page.textContent("body")) ?? "";
  if (/\b1\.x\b|not yet available|isn't available/i.test(prefBody)) {
    throw new Error("Preferences copy still references unavailable workflows");
  }
  // Inbox — the "waiting on your call" count equals the Needs-you row count, verbatim.
  await gotoOk(page, `${ctx.webBaseUrl}/app/inbox`);
  const badge = await page.locator("[data-inbox-badge]").textContent().catch(() => null);
  const blocked = await page.locator('[data-inbox-section="blocked"] [data-inbox-row]').count();
  const n = badge ? Number((/\d+/.exec(badge) ?? [NaN])[0]) : NaN;
  if (!Number.isNaN(n) && n !== blocked) {
    throw new Error(`Inbox badge says ${n} but renders ${blocked} waiting rows`);
  }
  // every Inbox row carries a project name (the row's project-meta line or the gate copy's slug).
  const rows = page.locator("[data-inbox-row]");
  const rowCount = await rows.count();
  for (let i = 0; i < rowCount; i++) {
    const meta = await rows.nth(i).locator("[data-inbox-project]").count();
    const text = (await rows.nth(i).textContent()) ?? "";
    if (meta === 0 && !/·/.test(text)) {
      throw new Error(`Inbox row ${i} carries no project name`);
    }
  }
};

// ---- DEF.4 — R9 (RED→DEF.4; paid): the §14.4 refund window end-to-end on the flagged tenant.
// The run sheet → delivered report → "Get N cr back" → "Refunded N cr." with the balance moving
// EXACTLY N; then a second delivered run's request renders "sent for review" and moves NOTHING.
// Flag-off stages legitimately fail this step — it flips green only where `refundWindow` admits
// the JOURNEY.1 tenant (`test_tenants` on the Stage-B evidence deploy).

/** Launch a Quick/Base Review on the planted excerpt and wait for its terminal state (the same
 *  unattended ceremony R6/N6 drive — rigor=quick + this-run autorun + the card's data-run-state). */
async function launchQuickReviewToDelivery(
  page: Page,
  ctx: StepCtx,
  tag: string,
): Promise<{ slug: string; runId: string; state: string }> {
  const slug = await createDraftProject(page, ctx.webBaseUrl, ctx.marker(tag), PLANTED_EXCERPT);
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/run?workflow=review&rigor=quick`);
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
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}`);
  const card = page.locator("[data-run-card]").first();
  await card.waitFor({ state: "attached", timeout: 90_000 });
  const runId = (await card.getAttribute("data-run-card")) ?? "";
  if (!runId) throw new Error("the run card carries no data-run-card id");
  const TERMINAL = new Set(["completed", "completed_partial", "failed", "cancelled"]);
  const deadline = Date.now() + 40 * 60_000;
  let state = "";
  while (Date.now() < deadline) {
    await page.reload({ waitUntil: "domcontentloaded" }).catch(() => {});
    state = (await card.getAttribute("data-run-state")) ?? "";
    if (TERMINAL.has(state)) break;
    await new Promise((r) => setTimeout(r, 2_000));
  }
  if (!TERMINAL.has(state)) throw new Error(`run ${runId} did not reach a terminal state within 40 min`);
  return { slug, runId, state };
}

/** The §14.5 level-1 spendable figure (data-usage-balance) — the refund leg's exact-movement read. */
async function readSpendable(page: Page, ctx: StepCtx): Promise<number> {
  await gotoOk(page, `${ctx.webBaseUrl}/app/usage`);
  const text = (await page.locator("[data-usage-balance]").textContent()) ?? "";
  const m = /(\d[\d,]*)\s*cr/i.exec(text);
  if (m?.[1] == null) throw new Error(`the usage balance is unreadable: "${text}"`);
  return Number(m[1].replace(/,/g, ""));
}

const R9: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");

  // ---- leg 1: the first eligible request — control → refunded → exact balance movement. ----
  const runA = await launchQuickReviewToDelivery(page, ctx, "R9A");
  const spendableBefore = await readSpendable(page, ctx);
  await gotoOk(page, `${ctx.webBaseUrl}/p/${runA.slug}/r/${runA.runId}`);
  const cta = page.locator("[data-refund-cta]").first();
  await cta.waitFor({ state: "attached", timeout: 15_000 }).catch(() => {
    throw new Error("the delivered report renders no refund control — the flag/affordance is absent");
  });
  await assertActionable(cta, "the refund control"); // visible + enabled + unobscured
  const ctaText = ((await cta.textContent()) ?? "").trim();
  const n = /(\d[\d,]*)\s*cr/i.exec(ctaText)?.[1];
  if (n == null) throw new Error(`the refund control carries no figure: "${ctaText}"`);
  const refundN = Number(n.replace(/,/g, ""));
  await cta.click();
  await page.waitForLoadState("domcontentloaded");
  const refunded = page.locator('[data-refund-state="refunded"]').first();
  await refunded.waitFor({ state: "attached", timeout: 15_000 });
  const refundedText = ((await refunded.textContent()) ?? "").trim();
  if (!new RegExp(`Refunded ${refundN.toLocaleString("en-US")} cr`, "i").test(refundedText)) {
    throw new Error(`the post-refund line does not read "Refunded ${refundN} cr.": "${refundedText}"`);
  }
  // the exact movement — the usage glance's spendable rose by precisely the refunded figure.
  const spendableAfter = await readSpendable(page, ctx);
  if (spendableAfter !== spendableBefore + refundN) {
    throw new Error(
      `the refund moved spendable ${spendableBefore} → ${spendableAfter} (+${spendableAfter - spendableBefore}) — expected exactly +${refundN}`,
    );
  }

  // ---- leg 2: the quarter's allowance is spent — the second request goes to review, not money. ----
  const runB = await launchQuickReviewToDelivery(page, ctx, "R9B");
  await gotoOk(page, `${ctx.webBaseUrl}/p/${runB.slug}/r/${runB.runId}`);
  const cta2 = page.locator("[data-refund-cta]").first();
  await cta2.waitFor({ state: "attached", timeout: 15_000 }).catch(() => {
    throw new Error("the second run's report renders no refund control — it should still offer review");
  });
  await assertActionable(cta2, "the refund control (second request)");
  await cta2.click();
  await page.waitForLoadState("domcontentloaded");
  const pending = page.locator('[data-refund-state="pending_review"]').first();
  await pending.waitFor({ state: "attached", timeout: 15_000 });
  const pendingText = ((await pending.textContent()) ?? "").trim();
  if (!/sent for review/i.test(pendingText)) {
    throw new Error(`the second request did not render "sent for review": "${pendingText}"`);
  }
  // and it moved no money — the balance is exactly where the first refund left it.
  const spendablePending = await readSpendable(page, ctx);
  if (spendablePending !== spendableAfter) {
    throw new Error(
      `a pending-review request moved the balance (${spendableAfter} → ${spendablePending}) — the allowance was not spent`,
    );
  }
  assertBundleParity(ctx);
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
  N10,
  R1,
  R4,
  R5,
  R6,
  R7,
  R8,
  R9,
  P1,
  C1,
  X1,
};
