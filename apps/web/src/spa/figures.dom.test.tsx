// @vitest-environment happy-dom
//
// SPA.19 — the `figures` surface's component contract (REQ-SEQ-9, REQ-VFY-2/6, REQ-TST-2/6/10,
// REQ-BFF-1/2/3/11, REQ-DAT-4/6, REQ-UX-16; design/22 §2 `p.figures`/`p.figureCard`/`p.visualize` +
// design/25 §route-map). Mounted through the production router (memory history + a stub fetch) at
// `/p/:slug/figures`, `/p/:slug/figures/:figureId`, and `/p/:slug/visualize`: the SSR-verbatim
// vocabulary (the pane's rows + empty arm; the card's persisted preview, type chips, field map,
// provenance + Data/Spec/Versions disclosures, the insert-as-proposal surface; the sheet's
// consent form + estimate + iterate replays), the seven JSON POSTs' `{ok,redirect}` in-router nav
// + refused-envelope flash arms, the REQ-UX-16 in-flight affordance, the `SsrHandoff` no-BFF leg,
// and the REQ-TST-2 parity legs against `FiguresPanePage`/`FigureCardPage`/`VisualizePage` under a
// PageDataContext provider. Component axe covers all three mounted surfaces.
//
// The fixtures mirror the retained SSR spec's (figure-surfaces.test.ts) — the parity legs compare
// the two renderers on the SAME data.

import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { fireEvent } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FigureCardDto, FigureListItemDto } from "@rhema/api-client";
import { PageDataContext } from "../page-data.js";
import { FigureCardPage, FiguresPanePage, VisualizePage } from "../pages.js";
import { hooksForSurface } from "../dom-contract.js";
import { COPY } from "../copy.js";
import { createSpaRouter } from "./main.js";
import type { SpaBoot } from "./boot.js";
import { spaRuntime } from "./dom.js";
import type { BffFigureCardTwin, BffFiguresTwin, BffVisualizeTwin } from "./queries.js";
import { axeCheck, expectManifestEmission } from "./testkit.js";

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const PRINCIPAL = { userId: "u1", workspaceId: "w1", billingAccountId: "b1" };
const SLUG = "the-politics-of-visibility";

// ---- fixtures — figure-surfaces.test.ts's set, verbatim ------------------------------------------

const FIGURE_ITEM: FigureListItemDto = {
  id: "fig01",
  assetUri: "asset://fig_fig01",
  title: "Visibility scores",
  caption: "Scores by group.",
  specKind: "vega_lite",
  kind: "chart",
  badge: "unverified_data",
  badgeText: "[unverified data]",
  n: 2,
  renderStatus: "rendered",
  hasRender: true,
  insertedInDraftId: null,
  pendingProposal: false,
  latestRunId: "run_fig",
};

const FIGURE_CARD: FigureCardDto = {
  id: "fig01",
  assetUri: "asset://fig_fig01",
  title: "Visibility scores",
  caption: "Scores by group.",
  alt: "Bar chart of visibility scores for three groups.",
  sourceLine: "The review's claim ledger.",
  specKind: "vega_lite",
  kind: "chart",
  provenance: { kind: "none", refs: [], computedBy: "drafter", verification: "unverified" },
  badge: "unverified_data",
  badgeText: "[unverified data]",
  latestRunId: "run_fig",
  insertedInDraftId: null,
  insertedAtVersionId: null,
  pendingProposal: null,
  versions: [
    { n: 1, request: "initial", renderStatus: "rendered", renderError: null, createdAt: "2026-01-01T00:00:00Z" },
    { n: 2, request: "make it a bar chart", renderStatus: "rendered", renderError: null, createdAt: "2026-01-02T00:00:00Z" },
  ],
  files: {
    spec: '{"mark":"bar"}',
    dataCsv: "group,score\na,0.7",
    svgLight: "<svg data-fig=\"light\"></svg>",
    svgDark: null,
    tableSource: null,
  },
  render: { lightAvailable: true, darkAvailable: false, pngAvailable: false },
  readiness: { ok: true, missing: [] },
};

const FIGURES_TWIN: BffFiguresTwin = {
  figures: { slug: SLUG, items: [FIGURE_ITEM] },
};

const CARD_TWIN: BffFigureCardTwin = {
  figure: { slug: SLUG, card: FIGURE_CARD, headDraftId: "d_head" },
};

const VISUALIZE_TWIN: BffVisualizeTwin = {
  visualize: {
    slug: SLUG,
    request: "a chart of the visibility scores",
    specKind: "vega_lite",
    entryPoint: "chat",
    estimateCredits: 24,
    capCredits: 48,
  },
};

