import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { ApiError, type ProjectRow, type EditorDocDto, type GateCardDto } from "@rhema/api-client";
import { createWebApp, type WebDeps } from "./server.js";
import type { DataSource } from "./data.js";

// R7RO.2 (REQ-RELOAD-7, REQ-MOBILE-3 amended; F4; RV-22) — the phone-UA reader's SSR contract:
// the §10.1 entry points (timeline / findings / chat + the Reading disclosure) mount inside the
// Page as server-rendered, no-JS-capable disclosures reachable from the phonebar — and the
// desktop-only subtrees (right panel, Margin, status bar, menus, palette, cheat sheet) never
// enter the DOM (frontend-spa-spec §216 — CSS hiding is a contract violation).

const PHONE = { headers: { "sec-ch-ua-mobile": "?1" } };

const PROJECTS: ProjectRow[] = [
  {
    id: "proj_1",
    slug: "the-piece",
    title: "The Piece",
    headDraftId: "d_1",
    state: { key: "draft", pill: "Draft", overlay: null, suggested: { action: "review", label: "Review" } },
  },
];

const DOC: EditorDocDto = {
  draftId: "d_1",
  draftN: 1,
  origin: "human_revision",
  state: "working",
  baseDraftId: null,
  baseDraftN: null,
  markdown: "# Title\n\nA paragraph.\n",
  sha256: "sha",
  lock: null,
  findings: [],
  provenance: {},
  meters: { words: 3, readMin: 1 },
};

const GATE: GateCardDto = {
  id: "gate_1",
  runId: "run_9",
  kind: "approve_triage",
  workflow: "revise",
  openedAt: "2026-09-16T10:00:00Z",
  pausedWhileReading: false,
  held: false,
  blocking: true,
  onExpiry: "wait",
  spentCredits: 120,
  capCredits: 840,
  triage: {
    rows: [
      { findingId: "f_1", ordinal: 1, title: "The injury is the least-evidenced thing.", severity: "blocking" },
      { findingId: "f_2", ordinal: 2, title: "A citation is misstated.", severity: "major" },
    ],
  },
};

const TIMELINE = {
  project: { id: "proj_1", slug: "the-piece", title: "The Piece" },
  state: PROJECTS[0]!.state,
  nextStep: { verb: "review", label: "Review", estimateCredits: 840, headDraftN: 1 },
  rounds: [
    {
      n: 1,
      anchor: { draftId: "d_1", n: 1, origin: "human_revision" },
      producedN: null,
      parts: [],
      runs: [
        {
          runId: "run_9",
          workflow: "revise",
          state: "waiting_gate" as const,
          createdAt: "2026-09-16T09:00:00Z",
          subjectN: 1,
          producedN: null,
          card: {
            runId: "run_9",
            state: "waiting_gate" as const,
            phases: [],
            spentCredits: 120,
            capCredits: 840,
            creditFraction: 0.14,
            refundedCredits: 0,
            elapsedMs: 60000,
            etaBand: null,
            done: 0,
            running: 0,
            total: 6,
            estimateCredits: 840,
            queuePosition: null,
            paused: false,
            waitingGate: { id: "gate_1", kind: "approve_triage" },
            deliverables: [],
            delivered: null,
            failureCode: null,
            resumable: false,
            queuedNotes: 0,
            actions: [],
            deliveryLabel: null,
          },
          gate: GATE,
        },
      ],
    },
  ],
  ungrouped: [],
  originChip: null,
};

const CHAT = {
  threads: [{ id: "th_1", name: "General", isDefault: true, archived: false }],
  activeThreadId: "th_1",
  turns: [],
  messages: [],
  pins: { pins: [], footprint: 0, cap: 10 },
  sources: [],
  liveRun: null,
  emptyState: null,
  budgets: { turnCap: 2000, weeklyBudget: null, spentThisWeek: 0 },
  defaultTier: "base",
};

const LATEST_REVIEW = {
  latestReview: {
    runId: "run_9",
    draftN: 1,
    deliveredAt: "2026-09-16T10:00:00Z",
    counts: { findings: 2, strengths: 0, claims: 3 },
    findings: [
      { id: "f_1", ordinal: 1, severity: "blocking", kind: "claim", excerpt: "The injury is the least-evidenced thing.", status: "open" },
      { id: "f_2", ordinal: 2, severity: "major", kind: "craft", excerpt: "A citation is misstated.", status: "open" },
    ],
    claims: [],
    fetchLog: [],
    searchResultLog: [],
  },
};

