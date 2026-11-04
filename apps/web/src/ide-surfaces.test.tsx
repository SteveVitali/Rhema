import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ideCss, themeCss } from "@rhema/tokens";
import { ApiError, type ProjectRow } from "@rhema/api-client";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource } from "./data.js";
import { PageDataContext } from "./page-data.js";
import { renderDocument } from "./render.js";
import { routes } from "./routes.js";

// UX.2 — the layout/responsive seams (REQ-MOBILE-3 amended, REQ-SPEC-20, REQ-IDE-8/42/43):
//
//   1. every route whose element renders the IDE shell emits the IDE stylesheet + the ide.js
//      island — enumerated, so a new route can never ship an unstyled `.ide` frame again
//      (the /app/new defect: IdeFrame markup with PageData.ide unset);
//   2. /app/new renders the workspace Shell at desktop and the §10.1 blocked note at phone;
//   3. the phone project page's action row is `.ide-actions` button-styled controls (≥44 px),
//      every control ≥ 24 px, §10.1's ✗-set absent;
//   4. the pricing matrix scrolls inside a labelled, keyboard-scrollable region — the page
//      itself never scrolls sideways at 390 or 320 CSS px;
//   5. the sync pill renders IN FLOW (never position:fixed) — no floating "synced ✓" over
//      text at phone width, no overlap with the composer/status bar at desktop.
//
// These are SSR/string-seam tests (inbox-phone.test.ts's pattern); the geometric proofs —
// scrollWidth, bounding-rect overlaps, axe WCAG 2.2 AA — run live in the P1 journey.

const PROJECTS: ProjectRow[] = [
  {
    id: "proj_1",
    slug: "seed-essay",
    title: "Seed Essay",
    headDraftId: "d_1",
    state: {
      key: "draft",
      pill: "Draft",
      overlay: null,
      suggested: { action: "review", label: "Review" },
    },
  },
];

function makeDeps(dataSource: Partial<DataSource> = {}): WebDeps {
  return {
    dataSource: {
      checkSession: async () => true,
      listProjects: async () => PROJECTS,
      checkInvite: async () => ({ ok: false, reason: "unknown" }),
      getBillingBalance: async () => ({
        spendableCredits: 200_000,
        suspended: false,
        clawbackDebt: 0,
      }),
      recordExhaustedPrompt: async () => undefined,
      getInbox: async () => [],
      getInboxBadge: async () => ({ count: 0 }),
      listGates: async () => [],
      listDecisions: async () => [],
      getApprovalOverrides: async () => ({}),
      getPretriage: async () => ({ triaged: 0, total: 0 }),
      ...dataSource,
    },
    session: () => ({}),
  };
}

const MOBILE = { headers: { "sec-ch-ua-mobile": "?1" } };

/** The IDE stylesheet's fingerprint — a rule that exists only in ideCss(). */
const IDE_CSS_MARK = ".ide-phonebar";