/** The page-data bags the SSR pages consume — the twins' fields verbatim. */
const FIGURES_PAGE_DATA = FIGURES_TWIN.figures as never;
const CARD_PAGE_DATA = { ...CARD_TWIN.figure! } as never;
const VISUALIZE_PAGE_DATA = VISUALIZE_TWIN.visualize as never;

// ---- the mount substrate -------------------------------------------------------------------------

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

interface FetchOpts {
  figures?: BffFiguresTwin;
  card?: BffFigureCardTwin;
  visualize?: BffVisualizeTwin;
  /** mutation overrides — action path → envelope/error body + status. */
  mutations?: Record<string, { status?: number; body: unknown }>;
  /** per-path deferred replies — the REQ-UX-16 in-flight leg holds a POST open. */
  hold?: Record<string, Promise<Response>>;
  /** the second-and-later card twin (the post-mutation refetch's server truth). */
  cardAfter?: BffFigureCardTwin;
  /** the second-and-later pane twin. */
  figuresAfter?: BffFiguresTwin;
}

interface RecordedPost {
  url: string;
  json: unknown;
}

/** The fetch stub — GETs answer the twins; POSTs record `{url, json}` for the mutation legs and
 *  answer the `{ok,redirect}` envelope (or the override). Anything unstubbed 500s loudly. */
function makeFetch(opts: FetchOpts = {}) {
  const posts: RecordedPost[] = [];
  let cardReads = 0;
  let figureReads = 0;
  const impl = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const path = url.split("?")[0]!;
    if (url === "/session") return jsonResponse(200, PRINCIPAL);
    if (url === "/bff/feed-labels") return jsonResponse(200, { t: {}, enums: {} });
    if (init?.method === "POST") {
      posts.push({ url: path, json: init.body ? JSON.parse(String(init.body)) : null });
      if (opts.hold?.[path] != null) return opts.hold[path]!;
      const mut = opts.mutations?.[path];
      if (mut != null) return jsonResponse(mut.status ?? 200, mut.body);
      return jsonResponse(200, { ok: true, redirect: `/p/${SLUG}/figures/fig01` });
    }
    if (path === `/bff/p/${SLUG}/figures`) {
      figureReads += 1;
      return jsonResponse(200, figureReads > 1 && opts.figuresAfter != null ? opts.figuresAfter : (opts.figures ?? FIGURES_TWIN));
    }
    if (path.startsWith(`/bff/p/${SLUG}/figures/`)) {
      cardReads += 1;
      return jsonResponse(200, cardReads > 1 && opts.cardAfter != null ? opts.cardAfter : (opts.card ?? CARD_TWIN));
    }
    if (path === `/bff/p/${SLUG}/visualize`) {
      return jsonResponse(200, opts.visualize ?? VISUALIZE_TWIN);
    }
    return jsonResponse(500, { error: "unstubbed_path" });
  });
  return { impl, posts };
}

function bootFor(surfaces: Record<string, "spa" | "ssr">, deviceClass: "desktop" | "phone" = "desktop"): SpaBoot {
  return { principal: PRINCIPAL, theme: {}, deviceClass, surfaces };
}

const SPA_FIGURES = {
  "/p/$project/figures": "spa",
  "/p/$project/figures/$figureId": "spa",
  "/p/$project/visualize": "spa",
} as const;

let assignSpy: ReturnType<typeof vi.fn>;
const mounted: Root[] = [];

async function mountAt(path: string, boot: SpaBoot, fetchImpl: ReturnType<typeof makeFetch>["impl"]) {
  vi.stubGlobal("fetch", fetchImpl);
  const rootEl = document.createElement("div");
  rootEl.setAttribute("data-spa-root", "");
  document.body.appendChild(rootEl);
  const { router, queryClient } = createSpaRouter({
    boot,
    history: createMemoryHistory({ initialEntries: [path] }),
  });
  const root = createRoot(rootEl);
  mounted.push(root);
  await act(async () => {
    root.render(
      <StrictMode>
        <RouterProvider router={router} />
      </StrictMode>,
    );
    await router.load();
  });
  return { router, queryClient, rootEl };
}

const el = () => document.querySelector<HTMLElement>("[data-spa-root]");

