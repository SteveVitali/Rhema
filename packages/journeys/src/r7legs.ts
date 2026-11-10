// R7OPEN.1 (REQ-DACC-8; spec §10 owner map as amended by the Phase-4 split rows) — the wired
// owed-stub for every round-7 D*/U* leg and the two sub-assertions. Each stub fails LOUDLY with
// an explicit "owed — owner <ticket>" error: the runner classifies a red step's failure as
// `owed` (a debt on the owner, never a run failure), so these legs can never re-redden the
// nightly and can never read `ready-to-flip` before the owner lands the real body (AGENTS.md §
// Code Conventions: a step stays `expected:"red"` until its owner proves Stage B with a
// screenshot). Flips happen only in the phase deploys — 224_R7DEP.1 (R7a) and 250_R7DEP.2 (R7b)
// — plus 248_R7TOUR.2 as D2.tour's sanctioned re-flipper (P4-23, GD-PREVIEW.R7).

import { join } from "node:path";
import { DEMO_ESSAYS, DEMO_DOCUMENT_ROUTE_IDS, DEMO_HUB_ESSAYS, isDemoNamespacePath } from "@rhema/contracts";
import type { StepFn } from "./runner.js";
import { attachDemoRecord, crawlDemo, routeIdMatches } from "./demo-side-effects.js";
import { assertNoReload, guard3Segment, plantGuard3Marker } from "./noreload.js";
import { gotoOk, settleClientNav, settleDocumentNav } from "./settle.js";
import {
  assertBundleParity,
  assertNoOverflow,
  AXE_SOURCE,
  IPHONE_USER_AGENT,
} from "./steps.js";
import { u3ProbePage, u3UnscrimmedViolation } from "./u3-probe.js";
import { U4_SURFACES, assertU4Clean, u4ProbePage } from "./u4-probe.js";
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
    await gotoOk(page, `${ctx.webBaseUrl}/demo?src=jrn`, ctx);
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
      await gotoOk(page, `${ctx.webBaseUrl}/demo/${essay.essay}?src=jrn`, ctx);
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
  await gotoOk(signedIn.page, `${ctx.webBaseUrl}/demo/${FIRST_ESSAY.essay}/figures?src=jrn`, ctx);
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
      await gotoOk(page, `${ctx.webBaseUrl}/demo/${FIRST_ESSAY.essay}?src=jrn`, ctx);
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
      await gotoOk(page, `${ctx.webBaseUrl}/demo?src=jrn`, ctx);
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
    "every authenticated leaf renders inside the one AppShell: the sidebar carries wordmark/New project/Search/recent projects/Inbox(badge)/Voices/Usage/Settings/Demo/account menu, collapses to the icon rail and back with the state remembered, pending/error/404 states render in-shell; the framed surfaces (usage/settings/voices/inbox + project outline/figures/usage/settings) show the page-header title row and, in project scope, the Project › Surface breadcrumb",
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
  // F-R7DEP.2-1r — `/showcase` 302s ONTO the dossier already, so the walk hops back to the
  // project Page first, then returns through the sidebar's declared Reviews item — the
  // visible, actionable dossier link. A bare `a[href*="/review/"]` is wrong: DOM-order its
  // first match is the findings desk's filter "Clear" anchor inside the CLOSED panel
  // (legitimately invisible — never the dossier link, and markup order must never be
  // reshuffled to satisfy `.first()`).
  const slug = page.url().split("/p/")[1]?.split("/")[0] ?? "";
  const pageItem = page.locator('[data-project-item="page"]').first();
  await settleClientNav(page, ctx, async () => {
    await pageItem.click();
  });
  const dossierLink = page.locator('[data-project-item="reviews"]').first();
  if ((await dossierLink.count()) === 0) {
    throw new Error("the Showcase overview carries no dossier link to hop through");
  }
  const dossierHref = (await dossierLink.getAttribute("href")) ?? "";
  await settleClientNav(page, ctx, async () => {
    await dossierLink.click();
  });
  // the Reviews item must RESOLVE a dossier run — a `/p/:slug` fallback means the sidebar
  // never learned the review's run id (its own defect, recorded honestly).
  if (!new RegExp(`^/p/${slug}/review/`).test(new URL(page.url()).pathname)) {
    throw new Error(
      `the sidebar Reviews item's ${dossierHref} did not reach a dossier (landed ${page.url()})`,
    );
  }
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
      for (const sel of [".ide-timeline"]) {
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

/** R7PANE.1 (REQ-PANE-4, REQ-DACC-7) — the real `U3.occlusion` body: the five-size geometry
 *  probe — the shared `u3ProbePage` over the signed-in surface at the four desktop sizes plus
 *  the demo width at 390×844 (emulated). 249_R7GUARD.1 adds the tour-target arm: at 390×844
 *  (the demo leg's emulated width — the tightest mark placement) the same
 *  `u3UnscrimmedViolation` the local walk calls asserts every TOUR_STEPS target sits clear of
 *  un-scrimmed overlays. The leg stays `expected:"red"` — the staging/live flip is
 *  D-R7PANE.1-1 at 250_R7DEP.2. */
const U3_OCCLUSION: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  for (const [w, h] of [[1440, 900], [1280, 800], [1024, 768], [820, 1180]] as const) {
    await gotoOk(page, `${ctx.webBaseUrl}/showcase`, ctx);
    await u3ProbePage(page, w, h, { shot: `${ctx.outDir}/u3-occlusion-${w}x${h}.png` });
  }
  {
    const demo = await ctx.browser.newContext({
      baseURL: ctx.webBaseUrl,
      viewport: { width: 390, height: 844 },
    });
    const dpage = await demo.newPage();
    await gotoOk(dpage, `${ctx.webBaseUrl}/demo/${FIRST_ESSAY.essay}?src=jrn`, ctx);
    await u3ProbePage(dpage, 390, 844, { demo: true, shot: `${ctx.outDir}/u3-occlusion-390x844.png` });
    // REQ-PANE-4's "every tour target" — the tour lives on the SPD essay only
    // (DEMO_TOUR_STEPS pins it); each step's own URL mounts its mark before the assert.
    for (const step of TOUR_STEPS) {
      await gotoOk(
        dpage,
        `${ctx.webBaseUrl}/demo/${TOUR_ESSAY}${step.route}?${step.search != null ? `${step.search}&` : ""}tour=${step.id}&src=jrn`,
        ctx,
      );
      const mark = dpage.locator(`[data-demo-tour-step="${step.id}"]`);
      await mark.waitFor({ timeout: 30_000 });
      const bad = await u3UnscrimmedViolation(dpage, [{ id: step.id, selector: step.target }]);
      if (bad != null) {
        throw new Error(`U3.occlusion tour arm @390×844 — ${bad}`);
      }
    }
    await dpage.screenshot({ path: `${ctx.outDir}/u3-occlusion-tour-390x844.png`, fullPage: true });
    await demo.close();
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
    // the hub — a public document, still inside the allowlist. `?src=jrn` tags journey
    // traffic so its `demo_events` rows never read as organic (cohort hygiene, R4 §6).
    await gotoOk(arm.page, `${ctx.webBaseUrl}/demo?src=jrn`, ctx);
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
    // 223 R7DEM.6b (REQ-TOUR-9; REQ-DACC-3) — the ONE non-GET proof, sharpened: every non-GET
    // the page emitted is `POST /a/demo` AND its body matches the anonymous event shape
    // {event ∈ the three demo.* names, essay? ≤80, step? 1–99 int, src? ≤40} within 256 B —
    // never an identity, never a different write.
    const DEMO_EVENTS = new Set([
      "demo.hub_viewed",
      "demo.tour_started",
      "demo.tour_completed_or_cta",
    ]);
    for (const r of collect.requests.filter((x) => x.method !== "GET" && x.method !== "HEAD")) {
      const path = new URL(r.url).pathname;
      if (path !== "/a/demo") {
        throw new Error(`D3.readonly ${tag}: non-carve-out write ${r.method} ${r.url}`);
      }
    }
    // …and every /a/demo body the walk emitted (route-captured — sendBeacon bodies never
    // surface on the request event) matches the anonymous event shape: {event ∈ the three
    // demo.* names, essay? ≤80, step? 1–99 int, src? ≤40} within 256 B, no identity keys.
    // (The hub beacon makes the set non-empty on every walk; a zero-set is asserted below.)
    for (const pd of collect.demoPostBodies) {
      const body = (() => {
        try {
          return pd.length <= 256 ? (JSON.parse(pd) as Record<string, unknown>) : null;
        } catch {
          return null;
        }
      })();
      if (
        body == null ||
        typeof body.event !== "string" ||
        !DEMO_EVENTS.has(body.event) ||
        (body.essay != null && (typeof body.essay !== "string" || body.essay.length > 80)) ||
        (body.step != null &&
          (typeof body.step !== "number" || !Number.isInteger(body.step) || body.step < 1 || body.step > 99)) ||
        (body.src != null && (typeof body.src !== "string" || body.src.length > 40)) ||
        ["user_id", "workspace_id", "ip", "ua", "cookie", "session"].some((k) => k in body)
      ) {
        throw new Error(`D3.readonly ${tag}: /a/demo body out of shape: ${pd.slice(0, 200)}`);
      }
    }
    if (collect.demoPostBodies.length === 0) {
      throw new Error(`D3.readonly ${tag}: no /a/demo body captured — the shape leg is vacuous`);
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
    await gotoOk(page, `${ctx.webBaseUrl}/demo?src=jrn`, ctx);
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


/**
 * 222 R7DEM.6a (REQ-TOUR-2/-4, REQ-DACC-1/2; GD-PREVIEW.R7) — `D2.tour`: the full guided tour
 * on Structure of Political Difference, walked as a new visitor. Landing hero CTA → /demo is a
 * DOCUMENT navigation (S-14; this carries TOUR-4's B evidence R4 had put in D1.hub); the hub's
 * hero tour CTA is a document navigation onto the essay root with `?tour=published`; every
 * in-demo step hop is a CLIENT navigation (settleClientNav); the final CTA → /signup?src=demo
 * is a document navigation. Per step: the coach mark is visible with non-empty text, its
 * declared DOM-contract target is visible and never intersected by the coach mark, and
 * Next/Back are actionable. Sub-assertion: the /showcase + footer entry links resolve to
 * /demo. Stays `expected:"red"` — 224 flips it with preview evidence.
 */
const TOUR_ESSAY = "structure-of-political-difference";
/** The leg-side mirror of `DEMO_TOUR_STEPS` (apps/web/src/spa/demo-tour.ts) — the full
 *  selector form. Exported so the GUARD-4 tour-target arm (u3-occlusion.local.test.ts +
 *  `U3_OCCLUSION`'s demo leg) walks the same step set the tour leg does; the
 *  guards-wiring check pins this list to the engine's table. */
export const TOUR_STEPS: readonly { id: string; route: string; search?: string; target: string }[] = [
  { id: "published", route: "", target: "[data-page-root]" },
  { id: "v1", route: "/v/1", target: "[data-page-host]" },
  { id: "verdict", route: "/review/v1-review", target: '[data-letter-section="verdict"]' },
  // 248 R7TOUR.2 — REQ-PANE-5 re-pins: beat 4 is the letter's passage link (the finding lives
  // in the right panel); beat 5 keeps the Findings-tab row, which the ENGINE opens via its
  // declared `panelTab` (no leg-side affordance needed at any width); beat 7 is the
  // imported-image figure card (S-7).
  { id: "one-thing", route: "/review/v1-review", target: '[data-passage-link="The one thing"]' },
  { id: "two-readers", route: "/review/v1-review", target: '[data-finding="Major 1"]' },
  { id: "claims", route: "/review/v1-review", target: '[data-claim="22"]' },
  { id: "figure", route: "/figures", target: '[data-figure-image="figure_2_ches_correlations_v2"]' },
  {
    id: "responses",
    route: "/a/agents--author--ledgers--v1-response-ledger.md",
    target: "[data-page-host]",
  },
  { id: "what-changed", route: "/v/1/diff/2", search: "layout=moves", target: '[data-move-card="M2"]' },
  { id: "writer-edit", route: "/v/2/diff/3", search: "layout=moves", target: "[data-what-changed]" },
  { id: "cta", route: "", target: "[data-page-root]" },
];

const D2_TOUR: StepFn = async (ctx) => {
  const { page } = await ctx.anon();
  const origin = new URL(ctx.webBaseUrl).origin;
  const collect = attachDemoRecord(page, origin);
  // the entry walk happens once at desktop; the per-step coach-mark evidence repeats at the
  // three widths by re-entering the tour URL directly at each width.
  // "un-occluded" = the coach mark does not cover the target's visible rect's center point.
  // A container target (the page root) tolerates a mark floating at its edges; a pointed target
  // (a finding card, claim row, move card, figure row, letter section) fails the moment the mark
  // sits over its center.
  const coversCenter = async (targetSel: string): Promise<boolean> =>
    page.evaluate((sel) => {
      const t = document.querySelector(sel);
      const o = document.querySelector("[data-demo-tour]") as HTMLElement | null;
      if (t == null || o == null || o.hidden) return false;
      const r = t.getBoundingClientRect();
      const cx = Math.min(Math.max(r.left + r.width / 2, 1), innerWidth - 1);
      const cy = Math.min(Math.max(r.top + r.height / 2, 1), innerHeight - 1);
      const hit = document.elementFromPoint(cx, cy);
      return hit != null && o.contains(hit);
    }, targetSel);

  // — landing → /demo (document nav; carries the landing entry CTA evidence).
  await gotoOk(page, `${ctx.webBaseUrl}/`, ctx);
  const landingEntry = page.locator('[data-demo-entry="landing"]');
  if ((await landingEntry.count()) === 0) throw new Error("landing hero has no data-demo-entry");
  await settleDocumentNav(page, ctx, async () => {
    await landingEntry.first().click();
  });
  if (!page.url().endsWith("/demo")) throw new Error(`landing CTA landed on ${page.url()}`);
  await page.locator("[data-demo-hub]").waitFor({ timeout: 30_000 });
  // — /showcase + footer sub-assertions (both resolve to /demo).
  await gotoOk(page, `${ctx.webBaseUrl}/showcase`, ctx);
  const scEntry = page.locator('[data-demo-entry="showcase"]');
  if ((await scEntry.count()) === 0) throw new Error("/showcase has no data-demo-entry");
  await settleDocumentNav(page, ctx, async () => {
    await scEntry.first().click();
  });
  if (!page.url().endsWith("/demo")) throw new Error(`/showcase entry landed on ${page.url()}`);
  await gotoOk(page, `${ctx.webBaseUrl}/`, ctx);
  const footerEntry = page.locator('[data-demo-entry="footer"]').first();
  if ((await footerEntry.count()) === 0) throw new Error("the public footer has no data-demo-entry");
  if ((await footerEntry.getAttribute("href")) !== "/demo") {
    throw new Error("the footer's data-demo-entry does not resolve to /demo");
  }
  if ((await footerEntry.getAttribute("data-spa-native")) == null) {
    throw new Error("the footer entry is missing data-spa-native");
  }
  await gotoOk(page, `${ctx.webBaseUrl}/demo?src=jrn`, ctx);

  for (const w of [1440, 1024, 390] as const) {
    await page.setViewportSize({ width: w, height: 900 });
    if (w === 1440) {
      // the hub's hero CTA — a DOCUMENT navigation into the demo SPA (S-14).
      await settleDocumentNav(page, ctx, async () => {
        await page.locator("[data-demo-tour-entry]").first().click();
      });
    } else {
      await gotoOk(page, `${ctx.webBaseUrl}/demo/${TOUR_ESSAY}?tour=published&src=jrn`, ctx);
    }
    for (const [i, step] of TOUR_STEPS.entries()) {
      // 1024 walks each step via its own URL (fresh document per step — the mount + placement +
      // target contract at width); 1440 and 390 walk via the Next control (the declared
      // client-nav mechanism, proven once per width that exercises it).
      if (w === 1024 && i > 0) {
        await gotoOk(
          page,
          `${ctx.webBaseUrl}/demo/${TOUR_ESSAY}${step.route}?${step.search != null ? `${step.search}&` : ""}tour=${step.id}`,
          ctx,
        );
      }
      // 248 R7TOUR.2 — the tour ENGINE owns the panel open now (the step's declared `panelTab`
      // activates the real `[data-ide-panel-tab]` control at every width — docked, overlay,
      // sheet), so the leg needs no width-scoped affordance.
      const mark = page.locator(`[data-demo-tour-step="${step.id}"]`);
      try {
        await mark.waitFor({ timeout: 30_000 });
      } catch {
        const diag = await page.evaluate((sel) => ({
          url: location.href,
          overlay: document.querySelector("[data-demo-tour]") != null,
          hidden: (document.querySelector("[data-demo-tour]") as HTMLElement | null)?.hidden,
          target: document.querySelector(sel) != null,
          targetCount: document.querySelectorAll(sel).length,
          spaError: document.querySelector("[data-spa-error]")?.textContent?.slice(0, 160),
          markIds: Array.from(document.querySelectorAll("[data-demo-tour-step]")).map((e) => e.getAttribute("data-demo-tour-step")),
          navCount: document.documentElement.getAttribute("data-nav-count"),
        }), step.target);
        throw new Error(`step ${step.id} @${w}: coach mark never rendered — ${JSON.stringify(diag)}`);
      }
      if (!(await mark.isVisible())) throw new Error(`step ${step.id} @${w}: coach mark hidden`);
      const text = (await mark.textContent()) ?? "";
      if (text.trim().length === 0) throw new Error(`step ${step.id} @${w}: empty coach mark`);
      const target = page.locator(step.target).first();
      await target.waitFor({ timeout: 30_000 }).catch(() => undefined);
      if ((await target.count()) === 0) {
        throw new Error(`step ${step.id} @${w}: target ${step.target} absent`);
      }
      if (await coversCenter(step.target)) {
        throw new Error(`step ${step.id} @${w}: coach mark occludes its target ${step.target}`);
      }
      if (step.id !== "cta") {
        await assertActionable(page.locator("[data-demo-tour-next]"), `D2.tour ${step.id} next @${w}`);
      }
      if (i > 0) {
        await assertActionable(page.locator("[data-demo-tour-prev]"), `D2.tour ${step.id} back @${w}`);
      }
      await page.screenshot({ path: join(ctx.outDir, `d2-tour-${String(i + 1).padStart(2, "0")}-${step.id}-${w}.png`), fullPage: true });
      if (step.id === "cta") {
        const cta = page.locator("[data-demo-tour-cta]");
        if ((await cta.getAttribute("href")) !== "/signup?src=demo") {
          throw new Error(`final CTA href ${await cta.getAttribute("href")} — want /signup?src=demo`);
        }
        if (w === 1440) {
          await settleDocumentNav(page, ctx, async () => {
            await cta.first().click();
          });
          if (!page.url().includes("/signup")) throw new Error(`CTA landed on ${page.url()}`);
          if (!page.url().includes("src=demo")) throw new Error(`CTA lost src=demo (${page.url()})`);
        }
      } else if (w === 1440 || w === 390) {
        // the declared mechanism: in-demo step hops are CLIENT navigations.
        const nextId = TOUR_STEPS[i + 1]!.id;
        await settleClientNav(page, ctx, async () => {
          await page.locator("[data-demo-tour-next]").first().click();
        });
        if (!page.url().includes(`tour=${nextId}`)) {
          throw new Error(`step ${step.id} → ${nextId}: url ${page.url()} lost the tour param`);
        }
      }
    }
    if (w !== 1440) {
      // re-enter cleanly for the next width — the tour state rides the URL, so a fresh GET suffices.
      await gotoOk(page, `${ctx.webBaseUrl}/demo?src=jrn`, ctx);
    }
  }
  const violations = [
    ...collect.violations,
    ...collect.badResponses.map((b) => `${b.status} on ${b.url}`),
  ];
  if (violations.length > 0) {
    throw new Error(`D2.tour side-effect/fault(s):\n  ${violations.slice(0, 10).join("\n  ")}`);
  }

  // 248 R7TOUR.2 (REQ-TOUR-4 R7b part, REQ-DWEB-16, S-14) — the sidebar Demo entry: from a
  // signed-in SPA page the item is a DOCUMENT navigation yielding a fresh document carrying
  // `boot.demo`; the workspace QueryClient is never shared (the marker the old document held
  // is gone — the GUARD-3 "sidebar-demo" named arm).
  {
    const signed = await ctx.returningUser("a");
    const sp = signed.page;
    await sp.goto(`${ctx.webBaseUrl}/app`, { waitUntil: "domcontentloaded" });
    const demoItem = sp.locator("[data-shell-demo]");
    await demoItem.first().waitFor({ timeout: 30_000 });
    if ((await demoItem.first().getAttribute("data-spa-native")) == null) {
      throw new Error("data-shell-demo is missing data-spa-native — it would share the workspace client");
    }
    await sp.evaluate(() => {
      (window as unknown as { __rhemaTour2Shared?: string }).__rhemaTour2Shared = "held";
    });
    await settleDocumentNav(sp, ctx, async () => {
      await demoItem.first().click();
    });
    if (!isDemoNamespacePath(new URL(sp.url()).pathname)) {
      throw new Error(`the sidebar Demo item landed off-namespace at ${sp.url()}`);
    }
    const bootDemo = await sp.evaluate(() => {
      const raw = document.querySelector("script[data-spa-boot]")?.textContent;
      const boot = raw != null ? (JSON.parse(raw) as { demo?: { essay?: string } }) : null;
      return boot?.demo?.essay ?? null;
    });
    if (bootDemo == null) throw new Error("the Demo entry yielded a document with no boot.demo");
    const marker = await sp.evaluate(
      () => (window as unknown as { __rhemaTour2Shared?: string }).__rhemaTour2Shared ?? null,
    );
    if (marker != null) {
      throw new Error("the workspace QueryClient state survived — not a fresh document");
    }
    await sp.screenshot({ path: join(ctx.outDir, "d2-tour-sidebar-demo.png"), fullPage: true });
  }
  assertBundleParity(ctx);
};

/** R7SHELL.1a (REQ-SHELL-1/2/6, REQ-DACC-7/8) — the real `U1.shell` body: the AppShell wraps every
 *  authenticated leaf (the IDE hosted — its rail is suppressed), the sidebar carries the ADR-128
 *  set minus the Demo item (248's), collapse persists across a reload, the in-shell 404 keeps the
 *  sidebar, `/billing` resolves to `/app/settings/billing`, and a narrow DESKTOP window (700 px)
 *  gets the top bar + drawer (the CSS-phone hiding no longer applies to the hosted IDE). Held
 *  `ready-to-flip` — the registry keeps `expected:"red"`; 250_R7DEP.2 flips it with the staged
 *  walk + screenshots (D-R7SHELL.1a-1). R7SHELL.1b extends the walk over the framed surfaces
 *  (workspace leaves: title row, no crumb; project leaves: the Project › Surface breadcrumb),
 *  still held `ready-to-flip` under the same deferral (D-R7SHELL.1b-1 names this leg's walk). */
const U1_SHELL: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoOk(page, `${ctx.webBaseUrl}/app?src=jrn`, ctx);
  const shell = page.locator("[data-app-shell]").first();
  await shell.waitFor({ timeout: 30_000 });
  const sidebar = page.locator("[data-app-sidebar]").first();
  for (const hook of [
    "data-shell-wordmark",
    "data-shell-new-project",
    "data-shell-inbox",
    "data-shell-voices",
    "data-shell-usage",
    "data-shell-settings",
    "data-shell-all-projects",
    "data-shell-account",
    "data-shell-toggle",
  ]) {
    if ((await page.locator(`[${hook}]`).count()) === 0) {
      throw new Error(`the AppShell sidebar is missing [${hook}]`);
    }
  }
  if ((await page.locator("[data-shell-wordmark]").getAttribute("href")) !== "/app") {
    throw new Error("the sidebar wordmark must SPA-link to /app (never / — UXC-3)");
  }
  // the collapse pref is remembered per user across a reload.
  await page.locator("[data-shell-toggle]").click();
  if ((await shell.getAttribute("data-sidebar")) !== "collapsed") {
    throw new Error("the collapse toggle did not flip data-sidebar");
  }
  await page.reload({ waitUntil: "domcontentloaded" });
  await shell.waitFor({ timeout: 30_000 });
  if ((await shell.getAttribute("data-sidebar")) !== "collapsed") {
    throw new Error("the collapsed pref did not survive a reload (rhema:sidebar:v1:<user>)");
  }
  await page.locator("[data-shell-toggle]").click();
  if ((await shell.getAttribute("data-sidebar")) !== "expanded") {
    throw new Error("the sidebar did not re-expand");
  }
  await page.screenshot({ path: join(ctx.outDir, "u1-shell-1440.png"), fullPage: true });
  // R7SHELL.1b — the framed-surfaces walk (REQ-SHELL-3/5): every leaf renders inside the one
  // AppShell, the page header is a content row, and project scope carries the Project ›
  // Surface breadcrumb. Workspace leaves get the title row with NO crumb; no leaf mounts a
  // legacy <Shell> header (its own <header> above the title row would mean the per-leaf
  // chrome came back).
  for (const path of ["/usage", "/app/settings/account", "/voices", "/app/inbox"]) {
    await gotoOk(page, `${ctx.webBaseUrl}${path}?src=jrn`, ctx);
    await page.locator("[data-page-header]").first().waitFor({ timeout: 30_000 });
    if ((await page.locator("[data-page-breadcrumb]").count()) !== 0) {
      throw new Error(`${path} shows a breadcrumb outside project scope`);
    }
    if ((await shell.count()) !== 1 || (await sidebar.count()) !== 1) {
      throw new Error(`${path} is not framed inside the one AppShell`);
    }
  }
  // F-R7DEP.2-5 — the recents ride the `/bff/app` twin, which lands after the leaf's own
  // `data-page-header`: the immediate `count()===0` raced an unresolved query (the row was
  // owed, not absent). Wait for the row like every other hook — a genuinely empty list
  // still fails on the timeout, so the assertion is unchanged.
  const recent2 = page.locator("[data-shell-recent]").first();
  await recent2.waitFor({ timeout: 30_000 }).catch(() => {
    throw new Error("no recent project row to walk into");
  });
  const slug = (await recent2.getAttribute("data-shell-recent")) ?? "";
  for (const path of [`/p/${slug}/outline`, `/p/${slug}/figures`, `/p/${slug}/usage`, `/p/${slug}/settings`]) {
    await gotoOk(page, `${ctx.webBaseUrl}${path}?src=jrn`, ctx);
    await page.locator("[data-page-header], [data-ide-hosted]").first().waitFor({ timeout: 30_000 });
    if ((await page.locator("[data-page-breadcrumb]").count()) === 0) {
      throw new Error(`${path} lost the Project › Surface breadcrumb (or the route 404'd)`);
    }
    const crumb = page.locator('[data-breadcrumb-link][href^="/p/"]').first();
    if ((await crumb.getAttribute("href")) !== `/p/${slug}`) {
      throw new Error(`${path}'s first crumb does not link back to the project`);
    }
    if ((await shell.count()) !== 1 || (await sidebar.count()) !== 1) {
      throw new Error(`${path} is not framed inside the one AppShell`);
    }
    await page.screenshot({ path: join(ctx.outDir, `u1-shell-${path.split("/").pop()}.png`), fullPage: true });
  }
  // the in-shell 404 keeps the sidebar.
  await gotoOk(page, `${ctx.webBaseUrl}/app/definitely-not-a-route?src=jrn`, ctx);
  await sidebar.waitFor({ timeout: 30_000 });
  // `/billing` resolves to `/app/settings/billing` (the server 302 leg lands on the SPA leaf).
  await gotoOk(page, `${ctx.webBaseUrl}/billing?src=jrn`, ctx);
  if (!page.url().endsWith("/app/settings/billing")) {
    throw new Error(`/billing landed on ${page.url()} (want /app/settings/billing)`);
  }
  // the hosted IDE: a project leaf mounts `.ide` inside the shell with the rail suppressed.
  const recent = page.locator("[data-shell-recent]").first();
  await recent.waitFor({ timeout: 30_000 }).catch(() => {
    throw new Error("no recent project row to walk into");
  });
  const project = recent;
  await project.click();
  await page.locator("[data-ide-hosted]").first().waitFor({ timeout: 30_000 });
  if ((await page.locator(".ide-rail").count()) > 0) {
    throw new Error("the hosted IDE still mounts the rail");
  }
  if ((await shell.count()) !== 1 || (await sidebar.count()) !== 1) {
    throw new Error("the shell/sidebar is not singular inside the project leaf");
  }
  // R7SHELL.2 (REQ-SHELL-4) — the project-scope walk: the Files strip is gone from the DOM, the
  // current project expands into its seven items + tree, it is not repeated in the recents, and
  // each item is reached from the Page by SPA navigation with the correct active state.
  if ((await page.locator(".ide-files").count()) > 0 || (await page.locator(".ide-rail").count()) > 0) {
    throw new Error("the Files strip or icon rail is still in the DOM");
  }
  await page.locator("[data-shell-project]").first().waitFor({ timeout: 30_000 });
  const scopeSlug = (await page.locator("[data-shell-project]").first().getAttribute("data-shell-project")) ?? slug;
  if ((await page.locator(`[data-shell-recent="${scopeSlug}"]`).count()) > 0) {
    throw new Error("the current project is repeated in Recent projects");
  }
  if ((await page.locator("[data-project-tree]").count()) === 0) {
    throw new Error("the Files tree did not render under the project entry");
  }
  await page.screenshot({ path: join(ctx.outDir, "u1-shell-project-1440.png"), fullPage: true });
  const itemBase = `/p/${scopeSlug}`;
  for (const item of ["outline", "figures", "versions", "export", "settings", "reviews", "page"] as const) {
    const link = page.locator(`[data-project-item="${item}"]`).first();
    if ((await link.count()) === 0) throw new Error(`the project item ${item} is missing`);
    if ((await link.getAttribute("aria-disabled")) === "true") {
      // a disabled item (write-only under ReadOnlyProject) carries its reason — a title is the
      // contract (the walk's showcase/fixture project is writable, so this arm is informational).
      continue;
    }
    const href = (await link.getAttribute("href")) ?? "";
    // F-R7DEP.2-5r — `aria-current` belongs to the item whose surface the nav LANDS on,
    // never unconditionally to the clicked one: on a project with no delivered review
    // the Reviews item honestly resolves to `/p/:slug` (the overview IS the dossier
    // cards' home), so its nav lands on the Page and "page" is the truthful carrier.
    // A same-URL click proves nothing — assert the current item directly.
    const before = new URL(page.url()).pathname;
    if (before !== href) {
      await settleClientNav(page, ctx, async () => {
        await link.click();
      });
    }
    const landed = new URL(page.url()).pathname;
    // (the clicked href may legitimately resolve onward — e.g. `/v/working` → the
    // newest `/v/<n>` — so the assert keys on the LANDED surface, not URL equality.)
    const owner =
      landed === itemBase || landed.startsWith(`${itemBase}/a/`) || landed.startsWith(`${itemBase}/edit/`)
        ? "page"
        : landed.startsWith(`${itemBase}/outline`)
          ? "outline"
          : landed.startsWith(`${itemBase}/figures`) ||
              landed.startsWith(`${itemBase}/f/`) ||
              landed.startsWith(`${itemBase}/visualize`)
            ? "figures"
            : landed.startsWith(`${itemBase}/v/`) || landed.startsWith(`${itemBase}/revisions/`)
              ? "versions"
              : landed.startsWith(`${itemBase}/review/`) || landed.startsWith(`${itemBase}/r/`)
                ? "reviews"
                : landed.startsWith(`${itemBase}/export`)
                  ? "export"
                  : landed.startsWith(`${itemBase}/settings`) || landed.startsWith(`${itemBase}/voice/`)
                    ? "settings"
                    : null;
    if (owner == null) {
      throw new Error(`the ${item} item landed on ${landed} — no project item owns it`);
    }
    const ownerLink = page.locator(`[data-project-item="${owner}"]`).first();
    if ((await ownerLink.getAttribute("aria-current")) !== "page") {
      throw new Error(`the ${owner} item did not become aria-current after the ${item} SPA nav to ${landed}`);
    }
  }
  // collapsed: the items stay as icon+tooltip rows.
  await page.locator("[data-shell-toggle]").click();
  if ((await shell.getAttribute("data-sidebar")) !== "collapsed") {
    throw new Error("the collapse toggle did not flip data-sidebar (project scope)");
  }
  await page.screenshot({ path: join(ctx.outDir, "u1-shell-collapsed-1440.png"), fullPage: true });
  await page.locator("[data-shell-toggle]").click();
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.screenshot({ path: join(ctx.outDir, "u1-shell-1024.png"), fullPage: true });
  // narrow desktop (700 px): the top bar + drawer replace the hidden panes.
  await page.setViewportSize({ width: 700, height: 900 });
  const bar = page.locator("[data-shell-topbar]").first();
  await bar.waitFor({ timeout: 30_000 });
  if ((await bar.isVisible()) !== true) throw new Error("the <768 top bar is not visible");
  await page.locator("[data-shell-drawer-toggle]").click();
  if ((await shell.getAttribute("data-drawer")) !== "open") {
    throw new Error("the top-bar menu button did not open the sidebar drawer");
  }
  if ((await page.locator("[data-shell-pane-toggle]").count()) === 0) {
    throw new Error("the <768 pane-sheet toggle is missing in IDE scope");
  }
  await page.screenshot({ path: join(ctx.outDir, "u1-shell-700.png"), fullPage: true });
  assertBundleParity(ctx);
};

/**
 * R7RELOAD.1 (REQ-RELOAD-6 / REQ-GUARD-3, REQ-DACC-7) — the real `U2.noreload` body: the walk
 * list → project → dossier → compare → export → settings → inbox → Timeline gate approve →
 * Showcase → back stays inside ONE document — after every segment the GUARD-3 helper asserts
 * `performance.getEntriesByType("navigation").length === 1` and the persisted window marker.
 * Every hop is driven through `settleClientNav` (the mechanism pin), and `documentLoads` is
 * cross-checked per segment. Sanctioned document navigations (S-14 demo entry/exit, /logout,
 * Stripe/OAuth handoffs, binary exports, `/p/:p/f/:fid` — R6 T10–T13) are excluded BY NAME in
 * `noreload.ts`; this walk declares none. Held `ready-to-flip` — the registry keeps
 * `expected:"red"`; 250_R7DEP.2 flips it at the phase preview (D-R7RELOAD.1-1). The chat-send
 * segment is appended by 232 (REQ-RELOAD-1).
 */
const U2_NORELOAD: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  const marker = `u2-${ctx.nonce}`;
  const leg = (label: string, act: () => Promise<unknown>) =>
    guard3Segment(page, marker, label, act);

  // list — the entry document at /app.
  await gotoOk(page, `${ctx.webBaseUrl}/app?src=jrn`, ctx);
  await page.locator("[data-app-shell]").first().waitFor({ timeout: 30_000 });
  await plantGuard3Marker(page, marker);
  const loadsAtEntry = ctx.documentLoads;

  // list → project: the sidebar's project entry is an SPA link.
  // F-R7DEP.2-1ev — the walk's dossier hop needs a delivered review, so prefer the Showcase
  // recent (the workspace guarantee: its dossier always exists) over the bare first row — a
  // fresher scratch leftover (e.g. an abandoned `untitled` from an earlier leg) carries no
  // `/review/` link at all and the hop can never arm. A union `.first()` is DOM-order — the
  // preference needs an explicit two-locator pick.
  const showcaseRecent = page.locator('[data-shell-recent="showcase"]');
  const projectLink = (await showcaseRecent.count()) > 0
    ? showcaseRecent.first()
    : page.locator("[data-shell-project] a, [data-shell-recent]").first();
  if ((await projectLink.count()) === 0) throw new Error("no project entry in the sidebar");
  const href = (await projectLink.getAttribute("href")) ?? "";
  const slug = /\/p\/([^/]+)/.exec(href)?.[1] ?? "";
  if (slug === "") throw new Error(`the project entry's href ${href} is not a /p/<slug> link`);
  await leg("list→project", () => settleClientNav(page, ctx, () => projectLink.click()));

  // project → dossier: the project's review link.
  const dossierLink = page.locator(`a[href^="/p/${slug}/review/"]`).first();
  await leg("project→dossier", () => settleClientNav(page, ctx, () => dossierLink.click()));

  // dossier → compare: a version compare link (the rail's diff affordance).
  const compareLink = page
    .locator(`a[href^="/p/${slug}/v/"][href*="/diff/"], a[href^="/p/${slug}/compare"]`)
    .first();
  if ((await compareLink.count()) > 0) {
    await leg("dossier→compare", () => settleClientNav(page, ctx, () => compareLink.click()));
    // compare → project page (the walk continues inside the one document).
    const backToPage = page.locator(`a[href="/p/${slug}"]`).first();
    await leg("compare→project", () => settleClientNav(page, ctx, () => backToPage.click()));
  }

  // project → export → settings — the write hops need a WRITABLE project: the read-only
  // Showcase honestly withholds them (R7b's ReadOnlyProject contract — the items render
  // `aria-disabled` with the reason, a GD-class surface decision recorded for this
  // re-pin, never a vanished control). Assert the withheld state, then walk the hops on
  // the first writable recent; a tenant with none keeps the withheld assert alone.
  const exportLink = page.locator(`a[href="/p/${slug}/export"]`).first();
  if ((await exportLink.count()) > 0) {
    await leg("project→export", () => settleClientNav(page, ctx, () => exportLink.click()));
    const settingsLink = page.locator(`a[href="/p/${slug}/settings"]`).first();
    await leg("export→settings", () => settleClientNav(page, ctx, () => settingsLink.click()));
  } else {
    for (const key of ["export", "settings"] as const) {
      const item = page.locator(`[data-project-item="${key}"]`).first();
      if ((await item.getAttribute("aria-disabled")) !== "true") {
        throw new Error(
          `the read-only project's ${key} item lost its disabled state (want aria-disabled + reason)`,
        );
      }
    }
    const writable = page
      .locator('[data-shell-recent]:not([data-shell-recent="showcase"])')
      .first();
    if ((await writable.count()) > 0) {
      const href2 = (await writable.getAttribute("href")) ?? "";
      const slug2 = /\/p\/([^/]+)/.exec(href2)?.[1] ?? "";
      await leg("project→writable", () => settleClientNav(page, ctx, () => writable.click()));
      if (slug2 !== "") {
        const exportLink2 = page.locator(`a[href="/p/${slug2}/export"]`).first();
        await leg("writable→export", () =>
          settleClientNav(page, ctx, () => exportLink2.click()));
        const settingsLink2 = page.locator(`a[href="/p/${slug2}/settings"]`).first();
        await leg("export→settings", () =>
          settleClientNav(page, ctx, () => settingsLink2.click()));
      }
    }
  }
  const inboxLink = page.locator("[data-shell-inbox]").first();
  await leg("settings→inbox", () => settleClientNav(page, ctx, () => inboxLink.click()));

  // inbox → project: back through the sidebar's project entry — the Showcase stays the
  // tail's surface (its write arms are safely withheld, so the approve/chat segments
  // exercise their skip arms, never a real mutation on a paid:false leg).
  const projectAgain = page.locator(`a[href="/p/${slug}"]`).first();
  await leg("inbox→project", () => settleClientNav(page, ctx, () => projectAgain.click()));

  // Timeline gate approve: the waiting card's Approve is a pane-body form POST — a JSON
  // mutation through the chrome-host delegated submit, never a document load. Absent a
  // waiting gate the segment skips honestly (the seeded fixture arms it at the preview).
  const approve = page.locator('[data-gate-form] button[data-action="approve"]').first();
  if ((await approve.count()) > 0) {
    const loadsBefore = ctx.documentLoads;
    await approve.click();
    await page
      .waitForFunction(() => document.documentElement.hasAttribute("data-mounted"), {
        timeout: 30_000,
      })
      .catch(() => undefined);
    if (ctx.documentLoads !== loadsBefore) {
      throw new Error("the gate approve document-navigated (want the JSON mutation)");
    }
    await leg("gate-approve", async () => undefined);
  }

  // chat send — R7TALK.1a (REQ-RELOAD-1): the composer's JSON fetch adds no navigation entry.
  // The panel opens on the Chat tab (the `]` chord / tab button both keep one document), the
  // composer types and Send fires the JSON mutation, and the optimistic bubble renders — all
  // inside the same document (the leg's own no-reload assert runs after).
  const chatTab = page.locator('[data-ide-panel-tab="chat"], [data-ide-desk-tab="chat"]').first();
  await leg("chat-send", async () => {
    if ((await chatTab.count()) > 0) {
      // F-R7DEP.2-1ev — leg-ordering, not a surface defect: the Chat tab lives INSIDE
      // the right panel, so while the panel is closed it resolves in the DOM
      // (`aria-selected`) but is legitimately invisible — the unconditional click
      // could never land. A reader opens the panel first (the `]` chord — the same
      // on-demand open U3.occlusion's probe takes), waits for the open state, then
      // clicks the now-visible tab. An unopened panel or an unactionable tab after
      // it is its own failure — never swallowed.
      // (`]` is a bare chrome chord — inert while a field or the Page holds focus,
      // so the caret blurs out of any input first, the same arm U5 uses for `f`.)
      await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
      const ide2 = page.locator(".ide").first();
      if ((await ide2.getAttribute("data-panel")) !== "open") {
        await page.keyboard.press("]");
        await page.waitForSelector('.ide[data-panel="open"]', { timeout: 5_000 });
      }
      await chatTab.click();
    }
    const input = page.locator('[data-chat-composer] textarea[name="message"]').first();
    if ((await input.count()) > 0 && (await input.isEnabled())) {
      await input.fill(`${ctx.marker("U2CHAT")}`);
      await page.locator("[data-chat-composer] [data-chat-send], [data-chat-composer] button[type='submit']").first().click();
      // the optimistic bubble renders client-side — the JSON leg, never a form post.
      await page.locator('[data-chat-bubble="user"]').last().waitFor({ timeout: 10_000 }).catch(() => undefined);
    } else if ((await input.count()) > 0) {
      // the read-only substrate withholds the send — the composer carries its
      // `data-chat-readonly` reason (the same withheld contract as export/settings),
      // never a vanished or silently-dead control.
      if ((await page.locator("[data-chat-readonly]").count()) === 0) {
        throw new Error("the read-only project's composer lost its withheld reason");
      }
    }
  });

  // project → a peer recent → back to /app: the Showcase hops above already settled as
  // client navigations (never the REQ-ED-12 document swap); the wordmark exit keeps the
  // whole walk inside the one document.
  // F-R7DEP.2-1ev — chat-send leaves the right panel OPEN, and at the harness's 1280-px
  // signed-in viewport an open panel is the paneLayout rail ceiling (REQ-PANE-2, tested):
  // `data-ide-sidebar="rail"` puts the sidebar's whole recents group display:none — in
  // DOM but honestly unactionable (T1d's invisible `untitled-N` pick). A reader who is
  // done with the panel closes it first (the same `]` toggle — a bare chrome chord, so
  // the caret blurs out of any focus zone first); the sidebar re-expands and the
  // recents return. A panel that refuses to close is its own defect — the wait throws.
  const ideAtPeer = page.locator(".ide").first();
  if ((await ideAtPeer.getAttribute("data-panel")) === "open") {
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await page.keyboard.press("]");
    await page.waitForSelector('.ide[data-panel="closed"]', { timeout: 5_000 });
  }
  const peer = page
    .locator('[data-shell-recent]:not([data-shell-recent="showcase"])')
    .first();
  if ((await peer.count()) > 0) {
    await leg("project→peer", () => settleClientNav(page, ctx, () => peer.click()));
  }
  const wordmark = page.locator("[data-shell-wordmark]").first();
  await leg("project→back", () => settleClientNav(page, ctx, () => wordmark.click()));

  // the whole walk loaded exactly the entry document.
  if (ctx.documentLoads !== loadsAtEntry) {
    throw new Error(
      `the U2 walk document-loaded ${ctx.documentLoads - loadsAtEntry} time(s) after entry — ` +
        `GUARD-3's one-document invariant broke outside the per-segment checks`,
    );
  }
  await page.screenshot({ path: join(ctx.outDir, "u2-noreload.png"), fullPage: true });
  assertBundleParity(ctx);
};

/**
 * R7TALK.1a (REQ-TALK-3, REQ-DACC-7 U6) — the real `U6.chat` body: a STUBBED turn (paid:false —
 * the one paid leg is 250's act). `page.route` stubs the three seams: `/p/:slug/chat/turns`
 * answers the committed fixture's JSON 201 (`{ok,data:{runId,state}}`), `/p/:slug/r/:runId/events`
 * serves the fixture's run-event SSE, and the `/bff/p/:slug` twin is patched (route.fetch →
 * mutate) so the terminal refetch carries the stub turn's reply. The walk asserts: Send posts
 * JSON (no document load — the GUARD-3 marker survives), the optimistic bubble renders, progress
 * events stream, the reply + citations + debited footnote render on completion, and an empty
 * send issues no request. Held `ready-to-flip` — `expected:"red"`; 250 flips (D-R7TALK.1a-1).
 */
const U6_CHAT: StepFn = async (ctx) => {
  const fixture = (await import("node:fs/promises")).readFile(
    new URL("./u6-stub-turn.fixture.json", import.meta.url),
    "utf8",
  ).then((raw) => JSON.parse(raw) as {
    created: { ok: true; data: { runId: string; state: string; deduped: boolean; planCard: unknown } };
    events: { seq: number; type: string; payload: Record<string, unknown> }[];
    turn: Record<string, unknown>;
  });
  const { page } = await ctx.returningUser("a");
  const fx = await fixture;
  let turnPosts = 0;
  const RUN_ID = fx.created.data.runId;
  // the JSON 201 (the mutation envelope carries the api body verbatim in `data`).
  await page.route("**/p/*/chat/turns", async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    turnPosts += 1;
    return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(fx.created) });
  });
  // the run-event SSE tail — the fixture's committed stream, replayed once.
  await page.route(`**/p/*/r/${RUN_ID}/events**`, (route) =>
    route.fulfill({
      status: 200,
      contentType: "text/event-stream",
      body: fx.events
        .map((e) => `id: ${e.seq}\nevent: ${e.type}\ndata: ${JSON.stringify({ seq: e.seq, type: e.type, payload: e.payload })}\n\n`)
        .join(""),
    }),
  );
  // the terminal refetch: patch the project twin's ide.chat.turns with the stub turn.
  await page.route("**/bff/p/*", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    const res = await route.fetch();
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      return route.fulfill({ response: res });
    }
    const o = body as { ide?: { chat?: { turns?: unknown[] } } };
    if (o.ide?.chat && Array.isArray(o.ide.chat.turns)) {
      o.ide.chat.turns = [fx.turn, ...o.ide.chat.turns];
    }
    return route.fulfill({ response: res, json: body });
  });

  await gotoOk(page, `${ctx.webBaseUrl}/app?src=jrn`, ctx);
  const projectLink = page.locator("[data-shell-project] a, [data-shell-recent]").first();
  if ((await projectLink.count()) === 0) throw new Error("no project entry in the sidebar");
  await settleClientNav(page, ctx, () => projectLink.click());
  const marker = `u6-${ctx.nonce}`;
  await plantGuard3Marker(page, marker);
  const loadsAtEntry = ctx.documentLoads;
  const ide = page.locator(".ide").first();
  if ((await ide.getAttribute("data-panel")) !== "open") await page.keyboard.press("]");
  await page.locator('[data-ide-panel-tab="chat"], [data-ide-desk-tab="chat"]').first().click();
  const input = page.locator('[data-chat-composer] textarea[name="message"]').first();
  if ((await input.count()) === 0) throw new Error("no chat composer on the project page");

  // empty send — blocked client-side, NO request.
  const postsBefore = turnPosts;
  await input.fill("   ");
  await page.locator("[data-chat-composer] [data-chat-send], [data-chat-composer] button[type='submit']").first().click();
  await page.waitForTimeout(400);
  if (turnPosts !== postsBefore) throw new Error("an empty send issued a request");

  // the send: JSON 201 + optimistic bubble + no document load.
  await input.fill(`${ctx.marker("CHAT")}`);
  await page.locator("[data-chat-composer] [data-chat-send], [data-chat-composer] button[type='submit']").first().click();
  await page.locator('[data-chat-bubble="user"]').last().waitFor({ timeout: 10_000 });
  if (turnPosts === postsBefore) throw new Error("Send never posted the JSON mutation");
  await assertNoReload(page, marker, "chat-send");
  if (ctx.documentLoads !== loadsAtEntry) throw new Error("the chat send document-loaded");

  // progress events stream over the run-event channel (the fixture's SSE).
  await page.waitForTimeout(1_000);
  // the reply + citations + the debited footnote render on completion.
  await page
    .locator('[data-chat-bubble="assistant"]', { hasText: "Stub answer paragraph" })
    .waitFor({ timeout: 30_000 });
  if ((await page.locator("[data-chat-cite]").count()) === 0) {
    throw new Error("the reply's citation chips did not render");
  }
  if ((await page.locator(`[data-chat-footnote='${RUN_ID}']`).count()) === 0) {
    throw new Error("the turn's debited cost footnote did not render");
  }
  await assertNoReload(page, marker, "chat-completion");
  await page.screenshot({ path: join(ctx.outDir, "u6-chat.png"), fullPage: true });
  assertBundleParity(ctx);
};

