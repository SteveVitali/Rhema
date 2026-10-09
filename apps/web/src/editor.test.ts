import { describe, it, expect, vi } from "vitest";
import { ApiError, type ProjectRow, type EditorDocDto } from "@rhema/api-client";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource } from "./data.js";

// PRB.07 — the source editor web routes (§5.4/§6.3; REQ-BETA-21). The SSR surface + island retired at
// SPA.24 (REQ-ED-16); what survives — and this file keeps asserting — is the TRANSPORT: the
// same-origin autosave/doc endpoints (the Page's collab stack polls `/doc`; `/save` remains the
// `?collab=local` fallback) and the progressive-enhancement form POSTs (note / cancel-run / revise).

const PROJECTS: ProjectRow[] = [
  {
    id: "proj_1",
    slug: "the-piece",
    title: "The Piece",
    headDraftId: "d_2",
    state: { key: "edited_by_you", pill: "Edited by you", overlay: null, suggested: { action: "revise_using_edits", label: "Revise using your edits" } },
  },
];

const DOC: EditorDocDto = {
  draftId: "d_2",
  draftN: 2,
  origin: "human_revision",
  state: "working",
  baseDraftId: "d_1",
  baseDraftN: 1,
  markdown: "# Title\n\nA paragraph with the quote inside.\n",
  sha256: "sha",
  lock: null,
  findings: [
    {
      findingId: "f_1",
      title: "The quote drifted.",
      severity: "major",
      sourceLabel: "from Review of v1",
      anchor: { blockId: "b1", quote: "the quote", startOffset: 24, endOffset: 33, confidence: 1 },
      method: "normalized",
      lost: false,
    },
    {
      findingId: "f_2",
      title: "A lost anchor.",
      severity: "minor",
      sourceLabel: "from Review of v1",
      anchor: { blockId: "b1", quote: "gone passage", startOffset: 0, endOffset: 12, confidence: 0.4, unanchored: true },
      method: "unresolved",
      lost: true,
    },
  ],
};

function makeDeps(over: Partial<DataSource> = {}): WebDeps {
  return {
    dataSource: {
      listProjects: async () => PROJECTS,
      getEditorDoc: async () => DOC,
      saveEditorDraft: async () => ({
        draftId: "d_2", draftN: 2, versionId: "av_2", sha256: "sha2",
        forked: false, changed: true, restorePointId: "rp_1", sync: "synced" as const,
      }),
      postEditorNote: async () => ({ guidanceId: "g_1" }),
      cancelEditorRun: async () => ({ ok: true as const, state: "cancelled", alreadyTerminal: false }),
      reviseWithEdits: async () => ({ runId: "run_9", state: "queued", deduped: false, mootedFindingIds: ["f_2"] }),
      ...over,
    } as DataSource,
    session: () => ({ "x-rhema-user-id": "u_1" }),
  };
}

function form(fields: Record<string, string>) {
  return {
    body: new URLSearchParams(fields).toString(),
    headers: { "content-type": "application/x-www-form-urlencoded" },
  };
}

describe("editor page — the /edit/ route is superseded (P1.02)", () => {
  it("redirects to /login unauthenticated", async () => {
    const app = createWebApp({ ...makeDeps(), session: () => null });
    const res = await app.request("/p/the-piece/edit/d_2");
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/login");
  });

  it("redirects to the Page's /v/:n route (the CodeMirror surface is dormant)", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/the-piece/edit/d_2", { redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-piece/v/2");
  });

  it("the redirect preserves the ?noted=1 marker", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/the-piece/edit/d_2?noted=1", { redirect: "manual" });
    expect(res.headers.get("location")).toBe("/p/the-piece/v/2?noted=1");
  });

  it("404s when the api reports the draft not_found", async () => {
    const app = createWebApp(
      makeDeps({ getEditorDoc: async () => Promise.reject(new ApiError(404, "/x")) }),
    );
    const res = await app.request("/p/the-piece/edit/d_2");
    expect(res.status).toBe(404);
  });
});

