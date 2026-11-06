import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { IdeShell, type IdeLabels } from "./ide-shell.js";
import {
  EmptyProject,
  EmptyFindings,
  ShellSkeleton,
  StreamingBlock,
  SyncPill2,
  RunFailed,
  ConflictBanner,
  OfflineQueued,
  InsufficientBalanceSwap,
  FrozenBanner,
  CancelRunModal,
} from "./ide-states.js";

// P1.01 — the IDE shell's deterministic half (REQ-IDE-8/10/41/42): the seven §5.1 regions and their
// ARIA landmarks render SSR-static (correct before the island loads), the View menu carries exactly the
// §5.1 contents with Source absent, and the state catalogue honors its two hard rules — no spinner
// inside the paper, and exactly ONE blocking modal in the product (Cancel-run; §5.9).

const LABELS: IdeLabels = {
  rail: { home: "Home", inbox: "Inbox", settings: "Settings", project: "Project" },
  files: { heading: "Files", empty: "No files yet.", close: "Close files", open: "Open files", sourceFile: "Source", resize: "Resize files" },
  margin: { heading: "Margin", ticksLabel: "Finding ticks" },
  timeline: { heading: "Timeline", empty: "No runs yet.", close: "Close timeline" },
  panel: {
    heading: "Panel",
    resize: "Resize the panel",
    tabs: { chat: "Chat", feed: "Live", findings: "Findings", claims: "Claims", timeline: "Timeline" },
    emptyChat: "No chat yet.",
    emptyFeed: "No live feed.",
    emptyFindings: "No review yet.",
    emptyClaims: "No claims yet.",
    findingsTable: { finding: "Finding", severity: "Severity", kind: "Kind", status: "Status" },
    close: "Close panel",
  },
  statusBar: {
    view: "View",
    theme: "Theme",
    paper: "Paper",
    creditsFmt: "{n} cr",
    versionPrefix: "",
    wordsFmt: "{n} words",
    readMinFmt: "{n} min",
  },
  viewMenu: {
    heading: "View",
    views: { write: "Write", read: "Read", focus: "Focus" },
    panel: "Right panel",
    findingCards: "Finding cards",
    suggestionsInline: "Inline suggestions",
    advanced: "Advanced",
    fontSerif: "Serif paper",
    fontSans: "Sans paper",
    readerBigger: "Bigger text",
    readerSmaller: "Smaller text",
  },
  themes: {
    dark: "Dark",
    light: "Light",
    auto: "Auto",
    paperLight: "Pinned light",
    paperFollow: "Follow app theme",
    paperDark: "Pinned dark",
  },
  palette: {
    dialogLabel: "Command palette",
    placeholder: "Type / for a command, or search…",
    emptyLabel: "Nothing matches.",
    sectionLabels: { run: "Run", goto: "Go to", recent: "Recent runs", threads: "Threads", settings: "Settings" },
  },
  cheatsheet: { heading: "Keyboard", closeLabel: "Close" },
};

const shell = (extra: Partial<Parameters<typeof IdeShell>[0]> = {}) =>
  renderToStaticMarkup(
    <IdeShell project={{ slug: "demo", title: "Demo" }} labels={LABELS} {...extra}>
      <p>Page content</p>
    </IdeShell>,
  );

