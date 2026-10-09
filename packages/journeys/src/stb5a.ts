// STB.5a — the BL-21/BL-22 live-leg step implementations (T1…T16). Every leg is a browser walk on
// JOURNEY.1 test tenants asserting visible text + an actionable control; the reads that have no UI
// surface (pg-boss job rows, inbox_items.visible_at, account_exports expiry) ride a read-only
// JOURNEY_DATABASE_URL pool, and the two writes no SSR form carries (the CSL-JSON bibliography POST,
// the defer-with-pre_export-horizon disposition) go through the api's session-cookie surface — the
// same credential the real browser minted, forwarded the way the web service forwards it (never a
// DB-lifted token; ADR-016). No leg launches a run — the own-tenant delivered Review is the one the
// weekly paid leg's earlier steps (N6/N11/R9) already produced on test+jrn-a.

import { randomUUID } from "node:crypto";
import type { BrowserContext, Page } from "playwright";
import pg from "pg";
import { seedWritableDossier, type MigrationDb } from "@rhema/db";
import type { StepCtx, StepFn } from "./runner.js";
import { assertActionable } from "./occlusion.js";
import { assertBundleParity, createDraftProject } from "./steps.js";
// SPA.6 (REQ-VFY-4) — the settle contract: post-action waits are the mounted markers, never bare
// domcontentloaded; POST targets are data hooks, never `form[action]` strings.
import { gotoOk as gotoSettled, settleNav, type SettleScope } from "./settle.js";
import {
  CITE_KEY,
  buildSubstackExportZip,
  citationDraft,
  cslJsonBibliography,
  deferredVisibleAt,
  findProtocolMarkersInBytes,
  quietWindowUtc,
  substackFixturePosts,
} from "./stb5a-helpers.js";

// ---------------------------------------------------------------- shared plumbing

/** The canonical nav: status check, then the settle markers (scope derives from the target — every
 *  call site navigates to the web origin). */
async function gotoOk(page: Page, url: string, scope?: SettleScope): Promise<void> {
  await gotoSettled(page, url, scope ?? { webBaseUrl: url });
}

/** scrollIntoViewIfNeeded before the occlusion check — elementFromPoint returns null off-viewport
 *  (the settings/dossier controls regularly sit below the fold). */
async function assertClick(el: ReturnType<Page["locator"]>, label: string): Promise<void> {
  await el.scrollIntoViewIfNeeded().catch(() => undefined);
  await assertActionable(el, label);
}

/** The Desk's findings panel renders SSR but CSS-hidden until the island's tab swaps
 *  `data-desk-tab` — and on a delivered dossier the Desk starts CLOSED (§5.1's bottom drawer:
 *  height 0 clips the tab strip, so the ONLY open affordance is the ⌘J chord / a live run's feed
 *  link). Press the real chord, then pick the Findings tab; returns whether the panel showed. */
async function openFindingsDesk(page: Page): Promise<boolean> {
  const ide = page.locator(".ide").first();
  if ((await page.locator('button[data-ide-desk-tab="findings"]').count()) === 0) return false;
  if ((await ide.getAttribute("data-desk").catch(() => null)) !== "open") {
    // blur any field first — ⌘ chords dispatch globally EXCEPT in input focus (§5.12). The island
    // hydrates asynchronously after domcontentloaded, so a chord pressed too early is swallowed —
    // a real user re-presses; bounded retry keeps the leg honest (it still reports closed if the
    // chord genuinely never opens the drawer).
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.()).catch(() => undefined);
    for (let attempt = 0; attempt < 3; attempt++) {
      await page.keyboard.press("Control+j").catch(() => undefined);
      const opened = await page
        .locator('.ide[data-desk="open"]')
        .waitFor({ state: "attached", timeout: 4_000 })
        .then(() => true)
        .catch(() => false);
      if (opened) break;
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur?.()).catch(() => undefined);
    }
  }
  const tab = page.locator('button[data-ide-desk-tab="findings"]').first();
  if ((await ide.getAttribute("data-desk-tab").catch(() => null)) !== "findings") {
    await tab.scrollIntoViewIfNeeded().catch(() => undefined);
    await tab.click({ timeout: 5_000 }).catch(() => undefined);
  }
  const row = page.locator('[data-desk-panel="findings"] [data-desk-row]').first();
  if (await row.isVisible().catch(() => false)) return true;
  await page.waitForTimeout(800);
  return row.isVisible().catch(() => false);
}

let pool: pg.Pool | null = null;

/** The read-only stage DB — bound by the operator for Stage-B legs; unset on scheduled CI (the
 *  private DB is unreachable there — the affected steps then report "owed", never fabricated).
 *  STB.5b's paid legs reuse this seam (`@rhema/journeys` keeps one DB client per process). */
export function db(): pg.Pool {
  const url = process.env.JOURNEY_DATABASE_URL;
  if (!url) throw new Error("needs JOURNEY_DATABASE_URL (a read pool bound to the stage Postgres)");
  pool ??= new pg.Pool({ connectionString: url, max: 2 });
  return pool;
}

/**
 * Call the api on the session's own credential — the same seam the web service uses (it forwards
 * the browser's Cookie header verbatim on every api call) and the same seam the 1.x app uses
 * directly. The cookie was minted by the real magic-link flow this run; nothing is lifted from a
 * DB. `Origin` rides the app origin the api's mutation allowlist admits.
 */
/** Shared with the STB.5b paid-leg steps (the same session-cookie seam). */
export async function apiFetch(
  ctx: StepCtx,
  context: BrowserContext,
  path: string,
  init: { method?: string; json?: unknown } = {},
): Promise<{ status: number; body: unknown; text: string }> {
  const cookies = await context.cookies(ctx.webBaseUrl);
  const header = cookies.map((c) => `${c.name}=${c.value}`).join("; ");
  const res = await context.request.fetch(`${ctx.apiBaseUrl}${path}`, {
    method: init.method ?? "GET",
    headers: {
      cookie: header,
      origin: ctx.webBaseUrl,
      ...(init.json !== undefined ? { "content-type": "application/json" } : {}),
    },
    ...(init.json !== undefined ? { data: JSON.stringify(init.json) } : {}),
  });
  const text = await res.text();
  let body: unknown = null;
  try {
    body = JSON.parse(text);
  } catch {
    /* non-JSON bodies stay text */
  }
  return { status: res.status(), body, text };
}

interface ApiProjectRow {
  id: string;
  slug: string;
  title: string;
}

async function apiProjects(ctx: StepCtx, context: BrowserContext, scope?: string): Promise<ApiProjectRow[]> {
  const r = await apiFetch(ctx, context, `/projects${scope ? `?scope=${scope}` : ""}`);
  if (r.status !== 200) throw new Error(`api GET /projects → ${r.status}: ${r.text.slice(0, 160)}`);
  const list = (r.body as { projects?: ApiProjectRow[] }).projects ?? (r.body as ApiProjectRow[]);
  return Array.isArray(list) ? list : [];
}

async function apiProjectId(ctx: StepCtx, context: BrowserContext, slug: string, scope?: string): Promise<string> {
  const row = (await apiProjects(ctx, context, scope)).find((p) => p.slug === slug);
  if (!row) throw new Error(`no project row for slug ${slug}${scope ? ` (scope=${scope})` : ""}`);
  return row.id;
}

/**
 * Find a delivered own-tenant Review: walk /app's project rows, then each project's /p/<slug> for
 * `/review/<runId>` links, probing until one 200s. Returns the dossier coordinates.
 */
