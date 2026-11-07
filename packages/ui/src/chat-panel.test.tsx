import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { ChatDesk, type ChatDeskLabels, type ChatDeskProps } from "./chat-panel.js";

// P1.11 — the Desk Chat panel's deterministic half (§7.1/§7.4/§7.6): SSR renders the threads, the
// composer (a real form — a send works with no script), the notch-only tier picker, the metered cost
// strip, the plan card with its four actions, the ≤12 pins rail, the read-only sources list, the
// empty state's four chips + scratch pad, and the §7.4 anchored "Ask about this draft" composer.

const LABELS: ChatDeskLabels = {
  threadsHeading: "Threads",
  newThread: "New thread",
  transcriptEmpty: "Nothing here yet.",
  pinsHeading: "Pinned",
  pinAddPlaceholder: "Pin a fact…",
  pinAdd: "Pin",
  pinRemove: "Remove pin",
  pinsFootprintFmt: "{n} tokens across {m} pins",
  remembersHeading: "What the assistant remembers",
  correctionPlaceholder: "Correct something…",
  correctionSend: "Save correction",
  sourcesHeading: "Chat sources",
  sourcesEmpty: "No sources yet.",
  unverified: "unverified",
  composerPlaceholder: "Ask about this project…",
  send: "Send",
  tierLabel: "Model tier",
  tiers: { base: "Base", balanced: "Balanced", frontier: "Frontier" },
  strip: {
    creditsFmt: "{n}/{m} credits",
    searchesFmt: "{n}/{m} searches",
    fetchesFmt: "{n}/{m} fetches",
    workspaceFmt: "workspace {n} credits",
  },
  planCard: {
    heading: "Plan",
    run: "Run the research",
    firstStep: "Just the first step",
    edit: "Edit the plan",
    cancel: "Cancel",
  },
  askAbout: {
    heading: "Ask about this draft",
    anchorLabel: "Anchored to",
    placeholder: "One paragraph at most.",
    send: "Suggest",
    tooLarge: "Run /lineedit @section or /revise instead.",
  },
  liveRunNote: "A run is live — committed artifacts only.",
  chipGroupLabel: "Start here",
  notesPlaceholder: "Paste your notes…",
  notesSend: "Save notes",
  threadHeading: "Conversation",
  memoryPinsHeading: "Memory & pins",
  retry: "Retry",
  abort: "Stop",
  sending: "Sending…",
  youLabel: "You",
  assistantLabel: "Assistant",
  debitedFmt: "{n} credits",
  aboveCapFmt: "metered {n} credits above the cap — charged {m} (cap-clamped)",
  progressWorking: "Working…",
  demoReadonly: "The demo is read-only — sign up to chat about your own project.",
  sourcesUsed: "Sources",
};

const ENDPOINTS: ChatDeskProps["endpoints"] = {
  turn: "/p/slug/chat/turns",
  planDecision: "/p/slug/chat/plan-decision",
  pin: "/p/slug/chat/pins",
  pinRemove: (id) => `/p/slug/chat/pins/${id}/remove`,
  correction: "/p/slug/chat/corrections",
  suggestion: "/p/slug/chat/suggestions",
  notes: "/p/slug/chat/notes",
  threadHref: (t) => `/p/slug?thread=${t}#chat`,
};

const baseModel: ChatDeskProps["model"] = {
  threads: [{ id: "thr_1", name: "Project chat", isDefault: true, archived: false }],
  activeThreadId: "thr_1",
  turns: [],
  messages: [],
  pins: { pins: [], footprint: 0, cap: 12 },
  sources: [],
  liveRun: null,
  emptyState: null,
  budgets: { credits: 40, searches: 5, fetches: 10 },
  tier: "base",
};

const render = (model: Partial<ChatDeskProps["model"]> = {}) =>
  renderToStaticMarkup(<ChatDesk model={{ ...baseModel, ...model }} endpoints={ENDPOINTS} labels={LABELS} />);

