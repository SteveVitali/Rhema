// R7OPEN.1 (REQ-DACC-8; spec §10 owner map as amended by the Phase-4 split rows) — the wired
// owed-stub for every round-7 D*/U* leg and the two sub-assertions. Each stub fails LOUDLY with
// an explicit "owed — owner <ticket>" error: the runner classifies a red step's failure as
// `owed` (a debt on the owner, never a run failure), so these legs can never re-redden the
// nightly and can never read `ready-to-flip` before the owner lands the real body (AGENTS.md §
// Code Conventions: a step stays `expected:"red"` until its owner proves Stage B with a
// screenshot). Flips happen only in the phase deploys — 224_R7DEP.1 (R7a) and 250_R7DEP.2 (R7b)
// — plus 248_R7TOUR.2 as D2.tour's sanctioned re-flipper (P4-23, GD-PREVIEW.R7).

import { join } from "node:path";
import { DEMO_ESSAYS, DEMO_DOCUMENT_ROUTE_IDS, DEMO_HUB_ESSAYS } from "@rhema/contracts";
import type { StepFn } from "./runner.js";
import { attachDemoRecord, crawlDemo, routeIdMatches } from "./demo-side-effects.js";
import { gotoOk, settleClientNav } from "./settle.js";
import {
  assertBundleParity,
  assertNoOverflow,
  AXE_SOURCE,
  IPHONE_USER_AGENT,
} from "./steps.js";
import { assertActionable } from "./occlusion.js";

// R7DEM.4b — helpers shared by the two demo legs. Assertions derive every expectation from
// the contracts registry (DEMO_ESSAYS / DEMO_ROUTE_IDS) or the served document's own
// vocabulary — never from hard-coded essay text (the ticket's data discipline).

/** The first non-fixture essay — the public corpus, never the synthetic mini-corpus. */
const FIRST_ESSAY = DEMO_ESSAYS.find((e) => e.fixture !== true)!;