describe("IdeShell — the §5.1/ADR-128 layout (REQ-IDE-8/42 + REQ-PANE-1/3)", () => {
  it("renders the regions as ARIA landmarks, SSR-correct with zero script — and the bottom Desk is gone", () => {
    const html = shell();
    for (const cls of ["ide-rail", "ide-files", "ide-page", "ide-margin", "ide-panel", "ide-statusbar"]) {
      expect(html).toContain(cls);
    }
    // B2/B16 — the desk drawer and its status-bar collision are retired with the region (the
    // `data-ide-desk-*` ALIASES stay emitted for the R7a legs — the .ide-desk element is gone).
    expect(html).not.toContain('class="ide-desk');
    expect(html).not.toContain('class="ide-timeline');
    expect(html).toContain('data-ide="1"');
    // landmarks: nav (rail), aside ×2 (files, panel), main (page), complementary (margin),
    // footer (status bar); the live regions the spec names.
    expect(html).toContain("<nav");
    expect(html).toContain("<main");
    expect(html).toContain("<footer");
    expect(html).toContain('role="complementary"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-live="polite"');
    // the panel's tab strip: Chat · Findings · Claims · Timeline · Live feed — in that order.
    const tabs = [...html.matchAll(/data-ide-panel-tab="(\w+)"/g)].map((m) => m[1]);
    expect(tabs).toEqual(["chat", "findings", "claims", "timeline", "feed"]);
    // UXC-26 — both panes' separators carry the ARIA contract (keyboard resize).
    for (const h of html.matchAll(/data-ide-handle="(\w+)"[^>]*/g)) {
      expect(h[0]).toContain('role="separator"');
      expect(h[0]).toContain("aria-valuenow");
      expect(h[0]).toContain("aria-valuemin");
      expect(h[0]).toContain("aria-valuemax");
    }
  });

  it("the View menu carries exactly the §5.1 contents — Write·Read·Focus, cards, inline, Advanced; Source absent", () => {
    const html = shell();
    const menu = html.slice(html.indexOf('data-ide-menu="view"'));
    for (const label of ["Write", "Read", "Focus", "Finding cards", "Inline suggestions", "Advanced"]) {
      expect(menu).toContain(label);
    }
    expect(menu).not.toContain("Source"); // view.source is Advanced-tier in Files, never a View-menu row
  });

  it("a live run auto-opens the panel on the Live feed tab; findings render the Margin + the SR table", () => {
    const html = shell({
      activeRun: { runId: "r_1", state: "running" },
      findings: [{ id: "f1", severity: "major", kind: "claim", excerpt: "A claim." }],
    });
    expect(html).toContain('data-panel="open"');
    expect(html).toContain('data-panel-tab="feed"');
    // R7a aliases mirror the canonical attrs (the legs resolve on both shapes).
    expect(html).toContain('data-desk="open"');
    expect(html).toContain('data-desk-tab="feed"');
    expect(html).toContain("<table"); // the Findings table — the designated screen-reader surface
    expect(html).toContain('id="finding-f1"');
  });

  it("theme/paper menus + pane attrs carry the stamped state the island mirrors", () => {
    const html = shell({ appTheme: "light", paperTheme: "follow", initialView: "focus" });
    expect(html).toContain('data-app-theme-pref="light"');
    expect(html).toContain('data-paper-theme="follow"');
    expect(html).toContain('data-view="focus"');
    expect(html).toContain('data-ide-menu="theme"');
  });
});

describe("IdeShell — REQ-PANE-3 the moved bodies + the demo gate", () => {
  it("the Desk's tab bodies moved unchanged into the panel (chat/findings/claims/timeline/feed)", () => {
    const chat = <div data-chat-composer>composer-markup</div>;
    const findingsBody = <div data-findings-desk>findings-desk-markup</div>;
    const html = shell({
      chatBody: chat,
      deskFindingsBody: findingsBody,
      timeline: [{ id: "t1", label: "Round 1", state: "done" }],
      feed: {
        runId: "r_9",
        eventsUrl: "/p/demo/runs/r_9/events",
        labelMaps: '{"t":{},"d":{}}',
        density: "summary" as const,
        rows: [],
        labels: { densityLabel: (d: string) => d, heading: "Live feed" },
      },
    });
    const bodyOf = (tab: string): string => {
      const i = html.indexOf(`data-panel-body="${tab}"`);
      expect(i).toBeGreaterThan(-1);
      const rest = html.slice(i);
      const end = rest.indexOf('data-panel-body="', 5);
      return end < 0 ? rest : rest.slice(0, end);
    };
    // the injected bodies render verbatim inside their panel tabs (the same elements the Desk
    // carried — the move is markup-preserving, 232/233 own the restyle).
    expect(bodyOf("chat")).toContain("composer-markup");
    expect(bodyOf("findings")).toContain("findings-desk-markup");
    expect(bodyOf("timeline")).toContain("ide-tl-body");
    expect(bodyOf("timeline")).toContain("Round 1");
    expect(bodyOf("feed")).toContain('data-feed-run="r_9"');
    expect(bodyOf("feed")).toContain('aria-live="polite"');
    expect(bodyOf("claims")).toContain("No claims yet.");
  });
  it("a demo boot hides the Chat trigger and stamps data-demo; the other four tabs stay", () => {
    const html = shell({ demo: true });
    expect(html).toContain('data-demo="1"');
    const chatTrigger = /data-ide-panel-tab="chat"[^>]*>/.exec(html)?.[0] ?? "";
    expect(chatTrigger).toContain("hidden");
    expect(chatTrigger).toContain("disabled");
    expect(chatTrigger).toContain('data-demo-gated="1"');
    for (const tab of ["findings", "claims", "timeline", "feed"]) {
      const t = new RegExp(`data-ide-panel-tab="${tab}"[^>]*>`).exec(html)?.[0] ?? "";
      expect(t, tab).not.toContain("hidden");
    }
  });
});