/**
 * U7.import (R7HOME.2a; REQ-HOME-4/5) — paste markdown with a leading `# H1`: the H1 becomes the
 * title (never dropped, the Conversion-notes card lists the normalization), the preview is typeset
 * (paper face, not mono), the created import is the project's WORKING draft, and typing on the Page
 * edits in place — no fork, no v(N+1) from a keystroke. Runs against the live convert + collab
 * seams at 250's preview SHA; held `ready-to-flip` (`expected:"red"` — 250 flips, D-R7HOME.2a-1).
 */
const U7_IMPORT: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  await gotoOk(page, `${ctx.webBaseUrl}/app?src=jrn`, ctx);
  const projectLink = page.locator("[data-shell-project] a, [data-shell-recent]").first();
  if ((await projectLink.count()) === 0) throw new Error("no project entry in the sidebar");
  await settleClientNav(page, ctx, () => projectLink.click());
  // the project's slug from the landed URL — the import surface is sibling to it.
  const slug = new URL(page.url()).pathname.match(/^\/p\/([^/]+)/)?.[1];
  if (!slug) throw new Error(`could not read the project slug from ${page.url()}`);

  // the import sheet — the styled dropzone is mounted (a native picker is not the surface).
  await gotoOk(page, `${ctx.webBaseUrl}/p/${slug}/import`, ctx);
  if ((await page.locator("[data-import-dropzone]").count()) === 0) {
    throw new Error("the styled dropzone did not mount on the import sheet");
  }

  // paste markdown whose first line is the title; the title must survive the conversion.
  const title = ctx.marker("Imported essay");
  const paste = page.locator(`form[action="/p/${slug}/import/preview"] textarea[name="paste"]`).first();
  if ((await paste.count()) === 0) throw new Error("no paste field on the import sheet");
  await paste.fill(`# ${title}\n\nBody paragraph — enough text to materialize.\n`);
  const marker = `u7-${ctx.nonce}`;
  await plantGuard3Marker(page, marker);
  const loadsAtConvert = ctx.documentLoads;
  await settleClientNav(page, ctx, () =>
    page.locator(`form[action="/p/${slug}/import/preview"] button[type="submit"]`).first().click(),
  );
  if (ctx.documentLoads !== loadsAtConvert) throw new Error("the convert hop document-loaded");

  // the preview — poll until the ready pane mounts (pending re-asks carry the poll cadence).
  await page.locator("form[data-conversion-form]").first().waitFor({ timeout: 60_000 });
  // REQ-HOME-5: the title line + the Conversion-notes card names the normalization, and the
  // converted pane typesets (paper face — the computed family is not the mono stack).
  if ((await page.locator("[data-conversion-title]").count()) === 0) {
    throw new Error("the H1 title line did not render on the preview");
  }
  if (!(await page.locator("[data-conversion-title]").first().textContent())?.includes(title)) {
    throw new Error("the H1 title was dropped, not kept");
  }
  const convFont = await page
    .locator("[data-converted-pane]")
    .first()
    .evaluate((el) => getComputedStyle(el).fontFamily);
  if (!convFont || /mono|JetBrains/i.test(convFont)) {
    throw new Error(`the converted pane is not typeset — computed font: ${convFont}`);
  }
  // a clean H1 conversion lists its normalization note (title_extracted) in Conversion notes.
  const notes = await page.locator("[data-conversion-form] section, [data-conversion-form]").allTextContents();
  if (!notes.join(" ").includes(title)) {
    throw new Error("Conversion notes do not name the title normalization");
  }

  // exactly one CTA on a clean conversion — Create draft (Fix now only exists with warnings).
  const createBtns = page.locator('[data-conversion-action="create"]');
  if ((await createBtns.count()) !== 1) {
    throw new Error(`expected exactly one Create CTA, found ${await createBtns.count()}`);
  }
  const loadsAtCreate = ctx.documentLoads;
  await settleClientNav(page, ctx, () => createBtns.first().click());
  if (ctx.documentLoads !== loadsAtCreate) throw new Error("the import create document-loaded");

  // the landing — /p/:slug/v/:n with the REQ-DATA-14 outcome flash + toast.
  const landed = new URL(page.url());
  if (!landed.pathname.match(new RegExp(`^/p/${slug}/v/\\d+`))) {
    throw new Error(`the import did not land on the Page — ${landed.pathname}`);
  }
  if (!landed.searchParams.get("imported")) throw new Error("the imported outcome flash is missing");
  await page.locator(".ui-toast-viewport [role='status']").first().waitFor({ timeout: 5_000 }).catch(() => {
    throw new Error("the import toast did not render");
  });
  const n = landed.pathname.match(/\/v\/(\d+)/)?.[1];

  // the imported draft is immediately editable — typing on the Page edits IN PLACE (no fork):
  // the version label stays v{n}; a fork would mint v(N+1) on the first keystroke save.
  const editor = page.locator(".ProseMirror").first();
  await editor.click();
  await page.keyboard.type(` typed ${ctx.nonce}`);
  await page.waitForTimeout(6_000); // the debounced materialization window
  await assertNoReload(page, marker, "import-typing");
  const rail = await page.locator("[data-page-root], body").first().textContent();
  if (rail?.includes(`v${Number(n) + 1}`)) {
    throw new Error(`typing forked the import — v${Number(n) + 1} appeared on the Page`);
  }
  await page.screenshot({ path: join(ctx.outDir, "u7-import.png"), fullPage: true });
  assertBundleParity(ctx);
};

