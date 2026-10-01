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
  files: { heading: "Files", empty: "No files yet.", close: "Close files", open: "Open files", sourceFile: "Source" },
  margin: { heading: "Margin", ticksLabel: "Finding ticks" },
  timeline: { heading: "Timeline", empty: "No runs yet.", close: "Close timeline" },
  desk: {
    heading: "Desk",
    tabs: { chat: "Chat", feed: "Live", findings: "Findings", claims: "Claims" },
    emptyChat: "No chat yet.",
    emptyFeed: "No live feed.",
    emptyFindings: "No review yet.",
    emptyClaims: "No claims yet.",
    findingsTable: { finding: "Finding", severity: "Severity", kind: "Kind", status: "Status" },
    close: "Close desk",
  },
  statusBar: {
    view: "View",
    theme: "Theme",
    paper: "Paper",
    synced: "Synced",
    syncing: "Syncing…",
    offline: "Offline",
    creditsFmt: "{n} cr",
    versionPrefix: "",
    wordsFmt: "{n} words",
    readMinFmt: "{n} min",
  },
  viewMenu: {
    heading: "View",
    views: { write: "Write", read: "Read", focus: "Focus" },
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

describe("IdeShell — the §5.1 seven-region layout (REQ-IDE-8/42)", () => {
  it("renders all seven regions as ARIA landmarks, SSR-correct with zero script", () => {
    const html = shell();
    for (const cls of ["ide-rail", "ide-files", "ide-page", "ide-margin", "ide-timeline", "ide-desk", "ide-statusbar"]) {
      expect(html).toContain(cls);
    }
    expect(html).toContain('data-ide="1"');
    // landmarks: nav (rail), aside ×2 (files, timeline), main (page), complementary (margin),
    // section (desk), footer (status bar); the live regions the spec names.
    expect(html).toContain("<nav");
    expect(html).toContain("<main");
    expect(html).toContain("<footer");
    expect(html).toContain('role="complementary"');
    expect(html).toContain('role="tablist"');
    expect(html).toContain('aria-live="polite"');
  });

  it("the View menu carries exactly the §5.1 contents — Write·Read·Focus, cards, inline, Advanced; Source absent", () => {
    const html = shell();
    const menu = html.slice(html.indexOf('data-ide-menu="view"'));
    for (const label of ["Write", "Read", "Focus", "Finding cards", "Inline suggestions", "Advanced"]) {
      expect(menu).toContain(label);
    }
    expect(menu).not.toContain("Source"); // view.source is Advanced-tier in Files, never a View-menu row
  });

  it("a live run auto-opens the Desk on the feed tab; findings render the Margin + the SR table", () => {
    const html = shell({
      activeRun: { runId: "r_1", state: "running" },
      findings: [{ id: "f1", severity: "major", kind: "claim", excerpt: "A claim." }],
    });
    expect(html).toContain('data-desk="open"');
    expect(html).toContain('data-desk-tab="feed"');
    expect(html).toContain("<table"); // the Desk findings table — the designated screen-reader surface
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