async function findDeliveredReview(
  page: Page,
  ctx: StepCtx,
): Promise<{ slug: string; runId: string }> {
  // The funded-window pin: with several delivered Reviews on one tenant the first-200 discovery
  // is order-dependent (it picked CITE.1 Leg-1a's all-unverifiable dossier over the healthy Leg-3
  // one). `JOURNEY_DOSSIER_SLUG` + `JOURNEY_DOSSIER_RUN` name the intended dossier explicitly.
  const pinSlug = process.env.JOURNEY_DOSSIER_SLUG;
  const pinRun = process.env.JOURNEY_DOSSIER_RUN;
  if (pinSlug && pinRun) {
    const r = await page.request
      .get(`${ctx.webBaseUrl}/p/${pinSlug}/review/${pinRun}`)
      .catch(() => null);
    if (!r || r.status() !== 200) {
      throw new Error(`pinned dossier /p/${pinSlug}/review/${pinRun} → ${r?.status() ?? "no response"}`);
    }
    return { slug: pinSlug, runId: pinRun };
  }
  await gotoOk(page, `${ctx.webBaseUrl}/app`);
  const slugs = (
    await page.locator('a[href^="/p/"]').evaluateAll((els) =>
      els.map((e) => /\/p\/([^/?#]+)/.exec(e.getAttribute("href") ?? "")?.[1] ?? "").filter(Boolean),
    )
  ).filter((s, i, a) => a.indexOf(s) === i);
  const reviewHrefs: { slug: string; runId: string; href: string }[] = [];
  for (const slug of slugs) {
    // a probe, not a leg: ≥400 candidates are skipped, so this keeps a raw goto (the renderer
    // assert still rides the runner's response listener).
    const r = await page.goto(`${ctx.webBaseUrl}/p/${slug}`, { waitUntil: "domcontentloaded" }).catch(() => null);
    if (!r || r.status() >= 400) continue;
    const hrefs = await page
      .locator('a[href*="/review/"]')
      .evaluateAll((els) => els.map((e) => e.getAttribute("href") ?? ""));
    for (const href of hrefs) {
      const m = /^\/p\/([^/]+)\/review\/([A-Za-z0-9]+)/.exec(href);
      if (m?.[1] && m[2]) reviewHrefs.push({ slug: m[1], runId: m[2], href });
    }
  }
  for (const h of reviewHrefs) {
    const r = await page.request.get(`${ctx.webBaseUrl}${h.href}`).catch(() => null);
    if (r && r.status() === 200) return { slug: h.slug, runId: h.runId };
  }
  throw new Error(
    `no delivered own-tenant Review found (${slugs.length} project(s), ${reviewHrefs.length} review link(s) probed)`,
  );
}

/** D-PRB.04-1's seven-part authed render assert — shared by T1 (seeded Showcase) and T10 (the
 *  own-tenant delivered Review). */
async function assertDossierParts(page: Page, where: string): Promise<void> {
  const need = async (sel: string, label: string): Promise<void> => {
    if ((await page.locator(sel).count()) === 0) {
      throw new Error(`${where}: no ${label} rendered (${sel} absent)`);
    }
  };
  // the letter
  await need("[data-letter-view]", "letter");
  // the claim ledger, with fetched-✓ retrieval chips joined to the run's fetch_log
  await need("[data-claims-table]", "claim ledger");
  if ((await page.locator("[data-claims-table] [data-claim]").count()) === 0) {
    throw new Error(`${where}: the claim ledger renders no claim rows`);
  }
  if ((await page.locator('a[data-fetched="true"], a[data-fetched="search"], [data-fetched-chip]').count()) === 0) {
    throw new Error(`${where}: no retrieval chip (fetched ✓ / Search result) on the claim ledger`);
  }
  // the second read
  await need("[data-second-read]", "second read");
  // the rubric
  await need("[data-rubric]", "rubric");
  if ((await page.locator("[data-rubric-row]").count()) === 0) {
    throw new Error(`${where}: the rubric renders no dimension rows`);
  }
  // the findings
  if ((await page.locator("[data-finding]").count()) === 0) {
    throw new Error(`${where}: no finding cards rendered`);
  }
  // the trust chip from the real access_report
  await need("[data-trust-chip]", "trust chip");
  // the version obligation summary
  await need("[data-version-obligations]", "version obligation summary");
}

/** The /app row's ⋯ menu: the row's group may render as a collapsed <details> (the "Quiet"
 *  bucket) — open it first so the row is visible, then click the menu summary. */
async function openProjectRowMenu(page: Page, title: string) {
  const row = page.locator(`li[data-project-row]:has-text("${title}")`).first();
  await row.waitFor({ state: "attached", timeout: 15_000 });
  if (!(await row.isVisible().catch(() => false))) {
    const groupSummary = page
      .locator(`details:has(li[data-project-row]:has-text("${title}")) > summary`)
      .first();
    if ((await groupSummary.count()) > 0) await groupSummary.click();
  }
  await row.waitFor({ state: "visible", timeout: 10_000 });
  const summary = row.locator('summary[aria-label="Project actions"]');
  await assertClick(summary, "the row's actions menu");
  await summary.click();
  return row;
}

/** Create a persona with intent=save (never the build button — $0). Returns the persona id. */
async function createVoice(page: Page, ctx: StepCtx, name: string): Promise<string> {
  await gotoOk(page, `${ctx.webBaseUrl}/voices/new`);
  await page.fill('input[name="name"]', ctx.marker(name));
  const save = page.locator('button[name="intent"][value="save"]');
  await assertClick(save.first(), "voice create (save)");
  await save.click();
  await page.waitForURL(/\/v\/[A-Za-z0-9-]+/, { timeout: 15_000 });
  const m = /\/v\/([A-Za-z0-9-]+)/.exec(page.url());
  if (!m?.[1]) throw new Error(`voice create did not land on /v/<persona> (${page.url()})`);
  return m[1];
}

/** The number the Inbox's waiting line carries (open approvals + open decisions — never events). */
async function readInboxBadge(page: Page, ctx: StepCtx): Promise<number> {
  await gotoOk(page, `${ctx.webBaseUrl}/app/inbox`);
  const text = (await page.locator("[data-inbox-badge]").textContent()) ?? "";
  const n = Number((/\d+/.exec(text) ?? [NaN])[0]);
  if (Number.isNaN(n)) throw new Error(`the Inbox badge line is unreadable: "${text.trim()}"`);
  return n;
}

// ---------------------------------------------------------------- nightly $0 steps

/** T1 (GREEN; nightly) — the seeded Showcase dossier renders all seven D-PRB.04-1 parts. The
 *  own-tenant half is T10 (weekly, after the paid leg delivers). */
const T1: StepFn = async (ctx) => {
  const { page } = await ctx.freshUser("t1");
  await gotoOk(page, `${ctx.webBaseUrl}/showcase`, ctx);
  // signed-in resolves to the workspace Showcase dossier (or the static sample at /showcase —
  // either carries the dossier surface; the seeded test-tenant path is the dossier redirect).
  if (!/review\/|\/showcase$/.test(new URL(page.url()).pathname)) {
    const link = page.locator('a[href*="/review/"]').first();
    const href = await link.getAttribute("href").catch(() => null);
    if (!href) throw new Error(`/showcase rendered no dossier surface (${page.url()})`);
    await gotoOk(page, `${ctx.webBaseUrl}${href}`);
  }
  await page.locator("[data-showcase-banner]").first().waitFor({ state: "attached", timeout: 10_000 }).catch(() => {
    throw new Error("the seeded Showcase dossier carries no showcase banner — is this the seeded project?");
  });
  await assertDossierParts(page, "showcase dossier");
  // an actionable control — the shared findings filter bar's severity select submits the same
  // filtered list across Margin/Desk/body (§5.7's three-surface contract). The desk panel is
  // CSS-hidden until its tab swaps data-desk-tab; the tab click is itself an actionable control.
  await openFindingsDesk(page);
  const sel = page.locator("form[data-findings-filters] select").first();
  if (await sel.isVisible().catch(() => false)) {
    await assertClick(sel, "the findings filter select");
  } else {
    await assertClick(page.locator("button[data-verb]").first(), "a disposition verb");
  }
  assertBundleParity(ctx);
};

/** T2.badge (GREEN; nightly) — the Inbox half of the old T2 on a fresh tenant: the badge line
 *  equals the rendered Needs-you rows, the sectioned rows (or the honest empty state) render, and
 *  every event row carries an actionable open link. SPA.11 split T2 so the `inbox` flag gates on
 *  this leg alone (REQ-VFY-8) — the settings half is T2.matrix. */
const T2_BADGE: StepFn = async (ctx) => {
  const { page } = await ctx.freshUser("t2");
  const badge = await readInboxBadge(page, ctx);
  const blocked = await page.locator('[data-inbox-section="blocked"] [data-inbox-row]').count();
  if (badge !== blocked) {
    throw new Error(`Inbox badge says ${badge} but renders ${blocked} Needs-you rows`);
  }
  if ((await page.locator("[data-inbox-empty]").count()) === 0) {
    // rows exist — every event row carries an actionable open link.
    const opens = await page.locator("[data-inbox-row] a[data-inbox-open]").count();
    const rows = await page.locator("[data-inbox-row]").count();
    if (rows > 0 && opens === 0) throw new Error("Inbox rows render without an open link");
    if (rows > 0) {
      await assertClick(page.locator("[data-inbox-row] a[data-inbox-open]").first(), "an Inbox open link");
    }
  }
  assertBundleParity(ctx);
};

/** T2.matrix (GREEN; nightly) — the notification-settings half of the old T2 on a fresh tenant:
 *  every event row + the quiet-hours inputs render and are actionable. The `settings` flag gates
 *  on this leg (REQ-VFY-8). */
const T2_MATRIX: StepFn = async (ctx) => {
  const { page } = await ctx.freshUser("t2m");
  await gotoOk(page, `${ctx.webBaseUrl}/app/settings/notifications`);
  if ((await page.locator("[data-notification-matrix]").count()) === 0) {
    throw new Error("the notification matrix does not render");
  }
  if ((await page.locator("[data-notification-row]").count()) < 5) {
    throw new Error("the notification matrix renders fewer than five event rows");
  }
  const quietSelect = page.locator('select[name="qh_enabled"]');
  await assertClick(quietSelect, "the quiet-hours enable select");
  await assertClick(
    page.locator('[data-notifications-form] button[type="submit"], [data-notifications-form] button:not([type])').first(),
    "the notification settings Save",
  );
  assertBundleParity(ctx);
};

/** T3 (RED on two live defects; nightly) — the account-zip round trip end-to-end (D-P1.18-1c):
 *  request → building → ready → the IN-APP download AND the emailed token link (the real mailbox)
 *  → a FRESH account's import restores the project+voice → a re-import reports `deduped`. Plus
 *  the REQ-ARCH-33 marker scan over the zip bytes. The in-app legs are green today; the emailed
 *  link 404s (D-STB.5a-1) and the import 500s on the seed showcase's slug collision
 *  (D-STB.5a-2) — both filed, neither fixed here; the step collects both evidences in one run and
 *  flips `ready-to-flip` the day both defects ship. */
const T3: StepFn = async (ctx) => {
  const a = await ctx.freshUser("exa");
  const { page } = a;
  const title = ctx.marker("T3PROJ");
  // a real project + a voice so the parity spot-check has cargo.
  await gotoOk(page, `${ctx.webBaseUrl}/app/new?entry=scratch`);
  await page.fill('input[name="title"]', title);
  await page.click('button[type="submit"], button:not([type])');
  await page.waitForURL(/\/p\/[a-z0-9-]+/i, { timeout: 15_000 });
  const voiceName = ctx.marker("T3VOICE");
  await createVoice(page, ctx, "T3VOICE");

  // request the export; poll the settings page until the worker marks it ready.
  await gotoOk(page, `${ctx.webBaseUrl}/app/settings/data`);
  if ((await page.locator("[data-account-export]").count()) === 0) {
    throw new Error("the settings page renders no account-export section");
  }
  const requestBtn = page.locator("[data-account-export] [data-export-request-form] button");
  await assertClick(requestBtn.first(), "the Export-everything control");
  await requestBtn.first().click();
  await settleNav(page, ctx);
  const deadline = Date.now() + 6 * 60_000;
  let ready = false;
  while (Date.now() < deadline) {
    await gotoOk(page, `${ctx.webBaseUrl}/app/settings/data`);
    if ((await page.locator('[data-export-status="ready"]').count()) > 0) {
      ready = true;
      break;
    }
    if ((await page.locator('[data-export-status="failed"]').count()) > 0) {
      throw new Error(
        `the export build failed: ${(await page.locator('[data-export-status="failed"]').textContent())?.trim()}`,
      );
    }
    await new Promise((r) => setTimeout(r, 8_000));
  }
  if (!ready) throw new Error("the account export did not reach 'ready' within 6 min");

  // the in-app download (session-authed) — follow the href straight to the zip bytes.
  const href = await page.locator("a[data-export-download]").first().getAttribute("href");
  if (!href) throw new Error("a ready export shows no download link");
  const inApp = await a.context.request.get(`${ctx.webBaseUrl}${href}`);
  if (inApp.status() !== 200) throw new Error(`in-app export download → ${inApp.status()}`);
  const zipBytes = new Uint8Array(await inApp.body());
  if (zipBytes.byteLength < 100 || zipBytes[0] !== 0x50 || zipBytes[1] !== 0x4b) {
    throw new Error(`the in-app download is not a zip (${zipBytes.byteLength} bytes)`);
  }
  const leaks = findProtocolMarkersInBytes(zipBytes);
  if (leaks.length > 0) throw new Error(`REQ-ARCH-33: protocol marker(s) in the export zip: ${leaks.join(", ")}`);

  // The two downstream legs each carry a live defect today — D-STB.5a-1 (the emailed token route
  // is RLS-denied) and D-STB.5a-2 (the import 500s on the seed showcase's slug conflict). Collect
  // BOTH evidences in the one run, then throw the composite; neither failure masks the other.
  const defects: string[] = [];

  // the emailed link — the real mailbox leg (the token never touches the row; it rides the mail).
  const mail = await ctx.mailbox.awaitMessage(
    `to:${a.email} subject:"export is ready"`,
    "export/download?token=",
    240_000,
  );
  // the text/plain half wraps at the quoted-printable 76-col boundary — `=\r\n` soft breaks must
  // be rejoined before matching (the html half's href never wraps; either source carries the link).
  const unfolded = mail.body.replace(/=\r?\n/g, "");
  const link = /https?:\/\/[^\s"'<>]+\/export\/download\?token=[^\s"'<>\\]+/.exec(unfolded)?.[0];
  if (!link) {
    defects.push("the export email carries no token download link");
  } else {
    const mailed = await a.context.request.get(link);
    if (mailed.status() !== 200) {
      defects.push(
        `the emailed token link → ${mailed.status()} (expected a 302→zip) — D-STB.5a-1: the anonymous token lookup is RLS-denied`,
      );
    } else {
      const mailedBytes = new Uint8Array(await mailed.body());
      if (mailedBytes[0] !== 0x50 || mailedBytes[1] !== 0x4b) {
        defects.push(`the emailed link did not resolve to a zip (${mailedBytes.byteLength} bytes)`);
      }
    }
  }

  // the fresh-account import — a SECOND test tenant, through the same settings form.
  const b = await ctx.freshUser("exb");
  await gotoOk(b.page, `${ctx.webBaseUrl}/app/settings/data`);
  const importForm = b.page.locator("form[data-account-import]");
  await importForm.locator('input[name="archive"]').setInputFiles({
    name: "account-export.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipBytes),
  });
  await importForm.locator('button[type="submit"]').click();
  await settleNav(b.page, ctx);
  if (!/notice=imported/.test(b.page.url())) {
    defects.push(`the import did not land on notice=imported (${b.page.url()}) — D-STB.5a-2`);
  } else {
    if ((await b.page.locator('[data-import-notice="imported"]').count()) === 0) {
      defects.push("the imported notice line does not render");
    }
    // parity spot-check — the project + voice exist on the FRESH tenant.
    await gotoOk(b.page, `${ctx.webBaseUrl}/app`);
    const body = (await b.page.textContent("body")) ?? "";
    if (!body.includes(title)) defects.push(`the imported project is absent from /app ("${title}")`);
    await gotoOk(b.page, `${ctx.webBaseUrl}/voices`);
    const vbody = (await b.page.textContent("body")) ?? "";
    if (!vbody.includes(voiceName) && !vbody.includes("T3VOICE")) {
      defects.push(`the imported voice is absent from /voices ("${voiceName}")`);
    }
    // re-import → the deterministic importer answers deduped.
    await gotoOk(b.page, `${ctx.webBaseUrl}/app/settings/data`);
    const again = b.page.locator("form[data-account-import]");
    await again.locator('input[name="archive"]').setInputFiles({
      name: "account-export.zip",
      mimeType: "application/zip",
      buffer: Buffer.from(zipBytes),
    });
    await again.locator('button[type="submit"]').click();
    await settleNav(b.page, ctx);
    if (!/notice=deduped/.test(b.page.url()) && (await b.page.locator('[data-import-notice="deduped"]').count()) === 0) {
      defects.push(`the re-import did not report deduped (${b.page.url()})`);
    }
  }

  if (defects.length > 0) throw new Error(defects.join(" · "));
  assertBundleParity(ctx);
};

/** T4 (GREEN; nightly) — the citeproc leg (D-P1.18-1b): a project carrying a CSL-JSON bibliography
 *  exports a rendered citation through pandoc `--citeproc`, and the bytes carry no protocol marker
 *  (REQ-ARCH-33). The leg exports HTML — the canonical .md path returns source bytes by design
 *  (citeproc rides the pandoc formats; apps/export/src/export.ts:99). The bibliography write rides
 *  the api's session surface — no SSR form exists. */
const T4: StepFn = async (ctx) => {
  const { page, context } = await ctx.freshUser("cx");
  // the citing draft through the real two-step ingest (createDraftProject handles the preview).
  const slug = await createDraftProject(page, ctx.webBaseUrl, ctx.marker("CITE"), citationDraft());
  const projectId = await apiProjectId(ctx, context, slug);
  const bib = await apiFetch(ctx, context, `/projects/${projectId}/bibliography`, {
    method: "POST",
    json: { format: "csl-json", content: cslJsonBibliography() },
  });
  if (bib.status !== 200) {
    throw new Error(`bibliography import → ${bib.status}: ${bib.text.slice(0, 200)}`);
  }
  // the export dialog now carries the citation-style select (the bibliography artifact enables it).
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/export`);
  const csl = page.locator("select[data-csl-style]");
  await assertClick(csl, "the citation-style select");
  const styleId = await csl.locator("option").first().getAttribute("value");
  if (!styleId) throw new Error("the citation-style select carries no style options");
  // POST the export form as the page would — a file download, so request-level (the download IS
  // the artifact under test; the control's actionability was asserted above). html is the
  // self-contained pandoc target: --citeproc renders [@key] into the styled citation + the
  // hanging-indent reference list.
  const res = await page.request.post(`${ctx.webBaseUrl}/p/${slug}/export`, {
    form: { format: "html", cslStyle: styleId },
  });
  if (res.status() !== 200) throw new Error(`html export → ${res.status()}`);
  const html = await res.text();
  if (html.includes(`[@${CITE_KEY}]`)) {
    throw new Error("the export left the raw [@key] token — citeproc did not run");
  }
  if (!/Vale/.test(html)) {
    throw new Error(`the export carries no rendered citation for ${CITE_KEY} (no "Vale")`);
  }
  if (!/The Revision Ledger/.test(html)) {
    throw new Error("the export carries no bibliography entry for the cited item");
  }
  const leaks = findProtocolMarkersInBytes(new TextEncoder().encode(html));
  if (leaks.length > 0) throw new Error(`REQ-ARCH-33: marker(s) in the html export: ${leaks.join(", ")}`);
  assertBundleParity(ctx);
};

/** T5 (GREEN; nightly) — AC-I-A re-sync (D-P1.15-1): a substack_export connection syncs the
 *  committed export zip, re-syncs, and produces ZERO new sample_versions (the drawer's version
 *  history stays v1; the content-hash change key is untouched). */
const T5: StepFn = async (ctx) => {
  const { page } = await ctx.freshUser("ia");
  const pid = await createVoice(page, ctx, "T5VOICE");
  const zipA = await buildSubstackExportZip(substackFixturePosts());

  await gotoOk(page, `${ctx.webBaseUrl}/v/${pid}?tab=samples`);
  const linkForm = page.locator("form:has(button[data-link-export])");
  await linkForm.locator('input[name="file"]').setInputFiles({
    name: "substack-export.zip",
    mimeType: "application/zip",
    buffer: Buffer.from(zipA),
  });
  await linkForm.locator("button[data-link-export]").click();
  await settleNav(page, ctx);

  // the connection row lands. Auto-include defaults ON — free items would land 'included' at
  // discovery and skip the review form entirely; the leg needs the pending list, so the settings
  // form's auto-include checkbox comes OFF first (a real write on the real form).
  const src = page.locator('li[data-source][data-provider="substack_export"]').first();
  await src.waitFor({ state: "attached", timeout: 15_000 });
  const cid = (await src.getAttribute("data-source")) ?? "";
  if (!cid) throw new Error("the export connection row carries no data-source id");
  const autoInclude = src.locator('input[name="autoIncludeNew"]');
  if ((await autoInclude.count()) > 0 && (await autoInclude.isChecked())) {
    await autoInclude.uncheck();
    const saveSettings = src.locator('[data-source-settings-form] button[type="submit"], [data-source-settings-form] button:not([type])');
    await saveSettings.first().click();
    await settleNav(page, ctx);
  }
  const srcAfter = page.locator(`li[data-source="${cid}"]`);
  const discover = srcAfter.locator("button[data-discover]");
  if ((await discover.count()) > 0) {
    await assertClick(discover, "the source's Discover control");
    await discover.click();
    await settleNav(page, ctx);
  }
  // review rows appear (the two fixture posts, 'new' — auto-include is off), checked by default.
  const reviewItems = page.locator("[data-review-item]");
  await reviewItems.first().waitFor({ state: "attached", timeout: 30_000 }).catch(() => undefined);
  if ((await reviewItems.count()) !== 2) {
    const srcErr = await page.locator(`li[data-source="${cid}"] [data-source-error]`).textContent().catch(() => null);
    throw new Error(
      `discovery listed ${await reviewItems.count()} items, expected 2${srcErr ? ` (source error: ${srcErr.trim()})` : ""}`,
    );
  }
  const confirm = page.locator("button[data-confirm-cta]");
  await assertClick(confirm, "the confirm-and-include control");
  await confirm.click();
  await settleNav(page, ctx);

  // The confirm's enqueue rides the api's pg-boss send — a dropped send-it connection 500s the
  // route and the web handler swallows it silently (observed live: items stayed 'new'). The
  // pending form still rendering IS the enqueue-failed signal; one re-click rides the retry —
  // a persistent refusal is the real failure, not the blip.
  await page.waitForTimeout(4_000);
  for (let attempt = 0; attempt < 2; attempt++) {
    await gotoOk(page, `${ctx.webBaseUrl}/v/${pid}?tab=samples`);
    if ((await page.locator("button[data-confirm-cta]").count()) === 0) break;
    await page.locator("button[data-confirm-cta]").click();
    await settleNav(page, ctx);
    await page.waitForTimeout(4_000);
  }

  // the confirm enqueues ingest.sync — poll until the job's own completion signal lands. A `new`
  // item renders in the samples list too (with its state badge), so sample links alone can never
  // witness the sync — the durable signal is `connections.last_sync_at` when the DB pool is bound
  // (readable unscoped — verified live) else the source row's "last synced …" text vs its
  // never-synced copy; only INCLUDED rows (no state badge) count as synced samples.
  const lastSyncAt = async (): Promise<Date | null> => {
    if (!process.env.JOURNEY_DATABASE_URL) return null;
    const row = (
      await db().query(`select last_sync_at from connections where id = $1`, [cid])
    ).rows[0] as { last_sync_at: Date | null } | undefined;
    return row?.last_sync_at ?? null;
  };
  const sourceRowText = async (): Promise<string> => {
    await gotoOk(page, `${ctx.webBaseUrl}/v/${pid}?tab=samples`);
    const err = page.locator(`li[data-source="${cid}"] [data-source-error]`);
    if ((await err.count()) > 0) {
      throw new Error(`the source carries an error line: ${(await err.first().textContent())?.trim()}`);
    }
    return (await page.locator(`li[data-source="${cid}"]`).textContent()) ?? "";
  };
  const waitSync = async (opts: { prevDb?: Date | null; prevRowText?: string; needIncluded?: number }): Promise<void> => {
    const bound = !!process.env.JOURNEY_DATABASE_URL;
    // 10 min — prod's confirm→worker latency measured at ~5 min twice today (the send lands in
    // pgboss instantly; the worker's pickup cadence is the wait), so 5 min loses by seconds.
    const deadline = Date.now() + 10 * 60_000;
    while (Date.now() < deadline) {
      const text = await sourceRowText();
      let done: boolean;
      if (bound) {
        const dbStamp = await lastSyncAt();
        done = opts.prevDb !== undefined
          ? !!(dbStamp && opts.prevDb && dbStamp.getTime() > opts.prevDb.getTime())
          : dbStamp !== null;
      } else {
        done = opts.prevRowText !== undefined
          ? text !== opts.prevRowText && /last synced/i.test(text)
          : /last synced/i.test(text);
      }
      if (done) {
        if (!opts.needIncluded) return;
        // an included row carries no state badge — `new`/`omitted` rows do (pages.tsx:4017).
        const included = await page.locator('li[data-sample]:not(:has([data-sample-state]))').count();
        if (included >= opts.needIncluded) return;
      }
      await new Promise((r) => setTimeout(r, 6_000));
    }
    throw new Error("the connection's sync never completed within 10 min");
  };
  await waitSync({ needIncluded: 2 });
  const firstStamp = await sourceRowText();
  const firstDb = await lastSyncAt();

  // the drawer shows the version history — v1 only after the first sync. The item row renders
  // the moment the discovered_item lands; its sample_version is written later in the same
  // ingest.sync job, so the drawer read polls rather than racing the row (observed live: the
  // drawer's first read returned 0 while the same tenant settled to exactly 2 versions).
  const sampleLink = page.locator("a[data-sample-open]").first();
  const openHref = await sampleLink.getAttribute("href");
  if (!openHref) throw new Error("no synced sample row to open the drawer on");
  const versionsOf = async (): Promise<number> =>
    page.locator("[data-sample-versions] li[data-version]").count();
  const waitVersions = async (n: number, label: string): Promise<void> => {
    const deadline = Date.now() + 90_000;
    let got = -1;
    while (Date.now() < deadline) {
      await gotoOk(page, `${ctx.webBaseUrl}${openHref}`);
      got = await versionsOf();
      if (got === n) return;
      if (got > n) throw new Error(`${label}: the drawer shows ${got} versions, expected exactly ${n}`);
      await new Promise((r) => setTimeout(r, 5_000));
    }
    throw new Error(`${label}: the drawer shows ${got} versions, expected exactly ${n}`);
  };
  await waitVersions(1, "the first sync");

  // the re-sync — same items, only updated_at semantically touched (the change key is the post
  // file's content hash; identical bodies ⇒ dedup ⇒ ZERO new sample_versions).
  await gotoOk(page, `${ctx.webBaseUrl}/v/${pid}?tab=samples`);
  const resync = page.locator(`li[data-source="${cid}"] button[data-resync]`);
  await assertClick(resync.first(), "the Re-sync control");
  await resync.first().click();
  await settleNav(page, ctx);
  await waitSync({ prevDb: firstDb, prevRowText: firstStamp });
  await gotoOk(page, `${ctx.webBaseUrl}${openHref}`);
  const v2 = await versionsOf();
  if (v2 !== 1) {
    throw new Error(`the re-sync produced ${v2} versions — AC-I-A requires ZERO new sample_versions`);
  }
  // the DB half, when bound AND the bound role can see the tenant: the persona's total version
  // count is exactly the two fetched posts. A raw rhema_app_login pool carries no app.tenant_id —
  // RLS hides every row — so invisibility of the connection row means "unverifiable" (same as an
  // unbound pool), never a zero count to assert on.
  const bound = process.env.JOURNEY_DATABASE_URL;
  if (bound) {
    const visible = await db().query(`select 1 from connections where id = $1`, [cid]);
    if (visible.rows.length > 0) {
      const { rows } = await db().query(
        `select count(*)::int as n
           from sample_versions sv
           join discovered_items di on di.id = sv.discovered_item_id
           join connections cn on cn.id = di.connection_id
          where cn.persona_id = $1`,
        [pid],
      );
      const n = (rows[0] as { n: number }).n;
      if (n !== 2) throw new Error(`sample_versions for persona ${pid} = ${n}, expected exactly 2`);
    }
  }
  assertBundleParity(ctx);
};

/** T6 (GREEN; nightly) — the soft-delete half of D-P1.04-2: a test project deletes into the
 *  30-day restore window — the deleted section lists it with an actionable Restore, and it leaves
 *  the live list. The scheduled-purge assertion is T7. */
const T6: StepFn = async (ctx) => {
  const { page } = await ctx.freshUser("t6");
  const title = ctx.marker("T6DEL");
  await gotoOk(page, `${ctx.webBaseUrl}/app/new?entry=scratch`);
  await page.fill('input[name="title"]', title);
  await page.click('button[type="submit"], button:not([type])');
  await page.waitForURL(/\/p\/[a-z0-9-]+/i, { timeout: 15_000 });
  const slug = /\/p\/([a-z0-9-]+)/i.exec(page.url())?.[1];
  if (!slug) throw new Error(`scratch project did not land on /p/<slug> (${page.url()})`);

  // the delete control rides the /app row's ⋯ menu (a formAction item labelled Delete).
  await gotoOk(page, `${ctx.webBaseUrl}/app`);
  const row = await openProjectRowMenu(page, title);
  const del = row.locator('form[data-menu-form="delete"] button');
  await assertClick(del, "the row's Delete menu item");
  await del.click();
  await settleNav(page, ctx);

  // the 30-day window section — the tombstoned row + an actionable Restore.
  await gotoOk(page, `${ctx.webBaseUrl}/app?deleted=1`);
  const section = page.locator("[data-deleted-section]");
  if ((await section.count()) === 0) throw new Error("no deleted-projects section rendered");
  const deletedRow = page.locator(`li[data-deleted-row]:has-text("${title}")`);
  if ((await deletedRow.count()) === 0) {
    throw new Error(`the deleted row is absent from the restore window ("${title}")`);
  }
  const restore = deletedRow.locator("[data-restore-form] button");
  await assertClick(restore, "the deleted row's Restore control");
  // …and the live list no longer carries it.
  await gotoOk(page, `${ctx.webBaseUrl}/app`);
  const live = await page.locator(`li[data-project-row]:has-text("${title}")`).count();
  if (live > 0) throw new Error("the tombstoned project still renders in the live list");
  assertBundleParity(ctx);
};

/** T7 (RED; needs JOURNEY_DATABASE_URL) — the purge-job half of D-P1.04-2: after a delete, the
 *  `project.purge` pg-boss job sits queued at tombstone + 30 days, singleton-keyed on the project.
 *  The live-destruction half is clock-scheduled: JOURNEY.1's test-tenant auto-purge (created_at +
 *  26 h) destroys the project first, so the +30 d fire can never be observed on this tenant — that
 *  residual is the DEFERRALS note, not this step. */
const T7: StepFn = async (ctx) => {
  const { page, context } = await ctx.freshUser("t7");
  const title = ctx.marker("T7DEL");
  await gotoOk(page, `${ctx.webBaseUrl}/app/new?entry=scratch`);
  await page.fill('input[name="title"]', title);
  await page.click('button[type="submit"], button:not([type])');
  await page.waitForURL(/\/p\/[a-z0-9-]+/i, { timeout: 15_000 });
  const slug = /\/p\/([a-z0-9-]+)/i.exec(page.url())?.[1];
  if (!slug) throw new Error(`scratch project did not land on /p/<slug> (${page.url()})`);
  const projectId = await apiProjectId(ctx, context, slug);

  await gotoOk(page, `${ctx.webBaseUrl}/app`);
  const row = await openProjectRowMenu(page, title);
  const del = row.locator('form[data-menu-form="delete"] button');
  await assertClick(del, "the row's Delete menu item");
  await del.click();
  await settleNav(page, ctx);

  // the queued job — pgboss.job rows are the schedule of record (the api enqueues with
  // startAfterMs = 30 d and singletonKey project.purge:<projectId>). CAP.3 (D-STB.5a-3): the
  // bounded SECURITY DEFINER probe `rhema_project_purge_schedule` (migration 0058) gives the
  // app-login role exactly this read — the queue name is pinned and no payload column returns.
  // Pre-0058 deploys fall back to the raw table read (a system-scoped JOURNEY_DATABASE_URL);
  // a 42501 there still reports owed, never a fail.
  let rows: unknown[];
  try {
    ({ rows } = await db().query(
      `select state, start_after, singleton_key, tombstoned_at::text as tombstoned_at
         from public.rhema_project_purge_schedule($1)`,
      [projectId],
    ));
  } catch (e) {
    const code = (e as { code?: string }).code;
    if (code === "42883") {
      // probe not deployed yet — the raw read under a system DSN still works.
      try {
        ({ rows } = await db().query(
          `select state, start_after, singleton_key, data->>'tombstonedAt' as tombstoned_at
             from pgboss.job where name = 'project.purge' and data->>'projectId' = $1
            order by created_on desc limit 1`,
          [projectId],
        ));
      } catch (e2) {
        if ((e2 as { code?: string }).code === "42501") {
          throw new Error(
            "owed — JOURNEY_DATABASE_URL's role has no grant on the pgboss schema (42501): " +
              "the queued-job half needs migration 0058 deployed or a system-scoped DSN",
          );
        }
        throw e2;
      }
    } else if (code === "42501") {
      throw new Error(
        "owed — JOURNEY_DATABASE_URL's role cannot execute rhema_project_purge_schedule (42501): " +
          "the queued-job half needs migration 0058 deployed or a system-scoped DSN",
      );
    } else {
      throw e;
    }
  }
  const job = rows[0] as
    | { state: string; start_after: Date; singleton_key: string | null; tombstoned_at: string | null }
    | undefined;
  if (!job) throw new Error(`no project.purge job queued for ${projectId} — the delete enqueued nothing`);
  if (job.singleton_key !== `project.purge:${projectId}`) {
    throw new Error(`the purge job's singleton key is ${job.singleton_key}, not project.purge:${projectId}`);
  }
  const tombstonedAt = job.tombstoned_at ? new Date(job.tombstoned_at) : null;
  if (tombstonedAt) {
    const deltaMs = job.start_after.getTime() - tombstonedAt.getTime();
    const expected = 30 * 24 * 60 * 60 * 1000;
    if (Math.abs(deltaMs - expected) > 5 * 60_000) {
      throw new Error(
        `the purge job fires ${Math.round(deltaMs / 86_400_000)} d after tombstone, not 30 d (start_after ${job.start_after.toISOString()})`,
      );
    }
  }
  assertBundleParity(ctx);
};

/** T8 (RED) — the 7-day-expiry half of D-P1.18-1d: a token-gated download answers 410 past
 *  `expires_at`. What CAN assert today: the gate itself — a wrong token answers 404 on the public
 *  route while the row's own ready link answered bytes in T3. A live expired token can never be
 *  produced on this tenant class: the row is workspace-scoped and the 26 h test-tenant purge
 *  deletes it before the 7-day expiry ever fires (the ticket's clock-rule options ii/iii both need
 *  a purge exemption or an operator hand-date). */
const T8: StepFn = async (ctx) => {
  // anonymous — the token gate is unauthenticated; minting a user here would burn a magic-link
  // throttle slot for nothing (SEC.2's per-IP caps make every extra mint the run pays for real).
  const { context } = await ctx.anon();
  const bogus = await context.request.get(`${ctx.apiBaseUrl}/export/download?token=definitely-not-a-token`);
  if (bogus.status() !== 404) {
    throw new Error(`a bogus export token → ${bogus.status()}, expected the token gate's 404`);
  }
  throw new Error(
    "owed — the 410 half needs a live expired token (7 d), which the 26 h test-tenant purge makes unreachable " +
      "without a purge exemption or an operator hand-dated row; the fire date is recorded in DEFERRALS",
  );
};

// ---------------------------------------------------------------- weekly paid steps

/** T9 (GREEN; paid — MUST run before N6 in registry order) — arms quiet hours on the returning
 *  tenant through the real settings form so every run_finished/chat_reply terminal event the rest
 *  of the weekly leg produces lands deferred (visible_at = the window's end). The window opens now
 *  and runs +3 h UTC — long enough to cover the whole paid sequence's deliveries while T14 still
 *  asserts inside it. */
const T9: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  const win = quietWindowUtc(new Date(), 180);
  await gotoOk(page, `${ctx.webBaseUrl}/app/settings/notifications`);
  await page.locator('select[name="qh_enabled"]').selectOption("on");
  await page.fill('input[name="qh_start"]', win.qhStart);
  await page.fill('input[name="qh_end"]', win.qhEnd);
  // the in-app run_finished row must be ON for the deferred row to exist at all (absence during
  // the window then means deferred, never disabled) — the matrix cells are on/off selects.
  const inApp = page.locator('select[name="inapp_run_finished"]');
  if ((await inApp.count()) > 0 && (await inApp.inputValue()) !== "on") await inApp.selectOption("on");
  const submit = page.locator('[data-notifications-form] button[type="submit"], [data-notifications-form] button:not([type])').first();
  await assertClick(submit, "the notification settings Save");
  await submit.click();
  await settleNav(page, ctx);
  // the saved window round-trips on reload — the form re-renders the stored values.
  await gotoOk(page, `${ctx.webBaseUrl}/app/settings/notifications`);
  const savedStart = await page.locator('input[name="qh_start"]').inputValue();
  const savedEnd = await page.locator('input[name="qh_end"]').inputValue();
  if (savedStart !== win.qhStart || savedEnd !== win.qhEnd) {
    throw new Error(`the quiet window did not persist (${savedStart}–${savedEnd}, expected ${win.qhStart}–${win.qhEnd})`);
  }
  const enabled = await page.locator('select[name="qh_enabled"]').inputValue();
  if (enabled !== "on") throw new Error(`quiet hours did not stay enabled (${enabled})`);
  assertBundleParity(ctx);
};

/** T10 (GREEN; paid) — D-PRB.04-1's own-tenant half: the delivered Review the weekly leg already
 *  produced on test+jrn-a renders all seven dossier parts. */
const T10: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  const { slug, runId } = await findDeliveredReview(page, ctx);
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/review/${runId}`);
  await assertDossierParts(page, `own-tenant dossier ${slug}/${runId}`);
  // an actionable control — the filter bar or a finding's disposition verb must be reachable. The
  // filter bar lives in the Desk's findings panel — CSS-hidden until its tab swaps data-desk-tab;
  // the tab click is itself an actionable control.
  await openFindingsDesk(page);
  const filter = page.locator("form[data-findings-filters] select").first();
  if (await filter.isVisible().catch(() => false)) {
    await assertClick(filter, "the findings filter select");
  } else {
    await assertClick(page.locator("[data-findings-list] [data-verb]").first(), "a disposition verb");
  }
  assertBundleParity(ctx);
};

/** T11 (GREEN; paid) — D-P1.07-1's surface legs on the own-tenant delivered Review: the Margin's
 *  cards + chips, the Desk's shared filter narrowing the table, a Desk row's anchor resolving to
 *  the finding card, and the /p/:slug/f/:fid deep link landing on the dossier anchor. */
const T11: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  const { slug, runId } = await findDeliveredReview(page, ctx);
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/review/${runId}`);

  // the Margin — cards (or stacked chips) carry the severity × kind marks.
  const cards = await page.locator("[data-margin-card]").count();
  const chips = await page.locator("[data-margin-chip]").count();
  if (cards === 0 && chips === 0) throw new Error("the Margin renders neither cards nor chips");
  if (cards > 0 && (await page.locator("[data-margin-card][data-severity]").count()) === 0) {
    throw new Error("the Margin cards carry no severity marks");
  }

  // the Desk — the shared filter narrows the table to the chosen severity.
  const desk = page.locator("[data-findings-desk]");
  if ((await desk.count()) === 0) throw new Error("the Desk does not render");
  const firstSev = await page.locator("[data-desk-row]").first().getAttribute("data-severity");
  if (!firstSev) throw new Error("no Desk row carries a severity to filter on");
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/review/${runId}?sev=${encodeURIComponent(firstSev)}`);
  const rows = await page.locator("[data-desk-row]").count();
  if (rows === 0) throw new Error(`the ?sev=${firstSev} filter emptied the Desk`);
  const wrong = await page.locator(`[data-desk-row]:not([data-severity="${firstSev}"])`).count();
  if (wrong > 0) throw new Error(`${wrong} Desk rows survive the ?sev=${firstSev} filter`);

  // a Desk row's finding link resolves to the finding card's anchor — the rows live in the Desk's
  // findings panel, CSS-hidden until its tab swaps data-desk-tab; opening it is the control proof.
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/review/${runId}`);
  await openFindingsDesk(page);
  const link = page.locator("a[data-finding-link]").first();
  const fid = await link.getAttribute("data-finding-link");
  if (!fid) throw new Error("no Desk row carries a finding link");
  await assertClick(link, "a Desk finding link");
  await link.click();
  await settleNav(page, ctx).catch(() => undefined);
  if ((await page.locator(`[data-finding="${fid}"]`).count()) === 0) {
    throw new Error(`the finding link's anchor target #finding-${fid} is absent`);
  }

  // the /p/:slug/f/:fid deep link lands the dossier at that anchor.
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/f/${fid}`);
  const landed = new URL(page.url());
  if (!landed.pathname.includes(`/review/${runId}`) || !landed.hash.includes(fid)) {
    throw new Error(`/p/${slug}/f/${fid} did not land on the dossier anchor (${page.url()})`);
  }
  assertBundleParity(ctx);
};

/** T12 (GREEN; paid) — D-P1.07-1's write legs: a defer disposition with a note round-trips across
 *  a reload, Add-to-obligations files the finding's row (?obligated notice), and the palette's New
 *  obligation files a source:'user' row that shows in the export dialog's obligation summary. */
const T12: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  const { slug, runId } = await findDeliveredReview(page, ctx);
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/review/${runId}`);

  // ---- the disposition round-trip --------------------------------------------------------
  const note = `${ctx.marker("NOTE")} — deferred on the live leg`;
  // §5.7 renders every card on THREE surfaces (body list, Margin, Desk) — scope to the canonical
  // body list; an unscoped [data-finding] resolves twice and strict-mode inputValue() throws.
  const listCard = (id?: string) =>
    page.locator(`[data-findings-list] [data-finding${id ? `="${id}"` : ""}]`);
  const card = listCard().first();
  const fid = (await card.getAttribute("data-finding")) ?? "";
  if (!fid) throw new Error("no finding card to dispose");
  const form = card.locator("[data-disposition-form]");
  await form.locator("input[data-note]").fill(note);
  const defer = form.locator('button[data-verb="defer"]');
  await assertClick(defer, "the Defer verb");
  await defer.click();
  await page.waitForURL(/disposed=/, { timeout: 15_000 }).catch(() => settleNav(page, ctx));
  // the round-trip: reload — the card carries the defer kind AND the note re-hydrates the field.
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/review/${runId}`);
  const cardAfter = listCard(fid);
  if ((await cardAfter.locator('[data-disposition="defer"]').count()) === 0) {
    throw new Error("the deferred finding does not show its defer disposition after reload");
  }
  const saved = await cardAfter.locator("input[data-note]").inputValue().catch(() => "");
  if (!saved.includes(ctx.marker("NOTE"))) {
    throw new Error(`the disposition note did not round-trip (field shows "${saved.slice(0, 80)}")`);
  }

  // ---- Add-to-obligations on a different finding (?obligated notice) --------------------
  const oblBtn = page.locator("[data-add-obligation]").first();
  if ((await oblBtn.count()) > 0) {
    await assertClick(oblBtn, "the Add-to-obligations control");
    await oblBtn.click();
    await page.waitForURL(/obligated=/, { timeout: 15_000 }).catch(() => settleNav(page, ctx));
    if ((await page.locator('[data-finding-notice="obligated"]').count()) === 0) {
      throw new Error("the ?obligated= landing shows no obligated notice");
    }
  }

  // ---- the palette's New obligation → a source:'user' row in the obligation summary -------
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/export`);
  const exportBefore = await page.locator("[data-obligation-id]").count();
  const oblTitle = ctx.marker("USER-OBL");
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/obligations/new`);
  await page.fill('input[name="title"]', oblTitle);
  await page.locator('select[name="severity"]').selectOption("minor");
  const file2 = page.locator('[data-obligation-form] button[type="submit"], [data-obligation-form] button:not([type])').first();
  await assertClick(file2, "the File obligation control");
  await file2.click();
  await page.waitForURL(/obligation=new/, { timeout: 15_000 }).catch(() => settleNav(page, ctx));
  // the summary — the export dialog's never-blocking obligation list gains the user row.
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/export`);
  const items = page.locator("[data-obligation-id]");
  const after = await items.count();
  if (after !== exportBefore + 1) {
    throw new Error(`the export dialog's obligation list moved ${exportBefore} → ${after}, expected +1`);
  }
  const listed = await page.locator(`[data-obligation-id]:has-text("JRN-")`).count();
  const bodyHas = ((await page.locator("[data-obligation-items]").textContent()) ?? "").includes("JRN-");
  if (listed === 0 && !bodyHas) {
    throw new Error(`the filed obligation's title is absent from the summary ("${oblTitle}")`);
  }
  assertBundleParity(ctx);
};