/**
 * U5.write (R7WRITE.1b; REQ-DACC-7 U5 + REQ-WRITE-2/6/7) — the real `U5.write` body: a new project
 * creates a blank editable Page (no dialog, the inline title focused), typing commits through the
 * collab wire, the format bubble appears ABOVE the selection with Comment as its first item, the
 * comment POSTs anchored Guidance and the margin card renders at its anchor, ⌘⇧F enters focus
 * mode and Esc exits it, and the Rich text/Source toggle soft-wraps prose. Held `ready-to-flip` —
 * the registry keeps `expected:"red"`; 250_R7DEP.2 flips it at the R7b phase preview
 * (D-R7WRITE.1b-1).
 */
const U5_WRITE: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  await page.setViewportSize({ width: 1440, height: 900 });
  await gotoOk(page, `${ctx.webBaseUrl}/app?src=jrn`, ctx);
  // new project — the sidebar's create affordance lands on a blank Page (no dialog) with the
  // inline title focused (REQ-WRITE-6's focused-title entry).
  await page.locator("[data-shell-new-project]").first().click();
  const title = page.locator("[data-inline-title]").first();
  await title.waitFor({ timeout: 30_000 });
  if ((await page.locator("dialog[open]").count()) > 0) {
    throw new Error("new project opened a dialog — the blank Page must mount directly");
  }
  if (!(await title.evaluate((el) => document.activeElement === el))) {
    throw new Error("the inline title was not focused on the blank Page");
  }
  await title.fill(ctx.marker("U5 draft"));

  // type commits — the collab wire's debounced materialization window.
  const editor = page.locator(".ProseMirror").first();
  await editor.waitFor({ timeout: 30_000 });
  await editor.click();
  await page.keyboard.type(`${ctx.marker("U5 body")} sentence one.`);
  await page.waitForTimeout(6_000);

  // the format bubble ABOVE the selection — Comment is the first item (REQ-WRITE-2/6).
  // The bubble's arm is a REAL selection gesture: the IDE chrome's `selectionMenu`
  // fires on a mouseup inside the page pane (or a shift-keyup) with a non-collapsed
  // range inside `[data-pane="page"]`. Playwright's `selectText()` sets the DOM range
  // directly — no gesture event — so the arm could never fire (the mount is intact:
  // the controller binds both listeners and the format-bubble DOM probe greens the
  // same arm at this head). Drag across the typed line the way a reader does.
  const typedLine = editor.locator("p", { hasText: "sentence one" }).first();
  const lineBox = await typedLine.boundingBox();
  if (!lineBox)
    throw new Error("the typed paragraph has no box to drag-select across");
  const lineMidY = lineBox.y + lineBox.height / 2;
  await page.mouse.move(lineBox.x + 4, lineMidY);
  await page.mouse.down();
  await page.mouse.move(lineBox.x + lineBox.width - 2, lineMidY, { steps: 12 });
  await page.mouse.up();
  const bubble = page.locator("[data-format-bubble]").first();
  await bubble.waitFor({ timeout: 10_000 });
  if ((await bubble.getAttribute("data-placed")) !== "above") {
    throw new Error(`the format bubble placed ${await bubble.getAttribute("data-placed")} — want above`);
  }
  const commentItem = page.locator('[data-format-item="comment"]').first();
  if ((await commentItem.count()) === 0) throw new Error("the bubble's Comment item is missing");
  if ((await bubble.locator("[data-format-item]").first().getAttribute("data-format-item")) !== "comment") {
    throw new Error("Comment is not the bubble's first item (UXC-23/I5)");
  }
  await commentItem.click();
  const composer = page.locator("[data-comment-input]").first();
  await composer.waitFor({ timeout: 10_000 });
  await composer.fill(ctx.marker("U5 note"));
  await page.locator("[data-comment-submit]").first().click();
  // the anchored Guidance lands a margin card on the twin's refetch (no reload).
  await page.locator("[data-comment-card]").first().waitFor({ timeout: 30_000 });
  await page.screenshot({ path: join(ctx.outDir, "u5-comment.png"), fullPage: true });

  // focus mode enters on the re-homed `f` chord (R7WRITE.2's browser-safe map — bare keys fire
  // in chrome focus only, so the caret blurs out of the Page first) and Esc exits it.
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await page.keyboard.press("f");
  if ((await page.locator(".ide").first().getAttribute("data-view")) !== "focus") {
    throw new Error("the `f` chord did not enter focus mode");
  }
  await page.keyboard.press("Escape");
  if ((await page.locator(".ide").first().getAttribute("data-view")) === "focus") {
    throw new Error("Esc did not exit focus mode");
  }

  // the ONE Rich text/Source toggle lives in the page header strip (REQ-WRITE-5; I7 — the ⋯
  // item and the floating in-page chip are gone) and the Source view soft-wraps prose.
  const toggle = page.locator("[data-page-strip] [data-source-toggle]").first();
  await toggle.waitFor({ timeout: 10_000 });
  if ((await page.locator("[data-source-toggle]").count()) !== 1) {
    throw new Error("expected exactly one Source toggle — REQ-WRITE-5");
  }
  if ((await page.locator("[data-page-host] [data-source-toggle]").count()) !== 0) {
    throw new Error("an in-page Source toggle survives — the strip's is the only one");
  }
  await toggle.click();
  await page.locator("[data-source-host]").first().waitFor({ timeout: 30_000 });
  if ((await toggle.getAttribute("aria-pressed")) !== "true") {
    throw new Error("the Source toggle did not flip aria-pressed");
  }
  await page.screenshot({ path: join(ctx.outDir, "u5-source.png"), fullPage: true });
  await toggle.click();
  assertBundleParity(ctx);
};