/** The served shell's boot JSON (the `<script data-spa-boot>` embed), decoded. */
async function bootJson(page: import("playwright").Page): Promise<Record<string, unknown> | null> {
  const raw = await page
    .locator("script[data-spa-boot]")
    .first()
    .textContent()
    .catch(() => null);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/** The demo boot fact inside the embed, or null when the shell isn't a demo shell. */
async function demoBoot(page: import("playwright").Page): Promise<{
  essay: string;
  slug: string;
  signedIn: boolean;
  build: string | null;
} | null> {
  const boot = await bootJson(page);
  const d = boot?.demo;
  if (d == null || typeof d !== "object") return null;
  return d as { essay: string; slug: string; signedIn: boolean; build: string | null };
}

/** The visible content the two session arms must share: the rendered surface's text. */
async function demoContentText(page: import("playwright").Page): Promise<string> {
  const sel = "[data-page-root], [data-spa-surface], [data-demo-banner]";
  return (await page.locator(sel).allTextContents()).join("\n");
}

/**
 * R7DEM.4b (REQ-DACC-1, REQ-DACC-5) — `R11.demo`: a signed-in walk of the demo renders the
 * same content as the logged-out walk. The legs compare the FIRST registry essay's page
 * surface plus every registered essay's document GET (200 + a demo boot), across
 * `ctx.anon()` and `ctx.returningUser("a")` — the boot's `signedIn` is cookie PRESENCE
 * only, so a planted-cookie stand-in exercises the identical code path locally. Stays
 * `expected:"red"` at head — 224 flips with real returningUser evidence.
 */
const R11_DEMO: StepFn = async (ctx) => {
  const signedIn = await ctx.returningUser("a");
  const anon = await ctx.anon();
  // The hub: same public SSR document for both cookie states.
  for (const [page, want] of [
    [signedIn.page, true],
    [anon.page, false],
  ] as const) {
    await gotoOk(page, `${ctx.webBaseUrl}/demo`, ctx);
    const h1 = await page.locator("h1").count();
    if (h1 !== 1) throw new Error(`signedIn=${want} /demo hub rendered ${h1} h1s (want 1)`);
    // 221a — the filled hub: the four ordered essay cards render identically either side of
    // the cookie boundary (the card facts are corpus data, never session data).
    const cardCount = await page.locator("[data-demo-essay-card]").count();
    if (cardCount !== DEMO_HUB_ESSAYS.length) {
      throw new Error(`signedIn=${want} /demo rendered ${cardCount} essay cards (want ${DEMO_HUB_ESSAYS.length})`);
    }
  }
  const [hubSignedIn, hubAnon] = await Promise.all([
    signedIn.page.locator("main").first().textContent(),
    anon.page.locator("main").first().textContent(),
  ]);
  if (hubSignedIn !== hubAnon) {
    throw new Error("signed-in /demo renders a different hub than logged-out — a session-only variant");
  }
  // Every PUBLIC essay's document: 200 + a demo boot + the SAME visible content; the only
  // permitted difference is `demo.signedIn` (cosmetic) and the banner's exit set. The
  // synthetic fixture row is skipped — it is not a public hub card and the deployed corpus
  // does not serve it (its snapshot lives only in the fixture corpus root).
  for (const essay of DEMO_ESSAYS.filter((e) => e.fixture !== true)) {
    for (const [page, want] of [
      [signedIn.page, true],
      [anon.page, false],
    ] as const) {
      await gotoOk(page, `${ctx.webBaseUrl}/demo/${essay.essay}`, ctx);
      const renderer = await page.locator("html").getAttribute("data-renderer");
      if (renderer !== "spa") {
        throw new Error(`/demo/${essay.essay} signedIn=${want} served data-renderer=${renderer ?? "(absent)"}`);
      }
      await page.locator("[data-demo-banner], [data-spa-surface], [data-page-root]").first().waitFor({ timeout: 30_000 });
      const demo = await demoBoot(page);
      if (demo == null || demo.slug !== essay.slug) {
        throw new Error(`/demo/${essay.essay} signedIn=${want} boot.demo missing or wrong slug (${JSON.stringify(demo)})`);
      }
      if (demo.signedIn !== want) {
        throw new Error(`/demo/${essay.essay} boot.demo.signedIn=${demo.signedIn} — cookie presence misread`);
      }
      const exits = await page.locator("[data-demo-exit]").all();
      if (exits.length === 0) throw new Error(`/demo/${essay.essay} has no data-demo-exit`);
      for (const exit of exits) {
        if ((await exit.getAttribute("data-spa-native")) == null) {
          throw new Error("a data-demo-exit is missing data-spa-native — an exit would share the demo client");
        }
      }
    }
    const [inText, outText] = [await demoContentText(signedIn.page), await demoContentText(anon.page)];
    // The banner exits differ by session — compare the CONTENT surface only.
    const strip = (t: string) => t.replace(/Create your account|Sign in|Back to your projects/g, "").trim();
    if (strip(inText) !== strip(outText)) {
      throw new Error(`/demo/${essay.essay} content differs signed-in vs logged-out`);
    }
  }
  // The signed-in walk continues inside the demo — a demo-namespace link is a CLIENT nav
  // (never a document reload), by the boundary predicate.
  await signedIn.page
    .locator(`a[href="/demo/${FIRST_ESSAY.essay}/figures"], a[href="/p/${FIRST_ESSAY.slug}/figures"]`)
    .first()
    .waitFor({ timeout: 30_000 })
    .catch(() => undefined);
  await gotoOk(signedIn.page, `${ctx.webBaseUrl}/demo/${FIRST_ESSAY.essay}/figures`, ctx);
  await signedIn.page.locator("[data-demo-banner]").first().waitFor({ timeout: 30_000 });
  await signedIn.page.screenshot({ path: join(ctx.outDir, "r11-demo.png"), fullPage: true });
  assertBundleParity(ctx);
};

/**
 * R7DEM.4b (REQ-DACC-4 restated; D-FIX.1-2's real-UA pattern) — `P1.demo`: demo Pages render
 * SPA-compact at 390 and 320 px — a REAL mobile-UA context (Chromium's own UA-CH, never a
 * header shim), `data-renderer="spa"` + `data-device="phone"` (ADR-126's REQ-ED-12
 * amendment), no horizontal overflow, axe clean, and no desktop-capability subtree (no
 * editable PM, no bulk/apply affordances). Stays `expected:"red"` — 224 flips.
 */
const P1_DEMO: StepFn = async (ctx) => {
  for (const w of [390, 320] as const) {
    const phone = await ctx.browser.newContext({
      baseURL: ctx.webBaseUrl,
      userAgent: IPHONE_USER_AGENT,
      viewport: { width: w, height: 844 },
      isMobile: true,
      hasTouch: true,
    });
    try {
      const page = await phone.newPage();
      await gotoOk(page, `${ctx.webBaseUrl}/demo/${FIRST_ESSAY.essay}`, ctx);
      const html = page.locator("html");
      const [renderer, device] = await Promise.all([
        html.getAttribute("data-renderer"),
        html.getAttribute("data-device"),
      ]);
      // the demo verdict is SPA on EVERY device class — the REQ-ED-12 forced-SSR arm must
      // not fire (a demo Page has no SSR document to hand off to).
      if (renderer !== "spa" || device !== "phone") {
        throw new Error(
          `phone demo Page @${w} classified renderer=${renderer ?? "(absent)"} device=${device ?? "(absent)"} — expected spa/phone`,
        );
      }
      await page.locator("[data-page-root], [data-spa-surface]").first().waitFor({ timeout: 30_000 });
      // SPA-compact: the PM view never mounts editable, and no desktop-capability subtree
      // (bulk/apply affordances, the editable ProseMirror) renders.
      const editable = await page.locator('.ProseMirror[contenteditable="true"]').count();
      if (editable > 0) throw new Error(`phone demo Page @${w} mounts an editable ProseMirror`);
      for (const sel of ["[data-bulk-controls]", "[data-apply]"]) {
        if ((await page.locator(sel).count()) > 0) {
          throw new Error(`phone demo Page @${w} mounts the desktop-capability affordance ${sel}`);
        }
      }
      await assertNoOverflow(page, `demo Page @${w}`);
      // 221a — the hub extension: the filled /demo SSR page at phone widths carries the four
      // essay cards with no horizontal overflow (the provenance paragraph rides along).
      await gotoOk(page, `${ctx.webBaseUrl}/demo`, ctx);
      if ((await page.locator("[data-demo-essay-card]").count()) !== DEMO_HUB_ESSAYS.length) {
        throw new Error(`/demo @${w} rendered the wrong card set`);
      }
      await assertNoOverflow(page, `demo hub @${w}`);
      await page.screenshot({ path: join(ctx.outDir, `p1-demo-hub-${w}.png`), fullPage: true });
      // axe clean — injected via Runtime.evaluate (CSP-safe), the P1-family pattern.
      await page.evaluate(AXE_SOURCE);
      const violations = await page.evaluate(async () => {
        const w2 = globalThis as unknown as {
          axe?: { run(d: Document, o: object): Promise<{ violations: { id: string }[] }> };
        };
        if (!w2.axe) throw new Error("axe-core did not inject");
        const res = await w2.axe.run(document, {
          runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] },
        });
        return res.violations.map((v) => v.id);
      });
      if (violations.length > 0) throw new Error(`axe violations @${w}: ${violations.join(", ")}`);
      await page.screenshot({ path: join(ctx.outDir, `p1-demo-${w}.png`), fullPage: true });
    } finally {
      await phone.close();
    }
  }
  assertBundleParity(ctx);
};