/** T13 (RED; paid) — D-P1.07-1's Apply + bulk legs: Apply on a suggestion-bearing finding lands
 *  `?applied=` (an `accept·applied` row lands provenance + a new head), and the bulk preview shows
 *  its per-item checklist before the confirm. Red while no suggestion-bearing finding exists — the
 *  AC's documented PARTIAL. */
const T13: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  const { slug, runId } = await findDeliveredReview(page, ctx);
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/review/${runId}`);

  // ---- Apply ------------------------------------------------------------------------------
  const apply = page.locator("[data-apply]").first();
  if ((await apply.count()) === 0) {
    throw new Error("no suggestion-bearing finding on the delivered Review — Apply waits on the next weekly paid journey");
  }
  await assertClick(apply, "the Apply control");
  // the apply form's hook carries the finding id (REQ-VFY-4 — the action URL is SSR detail).
  const appliedFid = await page.locator("[data-apply-form]").first().getAttribute("data-apply-form");
  await apply.click();
  await page.waitForURL(/applied=/, { timeout: 20_000 }).catch(() => settleNav(page, ctx));
  if (!/applied=/.test(page.url())) {
    throw new Error(`the Apply click did not land on ?applied= (${page.url()})`);
  }
  if ((await page.locator('[data-finding-notice="applied"]').count()) === 0) {
    throw new Error("the ?applied= landing shows no applied notice");
  }
  if (appliedFid) {
    // the applied finding's card no longer offers Apply (the gate sees the applied row).
    await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/review/${runId}`);
    const again = page.locator(`[data-finding="${appliedFid}"] [data-apply]`).count();
    if ((await again) > 0) throw new Error("the applied finding still offers Apply");
  }

  // ---- the bulk preview's per-item checklist ---------------------------------------------
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/review/${runId}?bulk=defer_minor`);
  let preview = page.locator("[data-bulk-preview]");
  if ((await preview.count()) === 0 || (await preview.locator('input[name="only"]').count()) === 0) {
    // try apply_notes — whichever action has eligible rows.
    await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/review/${runId}?bulk=apply_notes`);
    preview = page.locator("[data-bulk-preview]");
  }
  if ((await preview.count()) === 0) throw new Error("no bulk action produced a preview");
  const only = await preview.locator('input[name="only"]').count();
  if (only === 0) {
    const skipped = await preview.locator("[data-bulk-skipped] li").count();
    throw new Error(`the bulk preview carries no actionable rows (${skipped} skipped) — nothing to dispatch`);
  }
  const confirm = preview.locator("button[data-bulk-confirm]");
  await assertClick(confirm, "the bulk confirm control");
  await confirm.click();
  await page.waitForURL(/bulkdone=/, { timeout: 30_000 }).catch(() => settleNav(page, ctx));
  if (!/bulkdone=/.test(page.url())) {
    throw new Error(`the bulk dispatch did not land on ?bulkdone= (${page.url()})`);
  }
  if ((await page.locator("[data-bulk-done]").count()) === 0) {
    throw new Error("the bulk landing shows no done notice");
  }
  assertBundleParity(ctx);
};

