import { describe, it, expect, vi } from "vitest";
import { ApiError, type ProjectRow } from "@rhema/api-client";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource } from "./data.js";

// P1.12 — the Outline surface's web half (§7.3): `/outline` in chat resolves to the promotion
// SHEET (never an inline run — the sheet's Promote click is the consent), the sheet renders the
// api's verbatim facts, the durable editor mounts the shared spine-and-sections rows with
// provenance/`[unverified]` as badges, the autosave POST decodes `ed.*` into the api's PATCH
// `edit`, and the citation-guarded delete surfaces its notice.

const PROJECTS: ProjectRow[] = [
  {
    id: "proj_pv",
    slug: "the-politics-of-visibility",
    title: "The Politics of Visibility",
    state: {
      key: "outlined",
      pill: "Outlined",
      overlay: null,
      suggested: { action: "draft_v1", label: "Draft v1" },
    },
  },
];

const OUTLINE_DTO = {
  artifactId: "art_ol",
  slug: "the-politics-of-visibility",
  mirrorPath: "agents/author/outline/the-politics-of-visibility.md",
  versionId: "av_ol1",
  ordinal: 1,
  words: 320,
  markdown: "<!-- rhema:outline v1 -->\n# Outline\n",
  outline: {
    sidecar: "outline" as const,
    version: 1 as const,
    thesis: "Visibility is a governance technology.",
    spine: ["c1", "c2", "c3", "c4", "c5"],
    sections: [
      {
        ref: "I",
        title: "Set-up",
        targetWords: 500,
        function: "Stage the commonplace",
        entry: "Seen = good",
        exit: "Seen has a price",
        claims: [
          { id: "c1", text: "Platforms frame visibility as empowerment.", provenance: { kind: "thread" as const, turnId: "turn_1" } },
          { id: "c2", text: "The burden falls unevenly.", provenance: { kind: "source" as const, url: "https://example.org/two" }, unverified: true },
        ],
      },
      {
        ref: "II",
        title: "The argument",
        claims: [
          { id: "c3", text: "Visibility demands legibility.", provenance: { kind: "source" as const, url: "https://example.org/one" } },
          { id: "c4", text: "Opting out reads as political.", provenance: { kind: "generated" as const } },
          { id: "c5", text: "Selective opacity is defensible.", provenance: { kind: "user_typed" as const } },
        ],
      },
    ],
    gaps: [{ id: "g1", needed: "A first-person refusal example", sectionRef: "II" }],
    provenance: { threadId: "thr_1", urls: [{ url: "https://example.org/two", unverified: true }] },
  },
  citedBy: { runs: [] as string[], draftIds: [] as string[] },
  editable: true,
};

const PROMOTION_DTO = {
  slug: "the-politics-of-visibility",
  scope: "thread" as const,
  threadId: "thr_1",
  sources: 3,
  sourceCopies: [
    { src: "agents/assistant/research/sources/a.md", dst: "agents/author/research/sources/a.md" },
  ],
  urls: ["https://example.org/one", "https://example.org/two"],
  threadTokens: 1200,
  urlsRefetched: 2,
  estimateCredits: 42,
  capCredits: 84,
  modelTier: "base",
  rigor: "standard",
  existing: false,
};