/** The leg's full assert contract, kept next to the stub so the owner's real body has the
 *  checklist in-tree (the registry `asserts` line is the one-line summary). */
const CONTRACTS: Readonly<Record<string, string>> = {
  "D1.hub":
    "the /demo SSR hub: N10 invariants (distinct branded title, one h1, description/OG/Twitter, favicon), four essay cards in the SPD→GM→POV→CoR order each visible + actionable (assertActionable), the persistent read-only provenance banner, landing hero secondary CTA + /showcase link + footer link all resolving to /demo",
  "D2.tour":
    "the guided tour on Structure of Political Difference, every step walked: coach mark visible, its DOM-contract target un-occluded, Next/Back actionable, route change through settleClientNav vs settleDocumentNav as the step declares, non-modal free-roam exit, final CTA → /signup?src=demo (logged out) / New project (signed in)",
  "D3.readonly":
    "anon() AND returningUser('a'): zero same-origin non-GET requests except the REQ-TOUR-9 POST, zero EventSource/WebSocket opens, zero 4xx/5xx, no mutation forms or contenteditable anywhere on the demo walk",
  "P1.demo":
    "390×844 and 320 px real-UA phone contexts: no horizontal overflow, axe clean, the SPA-compact demo Page renders and REQ-UX-10's desktop-capability set never mounts (REQ-DACC-4 — NOT the forced-SSR phone reader contract; real projects keep it)",
  "R11.demo":
    "returningUser('a') signed in: /demo renders the same content as the logged-out walk — same cards, same banner — with the account chrome added, never a session-only variant",
  "U1.shell":
    "every authenticated leaf renders inside the one AppShell: the sidebar carries wordmark/New project/Search/recent projects/Inbox(badge)/Voices/Usage/Settings/Demo/account menu, collapses to the icon rail and back with the state remembered, pending/error/404 states render in-shell",
  "U2.noreload":
    "the scripted walk (list → project → dossier → compare → export → settings → inbox → chat send → gate approve → Showcase → back): performance navigation entries stay 1 and the window marker persists — zero document loads, S-14's named document navigations excepted by name",
  "U3.occlusion":
    "the five-width probe (1440×900, 1280×800, 1024×768, 820×1180, 390×844 emulated): zero intersection between the Page text column / dossier letter column / every tour target and any un-scrimmed panel, overlay or menu; no main column < 45 ch at ≥768 px",
  "U4.controls":
    "the computed-style probe over the 12 migrated surfaces (project list, inbox, settings, billing, usage, voices, run sheet, export, import, new project, outline, figures, plus the IDE dossier batch): zero elements rendering with native button/input/select/textarea chrome outside the named no-JS/SSR exemption list",
  "U5.write":
    "new project creates a blank editable Page (no dialog, inline title focused) → type commits → the format bubble appears ABOVE the selection → Comment lands anchored Guidance in the margin → focus mode enters and Esc exits → the single Rich text/Source toggle soft-wraps prose",
  "U6.chat":
    "the stubbed turn: Send posts the JSON mutation (201 + turn id), an optimistic user bubble renders, progress events stream over the run-event channel with no document reload, the reply renders on completion, and an empty send is blocked client-side — free, stubbed, never a paid:true row",
  "U7.import":
    "paste markdown with a leading # H1 → the H1 becomes the title (never dropped), the typeset preview lists every normalization in Conversion notes, a clean conversion offers one 'Create draft', and the imported draft is editable immediately (not frozen)",
  "U3.stopgap":
    "the R7a stopgap geometry: the 1024–1279 Timeline overlay and the <1024 sheet carry a scrim with Esc/outside-click dismiss, open on demand (never persisted from overlay mode), the page column reflows at ≥1280 with Files open, and the Desk head is never occluded by the status bar",
  "R8.showcase.spa":
    "the signed-in Showcase resolves to the workspace Showcase (or the static sample) rendered data-renderer=\"spa\" under ReadOnlyProject — the REQ-DACC-6 renderer re-expectation; the green R8.showcase leg's asserts still hold",
};