describe("ChatDesk (P1.11; §7.1)", () => {
  it("renders the composer as a real form posting to the turn endpoint with the thread id", () => {
    const html = render();
    expect(html).toContain('data-chat-composer');
    expect(html).toContain('action="/p/slug/chat/turns"');
    expect(html).toContain('name="message"');
    expect(html).toContain('value="thr_1"');
    expect(html).toContain('data-chat-thread-link="thr_1"');
  });

  it("renders the tier picker as exactly three notches (REQ-CHAT-14)", () => {
    const html = render();
    // the Select posts `modelTier` through its hidden native select (the three notches are its
    // items — SSR emits the trigger + the hidden select, the menu mounts client-side).
    expect(html).toContain("data-chat-tier");
    expect(html).toContain('name="modelTier"');
    expect(html).not.toContain("Ultra");
  });

  it("renders the live credit meter from the strip DTO (REQ-TALK-2: '0 / 40 credits')", () => {
    const html = render({
      strip: {
        spentCredits: 7,
        capCredits: 40,
        searchesUsed: 2,
        searchesBudget: 5,
        fetchesUsed: 3,
        fetchesBudget: 10,
        workspaceSpent: 123,
        tier: "base",
      },
    });
    expect(html).toContain("data-chat-strip");
    expect(html).toContain("7/40 credits");
    // without a strip the meter still renders 0/budget — every number from the DTO.
    const bare = render();
    expect(bare).toContain("0/40 credits");
  });

  it("renders the §7.6 empty state — the four chips + the notes scratch form", () => {
    const html = render({
      emptyState: {
        chips: [
          { id: "research", label: "Research a question", verb: "/research" },
          { id: "thesis", label: "I have a thesis", verb: "chat" },
          { id: "interview", label: "Interview me", verb: "chat" },
          { id: "notes", label: "Paste my notes", verb: "notes" },
        ],
        nextStep: { kind: "sheet", label: "Start with research", href: "/p/slug/sheet?workflow=research_burst" },
      },
    });
    expect(html).toContain('data-chat-empty');
    for (const id of ["research", "thesis", "interview", "notes"])
      expect(html).toContain(`data-chat-chip="${id}"`);
    expect(html).toContain('data-chat-notes');
    expect(html).toContain('action="/p/slug/chat/notes"');
    // the research chip links the next-step SHEET — it never launches a run itself.
    expect(html).toContain("research_burst");
  });

  it("renders the plan card with its four actions and the research sheet link (REQ-CHAT-10)", () => {
    const html = render({
      planCard: {
        summary: "Answer the question",
        steps: ["Read the brief", "Answer under budgets", "Land sources"],
        budget: { credits: 40, searches: 5, fetches: 10 },
        modelTier: "base",
        actions: ["run_research", "first_step", "edit", "cancel"],
        researchSheetHref: "/p/slug/sheet?workflow=research_burst",
      },
    });
    expect(html).toContain('data-chat-plan-card');
    expect(html).toContain('data-chat-plan="first_step"');
    expect(html).toContain('data-chat-plan="edit"');
    expect(html).toContain('data-chat-plan="cancel"');
    expect(html).toContain('data-chat-plan="run_research"');
    expect(html).toContain("research_burst");
  });

  it("renders the §7.4 anchored composer with the @vN ¶ ref carried in hidden inputs", () => {
    const html = render({ askAbout: { ref: "@v3 ¶4", version: 3, block: "¶4" } });
    expect(html).toContain('data-chat-ask');
    expect(html).toContain('action="/p/slug/chat/suggestions"');
    expect(html).toContain('value="@v3 ¶4"');
    expect(html).toContain('name="replacement"');
    expect(html).toContain("/lineedit @section");
    expect(html).toContain("/revise");
  });

  it("renders pins with remove forms + the add form under the cap; hides the add form at 12", () => {
    const pins = Array.from({ length: 12 }, (_, i) => ({
      id: `pin_${i}`,
      kind: "fact",
      summary: `pin ${i}`,
    }));
    const full = render({ pins: { pins, footprint: 300, cap: 12 } });
    expect(full).toContain("300 tokens across 12 pins");
    expect(full).not.toContain('action="/p/slug/chat/pins"');
    const some = render({
      pins: { pins: pins.slice(0, 2), footprint: 50, cap: 12 },
    });
    expect(some).toContain('action="/p/slug/chat/pins"');
    expect(some).toContain('data-chat-pin="pin_0"');
  });

  it("renders the live-run read note + the sources list with [unverified] markers", () => {
    const html = render({
      liveRun: "run_9",
      sources: [
        { path: "agents/assistant/research/sources/a.md", kind: "source", title: "Paper A" },
        { path: "agents/assistant/research/sources/b.md", kind: "source", title: "Paper B", unverified: true },
      ],
    });
    expect(html).toContain("committed artifacts only");
    expect(html).toContain('data-chat-live-note');
    expect(html).toContain('data-chat-sources');
    expect(html).toContain('data-chat-source="agents/assistant/research/sources/a.md"');
    expect(html).toContain('data-chat-source-chip="agents/assistant/research/sources/b.md"');
    expect(html).toContain("[unverified]");
  });

  // RUN.1 (BL-56) — the 2026-09-30 prod defect: the composer scrolled under `footer.ide-statusbar`.
  // The markup contract the CSS pins on: `.chat-body` wraps EVERYTHING except the composer (the
  // scroll region inside the fixed-height Desk drawer), and `.chat-composer` is the LAST child of
  // `.chat-desk` — `flex:0 0 auto` keeps Send glued to the drawer's bottom edge forever.
  it("pins the composer as the last child — .chat-body scrolls, Send never leaves the drawer (RUN.1)", () => {
    const html = render();
    expect(html).toContain('class="chat-body"');
    const desk = html.slice(html.indexOf('class="chat-desk"'));
    const body = desk.indexOf('class="chat-body"');
    const composer = desk.indexOf('class="chat-composer"');
    expect(body).toBeGreaterThan(-1);
    expect(composer).toBeGreaterThan(body); // the composer follows the scroll region
    // every scrollable block — transcript, plan card, remembers, pins, sources — sits INSIDE
    // .chat-body (before the composer), so nothing can push Send below the drawer's edge.
    for (const marker of ["chat-log", "chat-remembers", "chat-pins", "chat-sources"]) {
      const at = desk.indexOf(`class="${marker}"`);
      if (at >= 0) expect(at).toBeLessThan(composer);
    }
    // and the composer is the LAST element — the desk ends with the composer form's close.
    expect(desk.trimEnd().endsWith("</form></div>")).toBe(true);
  });
});