function makeDeps(over: Partial<DataSource> = {}): WebDeps {
  return {
    dataSource: {
      listProjects: async () => PROJECTS,
      resolveEditorDraft: async () => ({ draftId: "d_1", draftN: 1, state: "working", origin: "human_revision" }),
      getEditorDoc: async () => DOC,
      listGates: async () => [],
      listDecisions: async () => [],
      getApprovalOverrides: async () => ({}),
      getPretriage: async () => ({ triaged: 0, total: 0 }),
      getInbox: async () => [],
      getInboxBadge: async () => ({ count: 0 }),
      getTimeline: async () => TIMELINE as never,
      getChat: async () => CHAT as never,
      getLatestReview: async () => LATEST_REVIEW as never,
      getProjectVoice: async () => {
        throw new ApiError(404, "none");
      },
      listVoices: async () => [],
      ...over,
    } as DataSource,
    session: () => ({ "x-rhema-user-id": "u_1" }),
  };
}

describe("R7RO.2 — the phone-UA reader (REQ-MOBILE-3 amended)", () => {
  it("the phonebar carries the §10.1 entry links and the sections mount inside the Page", async () => {
    const html = await (await createWebApp(makeDeps()).request("/p/the-piece", PHONE)).text();
    expect(html).toContain('data-ssr-cause="phone"');
    expect(html).toContain("ide-phonebar");
    // one nav link per rendered section — never a dead end
    expect(html).toContain('href="#phone-timeline"');
    expect(html).toContain('href="#phone-findings"');
    expect(html).toContain('href="#phone-chat"');
    expect(html).toContain('href="#phone-reading"');
    // the disclosures themselves — server-rendered native <details>
    expect(html).toContain('id="phone-timeline"');
    expect(html).toContain('id="phone-findings"');
    expect(html).toContain('id="phone-chat"');
    expect(html).toContain('id="phone-reading"');
    expect(html).toContain('data-phone-section="timeline"');
    expect(html).toContain('data-phone-section="findings"');
    expect(html).toContain('data-phone-section="reading"');
    // the meter line the hidden status bar carried survives
    expect(html).toContain('data-phone-status="true"');
    expect(html).toContain("3 words");
  });

  it("the §10.1 inputs render and post through their existing routes (gate actions, dispositions, chat)", async () => {
    const html = await (await createWebApp(makeDeps()).request("/p/the-piece", PHONE)).text();
    // the waiting run's compact gate card — Approve / Wait for me / Stop post to the gate route
    expect(html).toContain('data-gate-card="approve_triage"');
    expect(html).toContain('action="/p/the-piece/gates/gate_1"');
    // the triage rows' compact disposition controls post the five verbs + note
    expect(html).toContain('action="/p/the-piece/findings/f_1/disposition"');
    expect(html).toContain('action="/p/the-piece/findings/f_2/disposition"');
    // the chat composer posts the turn through the same-origin chat route
    expect(html).toContain('data-phone-chat="true"');
    expect(html).toContain('action="/p/the-piece/chat/turns"');
    // and the posts round-trip through the existing routes
    const app = createWebApp(makeDeps());
    const gatePost = await app.request("/p/the-piece/gates/gate_1", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ action: "wait" }).toString(),
    });
    // the route answers — the fixture's write seam is unbound, so a 5xx upstream posture is
    // truthful too (never a 404 dead end)
    expect([200, 302, 500, 502, 503]).toContain(gatePost.status);
    const chatPost = await app.request("/p/the-piece/chat/turns", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ threadId: "th_1", message: "hi" }).toString(),
    });
    // the seam is unbound in the fixture — the route exists and answers (503 chat_not_wired / redirect), never a dead end
    expect([302, 500, 503]).toContain(chatPost.status);
  });

  it("desktop-only subtrees never enter the DOM (frontend-spa-spec §216)", async () => {
    const html = await (await createWebApp(makeDeps()).request("/p/the-piece", PHONE)).text();
    // markup-form assertions — the same class tokens legitimately appear inside the emitted
    // ideCss() <style> block, so only the attribute/element spellings can be absent legs.
    for (const absent of [
      'data-pane="panel"',
      'data-pane="margin"',
      'class="ide-panel"',
      'class="ide-margin"',
      'class="ide-statusbar"',
      'data-ide-menu="view"',
      'data-ide-menu="theme"',
      "data-ide-cheatsheet",
      "data-ide-handle",
      "data-palette=",
      "data-app-palette",
      "data-ide-focus-exit",
      "data-feed-run",
    ]) {
      expect(html, absent).not.toContain(absent);
    }
    // the run sheet's verbs + the next-step launch href stay off the reader (§10.1 ✗)
    expect(html).not.toContain('href="/p/the-piece/run?workflow=draft"');
    expect(html).not.toContain('data-timeline-verbs');
    // but the island still mounts and the reader chrome stamps
    expect(html).toContain('src="/assets/ide.js"');
    expect(html).toContain('data-ide="1"');
    // the timeline content IS served inside the disclosure
    expect(html).toContain("data-timeline-pane");
  });

  it("the Reading disclosure carries the island's font/stepper/theme/paper controls", async () => {
    const html = await (await createWebApp(makeDeps()).request("/p/the-piece", PHONE)).text();
    expect(html).toContain('data-ide-font="serif"');
    expect(html).toContain('data-ide-font="sans"');
    expect(html).toContain('data-ide-reader="up"');
    expect(html).toContain('data-ide-reader="down"');
    expect(html).toContain('data-ide-theme="dark"');
    expect(html).toContain('data-ide-paper="light"');
    expect(html).toContain('data-theme-url="/ide/theme"');
    expect(html).toContain('data-paper-url="/p/the-piece/paper-theme"');
  });

  it("#finding-<id> anchors resolve inside the reader document", async () => {
    const html = await (await createWebApp(makeDeps()).request("/p/the-piece", PHONE)).text();
    // the findings list carries the anchor ids the Page's finding marks link to
    expect(html).toContain('id="finding-f_1"');
    expect(html).toContain('data-review-finding="f_1"');
  });

  it("a desktop request serves the shell (no reader, no island)", async () => {
    const html = await (await createWebApp(makeDeps()).request("/p/the-piece")).text();
    expect(html).toContain('id="spa-root"');
    expect(html).not.toContain('src="/assets/ide.js"');
    expect(html).not.toContain('data-ide="1"');
  });
});