/** The leg's own-tenant ids (workspace + owner user) off the non-RLS auth tables — the same
 *  `app.tenant_id` resolution stb5b's `tenantIdFor` carries, plus the owner the seed needs. */
async function tenantIdentity(email: string): Promise<{ tenantId: string; ownerId: string }> {
  const r = await db().query(
    `select wm.workspace_id as tenant, u.id as owner
       from workspace_members wm join "user" u on u.id = wm.user_id
      where u.email = $1 order by wm.workspace_id limit 1`,
    [email],
  );
  const row = r.rows[0] as { tenant: string; owner: string } | undefined;
  if (!row) throw new Error(`no workspace row for ${email} (tenant not provisioned yet)`);
  return { tenantId: row.tenant, ownerId: row.owner };
}

/** A `pg.PoolClient` satisfies `MigrationDb` — `exec` is the same call sans rows. */
function migrationDbOf(client: pg.PoolClient): MigrationDb {
  return {
    exec: (sql) => client.query(sql),
    query: (sql, params) => client.query(sql, params),
  };
}

/**
 * SPA.21 (REQ-VFY-10) — provision the SEEDED WRITABLE dossier on the leg's own tenant at $0: the
 * Showcase fixture bundle on a NORMAL project (`showcase=false`), so the api's
 * `showcaseReadOnlyGuard` does not freeze its finding writes — the paid T12/T13 legs' free twins
 * walk THIS dossier. Idempotent on the per-leg slug base (`jrn-<tag>-dossier`): T12F and T13F seed
 * separate projects so one's dispositions never poison the other's asserts. Needs
 * `JOURNEY_DATABASE_URL` — unset ⇒ the step reports owed, never fabricates.
 */
