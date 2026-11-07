// @vitest-environment happy-dom
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { MarkdownProse } from "./markdown-prose.js";
import { ChatDesk, type ChatDeskLabels, type ChatDeskProps } from "./chat-panel.js";
import { uiCss } from "./ui-css.js";

// R7COPY.1b (REQ-COPY-3, REQ-TALK-2's rendered-markdown clause; P4-7) — the DOM-level legs: an
// assistant bubble renders markdown through the ONE renderer (italic, list, safe link — no
// asterisks, no raw HTML), and the 320 px card leg pins the wrap/truncate machinery that keeps a
// long URL inside a card (the visual wrap itself is Stage-B evidence at 250's preview).

const LABELS: ChatDeskLabels = {
  threadsHeading: "Threads", newThread: "New", transcriptEmpty: "Empty", pinsHeading: "Pins",
  pinAddPlaceholder: "Pin…", pinAdd: "Pin", pinRemove: "Remove", pinsFootprintFmt: "{n}/{m}",
  remembersHeading: "Memory", correctionPlaceholder: "Correct…", correctionSend: "Save",
  sourcesHeading: "Sources", sourcesEmpty: "None", unverified: "unverified",
  composerPlaceholder: "Ask…", send: "Send", tierLabel: "Tier",
  tiers: { base: "Base", balanced: "Balanced", frontier: "Frontier" },
  strip: { creditsFmt: "{n}/{m} credits", searchesFmt: "{n}/{m}", fetchesFmt: "{n}/{m}", workspaceFmt: "{n}" },
  planCard: { heading: "Plan", run: "Run", firstStep: "First", edit: "Edit", cancel: "Cancel" },
  askAbout: { heading: "Ask", anchorLabel: "Anchor", placeholder: "…", send: "Suggest", tooLarge: "too large" },
  liveRunNote: "live", chipGroupLabel: "chips", notesPlaceholder: "Notes…", notesSend: "Save",
  threadHeading: "Thread", memoryPinsHeading: "Memory", retry: "Retry", abort: "Stop",
  sending: "…", youLabel: "You", assistantLabel: "Assistant",
  debitedFmt: "{n} credits", aboveCapFmt: "metered {n} above — charged {m}",
  progressWorking: "Working…", demoReadonly: "read only", sourcesUsed: "Sources",
};
const ENDPOINTS: ChatDeskProps["endpoints"] = {
  turn: "/t", planDecision: "/pd", pin: "/p", pinRemove: () => "/pr",
  correction: "/c", suggestion: "/s", notes: "/n", threadHref: (t) => `/th/${t}`,
};
const model = (reply: string): ChatDeskProps["model"] => ({
  threads: [{ id: "t1", name: "Chat", isDefault: true, archived: false }],
  activeThreadId: "t1",
  turns: [{
    id: "run_1", state: "completed", createdAt: "2026-11-07T00:00:00Z",
    spentCredits: 3, capCredits: 40, modelTier: "base",
    userText: "q", reply,
  }],
  messages: [], pins: { pins: [], footprint: 0, cap: 12 }, sources: [], liveRun: null,
  budgets: { credits: 40, searches: 5, fetches: 10 }, tier: "base",
});

describe("MarkdownProse — the chat render seam (REQ-TALK-2; P4-7; D-R7TALK.1a-2)", () => {
  it("an assistant bubble renders sanitized markdown through the one renderer — no asterisks, no raw HTML", () => {
    const { container } = render(
      <ChatDesk model={model("*scaled* claim\n\n- one\n- two\n\n[src](https://ex.com/a)")} endpoints={ENDPOINTS} labels={LABELS} />,
    );
    const bubble = container.querySelector('[data-chat-bubble="assistant"]');
    expect(bubble).not.toBeNull();
    const md = bubble!.querySelector("[data-md-block]");
    expect(md).not.toBeNull(); // the ONE renderer owns the bubble body
    expect(bubble!.querySelector("em")?.textContent).toBe("scaled");
    expect(bubble!.querySelectorAll("ul li").length).toBe(2);
    const a = bubble!.querySelector("a[href='https://ex.com/a']");
    expect(a?.getAttribute("rel")).toBe("noopener noreferrer");
    expect(a?.getAttribute("target")).toBe("_blank");
    expect(bubble!.textContent).not.toContain("*scaled*");
    expect(bubble!.querySelector("script,img")).toBeNull();
  });

  it("a hostile reply still renders no markup — script/img-onerror/javascript: neutralized", () => {
    const { container } = render(
      <ChatDesk model={model("<script>x</script>\n\n<img src=x onerror=x>\n\n[y](javascript:x)")} endpoints={ENDPOINTS} labels={LABELS} />,
    );
    const bubble = container.querySelector('[data-chat-bubble="assistant"]')!;
    expect(bubble.querySelector("script")).toBeNull();
    expect(bubble.querySelector("img")).toBeNull();
    expect(bubble.querySelector("a[href^='javascript']")).toBeNull();
  });
});

describe("MarkdownProse — the 320 px card leg (C8)", () => {
  it("a long URL inside a 320 px card truncates + titles + wraps (the uiCss rule is pinned)", () => {
    const long = "https://example.com/".padEnd(90, "x");
    const { container } = render(
      <div style={{ width: "320px" }}>
        <MarkdownProse text={`<${long}>`} />
      </div>,
    );
    const a = container.querySelector("a")!;
    // the anchor's full URL rides title; the visible text is truncated, never the whole URL
    expect(a.getAttribute("title")).toBe(long);
    expect(a.textContent!.length).toBeLessThan(60);
    expect(a.textContent).toContain("…");
    // the wrap machinery lives in the committed stylesheet — the rule every card inherits
    expect(uiCss()).toContain(".ui-md a, .ui-md-url { overflow-wrap: anywhere; }");
    // and the renderer's own block carries the measured hook
    expect(container.querySelector("[data-md-block]")).not.toBeNull();
  });
});