describe("ide-states — the §5.9 catalogue + the modal/spinner rules (REQ-IDE-41)", () => {
  const STATES: [string, string][] = [
    ["empty-project", renderToStaticMarkup(
      <EmptyProject
        labels={{ titlePlaceholder: "Title", cards: [{ title: "a", body: "b" }] }}
        paths={["/x"]}
      />,
    )],
    ["empty-findings", renderToStaticMarkup(<EmptyFindings label="No review yet." />)],
    ["loading", renderToStaticMarkup(<ShellSkeleton />)],
    ["run-failed", renderToStaticMarkup(
      <RunFailed
        labels={{ heading: "Run failed", refund: "refund", resume: "Resume", inboxNote: "inbox", phaseLabel: "phase" }}
        phase="verification"
        reason="cap"
        resumeHref="/x"
      />,
    )],
    ["conflict", renderToStaticMarkup(<ConflictBanner label="conflict" />)],
    ["insufficient-balance", renderToStaticMarkup(<InsufficientBalanceSwap label="top up" topUpHref="/x" />)],
    ["frozen", renderToStaticMarkup(<FrozenBanner label="locked" />)],
  ];

  it("every catalogued state has a designed rendering (data-ide-state, not an ad-hoc div)", () => {
    for (const [state, html] of STATES) {
      expect(html).toContain(`data-ide-state="${state}"`);
    }
    // the streaming + queued states render through their own components
    expect(renderToStaticMarkup(<StreamingBlock text="hi" isLast />)).toContain("ide-caret");
    expect(renderToStaticMarkup(<SyncPill2 label="x" state="syncing" />)).toContain('aria-live="polite"');
    expect(renderToStaticMarkup(<OfflineQueued label="queued" />)).toContain('data-state="queued"');
  });

  it("NO state component renders a blocking modal or a spinner — Cancel-run is the product's one modal", () => {
    for (const [, html] of STATES) {
      expect(html).not.toContain("aria-modal");
      expect(html).not.toContain('role="dialog"');
      expect(html).not.toContain('role="alertdialog"');
      expect(html).not.toMatch(/spin/i);
    }
    // skeleton rows are decorative — aria-hidden, never a spinner inside the paper
    expect(renderToStaticMarkup(<ShellSkeleton />)).toContain('aria-hidden="true"');
    // …and the ONE permitted modal is the Cancel-run confirmation, when open.
    const closed = renderToStaticMarkup(
      <CancelRunModal labels={{ heading: "h", body: "b", confirm: "c", keep: "k" }} open={false} />,
    );
    expect(closed).toBe("");
    const open = renderToStaticMarkup(
      <CancelRunModal labels={{ heading: "h", body: "b", confirm: "c", keep: "k" }} open />,
    );
    expect(open).toContain('role="alertdialog"');
    expect(open).toContain('aria-modal="true"');
  });
});