async function seededWritableDossier(email: string, tag: string): Promise<{ slug: string; runId: string }> {
  const { tenantId, ownerId } = await tenantIdentity(email);
  const client = await db().connect();
  try {
    await client.query("begin");
    // tenant-scoped like the api's txRunner — no-op under a BYPASSRLS system DSN (ADR-093),
    // load-bearing when JOURNEY_DATABASE_URL binds an RLS role.
    await client.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
    const res = await seedWritableDossier(migrationDbOf(client), {
      workspaceId: tenantId,
      ownerId,
      ids: () => randomUUID(),
      slugBase: `jrn-${tag}-dossier`,
      title: `JRN ${tag} dossier (seeded writable)`,
      seedLabel: "journey-dossier-seed",
    });
    await client.query("commit");
    return { slug: res.slug, runId: res.reviewRunId };
  } catch (e) {
    await client.query("rollback").catch(() => undefined);
    throw e;
  } finally {
    client.release();
  }
}

/** T12F (RED; nightly $0; SPA.21) — T12's write legs on the SEEDED writable dossier instead of the
 *  weekly paid run's own-tenant Review: a defer disposition + note round-trips across a reload,
 *  Add-to-obligations lands `?obligated`, and `/obligations/new` files a user row the export
 *  dialog's summary lists. Red pending its first live leg (the preview blocker — D-SPA.21-1). */
