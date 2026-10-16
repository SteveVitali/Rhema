import { describe, it, expect, vi } from "vitest";
import { ApiError, type FigureCardDto, type FigureListItemDto, type ProjectRow } from "@rhema/api-client";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource } from "./data.js";

// P1.13 — the Figures surface's web half (§7.5): `/visualize` in chat resolves to the visualize
// SHEET (never an inline run — the sheet's Visualize click is the only figure-run creator,
// REQ-CHAT-25's consent rule), the pane + card render the api's rows with the `[unverified data]`
// badge verbatim, the type chips + field edits POST through the api, and the insert proposal's
// Accept/Reject rides the card — never a direct draft write.

const PROJECTS: ProjectRow[] = [
  {
    id: "proj_pv",
    slug: "the-politics-of-visibility",
    title: "The Politics of Visibility",
    headDraftId: "d_head",
    state: {
      key: "drafting",
      pill: "Drafting",
      overlay: null,
      suggested: { action: "review", label: "Review" },
    },
  } as ProjectRow,
];

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
  provenance: {
    kind: "none",
    refs: [],
    computedBy: "drafter",
    verification: "unverified",
  },
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
    svgDark: "<svg data-fig=\"dark\"></svg>",
    tableSource: null,
  },
  render: { lightAvailable: true, darkAvailable: true, pngAvailable: false },
  readiness: { ok: true, missing: [] },
};

function makeDeps(over: Partial<DataSource> = {}): WebDeps {
  return {
    dataSource: {
      checkSession: async () => true,
      listProjects: async () => PROJECTS,
      checkInvite: async () => ({ ok: false, reason: "unknown" }),
      listFigures: async () => [FIGURE_ITEM],
      getFigure: async () => FIGURE_CARD,
      ...over,
    },
    session: () => ({}),
  };
}

function form(fields: Record<string, string>): { body: string; headers: Record<string, string> } {
  return {
    body: new URLSearchParams(fields).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  };
}