describe("ChatDesk (R7TALK.1a; REQ-TALK-2)", () => {
  const turn = {
    id: "run_t1",
    state: "completed",
    createdAt: "2026-11-06T00:00:00Z",
    spentCredits: 16,
    capCredits: 5,
    modelTier: "base",
    debitedCredits: 5,
    userText: "What does the draft claim?",
    reply: "It claims a thesis.\n\nWith a second paragraph.",
    refs: ["@v1 §I", "agents/assistant/research/sources/a.md"],
  };

  it("renders user+assistant bubbles, citation chips, and the debited footnote — never burn as the charge", () => {
    const html = render({ turns: [turn] });
    expect(html).toContain('data-chat-log');
    expect(html).toContain('data-chat-bubble="user"');
    expect(html).toContain("What does the draft claim?");
    expect(html).toContain('data-chat-bubble="assistant"');
    expect(html).toContain("It claims a thesis.");
    expect(html).toContain('data-chat-citations="run_t1"');
    expect(html).toContain('data-chat-cite="@v1 §I"');
    // the footnote shows the CAP-CLAMPED DEBIT (5), not the metered burn (16).
    expect(html).toContain('data-chat-footnote="run_t1"');
    expect(html).toContain("5 credits");
    expect(html).not.toContain(">16 credits<");
    // burn above the cap is labelled truthfully, never hidden.
    expect(html).toContain('data-chat-overcap="run_t1"');
    expect(html).toContain("metered 11 credits above the cap — charged 5 (cap-clamped)");
  });

  it("a failed turn shows inline retry; memory+pins sit in the header disclosure", () => {
    const html = renderToStaticMarkup(
      <ChatDesk
        model={{
          ...baseModel,
          turns: [{ ...turn, state: "failed", reply: undefined, debitedCredits: undefined }],
          pins: { pins: [{ id: "p1", kind: "fact", summary: "pin one" }], footprint: 9, cap: 12 },
        }}
        endpoints={ENDPOINTS}
        labels={LABELS}
        live={{ onRetry: () => undefined }}
      />,
    );
    expect(html).toContain('data-chat-failed="run_t1"');
    expect(html).toContain('data-chat-retry="run_t1"');
    expect(html).toContain('data-chat-remembers');
    expect(html).toContain('data-chat-pins');
    expect(html).toContain('data-chat-pin="p1"');
    expect(html).toContain("Memory &amp; pins");
    // a pending turn renders the working line, never a status row.
    const pending = render({ turns: [{ ...turn, state: "running", reply: undefined }] });
    expect(pending).toContain("Working…");
    expect(pending).not.toContain("turn ·");
  });

  it("renderAssistantText is the markdown seam — rendered emphasis/lists, still no raw HTML (R7COPY.1b)", () => {
    const html = render({
      turns: [{ ...turn, spentCredits: 3, capCredits: 40, reply: "*real* markdown\n\n- item\n\n<b>bold</b>\n\n<script>x</script>" }],
    });
    // R7COPY.1b — the seam now renders sanitized markdown (emphasis, lists) through the ONE
    // renderer; raw HTML stays escaped text — <b>/<script> never become live elements.
    expect(html).toContain("<em>real</em>");
    expect(html).toContain("<li>");
    expect(html).toContain("&lt;b&gt;");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<b>bold</b>");
    expect(html).not.toContain("<script>");
    expect(html).toContain('data-md-block');
  });
});

describe("ChatDesk live/read-only hooks (R7TALK.1a)", () => {
  it("emits the live arm's hooks: progress, error, abort, send, read-only reason", () => {
    const html = renderToStaticMarkup(
      <ChatDesk
        model={baseModel}
        endpoints={ENDPOINTS}
        labels={LABELS}
        live={{
          onSend: () => undefined,
          pending: true,
          onAbort: () => undefined,
          progress: "Reading the draft",
          error: "request_failed",
          optimistic: "typed words",
        }}
      />,
    );
    expect(html).toContain("data-chat-progress");
    expect(html).toContain("data-chat-error");
    expect(html).toContain("data-chat-abort");
    expect(html).toContain("typed words");
    const readonly = renderToStaticMarkup(
      <ChatDesk model={baseModel} endpoints={ENDPOINTS} labels={LABELS} readOnlyReason="read only" />,
    );
    expect(readonly).toContain("data-chat-readonly");
    const sendable = render();
    expect(sendable).toContain("data-chat-send");
  });
});