function makeDeps(over: Partial<DataSource> = {}): WebDeps {
  return {
    dataSource: {
      checkSession: async () => true,
      listProjects: async () => PROJECTS,
      checkInvite: async () => ({ ok: false, reason: "unknown" }),
      getOutlinePromotion: async () => PROMOTION_DTO,
      promoteOutline: async () => ({ runId: "run_ol", state: "queued", deduped: false, slug: PROMOTION_DTO.slug }),
      getOutline: async () => OUTLINE_DTO,
      patchOutline: async () => ({ ok: true as const, versionIds: ["av_new1", "av_new2"], versionId: "av_new2", ordinal: 2 }),
      deleteOutline: async () => ({ ok: true as const }),
      answerOutlineGap: async () => ({ ok: true as const, versionIds: ["av_new1", "av_new2"] }),
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

describe("/outline in chat — the verb resolves to the promotion SHEET, never an inline run", () => {
  it("bare `/outline` redirects thread-scoped to the sheet; postChatTurn is never called", async () => {
    const postChatTurn = vi.fn<DataSource["postChatTurn"] & object>(async () => ({} as never));
    const app = createWebApp(makeDeps({ postChatTurn: postChatTurn as never }));
    const res = await app.request("/p/the-politics-of-visibility/chat/turns", {
      method: "POST",
      ...form({ threadId: "thr_1", message: "/outline" }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "/p/the-politics-of-visibility/outline/promote?scope=thread&threadId=thr_1",
    );
    expect(postChatTurn).not.toHaveBeenCalled();
  });

  it("`/outline @turn:<id>` scopes the promotion to the turn", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/the-politics-of-visibility/chat/turns", {
      method: "POST",
      ...form({ threadId: "thr_1", message: "/outline @turn:t_9" }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(
      "/p/the-politics-of-visibility/outline/promote?scope=turn&threadId=thr_1&turnId=t_9",
    );
  });

  it("a non-command message still posts the turn", async () => {
    const postChatTurn = vi.fn(async () => ({ ok: true }));
    const app = createWebApp(makeDeps({ postChatTurn: postChatTurn as never }));
    const res = await app.request("/p/the-politics-of-visibility/chat/turns", {
      method: "POST",
      ...form({ threadId: "thr_1", message: "an ordinary message" }),
    });
    // The ordinary-turn POST lands back on the chat page (302 like any chat form post) — the
    // point is it did NOT resolve to the promotion sheet.
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).not.toContain("/outline/promote");
    expect(postChatTurn).toHaveBeenCalledOnce();
  });
});

describe("the promotion sheet — the consent surface (GET + Promote click)", () => {
  it("GET renders the api's verbatim facts (sources, urls, estimate + cap)", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request(
      "/p/the-politics-of-visibility/outline/promote?scope=thread&threadId=thr_1",
    );
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Promote to an outline");
    expect(html).toContain("3 source notes");
    expect(html).toContain("2 URLs will be re-fetched");
    expect(html).toContain("Estimate 42 credits · cap 84");
  });

  it("GET 404s when the api refuses the scope (the not-found copy, never a blank page)", async () => {
    const app = createWebApp(
      makeDeps({ getOutlinePromotion: async () => { throw new ApiError(404, "x", "thread_not_found"); } }),
    );
    const res = await app.request(
      "/p/the-politics-of-visibility/outline/promote?scope=thread&threadId=thr_gone",
    );
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("wasn&#x27;t found");
  });

  it("the Promote click calls promoteOutline once and returns to the project", async () => {
    const promoteOutline = vi.fn(async () => ({ runId: "run_ol", state: "queued", deduped: false, slug: "the-politics-of-visibility" }));
    const app = createWebApp(makeDeps({ promoteOutline: promoteOutline as never }));
    const res = await app.request("/p/the-politics-of-visibility/outline/promote", {
      method: "POST",
      ...form({ scope: "thread", threadId: "thr_1", slug: "the-politics-of-visibility" }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-politics-of-visibility");
    expect(promoteOutline).toHaveBeenCalledOnce();
    const req = promoteOutline.mock.calls[0]![2] as { scope: string; threadId: string };
    expect(req.scope).toBe("thread");
    expect(req.threadId).toBe("thr_1");
  });
});

describe("the durable editor — GET renders the shared spine-and-sections rows", () => {
  it("renders sections, claims with provenance badges, [unverified], gaps, and the delete affordance", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/the-politics-of-visibility/outline");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('data-outline-sections="true"');
    expect(html).toContain('data-outline-section="I"');
    expect(html).toContain('data-outline-claim="c2"');
    expect(html).toContain('data-provenance="source"');
    expect(html).toContain('data-unverified="true"');
    expect(html).toContain('data-outline-gap="g1"');
    expect(html).toContain('data-outline-delete="true"');
    // SPA.26 — the autosave island retired: no outline.js tag and none of its mount attributes
    // (`data-autosave`/`data-label-*`); the surviving fallback is the explicit-Save form, which
    // still posts the same `ed.*` grammar (the POST tests below keep that leg green).
    expect(html).not.toContain("/assets/outline.js");
    expect(html).not.toContain("data-autosave");
    expect(html).not.toContain("data-label-saving");
    expect(html).toContain('data-outline-editor="true"');
    expect(html).toContain('action="/p/the-politics-of-visibility/outline"');
  });

  it("a cited outline hides the delete button and shows the cited note", async () => {
    const app = createWebApp(
      makeDeps({ getOutline: async () => ({ ...OUTLINE_DTO, citedBy: { runs: ["run_d"], draftIds: ["d_1"] } }) }),
    );
    const html = await (await app.request("/p/the-politics-of-visibility/outline")).text();
    expect(html).not.toContain('data-outline-delete="true"');
    expect(html).toContain('data-cited-note="true"');
  });

  it("404s with no outline (the not-found copy)", async () => {
    const app = createWebApp(
      makeDeps({ getOutline: async () => { throw new ApiError(404, "x", "not_found"); } }),
    );
    const res = await app.request("/p/the-politics-of-visibility/outline");
    expect(res.status).toBe(404);
    expect(await res.text()).toContain("no outline yet");
  });
});

describe("the autosave POST — `ed.*` fields decode into the api's PATCH edit", () => {
  it("posts the decoded GateStructuredEdits and redirects ?saved=1", async () => {
    const patchOutline = vi.fn(async () => ({ ok: true as const, versionIds: ["av1", "av2"], versionId: "av2", ordinal: 2 }));
    const app = createWebApp(makeDeps({ patchOutline: patchOutline as never }));
    const res = await app.request("/p/the-politics-of-visibility/outline", {
      method: "POST",
      ...form({ "ed.values.thesis": "A tighter thesis.", "ed.sec.0.ord": "2" }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-politics-of-visibility/outline?saved=1");
    expect(patchOutline).toHaveBeenCalledOnce();
    const edit = (patchOutline.mock.calls[0]![2] as { edit: Record<string, unknown> }).edit;
    expect((edit["values"] as Record<string, string>)["thesis"]).toBe("A tighter thesis.");
    expect(Array.isArray(edit["sections"])).toBe(true);
  });

  it("an empty save is a no-op redirect (no PATCH)", async () => {
    const patchOutline = vi.fn();
    const app = createWebApp(makeDeps({ patchOutline: patchOutline as never }));
    const res = await app.request("/p/the-politics-of-visibility/outline", {
      method: "POST",
      ...form({ "ed.values.thesis": "" }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-politics-of-visibility/outline");
    expect(patchOutline).not.toHaveBeenCalled();
  });
});

describe("deletion + gap answers", () => {
  it("delete redirects to the project; a 409 `outline_cited` surfaces the cited notice", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/the-politics-of-visibility/outline/delete", { method: "POST" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-politics-of-visibility");

    const cited = createWebApp(
      makeDeps({ deleteOutline: async () => { throw new ApiError(409, "x", "outline_cited"); } }),
    );
    const res2 = await cited.request("/p/the-politics-of-visibility/outline/delete", { method: "POST" });
    expect(res2.headers.get("location")).toBe("/p/the-politics-of-visibility/outline?notice=cited");
  });

  it("a gap's Answer posts the text and lands ?saved=1", async () => {
    const answerOutlineGap = vi.fn(async () => ({ ok: true as const, versionIds: ["av1"] }));
    const app = createWebApp(makeDeps({ answerOutlineGap: answerOutlineGap as never }));
    const res = await app.request("/p/the-politics-of-visibility/outline/gaps/g1/answer", {
      method: "POST",
      ...form({ text: "I declined the panel invite." }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-politics-of-visibility/outline?saved=1");
    expect(answerOutlineGap).toHaveBeenCalledOnce();
    expect((answerOutlineGap.mock.calls[0]![3] as { text: string }).text).toBe("I declined the panel invite.");
  });
});