describe("UX.2 — the IDE document invariant (REQ-IDE-8)", () => {
  it("every route element that renders the IDE shell gets the IDE stylesheet + island, even if its handler forgot PageData.ide", () => {
    // Enumerate the route manifest; render each element with an `ide`-LESS PageData — the exact
    // pre-fix /app/new shape. Any `.ide` markup ⇒ the document must carry IDE_CSS + ide.js.
    // SPA.27 — flipped rows carry `element: null` (no SSR document exists): `renderToStaticMarkup`
    // on null emits "" and skips them. The enumeration now covers exactly the forced-SSR
    // Page-family elements (REQ-ED-12) + the public funnel.
    const ideRoutes: string[] = [];
    for (const route of routes) {
      let body: string;
      try {
        body = renderToStaticMarkup(
          <PageDataContext.Provider value={{}}>{route.element}</PageDataContext.Provider>,
        );
      } catch {
        continue; // an element that can't SSR with empty data emits no shell either way
      }
      if (!body.includes('data-ide="1"')) continue;
      ideRoutes.push(route.path);
      const doc = renderDocument(route.path, route.element, {});
      expect(doc, `${route.path} renders .ide without the IDE stylesheet`).toContain(IDE_CSS_MARK);
      expect(doc, `${route.path} renders .ide without the ide.js island`).toContain(
        "/assets/ide.js",
      );
    }
    // the enumeration is only meaningful if it actually found IDE routes — pin the set that renders
    // a shell under empty data and confirm the defect's route is no longer among them. The flipped
    // rows (run sheet, import, …) are `element: null` now — no SSR document exists to assert.
    expect(ideRoutes).toContain("/p/:project");
    expect(ideRoutes).not.toContain("/p/:project/run");
    expect(ideRoutes).not.toContain("/p/:project/import");
    expect(ideRoutes).not.toContain("/app/new"); // the fix: the workspace Shell, not IdeFrame
  });

  it("served IDE documents carry the stylesheet + island (the server-driven leg)", async () => {
    const app = createWebApp(makeDeps());
    // SPA.28 — the only SSR IDE documents left are the Page family's forced-SSR arm: phone
    // (`MOBILE`) / showcase — the `?ssr=1` escape is gone. The migrated surfaces' plain GETs
    // answer the shell.
    for (const path of ["/p/seed-essay"]) {
      const res = await app.request(path, MOBILE);
      expect(res.status, path).toBe(200);
      const html = await res.text();
      expect(html, `${path}: .ide markup without IDE_CSS`).not.toBe("");
      if (html.includes('data-ide="1"')) {
        expect(html, path).toContain(IDE_CSS_MARK);
        expect(html, path).toContain("/assets/ide.js");
      }
    }
    // the pinned leg — the forced-SSR project page IS an IDE document (the phone arm)
    const proj = await app.request("/p/seed-essay", MOBILE);
    const html = await proj.text();
    expect(html).toContain('data-ide="1"');
    expect(html).toContain(IDE_CSS_MARK);
    expect(html).toContain("/assets/ide.js");
    // and the flipped surfaces prove the deletion: the shell answers where SSR once did.
    for (const path of ["/p/seed-essay", "/p/seed-essay/run", "/p/seed-essay/import"]) {
      const res = await app.request(path);
      expect(res.status, path).toBe(200);
      const flipped = await res.text();
      expect(flipped, path).toContain('data-renderer="spa"');
      expect(flipped, path).not.toContain('data-ide="1"');
    }
  });
});

describe("UX.2 — /app/new is a workspace surface (ADR-065)", () => {
  it("SPA.27 — serves the SPA shell at desktop: the SSR workspace sheet is deleted", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/app/new");
    expect(res.status).toBe(200);
    const html = await res.text();
    // the SSR workspace sheet is gone — the shell answers and the onboarding leaf renders the
    // styled Shell (the ADR-065 "never IdeFrame markup" surface is covered by the leaf's dom test).
    expect(html).toContain('data-renderer="spa"');
    expect(html).toContain('<div id="spa-root" data-spa-root></div>');
    expect(html).not.toContain('data-ide="1"');
  });

  it("SPA.27 — the phone request still answers the shell; the §10.1 withhold moved to the leaf (boot deviceClass)", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/app/new", MOBILE);
    const html = await res.text();
    // /app/new is not a pageMount route, so no forced-SSR arm fires — the leaf reads
    // `deviceClass: "phone"` off the boot payload and renders the blocked note itself.
    expect(res.status).toBe(200);
    expect(html).toContain('data-renderer="spa"');
    expect(html).toContain('data-device="phone"');
  });
});

describe("UX.2 — the phone project page (REQ-MOBILE-3 amended)", () => {
  it("the surviving action row is `.ide-actions` (button-styled ≥44 px controls in the phone CSS)", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/seed-essay", MOBILE);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('class="ide-actions"');
    // the reader link survives — every §10.1 ✗ affordance stays absent.
    expect(html).toContain('data-edit-source="true"');
    expect(html).not.toContain('href="/p/seed-essay/import"');
    expect(html).not.toContain('href="/p/seed-essay/run"');
    expect(html).not.toContain('href="/p/seed-essay/export"');
    expect(html).not.toContain('data-rename-form="true"');
    expect(html).not.toContain('data-new-project="true"');
  });

  it("ideCss() carries the phone target floor: 44-px primaries, 24-px controls, a tappable phonebar", () => {
    const css = ideCss();
    // button-styled action links at phone width
    expect(css).toContain(".ide .ide-actions a { min-height: 44px");
    // the §10.1 inputs that remain — gate answers, decision options, the chat composer's send,
    // the compact chat's thread links + starter chips (axe target-size flagged these on prod)
    expect(css).toContain("[data-gate-actions] button");
    expect(css).toContain("[data-decision-option]");
    expect(css).toContain(".chat-composer button");
    expect(css).toContain(".chat-threads a");
    expect(css).toContain("[data-chat-chip]");
    // the WCAG 2.5.8 floor
    expect(css).toContain(".ide button { min-height: 24px; min-width: 24px; }");
    // the phonebar's links are ≥44-px targets
    expect(css).toContain(
      ".ide-phonebar a { display: inline-flex; align-items: center; min-height: 44px",
    );
    // the rules live inside the <768 media block — assert the ladder still emits it
    expect(css).toContain("@media (max-width: 767px)");
  });
});

