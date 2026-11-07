import { describe, it, expect, vi, afterEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ApiError, type ProjectRow, type ChatPanelDto } from "@rhema/api-client";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource } from "./data.js";
import { chatPanel } from "./chat-pane.js";

// P1.11 — the Desk Chat surface's web half (§7.1/§7.4): the SSR project page mounts the ChatDesk
// (threads, composer, tier notches, the empty-state chips) from the api's chat DTO, and the
// same-origin write routes forward the viewer's session to the api (turn send, plan decision, pin
// add/remove, correction, suggestion, notes). The web layer never interprets budgets or anchors —
// it forwards and redirects.

// R7RO.1 — the only forced-SSR arm left is PHONE (ADR-128: the `showcase` arm is deleted; a
// showcase row on desktop serves the shell). The chat-panel render pins below hit that arm.
const PHONE = { headers: { "sec-ch-ua-mobile": "?1" } };

const ROW: ProjectRow = {
  id: "proj_1",
  slug: "demo",
  title: "Demo",
  // R7RO.1 — `showcase: true` is a read-only row fact now; it no longer forces SSR — the
  // PHONE request does.
  showcase: true,
  state: { key: "draft", pill: "Draft", overlay: null, suggested: { action: "revise", label: "Revise" } },
};

const CHAT: ChatPanelDto = {
  threads: [{ id: "thr_1", name: "Project chat", isDefault: true, archived: false }],
  activeThreadId: "thr_1",
  turns: [],
  messages: [],
  pins: { pins: [], footprint: 0, cap: 12 },
  sources: [],
  liveRun: null,
  emptyState: {
    page: "quiet",
    deskTab: "chat",
    chips: [
      { id: "research", label: "Research a question", verb: "/research" },
      { id: "thesis", label: "I have a thesis", verb: "chat" },
      { id: "interview", label: "Interview me", verb: "chat" },
      { id: "notes", label: "Paste my notes", verb: "notes" },
    ],
    nextStep: { kind: "sheet", label: "Start", href: "/p/demo/sheet?workflow=research_burst" },
  },
  budgets: { credits: 40, searches: 5, fetches: 10 },
  defaultTier: "base",
};

function makeDeps(chatOverrides: Partial<DataSource> = {}): WebDeps {
  const session = () => ({ cookie: "__Host-rhema.session_token=tok" });
  return {
    session,
    dataSource: {
      checkSession: async () => true,
      listProjects: async () => [ROW],
      // the /p/:slug handler's other reads — all degrade-friendly stubs.
      listGates: async () => [],
      listDecisions: async () => [],
      getApprovalOverrides: async () => ({}),
      getApprovalSettings: async () => undefined,
      getExplainers: async () => ({ dismissed: [] }),
      getProjectVoice: async () => null,
      listVoices: async () => [],
      getTimeline: async () => null,
      getFiles: async () => undefined,
      getSessionPrincipal: async () => null,
      getTheme: async () => null,
      getChat: async () => CHAT,
      ...chatOverrides,
    } as unknown as DataSource,
  };
}

const form = (fields: Record<string, string>) => ({
  body: new URLSearchParams(fields).toString(),
  headers: { "content-type": "application/x-www-form-urlencoded" },
});
const json = (body: unknown) => ({
  body: JSON.stringify(body),
  headers: { "content-type": "application/json", accept: "application/json" },
});