function owedStub(id: string): StepFn {
  return async () => {
    throw new Error(
      `${id} owed — owner ${ownerOf(id)}: leg body lands in the owner's PR; ` +
        `the phase deploy flips it (224 R7a / 250 R7b). Contract: ${CONTRACTS[id]}`,
    );
  };
}

const OWNERS: Readonly<Record<string, string>> = {
  "D1.hub": "R7DEM.5b",
  "D2.tour": "R7DEM.6a",
  "D3.readonly": "R7DEM.5",
  "P1.demo": "R7DEM.4b",
  "R11.demo": "R7DEM.4b",
  "U1.shell": "R7SHELL.1a",
  "U2.noreload": "R7RELOAD.1",
  "U3.occlusion": "R7PANE.1",
  "U4.controls": "R7KIT.3e",
  "U5.write": "R7WRITE.1b",
  "U6.chat": "R7TALK.1a",
  "U7.import": "R7HOME.2a",
  "U3.stopgap": "R7FIX.1",
  "R8.showcase.spa": "R7RO.1",
};

function ownerOf(id: string): string {
  return OWNERS[id] ?? "unknown";
}

/** R7RO.1 (REQ-RELOAD-5, REQ-DACC-6) — the real `R8.showcase.spa` body: the signed-in `/showcase`
 *  resolves to the workspace Showcase served as the SPA SHELL under ReadOnlyProject — the
 *  renderer re-expectation. The in-app hop to the dossier and back settles as a CLIENT
 *  navigation (zero document loads), the read-only notice mounts, and the green `R8.showcase`
 *  asserts (the workspace Showcase renders — never the static sample's SSR floor) still hold.
 *  Stage B stays deferred to the 224 phase deploy — this leg keeps `expected:"red"` at head. */
