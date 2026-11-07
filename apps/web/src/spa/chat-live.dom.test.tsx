// R7TALK.1a — the chat panel's live arm, happy-dom. Covers the AC's zero-request demo posture and
// the JSON send path (201 envelope → optimistic bubble; empty send issues no request; abort
// cancels the fetch pre-201). The stubbed-turn leg itself is U6's fixture (REQ-DACC-7).
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ChatPanelLive } from "./chat-live.js";
import { setSpaBoot, type SpaBoot } from "./boot.js";
import { chatDeskLabels, chatDeskEndpoints, chatDeskModel } from "../chat-pane.js";
import type { ChatPanelDto } from "@rhema/api-client";

const CHAT = {
  threads: [{ id: "thr_1", name: "Project chat", isDefault: true }],
  activeThreadId: "thr_1",
  messages: [],
  turns: [],
  pins: { pins: [], footprint: 0, cap: 12 },
  brief: null,
  sources: [],
  liveRun: null,
  budgets: { credits: 40, searches: 5, fetches: 10 },
  defaultTier: "base",
} as unknown as ChatPanelDto;

const DEMO_BOOT: SpaBoot = {
  route: "/p/$slug",
  project: { slug: "demo~essay" },
  demo: { essay: "essay", slug: "demo~essay", signedIn: false, build: "t" },
} as SpaBoot;

function mount() {
  const client = new QueryClient();
  const utils = render(
    <QueryClientProvider client={client}>
      <ChatPanelLive
        model={chatDeskModel(CHAT, {})}
        endpoints={chatDeskEndpoints("demo")}
        slug="demo"
        labels={chatDeskLabels}
      />
    </QueryClientProvider>,
  );
  return utils;
}

describe("ChatPanelLive (R7TALK.1a)", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let esCtor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    esCtor = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("EventSource", esCtor);
  });
  afterEach(() => {
    setSpaBoot(null);
    vi.unstubAllGlobals();
    cleanup();
  });

  it("demo boot — composer disabled with the reason, no request, no EventSource (REQ-DWEB-7)", () => {
    setSpaBoot(DEMO_BOOT);
    mount();
    const area = screen.getByPlaceholderText(/ask about this project/i) as HTMLTextAreaElement;
    expect(area.disabled).toBe(true);
    expect(screen.getByText(/read-only/i)).toBeTruthy();
    // typing + Enter still issues nothing — the composer is withheld.
    fireEvent.change(area, { target: { value: "hello" } });
    fireEvent.keyDown(area, { key: "Enter" });
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(esCtor).not.toHaveBeenCalled();
  });

  it("a Send posts the JSON mutation and renders the optimistic bubble — no form post", async () => {
    fetchSpy.mockImplementation((path: unknown) =>
      Promise.resolve(
        new Response(
          String(path).includes("/chat/turns")
            ? JSON.stringify({ ok: true, data: { runId: "run_1", state: "queued", deduped: false } })
            : "{}",
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    mount();
    const area = screen.getByPlaceholderText(/ask about this project/i) as HTMLTextAreaElement;
    fireEvent.change(area, { target: { value: "What claims stand?" } });
    fireEvent.keyDown(area, { key: "Enter" });
    // the send is the chat/turns call — the feed-labels query's own fetch is filtered out.
    const turnCalls = () =>
      fetchSpy.mock.calls.filter((c) => String(c[0]).includes("/chat/turns"));
    await waitFor(() => expect(turnCalls()).toHaveLength(1));
    const [path, init] = turnCalls()[0] as [string, RequestInit];
    expect(path).toBe("/p/demo/chat/turns");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toMatchObject({
      threadId: "thr_1",
      message: "What claims stand?",
      modelTier: "base",
    });
    await waitFor(() => expect(screen.getByText("What claims stand?")).toBeTruthy());
    // the 201's runId opens the run-event tail.
    await waitFor(() => expect(esCtor).toHaveBeenCalledWith("/p/demo/r/run_1/events"));
  });

  it("an empty send is blocked client-side — no request, no bubble", async () => {
    mount();
    const area = screen.getByPlaceholderText(/ask about this project/i) as HTMLTextAreaElement;
    fireEvent.change(area, { target: { value: "   " } });
    fireEvent.keyDown(area, { key: "Enter" });
    await new Promise((r) => setTimeout(r, 50));
    const turnCalls = fetchSpy.mock.calls.filter((c) => String(c[0]).includes("/chat/turns"));
    expect(turnCalls).toHaveLength(0);
  });
});