describe("GET /p/:slug — the Desk Chat tab (§7.1)", () => {
  // SPA.28 — the default desktop document is the shell now (the chat pane mounts in the leaf);
  // the chat panel's SSR survives ONLY on the Page family's forced-SSR arm — phone (R7RO.1 —
  // the showcase arm is deleted; REQ-ED-12/REQ-VFY-5). `?ssr=1` is inert text. The phone arm
  // mounts the §10.1-compact desk: composer + chips stay; the tier pick is the ✗ column — its
  // render is pinned on the shared `chatPanel` the leaf mounts.
  it("the forced-SSR arm still mounts the chat pane — composer, empty-state chips; the tier pick rides the desktop desk", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/demo", PHONE);
    expect(res.status).toBe(200);
    const html = await res.text();
    // R7RO.2 — the chat mounts inside the Page as the reader's own section; the desk tab body
    // is a desktop subtree and never enters the phone DOM.
    expect(html).not.toContain('data-desk-panel="chat"');
    expect(html).toContain('data-phone-chat="true"');
    expect(html).toContain('id="phone-chat"');
    expect(html).toContain('href="#phone-chat"');
    expect(html).toContain("data-chat-composer");
    expect(html).toContain('action="/p/demo/chat/turns"');
    // §10.1 — the compact desk drops the tier notches (they're the desktop column).
    expect(html).not.toContain("data-chat-tier");
    for (const id of ["research", "thesis", "interview", "notes"])
      expect(html).toContain(`data-chat-chip="${id}"`);

    // the desktop desk (the shared component's non-compact render — what the leaf mounts):
    const desk = renderToStaticMarkup(chatPanel(CHAT, "demo", {}, false));
    // R7TALK.1a — the tier picker is the Select primitive (one trigger, modelTier posted via the
    // hidden native select); the three notches are its items.
    expect(desk).toContain("data-chat-tier");
    expect(desk).toContain('name="modelTier"');
    expect(desk).toContain("data-chat-composer");
  });

  it("degrades to the tab placeholder when the chat read is absent", async () => {
    const app = createWebApp(makeDeps({ getChat: undefined }));
    const res = await app.request("/p/demo");
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).not.toContain("data-chat-composer");
  });
});