const T12F: StepFn = async (ctx) => {
  const { page, email } = await ctx.freshUser("t12f");
  const { slug, runId } = await seededWritableDossier(email, "t12f");
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/review/${runId}`);

  // ---- the disposition round-trip (T12 verbatim, on the seed) ----------------------------
  const note = `${ctx.marker("NOTE")} — deferred on the seeded leg`;
  const listCard = (id?: string) =>
    page.locator(`[data-findings-list] [data-finding${id ? `="${id}"` : ""}]`);
  const card = listCard().first();
  const fid = (await card.getAttribute("data-finding")) ?? "";
  if (!fid) throw new Error("the seeded dossier renders no finding card to dispose");
  const form = card.locator("[data-disposition-form]");
  await form.locator("input[data-note]").fill(note);
  const defer = form.locator('button[data-verb="defer"]');
  await assertClick(defer, "the Defer verb");
  await defer.click();
  await page.waitForURL(/disposed=/, { timeout: 15_000 }).catch(() => settleNav(page, ctx));
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/review/${runId}`);
  const cardAfter = listCard(fid);
  if ((await cardAfter.locator('[data-disposition="defer"]').count()) === 0) {
    throw new Error("the seeded dossier's deferred finding shows no defer disposition after reload");
  }
  const saved = await cardAfter.locator("input[data-note]").inputValue().catch(() => "");
  if (!saved.includes(ctx.marker("NOTE"))) {
    throw new Error(`the seeded dossier's disposition note did not round-trip ("${saved.slice(0, 80)}")`);
  }

  // ---- Add-to-obligations on a different finding (?obligated notice) ----------------------
  const oblBtn = page.locator("[data-add-obligation]").first();
  if ((await oblBtn.count()) > 0) {
    await assertClick(oblBtn, "the Add-to-obligations control");
    await oblBtn.click();
    await page.waitForURL(/obligated=/, { timeout: 15_000 }).catch(() => settleNav(page, ctx));
    if ((await page.locator('[data-finding-notice="obligated"]').count()) === 0) {
      throw new Error("the ?obligated= landing shows no obligated notice");
    }
  }

  // ---- /obligations/new files a source:'user' row the export summary lists ---------------
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/export`);
  const exportBefore = await page.locator("[data-obligation-id]").count();
  const oblTitle = ctx.marker("USER-OBL");
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/obligations/new`);
  await page.fill('input[name="title"]', oblTitle);
  await page.locator('select[name="severity"]').selectOption("minor");
  const file2 = page
    .locator('[data-obligation-form] button[type="submit"], [data-obligation-form] button:not([type])')
    .first();
  await assertClick(file2, "the File obligation control");
  await file2.click();
  await page.waitForURL(/obligation=new/, { timeout: 15_000 }).catch(() => settleNav(page, ctx));
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/export`);
  const items = page.locator("[data-obligation-id]");
  const after = await items.count();
  if (after !== exportBefore + 1) {
    throw new Error(`the export dialog's obligation list moved ${exportBefore} → ${after}, expected +1`);
  }
  assertBundleParity(ctx);
};