describe("UX.2 — the pricing matrix (ADR-066)", () => {
  it("the matrix scrolls inside a labelled, keyboard-scrollable region", async () => {
    // /pricing redirects signed-in visits to /app — the anonymous leg is the public surface.
    const app = createWebApp({ ...makeDeps(), session: () => null });
    const res = await app.request("/pricing");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('class="table-scroll"');
    expect(html).toContain('role="region"');
    expect(html).toContain('tabindex="0"');
    // the label names what scrolls (the matrix heading re-used — no second copy).
    const regionAt = html.indexOf('role="region"');
    const tableAt = html.indexOf("<table", regionAt);
    expect(tableAt).toBeGreaterThan(regionAt);
    expect(html.slice(regionAt, tableAt)).toContain('aria-label="');
    // the table keeps its natural width under 560px — it scrolls inside the region, never the page.
    expect(html).toContain("min-width:560px");
  });

  it("themeCss() carries the contained-scroll rule", () => {
    expect(themeCss()).toContain(".table-scroll { overflow-x: auto");
  });
});

describe("UX.2 — the sync pill never floats (ADR-069; REQ-IDE-43 amended)", () => {
  it("the page surface's [data-sync-pill] renders in flow — no position:fixed", async () => {
    const app = createWebApp(
      makeDeps({
        // R7RO.1 — `showcase: true` no longer forces SSR (ADR-128: the desktop leg below now
        // answers the SHELL; the MOBILE leg is the surviving forced-SSR phone arm).
        listProjects: async () => [{ ...PROJECTS[0]!, showcase: true }],
        resolveEditorDraft: async (_s: unknown, _p: unknown, v: string) =>
          v === "working" || v === "1"
            ? { draftId: "d_1", draftN: 1, state: "working", origin: "human_revision" }
            : Promise.reject(new ApiError(404, "/x")),
        getEditorDoc: async () => ({
          draftId: "d_1",
          draftN: 1,
          origin: "human_revision",
          state: "working",
          baseDraftId: null,
          baseDraftN: null,
          markdown: "# Hello\n\nA paragraph.\n",
          sha256: "s",
          lock: null,
          findings: [],
          provenance: {},
        }),
      } as never),
    );
    for (const [path, init] of [["/p/seed-essay/v/working", undefined], ["/p/seed-essay/v/working", MOBILE]] as const) {
      const res = await app.request(path, init);
      expect(res.status).toBe(200);
      const html = await res.text();
      if (init === undefined) {
        // R7RO.1 — the desktop leg serves the shell (the showcase arm is deleted; the SPA leaf
        // owns the desktop render): no SSR pill, and the renderer stamp stays truthful.
        expect(html).toContain('data-renderer="spa"');
        expect(html.match(/data-sync-pill/g) ?? []).toHaveLength(0);
        continue;
      }
      const pills = html.match(/data-sync-pill/g) ?? [];
      expect(pills).toHaveLength(1);
      // the pill element is in-flow: no fixed positioning on it or its containing row.
      const rootAt = html.indexOf('data-page-root="1"');
      const pillAt = html.indexOf("data-sync-pill");
      expect(pillAt).toBeGreaterThan(rootAt);
      const tagStart = html.lastIndexOf("<div", pillAt);
      const pillTag = html.slice(tagStart, html.indexOf(">", pillAt) + 1);
      expect(pillTag).not.toContain("position:fixed");
      expect(pillTag).not.toContain("position: fixed");
      // it precedes the document preview — the paper's head, not its foot.
      const viewAt = html.indexOf("data-page-doc");
      expect(viewAt === -1 || pillAt < viewAt).toBe(true);
    }
  });
});