/* 243a_R7KIT.3e (REQ-GUARD-1, REQ-DACC-7) — the real `U4.controls` body (AUTHORED_HELD): the
 * computed-style probe walks the 12 migrated surfaces under `returningUser('a')` and fails on
 * any visible native-styled control outside the named no-JS/SSR exemption containers. The row
 * stays `expected:"red"` — a leg body in the tree is not deployed proof; the 250 phase preview
 * runs this against the deployed SHA (`--expect-sha` + provenance) and performs the flip. */
const U4_CONTROLS: StepFn = async (ctx) => {
  const { page } = await ctx.returningUser("a");
  await gotoOk(page, `${ctx.webBaseUrl}/app?src=jrn`, ctx);
  const projectLink = page.locator("[data-shell-project] a, [data-shell-recent]").first();
  if ((await projectLink.count()) === 0) throw new Error("no project entry in the sidebar");
  const href = (await projectLink.getAttribute("href")) ?? "";
  const slug = /\/p\/([^/]+)/.exec(href)?.[1] ?? "";
  if (slug === "") throw new Error(`the project entry's href ${href} is not a /p/<slug> link`);
  // the dossier's run id rides the project's own twin (harness-side discovery, not a page emission).
  let runId = "";
  try {
    const r = await fetch(`${ctx.webBaseUrl}/bff/p/${slug}/timeline`, {
      headers: { accept: "application/json" },
    });
    if (r.ok) {
      const twin = (await r.json()) as { runs?: { runId?: string; state?: string }[] };
      runId = twin.runs?.find((run) => run.state === "completed")?.runId ?? twin.runs?.[0]?.runId ?? "";
    }
  } catch {
    runId = "";
  }
  const failures: string[] = [];
  for (const surface of U4_SURFACES) {
    const path = surface.path.replace(":p", slug).replace(":runId", runId);
    if (path.includes(":runId")) {
      failures.push(`${surface.id}: no dossier run id discoverable — the leg owes a seeded run`);
      continue;
    }
    try {
      await gotoOk(page, `${ctx.webBaseUrl}${path}?src=jrn`, ctx);
      await page
        .locator("[data-spa-root], [data-ide], [data-app-shell]")
        .first()
        .waitFor({ state: "attached", timeout: 30_000 });
      const findings = await u4ProbePage(page, surface);
      await page.screenshot({
        path: join(ctx.outDir, `u4-controls-${surface.id}.png`),
        fullPage: true,
      });
      assertU4Clean(surface.id, findings);
    } catch (e) {
      failures.push(`${surface.id} (${path}): ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  if (failures.length > 0) {
    throw new Error(`U4.controls — ${failures.length} surface failure(s):\n${failures.join("\n")}`);
  }
  assertBundleParity(ctx);
};

const REAL_BODIES: Readonly<Record<string, StepFn>> = {
  "D1.hub": D1_HUB,
  "U1.shell": U1_SHELL,
  "U2.noreload": U2_NORELOAD,
  "D2.tour": D2_TOUR,
  "R8.showcase.spa": R8_SHOWCASE_SPA,
  "U3.stopgap": U3_STOPGAP,
  "U3.occlusion": U3_OCCLUSION,
  "U5.write": U5_WRITE,
  "U6.chat": U6_CHAT,
  "U7.import": U7_IMPORT,
  "U4.controls": U4_CONTROLS,
  "R11.demo": R11_DEMO,
  "P1.demo": P1_DEMO,
  "D3.readonly": D3_READONLY,
};

export const R7_LEGS_IMPLS: Readonly<Record<string, StepFn>> = Object.fromEntries(
  Object.keys(OWNERS).map((id) => [id, REAL_BODIES[id] ?? owedStub(id)]),
);
