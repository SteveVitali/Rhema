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
  });

  it("renders the tier picker as exactly three notches (REQ-CHAT-14)", () => {
    const html = render();
    for (const t of ["base", "balanced", "frontier"]) expect(html).toContain(`data-chat-tier="${t}"`);
    expect(html).not.toContain("data-chat-tier=\"ultra\"");
  });

  it("renders the metered cost strip (credits + searches + fetches vs budget + workspace spend)", () => {
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
    expect(html).toContain("7/40 credits");
    expect(html).toContain("2/5 searches");
    expect(html).toContain("3/10 fetches");
    expect(html).toContain("workspace 123 credits");
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
    for (const id of ["research", "thesis", "interview", "notes"])
      expect(html).toContain(`data-chat-chip="${id}"`);
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
    expect(html).toContain("[unverified]");
  });
});