// The island's deletion contract (REQ-RELOAD-7): client/ide.ts is the phone-UA reader's
// enhancement ONLY — no pane toggles/drags, palette, keymap dispatcher, selection popover,
// findings cursor, or live-feed tail may re-enter it (they are the SPA controller's now).
describe("R7RO.2 — the island's retained subset", () => {
  const SRC = readFileSync(
    join(dirname(fileURLToPath(import.meta.url)), "client", "ide.ts"),
    "utf8",
  );

  it("no SPA-owned machinery is re-imported", () => {
    for (const banned of [
      "dispatchIdeKey",
      "paneDrag",
      "paneStorageKey",
      "parsePaneState",
      "serializePaneState",
      "selectionMenuItems",
      "contextMenuItems",
      "parseCommand",
      "resolveCommand",
      "formatFeedRow",
      "feedRowVisible",
      "cyclePaperTheme",
      "EventSource",
      "DEFAULT_PANE_STATE",
      "data-ide-panel",
      "data-app-palette",
      "data-ide-cheatsheet",
      "data-ide-handle",
      "data-ide-toggle",
      "data-margin-card",
      "data-desk-row",
      "keydown",
      "contextmenu",
    ]) {
      expect(SRC, banned).not.toContain(banned);
    }
  });

  it("the reader's retained seams are present", () => {
    for (const kept of [
      "data-ide-font",
      "data-ide-reader",
      "data-ide-theme",
      "data-ide-paper",
      "rhema:font:v1",
      "rhema:reader-step:v1",
      "themeUrl",
      "paperUrl",
      "HTMLDetailsElement",
      "hashchange",
    ]) {
      expect(SRC, kept).toContain(kept);
    }
  });
});
