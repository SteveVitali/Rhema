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
  it("GET renders the request field, the spec-kind pick, the honesty note, and the estimate", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/the-politics-of-visibility/visualize?request=chart%20of%20scores&entry=chat");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-visualize-form="true"');
    expect(html).toContain("chart of scores");
    expect(html).toContain('name="specKind"');
    expect(html).toContain('data-insist="true"');
    expect(html).toContain("[unverified data]");
    expect(html).toContain('data-estimate="true"');
  });

  it("GET ?figure=fig_x&prior=1 renders iterate mode (the fig_ prefix strips to the row id)", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/the-politics-of-visibility/visualize?figure=fig_fig01&prior=1");
    const html = await res.text();
    expect(html).toContain('data-iterate-note="true"');
    expect(html).toContain('name="figureId" value="fig01"');
    expect(html).toContain('name="priorVersion" value="1"');
  });

  it("an empty request re-renders 422 (no run created)", async () => {
    const createRun = vi.fn(async () => ({} as never));
    const app = createWebApp(makeDeps({ createRun: createRun as never }));
    const res = await app.request("/p/the-politics-of-visibility/visualize", {
      method: "POST",
      ...form({ request: "   " }),
    });
    expect(res.status).toBe(422);
    expect(await res.text()).toContain("Describe the figure first");
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
  it("renders the api's rows — badge text verbatim, version, insert + render chips", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/the-politics-of-visibility/figures");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-figure-row="fig01"');
    expect(html).toContain("[unverified data]");
    expect(html).toContain("v2");
    expect(html).toContain("/p/the-politics-of-visibility/figures/fig01");
    expect(html).toContain("/p/the-politics-of-visibility/visualize");
  });

  it("an empty pane shows the empty copy with the entry-point hint", async () => {
    const app = createWebApp(makeDeps({ listFigures: async () => [] }));
    const html = await (await app.request("/p/the-politics-of-visibility/figures")).text();
    expect(html).toContain('data-figures-empty="true"');
    expect(html).toContain("/visualize");
  });
});

describe("the figure card", () => {
  it("renders the persisted server-side SVG preview, the badge, and the provenance disclosure", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/the-politics-of-visibility/figures/fig01");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-figure-preview="true"');
    expect(html).toContain("<svg data-fig=\"light\"></svg>");
    expect(html).toContain("[unverified data]");
    expect(html).toContain('data-provenance="true"');
    expect(html).toContain('data-prov-kind="true"');
    expect(html).toContain(">none</dd>");
    expect(html).toContain('data-figure-data="true"');
    expect(html).toContain('data-figure-spec="true"');
    expect(html).toContain('data-figure-versions="true"');
  });

  it("a vega_lite figure renders the 0-cr type chips; a table figure shows its markdown instead", async () => {
    const app = createWebApp(makeDeps());
    const html = await (await app.request("/p/the-politics-of-visibility/figures/fig01")).text();
    expect(html).toContain('data-type-chips="true"');
    expect(html).toContain('data-chip="bar"');

    const table = createWebApp(
      makeDeps({
        getFigure: async () => ({
          ...FIGURE_CARD,
          specKind: "table" as const,
          kind: "table" as const,
          files: { spec: null, dataCsv: null, svgLight: null, svgDark: null, tableSource: "| a | b |\n|---|---|\n| 1 | 2 |" },
          render: { lightAvailable: false, darkAvailable: false, pngAvailable: false },
        }),
      }),
    );
    const thtml = await (await table.request("/p/the-politics-of-visibility/figures/fig01")).text();
    expect(thtml).not.toContain('data-type-chips="true"');
    expect(thtml).toContain("| a | b |");
  });

  it("the Versions strip lists each iterate's request + a restore form for non-head versions", async () => {
    const app = createWebApp(makeDeps());
    const html = await (await app.request("/p/the-politics-of-visibility/figures/fig01")).text();
    expect(html).toContain('data-version="1"');
    expect(html).toContain("make it a bar chart");
    expect(html).toContain('data-restore="1"');
    // the head version never carries a restore button
    expect(html).not.toContain('data-restore="2"');
  });

  it("a declined version shows the suggestion, never silence", async () => {
    const app = createWebApp(
      makeDeps({
        getFigure: async () => ({
          ...FIGURE_CARD,
          versions: [{ n: 1, request: "a 3d pie", renderStatus: "declined", renderError: "try a bar chart instead", createdAt: "2026-01-01T00:00:00Z" }],
        }),
      }),
    );
    const html = await (await app.request("/p/the-politics-of-visibility/figures/fig01")).text();
    expect(html).toContain('data-declined-note="true"');
    expect(html).toContain("try a bar chart instead");
  });

  it("404s for an unknown figure (the not-found copy)", async () => {
    const app = createWebApp(
      makeDeps({ getFigure: async () => { throw new ApiError(404, "x", "figure_not_found"); } }),
    );
    const res = await app.request("/p/the-politics-of-visibility/figures/fig_gone");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("wasn&#x27;t found");
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
  it("a ready card renders the propose form; a not-ready card explains what's missing", async () => {
    const app = createWebApp(makeDeps());
    const html = await (await app.request("/p/the-politics-of-visibility/figures/fig01")).text();
    expect(html).toContain('data-propose-form="true"');

    const notReady = createWebApp(
      makeDeps({
        getFigure: async () => ({ ...FIGURE_CARD, alt: "", readiness: { ok: false, missing: ["alt" as const] } }),
      }),
    );
    const nhtml = await (await notReady.request("/p/the-politics-of-visibility/figures/fig01")).text();
    expect(nhtml).toContain('data-not-ready="true"');
    expect(nhtml).toContain("alt text");
    expect(nhtml).not.toContain('data-propose-form="true"');
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

  it("a pending proposal renders the block preview + Accept/Reject forms", async () => {
    const app = createWebApp(
      makeDeps({
        getFigure: async () => ({
          ...FIGURE_CARD,
          pendingProposal: { draftId: "d_head", afterBlockId: "b7", version: 2, markdown: "![a](asset://fig_fig01)\n*Figure 1. cap[^1]*", at: "2026-01-01T00:00:00Z" },
        }),
      }),
    );
    const html = await (await app.request("/p/the-politics-of-visibility/figures/fig01")).text();
    expect(html).toContain('data-pending-proposal="true"');
    expect(html).toContain('data-proposal-block="true"');
    expect(html).toContain('data-accept="true"');
    expect(html).toContain('data-reject="true"');
    expect(html).not.toContain('data-propose-form="true"');
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