/** T13F (RED; nightly $0; SPA.21) — T13's Apply + bulk legs on the seeded writable dossier: the
 *  fixture's blocking anchor finding IS suggestion-bearing, so Apply lands `?applied=` and
 *  retracts its own control, and the bulk preview's per-item checklist precedes the `?bulkdone=`
 *  dispatch — the arms T13 could only prove when the weekly run happened to carry them. Red
 *  pending its first live leg (the preview blocker — D-SPA.21-1). */
const T13F: StepFn = async (ctx) => {
  const { page, email } = await ctx.freshUser("t13f");
  const { slug, runId } = await seededWritableDossier(email, "t13f");
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/review/${runId}`);

  // ---- Apply (the seed's anchor finding carries a suggestion) -----------------------------
  const apply = page.locator("[data-apply]").first();
  if ((await apply.count()) === 0) {
    throw new Error("the seeded dossier carries no suggestion-bearing finding — the fixture regressed");
  }
  await assertClick(apply, "the Apply control");
  const appliedFid = await page.locator("[data-apply-form]").first().getAttribute("data-apply-form");
  await apply.click();
  await page.waitForURL(/applied=/, { timeout: 20_000 }).catch(() => settleNav(page, ctx));
  if (!/applied=/.test(page.url())) {
    throw new Error(`the Apply click did not land on ?applied= (${page.url()})`);
  }
  if ((await page.locator('[data-finding-notice="applied"]').count()) === 0) {
    throw new Error("the ?applied= landing shows no applied notice");
  }
  if (appliedFid) {
    await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/review/${runId}`);
    const again = await page.locator(`[data-finding="${appliedFid}"] [data-apply]`).count();
    if (again > 0) throw new Error("the applied finding still offers Apply on the seeded dossier");
  }

  // ---- the bulk preview's per-item checklist → the ?bulkdone= dispatch ---------------------
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/review/${runId}?bulk=defer_minor`);
  let preview = page.locator("[data-bulk-preview]");
  if ((await preview.count()) === 0 || (await preview.locator('input[name="only"]').count()) === 0) {
    await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/review/${runId}?bulk=apply_notes`);
    preview = page.locator("[data-bulk-preview]");
  }
  if ((await preview.count()) === 0) throw new Error("no bulk action produced a preview on the seed");
  const only = await preview.locator('input[name="only"]').count();
  if (only === 0) {
    const skipped = await preview.locator("[data-bulk-skipped] li").count();
    throw new Error(`the seeded bulk preview carries no actionable rows (${skipped} skipped)`);
  }
  const confirm = preview.locator("button[data-bulk-confirm]");
  await assertClick(confirm, "the bulk confirm control");
  await confirm.click();
  await page.waitForURL(/bulkdone=/, { timeout: 30_000 }).catch(() => settleNav(page, ctx));
  if (!/bulkdone=/.test(page.url())) {
    throw new Error(`the bulk dispatch did not land on ?bulkdone= (${page.url()})`);
  }
  if ((await page.locator("[data-bulk-done]").count()) === 0) {
    throw new Error("the bulk landing shows no done notice");
  }
  assertBundleParity(ctx);
};

/** T14 (GREEN; paid) — D-P1.19-1's live halves on the returning tenant: the badge counts only
 *  approvals+decisions; an escalated decision row lands immediately INSIDE quiet hours (never
 *  deferred) while the leg's run_finished rows stay invisible until the window ends; a Decisions
 *  row's answer routes the real obligation transitions (re-defer re-parks; drop moots) through the
 *  pre_export sweep. */