const R8_SHOWCASE_SPA: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  // `/showcase` document-redirects to the workspace Showcase's `/p/<slug>` document — a DOCUMENT
  // nav (the shell serves it; ADR-128's forced-SSR verdict is phone-only now).
  await gotoOk(page, `${ctx.webBaseUrl}/showcase`, ctx);
  if (!/\/p\/[^/]+/.test(page.url())) {
    throw new Error(`signed-in /showcase did not land on the workspace Showcase (${page.url()})`);
  }
  const renderer = await page.locator("html").getAttribute("data-renderer");
  if (renderer !== "spa") {
    throw new Error(`the workspace Showcase is ${renderer ?? "renderer-less"} — the SPA read-only arm did not mount`);
  }
  // the read-only mechanism mounts the notice + the mounted Page stays non-editable — a real
  // `contenteditable` body would mean the read-only posture failed open.
  if ((await page.locator("[data-readonly-notice='showcase']").count()) === 0) {
    throw new Error("the showcase notice (ReadOnlyProject{showcase}) did not mount");
  }
  // in-app hops are client navigations — the dossier link is the Page family's own walk.
  const dossierLink = page.locator('a[href*="/review/"]').first();
  if ((await dossierLink.count()) === 0) {
    throw new Error("the Showcase overview carries no dossier link to hop through");
  }
  await settleClientNav(page, ctx, async () => {
    await dossierLink.click();
  });
  // the dossier's showcase banner carries the SAME notice (the mechanism's own slot) — and it
  // must be the SPA render again, never a document reload.
  if ((await page.locator("[data-readonly-notice='showcase'], [data-showcase-banner]").count()) === 0) {
    throw new Error("the showcase dossier carries no read-only notice");
  }
  const dossierRenderer = await page.locator("html").getAttribute("data-renderer");
  if (dossierRenderer !== "spa") {
    throw new Error(`the dossier hop re-rendered as ${dossierRenderer ?? "renderer-less"} — a document nav escaped the SPA`);
  }
  // back to the overview — a second client nav.
  const back = page.locator(`a[href="/p/${page.url().split("/p/")[1]?.split("/")[0] ?? ""}"]`).first();
  if ((await back.count()) > 0) {
    await settleClientNav(page, ctx, async () => {
      await back.click();
    });
  }
  await page.screenshot({ path: `${ctx.outDir}/r8-showcase-spa.png`, fullPage: true });
  assertBundleParity(ctx);
};

/** R7FIX.1 (REQ-PANE-0) — the real `U3.stopgap` body: the stopgap geometry probe at the four
 *  reference sizes on a signed-in IDE surface. Asserts no open un-scrimmed overlay/sheet ever
 *  intersects the Page text column or the finding ticks (nor the dossier letter column when
 *  walked), the Timeline is closed by default below 1280, an opened overlay/sheet carries a
 *  scrim and Esc closes it, the Desk tabs stay actionable, and focus view shows the exit pill
 *  and Esc leaves it. Stays `expected:"red"` at head — 224 flips at the phase preview. */