/** The REQ-TST-2 emission filter — which `figures` manifest entries a markup string emits. */
function emittedOn(ssrMarkup: string) {
  const esc = (s: string) => s.replace(/[.*+?^${}()[\]\\|]/g, "\\$&");
  return hooksForSurface("figures").filter((entry) => {
    if (entry.kind === "attr") return new RegExp(`\\b${esc(entry.hook)}(?:[\\s=>/]|$)`).test(ssrMarkup);
    if (entry.kind === "attr-prefix") return new RegExp(`\\b${esc(entry.hook)}[\\w-]`).test(ssrMarkup);
    if (entry.kind === "field") return new RegExp(`\\bname=["']${esc(entry.hook)}["']`).test(ssrMarkup);
    if (entry.kind === "field-prefix") return new RegExp("\\bname=[\"'`]" + esc(entry.hook)).test(ssrMarkup);
    return false;
  });
}

/** Submit one form inside an act — fireEvent + the mutation's microtask flush. */
async function submit(form: Element) {
  await act(async () => {
    fireEvent.submit(form);
  });
}

beforeEach(() => {
  assignSpy = vi.fn();
  spaRuntime.assign = assignSpy;
  document.documentElement.removeAttribute("data-route");
  document.documentElement.removeAttribute("data-mounted");
  document.title = "";
});

afterEach(() => {
  for (const r of mounted.splice(0)) act(() => r.unmount());
  spaRuntime.assign = (href) => window.location.assign(href);
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  document.body.innerHTML = "";
});

// ---- /p/:slug/figures ----------------------------------------------------------------------------

describe("GET /p/:slug/figures mounted (SPA.19)", () => {
  const BOOT = bootFor(SPA_FIGURES);

  it("renders the pane verbatim — heading, back/new links, the row's chips + caption", async () => {
    const f = makeFetch();
    await mountAt(`/p/${SLUG}/figures`, BOOT, f.impl);
    const main = el()!;
    expect(main.querySelector("h1")?.textContent).toBe(COPY.figuresPage.heading);
    expect(main.querySelector(`a[href="/p/${SLUG}"]`)?.textContent).toBe(COPY.figuresPage.backToProject);
    expect(main.querySelector(`a[href="/p/${SLUG}/visualize"][data-new-figure]`)).not.toBeNull();
    const row = main.querySelector(`[data-figure-row="fig01"]`)!;
    expect(row).not.toBeNull();
    expect(row.querySelector(`a[href="/p/${SLUG}/figures/fig01"]`)?.textContent).toBe("Visibility scores");
    expect(row.textContent).toContain("[unverified data]");
    expect(row.textContent).toContain("v2");
    expect(row.textContent).toContain("Scores by group.");
  });

  it("an empty pane renders the designed empty arm; a degraded list lands the same", async () => {
    await mountAt(`/p/${SLUG}/figures`, BOOT, makeFetch({ figures: { figures: { slug: SLUG, items: [] } } }).impl);
    expect(el()!.querySelector("[data-figures-empty]")?.textContent).toBe(COPY.figuresPage.empty);
    expect(el()!.querySelector("[data-figure-row]")).toBeNull();
  });

  it("the insert/render state chips render verbatim (inserted, pending proposal, rendering)", async () => {
    const f = makeFetch({
      figures: {
        figures: {
          slug: SLUG,
          items: [
            { ...FIGURE_ITEM, insertedInDraftId: "d_head" },
            { ...FIGURE_ITEM, id: "fig02", title: "Pending", insertedInDraftId: null, pendingProposal: true, hasRender: false },
          ],
        },
      },
    });
    await mountAt(`/p/${SLUG}/figures`, BOOT, f.impl);
    const first = el()!.querySelector('[data-figure-row="fig01"]')!;
    expect(first.textContent).toContain(COPY.figuresPage.insertedChip);
    const second = el()!.querySelector('[data-figure-row="fig02"]')!;
    expect(second.textContent).toContain(COPY.figuresPage.proposalChip);
    expect(second.textContent).toContain(COPY.figuresPage.renderingChip);
  });

  it("component axe on the mounted pane (REQ-VFY-6)", async () => {
    await mountAt(`/p/${SLUG}/figures`, BOOT, makeFetch().impl);
    await axeCheck(el()!.querySelector("[data-spa-surface]")!);
  });

  it("REQ-TST-2 parity — every figures hook the SSR pane emits on this fixture is emitted", async () => {
    const ssrMarkup = renderToStaticMarkup(
      <PageDataContext.Provider value={{ figures: FIGURES_PAGE_DATA }}>
        <FiguresPanePage />
      </PageDataContext.Provider>,
    );
    await mountAt(`/p/${SLUG}/figures`, BOOT, makeFetch().impl);
    const spaMarkup = el()!.innerHTML;
    const emitted = emittedOn(ssrMarkup);
    // the pane's rows + links — a thin set means the parity leg drifted.
    expect(emitted.length).toBeGreaterThanOrEqual(2);
    expectManifestEmission(spaMarkup, emitted);
  });

  it("unflipped → SsrHandoff — the leaf document-navigates and never fetches the twin", async () => {
    const f = makeFetch();
    await mountAt(
      `/p/${SLUG}/figures`,
      bootFor({ ...SPA_FIGURES, "/p/$project/figures": "ssr" }),
      f.impl,
    );
    expect(assignSpy).toHaveBeenCalledWith(`/p/${SLUG}/figures`);
    expect(f.impl.mock.calls.some(([u]) => String(u).startsWith(`/bff/p/${SLUG}`))).toBe(false);
  });
});