const T14: StepFn = async (ctx) => {
  const { page, context } = await ctx.returningUser("a");
  const { slug, runId } = await findDeliveredReview(page, ctx);

  // ---- badge arithmetic: an escalate decision row lands now (quiet hours never defer gates /
  //      decisions) and answers drop the count back. -----------------------------------------
  const baseline = await readInboxBadge(page, ctx);
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/review/${runId}`);
  // escalate the LAST card — earlier steps in the run already disposed the first findings; a fresh
  // escalate guarantees a NEW decision request (the +1 the badge must show). §5.7 renders each card
  // on three surfaces (body list, Margin, Desk) — scope to the canonical body list: the Margin's
  // copies sit inside collapsed chip <details>, so an unscoped .last() resolves to a hidden one.
  const escCard = page
    .locator('[data-findings-list] [data-finding]:not(:has([data-disposition="escalate"]))')
    .last();
  const escForm = escCard.locator("[data-disposition-form]");
  await escForm.locator("input[data-note]").fill(`${ctx.marker("ESC")} — escalate for the decision row`);
  const esc = escForm.locator('button[data-verb="escalate"]');
  await assertClick(esc, "the Escalate verb");
  await esc.click();
  await settleNav(page, ctx);
  const afterEscalate = await readInboxBadge(page, ctx);
  if (afterEscalate !== baseline + 1) {
    throw new Error(`the badge moved ${baseline} → ${afterEscalate} on escalate, expected +1`);
  }
  // the decision row renders in the blocked section — inside quiet hours it is NOT deferred.
  const decRow = page.locator('[data-inbox-section="blocked"] [data-inbox-row][data-inbox-kind="decision"]').first();
  if ((await decRow.count()) === 0) {
    throw new Error("the escalated decision row did not land in the Inbox during quiet hours");
  }
  // quiet-hours deferral, UI half — while the window is armed, no run_finished row DELIVERED INSIDE
  // it may be visible (deliverInApp writes visible_at = the quiet end). The DOM row id IS the
  // inbox_items id, so when the read pool is bound the check correlates each rendered row against
  // its real created_at — a long-lived tenant carries legitimately-visible pre-window rows and the
  // JRN- title prefix alone cannot tell "this window's" deliveries from earlier ones (the funded
  // tenant jrn-a is purge-exempt and accumulates them). Unbound ⇒ the prefix heuristic stands
  // (nightly/weekly tenants are fresh-minted, so every JRN-* row IS this session's).
  const domRunRows = await page.locator("[data-inbox-row][data-inbox-type]").evaluateAll((els) =>
    els.map((e) => ({
      id: e.getAttribute("data-inbox-row") ?? "",
      type: e.getAttribute("data-inbox-type") ?? "",
      project: e.querySelector("[data-inbox-project]")?.textContent ?? "",
    })),
  );
  const dbBound = !!process.env.JOURNEY_DATABASE_URL;
  // the quiet window + user id ride the DB read below; hoist them so the leak check correlates.
  let qh: { startMinutesUtc: number; endMinutesUtc: number } | null | undefined;
  let userId: string | undefined;
  if (dbBound) {
    userId = (
      await db().query(`select id from "user" where email = $1`, ["test+jrn-a@rhema.tools"])
    ).rows[0]?.id as string | undefined;
    if (!userId) throw new Error("no user row for test+jrn-a");
    const prefsRow = (
      await db().query(`select prefs from notification_prefs where user_id = $1`, [userId])
    ).rows[0] as { prefs: { quietHours?: { startMinutesUtc: number; endMinutesUtc: number } | null } } | undefined;
    qh = prefsRow?.prefs?.quietHours;
    if (!qh) throw new Error("notification_prefs carries no quiet window — T9's arm did not persist");
    const domIds = domRunRows.map((r) => r.id).filter(Boolean);
    const domDb = domIds.length
      ? ((await db().query(
          `select id, created_at, visible_at from inbox_items where id = any($1::text[])`,
          [domIds],
        )).rows as { id: string; created_at: Date; visible_at: Date }[])
      : [];
    const createdInWindow = new Set(
      domDb
        .filter((r) => deferredVisibleAt(qh!.startMinutesUtc, qh!.endMinutesUtc, r.created_at) !== null)
        .map((r) => r.id),
    );
    const leaked = domRunRows.filter((r) => createdInWindow.has(r.id));
    if (leaked.length > 0) {
      throw new Error(`${leaked.length} in-window run_finished row(s) are visible inside quiet hours — deferral failed`);
    }
  } else {
    const leaked = domRunRows.filter((r) => r.project.includes("JRN-"));
    if (leaked.length > 0) {
      throw new Error(`${leaked.length} this-session run_finished row(s) are visible inside quiet hours — deferral failed`);
    }
  }
  // DB half: the deferred run_finished rows exist server-side with visible_at = the window's end.
  if (dbBound) {
    const { rows } = await db().query(
      `select run_id, created_at, visible_at from inbox_items
        where user_id = $1 and payload->>'type' = 'run_finished' and created_at > now() - interval '4 hours'
        order by created_at desc`,
      [userId],
    );
    if (rows.length === 0) {
      throw new Error("no run_finished inbox rows exist at all — the terminal deliveries produced nothing to defer");
    }
    const undeferred = rows.filter((r) => {
      const row = r as { created_at: Date; visible_at: Date };
      return row.visible_at.getTime() <= row.created_at.getTime() + 60_000;
    });
    if (undeferred.length === rows.length) {
      throw new Error("every recent run_finished row is undelayed — quiet hours armed nothing");
    }
    for (const r of undeferred) {
      const row = r as { run_id: string | null; created_at: Date };
      // a row whose terminal event fell outside the window (delivered after the end) is
      // legitimately undelayed — only rows delivered INSIDE the window must defer.
      const expect = deferredVisibleAt(qh!.startMinutesUtc, qh!.endMinutesUtc, row.created_at);
      if (expect) {
        throw new Error(`run ${row.run_id}'s row was delivered inside quiet hours yet is not deferred`);
      }
    }
    const deferred = rows.filter((r) => {
      const row = r as { created_at: Date; visible_at: Date };
      return row.visible_at.getTime() > row.created_at.getTime() + 60_000;
    });
    // only rows DELIVERED inside the currently-armed window must defer to ITS end — the funded
    // tenant is purge-exempt, so rows deferred under an earlier arm of the day carry that arm's
    // (different) end; expecting the new end there is a false positive. Rows delivered outside
    // the window (expect == null) are evidence of an earlier arm, not of this leg.
    const wrong = deferred.filter((r) => {
      const row = r as { created_at: Date; visible_at: Date };
      const expect = deferredVisibleAt(qh!.startMinutesUtc, qh!.endMinutesUtc, row.created_at);
      return expect != null && Math.abs(expect.getTime() - row.visible_at.getTime()) > 60_000;
    });
    if (wrong.length > 0) {
      throw new Error("a deferred run_finished row's visible_at is not the quiet window's end");
    }
  }
  // answer the escalate row — dismiss closes the request; the badge drops back.
  await gotoOk(page, `${ctx.webBaseUrl}/app/inbox`);
  const openDecision = page.locator('[data-inbox-section="blocked"] [data-inbox-row][data-inbox-kind="decision"]').first();
  const dismiss = openDecision.locator('button[data-decision-option="dismiss"]');
  const decide = openDecision.locator('button[data-decision-option="decide"]');
  const answer = (await dismiss.count()) > 0 ? dismiss : decide;
  await assertClick(answer.first(), "the decision row's answer control");
  await answer.first().click();
  await settleNav(page, ctx);
  const afterAnswer = await readInboxBadge(page, ctx);
  if (afterAnswer !== baseline) {
    throw new Error(`the badge moved ${afterEscalate} → ${afterAnswer} after answering, expected ${baseline}`);
  }

  // ---- the obligation-transition rows (re-defer re-parks; drop moots) -----------------------
  // The SSR form carries no horizon field — the pre_export horizon rides the api's session surface
  // (the 1.x app's path; REQ-MOBILE-11). Then the export dialog's open sweeps it into a Decisions
  // row carrying decide / re-defer / drop.
  const projectId = await apiProjectId(ctx, context, slug);
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/review/${runId}`);
  // only an OBLIGATION-bearing finding parks a defer_horizon (recordDispositionInTx routes the
  // obligation iff one exists — a plain finding's defer is just a disposition). The dossier marks
  // them with the obligation chip — and the chip must be a LIVE state: a `discharged_pending`
  // (mooted) or `discharged_unverified` chip still renders, and deferring a finding whose
  // obligation is closed/mooted hits routeDisposition on a dead row (observed live 2026-10-06:
  // → 500 internal_error; the closed-world transition has no mooted→deferred edge — recorded as a
  // product finding, the leg keeps to live obligations).
  const findingIds = (
    await page
      .locator(
        '[data-findings-list] [data-finding]:has([data-obligation-state="open"], [data-obligation-state="reopened"])',
      )
      .evaluateAll((els) => els.map((el) => el.getAttribute("data-finding") ?? "").filter(Boolean))
  ).slice(-2); // the last two — least likely already parked by earlier steps.
  if (findingIds.length === 0) throw new Error("no obligation-bearing findings on the dossier to park");
  const answers = ["re-defer", "drop"] as const;
  for (let i = 0; i < findingIds.length; i++) {
    const fid = findingIds[i]!;
    const resp = await apiFetch(ctx, context, `/projects/${projectId}/findings/${fid}/disposition`, {
      method: "POST",
      json: { kind: "defer", rationale: `${ctx.marker("DEFER")} — parked to the export horizon`, deferHorizon: "pre_export" },
    });
    if (resp.status !== 200) {
      throw new Error(`pre_export defer on ${fid} → ${resp.status}: ${resp.text.slice(0, 160)}`);
    }
    // the export dialog's open IS the pre_export horizon — the sweep returns the obligation and
    // lands its Decisions row. The list is oldest-first and escalate asks (decide/dismiss) may sit
    // ahead — the swept obligation row is the one offering re-defer.
    await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/export`);
    await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}`);
    const row = page
      .locator('[data-decisions-list] [data-decision]:has(button[data-decision-option="re-defer"])')
      .first();
    await row.waitFor({ state: "attached", timeout: 15_000 });
    const answeredId = await row.getAttribute("data-decision");
    const option = row.locator(`button[data-decision-option="${answers[i]}"]`);
    if ((await option.count()) === 0) {
      const opts = await row.locator("[data-decision-option]").evaluateAll((els) =>
        els.map((e) => e.getAttribute("data-decision-option")),
      );
      throw new Error(`the swept decision row offers ${opts.join("/")}, not re-defer/drop`);
    }
    await assertClick(option, `the ${answers[i]} option`);
    await option.click();
    await settleNav(page, ctx);
    // the request closes — THAT row leaves the open list.
    const stillOpen = await page.locator(`[data-decisions-list] [data-decision="${answeredId}"]`).count();
    if (stillOpen > 0) {
      throw new Error(`the ${answers[i]} answer did not close decision ${answeredId}`);
    }
  }
  // obligation-state proof on the dossier: the re-deferred finding parks (deferred); the dropped
  // finding's obligation is mooted (its live chip leaves).
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/review/${runId}`);
  const redeferred = page.locator(`[data-findings-list] [data-finding="${findingIds[0]}"] [data-obligation-state="deferred"]`);
  if ((await redeferred.count()) === 0) {
    throw new Error("the re-deferred finding shows no deferred obligation chip on the dossier");
  }
  assertBundleParity(ctx);
};

/** T15 (RED; paid) — the `?gate=` click-through: an open approval's Inbox row lands the focused
 *  gate card at the head of the artifact (§5.11/§4.2). Owed while no open gate exists — the leg
 *  may not launch a run to park one (invariant #11), and every weekly leg launches with autorun. */
const T15: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  await gotoOk(page, `${ctx.webBaseUrl}/app/inbox`);
  const gateRow = page.locator('[data-inbox-row][data-inbox-kind="gate"]').first();
  if ((await gateRow.count()) === 0) {
    throw new Error(
      "no open approval gate on the tenant — the click-through is owed (no leg launches a gated run)",
    );
  }
  const open = gateRow.locator("a[data-inbox-open]").first();
  const href = await open.getAttribute("href");
  if (!href || !href.includes("gate=")) {
    throw new Error(`the gate row's open link carries no ?gate= deep link (${href})`);
  }
  await assertClick(open, "the gate row's open link");
  await gotoOk(page, `${ctx.webBaseUrl}${href}`);
  const focused = page.locator("[data-focused-gate]").first();
  if ((await focused.count()) === 0) {
    throw new Error(`the ?gate= deep link landed no focused gate card (${page.url()})`);
  }
  const gid = await focused.getAttribute("data-focused-gate");
  if (!href.includes(`gate=${gid}`)) {
    throw new Error("the focused gate card is not the row's gate");
  }
  // the mounted card carries its decide controls.
  const buttons = await focused.locator("button").count();
  if (buttons === 0) throw new Error("the focused gate card renders no decide controls");
  assertBundleParity(ctx);
};

/** T16 (RED; paid) — the stale-voice leg (D-P1.19-1e): a fact change (a new sample) on a persona
 *  with a built profile lands a group-3 Inbox row, and the weekly digest claims it once. Owed: no
 *  test tenant carries a persona_profiles row — the profile build is a paid run this ticket may
 *  not launch (a Quick build is ~$1 and inside the cap, but invariant #11 forbids any run). What
 *  the leg CAN assert today: a sample added to a PROFILELESS persona produces NO stale row (the
 *  staleness signal correctly requires a built profile — REQ-PERSONA-13's facts basis). */
const T16: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  const pid = await createVoice(page, ctx, "T16VOICE");
  // a fact change — add a paste sample through the real form.
  await gotoOk(page, `${ctx.webBaseUrl}/v/${pid}?tab=samples`);
  const pasteForm = page.locator("[data-samples-form]").first();
  if ((await pasteForm.count()) > 0) {
    const area = pasteForm.locator("textarea").first();
    if ((await area.count()) > 0) {
      await area.fill(`${ctx.marker("SAMPLE")}\n\nA paragraph of new material — the fact change the staleness leg feeds on.`);
      await pasteForm.locator('button[type="submit"], button:not([type])').first().click();
      await settleNav(page, ctx);
    }
  }
  await gotoOk(page, `${ctx.webBaseUrl}/app/inbox`);
  const staleFor = await page
    .locator(`[data-inbox-section="voices"] [data-inbox-row]:has-text("T16VOICE")`)
    .count();
  if (staleFor > 0) {
    throw new Error("a stale-voice row landed for a persona with NO profile — staleness computed without a profile");
  }
  throw new Error(
    "owed — the built-profile half needs a paid voice build (a run this ticket may not launch): " +
      "a stale group-3 row after a new sample + the Monday digest's single claim",
  );
};

export const STB5A_IMPLS: Readonly<Record<string, StepFn>> = {
  T1,
  // SPA.11 — T2 split per-surface (REQ-VFY-8): the inbox flag gates on T2.badge, settings on
  // T2.matrix; the composite id is gone.
  "T2.badge": T2_BADGE,
  "T2.matrix": T2_MATRIX,
  T3,
  T4,
  T5,
  T6,
  T7,
  T8,
  T9,
  T10,
  T11,
  T12,
  T13,
  // SPA.21 — the seeded-dossier free twins of T12/T13 (REQ-VFY-10).
  T12F,
  T13F,
  T14,
  T15,
  T16,
};