describe("/visualize in chat — the verb resolves to the visualize SHEET, never an inline run", () => {
  it("`/visualize <text>` redirects to the sheet with the request prefilled; postChatTurn is never called", async () => {
    const postChatTurn = vi.fn(async () => ({} as never));
    const app = createWebApp(makeDeps({ postChatTurn: postChatTurn as never }));
    const res = await app.request("/p/the-politics-of-visibility/chat/turns", {
      method: "POST",
      ...form({ threadId: "thr_1", message: "/visualize a chart of the visibility scores" }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "/p/the-politics-of-visibility/visualize?request=a%20chart%20of%20the%20visibility%20scores",
    );
    expect(postChatTurn).not.toHaveBeenCalled();
  });

  it("bare `/visualize` opens the sheet empty", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/the-politics-of-visibility/chat/turns", {
      method: "POST",
      ...form({ threadId: "thr_1", message: "/visualize" }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-politics-of-visibility/visualize");
  });
});

describe("the /visualize sheet — the consent surface (GET + the Visualize click)", () => {
  it("the twin echoes the request/spec-kind/entry fields + the server-computed estimate", async () => {
    const app = createWebApp(makeDeps());
    // the document is the shell now; the sheet's facts ride `/bff/p/:slug/visualize` verbatim.
    expect((await app.request("/p/the-politics-of-visibility/visualize")).status).toBe(200);
    const res = await app.request("/bff/p/the-politics-of-visibility/visualize?request=chart%20of%20scores&entry=chat");
    expect(res.status).toBe(200);
    const { visualize } = (await res.json()) as {
      visualize: {
        request: string; specKind: string; entryPoint: string;
        estimateCredits: number; capCredits: number; figureId?: string; priorVersion?: number;
      };
    };
    expect(visualize.request).toBe("chart of scores");
    expect(visualize.entryPoint).toBe("chat");
    expect(visualize.estimateCredits).toBeGreaterThan(0); // the honesty note's figure is server-owned
    expect(visualize.capCredits).toBeGreaterThanOrEqual(visualize.estimateCredits);
  });

  it("the twin's iterate mode keeps the fig_-prefix strip + the prior-version pick server-owned", async () => {
    const res = await createWebApp(makeDeps()).request(
      "/bff/p/the-politics-of-visibility/visualize?figure=fig_fig01&prior=1",
    );
    const { visualize } = (await res.json()) as { visualize: { figureId?: string; priorVersion?: number } };
    expect(visualize.figureId).toBe("fig01");
    expect(visualize.priorVersion).toBe(1);
  });

  it("an empty request never creates a run — form 302s back; a JSON caller gets the 422 envelope", async () => {
    const createRun = vi.fn(async () => ({} as never));
    const app = createWebApp(makeDeps({ createRun: createRun as never }));
    // SPA.27 — the SSR 422 re-render retired with the sheet; the no-JS floor lands back on the URL.
    const res = await app.request("/p/the-politics-of-visibility/visualize", {
      method: "POST",
      ...form({ request: "   " }),
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-politics-of-visibility/visualize");
    const json = await app.request("/p/the-politics-of-visibility/visualize", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({ request: "   " }),
    });
    expect(json.status).toBe(422);
    expect((await json.json() as { error: string }).error).toBe("request_required");
    expect(createRun).not.toHaveBeenCalled();
  });

  it("the Visualize click creates the figure run with the classified provenance seeds", async () => {
    const createRun = vi.fn(async () => ({ runId: "run_fig", state: "queued", deduped: false }));
    const app = createWebApp(makeDeps({ createRun: createRun as never }));
    const res = await app.request("/p/the-politics-of-visibility/visualize", {
      method: "POST",
      ...form({
        request: "a chart of @claim:v2/41",
        specKind: "vega_lite",
        entryPoint: "chat",
        idempotencyKey: "idem_1",
      }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-politics-of-visibility/figures");
    expect(createRun).toHaveBeenCalledOnce();
    const req = createRun.mock.calls[0]![2] as {
      workflow: string;
      figure: { request: string; specKind?: string; entryPoint?: string; sourceRefs?: { claimIds?: string[] } };
    };
    expect(req.workflow).toBe("figure");
    expect(req.figure.request).toBe("a chart of @claim:v2/41");
    expect(req.figure.specKind).toBe("vega_lite");
    expect(req.figure.sourceRefs?.claimIds).toEqual(["v2/41"]);
  });

  it("the insist path carries `insisted` into sourceRefs (kind:\"none\" is the api's to classify)", async () => {
    const createRun = vi.fn(async () => ({ runId: "run_fig", state: "queued", deduped: false }));
    const app = createWebApp(makeDeps({ createRun: createRun as never }));
    await app.request("/p/the-politics-of-visibility/visualize", {
      method: "POST",
      ...form({ request: "numbers I remember", insist: "1" }),
    });
    const req = createRun.mock.calls[0]![2] as { figure: { sourceRefs?: { insisted?: boolean } } };
    expect(req.figure.sourceRefs?.insisted).toBe(true);
  });
});

describe("the Figures pane", () => {
  it("the twin ships the api's rows verbatim — badge text, version, the chips' row ids", async () => {
    const res = await createWebApp(makeDeps()).request("/bff/p/the-politics-of-visibility/figures");
    expect(res.status).toBe(200);
    const { figures } = (await res.json()) as {
      figures: { slug: string; items: { id: string; badge?: string | null; headVersion?: number }[] };
    };
    expect(figures.slug).toBe("the-politics-of-visibility");
    expect(figures.items.map((r) => r.id)).toContain("fig01");
    // `[unverified data]` is the api's badge text — never retyped on the web.
    expect(JSON.stringify(figures.items)).toContain("[unverified data]");
  });

  it("an empty list ships items:[] — the leaf paints the empty copy + entry hint", async () => {
    const res = await createWebApp(makeDeps({ listFigures: async () => [] })).request(
      "/bff/p/the-politics-of-visibility/figures",
    );
    const { figures } = (await res.json()) as { figures: { items: unknown[] } };
    expect(figures.items).toEqual([]);
  });
});

// SPA.27 — the card's render asserts (SVG preview, badge, provenance disclosure, type chips,
// versions strip, declined suggestion) retired with the document; the twin ships the full
// FigureCardDto verbatim and the leaf paints it. These pins assert the payload contract +
// the `{figure:null}` miss the leaf maps to the not-found copy.
describe("the figure card", () => {
  const cardOf = async (app: ReturnType<typeof createWebApp>, id = "fig01") =>
    (
      (await (await app.request(`/bff/p/the-politics-of-visibility/figures/${id}`)).json()) as {
        figure: { slug: string; card: typeof FIGURE_CARD | null; headDraftId: string | null } | null;
      }
    ).figure;

  it("the twin ships the card verbatim — preview svgs, spec/data, provenance, versions", async () => {
    const figure = await cardOf(createWebApp(makeDeps()));
    expect(figure?.slug).toBe("the-politics-of-visibility");
    expect(figure?.card.specKind).toBe("vega_lite");
    expect(figure?.card.files.svgLight).toContain("<svg data-fig=\"light\"></svg>");
    expect(figure?.card.versions.length).toBeGreaterThan(0);
    expect(JSON.stringify(figure?.card)).toContain("[unverified data]"); // the api's badge text
    expect(figure?.card.provenance?.kind ?? figure?.card).toBeTruthy();
  });

  it("a table figure ships tableSource verbatim (the leaf paints its markdown instead of chips)", async () => {
    const figure = await cardOf(
      createWebApp(
        makeDeps({
          getFigure: async () => ({
            ...FIGURE_CARD,
            specKind: "table" as const,
            kind: "table" as const,
            files: { spec: null, dataCsv: null, svgLight: null, svgDark: null, tableSource: "| a | b |\n|---|---|\n| 1 | 2 |" },
            render: { lightAvailable: false, darkAvailable: false, pngAvailable: false },
          }),
        }),
      ),
    );
    expect(figure?.card.kind).toBe("table");
    expect(figure?.card.files.tableSource).toContain("| a | b |");
    expect(figure?.card.files.svgLight).toBeNull();
  });

  it("the versions strip's rows ride verbatim — request text + restore eligibility", async () => {
    const figure = await cardOf(createWebApp(makeDeps()));
    const versions = figure?.card.versions ?? [];
    expect(versions.map((v: { n: number }) => v.n)).toEqual([1, 2]);
    expect(versions[1]?.request).toContain("make it a bar chart");
  });

  it("a declined version ships its suggestion verbatim — never silence", async () => {
    const figure = await cardOf(
      createWebApp(
        makeDeps({
          getFigure: async () => ({
            ...FIGURE_CARD,
            versions: [{ n: 1, request: "a 3d pie", renderStatus: "declined", renderError: "try a bar chart instead", createdAt: "2026-01-01T00:00:00Z" }],
          }),
        }),
      ),
    );
    expect(figure?.card.versions[0]).toMatchObject({ renderStatus: "declined", renderError: "try a bar chart instead" });
  });

  it("an unknown figure answers {figure:null} — the leaf maps it to the not-found copy", async () => {
    const app = createWebApp(
      makeDeps({ getFigure: async () => { throw new ApiError(404, "x", "figure_not_found"); } }),
    );
    // SPA.27 — the document 404 is deleted; the twin's null IS the not-found the leaf paints.
    expect((await app.request("/p/the-politics-of-visibility/figures/fig_gone")).status).toBe(200);
    const twin = await app.request("/bff/p/the-politics-of-visibility/figures/fig_gone");
    expect(twin.status).toBe(200);
    expect(((await twin.json()) as { figure: unknown }).figure).toBeNull();
  });
});

describe("the card's POSTs — fields, chips, restore", () => {
  it("field edits PATCH caption/alt/sourceLine and land ?saved=1", async () => {
    const patchFigure = vi.fn(async () => FIGURE_CARD);
    const app = createWebApp(makeDeps({ patchFigure: patchFigure as never }));
    const res = await app.request("/p/the-politics-of-visibility/figures/fig01", {
      method: "POST",
      ...form({ caption: "New caption.", alt: "Alt text.", sourceLine: "The ledger." }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-politics-of-visibility/figures/fig01?saved=1");
    expect(patchFigure).toHaveBeenCalledOnce();
    expect(patchFigure.mock.calls[0]![3]).toEqual({ caption: "New caption.", alt: "Alt text.", sourceLine: "The ledger." });
  });

  it("an alt >250 surfaces the api's 422 as a notice", async () => {
    const app = createWebApp(
      makeDeps({ patchFigure: async () => { throw new ApiError(422, "x", "alt_too_long"); } }),
    );
    const res = await app.request("/p/the-politics-of-visibility/figures/fig01", {
      method: "POST",
      ...form({ caption: "", alt: "x".repeat(300), sourceLine: "" }),
    });
    expect(res.headers.get("location")).toContain("notice=");
  });

  it("a type-chip POST sends the mark edit (0 credits — no run)", async () => {
    const editFigureSpec = vi.fn(async () => ({ ok: true as const }));
    const createRun = vi.fn(async () => ({} as never));
    const app = createWebApp(makeDeps({ editFigureSpec: editFigureSpec as never, createRun: createRun as never }));
    const res = await app.request("/p/the-politics-of-visibility/figures/fig01/spec-edit", {
      method: "POST",
      ...form({ mark: "line" }),
    });
    expect(res.status).toBe(302);
    expect(editFigureSpec.mock.calls[0]![3]).toEqual({ mark: "line" });
    expect(createRun).not.toHaveBeenCalled();
  });

  it("a version restore POSTs n and lands back on the card", async () => {
    const restoreFigureVersion = vi.fn(async () => ({ ok: true as const }));
    const app = createWebApp(makeDeps({ restoreFigureVersion: restoreFigureVersion as never }));
    const res = await app.request("/p/the-politics-of-visibility/figures/fig01/versions/1/restore", { method: "POST" });
    expect(res.status).toBe(302);
    expect(restoreFigureVersion.mock.calls[0]![3]).toBe(1);
  });
});

describe("the insert proposal — a card, never a direct draft write", () => {
  // SPA.27 — propose-form vs not-ready-explanation is leaf paint off the card's `readiness`
  // (+ the twin's headDraftId the proposal gates on); the payload pins are below.
  it("the twin ships readiness verbatim — ok:true proposes, missing[] explains", async () => {
    const app = createWebApp(makeDeps());
    const { figure } = (await (await app.request("/bff/p/the-politics-of-visibility/figures/fig01")).json()) as {
      figure: { card: { readiness: { ok: boolean; missing: string[] }; pendingProposal: unknown }; headDraftId: string | null };
    };
    expect(figure.card.readiness).toEqual({ ok: true, missing: [] });
    expect(figure.headDraftId).not.toBeNull(); // the propose form's draft target

    const notReady = await createWebApp(
      makeDeps({
        getFigure: async () => ({ ...FIGURE_CARD, alt: "", readiness: { ok: false, missing: ["alt" as const] } }),
      }),
    ).request("/bff/p/the-politics-of-visibility/figures/fig01").then((r) => r.json()) as {
      figure: { card: { readiness: { ok: boolean; missing: string[] } } };
    };
    expect(notReady.figure.card.readiness).toEqual({ ok: false, missing: ["alt"] });
  });

  it("propose POSTs the draft + anchor and lands back on the card", async () => {
    const proposeFigure = vi.fn(async () => ({
      ok: true as const,
      pendingProposal: { draftId: "d_head", afterBlockId: "b7", version: 2, markdown: "![a](asset://fig_fig01)", at: "2026-01-01T00:00:00Z" },
      block: "![a](asset://fig_fig01)",
    }));
    const app = createWebApp(makeDeps({ proposeFigure: proposeFigure as never }));
    const res = await app.request("/p/the-politics-of-visibility/figures/fig01/propose", {
      method: "POST",
      ...form({ afterBlockId: "b7" }),
    });
    expect(res.status).toBe(302);
    expect(proposeFigure.mock.calls[0]![3]).toEqual({ draftId: "d_head", afterBlockId: "b7" });
  });

  it("a pending proposal rides the card verbatim (the leaf paints the preview + Accept/Reject)", async () => {
    const res = await createWebApp(
      makeDeps({
        getFigure: async () => ({
          ...FIGURE_CARD,
          pendingProposal: { draftId: "d_head", afterBlockId: "b7", version: 2, markdown: "![a](asset://fig_fig01)\n*Figure 1. cap[^1]*", at: "2026-01-01T00:00:00Z" },
        }),
      }),
    ).request("/bff/p/the-politics-of-visibility/figures/fig01");
    const { figure } = (await res.json()) as {
      figure: { card: { pendingProposal: { draftId: string; afterBlockId: string; version: number; markdown: string } | null } };
    };
    expect(figure.card.pendingProposal).toMatchObject({ draftId: "d_head", afterBlockId: "b7", version: 2 });
    expect(figure.card.pendingProposal?.markdown).toContain("asset://fig_fig01");
  });

  it("Accept redirects to the spliced draft version (the fork's v(N+1))", async () => {
    const acceptFigureProposal = vi.fn(async () => ({
      ok: true as const,
      inserted: { figureId: "fig01", draftId: "d_head", draftN: 4, draftVersionId: "av_v4", forked: true },
    }));
    const app = createWebApp(makeDeps({ acceptFigureProposal: acceptFigureProposal as never }));
    const res = await app.request("/p/the-politics-of-visibility/figures/fig01/proposals/accept", { method: "POST" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-politics-of-visibility/v/4");
  });

  it("Reject clears the card and lands back — the asset stays", async () => {
    const rejectFigureProposal = vi.fn(async () => ({ ok: true as const }));
    const app = createWebApp(makeDeps({ rejectFigureProposal: rejectFigureProposal as never }));
    const res = await app.request("/p/the-politics-of-visibility/figures/fig01/proposals/reject", { method: "POST" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-politics-of-visibility/figures/fig01");
    expect(rejectFigureProposal).toHaveBeenCalledOnce();
  });
});