describe("editor endpoints — autosave / doc poll / forms (PRB.07)", () => {
  it("POST save forwards JSON markdown to the api and returns the save DTO", async () => {
    const save = vi.fn(async () => ({
      draftId: "d_2", draftN: 2, versionId: "av_2", sha256: "s",
      forked: true, changed: true, restorePointId: "rp_1", sync: "synced" as const,
    }));
    const app = createWebApp(makeDeps({ saveEditorDraft: save }));
    const res = await app.request("/p/the-piece/edit/d_2/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ markdown: "# T\n\nnew text\n" }),
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.forked).toBe(true);
    expect(save).toHaveBeenCalledWith(expect.anything(), "proj_1", "d_2", "# T\n\nnew text\n");
  });

  it("POST save accepts the pagehide beacon's text/plain body", async () => {
    const save = vi.fn(async () => ({
      draftId: "d_2", draftN: 2, versionId: "av_2", sha256: "s",
      forked: false, changed: true, restorePointId: null, sync: "synced" as const,
    }));
    const app = createWebApp(makeDeps({ saveEditorDraft: save }));
    const res = await app.request("/p/the-piece/edit/d_2/save", {
      method: "POST",
      headers: { "content-type": "text/plain" },
      body: "# T\n\nbeaconed\n",
    });
    expect(res.status).toBe(200);
    expect(save).toHaveBeenCalledWith(expect.anything(), "proj_1", "d_2", "# T\n\nbeaconed\n");
  });

  it("a held lock passes the api's 409 through to the client bundle", async () => {
    const app = createWebApp(
      makeDeps({ saveEditorDraft: async () => Promise.reject(new ApiError(409, "/save")) }),
    );
    const res = await app.request("/p/the-piece/edit/d_2/save", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ markdown: "x" }),
    });
    expect(res.status).toBe(409);
  });

  it("GET doc returns the doc JSON for the client bundle's lock poll", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/the-piece/edit/d_2/doc", {
      headers: { accept: "application/json" },
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as EditorDocDto;
    expect(body.draftId).toBe("d_2");
    expect(body.lock).toBeNull();
    expect(body.findings).toHaveLength(2);
  });

  it("POST note writes a Guidance row and redirects back with the saved marker", async () => {
    const note = vi.fn(async () => ({ guidanceId: "g_1" }));
    const app = createWebApp(makeDeps({ postEditorNote: note }));
    const res = await app.request("/p/the-piece/edit/d_2/note", {
      method: "POST",
      ...form({ text: "  keep the ending ambiguous  " }),
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-piece/edit/d_2?noted=1");
    expect(note).toHaveBeenCalledWith(expect.anything(), "proj_1", "d_2", "keep the ending ambiguous");
  });

  it("POST cancel-run releases the §6.3 lock and re-renders the editor", async () => {
    const cancel = vi.fn(async () => ({ ok: true as const, state: "cancelled", alreadyTerminal: false }));
    const app = createWebApp(makeDeps({ cancelEditorRun: cancel }));
    const res = await app.request("/p/the-piece/edit/d_2/cancel-run", { method: "POST", redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-piece/edit/d_2");
    expect(cancel).toHaveBeenCalledWith(expect.anything(), "proj_1", "d_2");
  });

  it("POST revise runs Revise-using-your-edits and lands on the project page", async () => {
    const revise = vi.fn(async () => ({ runId: "run_9", state: "queued", deduped: false, mootedFindingIds: [] }));
    const app = createWebApp(makeDeps({ reviseWithEdits: revise }));
    const res = await app.request("/p/the-piece/edit/d_2/revise", { method: "POST", redirect: "manual" });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/the-piece");
    expect(revise).toHaveBeenCalledWith(expect.anything(), "proj_1", "d_2");
  });

  it("GET /assets/editor.js 404s — the island entry retired with the surface (SPA.24)", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/assets/editor.js");
    // `editor` left CLIENT_ENTRIES at SPA.24 — the asset route only serves listed entries, so this is
    // a hard 404 even after a build (a stale cached request can't resurrect the island).
    expect(res.status).toBe(404);
  });
});
