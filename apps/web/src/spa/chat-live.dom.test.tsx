// R7TALK.1a — the chat panel's live arm, happy-dom. Covers the AC's zero-request demo posture and
// the JSON send path (201 envelope → optimistic bubble; empty send issues no request; abort
// cancels the fetch pre-201). The stubbed-turn leg itself is U6's fixture (REQ-DACC-7).
// R7UX.9 adds the `chat.token` render legs (accumulation, seq-dedup on replay, the completion
// swap, the zero-token posture) over a FakeES that captures named-event listeners.
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

/** A named-event EventSource stand-in: captures per-type listeners (the wire carries
 *  `event: <type>` frames — `onmessage` is never the path) and exposes `emit` for the legs. */
class FakeES {
  static instances: FakeES[] = [];
  readonly url: string;
  readonly listeners = new Map<string, Set<(ev: Event) => void>>();
  readonly close = vi.fn();
  onerror: (() => void) | null = null;
  constructor(url: string) {
    this.url = url;
    FakeES.instances.push(this);
  }
  static reset(): void {
    FakeES.instances = [];
  }
  static latest(): FakeES {
    const es = FakeES.instances[FakeES.instances.length - 1];
    if (es == null) throw new Error("no EventSource opened");
    return es;
  }
  addEventListener(type: string, fn: (ev: Event) => void): void {
    const set = this.listeners.get(type) ?? new Set<(ev: Event) => void>();
    set.add(fn);
    this.listeners.set(type, set);
  }
  emit(type: string, data: unknown): void {
    const ev = { data: JSON.stringify(data) } as MessageEvent;
    for (const fn of this.listeners.get(type) ?? []) fn(ev);
  }
}

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

  beforeEach(() => {
    fetchSpy = vi.fn();
    FakeES.reset();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("EventSource", FakeES);
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
    expect(FakeES.instances).toHaveLength(0);
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
    await waitFor(() => expect(FakeES.latest().url).toBe("/p/demo/r/run_1/events"));
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

describe("ChatPanelLive token streaming (332_R7UX.9; BL-99b/ADR-137)", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  const sendTurn = async (): Promise<FakeES> => {
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
    fireEvent.change(area, { target: { value: "Tell me about rivers." } });
    fireEvent.keyDown(area, { key: "Enter" });
    await waitFor(() => expect(FakeES.latest().url).toBe("/p/demo/r/run_1/events"));
    return FakeES.latest();
  };
  const token = (seq: number, text: string) => ({
    type: "chat.token",
    payload: { turnId: "turn_9", seq, text },
  });
  const streamEl = (): HTMLElement | null => document.querySelector("[data-chat-stream]");

  beforeEach(() => {
    fetchSpy = vi.fn();
    FakeES.reset();
    vi.stubGlobal("fetch", fetchSpy);
    vi.stubGlobal("EventSource", FakeES);
  });
  afterEach(() => {
    setSpaBoot(null);
    vi.unstubAllGlobals();
    cleanup();
  });

  it("chat.token deltas accumulate into the pending bubble — the DOM grows with the stream", async () => {
    const es = await sendTurn();
    es.emit("chat.token", token(0, "Rivers run"));
    await waitFor(() => expect(streamEl()?.textContent).toBe("Rivers run"));
    es.emit("chat.token", token(1, " from high ground."));
    await waitFor(() =>
      expect(streamEl()?.textContent).toBe("Rivers run from high ground."),
    );
    // the in-flight bubble carries the streaming flag; the pending line is replaced.
    expect(document.querySelector("[data-streaming='true']")).not.toBeNull();
    expect(document.querySelector("[data-chat-progress]")).toBeNull();
  });

  it("a mid-stream replay dedups by seq — no doubling, out-of-order deltas concat in seq order", async () => {
    const es = await sendTurn();
    es.emit("chat.token", token(0, "Rivers run"));
    es.emit("chat.token", token(1, " from high ground."));
    await waitFor(() =>
      expect(streamEl()?.textContent).toBe("Rivers run from high ground."),
    );
    // a reconnect replays the committed deltas — identical seqs are idempotent.
    es.emit("chat.token", token(0, "Rivers run"));
    es.emit("chat.token", token(1, " from high ground."));
    await new Promise((r) => setTimeout(r, 30));
    expect(streamEl()?.textContent).toBe("Rivers run from high ground.");
    // seq, not arrival order, orders the text.
    es.emit("chat.token", token(3, " — sometimes downhill."));
    es.emit("chat.token", token(2, " They carve valleys"));
    await waitFor(() =>
      expect(streamEl()?.textContent).toBe(
        "Rivers run from high ground. They carve valleys — sometimes downhill.",
      ),
    );
    expect(es.close).not.toHaveBeenCalled();
  });

  it("a non-terminal run.state_changed keeps the tail open; the completion event swaps the stream out", async () => {
    const es = await sendTurn();
    es.emit("chat.token", token(0, "Rivers run"));
    await waitFor(() => expect(streamEl()?.textContent).toBe("Rivers run"));
    // queued → running is a state_changed — per-transition, NOT the end of the turn.
    es.emit("run.state_changed", {
      type: "run.state_changed",
      payload: { to: "running", from: "queued" },
    });
    await new Promise((r) => setTimeout(r, 30));
    expect(es.close).not.toHaveBeenCalled();
    es.emit("chat.token", token(1, " farther."));
    await waitFor(() => expect(streamEl()?.textContent).toBe("Rivers run farther."));
    // the completion closes the tail + clears the stream + the optimistic row (canonical swap).
    es.emit("chat.turn.completed", { type: "chat.turn.completed", payload: { threadId: "thr_1" } });
    await waitFor(() => expect(es.close).toHaveBeenCalled());
    expect(streamEl()).toBeNull();
    expect(document.querySelector("[data-streaming]")).toBeNull();
    expect(document.querySelector('[data-chat-turn="optimistic"]')).toBeNull();
  });

  it("a terminal run.state_changed (to: failed) reconciles the same way", async () => {
    const es = await sendTurn();
    es.emit("chat.token", token(0, "half an answer"));
    await waitFor(() => expect(streamEl()).not.toBeNull());
    es.emit("run.state_changed", {
      type: "run.state_changed",
      payload: { to: "failed", from: "running" },
    });
    await waitFor(() => expect(es.close).toHaveBeenCalled());
    expect(streamEl()).toBeNull();
    expect(document.querySelector('[data-chat-turn="optimistic"]')).toBeNull();
  });

  it("a zero-token turn renders exactly as today — the pending line, then a clean close", async () => {
    const es = await sendTurn();
    await new Promise((r) => setTimeout(r, 30));
    // no chat.token frames: the pending bubble keeps the working line, no stream hooks exist.
    expect(streamEl()).toBeNull();
    expect(document.querySelector("[data-streaming]")).toBeNull();
    expect(document.querySelector("[data-chat-progress]")).not.toBeNull();
    es.emit("chat.turn.completed", { type: "chat.turn.completed", payload: { threadId: "thr_1" } });
    await waitFor(() => expect(es.close).toHaveBeenCalled());
    expect(document.querySelector('[data-chat-turn="optimistic"]')).toBeNull();
  });
});
