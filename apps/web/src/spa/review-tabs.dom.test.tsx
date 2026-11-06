// @vitest-environment happy-dom
//
// R7TALK.1b — REQ-TALK-4 (R5 B17). The right panel's Findings/Claims tabs render the project's
// LATEST delivered review, whatever version is open — never "No findings yet." beside a
// delivered record. These legs pin BOTH states:
//
//   - a project with a review delivered on v1, VIEWED at v3 → "From Review of v1" + the v1
//     findings/claims rows, linked to that dossier;
//   - a project that never delivered → the empty states, and ONLY then.
//
// The data-source pin (twin level): `useShellChrome` maps `shell.ide.latestReview` through the
// ONE `reviewPanelBodies` composition — a regression to current-version-only findings (no
// `latestReview`) leaves the empty state, so the arm fails if the seam is bypassed.

import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { IdeShell, type IdeLabels } from "@rhema/ui";
import { reviewPanelBodies } from "../dossier-view.js";
import { COPY } from "../copy.js";
import type { LatestReviewDto } from "@rhema/api-client";

const LABELS: IdeLabels = {
  rail: { home: "Home", inbox: "Inbox", settings: "Settings", project: "Project" },
  margin: { heading: "Margin", ticksLabel: "ticks" },
  timeline: { heading: "Timeline", empty: "No runs", close: "Close" },
  panel: {
    heading: "Panel",
    tabs: { chat: "Chat", findings: "Findings", claims: "Claims", timeline: "Timeline", feed: "Live feed" },
    resize: "Resize",
    emptyChat: "No chat yet.",
    emptyFeed: "No run activity yet.",
    emptyFindings: "No findings yet.",
    emptyClaims: "No claims yet.",
    findingsTable: { finding: "Finding", severity: "Severity", kind: "Kind", status: "Status" },
    close: "Close panel",
  },
  statusBar: { view: "View", theme: "Theme", paper: "Paper", creditsFmt: "{n} credits", versionPrefix: "v", wordsFmt: "{n} words", readMinFmt: "{n} min" },
  viewMenu: {
    heading: "View", views: { write: "Write", read: "Read", focus: "Focus" },
    findingCards: "Finding cards", suggestionsInline: "Suggestions", authorship: "Authorship",
    advanced: "Advanced", fontSerif: "Serif", fontSans: "Sans", readerBigger: "Bigger", readerSmaller: "Smaller",
    panel: "Right panel",
  },
  themes: { dark: "Dark", light: "Light", auto: "Auto", paperLight: "Light paper", paperFollow: "Follow", paperDark: "Dark paper" },
  palette: { dialogLabel: "Palette", placeholder: "Search…", emptyLabel: "Nothing", sectionLabels: {} },
  cheatsheet: { heading: "Keyboard", closeLabel: "Close" },
  focusExit: "Exit focus",
};

/** The B6/B17 shape: review delivered on v1 (draftN 1) while the reader is looking at v3. */
const REVIEW_V1: LatestReviewDto = {
  runId: "run_v1",
  draftN: 1,
  deliveredAt: "2026-10-30T00:00:00Z",
  counts: { findings: 2, strengths: 1, claims: 1 },
  findings: [
    { id: "f1", ordinal: 0, severity: "major", kind: "argument", excerpt: "weak pillar", status: "accept", draftN: 1 },
    { id: "f2", ordinal: 1, severity: "minor", kind: "claim", excerpt: "unsupported stat", status: "open", draftN: 2 },
  ],
  claims: [
    { id: "c1", correspondenceId: "corr1", draftId: "d1", ordinal: 0, text: "the stat in §2", tier: 2, verdict: "unsupported", humanAdded: false },
  ],
  fetchLog: [],
  searchResultLog: [],
};

describe("REQ-TALK-4 — the panel tabs render the latest delivered review", () => {
  it("review delivered on v1, viewed at v3 → 'From Review of v1' + the v1 rows, dossier-linked", () => {
    const bodies = reviewPanelBodies(REVIEW_V1, "myproj");
    const html = renderToStaticMarkup(
      <IdeShell project={{ slug: "myproj", title: "P" }} labels={LABELS} {...bodies}>
        <p>v3 page</p>
      </IdeShell>,
    );
    // the source line names the review's version (never the open v3) + links the dossier
    expect(html).toContain("From Review of v1");
    expect(html).toContain('href="/p/myproj/review/run_v1"');
    // REQ-SYNC-2 counts ride the source line (strengths separate, never folded)
    expect(html).toContain("2 findings · 1 strengths · 1 claims");
    // the v1 finding rows + status; a row filed on v2 labels "on v2"
    expect(html).toContain("weak pillar");
    expect(html).toContain("on v2");
    // the claims tab renders the claim ledger — NOT "No claims yet."
    expect(html).toContain('data-review-panel="claims"');
    expect(html).toContain("the stat in §2");
    // never the empty states
    expect(html).not.toContain("No findings yet.");
    expect(html).not.toContain("No claims yet.");
  });

  it("never-delivered project → the empty states render (and only then)", () => {
    const html = renderToStaticMarkup(
      <IdeShell project={{ slug: "myproj", title: "P" }} labels={LABELS}>
        <p>page</p>
      </IdeShell>,
    );
    expect(html).toContain("No findings yet.");
    expect(html).toContain("No claims yet.");
    expect(html).not.toContain("From Review of v");
  });

  it("twin pin: no `latestReview` on the ide bag → no review body (the B17 regression guard)", () => {
    // `useShellChrome` derives the bodies ONLY from `shell.ide.latestReview` — a fixture without
    // it renders the empty state; a version-scoped `findings` echo cannot fake the tab's source.
    const html = renderToStaticMarkup(
      <IdeShell project={{ slug: "myproj", title: "P" }} labels={LABELS}
        findings={[{ id: "x", severity: "minor", kind: "claim", excerpt: "version-echo" }]}>
        <p>page</p>
      </IdeShell>,
    );
    expect(html).not.toContain("From Review of v");
    expect(html).not.toContain('data-review-panel=');
  });

  it("COPY — the source label comes from the copy table, never hard-coded", () => {
    expect(COPY.ide.panel.reviewFromFmt).toBe("From Review of v{n}");
  });
});
