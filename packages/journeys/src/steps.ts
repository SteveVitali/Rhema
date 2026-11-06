// JOURNEY.1 — the step implementations (one function per registry row). Green steps are the paid-
// baseline the ticket owns (N2 sign-in, N7 dossier render, R1 list, R5 export, X1 isolation); red
// steps are real assertions whose failures are owed to their owners — implemented so a flip is a
// true signal, never a stub.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import type { Locator, Page } from "playwright";
import type { StepCtx, StepFn } from "./runner.js";
import { assertActionable, clickActionable } from "./occlusion.js";
// SPA.6 (REQ-VFY-3/4) — the settle contract: journeys wait on `data-mounted`/`data-route`, never
// on `domcontentloaded`/`form[action]`/inline-script internals (the markers exist on BOTH
// renderers, so the same probe proves the SSR fallback AND the flagged SPA).
import {
  gotoOk as gotoSettled,
  reloadSettled,
  settleClientNav,
  settleNav,
  navCountOf,
  type SettleScope,
} from "./settle.js";
// ONB.1 — N1/N3 must sign in through the real magic link INSIDE the anonymous context that holds
// the IndexedDB draft (sessions.signIn mints a NEW context — a separate storage partition where
// the hold does not exist). The identities are still test-mailbox-only.
import { freshIdentity, assertTestIdentity } from "./session.js";
import { ensureJrnaPaidFixture } from "./fixture-substrate.js";
import { cogsLeversFor } from "./registry.js";
// ACT.1 — the journey asserts against the SHIPPED config (the same typed pricing.json the
// surfaces render from), never a second literal copy of the trial's figures.
import {
  PRICING,
  PUBLIC_CLAIM_COPY,
  REFUND_WINDOW_DAYS,
  USER_REFUNDABLE_RUN_STATES,
  trialIncludedNote,
} from "@rhema/contracts";
// UX.2 (ADR-068) — axe-core as the WCAG 2.2 AA checker: the prebuilt script source injects into the
// page (never bundled into shipped artifacts; journeys is dev tooling, MPL-2.0 exception checked in).
import axeCore from "axe-core";

/** The injectable axe build (UMD — `page.addScriptTag({content})`, not an import in the page). */
export const AXE_SOURCE = axeCore.source;

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

/** CITE.1 — a committed copy of packages/protocols/fixtures/_evals/golden-op-ed.md (the canonical
 *  "golden" op-ed Leg 3 reviews). N11 drives a Quick/Base Review on it and chip-checks the
 *  delivered dossier. Kept local so the journeys package stays self-contained. */
const GOLDEN_OP_ED = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "../fixtures/golden-op-ed.md"),
  "utf8",
);

// ---------------------------------------------------------------- helpers

/** The content-type each `/assets/` extension family must answer with — mirrors the server's
 *  `SPA_ASSET_TYPES` + the island routes' `text/javascript` (REQ-TL-13: the SPA manifest's nested
 *  js/css/font/image assets ride the same ledger). An extension outside the map still must 200;
 *  the type assert keys only on families the server serves. */
const ASSET_CONTENT_TYPE: Readonly<Record<string, string>> = {
  js: "javascript",
  css: "text/css",
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  webp: "image/webp",
  woff2: "font/woff2",
  json: "application/json",
};

/** Bundle-parity leg (PR-J4; REQ-TL-13): every served `/assets/**` response came back 200 with the
 *  content-type its extension family carries — island `/assets/<entry>.js`, SPA manifest assets
 *  under `/assets/spa/**`, and the self-hosted fonts — and the visited pages produced no console
 *  error / failed request (deliverable 7's full contract). */