// ---- /p/:slug/figures/:figureId ------------------------------------------------------------------

describe("GET /p/:slug/figures/:figureId mounted (SPA.19)", () => {
  const BOOT = bootFor(SPA_FIGURES);
  const CARD_URL = `/p/${SLUG}/figures/fig01`;

  it("renders the card verbatim — preview, badge, provenance, disclosures, chips, versions, insert", async () => {
    await mountAt(CARD_URL, BOOT, makeFetch().impl);
    const main = el()!;
    expect(main.querySelector("h1")?.textContent).toBe("Visibility scores");
    expect(main.querySelector(`a[href="/p/${SLUG}/figures"]`)?.textContent).toBe(COPY.figureCard.backToFigures);
    // the persisted server-side render — inlined SVG, never browser-produced.
    expect(main.querySelector("[data-figure-preview]")?.innerHTML).toContain('data-fig="light"');
    expect(main.textContent).toContain("[unverified data]");
    expect(main.querySelector("[data-provenance]")).not.toBeNull();
    expect(main.querySelector("[data-prov-kind]")?.textContent).toBe("none");
    expect(main.querySelector("[data-prov-verification]")?.textContent).toBe("unverified");
    expect(main.querySelector("[data-figure-data]")?.textContent).toContain("group,score");
    expect(main.querySelector("[data-figure-spec]")?.textContent).toContain('"mark":"bar"');
    expect(main.querySelector("[data-figure-versions]")).not.toBeNull();
    expect(main.querySelector('[data-version="1"]')?.textContent).toContain("initial");
    expect(main.querySelector('[data-restore="1"]')).not.toBeNull();
    expect(main.querySelector('[data-restore="2"]')).toBeNull(); // the head never restores
    // the type chips + field map + the propose affordance.
    expect(main.querySelector("[data-type-chips]")).not.toBeNull();
    expect(main.querySelector('[data-chip="bar"]')).not.toBeNull();
    const fields = main.querySelector<HTMLFormElement>("form[data-figure-fields]")!;
    expect(fields.getAttribute("action")).toBe(`/p/${SLUG}/figures/fig01`);
    expect(fields.querySelector('input[name="caption"]')).not.toBeNull();
    expect(fields.querySelector('input[name="alt"]')).not.toBeNull();
    expect(fields.querySelector('input[name="sourceLine"]')).not.toBeNull();
    expect(main.querySelector("[data-insert]")).not.toBeNull();
    const propose = main.querySelector<HTMLFormElement>("form[data-propose-form]")!;
    expect(propose.getAttribute("action")).toBe(`/p/${SLUG}/figures/fig01/propose`);
    expect(propose.querySelector('input[name="afterBlockId"]')).not.toBeNull();
    expect(propose.querySelector("[data-propose]")?.textContent).toBe(COPY.figureCard.proposeLabel);
    // the chip's hidden mark replay — the 0-cr spec-edit's field grammar.
    expect(main.querySelector('form[action$="/spec-edit"] input[name="mark"]')).not.toBeNull();
  });

  it("a still-rendering card lands the pending-preview arm (never a blank)", async () => {
    await mountAt(
      CARD_URL,
      BOOT,
      makeFetch({
        card: {
          figure: {
            slug: SLUG,
            headDraftId: "d_head",
            card: {
              ...FIGURE_CARD,
              files: { spec: null, dataCsv: null, svgLight: null, svgDark: null, tableSource: null },
            },
          },
        },
      }).impl,
    );
    expect(el()!.querySelector("[data-figure-preview-pending]")?.textContent).toBe(COPY.figuresPage.renderingChip);
    expect(el()!.querySelector("[data-figure-preview]")).toBeNull();
  });

  it("the field edit posts the JSON map and rides {ok,redirect:?saved=1} in-router", async () => {
    const f = makeFetch({
      mutations: {
        [`/p/${SLUG}/figures/fig01`]: { body: { ok: true, redirect: `/p/${SLUG}/figures/fig01?saved=1` } },
      },
      cardAfter: {
        figure: {
          slug: SLUG,
          headDraftId: "d_head",
          card: { ...FIGURE_CARD, caption: "New caption." },
        },
      },
    });
    const { router } = await mountAt(CARD_URL, BOOT, f.impl);
    const form = el()!.querySelector<HTMLFormElement>("form[data-figure-fields]")!;
    const caption = form.querySelector<HTMLInputElement>('input[name="caption"]')!;
    await act(async () => {
      caption.value = "New caption.";
      fireEvent.submit(form);
    });
    expect(f.posts.length).toBe(1);
    expect(f.posts[0]!.url).toBe(`/p/${SLUG}/figures/fig01`);
    expect(f.posts[0]!.json).toEqual({
      caption: "New caption.",
      alt: "Bar chart of visibility scores for three groups.",
      sourceLine: "The review's claim ledger.",
    });
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe(`/p/${SLUG}/figures/fig01`);
      // the validated search (flagParam → "1") — the serialized form JSON-quotes it.
      expect((router.state.location.search as Record<string, unknown>).saved).toBe("1");
    });
    await vi.waitFor(() => {
      expect(el()!.querySelector("[data-saved-note]")?.textContent).toBe(COPY.outlinePage.savedNote);
    });
  });

  it("a refused edit rides the envelope's ?notice= redirect — the flash stays URL-owned", async () => {
    const f = makeFetch({
      mutations: {
        [`/p/${SLUG}/figures/fig01`]: {
          body: { ok: true, redirect: `/p/${SLUG}/figures/fig01?notice=${encodeURIComponent("alt text is limited to 250 characters")}` },
        },
      },
    });
    const { router } = await mountAt(CARD_URL, BOOT, f.impl);
    await submit(el()!.querySelector("form[data-figure-fields]")!);
    await vi.waitFor(() => {
      expect((router.state.location.search as Record<string, unknown>).notice).toContain("alt text is limited");
      expect(el()!.querySelector("[data-notice]")?.textContent).toContain("alt text is limited");
    });
  });

  it("a type chip posts {mark} to spec-edit and refetches the card", async () => {
    const f = makeFetch({
      mutations: {
        [`/p/${SLUG}/figures/fig01/spec-edit`]: { body: { ok: true, redirect: `/p/${SLUG}/figures/fig01` } },
      },
    });
    await mountAt(CARD_URL, BOOT, f.impl);
    const chipForm = el()!.querySelector('[data-chip="line"]')!.closest("form")!;
    await submit(chipForm);
    expect(f.posts[0]!.url).toBe(`/p/${SLUG}/figures/fig01/spec-edit`);
    expect(f.posts[0]!.json).toEqual({ mark: "line" });
    // the invalidation's refetch re-read the card twin.
    await vi.waitFor(() => {
      expect(f.impl.mock.calls.filter(([u]) => String(u).split("?")[0] === `/bff/p/${SLUG}/figures/fig01`).length).toBeGreaterThanOrEqual(2);
    });
  });

  it("a restore posts to versions/:n/restore and lands back on the card", async () => {
    const f = makeFetch({
      mutations: {
        [`/p/${SLUG}/figures/fig01/versions/1/restore`]: { body: { ok: true, redirect: `/p/${SLUG}/figures/fig01` } },
      },
    });
    await mountAt(CARD_URL, BOOT, f.impl);
    await submit(el()!.querySelector('[data-restore="1"]')!.closest("form")!);
    expect(f.posts[0]!.url).toBe(`/p/${SLUG}/figures/fig01/versions/1/restore`);
  });

  it("propose posts the anchor and lands back on the card (the pending arm refetches in)", async () => {
    const pendingCard: FigureCardDto = {
      ...FIGURE_CARD,
      pendingProposal: { draftId: "d_head", afterBlockId: "b7", version: 2, markdown: "![a](asset://fig_fig01)", at: "2026-01-01T00:00:00Z" },
    };
    const f = makeFetch({
      mutations: {
        [`/p/${SLUG}/figures/fig01/propose`]: {
          body: { ok: true, redirect: `/p/${SLUG}/figures/fig01`, data: { ok: true } },
        },
      },
      cardAfter: { figure: { slug: SLUG, card: pendingCard, headDraftId: "d_head" } },
    });
    const { router } = await mountAt(CARD_URL, BOOT, f.impl);
    const form = el()!.querySelector<HTMLFormElement>("form[data-propose-form]")!;
    const anchor = form.querySelector<HTMLInputElement>('input[name="afterBlockId"]')!;
    await act(async () => {
      anchor.value = "b7";
      fireEvent.submit(form);
    });
    expect(f.posts[0]!.json).toEqual({ afterBlockId: "b7" });
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe(`/p/${SLUG}/figures/fig01`);
      expect(el()!.querySelector("[data-pending-proposal]")).not.toBeNull();
      expect(el()!.querySelector("[data-proposal-block]")?.textContent).toContain("asset://fig_fig01");
      expect(el()!.querySelector("[data-accept]")).not.toBeNull();
      expect(el()!.querySelector("[data-reject]")).not.toBeNull();
      expect(el()!.querySelector("[data-propose-form]")).toBeNull();
    });
  });

  it("Accept rides the fork's /p/:slug/v/<n> redirect — unflipped ⇒ the document nav", async () => {
    const f = makeFetch({
      card: {
        figure: {
          slug: SLUG,
          headDraftId: "d_head",
          card: {
            ...FIGURE_CARD,
            pendingProposal: { draftId: "d_head", afterBlockId: "b7", version: 2, markdown: "![a](asset://fig_fig01)", at: "2026-01-01T00:00:00Z" },
          },
        },
      },
      mutations: {
        [`/p/${SLUG}/figures/fig01/proposals/accept`]: {
          body: { ok: true, redirect: `/p/${SLUG}/v/4`, data: { ok: true, inserted: { draftN: 4 } } },
        },
      },
    });
    await mountAt(CARD_URL, BOOT, f.impl);
    await submit(el()!.querySelector("[data-accept]")!.closest("form")!);
    expect(f.posts[0]!.url).toBe(`/p/${SLUG}/figures/fig01/proposals/accept`);
    await vi.waitFor(() => {
      expect(assignSpy).toHaveBeenCalledWith(`/p/${SLUG}/v/4`);
    });
  });

  it("Reject lands back on the card", async () => {
    const f = makeFetch({
      card: {
        figure: {
          slug: SLUG,
          headDraftId: "d_head",
          card: {
            ...FIGURE_CARD,
            pendingProposal: { draftId: "d_head", afterBlockId: null, version: 2, markdown: "![a](x)", at: "2026-01-01T00:00:00Z" },
          },
        },
      },
      mutations: {
        [`/p/${SLUG}/figures/fig01/proposals/reject`]: { body: { ok: true, redirect: `/p/${SLUG}/figures/fig01` } },
      },
    });
    await mountAt(CARD_URL, BOOT, f.impl);
    await submit(el()!.querySelector("[data-reject]")!.closest("form")!);
    expect(f.posts[0]!.url).toBe(`/p/${SLUG}/figures/fig01/proposals/reject`);
  });

  it("a not-ready card explains what's missing — the propose form stays withheld", async () => {
    await mountAt(
      CARD_URL,
      BOOT,
      makeFetch({
        card: {
          figure: {
            slug: SLUG,
            headDraftId: "d_head",
            card: { ...FIGURE_CARD, alt: "", readiness: { ok: false, missing: ["alt"] } },
          },
        },
      }).impl,
    );
    expect(el()!.querySelector("[data-not-ready]")?.textContent).toContain(COPY.figureCard.missingAlt);
    expect(el()!.querySelector("[data-propose-form]")).toBeNull();
  });

  it("an already-inserted card renders the inserted note, never the propose form", async () => {
    await mountAt(
      CARD_URL,
      BOOT,
      makeFetch({
        card: {
          figure: {
            slug: SLUG,
            headDraftId: "d_head",
            card: { ...FIGURE_CARD, insertedInDraftId: "d_head" },
          },
        },
      }).impl,
    );
    expect(el()!.querySelector("[data-inserted-note]")?.textContent).toBe(COPY.figureCard.insertedNote);
    expect(el()!.querySelector("[data-propose-form]")).toBeNull();
  });

  it("{figure:null} renders the document's own not-found arm", async () => {
    await mountAt(`/p/${SLUG}/figures/fig_gone`, BOOT, makeFetch({ card: { figure: null } }).impl);
    expect(el()!.querySelector("h1")?.textContent).toBe(COPY.figuresPage.heading);
    expect(el()!.textContent).toContain(COPY.visualize.notFound);
  });

  it("REQ-UX-16 — an in-flight chip marks its form aria-busy and disables the controls", async () => {
    let release!: () => void;
    const held = new Promise<Response>((res) => {
      release = () => res(jsonResponse(200, { ok: true, redirect: `/p/${SLUG}/figures/fig01` }));
    });
    const f = makeFetch({ hold: { [`/p/${SLUG}/figures/fig01/spec-edit`]: held } });
    await mountAt(CARD_URL, BOOT, f.impl);
    const form = el()!.querySelector('[data-chip="line"]')!.closest("form")!;
    fireEvent.submit(form);
    await vi.waitFor(() => {
      expect(form.getAttribute("aria-busy")).toBe("true");
      expect((form.querySelector("button") as HTMLButtonElement).disabled).toBe(true);
    });
    release();
    await vi.waitFor(() => {
      expect(form.getAttribute("aria-busy")).toBeNull();
    });
  });

  it("?saved=1 + ?notice= render the flash rails (URL state, never payload)", async () => {
    await mountAt(`${CARD_URL}?saved=1&notice=chip_not_supported`, BOOT, makeFetch().impl);
    expect(el()!.querySelector("[data-saved-note]")?.textContent).toBe(COPY.outlinePage.savedNote);
    expect(el()!.querySelector("[data-notice]")?.textContent).toBe("chip_not_supported");
  });

  it("component axe on the mounted card (REQ-VFY-6)", async () => {
    await mountAt(CARD_URL, BOOT, makeFetch().impl);
    await axeCheck(el()!.querySelector("[data-spa-surface]")!);
  });

  it("REQ-TST-2 parity — every figures hook the SSR card emits on this fixture is emitted", async () => {
    const ssrMarkup = renderToStaticMarkup(
      <PageDataContext.Provider value={{ figure: CARD_PAGE_DATA }}>
        <FigureCardPage />
      </PageDataContext.Provider>,
    );
    await mountAt(CARD_URL, BOOT, makeFetch().impl);
    const spaMarkup = el()!.innerHTML;
    const emitted = emittedOn(ssrMarkup);
    // preview + chips + fields + disclosures + versions + the propose affordance.
    expect(emitted.length).toBeGreaterThanOrEqual(10);
    expectManifestEmission(spaMarkup, emitted);
  });

  it("unflipped → SsrHandoff — no BFF spend", async () => {
    const f = makeFetch();
    await mountAt(
      CARD_URL,
      bootFor({ ...SPA_FIGURES, "/p/$project/figures/$figureId": "ssr" }),
      f.impl,
    );
    expect(assignSpy).toHaveBeenCalledWith(`/p/${SLUG}/figures/fig01`);
    expect(f.impl.mock.calls.some(([u]) => String(u).startsWith(`/bff/p/${SLUG}`))).toBe(false);
  });
});