const U3_STOPGAP: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  await gotoOk(page, `${ctx.webBaseUrl}/showcase`, ctx);
  // Deterministic pane defaults — the leg must not depend on a prior leg's stored arrangement.
  await page.evaluate(() => {
    for (const k of Object.keys(localStorage)) {
      if (k.startsWith("rhema:panes:")) localStorage.removeItem(k);
    }
  });
  const overlayCheck = (): Promise<string | null> =>
    page.evaluate(() => {
      const box = (el: Element | null): { x: number; y: number; w: number; h: number } | null => {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        return r.width === 0 && r.height === 0 ? null : { x: r.left, y: r.top, w: r.width, h: r.height };
      };
      const hit = (a: { x: number; y: number; w: number; h: number } | null, b: typeof a): boolean =>
        a != null && b != null && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      const scrim = document.querySelector<HTMLElement>("[data-ide-scrim]");
      const scrimShown = scrim != null && getComputedStyle(scrim).display !== "none";
      const paper = box(document.querySelector(".ide-page .paper"));
      const ticks = box(document.querySelector(".ide-margin"));
      const letter = box(document.querySelector("article .paper"));
      for (const sel of [".ide-timeline", ".ide-files"]) {
        const el = document.querySelector<HTMLElement>(sel);
        if (!el) continue;
        const pos = getComputedStyle(el).position;
        if ((pos !== "absolute" && pos !== "fixed") || scrimShown) continue;
        const r = box(el);
        if (hit(r, paper) || hit(r, ticks) || hit(r, letter)) {
          return `${sel} sits un-scrimmed over the page/dossier column or the finding ticks`;
        }
      }
      return null;
    });
  const ideAttr = async (name: string): Promise<string | null> =>
    page.locator("[data-ide]").getAttribute(name);
  for (const [w, h] of [[1440, 900], [1280, 800], [1024, 768], [820, 1180]] as const) {
    await page.setViewportSize({ width: w, height: h });
    await gotoOk(page, `${ctx.webBaseUrl}/showcase`, ctx);
    await page.locator("[data-ide][data-pane-mode]").waitFor({ state: "attached" });
    if (w < 1280 && (await ideAttr("data-timeline")) === "open") {
      throw new Error(`the Timeline auto-opened as an overlay/sheet at ${w}×${h}`);
    }
    const bad = await overlayCheck();
    if (bad) throw new Error(`${bad} at ${w}×${h}`);
    // the Desk head stays actionable — the status bar may never cover it (B2).
    await page.keyboard.press("Control+j");
    for (const tab of ["chat", "feed", "findings", "claims"] as const) {
      await assertActionable(page.locator(`[data-ide-desk-tab='${tab}']`), `Desk tab ${tab} @${w}×${h}`);
    }
    await page.keyboard.press("Control+j");
    if (w < 1280) {
      // on demand → scrimmed; Esc closes it again.
      await page.keyboard.press("Control+2");
      if ((await ideAttr("data-timeline")) !== "open") {
        throw new Error(`the Timeline did not open on demand at ${w}×${h}`);
      }
      const scrimmed = await page.evaluate(() => {
        const s = document.querySelector<HTMLElement>("[data-ide-scrim]");
        return s != null && getComputedStyle(s).display !== "none";
      });
      if (!scrimmed) throw new Error(`the open overlay/sheet has no scrim at ${w}×${h}`);
      await page.keyboard.press("Escape");
      if ((await ideAttr("data-timeline")) !== "closed") {
        throw new Error(`Esc did not close the overlay/sheet at ${w}×${h}`);
      }
    }
    // focus view: the exit pill mounts, Esc leaves (REQ-WRITE-4).
    await page.keyboard.press("Control+Shift+f");
    if ((await ideAttr("data-view")) !== "focus") {
      throw new Error(`focus view did not engage at ${w}×${h}`);
    }
    if ((await page.locator("[data-ide-focus-exit]").count()) === 0) {
      throw new Error(`no focus-exit pill at ${w}×${h}`);
    }
    await page.keyboard.press("Escape");
    if ((await ideAttr("data-view")) !== "write") {
      throw new Error(`Esc did not leave focus view at ${w}×${h}`);
    }
    await page.screenshot({ path: `${ctx.outDir}/u3-stopgap-${w}x${h}.png` });
  }
  assertBundleParity(ctx);
};

/** Twin-derived seed URLs — the leg asks the essay's own JSON reads which concrete routes
 *  exist (a corpus that holds no v2 has no diff page to walk). Node-side fetches: the seeds
 *  are harness-side discovery, not page emissions. */
async function demoSeedsFor(webBaseUrl: string, slug: string): Promise<string[]> {
  const essay = slug.replace(/^demo~/, "");
  const get = async (path: string): Promise<unknown | null> => {
    try {
      const r = await fetch(`${webBaseUrl}${path}`);
      return r.ok ? await r.json() : null;
    } catch {
      return null;
    }
  };
  const seeds = new Set<string>();
  const push = (inner: string) => seeds.add(`/demo/${essay}${inner}`);
  const versions = (await get(`/bff/p/${slug}/versions`)) as
    | { drafts?: { n?: number }[] }
    | null;
  const ns = (versions?.drafts ?? [])
    .map((d) => d.n)
    .filter((n): n is number => typeof n === "number")
    .sort((a, b) => a - b);
  for (const n of ns) push(`/v/${n}`);
  for (let i = 0; i + 1 < ns.length; i++) push(`/v/${ns[i]}/diff/${ns[i + 1]}`);
  const figures = (await get(`/bff/p/${slug}/figures`)) as
    | { items?: { id?: string }[] }
    | null;
  if ((figures?.items?.length ?? 0) > 0) {
    push(`/figures`);
    for (const f of figures!.items ?? []) if (f.id) push(`/figures/${f.id}`);
  }
  const timeline = (await get(`/bff/p/${slug}/timeline`)) as
    | { rounds?: { runs?: { runId?: string }[] }[]; ungrouped?: { runId?: string }[] }
    | null;
  const runIds = [
    ...(timeline?.rounds ?? []).flatMap((r) => r.runs ?? []),
    ...(timeline?.ungrouped ?? []),
  ]
    .map((r) => r.runId)
    .filter((x): x is string => typeof x === "string");
  for (const runId of runIds) {
    push(`/review/${runId}`);
    push(`/r/${runId}`);
  }
  // the response-ledger artifacts + revisions the Files/WhatChanged twins name.
  const files = (await get(`/bff/p/${slug}/files`)) as
    | { sections?: { rows?: { artifactId?: string }[]; advancedRows?: { artifactId?: string }[] }[] }
    | null;
  for (const s of files?.sections ?? []) {
    for (const r of [...(s.rows ?? []), ...(s.advancedRows ?? [])]) {
      if (r.artifactId) push(`/a/${r.artifactId}`);
    }
  }
  return [...seeds];
}