export function assertBundleParity(ctx: StepCtx): void {
  const bad = ctx.assetHits.filter((h) => {
    if (h.status !== 200) return true;
    const ext = /\.(\w+)(?:[?#]|$)/.exec(new URL(h.url).pathname)?.[1];
    const expected = ext != null ? ASSET_CONTENT_TYPE[ext] : undefined;
    return expected != null && !(h.contentType ?? "").includes(expected);
  });
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

/** The canonical nav: status check, then the settle markers. The scope derives from the target
 *  URL — every call site navigates to the web origin, so the markers apply unconditionally; the
 *  `data-renderer` assert rides the runner's document-response listener (REQ-VFY-7). */
async function gotoOk(page: Page, url: string, scope?: SettleScope): Promise<void> {
  await gotoSettled(page, url, scope ?? { webBaseUrl: url });
}

/** Create a minimal scratch project and return its slug. R7HOME.2b (REQ-HOME-3) — the create is
 *  one `POST /app/new {entry:"scratch"}` (no dialog); the pasted arm rides `createDraftProject`'s
 *  real two-step ingest onto the blank head. */
async function createScratchProject(
  page: Page,
  ctx: StepCtx,
  name: string,
  paste?: string,
): Promise<string> {
  if (paste) return createDraftProject(page, ctx.webBaseUrl, ctx.marker(name), paste);
  const created = (await (
    await page.request.post(`${ctx.webBaseUrl}/app/new`, {
      headers: { "content-type": "application/json" },
      data: { entry: "scratch", title: ctx.marker(name) },
    })
  ).json()) as { redirect?: string };
  const m = /\/p\/([a-z0-9-]+)/i.exec(created.redirect ?? "");
  if (!m?.[1])
    throw new Error(`scratch project did not redirect to /p/<slug> (got ${JSON.stringify(created)})`);
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
    // a document nav (SSR) or a client nav (SPA) — the settle contract covers both.
    await settleNav(page, ctx);
    return;
  }
  const href = await row.getAttribute("href");
  if (!href) throw new Error("project link has no href");
  await gotoOk(page, `${ctx.webBaseUrl}${href}`, ctx);
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
    await gotoOk(page, `${ctx.webBaseUrl}${path}`, ctx);
    // REQ-VFY-4 — the auth form is located by the field it carries, never its POST action string.
    const authForm = `form:has(input[name="code"])`;
    const code = page.locator(`${authForm} input[name="code"]`);
    if ((await code.count()) === 0) {
      throw new Error(`${path} renders no invitation-code field at all`);
    }
    const required = await code.first().getAttribute("required");
    if (required === null) {
      // open mode — the email field must come first, and the code input must sit inside a
      // (closed) <details> disclosure — never bare on the form.
      const first = page.locator(`${authForm} input:visible`).first();
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
      const first = page.locator(`${authForm} input:visible`).first();
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
/** VERIF.2 — fill the signup form's `code` field when the run carries `--invite-code`, mirroring
 *  `JourneySessions.mint`: invite-mode forms render it required+visible; open-mode hides it in a
 *  `<details>` disclosure a human would open. No code ⇒ leave the form untouched (open-mode prod
 *  behaves exactly as before). */
async function fillInviteCodeIfScoped(page: Page, ctx: StepCtx): Promise<void> {
  if (!ctx.inviteCode) return;
  const codeInput = page.locator('input[name="code"]');
  if (!(await codeInput.isVisible())) {
    const disclosure = page.locator('details:has(input[name="code"]) > summary');
    if (await disclosure.isVisible()) await disclosure.click();
  }
  await codeInput.fill(ctx.inviteCode);
}

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
  // VERIF.2 (F-VERIF.2-5) — invite-mode stages (every preview: `signupMode:"invite"`, previews
  // never self-serve) require the seeded code on the form's real field — same wire a human
  // produces, same disclosure rule as the session mint.
  await fillInviteCodeIfScoped(page, ctx);
  const sentAt = Math.floor(Date.now() / 1000) - 30;
  await page.click('button[name="method"][value="magic_link"]');
  await page.waitForSelector('[role="status"]', { timeout: 45_000 });
  const link = await ctx.mailbox.awaitMagicLink(email, sentAt, 120_000);
  // the magic link is the one cross-auth nav — status + the settle markers (REQ-VFY-4), never a
  // bare load-state wait.
  await gotoOk(page, link, ctx);
  // post-auth the intent lands on /app/new?entry=draft&held=1 — R7HOME.2b: the leaf issues the ONE
  // blank create and hands the intent to the new project's import surface (`?held=1`), which
  // hydrates the hold into the file input — the FIRST hydrated load.
  await page.waitForURL(/\/p\/[^/]+\/import/, { timeout: 30_000 });
  const name = await awaitHeldFile(page);
  if (name !== "n1-held-draft.md") throw new Error(`post-signin hydration attached ${JSON.stringify(name)}`);
  // …and two further /app/new loads — the hold persists, the input re-populates on each new
  // project's import surface (ONB.1: no claim-on-attach; a hold dies only to a confirmed
  // consumption or Discard).
  for (let visit = 1; visit <= 2; visit++) {
    await gotoOk(page, `${ctx.webBaseUrl}/app/new?entry=draft&held=1`);
    await page.waitForURL(/\/p\/[^/]+\/import/, { timeout: 30_000 });
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
  await fillInviteCodeIfScoped(page, ctx);
  const sentAt = Math.floor(Date.now() / 1000) - 30;
  await page.click('button[name="method"][value="magic_link"]');
  await page.waitForSelector('[role="status"]', { timeout: 45_000 });
  const link = await ctx.mailbox.awaitMagicLink(email, sentAt, 120_000);
  await gotoOk(page, link, ctx);
  // R7HOME.2b — post-auth the held intent lands on the NEW project's import surface (`?held=1`
  // through the immediate create), which hydrates the hold.
  await page.waitForURL(/\/p\/[^/]+\/import/, { timeout: 30_000 });
  if ((await awaitHeldFile(page)) !== "n3-held.md") {
    throw new Error("the held file did not hydrate on the post-auth load");
  }
  // submit → the conversion preview must render READY inside the §13.5 20 s bound. REQ-VFY-4
  // re-spec: wait on the hook (`data-conversion-form`), not the POST action — the pending page
  // re-polls under either renderer (SSR meta-refresh; the SPA's client poll).
  const t0 = Date.now();
  await page.click('button[type="submit"], button:not([type])');
  await page.waitForSelector("[data-conversion-form]", { timeout: 20_000 });
  const ms = Date.now() - t0;
  if (ms > 20_000) throw new Error(`preview took ${ms}ms (> 20 s)`);
  // Create → the project lands. The hold dies to the confirmed submit (the import surface's
  // server-confirmed consumption — the `?hc=` handshake's replacement), so a return trip through
  // /app/new lands on a FRESH project's import page with an EMPTY file input.
  await page.click('[data-conversion-action="create"]');
  await page.waitForURL(/\/p\/[a-z0-9-]+/i, { timeout: 30_000 });
  await settleNav(page, ctx);
  await gotoOk(page, `${ctx.webBaseUrl}/app/new?entry=draft&held=1`);
  await page.waitForURL(/\/p\/[^/]+\/import/, { timeout: 30_000 });
  await page.waitForTimeout(2_000); // hydration is async — give it a beat, then assert
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

/** The run sheet's estimate-box figure + band for a lever/inputs override (`?words=`/`?claims=`/`?tier=`/`?rigor=`).
 *  MAINT.3 (D-OBS.1-3 N4) — an entitled trial tenant renders the §14.3 `Included` variant: no
 *  `[data-credits-line]`. The sheet's recompute payload (`[data-estimate-matrix]` — the typed JSON
 *  embed, §5.6 item 2) carries the SAME lever matrix the funded variant prints — read the cell for
 *  the resolved rigor|tier|toggles exactly as the recompute does. The assertion is unchanged: the
 *  figure the run would actually be estimated at, never a fabricated number. */
async function sheetFigure(
  page: Page,
  ctx: StepCtx,
  slug: string,
  query: string,
): Promise<{ credits: number; band: { low: number; high: number } | null }> {
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/run?workflow=review&${query}`);
  // Post-settle the estimate-box variant is final — probe with count(), never a waiting
  // textContent: the §14.3 Included variant carries no data-credits-line and a waiting read
  // would burn the whole timeout before the fallback could run (ACT.1 trial tenants).
  const creditsEl = page.locator("[data-credits-line]").first();
  const timeEl = page.locator("[data-time-line]").first();
  const creditsLine = ((await creditsEl.count()) > 0 ? await creditsEl.textContent() : null) ?? "";
  const timeLine = ((await timeEl.count()) > 0 ? await timeEl.textContent() : null) ?? "";
  if (creditsLine) return { credits: creditsOf(creditsLine), band: bandOf(timeLine) };
  if ((await page.locator("[data-included='true']").count()) === 0) {
    throw new Error(`run sheet renders neither a credits line nor the Included variant`);
  }
  // REQ-VFY-4 re-spec: read the TYPED embed (`<script type="application/json" data-estimate-
  // matrix>` — the same lever matrix the SPA's recompute consumes), never the inline `var R=`
  // script's internals.
  const cell = await page.evaluate(() => {
    const embed = document.querySelector('script[type="application/json"][data-estimate-matrix]');
    if (!embed?.textContent) return null;
    const R = JSON.parse(embed.textContent) as {
      modelTier: string;
      cells: Record<string, { e: number; lo: number; hi: number }>;
    };
    const rig = (document.querySelector("input[name=rigor]:checked") as HTMLInputElement | null)?.value;
    const tier =
      (document.querySelector("select[name=modelTier]") as HTMLSelectElement | null)?.value ?? R.modelTier;
    const toggles = [...document.querySelectorAll("input[name^='toggle.']:checked")]
      .map((b) => (b as HTMLInputElement).name.slice(7))
      .sort()
      .join(",");
    return R.cells[`${rig}|${tier}|${toggles}`] ?? null;
  });
  if (!cell) throw new Error(`Included sheet: no recompute cell for the resolved levers`);
  return { credits: Math.round(cell.e), band: bandOf(timeLine) ?? { low: cell.lo, high: cell.hi } };
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

  // 1 — the create flow's protocol estimates at their labelled typical lengths. R7HOME.2b retired
  // the sheet's cards (the create is one POST now); the SAME `GET /bff/app/new` twin carries the
  // api-computed typical Review figures verbatim — the estimate surface the comparison needs.
  const twin = (await (
    await page.request.get(`${ctx.webBaseUrl}/bff/app/new`)
  ).json()) as {
    newProject?: { protocols?: { id: string; typicalWords?: number; typicalReviewCredits?: number }[] | null };
  };
  const cards = (twin.newProject?.protocols ?? [])
    .filter((p): p is { id: string; typicalWords: number; typicalReviewCredits: number } =>
      typeof p.typicalReviewCredits === "number" && typeof p.typicalWords === "number" && p.typicalWords > 0)
    .map((p) => ({ id: p.id, text: `${p.typicalReviewCredits} credits`, words: p.typicalWords }));
  const priced = cards;
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

  // type into the live doc — the keystroke IS the fork trigger (2 s debounce + close/re-auth loop).
  // Click a text block, never the view's geometric center: for short docs the center lands on the
  // `contenteditable="false"` front-matter <pre>, a NodeSelection that swallows keystrokes (the
  // ARMB.2 prod walk: no transaction → nothing synced → the frozen-head fork never fired).
  await page.locator("[data-page-view] p").last().click();
  await page.keyboard.press("End");
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
  // the Versions sidebar item IS the /v/working entry (R7HOME.2b — /p/:slug IS the head draft now;
  // the retired "Edit source" link's destination). Click it, never type the URL.
  const edit = page.locator('[data-project-item="versions"]').first();
  // SPA timing: the URL changes on the client-side nav while the leaf's twin is still loading —
  // the affordance attaches on the first data paint (~1 s live). Wait for it, never a bare count.
  await edit.waitFor({ state: "attached", timeout: 15_000 }).catch(() => undefined);
  if ((await edit.count()) === 0) throw new Error("the project page has no Versions affordance");
  await edit.click();
  await page.waitForURL(/\/v\/working/, { timeout: 15_000 });
  // a 404 here renders no [data-page-root] — n8TypeForkSave's selector wait is the assertion
  await n8TypeForkSave(ctx, page, slug, `/p/${slug}/v/working`, "import");

  // ---------- leg B — a reviewed (or frozen-lineage) locked version on jrn-a ----------
  const { page: ret } = await ctx.returningUser("a");
  await gotoOk(ret, `${ctx.webBaseUrl}/app`);
  // SPA timing: /app's project rows paint on the twin's data paint, not on data-mounted — read
  // the link set only after the leaf attaches (an empty workspace lapses into a legit empty scan).
  await ret
    .locator('a[href^="/p/"]')
    .first()
    .waitFor({ state: "attached", timeout: 15_000 })
    .catch(() => undefined);
  const allHrefs = await ret.locator('a[href^="/p/"]').evaluateAll((els) =>
    [...new Set(els.map((e) => (e as HTMLAnchorElement).getAttribute("href") ?? ""))],
  );
  // `?rename=1`/hash variants are the same project — a bare `[^/]+` filter lets them consume the
  // scan window and push a real candidate (e.g. /p/showcase) past the slice's end.
  const hrefs = allHrefs.filter((h) => /^\/p\/[^/?#]+$/.test(h));
  // VERIF.1 — the window itself is the next drift class: a long-lived tenant's accumulated rows
  // (duplicated showcase copies, per-run scratch projects) push `/p/showcase` past the slice —
  // jrn-a carried 19 rows on 2026-10-15 and the leg never reached its designed fallback
  // substrate, dying on a false "no substrate" FAIL. Pin the Showcase to the END of the scan
  // window: a real reviewed-frozen head still wins the literal leg first (read-only rows only
  // set the dossier fallback and `continue`), and the guaranteed-fallback probe can never fall
  // off the tail again.
  const rest = hrefs.filter((h) => h !== "/p/showcase");
  const scanOrder = hrefs.includes("/p/showcase") ? [...rest.slice(0, 11), "/p/showcase"] : rest;
  // dossier links can also ride the /app rows directly (latestReviewRunId cards)
  const dossierHrefs = allHrefs.filter((h) => /^\/p\/[^/]+\/review\/[^/]+/.test(h));
  let reviewed: { slug: string; frozenN: number } | null = null;
  let fallbackReviewed: { slug: string; frozenN: number } | null = null;
  let showcaseDossier: string | null = null;
  for (const href of scanOrder.slice(0, 12)) {
    await gotoOk(ret, `${ctx.webBaseUrl}${href}`);
    const slug = href.split("/")[2] ?? "";
    // SPA timing: data-mounted settles on the route match while a useQuery leaf still paints its
    // skeleton — the host/rail/empty-state attach on the twin's data paint. Bare counts read the
    // pending DOM and miss every affordance (the ARMB.2 prod walk: leg-B scanned skeletons).
    await ret
      .locator("[data-page-host], li[data-version-chip], [data-ide-state]")
      .first()
      .waitFor({ state: "attached", timeout: 15_000 })
      .catch(() => undefined);
    // a read-only Page (the Showcase, or a head held by a live run) is not a candidate — but a
    // read-only page's dossier may be the Showcase (the duplicate fallback's substrate)
    if ((await ret.locator('[data-page-host][data-readonly="1"]').count()) > 0) {
      const dossierLink = ret.locator('a[href*="/review/"]').first();
      if (await dossierLink.count()) {
        const dh = await dossierLink.getAttribute("href");
        if (dh) {
          await gotoOk(ret, `${ctx.webBaseUrl}${dh}`);
          const banner = ret.locator("[data-showcase-banner]").first();
          await banner.waitFor({ state: "attached", timeout: 15_000 }).catch(() => undefined);
          if ((await banner.count()) > 0) showcaseDossier = dh;
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
      const banner = ret.locator("[data-showcase-banner]").first();
      await banner.waitFor({ state: "attached", timeout: 15_000 }).catch(() => undefined);
      if ((await banner.count()) > 0) {
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
    const dup = ret.locator("[data-showcase-banner] [data-duplicate-form] button").first();
    await dup.waitFor({ state: "attached", timeout: 15_000 }).catch(() => undefined);
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
  // REQ-VFY-4 exception: the Stripe-hosted checkout is a FOREIGN origin — the settle markers do
  // not apply; the raw load-state wait + host check is the probe (settle helpers no-op there).
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
  // SPA.16 re-spec: the probes settle on the manifest hooks, not form-element mechanics — under the
  // flipped surface the delegated submit rides the JSON branch and `navigateDocument` performs the
  // hand-off; `waitForURL` catches it either way (a real document navigation in both renderers).
  const { page: subscribePage } = await ctx.freshUser("n9");
  await gotoOk(subscribePage, `${webBase}/app/settings/billing`);
  await subscribePage.selectOption(
    "[data-subscribe-form='writer'] select[name='cycle']",
    "monthly",
  );
  await n9ClickToStripe(
    ctx,
    subscribePage,
    subscribePage.locator("[data-subscribe-form='writer'] button[type='submit']"),
    "N9 billing Choose Writer",
    [/Writer/i, /\$20(?:\.00)?/],
  );

  // Entries 2–4 — the funded paid test tenant (jrn-a): top-up, Portal, and the run-sheet Payment Link.
  const { page } = await ctx.returningUser("a"); // flagged by workspaces.is_test too
  // R6DEP.4 — the ~26 h test-tenant purge strands the BILL.3 fixture sub on the dead account every
  // cycle (§14.2's `topups_require_plan` is correct on the re-minted free tier — Entry 2's missing
  // [data-topup-form] is substrate drift, not a product defect). Under a bound DSN the leg
  // re-seats the writer fixture on the CURRENT account first — self-healing, same arm as the
  // dossier seeds. Unbound ⇒ no-op and the leg keeps its honest failure mode.
  await ensureJrnaPaidFixture();
  await gotoOk(page, `${webBase}/app/settings/billing`);

  // Entry 2 — Billing → Buy 1,000 credits: Checkout top-up session, $10 / 1,000 credits.
  await n9ClickToStripe(
    ctx,
    page,
    page.locator("[data-topup-form='topup_10'] button[type='submit']"),
    "N9 billing Buy 1,000 credits",
    [/1,?000/i, /\$10(?:\.00)?/],
  );

  // Entry 3 — Billing → Portal's honest precondition: the Portal needs a `stripe_customer_id`, which
  // only a COMPLETED checkout mints (Stripe creates the Customer at session confirmation — a real
  // payment, operator-paused under HUMAN-H7). At $0 the test tenant has none, so the portal form must
  // NOT mount and the honest "no card on file" note renders instead. The hosted-portal leg itself is
  // carried in D-BILL.3-1 (it is only reachable after a real purchase).
  await gotoOk(page, `${webBase}/app/settings/billing`);
  if ((await page.locator("[data-portal-form]").count()) !== 0) {
    // A customer-bearing tenant reaches the hosted portal — keep the assertion honest both ways.
    await n9ClickToStripe(
      ctx,
      page,
      page.locator("[data-portal-form] button[type='submit']"),
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
  // the launch POST's doc nav (SSR) or mutation re-render (SPA) — settle on the markers.
  await settleNav(page, ctx);
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
  // R7HOME.2b (REQ-HOME-3) — the draft-paste ingest's home moved: one `POST /app/new` creates the
  // blank project (no dialog), then the project's own import surface (`/p/:slug/import`) runs the
  // same two-step conversion preview → Create onto the blank head (235's overwrite rule).
  const created = (await (
    await page.request.post(`${webBaseUrl}/app/new`, {
      headers: { "content-type": "application/json" },
      data: { entry: "scratch", title },
    })
  ).json()) as { redirect?: string };
  const slug = /^\/p\/([^/?]+)/.exec(created.redirect ?? "")?.[1];
  if (!slug) throw new Error(`scratch create did not land on /p/<slug> (got ${JSON.stringify(created)})`);
  await gotoOk(page, `${webBaseUrl}/p/${slug}/import`, { webBaseUrl });
  await page.fill('textarea[name="paste"]', text);
  await page.click('form button[type="submit"], form button:not([type])');
  // pending → re-poll (5 s cadence) → preview: wait for the preview's Create control. A cold
  // convert Job runs ~2.5–4 min (PRB.21's own note), so the budget is 5 min — never a stale page.
  const create = page.locator('[data-conversion-action="create"]').first();
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

/**
 * R5ECON.2 (REQ-ECON-11) — install the registry's declared `cogsLevers` pin on a page's launch
 * POSTs. When the step's registry row pins a lever (N6/R4's `testCheapRoute:false` — model
 * judgment is the assert, so the `COGS_LEVERS_TEST` default-ON arm must never reach the leg), this
 * intercept merges the pin into the POST body the real click produces: a JSON body gets the key
 * merged in, a urlencoded form body gets the field appended — the same `cogsLevers` wire name the
 * BFF forwards and the api resolves (is_test-only). The pin lands at the wire rather than the DOM
 * so the launch stays the verbatim user path on BOTH renderers. No pin ⇒ no intercept.
 */
async function pinCogsLevers(page: Page, stepId: string, pathRe: RegExp): Promise<void> {
  const pin = cogsLeversFor(stepId);
  if (!pin) return;
  await page.route(pathRe, async (route) => {
    const req = route.request();
    if (req.method() !== "POST") return route.continue();
    try {
      const type = req.headers()["content-type"] ?? "";
      if (type.includes("application/json")) {
        const body = {
          ...(JSON.parse(req.postData() ?? "{}") as Record<string, unknown>),
          cogsLevers: pin,
        };
        return route.continue({ postData: JSON.stringify(body) });
      }
      const body = `${req.postData() ?? ""}&cogsLevers=${encodeURIComponent(JSON.stringify(pin))}`;
      return route.continue({ postData: body });
    } catch {
      return route.continue();
    }
  });
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
  // R5ECON.2 (REQ-ECON-11) — the registry pins this leg `testCheapRoute:false`: the planted-error
  // verdict is the model-judgment assert, so the cheap-route arm must never reach the launch even
  // when COGS_LEVERS_TEST defaults it ON for the test tenant.
  await pinCogsLevers(page, "N6", /\/p\/[^/]+\/run(?:\?|$)/);
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
  await settleNav(page, ctx);
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
      await settleNav(page, ctx);
    } else {
      const href = await row.getAttribute("href");
      if (!href) throw new Error("dossier link has no href");
      await gotoOk(page, `${ctx.webBaseUrl}${href}`, ctx);
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
  await createScratchProject(page, ctx, "R1PROJ");
  await gotoOk(page, `${ctx.webBaseUrl}/app`);
  const heading = page.locator('h1, h2, [role="heading"]', { hasText: "Your projects" });
  if ((await heading.count()) === 0) throw new Error('project list heading "Your projects" absent');
  const rowHit = page.locator(`text=${title}`);
  // R7HOME.1 — the list is always expanded (no collapsed group to open); the row is either
  // present or the leg fails.
  if ((await rowHit.count()) === 0) {
    throw new Error(`project "${title}" not listed`);
  }
  assertBundleParity(ctx);
};

/** R4 (RED→RUN.1; paid) — a chat turn answers; Send is actionable at 1440×900 and phone width. */
const R4: StepFn = async (ctx) => {
  const { page, context } = await ctx.returningUser("a");
  await page.setViewportSize({ width: 1440, height: 900 });
  // R5ECON.2 (REQ-ECON-11) — the registry pins this leg `testCheapRoute:false` (the answer's
  // quality IS the assert): the turn's chat/turns POST carries the opt-out even when
  // COGS_LEVERS_TEST defaults the arm ON.
  await pinCogsLevers(page, "R4", /\/p\/[^/]+\/chat\/turns(?:\?|$)/);
  await gotoOk(page, `${ctx.webBaseUrl}/app`);
  await followProjectLink(page, ctx);
  // RUN.1 — the desk/panel region renders closed unless a run is live; on the R7a surface ⌘J
  // opens the Desk, on the R7b surface `]` opens the right panel (the `data-panel` attr marks
  // the new shape — this leg must walk both during the merge→250 window).
  const ide = page.locator(".ide").first();
  if ((await ide.getAttribute("data-desk")) !== "open") {
    const r7b = (await ide.getAttribute("data-panel").catch(() => null)) != null;
    await page.keyboard.press(r7b ? "]" : "Control+j");
    await page.waitForSelector('.ide[data-desk="open"], .ide[data-panel="open"]', { timeout: 5_000 });
    await page.locator('[data-ide-desk-tab="chat"], [data-ide-panel-tab="chat"]').first().click();
  }
  const input = page.locator('form[data-chat-composer] textarea[name="message"]').first();
  if ((await input.count()) === 0) throw new Error("no chat composer on the project page");
  const send = page.locator('form[data-chat-composer] button[type="submit"]').first();
  await assertActionable(send, "chat Send @1440×900"); // RUN.1 — was occluded by footer.ide-statusbar
  await input.fill(`${ctx.marker("CHAT")} — one-word reply please`);
  await send.click();
  await settleNav(page, ctx);
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
    userAgent: IPHONE_USER_AGENT,
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  try {
    const pp = await phone.newPage();
    await gotoOk(pp, page.url(), ctx);
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
      '[data-duplicate-form] button[type="submit"], [data-duplicate-form] button:not([type])',
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
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}`, ctx);
  // REQ-VFY-4 — the export surface is located by its attr hook on both renderers (SPA.17:
  // presence-style — F7's `[attr]` grammar, never a tag+value pin the React port can't hold).
  const exportForm = page.locator("[data-export-form]");
  if ((await exportForm.count()) === 0) {
    // the dialog may be a /p/:slug/export page — try the direct route.
    await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/export`, ctx);
  }
  const download = page.waitForEvent("download", { timeout: 20_000 }).catch(() => null);
  const resp = page
    .waitForResponse(
      (r) => /\/export$/.test(new URL(r.url()).pathname) && r.request().method() === "POST",
      { timeout: 20_000 },
    )
    .catch(() => null);
  const submit = page
    .locator('[data-export-form] button[type="submit"], [data-export-form] button:not([type])')
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
  await settleNav(page, ctx);
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
      // REQ-VFY-4 — the remount assert: reload re-settles on the markers (SSR serve AND SPA shell).
      await reloadSettled(page, ctx).catch(() => undefined);
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
// —— SPA.6 (REQ-VFY-8; design/27 F9): P1 is split per-surface so `--surface` gates exactly the legs
//    a flip touches (`--steps P1` still selects the whole family by id-prefix). The probes are the
//    composite's verbatim; shared setup/assert helpers are hoisted.
/** The one mobile UA the phone-capability legs ride (FIX.1 / REQ-FIX-P1D): `sec-ch-ua-mobile`
 *  injected through `setExtraHTTPHeaders` LOSES to Chromium's own desktop UA-CH on the wire —
 *  proven live 2026-10-15 (`data-device="desktop"` under `?1`). A real mobile `userAgent` makes
 *  Chromium emit the hint natively AND satisfies `isPhoneRequest`'s `/Mobi|iPhone|Android/i`
 *  fallback, so `data-device="phone"` is the leg's own classification seam. */
export const IPHONE_USER_AGENT =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const PHONE_VIEWPORT = { width: 390, height: 844 };
const DESKTOP_VIEWPORT = { width: 1440, height: 900 };

export const assertNoOverflow = async (page: Page, label: string): Promise<void> => {
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

/** The signed-in phone prologue the P1 legs share — a REAL mobile context (IPHONE_USER_AGENT +
 *  isMobile/hasTouch), not the `sec-ch-ua-mobile` hint: the hint loses to Chromium's own desktop
 *  UA-CH on the wire (FIX.1's live read — `data-device="desktop"` under `?1` on 2026-10-15), so
 *  every §10.1 sweep under it reads the DESKTOP arm. P1.dossier got the real-UA arm in FIX.1;
 *  VERIF.2 sweeps the shared prologue the same way (F-VERIF.2-4 — caught live on pr-186 by
 *  P1.project/P1.runsheet reading the desktop action row). The session carries via storageState;
 *  the phone context closes with the step's browser teardown. */
async function p1PhoneProject(ctx: StepCtx): Promise<{ page: Page; slug: string }> {
  const { context } = await ctx.returningUser("a");
  const phone = await ctx.browser.newContext({
    baseURL: ctx.webBaseUrl,
    storageState: await context.storageState(),
    userAgent: IPHONE_USER_AGENT,
    viewport: PHONE_VIEWPORT,
    isMobile: true,
    hasTouch: true,
  });
  const page = await phone.newPage();
  await gotoOk(page, `${ctx.webBaseUrl}/app`, ctx);
  await followProjectLink(page, ctx);
  const slug = /^\/p\/([^/]+)/.exec(new URL(page.url()).pathname)?.[1];
  if (!slug) throw new Error(`no project slug on ${page.url()}`);
  return { page, slug };
}

/** P1.public — the anonymous surfaces at 390×844 and 320×844 (the narrowest phone), the pricing
 *  matrix's labelled scroll region + focus ring, the 200% zoom layout, axe clean. */
const P1_PUBLIC: StepFn = async (ctx) => {
  {
    const { page } = await ctx.anon();
    for (const w of [390, 320]) {
      await page.setViewportSize({ width: w, height: 844 });
      for (const path of ["/", "/pricing", "/login"]) {
        await gotoOk(page, `${ctx.webBaseUrl}${path}`);
        await assertNoOverflow(page, `${path} @${w}w`);
      }
    }
    await page.setViewportSize(PHONE_VIEWPORT);
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
    await page.setViewportSize(PHONE_VIEWPORT);
    await assertAxeClean(page, "/pricing @390×844");
    await page.screenshot({ path: join(ctx.outDir, "p1-pricing-390.png"), fullPage: true });
  }
};

/** P1.project — the signed-in project page at phone width: overflow, phonebar + action-row targets,
 *  the §10.1 desktop-capability set never mounts, axe clean. */
const P1_PROJECT: StepFn = async (ctx) => {
    const { page, slug } = await p1PhoneProject(ctx);

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
      // REQ-VFY-4 — data hooks, not POST actions (the SPA mounts the same hooks).
      for (const sel of [
        "form[data-run-sheet]",
        'a[href$="/import"]',
        'a[href$="/export"]',
        "[data-rename-form]",
        "[data-new-project]",
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
};

/** P1.pill — the Page's sync pill in-flow at phone AND 1440 (over no text, the composer, or the
 *  status bar) + the phone Page's §10.1 reader contract (data-readonly, no collab wire, no rail). */
const P1_PILL: StepFn = async (ctx) => {
    const { page, slug } = await p1PhoneProject(ctx);

    // The Page's sync pill at phone width (ADR-069 + §10.1 + P1.19): /v/working is an EDITOR
    // surface. Below ~768px the shipped contract is P1.19's READER-only Page — `isPhoneRequest`
    // SSRs the same route `compact` + `readOnly` (no collab wire, no version rail, the read-only
    // note) — OR a redirect to the project page, OR the §10.1 blocked note. If a mounted editor
    // ever reaches phone again, its pill must be there AND in-flow; a fixed/sticky pill anywhere
    // is the regression this leg guards.
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
    // P1.19's reader contract (D-CAP.3-3): wherever the Page SSRs at phone width — on /v/working
    // itself or embedded on the project page it redirects to — it must carry the reader markers:
    // data-readonly="1", no collab wire, the read-only note, no version rail, and nothing
    // editable mounted (the island renders contenteditable="false"). An editable Page at phone
    // width is the capability-leak this assert catches.
    const pageRoot = page.locator("[data-page-root]").first();
    const readerPage = (await pageRoot.count()) > 0;
    if (readerPage) {
      if ((await pageRoot.getAttribute("data-readonly")) !== "1") {
        throw new Error(`phone ${pillLanded}: the Page SSR'd without data-readonly="1" (§10.1 reader contract)`);
      }
      if ((await pageRoot.getAttribute("data-collab-url")) !== "") {
        throw new Error(`phone ${pillLanded}: the Page SSR'd with a collab wire (§10.1 bans editing on phone)`);
      }
      if ((await page.locator('[data-page-banner="readonly"]').count()) === 0) {
        throw new Error(`phone ${pillLanded}: the reader Page lacks its read-only note`);
      }
      if ((await page.locator("[data-version-rail]").count()) > 0) {
        throw new Error(`phone ${pillLanded}: the version rail renders on the phone reader (§10.1 hides it)`);
      }
      if ((await page.locator('[data-page-host] [contenteditable="true"]').count()) > 0) {
        throw new Error(`phone ${pillLanded}: an editable Page view mounted at phone width`);
      }
    }
    if (
      pillLanded !== `/p/${slug}` &&
      !editorMounted &&
      !readerPage &&
      (await page.locator("[data-phone-blocked]").count()) === 0
    ) {
      throw new Error(`/v/working @390 landed on ${pillLanded} with neither the project page, the P1.19 reader, nor the §10.1 note`);
    }
    await assertAxeClean(page, `phone ${pillLanded} (via /v/working)`);
    await page.screenshot({ path: join(ctx.outDir, "p1-pill-390.png"), fullPage: true });

    // the desktop half — the pill clear of the status bar AND the open-desk composer at 1440.
    await p1DesktopPillLeg(ctx);
};

/** P1.runsheet — the run sheet at phone width: the §10.1 capability note, never the run form. */
const P1_RUNSHEET: StepFn = async (ctx) => {
    const { page, slug } = await p1PhoneProject(ctx);

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
};

/** P1.outline (SPA.18) — `/p/:slug/outline` + `/outline/promote` at phone width, renderer-agnostic
 *  (the runner's document listener pins `data-renderer` per leg): the §10.1 capability contract
 *  holds under BOTH renderers — an existing outline renders its sections read-only (no `ed.*`
 *  fields, no delete affordance, no save submit, no new-claim row), while a project with no
 *  outline renders the designed not-found arm — either way an h1 is present. The promote sheet's
 *  leg asserts the fact rails + the consent form, or its own not-found arm — never a blank. */
const P1_OUTLINE: StepFn = async (ctx) => {
    const { page, slug } = await p1PhoneProject(ctx);

    await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/outline`);
    await assertNoOverflow(page, `/p/${slug}/outline @390×844`);
    if ((await page.locator("h1").count()) === 0) {
      throw new Error(`phone /p/${slug}/outline rendered without its heading`);
    }
    if ((await page.locator("[data-outline-sections]").count()) > 0) {
      // §10.1's read-only arm — an outline exists, so the capability boundary is the assert: the
      // edit grammar (`ed.*`), the delete affordance, the Save submit, and the new-claim row all
      // stay withheld at phone width under either renderer.
      for (const sel of [
        'input[name^="ed."], textarea[name^="ed."], select[name^="ed."]',
        "[data-outline-delete]",
        "form[data-outline-editor] button[type='submit']",
        "[data-add-claim]",
      ]) {
        if ((await page.locator(sel).count()) > 0) {
          throw new Error(`phone /p/${slug}/outline leaks a desktop-capability control: ${sel}`);
        }
      }
    } else {
      const text = (await page.textContent("body")) ?? "";
      if (!/no outline/i.test(text)) {
        throw new Error(`phone /p/${slug}/outline rendered neither the read-only editor nor the not-found arm`);
      }
    }
    await assertAxeClean(page, `phone /p/${slug}/outline`);
    await page.screenshot({ path: join(ctx.outDir, "p1-outline-390.png"), fullPage: true });

    // The promotion sheet leg: the consent form carries the fact rails when a promotion read
    // answers; the not-found arm carries the heading + copy. Both are designed states.
    await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/outline/promote?scope=thread`);
    await assertNoOverflow(page, `/p/${slug}/outline/promote @390×844`);
    if ((await page.locator("[data-promotion-estimate]").count()) > 0) {
      for (const sel of ["[data-promotion-sources]", "[data-promotion-urls]"]) {
        if ((await page.locator(sel).count()) === 0) {
          throw new Error(`phone /p/${slug}/outline/promote renders the estimate without ${sel}`);
        }
      }
    } else {
      const text = (await page.textContent("body")) ?? "";
      if (!/wasn.?t found/i.test(text)) {
        throw new Error(`phone /p/${slug}/outline/promote rendered neither the consent sheet nor the not-found arm`);
      }
    }
    await assertAxeClean(page, `phone /p/${slug}/outline/promote`);
    await page.screenshot({ path: join(ctx.outDir, "p1-outline-promote-390.png"), fullPage: true });
};

/** P1.figures (SPA.19) — `/p/:slug/figures`, `/p/:slug/figures/:id`, and `/p/:slug/visualize` at
 *  phone width, renderer-agnostic (the runner's document listener pins `data-renderer` per leg):
 *  the pane renders its rows or the designed empty arm; the card renders its preview/fields or —
 *  on the free fixture where no figure exists — the `figure:null` not-found arm; the visualize
 *  sheet renders its consent form (request/spec-kind/insist/estimate) or its own not-found arm —
 *  never a blank. Overflow + axe hold under BOTH renderers. */
const P1_FIGURES: StepFn = async (ctx) => {
    const { page, slug } = await p1PhoneProject(ctx);

    // The pane — figure rows or the empty arm (a free tenant carries no figures).
    await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/figures`);
    await assertNoOverflow(page, `/p/${slug}/figures @390×844`);
    if ((await page.locator("h1").count()) === 0) {
      throw new Error(`phone /p/${slug}/figures rendered without its heading`);
    }
    if (
      (await page.locator("[data-figure-row]").count()) === 0 &&
      (await page.locator("[data-figures-empty]").count()) === 0
    ) {
      throw new Error(`phone /p/${slug}/figures rendered neither the rows nor the empty arm`);
    }
    await assertAxeClean(page, `phone /p/${slug}/figures`);
    await page.screenshot({ path: join(ctx.outDir, "p1-figures-390.png"), fullPage: true });

    // The card — a missing figure id lands the designed not-found arm (a free fixture has no
    // figure to seed; the card's read-only posture is asserted wherever a card renders).
    await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/figures/fig_missing`);
    await assertNoOverflow(page, `/p/${slug}/figures/fig_missing @390×844`);
    if ((await page.locator("h1").count()) === 0) {
      throw new Error(`phone /p/${slug}/figures/fig_missing rendered without its heading`);
    }
    if ((await page.locator("[data-figure-preview]").count()) === 0) {
      const text = (await page.textContent("body")) ?? "";
      if (!/wasn.?t found/i.test(text)) {
        throw new Error(`phone /p/${slug}/figures/fig_missing rendered neither the card nor the not-found arm`);
      }
    }
    await assertAxeClean(page, `phone /p/${slug}/figures/fig_missing`);
    await page.screenshot({ path: join(ctx.outDir, "p1-figure-card-390.png"), fullPage: true });

    // The consent sheet — the form's field map or its own not-found arm.
    await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/visualize?request=chart%20of%20scores`);
    await assertNoOverflow(page, `/p/${slug}/visualize @390×844`);
    if ((await page.locator("[data-visualize-form]").count()) > 0) {
      for (const sel of ["[data-estimate]", "[data-insist]", 'textarea[name="request"]', '[name="specKind"]']) {
        if ((await page.locator(sel).count()) === 0) {
          throw new Error(`phone /p/${slug}/visualize renders the form without ${sel}`);
        }
      }
      if ((await page.locator('textarea[name="request"]').inputValue()) !== "chart of scores") {
        throw new Error(`phone /p/${slug}/visualize lost the ?request= prefill`);
      }
    } else {
      const text = (await page.textContent("body")) ?? "";
      if (!/wasn.?t found/i.test(text)) {
        throw new Error(`phone /p/${slug}/visualize rendered neither the consent sheet nor the not-found arm`);
      }
    }
    await assertAxeClean(page, `phone /p/${slug}/visualize`);
    await page.screenshot({ path: join(ctx.outDir, "p1-visualize-390.png"), fullPage: true });
};

/** P1.dossier (SPA.21) — `/p/:slug/review/:runId` at phone width under EITHER renderer (the
 *  runner's document listener pins `data-renderer` per leg): the dossier renders its Page (the
 *  letter arm + finding cards), the §10.1 capability boundary holds (the bulk affordances are
 *  withheld at phone width — the Desk is display:none), overflow + axe clean, never a blank. The
 *  substrate is the workspace's seeded Showcase dossier via `/showcase` — renderer-agnostic by
 *  construction (manifest hooks, never renderer internals). `expected:"red"` until its first
 *  preview leg (the Resend secret blocker — D-SPA.21-1). */
const P1_DOSSIER: StepFn = async (ctx) => {
    // FIX.1 (REQ-FIX-P1D) — a REAL mobile context: `sec-ch-ua-mobile` set through
    // `extraHTTPHeaders` loses to Chromium's own desktop UA-CH on the wire (the 2026-10-15 live
    // read: `data-renderer="spa"` + `data-device="desktop"` + 1 bulk-control element — a harness
    // defect, not a product defect). A real mobile `userAgent` on the context makes Chromium emit
    // the hint natively (the 2026-10-15 control arm: Android UA + hint → `data-device="phone"`,
    // zero bulk controls); `isPhoneRequest`'s UA fallback classifies it identically.
    const { context } = await ctx.returningUser("a");
    const phone = await ctx.browser.newContext({
      baseURL: ctx.webBaseUrl,
      storageState: await context.storageState(),
      userAgent: IPHONE_USER_AGENT,
      viewport: PHONE_VIEWPORT,
      isMobile: true,
      hasTouch: true,
    });
    try {
      const page = await phone.newPage();
      // The workspace Showcase resolves to its dossier (or the /showcase dossier surface — both
      // carry the dossier's Page contract).
      await gotoOk(page, `${ctx.webBaseUrl}/showcase`, ctx);
      if (!/review\/|\/showcase$/.test(new URL(page.url()).pathname)) {
        const link = page.locator('a[href*="/review/"]').first();
        const href = await link.getAttribute("href").catch(() => null);
        if (!href) throw new Error(`phone /showcase rendered no dossier link (${page.url()})`);
        await gotoOk(page, `${ctx.webBaseUrl}${href}`, ctx);
      }
      // The leg's own classification seam BEFORE the capability asserts. VERIF.1 correction —
      // `GET /p/:p/review/:runId` is a sole-renderer SPA document (SPA.27; the route serves
      // `spaShellDocument` unconditionally and the REQ-ED-12 forced-SSR set is the five
      // Page-family GETs ONLY — spec §14.8), so the phone verdict on THIS route is exactly
      // `data-renderer="spa"` + `data-device="phone"`. An SSR dossier would only surface if the
      // walk ended on a Page-family GET (`data-ssr-cause="phone"` — the SSR document carries
      // NO `data-device`; that attr is the SPA shell's vocabulary). Either arm proves the
      // classification; `data-device="desktop"` is the harness failure FIX.1 retired.
      const html = page.locator("html");
      const [renderer, ssrCause, device] = await Promise.all([
        html.getAttribute("data-renderer"),
        html.getAttribute("data-ssr-cause"),
        html.getAttribute("data-device"),
      ]);
      const phoneClassified = ssrCause === "phone" || device === "phone";
      if (!phoneClassified) {
        throw new Error(
          `the dossier did not classify the real-mobile context as phone ` +
            `(data-renderer=${JSON.stringify(renderer)} data-ssr-cause=${JSON.stringify(ssrCause)} ` +
            `data-device=${JSON.stringify(device)} @ ${new URL(page.url()).pathname}) — ` +
            `a "desktop" read is the harness defect FIX.1 retires; the §10.1 sweep would read the desktop arm`,
        );
      }
      if (renderer === "ssr" && ssrCause !== "phone") {
        throw new Error(
          `the dossier served SSR under a non-phone cause (${JSON.stringify(ssrCause)}) — ` +
            `the forced-SSR set leaked onto a non-Page-family route`,
        );
      }
      // The dossier leaf mounts after the twin fetch — `data-mounted` settles on the route
      // match while the leaf still paints its skeleton, so the letter/findings/§10.1 counts
      // below must wait for the leaf's own hooks before reading zero.
      await page
        .locator("[data-letter-view], [data-finding]")
        .first()
        .waitFor({ state: "attached", timeout: 20_000 })
        .catch(() => undefined);
      await assertNoOverflow(page, `dossier @390×844 (${new URL(page.url()).pathname})`);
      if (
        (await page.locator("[data-letter-view]").count()) === 0 ||
        (await page.locator("[data-finding]").count()) === 0
      ) {
        throw new Error(`phone dossier rendered neither the letter nor the findings (${page.url()})`);
      }
      // §10.1 — the phone dossier never mounts the desk affordances: the bulk controls AND the
      // per-finding Apply verb are desktop-capability-only (the ratified Q-1 extension).
      for (const sel of ["[data-bulk-controls]", "[data-apply]"]) {
        if ((await page.locator(sel).count()) > 0) {
          throw new Error(`the phone dossier mounts the affordance §10.1 withholds (${sel})`);
        }
      }
      await assertAxeClean(page, "phone dossier");
      await page.screenshot({ path: join(ctx.outDir, "p1-dossier-390.png"), fullPage: true });
    } finally {
      await phone.close();
    }
};

/** P1.app-new — R7HOME.2b (REQ-HOME-3): "New project" is an immediate blank create now — no
 *  dialog. The leg proves the new flow end to end at 1440×900: the sidebar's New-project click
 *  mints the project and lands on its Page with the focused inline "Untitled" title, the empty
 *  Page's affordance row visible, axe clean. */
const P1_APP_NEW: StepFn = async (ctx) => {
    const { page } = await ctx.returningUser("a");
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await gotoOk(page, `${ctx.webBaseUrl}/app`);
    const newProject = page.locator("[data-shell-new-project]").first();
    if ((await newProject.count()) === 0) {
      throw new Error("the workspace chrome carries no New project affordance");
    }
    await settleClientNav(page, ctx, () => newProject.click());
    await page.waitForURL(/\/p\/[a-z0-9-]+\?created=scratch/i, { timeout: 30_000 });
    // the inline title IS the heading (I2 — no placeholder heading above a real one) and focused.
    const inlineTitle = page.locator("[data-inline-title] input[name='title']");
    await inlineTitle.waitFor({ state: "visible", timeout: 15_000 });
    const [focused, value] = await page.evaluate(() => {
      const el = document.activeElement;
      return [
        el instanceof HTMLInputElement && el.name === "title",
        el instanceof HTMLInputElement ? el.value : "",
      ];
    });
    if (!focused) throw new Error("the inline title did not focus on the create landing");
    if (value !== "Untitled") throw new Error(`the inline title is ${JSON.stringify(value)}, not "Untitled"`);
    // no IDE frame confusion: the workspace surface mounts the Page, never a second title.
    if ((await page.locator("[data-page-mount]").count()) === 0) {
      throw new Error("the new project's Page did not mount");
    }
    if ((await page.locator("[data-empty-page-actions]").count()) === 0) {
      throw new Error("the blank Page lacks the affordance row");
    }
    await assertNoOverflow(page, "desktop new project Page");
    await assertAxeClean(page, "desktop new project Page");
    await page.screenshot({ path: join(ctx.outDir, "p1-app-new-1440.png"), fullPage: true });
};

/** The desktop half of P1.pill — the pill in-flow at 1440, disjoint from the status bar AND the
 *  open-desk composer (hoisted so P1_PILL reads as its two legs). */
async function p1DesktopPillLeg(ctx: StepCtx): Promise<void> {
    const { page } = await ctx.returningUser("a");
    await page.setViewportSize(DESKTOP_VIEWPORT);
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
    // open the desk/panel region on chat (pane state is attr-driven: stamp the R7b canonical
    // attrs AND the R7a aliases so this leg walks both surfaces).
    await page.evaluate(() => {
      const ide = document.querySelector<HTMLElement>(".ide");
      if (ide) {
        ide.dataset["desk"] = "open";
        ide.dataset["deskTab"] = "chat";
        ide.dataset["panel"] = "open";
        ide.dataset["panelTab"] = "chat";
        ide.querySelector(".ide-panel")?.setAttribute("data-open", "");
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
      [".ide-panel, .ide-desk", "the open panel region"],
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

/** C1 (GREEN, ACT.1 → R6LCH.1) — claims equal the entitlement config, per AUDIENCE (ADR-043):
 *  R6LCH.1 shipped `trial.audience = everyone` (2026-10-28, GD-LAUNCH-MONEY.R6) — the anonymous
 *  `/` + `/pricing` now carry the config claim for every viewer, and a signed-in is_test
 *  session's `?audience=test` preview renders the same config-equal figures — the derived word
 *  cap + pocket — identical on both surfaces. */
const C1: StepFn = async (ctx) => {
  const cap = PRICING.trial.entitlement.wordCap.toLocaleString("en-US");
  const pocket = PRICING.trial.pocketCredits.toLocaleString("en-US");
  const generated = trialIncludedNote();
  const claimsCheck = async (page: Page, base: string, suffix: string) => {
    const landing = await gotoOk(page, `${base}/${suffix}`)
      .then(() => page.textContent("body"))
      .then((b) => b ?? "");
    for (const claim of [
      PUBLIC_CLAIM_COPY["trial.firstReviewIncluded"].landingTrialNote,
      PUBLIC_CLAIM_COPY["trial.firstReviewIncluded"].landingFaqAnswer,
    ]) {
      if (!landing.toLowerCase().includes(claim.toLowerCase())) {
        throw new Error(`/${suffix} render lacks the published trial claim under audience=everyone: "${claim}"`);
      }
    }
    const pricing = await gotoOk(page, `${base}/pricing${suffix}`)
      .then(() => page.textContent("body"))
      .then((b) => b ?? "");
    for (const [label, figure] of [
      ["word cap", cap],
      ["pocket", pocket],
      ["includedNote", generated],
    ] as const) {
      if (!pricing.includes(figure)) {
        throw new Error(`/pricing${suffix} render lacks the configured ${label} "${figure}"`);
      }
    }
  };
  // — the launched audience: the anonymous viewer is covered — both public surfaces must carry
  // the config claim (its ABSENCE is now the leak: a hidden claim post-flip is a lie of omission).
  const { page: anonPage } = await ctx.anon();
  await claimsCheck(anonPage, ctx.webBaseUrl, "");
  // — the covered preview leg stays config-equal: the signed-in test tenant sees the same
  // generated figures (the ?audience=test seam still answers isTest).
  const { page } = await ctx.returningUser("a");
  await claimsCheck(page, ctx.webBaseUrl, "?audience=test");
};

/** SPA.6 (REQ-VFY-8; design/27 F9) — X1 is split per-surface so `--surface` gates exactly the legs
 *  a flip touches (`--steps X1` still selects the family by id-prefix). The planted fixture — A's
 *  nonce voice + nonce-titled scratch project — is shared across the legs inside one run: the
 *  first leg to call plants it, the rest replay the cached promise. Both sanity halves (A sees its
 *  own markers) live INSIDE the plant, so a vacuous fixture fails whichever leg runs first. */
interface X1Fixture {
  readonly aMarker: string;
  readonly aVoice: string;
  readonly aSlug: string;
}
const x1FixtureCache = new Map<string, Promise<X1Fixture>>();

async function x1Fixture(ctx: StepCtx): Promise<X1Fixture> {
  const key = `${ctx.nonce}|${ctx.webBaseUrl}`;
  let p = x1FixtureCache.get(key);
  if (!p) {
    p = (async () => {
      const a = await ctx.returningUser("a");
      // A plants a nonce marker: a scratch project titled with it AND a nonce-named voice (the
      // "save" intent is free — X1 is a $0 leg; "build" would be paid).
      const aMarker = ctx.marker("TENANTA");
      const aVoice = ctx.marker("VOICEA");
      await gotoOk(a.page, `${ctx.webBaseUrl}/voices/new`, ctx);
      const nameField = a.page.locator('input[name="name"]').first();
      if ((await nameField.count()) === 0) throw new Error("no name field on /voices/new");
      await nameField.fill(aVoice);
      // intent=save is the $0 leg; the first submit button is intent=build (a metered voice build
      // that also 400s without a sample — never click it here).
      await a.page.click('button[name="intent"][value="save"]');
      await settleNav(a.page, ctx);
      // sanity: the voice lands on A's own /voices (else the isolation probes are vacuous).
      await gotoOk(a.page, `${ctx.webBaseUrl}/voices`, ctx);
      if (!((await a.page.textContent("body")) ?? "").includes(aVoice)) {
        throw new Error("tenant A's own voice is absent from /voices (vacuous check)");
      }
      // R7HOME.2b — the create is one POST (no dialog); the marker title rides the body.
      const aCreated = (await (
        await a.page.request.post(`${ctx.webBaseUrl}/app/new`, {
          headers: { "content-type": "application/json" },
          data: { entry: "scratch", title: aMarker },
        })
      ).json()) as { redirect?: string };
      const aSlug = /\/p\/([a-z0-9-]+)/i.exec(aCreated.redirect ?? "")?.[1] ?? "";
      // sanity: A sees its own marker on /app (the isolation asserts aren't vacuous).
      await gotoOk(a.page, `${ctx.webBaseUrl}/app`, ctx);
      const aBody = (await a.page.textContent("body")) ?? "";
      if (!aBody.includes(aMarker)) {
        throw new Error("tenant A cannot see its own marker (vacuous check)");
      }
      return { aMarker, aVoice, aSlug };
    })();
    x1FixtureCache.set(key, p);
  }
  return p;
}

/** The B-side foreign-marker probe one leg shares: B's document at `path` carries none of A's
 *  markers. */
async function x1NoForeign(ctx: StepCtx, path: string, label: string): Promise<void> {
  const fx = await x1Fixture(ctx);
  const b = await ctx.returningUser("b");
  await gotoOk(b.page, `${ctx.webBaseUrl}${path}`, ctx);
  const body = (await b.page.textContent("body")) ?? "";
  if (body.includes(fx.aMarker) || body.includes(fx.aSlug) || body.includes(fx.aVoice)) {
    throw new Error(`tenant B sees tenant A's marker on ${path} (${label})`);
  }
}

const X1_VOICES: StepFn = (ctx) => x1NoForeign(ctx, "/voices", "voices list");
const X1_USAGE: StepFn = (ctx) => x1NoForeign(ctx, "/usage", "usage");
const X1_HOME: StepFn = (ctx) => x1NoForeign(ctx, "/app", "project list");
const X1_INBOX: StepFn = (ctx) => x1NoForeign(ctx, "/app/inbox", "inbox");

/** X1.detail — the detail-route isolation: B cannot open A's project document (a ≥400 folds, or a
 *  served document that never carries A's marker). */
const X1_DETAIL: StepFn = async (ctx) => {
  const fx = await x1Fixture(ctx);
  const b = await ctx.returningUser("b");
  const r = await b.page.goto(`${ctx.webBaseUrl}/p/${fx.aSlug}`, {
    waitUntil: "domcontentloaded",
  });
  const status = r?.status() ?? 0;
  if (status < 400) await settleNav(b.page, ctx); // a served doc — assert the settle markers too
  const body = (await b.page.textContent("body")) ?? "";
  if (status < 400 && body.includes(fx.aMarker)) {
    throw new Error(`tenant B opened tenant A's project /p/${fx.aSlug}`);
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
  // the favicon actually serves (the head link is meaningless if the endpoint 404s). Non-HTML —
  // no document markers exist here, so this keeps a raw goto (settle helpers are for our HTML).
  const icon = await page.goto(`${ctx.webBaseUrl}/favicon.svg`);
  if (!icon || icon.status() !== 200) throw new Error(`/favicon.svg → ${icon?.status()}`);
  // /showcase's signed-out leg IS the sample dossier — its letter text is on the page.
  await gotoOk(page, `${ctx.webBaseUrl}/showcase`);
  const sc = (await page.textContent("body")) ?? "";
  if (!sc.includes("The Extinction of Man") || !sc.includes("Contradicted")) {
    throw new Error("/showcase did not render the sample dossier to a signed-out visitor");
  }
};

/** UX.1 — R8.showcase (GREEN, $0): the signed-in /showcase leg. `/showcase` resolves to the
 *  workspace's own Showcase (the dossier redirect) or the static sample — never another tenant's.
 *  SPA.11 split R8 into per-surface legs (REQ-VFY-8) — prefs is R8.prefs, inbox is R8.inbox. */
const R8_SHOWCASE: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  await gotoOk(page, `${ctx.webBaseUrl}/showcase`, ctx);
  const scBody = (await page.textContent("body")) ?? "";
  const onShowcase = /\/showcase$/.test(page.url()) || /\/p\/[^/]+/.test(page.url());
  if (!onShowcase) throw new Error(`signed-in /showcase landed somewhere unexpected (${page.url()})`);
  if (!/The Extinction of Man|Showcase/i.test(scBody)) {
    throw new Error("signed-in /showcase renders neither the workspace Showcase nor the sample");
  }
  assertBundleParity(ctx);
};

/** UX.1 — R8.prefs (GREEN, $0): the Preferences leg — every rigor-by-workflow row is a launched
 *  workflow; nothing unlaunched shows (no "1.x" rows or unavailable-workflow copy). */
const R8_PREFS: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
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
  assertBundleParity(ctx);
};

/** UX.1 — R8.inbox (GREEN, $0): the Inbox leg — the "waiting on your call" count IS its Needs-you
 *  row count, and a project name rides each row. The `inbox` flag gates on this leg (REQ-VFY-8). */
const R8_INBOX: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  await gotoOk(page, `${ctx.webBaseUrl}/app/inbox`, ctx);
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
  assertBundleParity(ctx);
};

// ---- DEF.4 — R9 (RED→DEF.4; paid): the §14.4 refund window end-to-end on the flagged tenant.
// The run sheet → delivered report → "Get N cr back" → "Refunded N cr." with the balance moving
// EXACTLY N; then a second delivered run's request renders "sent for review" and moves NOTHING.
// Flag-off stages legitimately fail this step — it flips green only where `refundWindow` admits
// the JOURNEY.1 tenant (`test_tenants` on the Stage-B evidence deploy).

/** Launch a Quick/Base Review and wait for its terminal state (the same unattended ceremony
 *  R6/N6 drive — rigor=quick + this-run autorun + the card's data-run-state). `doc` defaults to
 *  the planted excerpt; CITE.1's N11 passes the golden op-ed. */
async function launchQuickReviewToDelivery(
  page: Page,
  ctx: StepCtx,
  tag: string,
  doc = PLANTED_EXCERPT,
): Promise<{ slug: string; runId: string; state: string }> {
  const slug = await createDraftProject(page, ctx.webBaseUrl, ctx.marker(tag), doc);
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
  await settleNav(page, ctx);
  const alert = page.locator('p[role="alert"]').first();
  if ((await alert.count()) > 0 && (await alert.isVisible().catch(() => false))) {
    throw new Error(`run launch refused: ${(await alert.textContent())?.trim()}`);
  }
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}`, ctx);
  const card = page.locator("[data-run-card]").first();
  await card.waitFor({ state: "attached", timeout: 90_000 });
  const runId = (await card.getAttribute("data-run-card")) ?? "";
  if (!runId) throw new Error("the run card carries no data-run-card id");
  const TERMINAL = new Set(["completed", "completed_partial", "failed", "cancelled"]);
  const deadline = Date.now() + 40 * 60_000;
  let state = "";
  while (Date.now() < deadline) {
    // REQ-VFY-4 — the remount assert: every poll reload re-settles on the markers.
    await reloadSettled(page, ctx).catch(() => undefined);
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

/**
 * R5ECON.3 (REQ-FND-6) — the funded-window ride arm: on the window's own deliveries. Probe the
 * leg's tenant for runs ALREADY satisfying the §14.4 eligibility predicate (a refundable
 * terminal state, non-entitlement, inside `REFUND_WINDOW_DAYS` of `ended_at`, net committed
 * debits outstanding, no prior request row) — the earlier launchers' deliveries ARE the refund
 * legs' substrate, so R9 launches a fresh pair only for whatever the window did not leave
 * behind. The probe is advisory: `JOURNEY_DATABASE_URL` unset, an unprovisioned tenant, or a
 * blind read all return [] and the launch pair below covers the shortfall. `pg` rides the
 * journeys package's own dependency (steps.ts carries no `db()` — the stb5a import edge runs
 * the other way and must not cycle).
 */
async function ridingRefundTargets(
  email: string,
  needed: number,
): Promise<{ slug: string; runId: string }[]> {
  const dsn = process.env.JOURNEY_DATABASE_URL;
  if (!dsn || needed <= 0) return [];
  const pool = new pg.Pool({ connectionString: dsn, max: 1 });
  try {
    const ident = await pool.query(
      `select wm.workspace_id as tenant
         from workspace_members wm join "user" u on u.id = wm.user_id
        where u.email = $1 order by wm.workspace_id limit 1`,
      [email],
    );
    const tenant = (ident.rows[0] as { tenant: string } | undefined)?.tenant;
    if (!tenant) return [];
    const c = await pool.connect();
    try {
      await c.query("begin");
      // tenant-scoped like the api's txRunner (no-op under a BYPASSRLS system DSN).
      await c.query("select set_config('app.tenant_id', $1, true)", [tenant]);
      const rows = (
        await c.query(
          `select r.id as run_id, p.slug
             from runs r join projects p on p.id = r.project_id
            where r.state = any($1::text[])
              and r.entitlement_id is null
              and r.ended_at is not null
              and r.ended_at > now() - make_interval(days => $2)
              and p.slug is not null
              and not exists (select 1 from user_refund_requests urr where urr.run_id = r.id)
              and (select coalesce(sum(case cl.kind
                                         when 'debit' then cl.credits
                                         when 'refund' then -cl.credits else 0 end), 0)
                     from credit_ledger cl
                    where cl.run_id = r.id and cl.kind in ('debit','refund')) > 0
            order by case when r.state in ('completed','completed_partial') then 0 else 1 end,
                     r.ended_at desc
            limit $3`,
          [[...USER_REFUNDABLE_RUN_STATES], REFUND_WINDOW_DAYS, needed],
        )
      ).rows as { run_id: string; slug: string }[];
      await c.query("commit");
      return rows.map((r) => ({ slug: r.slug, runId: r.run_id }));
    } finally {
      c.release();
    }
  } catch {
    return []; // an unprovisioned tenant or a blind read — the launch pair covers the shortfall
  } finally {
    await pool.end().catch(() => undefined);
  }
}

const R9: StepFn = async (ctx) => {
  const { page, email } = await ctx.returningUser("a");

  // R5ECON.3 (REQ-FND-6) — ride the window's own delivered runs first (the launchers' terminals
  // already satisfy §14.4 eligibility); launch a fresh run only for each leg the window did not
  // leave behind — R9 is a rider, never a launcher, on the funded dispatch.
  const ridden = await ridingRefundTargets(email, 2);
  const legRuns: { slug: string; runId: string }[] = [...ridden];
  while (legRuns.length < 2) {
    const launched = await launchQuickReviewToDelivery(
      page,
      ctx,
      legRuns.length === 0 ? "R9A" : "R9B",
    );
    legRuns.push({ slug: launched.slug, runId: launched.runId });
  }
  const [runA, runB] = legRuns as [{ slug: string; runId: string }, { slug: string; runId: string }];

  // ---- leg 1: the first eligible request — control → refunded → exact balance movement. ----
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
  await settleNav(page, ctx);
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
  await gotoOk(page, `${ctx.webBaseUrl}/p/${runB.slug}/r/${runB.runId}`);
  const cta2 = page.locator("[data-refund-cta]").first();
  await cta2.waitFor({ state: "attached", timeout: 15_000 }).catch(() => {
    throw new Error("the second run's report renders no refund control — it should still offer review");
  });
  await assertActionable(cta2, "the refund control (second request)");
  await cta2.click();
  await settleNav(page, ctx);
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

// ---- CITE.1 — N11 (RED→CITE.1; paid): the golden-op-ed Quick/Base Review end-to-end, then the
// citation-chip invariant on its delivered dossier. ADR-083/-085: a cited URL is covered when its
// canonical identity appears in the run's fetch_log (fetched ✓) or in a URL-bearing search row
// (the "Search result" label); uncovered citations render chip-less (`data-url-in-log="false"`).
// CITE.1's target — ≥ 0.80 per-run, ≥ 0.95 aggregate — means exactly zero chip-less rows here.

/** N11 (RED→green under CITE.1; paid) — one Quick/Base Review of the golden op-ed delivered
 *  end-to-end, then the dossier's citation-chip invariant: every claim-source URL renders with
 *  `data-url-in-log="true"` and a retrieval chip (`a[data-fetched="true"]` fetched ✓ or
 *  `a[data-fetched="search"]` the ADR-083 "Search result" label); no cited URL is chip-less, on the
 *  claims table or in the findings' evidence lists. The runner's post-step screenshot is the AC8
 *  evidence PNG; the strip-count cross-check against `runs.citation_completeness` is recorded in
 *  the CITE.1 run ledger. */
const N11: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  const { slug, runId, state } = await launchQuickReviewToDelivery(
    page,
    ctx,
    "CITE1",
    GOLDEN_OP_ED,
  );
  if (state !== "completed" && state !== "completed_partial") {
    throw new Error(`run ${runId} ended ${state}, not delivered`);
  }
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/review/${runId}`);

  // The claims table's source rows: `span[data-claim-url]` carries data-url-in-log —
  // "false" means the cited URL was neither fetched nor search-covered → renders chip-less.
  const urlRows = page.locator("span[data-claim-url]");
  const total = await urlRows.count();
  if (total === 0) throw new Error("delivered dossier shows no cited source URLs to chip-check");
  const uncovered = await page.locator('span[data-claim-url][data-url-in-log="false"]').count();
  if (uncovered > 0) {
    throw new Error(`${uncovered}/${total} cited source URLs render without a retrieval chip`);
  }
  // every covered row shows one of the two chip variants — fetched ✓ or "Search result".
  const chips = await page.locator('a[data-fetched="true"], a[data-fetched="search"]').count();
  if (chips < total) {
    throw new Error(`only ${chips}/${total} cited source URLs carry a retrieval chip`);
  }
  // the findings' evidence lists stamp the same retrieval coverage ([data-fetched-chip]); an
  // uncovered evidence URL would render a bare link — assert none do.
  const evidenceLis = await page.locator("div[data-finding-evidence] li:has(> a)").count();
  if (evidenceLis > 0) {
    const stamped = await page
      .locator("div[data-finding-evidence] li:has(> [data-fetched-chip])")
      .count();
    if (stamped < evidenceLis) {
      throw new Error(
        `${evidenceLis - stamped}/${evidenceLis} findings-evidence URLs render without a chip`,
      );
    }
  }
  assertBundleParity(ctx);
};

// ---------------------------------------------------------------- the free fixture (≤300 words)

const FREE_FIXTURE = `# Journey fixture
The committee met on Tuesday. The report was adopted unanimously.
An appendix lists the figures; the body argues the method.
`;

/** SPA.25 (REQ-ED-17) — the source-mode toggle leg, $0. On a SPA-rendered editable Page the Source
 *  affordance swaps to the CodeMirror projection seeded with the canonical markdown; typed text
 *  commits through the SAME ProseMirror doc (the hidden `[data-page-view]` re-renders it — a
 *  divergence between the views is exactly the defect this leg fences) and survives the toggle
 *  back. `expected: "red"`: the leg only exists on the SPA renderer — SPA.28 made that
 *  unconditional (every authenticated `/p/:p/v/:v` document serves the shell; the
 *  `--pin-renderer` machinery is gone), so the expected:red is now purely the preview-leg
 *  blocker (the Resend secret blocker, D-SPA.25-1) — the dom tests carry the offline assert
 *  meanwhile. */
const T17: StepFn = async (ctx) => {
  const { page } = await ctx.freshUser("t17");
  const slug = await createDraftProject(page, ctx.webBaseUrl, ctx.marker("t17"), FREE_FIXTURE);
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/v/working`);
  await page.waitForSelector("[data-page-view]", { timeout: 20_000 });
  // REQ-FIX-T17 (ratified Q-T17, leg-side arm first): the mount attribute lands before the PM
  // view paints its first block — clicking the source toggle against an empty view races the
  // hydration commit. Await the canonical fixture text INSIDE the view before interacting.
  await page.waitForFunction(
    () =>
      document.querySelector("[data-page-view]")?.textContent?.includes("The committee met on Tuesday") ===
      true,
    null,
    { timeout: 20_000 },
  );
  const renderer = await page.evaluate(
    () => document.documentElement.getAttribute("data-renderer"),
  );
  if (renderer !== "spa") {
    throw new Error(
      `T17 owed — the source toggle is an SPA-rendered affordance (this document served data-renderer=${JSON.stringify(renderer)})`,
    );
  }
  const toggle = page.locator("[data-source-toggle]");
  await toggle.waitFor({ state: "visible", timeout: 15_000 });
  if ((await toggle.getAttribute("aria-pressed")) !== "false") {
    throw new Error("the source toggle reports pressed before any click");
  }
  await toggle.click();
  const cmContent = page.locator("[data-source-host] .cm-content");
  await cmContent.waitFor({ state: "visible", timeout: 15_000 });
  const seeded = (await cmContent.textContent()) ?? "";
  if (!seeded.includes("The committee met on Tuesday")) {
    throw new Error("the source view did not seed the canonical markdown");
  }
  // type a marker paragraph at the end of the document — click the last line, End, Enter×2, type.
  const marker = `SRC-${ctx.marker("t17")}`;
  await cmContent.locator(".cm-line").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(`\n\n${marker}`);
  // the debounced commit lands in the live PM doc — hidden, but mounted and rendering.
  await page.waitForFunction(
    (m) => document.querySelector("[data-page-view]")?.textContent?.includes(m) === true,
    marker,
    { timeout: 15_000 },
  );
  await toggle.click();
  const pmHost = page.locator("[data-pm-host]:not([hidden])");
  await pmHost.waitFor({ state: "visible", timeout: 10_000 });
  const rendered = (await pmHost.textContent()) ?? "";
  if (!rendered.includes(marker)) {
    throw new Error("the source edit did not render in the rich view after toggling back");
  }
  // CM left the DOM entirely — the PM view is the only live story again.
  if ((await page.locator("[data-source-host] .cm-editor").count()) !== 0) {
    throw new Error("the CodeMirror host still holds an editor after toggling back");
  }
};

/**
 * NAVC.4 — the shared head of the R10 legs: `/app → click a[href="/p/<slug>"] → click
 * a[data-edit-source] → /p/<slug>/v/working`, every hop a mechanism-pinned CLIENT navigation
 * (`settleClientNav` — `data-nav-count` must tick +1 and zero document loads may land). Returns
 * the committed nav-count after the editor hop so callers can keep pinning from it.
 *
 * The project link is clicked for real — a Quiet-folded row is opened through its `<summary>`
 * first; a missing/unreachable link is a leg failure, never a typed-URL substitute.
 */
async function r10ClientChain(
  ctx: StepCtx,
  page: Page,
  slug: string,
): Promise<number> {
  await gotoSettled(page, `${ctx.webBaseUrl}/app`, ctx, { route: "/app" });
  const loads0 = ctx.documentLoads;
  const nav0 = await navCountOf(page);
  if (nav0 == null) {
    throw new Error(
      `R10 owed — ${page.url()} carries no data-nav-count stamp (REQ-NAVT-1's all-documents ` +
        `marker is absent — the deployment is serving a pre-NAVC.2 document)`,
    );
  }

  // hop 1 — the real project-link click: /app → /p/:slug
  const link = page.locator(`a[href="/p/${slug}"]`).first();
  await link.waitFor({ state: "attached", timeout: 15_000 });
  if (!(await link.isVisible().catch(() => false))) {
    const summary = link.locator("xpath=ancestor::details[1]/summary");
    if ((await summary.count()) > 0) await summary.first().click();
  }
  await link.waitFor({ state: "visible", timeout: 10_000 });
  await settleClientNav(page, ctx, () => link.click(), { route: "/p/$project" });
  if (ctx.documentLoads !== loads0) {
    throw new Error(
      `R10 — /app → /p/${slug} loaded ${ctx.documentLoads - loads0} document(s): not a client nav`,
    );
  }
  const nav1 = await navCountOf(page);
  if (nav1 !== nav0 + 1) {
    throw new Error(`R10 — data-nav-count ${nav0} → ${nav1} across the project-link hop (want +1)`);
  }

  // hop 2 — the Versions sidebar item: /p/:slug → /p/:slug/v/working (R7HOME.2b — /p/:slug IS the
  // head draft now; the retired "Edit source" link's destination lives on the Versions item).
  const edit = page.locator('[data-project-item="versions"]').first();
  if ((await edit.count()) === 0) {
    throw new Error(`R10 — /p/${slug} carries no data-project-item="versions" affordance`);
  }
  await edit.waitFor({ state: "visible", timeout: 15_000 });
  await settleClientNav(page, ctx, () => edit.click(), { route: "/p/$project/v/$v" });
  if (ctx.documentLoads !== loads0) {
    throw new Error(
      `R10 — /p/${slug} → /v/working loaded ${ctx.documentLoads - loads0} document(s): not a client nav`,
    );
  }
  if (!page.url().endsWith(`/p/${slug}/v/working`)) {
    throw new Error(`R10 — edit-source landed on ${page.url()}, not /p/${slug}/v/working`);
  }
  await page.waitForSelector("[data-page-root]", { timeout: 15_000 });
  await page.waitForSelector("[data-page-view]", { timeout: 30_000 });
  const nav2 = await navCountOf(page);
  if (nav2 !== nav0 + 2) {
    throw new Error(`R10 — data-nav-count ${nav1} → ${nav2} across the edit-source hop (want +1)`);
  }
  return nav2;
}

/**
 * R10 (NAVC.4, REQ-NAVT-4) — the SPA-navigation acceptance leg, $0. `/app → click the project
 * link → click a[data-project-item="versions"] → /p/:slug/v/working → Back`: every hop pinned client-side
 * (monotone `data-nav-count`, zero document loads past the /app baseline), then the Back pop
 * proves the warm return — the project-page twin GET (`/bff/p/:slug`, NAVC.3's
 * `staleTime`-windowed query) must NOT re-fire, while the handoff POST still may.
 * `expected:"red"` until the first live leg lands it.
 */
const R10: StepFn = async (ctx) => {
  const { page } = await ctx.freshUser("r10");
  const slug = await createDraftProject(page, ctx.webBaseUrl, ctx.marker("r10"), FREE_FIXTURE);
  await r10ClientChain(ctx, page, slug);
  const loadsBeforeBack = ctx.documentLoads;

  // hop 3 — Back: a pop commits in-document too (router history listener). While it settles,
  // watch the wire: a warm remount inside NAVC.3's keep-alive/freshness window must not re-ask
  // the page twin — a `staleTime: 0` regression would GET `/bff/p/<slug>` again here.
  const webOrigin = new URL(ctx.webBaseUrl).origin;
  const pageTwinGets: string[] = [];
  const onReq = (r: { url(): string; method(): string }): void => {
    try {
      const u = new URL(r.url());
      if (r.method() === "GET" && u.origin === webOrigin && u.pathname === `/bff/p/${slug}`) {
        pageTwinGets.push(r.url());
      }
    } catch {
      /* unparseable request URL — not ours */
    }
  };
  page.on("request", onReq);
  try {
    await settleClientNav(page, ctx, () => page.goBack(), { route: "/p/$project" });
    // let any post-mount twin work flush inside the census window before judging it
    await page.waitForTimeout(750);
  } finally {
    page.off("request", onReq);
  }
  if (ctx.documentLoads !== loadsBeforeBack) {
    throw new Error(
      `R10 — Back loaded ${ctx.documentLoads - loadsBeforeBack} document(s): the pop was not in-document`,
    );
  }
  if (pageTwinGets.length > 0) {
    throw new Error(
      `R10 — the warm return re-issued ${pageTwinGets.length} project-page twin GET(s) ` +
        `(${pageTwinGets.join(", ")}) — NAVC.3's freshness window is not holding`,
    );
  }
};

/**
 * R10.keepalive (NAVC.4, REQ-NAVC-22/23's live arm) — the page-session keep-alive leg, $0.
 * Mints the registry entry by client-navigating into `/v/working`, makes a REAL synced edit,
 * hops to `/app` (a deliberately non-Page route — the entry drops to IDLE and its 120 s TTL
 * starts), then Backs back inside the TTL and asserts:
 *
 *   1. `[data-page-root][data-page-session]` carries the SAME session id — identity survived
 *      idle+rebind (and the earlier fork rekey), exactly NAVC.3's registry contract;
 *   2. the typed marker is still in the rendered doc — trivially true even under a re-seed
 *      (the sync persisted it), so this alone proves nothing;
 *   3. ⌘Z/Ctrl+Z removes the marker — the SEMANTIC arm: a remount that re-seeded the
 *      EditorState from the stored doc would still show the marker but could never undo it
 *      (fresh `history()`/`yUndoPlugin` stacks are empty). Only a preserved EditorState —
 *      the keep-alive contract — removes it.
 */
const R10_KEEPALIVE: StepFn = async (ctx) => {
  const { page } = await ctx.freshUser("r10k");
  const slug = await createDraftProject(page, ctx.webBaseUrl, ctx.marker("r10k"), FREE_FIXTURE);
  await r10ClientChain(ctx, page, slug);
  const loads0 = ctx.documentLoads;

  const session0 = await page
    .locator("[data-page-root]")
    .getAttribute("data-page-session");
  if (session0 == null || !/^\S+\.\d+$/.test(session0)) {
    throw new Error(
      `R10.keepalive owed — [data-page-root] carries no data-page-session stamp ` +
        `(${JSON.stringify(session0)}) — REQ-NAVT-5's marker is absent on this deployment`,
    );
  }

  // the synced edit — a keystroke at the end of the last block, then the ONE pill to synced.
  const markerText = ctx.marker("r10k").toLowerCase().replace(/[^a-z0-9]/g, "-");
  await page.locator("[data-page-view] p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.type(` ${markerText}`);
  try {
    await page.waitForSelector('[data-sync-pill][data-sync-state="synced"]', { timeout: 90_000 });
  } catch {
    const pillState = await page
      .locator("[data-sync-pill]")
      .first()
      .evaluate((el) => `${el.getAttribute("data-sync-state")} · "${el.textContent}"`)
      .catch(() => "(pill missing)");
    throw new Error(`R10.keepalive — the edit never synced (pill: ${pillState})`);
  }
  // the fork's registry rekey must preserve the session identity (NAVC.3)
  const sessionAfterSync = await page
    .locator("[data-page-root]")
    .getAttribute("data-page-session");
  if (sessionAfterSync !== session0) {
    throw new Error(
      `R10.keepalive — data-page-session moved across the fork rekey ` +
        `(${session0} → ${sessionAfterSync}); rekey must preserve identity`,
    );
  }

  // the away hop — the rail's Home link to /app, a non-Page route: the Page unmounts, the
  // registry entry goes idle, the 120 s TTL starts. F-R6POST.2-1 (found live on pr-211): the
  // shell emits TWO a[href="/app"] — the phonebar fallback (`display:none` ≥768px) precedes the
  // rail's ⌂ in DOM order, so an unscoped .first() resolves to a hidden node at desktop width
  // and click() waits for visibility forever. `:visible` picks whichever the viewport shows.
  const home = page.locator('a[href="/app"]:visible').first();
  if ((await home.count()) === 0) {
    throw new Error("R10.keepalive — the IDE rail carries no a[href=\"/app\"] home link");
  }
  await settleClientNav(page, ctx, () => home.click(), { route: "/app" });
  if (ctx.documentLoads !== loads0) {
    throw new Error("R10.keepalive — the /app away hop document-navigated");
  }

  // back inside the TTL — the pop remounts the Page and must re-acquire the SAME entry.
  await settleClientNav(page, ctx, () => page.goBack(), { route: "/p/$project/v/$v" });
  await page.waitForSelector("[data-page-view]", { timeout: 30_000 });
  if (ctx.documentLoads !== loads0) {
    throw new Error("R10.keepalive — the return hop document-navigated (the entry can't survive that)");
  }
  const sessionBack = await page
    .locator("[data-page-root]")
    .getAttribute("data-page-session");
  if (sessionBack !== session0) {
    throw new Error(
      `R10.keepalive — data-page-session ${session0} → ${sessionBack} across leave/return ` +
        `inside the TTL — the keep-alive entry was not re-acquired`,
    );
  }

  // marker still rendered (necessary but not sufficient — a re-seed would also show it)
  const view = page.locator("[data-page-view]");
  await page.waitForFunction(
    (m) => document.querySelector("[data-page-view]")?.textContent?.includes(m) === true,
    markerText,
    { timeout: 15_000 },
  );

  // the semantic arm — undo must remove the typed marker. Only a preserved EditorState carries
  // the undo stack across the remount; a re-seeded one would silently keep the marker.
  await view.locator("p").last().click();
  await page.keyboard.press("End");
  await page.keyboard.press(process.platform === "darwin" ? "Meta+z" : "Control+z");
  try {
    await page.waitForFunction(
      (m) => document.querySelector("[data-page-view]")?.textContent?.includes(m) !== true,
      markerText,
      { timeout: 10_000 },
    );
  } catch {
    const stillThere = (await view.textContent())?.includes(markerText) ?? false;
    throw new Error(
      stillThere
        ? `R10.keepalive — ⌘Z did not remove the typed marker: the remounted editor's undo ` +
          `stack is empty, so the EditorState was re-seeded, not kept alive ` +
          `(session ${sessionBack})`
        : `R10.keepalive — the marker text probe raced (undo may have landed; re-check needed)`,
    );
  }
};

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
  N11,
  R1,
  R4,
  R5,
  R6,
  R7,
  // SPA.11 — R8 split per-surface (REQ-VFY-8): the composite id is gone; each leg gates its own flag.
  "R8.showcase": R8_SHOWCASE,
  "R8.prefs": R8_PREFS,
  "R8.inbox": R8_INBOX,
  R9,
  // NAVC.4 — the nav-acceptance legs (REQ-NAVT-4's chain + the keep-alive/semantic-undo arm).
  R10,
  "R10.keepalive": R10_KEEPALIVE,
  // SPA.6 — the P1/X1 splits (REQ-VFY-8): per-surface legs replacing the composite ids.
  "P1.public": P1_PUBLIC,
  "P1.project": P1_PROJECT,
  "P1.pill": P1_PILL,
  "P1.runsheet": P1_RUNSHEET,
  "P1.outline": P1_OUTLINE,
  "P1.figures": P1_FIGURES,
  "P1.dossier": P1_DOSSIER,
  "P1.app-new": P1_APP_NEW,
  C1,
  "X1.voices": X1_VOICES,
  "X1.usage": X1_USAGE,
  "X1.home": X1_HOME,
  "X1.inbox": X1_INBOX,
  "X1.detail": X1_DETAIL,
  // SPA.25 — the source-mode toggle leg (REQ-ED-17; red until the editor-flag preview run lands).
  T17,
};