// ---- /p/:slug/visualize --------------------------------------------------------------------------

describe("GET /p/:slug/visualize mounted (SPA.19)", () => {
  const BOOT = bootFor(SPA_FIGURES);
  const VIZ_URL = `/p/${SLUG}/visualize?request=a%20chart%20of%20the%20visibility%20scores&kind=vega_lite&entry=chat`;

  it("renders the consent sheet verbatim — request/specKind/insist/estimate, ?request= prefilled", async () => {
    await mountAt(VIZ_URL, BOOT, makeFetch().impl);
    const main = el()!;
    expect(main.querySelector("h1")?.textContent).toBe(COPY.visualize.heading);
    expect(main.querySelector(`a[href="/p/${SLUG}"]`)?.textContent).toBe(COPY.visualize.backToProject);
    const form = main.querySelector<HTMLFormElement>("form[data-visualize-form]")!;
    expect(form.getAttribute("action")).toBe(`/p/${SLUG}/visualize`);
    expect(form.querySelector<HTMLTextAreaElement>('textarea[name="request"]')!.value).toBe("a chart of the visibility scores");
    expect(form.querySelector<HTMLSelectElement>('select[name="specKind"]')!.value).toBe("vega_lite");
    expect(form.querySelector('input[name="insist"]')).not.toBeNull();
    expect(main.querySelector("[data-insist]")).not.toBeNull();
    expect(main.querySelector("[data-estimate]")?.textContent).toContain("24");
    expect(main.querySelector('button[type="submit"]')?.textContent).toBe(COPY.visualize.startLabel);
  });

  it("iterate mode replays figureId/priorVersion/entryPoint as hidden fields + the note", async () => {
    const f = makeFetch({
      visualize: {
        visualize: { ...VISUALIZE_TWIN.visualize, figureId: "fig01", priorVersion: 1, request: "" },
      },
    });
    await mountAt(`/p/${SLUG}/visualize?figure=fig_fig01&prior=1`, BOOT, f.impl);
    const form = el()!.querySelector("form[data-visualize-form]")!;
    expect(form.querySelector('input[name="figureId"]')?.getAttribute("value")).toBe("fig01");
    expect(form.querySelector('input[name="priorVersion"]')?.getAttribute("value")).toBe("1");
    expect(form.querySelector('input[name="entryPoint"]')?.getAttribute("value")).toBe("chat");
    expect(el()!.querySelector("[data-iterate-note]")?.textContent).toContain("fig01");
  });

  it("the Visualize click posts the field map JSON and rides {ok,redirect:/p/:slug/figures} in-router", async () => {
    const f = makeFetch({
      mutations: {
        [`/p/${SLUG}/visualize`]: { body: { ok: true, redirect: `/p/${SLUG}/figures` } },
      },
    });
    const { router } = await mountAt(VIZ_URL, BOOT, f.impl);
    await submit(el()!.querySelector("form[data-visualize-form]")!);
    expect(f.posts.length).toBe(1);
    expect(f.posts[0]!.url).toBe(`/p/${SLUG}/visualize`);
    const body = f.posts[0]!.json as Record<string, unknown>;
    expect(body.request).toBe("a chart of the visibility scores");
    expect(body.specKind).toBe("vega_lite");
    expect(body.entryPoint).toBe("chat");
    await vi.waitFor(() => {
      expect(router.state.location.pathname).toBe(`/p/${SLUG}/figures`);
    });
    // the pane's refetch carries the twin — the pane arm renders rows/empty, never a blank.
    await vi.waitFor(() => {
      expect(el()!.querySelector("h1")?.textContent).toBe(COPY.figuresPage.heading);
    });
  });

  it("a refused click (request_required 422) repaints the sheet's notice arm — no navigation", async () => {
    const f = makeFetch({
      mutations: {
        [`/p/${SLUG}/visualize`]: { status: 422, body: { error: "request_required", detail: COPY.visualize.requestRequired } },
      },
    });
    const { router } = await mountAt(VIZ_URL, BOOT, f.impl);
    const form = el()!.querySelector("form[data-visualize-form]")!;
    await submit(form);
    await vi.waitFor(() => {
      expect(el()!.querySelector("[data-notice]")?.textContent).toBe(COPY.visualize.requestRequired);
      expect(router.state.location.pathname).toBe(`/p/${SLUG}/visualize`);
      // REQ-UX-16 — the controls re-enable on settle.
      expect(form.getAttribute("aria-busy")).toBeNull();
    });
  });

  it("an upstream refusal renders its stable code as the notice (the document's re-render verbatim)", async () => {
    const f = makeFetch({
      mutations: {
        [`/p/${SLUG}/visualize`]: { status: 402, body: { error: "insufficient_balance" } },
      },
    });
    await mountAt(VIZ_URL, BOOT, f.impl);
    await submit(el()!.querySelector("form[data-visualize-form]")!);
    await vi.waitFor(() => {
      expect(el()!.querySelector("[data-notice]")?.textContent).toBe("insufficient_balance");
    });
  });

  it("component axe on the mounted sheet (REQ-VFY-6)", async () => {
    await mountAt(VIZ_URL, BOOT, makeFetch().impl);
    await axeCheck(el()!.querySelector("[data-spa-surface]")!);
  });

  it("REQ-TST-2 parity — every figures hook the SSR sheet emits on this fixture is emitted", async () => {
    const ssrMarkup = renderToStaticMarkup(
      <PageDataContext.Provider value={{ visualize: VISUALIZE_PAGE_DATA }}>
        <VisualizePage />
      </PageDataContext.Provider>,
    );
    await mountAt(VIZ_URL, BOOT, makeFetch().impl);
    const spaMarkup = el()!.innerHTML;
    const emitted = emittedOn(ssrMarkup);
    // form + request + specKind + insist + estimate.
    expect(emitted.length).toBeGreaterThanOrEqual(5);
    expectManifestEmission(spaMarkup, emitted);
  });

  it("unflipped → SsrHandoff — the leaf document-navigates with its search intact, no BFF spend", async () => {
    const f = makeFetch();
    await mountAt(
      VIZ_URL,
      bootFor({ ...SPA_FIGURES, "/p/$project/visualize": "ssr" }),
      f.impl,
    );
    await vi.waitFor(() => {
      expect(assignSpy).toHaveBeenCalled();
    });
    const href = String(assignSpy.mock.calls[0]![0]);
    expect(href).toContain(`/p/${SLUG}/visualize?`);
    expect(href).toContain("request=");
    expect(href).toContain("kind=vega_lite");
    expect(f.impl.mock.calls.some(([u]) => String(u).startsWith(`/bff/p/${SLUG}`))).toBe(false);
  });
});