/**
 * R7DEM.5 (REQ-DACC-1/3/5) — `D3.readonly`: the recording proxy's asserts over BOTH session
 * arms — anon() AND returningUser("a") — walking `/demo` and every registered essay's public
 * routes: zero same-origin non-GET requests except the REQ-TOUR-9 `POST /a/demo` carve-out,
 * zero EventSource/WebSocket opens, zero same-origin 4xx/5xx, no `method="post"` forms and no
 * `contenteditable` anywhere on the walk. Stage A: local server + bundled Chromium;
 * 224 flips it on the R7a preview.
 */
const D3_READONLY: StepFn = async (ctx) => {
  const origin = new URL(ctx.webBaseUrl).origin;
  const essays = DEMO_ESSAYS.filter((e) => e.fixture !== true);
  for (const [tag, arm] of [
    ["anon", await ctx.anon()],
    ["returning", await ctx.returningUser("a")],
  ] as const) {
    const collect = attachDemoRecord(arm.page, origin);
    // the hub — a public document, still inside the allowlist.
    await gotoOk(arm.page, `${ctx.webBaseUrl}/demo`, ctx);
    for (const essay of essays) {
      // Seeds derived from the essay's OWN twins (versions → /v/n + diffs, figures → cards,
      // the timeline's runIds → dossier/report): every route shape the corpus actually holds
      // is walked; a shape the essay doesn't hold is absent, never a false miss.
      const seeds = await demoSeedsFor(ctx.webBaseUrl, essay.slug);
      const visited = await crawlDemo(arm.page, { essay: essay.essay, seeds, interactions: false });
      // every route shape the corpus HOLDS must have been reached — a missing one is a
      // contract miss; a shape absent from the twins is simply not this essay's surface.
      for (const id of DEMO_DOCUMENT_ROUTE_IDS) {
        const shapeSeeded = seeds.some((s) => routeIdMatches(id, s, essay.essay));
        if (shapeSeeded && !visited.some((v) => routeIdMatches(id, v, essay.essay))) {
          throw new Error(`D3.readonly ${tag}: route coverage miss ${id} on ${essay.essay}`);
        }
      }
      // the read-only DOM contract: no mutation affordance survives the walk — no post form,
      // no editable surface.
      const posts = await arm.page.locator('form[method="post"]:visible, form[method="POST"]:visible').count();
      if (posts > 0) throw new Error(`D3.readonly ${tag}: ${posts} mutation form(s) on ${essay.essay}`);
      const editable = await arm.page
        .locator('[contenteditable="true"], [contenteditable=""]')
        .count();
      if (editable > 0) {
        throw new Error(`D3.readonly ${tag}: ${editable} contenteditable node(s) on ${essay.essay}`);
      }
    }
    await arm.page.screenshot({ path: join(ctx.outDir, `d3-readonly-${tag}.png`), fullPage: true });
    const violations = [
      ...collect.violations,
      ...collect.badResponses.map((b) => `${b.status} on ${b.url}`),
    ];
    if (violations.length > 0) {
      throw new Error(`D3.readonly ${tag}: ${violations.length} side-effect/fault(s):\n  ${violations.slice(0, 20).join("\n  ")}`);
    }
    if (collect.websockets.length > 0) {
      throw new Error(`D3.readonly ${tag}: ${collect.websockets.length} WebSocket(s) opened`);
    }
  }
  assertBundleParity(ctx);
};