describe("POST /p/:slug/chat/* — session-forwarded writes", () => {
  it("a turn send forwards {message, modelTier} and redirects a form submit", async () => {
    const postChatTurn = vi.fn(async () => ({
      runId: "run_1",
      state: "queued",
      deduped: false,
      planCard: {
        kind: "plan_card" as const,
        threadId: "thr_1",
        summary: "s",
        steps: [],
        budget: { credits: 40, searches: 5, fetches: 10 },
        modelTier: "base",
        actions: [],
      },
    }));
    const app = createWebApp(makeDeps({ postChatTurn }));
    const res = await app.request("/p/demo/chat/turns", {
      method: "POST",
      ...form({ threadId: "thr_1", message: "hi", modelTier: "balanced" }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/demo#chat");
    expect(postChatTurn).toHaveBeenCalledWith(
      expect.objectContaining({ cookie: "__Host-rhema.session_token=tok" }),
      "proj_1",
      "thr_1",
      expect.objectContaining({ message: "hi", modelTier: "balanced" }),
    );
  });

  it("a JSON turn send returns the created-run DTO", async () => {
    const app = createWebApp(
      makeDeps({
        postChatTurn: async () => ({
          runId: "run_2",
          state: "queued",
          deduped: false,
          planCard: {
            kind: "plan_card" as const,
            threadId: "thr_1",
            summary: "s",
            steps: [],
            budget: { credits: 40, searches: 5, fetches: 10 },
            modelTier: "base",
            actions: [],
          },
        }),
      }),
    );
    const res = await app.request("/p/demo/chat/turns", {
      method: "POST",
      ...json({ threadId: "thr_1", message: "hi" }),
    });
    // REQ-RELOAD-4 — the JSON arm is the mutationOutcome envelope (200, {ok,redirect,data}).
    expect(res.status).toBe(200);
    const body = (await res.json()) as { ok: boolean; redirect?: string; data?: { runId: string } };
    expect(body.ok).toBe(true);
    expect(body.redirect).toBe("/p/demo#chat");
    expect(body.data?.runId).toBe("run_2");
  });

  it("a plan-decision run_research redirects to the research_burst SHEET (never a run create)", async () => {
    const postChatPlanDecision = vi.fn(async () => ({
      ok: true as const,
      action: "run_research",
      sheet: { kind: "run_sheet", workflow: "research_burst", href: "/p/demo/sheet?workflow=research_burst&threadId=thr_1" },
    }));
    const app = createWebApp(makeDeps({ postChatPlanDecision }));
    const res = await app.request("/p/demo/chat/plan-decision", {
      method: "POST",
      ...form({ threadId: "thr_1", action: "run_research" }),
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toContain("research_burst");
  });

  it("pins add/remove and corrections forward with the thread id", async () => {
    const addChatPin = vi.fn(async () => ({ ok: true as const, pins: [], footprint: 0 }));
    const removeChatPin = vi.fn(async () => ({ ok: true as const, pins: [], footprint: 0 }));
    const postChatCorrection = vi.fn(async () => ({ ok: true as const, guidanceId: "g_1" }));
    const app = createWebApp(makeDeps({ addChatPin, removeChatPin, postChatCorrection }));

    const add = await app.request("/p/demo/chat/pins", {
      method: "POST",
      ...form({ threadId: "thr_1", summary: "the venue is NeurIPS" }),
    });
    expect(add.status).toBe(302);
    expect(addChatPin).toHaveBeenCalledWith(
      expect.anything(),
      "proj_1",
      "thr_1",
      expect.objectContaining({ summary: "the venue is NeurIPS" }),
    );

    const rm = await app.request("/p/demo/chat/pins/pin_9/remove", {
      method: "POST",
      ...form({ threadId: "thr_1" }),
    });
    expect(rm.status).toBe(302);
    expect(removeChatPin).toHaveBeenCalledWith(expect.anything(), "proj_1", "thr_1", "pin_9");

    const corr = await app.request("/p/demo/chat/corrections", {
      method: "POST",
      ...json({ threadId: "thr_1", text: "Actually ICML." }),
    });
    expect(corr.status).toBe(200);
    expect(((await corr.json()) as { ok: boolean }).ok).toBe(true);
    expect(postChatCorrection).toHaveBeenCalledWith(expect.anything(), "proj_1", "thr_1", { text: "Actually ICML." });
  });

  it("the §7.4 suggestion forwards the anchor verbatim; a refusal re-renders (422 JSON)", async () => {
    const postChatSuggestion = vi.fn(async () => ({
      ok: true as const,
      proposal: {
        id: "prp_1",
        label: "s",
        markdown: "x",
        kind: "replace" as const,
        anchor: { ref: "@v3 ¶4", version: 3, block: "¶4" },
        provenance: "assistant",
      },
    }));
    const app = createWebApp(makeDeps({ postChatSuggestion }));
    const res = await app.request("/p/demo/chat/suggestions", {
      method: "POST",
      ...json({ ref: "@v3 ¶4", version: 3, block: "¶4", replacement: "tighter" }),
    });
    expect(res.status).toBe(200);
    expect(((await res.json()) as { ok: boolean }).ok).toBe(true);
    expect(postChatSuggestion).toHaveBeenCalledWith(
      expect.anything(),
      "proj_1",
      expect.objectContaining({
        anchor: { ref: "@v3 ¶4", version: 3, block: "¶4" },
        replacement: "tighter",
      }),
    );
  });

  it("the notes chip forwards pasted text to agents/author/notes.md", async () => {
    const postChatNote = vi.fn(async () => ({ ok: true as const, path: "agents/author/notes.md" }));
    const app = createWebApp(makeDeps({ postChatNote }));
    const res = await app.request("/p/demo/chat/notes", {
      method: "POST",
      ...form({ text: "my notes" }),
    });
    expect(res.status).toBe(302);
    expect(postChatNote).toHaveBeenCalledWith(expect.anything(), "proj_1", { text: "my notes" });
  });

  it("unauthenticated posts refuse before any data call", async () => {
    const app = createWebApp({ dataSource: { listProjects: async () => [ROW] } as DataSource, session: () => null });
    const res = await app.request("/p/demo/chat/turns", {
      method: "POST",
      ...json({ threadId: "thr_1", message: "hi" }),
    });
    expect(res.status).toBe(401);
  });

  it("REQ-RELOAD-4 — a no-JS empty chat send lands a flash redirect, never a raw JSON page", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/demo/chat/turns", {
      method: "POST",
      ...form({ threadId: "thr_1", message: "" }),
      redirect: "manual",
    });
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("/p/demo#chat");
  });

  it("REQ-RELOAD-4 — the same failure in JSON is the stable code, 422", async () => {
    const app = createWebApp(makeDeps());
    const res = await app.request("/p/demo/chat/turns", {
      method: "POST",
      ...json({ threadId: "thr_1", message: "" }),
    });
    expect(res.status).toBe(422);
    expect((await res.json()) as { error: string }).toEqual({ error: "chat_turn_required" });
  });
});

// RUN.1 (BL-55) — the 2026-09-30 prod defect: the api's 402 `insufficient_balance` reached the web as
// a bare 502 `chat unavailable` with no log trail. The proxy now passes refusal statuses/codes
// through VERBATIM and logs ONE structured line (route + requestId + upstream status/code — never
// the user's message text).
describe("RUN.1 — the chat proxy's truthful error path", () => {
  afterEach(() => vi.restoreAllMocks());

  const errorSpy = () => vi.spyOn(console, "error").mockImplementation(() => undefined);
  const lastLog = () => {
    const calls = vi.mocked(console.error).mock.calls;
    return JSON.parse(String(calls[calls.length - 1]?.[0] ?? "{}")) as Record<string, unknown>;
  };

  it("an api 402 passes through as 402 {error:'insufficient_balance'} — and logs the trail", async () => {
    errorSpy();
    const postChatTurn = vi.fn(async () => {
      throw new ApiError(402, "https://api.test/chat/turns", "payment required", "insufficient_balance");
    });
    const app = createWebApp(makeDeps({ postChatTurn }));
    const res = await app.request("/p/demo/chat/turns", {
      method: "POST",
      ...json({ threadId: "thr_1", message: "hi" }),
    });
    expect(res.status).toBe(402);
    expect((await res.json()) as { error: string }).toEqual({ error: "insufficient_balance" });
    expect(lastLog()).toMatchObject({
      severity: "WARNING",
      msg: "chat_upstream_refused",
      route: "/p/:project/chat/turns",
      upstreamStatus: 402,
      upstreamCode: "insufficient_balance",
    });
    // OBS.1 — the logged id is the REQUEST's id (echoed on the response), not a call-local UUID.
    expect(String(lastLog().requestId)).toBe(res.headers.get("x-rhema-request-id"));
  });

  it("an api 409 (a live run conflicts) passes through as 409 run_in_progress", async () => {
    errorSpy();
    const postChatTurn = vi.fn(async () => {
      throw new ApiError(409, "https://api.test/chat/turns", "conflict", "run_in_progress");
    });
    const app = createWebApp(makeDeps({ postChatTurn }));
    const res = await app.request("/p/demo/chat/turns", {
      method: "POST",
      ...json({ threadId: "thr_1", message: "hi" }),
    });
    expect(res.status).toBe(409);
    expect((await res.json()) as { error: string }).toEqual({ error: "run_in_progress" });
  });

  it("an api 5xx is the real gateway failure — 502 chat_upstream_error, error-level log", async () => {
    errorSpy();
    const postChatTurn = vi.fn(async () => {
      throw new ApiError(503, "https://api.test/chat/turns", "down");
    });
    const app = createWebApp(makeDeps({ postChatTurn }));
    const res = await app.request("/p/demo/chat/turns", {
      method: "POST",
      ...json({ threadId: "thr_1", message: "hi" }),
    });
    expect(res.status).toBe(502);
    expect((await res.json()) as { error: string }).toEqual({ error: "chat_upstream_error" });
    expect(lastLog()).toMatchObject({ severity: "ERROR", upstreamStatus: 503, status: 502 });
  });

  it("a dropped connection (a non-ApiError throw) is 502 chat_unavailable", async () => {
    errorSpy();
    const postChatTurn = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    const app = createWebApp(makeDeps({ postChatTurn }));
    const res = await app.request("/p/demo/chat/turns", {
      method: "POST",
      ...json({ threadId: "thr_1", message: "hi" }),
    });
    expect(res.status).toBe(502);
    expect((await res.json()) as { error: string }).toEqual({ error: "chat_unavailable" });
    expect(lastLog()).toMatchObject({
      severity: "ERROR",
      msg: "chat_upstream_unreachable",
      route: "/p/:project/chat/turns",
      status: 502,
    });
  });

  it("an unbound data-source seam is 503 chat_not_wired — never a mystery 502", async () => {
    errorSpy();
    const app = createWebApp(makeDeps()); // no postChatTurn bound
    const res = await app.request("/p/demo/chat/turns", {
      method: "POST",
      ...json({ threadId: "thr_1", message: "hi" }),
    });
    expect(res.status).toBe(503);
    expect((await res.json()) as { error: string }).toEqual({ error: "chat_not_wired" });
    expect(lastLog()).toMatchObject({
      severity: "ERROR",
      msg: "chat_seam_unbound",
      route: "/p/:project/chat/turns",
      status: 503,
    });
  });

  it("a FORM post gets the same truthful failure — no redirect eats the refusal", async () => {
    errorSpy();
    const postChatTurn = vi.fn(async () => {
      throw new ApiError(402, "https://api.test/chat/turns", "payment required", "insufficient_balance");
    });
    const app = createWebApp(makeDeps({ postChatTurn }));
    const res = await app.request("/p/demo/chat/turns", {
      method: "POST",
      ...form({ threadId: "thr_1", message: "hi" }),
    });
    expect(res.status).toBe(402);
    expect((await res.json()) as { error: string }).toEqual({ error: "insufficient_balance" });
  });

  it("every chat route keeps the api's truthful status + code (not just /turns)", async () => {
    errorSpy();
    const refuse = () => {
      throw new ApiError(403, "https://api.test/x", "forbidden", "account_suspended");
    };
    const app = createWebApp(
      makeDeps({
        postChatCorrection: refuse,
        postChatSuggestion: refuse,
        postChatNote: refuse,
        postChatAttachment: refuse,
        getChatTurn: refuse,
      } as Partial<DataSource>),
    );
    const cases: ReadonlyArray<readonly [string, RequestInit]> = [
      ["/p/demo/chat/corrections", { method: "POST", ...json({ threadId: "t", text: "fix" }) }],
      ["/p/demo/chat/suggestions", { method: "POST", ...json({ ref: "v1:p0", replacement: "x" }) }],
      ["/p/demo/chat/notes", { method: "POST", ...json({ text: "notes" }) }],
      [
        "/p/demo/chat/attachments",
        { method: "POST", ...json({ quarantineKey: "k", filename: "f.pdf", mediaType: "application/pdf" }) },
      ],
      ["/p/demo/chat/turns/run_1?thread=t", { method: "GET" }],
    ];
    for (const [path, init] of cases) {
      const res = await app.request(path, init);
      expect(res.status, path).toBe(403);
      expect(((await res.json()) as { error: string }).error, path).toBe("account_suspended");
    }
  });

  it("the log line never carries the user's message text", async () => {
    errorSpy();
    const secret = "the passphrase my notes carry";
    const postChatTurn = vi.fn(async () => {
      throw new ApiError(402, "https://api.test/chat/turns", "payment required", "insufficient_balance");
    });
    const app = createWebApp(makeDeps({ postChatTurn }));
    await app.request("/p/demo/chat/turns", {
      method: "POST",
      ...json({ threadId: "thr_1", message: secret }),
    });
    for (const call of vi.mocked(console.error).mock.calls) {
      expect(JSON.stringify(call)).not.toContain(secret);
    }
  });
});