/**
 * 221a R7DEM.5b (REQ-DACC-1; REQ-TOUR-1/8) — `D1.hub`: the `/demo` SSR hub at desktop,
 * narrow-desktop and phone widths: N10's public-document invariants (distinct branded title,
 * exactly one h1, description/OG/Twitter meta, favicon link), the four essay cards in the
 * `DEMO_HUB_ESSAYS` (SPD→GM→POV→CoR) order each visible with an actionable "Open in Rhēma"
 * link, and the agent-discourse provenance paragraph + byline present. The tour-entry links on
 * landing/showcase/footer are 222's (moved out of this leg per the ticket's note). Stays
 * `expected:"red"` — 224 flips it on the R7a phase preview.
 */
const D1_HUB: StepFn = async (ctx) => {
  const { page } = await ctx.anon();
  for (const w of [1440, 1024, 390] as const) {
    await page.setViewportSize({ width: w, height: 900 });
    await gotoOk(page, `${ctx.webBaseUrl}/demo`, ctx);
    // N10 invariants on /demo
    const title = await page.title();
    if (!title || !/Rhēma/.test(title)) throw new Error(`D1.hub @${w}: <title> "${title}" unbranded/empty`);
    if ((await page.locator("h1").count()) !== 1) throw new Error(`D1.hub @${w}: not exactly one <h1>`);
    for (const sel of [
      'meta[name="description"]',
      'meta[property="og:title"]',
      'meta[property="og:description"]',
      'meta[name="twitter:card"]',
      'link[rel="icon"]',
    ]) {
      if ((await page.locator(sel).count()) === 0) throw new Error(`D1.hub @${w}: missing ${sel}`);
    }
    // four essay cards in the canonical order, each visible with an actionable open link
    const cards = page.locator("[data-demo-essay-card]");
    if ((await cards.count()) !== DEMO_HUB_ESSAYS.length) {
      throw new Error(`D1.hub @${w}: ${await cards.count()} essay cards (want ${DEMO_HUB_ESSAYS.length})`);
    }
    const order = await cards.evaluateAll((els) =>
      els.map((e) => e.getAttribute("data-demo-essay-card")),
    );
    if (JSON.stringify(order) !== JSON.stringify([...DEMO_HUB_ESSAYS])) {
      throw new Error(`D1.hub @${w}: card order ${JSON.stringify(order)}`);
    }
    for (const essay of DEMO_HUB_ESSAYS) {
      const card = page.locator(`[data-demo-essay-card='${essay}']`);
      if (!(await card.isVisible())) throw new Error(`D1.hub @${w}: ${essay} card not visible`);
      // a visitor scrolls the stacked cards into view — the actionable probe needs the
      // center point on-screen (elementFromPoint is null off-viewport).
      await card.scrollIntoViewIfNeeded();
      await assertActionable(
        card.locator(`a[href='/demo/${essay}']:not([data-demo-look-at])`).first(),
        `D1.hub @${w} ${essay} open link`,
      );
    }
    // the hero's tour CTA + the provenance paragraph (agent-discourse, roles, byline)
    if ((await page.locator("[data-demo-tour-entry]").count()) === 0) {
      throw new Error(`D1.hub @${w}: no tour-entry CTA on the hero card`);
    }
    const prov = page.locator("[data-demo-provenance]");
    if (!(await prov.isVisible())) throw new Error(`D1.hub @${w}: no provenance paragraph`);
    const provText = (await prov.textContent()) ?? "";
    if (!/agent-discourse/.test(provText) || !/the writer/.test(provText) || !/S\. J\. Sebastian/.test(provText)) {
      throw new Error(`D1.hub @${w}: provenance paragraph incomplete`);
    }
    await page.screenshot({ path: join(ctx.outDir, `d1-hub-${w}.png`), fullPage: true });
  }
  assertBundleParity(ctx);
};

const REAL_BODIES: Readonly<Record<string, StepFn>> = {
  "D1.hub": D1_HUB,
  "R8.showcase.spa": R8_SHOWCASE_SPA,
  "U3.stopgap": U3_STOPGAP,
  "R11.demo": R11_DEMO,
  "P1.demo": P1_DEMO,
  "D3.readonly": D3_READONLY,
};

export const R7_LEGS_IMPLS: Readonly<Record<string, StepFn>> = Object.fromEntries(
  Object.keys(OWNERS).map((id) => [id, REAL_BODIES[id] ?? owedStub(id)]),
);
