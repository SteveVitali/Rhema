// §5.1 pane layout (REQ-IDE-8/9; R7PANE.1 = REQ-PANE-1/2, ADR-128) — the PURE function every
// breakpoint claim is tested against. The CSS (packages/tokens/ide-css.ts) renders the same
// rules; this module is the spec statement: given a viewport width and the pane state, which
// mode is each region in? It returns both the presentation MODES and the effective OPEN
// verdicts (the default-open rule and the 45-ch priority collapse live here, so unit tests
// pin the whole geometry). Drag math (`paneDrag`) enforces the Page-measure clamp the same
// way: a drag that would shrink the Page below 45 ch collapses the pane instead (REQ-IDE-9).
//
// R7b reference frame (ADR-128): AppShell sidebar | Files | Page + Margin | right panel.
// The bottom Desk retires — its bodies moved unchanged into the right panel's tabs
// (Chat · Findings · Claims · Timeline · Live feed, REQ-PANE-3).

import { LAYOUT } from "@rhema/tokens";

/** The §5.1 view modes — the View menu's radio group (Write / Read / Focus; Focus IS a view). */
export type ViewMode = "write" | "read" | "focus";

/** The right panel's tabs (REQ-PANE-3; ADR-128's REQ-IDE-8 item). The Desk's `feed` tab is
 *  "Live feed" here — the label is COPY's; the codec stores the id. */
export type PanelTab = "chat" | "findings" | "claims" | "timeline" | "feed";

export const PANEL_TABS: readonly PanelTab[] = ["chat", "findings", "claims", "timeline", "feed"];

/** The persisted pane state — per user + project, never in the URL (§5.1 pane rules).
 *  R7PANE.1 (codec v2): the Timeline pane and the bottom Desk collapse into ONE right panel;
 *  `panelOpen` is optional — absent means "derive the default" (open at ≥1440 when findings
 *  exist, closed otherwise), so the REQ-PANE-2 default survives a user never touching it. */
export interface PaneState {
  view: ViewMode;
  /** the Files pane — the strip is the default; 230_R7SHELL.2 removes the region. */
  filesOpen: boolean;
  /** files width when open (snap-constrained; LAYOUT.filesSnapPx). */
  filesWidth: number;
  /** `]` — the right panel's open intent at docked widths; undefined = derive from the table. */
  panelOpen?: boolean;
  /** the right panel's docked width (snap-constrained; LAYOUT.timelineSnapPx set is reused). */
  panelWidth: number;
  /** the right panel's selected tab. */
  panelTab: PanelTab;
  /** View-menu toggles. */
  findingCards: boolean;
  suggestionsInline: boolean;
  /** ⌘⇧M — the Advanced progressive-disclosure tier (§5.1). */
  advanced: boolean;
  /** Reader size stepper position: 0..readerSteps (each step ±2 px on the paper base). */
  readerStep: number;
}

/** What each region renders as at this viewport + state, plus the effective open verdicts. */
export interface PaneLayout {
  /** the viewport class the breakpoints resolved to */
  mode: "wide" | "narrow" | "single" | "phone";
  rail: "visible" | "hidden";
  /** the AppShell sidebar's breakpoint CEILING (REQ-PANE-2): the stamped advisory the shell's
   *  CSS enforces — "expanded" leaves the user's collapse pref in charge, "rail" forces the
   *  icon column, "drawer" moves it off-canvas (the REQ-SHELL-6 mechanism, extended to
   *  768–1023 in IDE scope). */
  sidebar: "expanded" | "rail" | "drawer";
  files: "open" | "strip" | "overlay" | "hidden";
  /** Page is always present — the reader surface (phone mode is reader-only). */
  page: "reader";
  margin: "cards" | "ticks" | "hidden";
  /** the right panel's presentation — "docked" is the in-flow column, overlay/sheet sit over
   *  the Page with a scrim, "hidden" is the non-hosted phone render. */
  panel: "docked" | "overlay" | "sheet" | "hidden";
  statusBar: "visible" | "hidden";
  /** the Page measure in ch the frame leaves — clamped to [45, 80]. */
  pageCh: number;
  /** effective open verdicts AFTER the default rule and the 45-ch priority collapse. */
  filesOpen: boolean;
  panelOpen: boolean;
}

export interface LayoutInput extends PaneState {
  /** whether the project currently has findings — no findings ⇒ Margin hidden, and the
   *  ≥1440 default-open rule does not apply. */
  hasFindings: boolean;
  /** mounted inside the AppShell (SPA chrome); the SSR phone reader passes false. */
  hosted?: boolean;
  /** the AppShell sidebar's CURRENT pref (expanded = true) — pageCh math reads the real
   *  occupancy, not the ceiling. Absent ⇒ the expanded ceiling (conservative). */
  sidebarOpen?: boolean;
}

/**
 * REQ-PANE-2's breakpoint table, exactly (R7PANE.1 — replaces 212's stopgap yield order):
 *  - <768: phone — the SSR reader hides every pane; the HOSTED narrow-desktop arm keeps the
 *    panel as a full-height sheet (the REQ-SHELL-6 content) and the sidebar as a drawer.
 *  - Focus view: everything but the Page + finding ticks hides.
 *  - 768–1023: sidebar drawer; Files drawer (overlay); the panel is a sheet on demand.
 *  - 1024–1279: sidebar rail; the panel is an overlay — scrim, Esc / outside-click, session
 *    state only (the controller passes the session intent as `panelOpen`).
 *  - 1280–1439: the panel docks; an open panel auto-collapses the sidebar to the rail.
 *  - ≥1440: the panel docks, open by default when findings exist.
 */
export function paneLayout(width: number, input: LayoutInput): PaneLayout {
  const mode =
    width < LAYOUT.bpPhonePx
      ? "phone"
      : width < LAYOUT.bpSingleColumnPx
        ? "single"
        : width < LAYOUT.bpNarrowPx
          ? "narrow"
          : "wide";
  const focus = input.view === "focus";
  const hosted = input.hosted === true;
  const sidebarOpen = input.sidebarOpen !== false; // absent ⇒ the expanded ceiling (conservative)

  const rail = focus || mode === "phone" ? "hidden" : "visible";
  const statusBar = rail;

  const panelMode: PaneLayout["panel"] =
    focus
      ? "hidden"
      : mode === "phone"
        ? hosted
          ? "sheet"
          : "hidden"
        : mode === "single"
          ? "sheet"
          : mode === "narrow"
            ? "overlay"
            : "docked";

  let margin: PaneLayout["margin"] =
    !input.hasFindings || mode === "phone"
      ? "hidden"
      : focus ||
          !input.findingCards ||
          width < LAYOUT.bpNarrowPx ||
          (input.filesOpen && width < LAYOUT.bpFilesTicksMarginPx)
        ? "ticks"
        : "cards";

  // Effective open verdicts. Overlay/sheet intent is session-scoped — the caller passes it
  // through `panelOpen`; the docked default is REQ-PANE-2's ≥1440-when-findings rule.
  let filesOpen = input.filesOpen;
  let panelOpen =
    panelMode === "hidden"
      ? false
      : panelMode === "docked"
        ? (input.panelOpen ?? (width >= LAYOUT.bpWidePx && input.hasFindings))
        : input.panelOpen === true;

  // The sidebar's breakpoint ceiling and the px it occupies this frame. "expanded" keeps the
  // user's collapse pref; "rail" forces the icon column; "drawer" goes off-canvas.
  const sidebarFor = (panelOpenEff: boolean): { mode: PaneLayout["sidebar"]; px: number } => {
    if (!hosted) {
      return {
        mode: width < LAYOUT.bpSingleColumnPx ? "drawer" : width < LAYOUT.bpNarrowPx ? "rail" : "expanded",
        px: 0,
      };
    }
    if (width < LAYOUT.bpSingleColumnPx) return { mode: "drawer", px: 0 };
    if (width < LAYOUT.bpNarrowPx) return { mode: "rail", px: LAYOUT.sidebarCollapsedPx };
    if (width < LAYOUT.bpWidePx && panelOpenEff) return { mode: "rail", px: LAYOUT.sidebarCollapsedPx };
    return {
      mode: "expanded",
      px: sidebarOpen ? LAYOUT.sidebarExpandedPx : LAYOUT.sidebarCollapsedPx,
    };
  };

  // Occupancy is what the panes actually take from the Page column — only in-flow regions
  // count (overlays, sheets and hidden panes float). The Files pane is in-flow at narrow+.
  const inFlow = mode === "narrow" || mode === "wide";
  const pageChFor = (fo: boolean, m: PaneLayout["margin"], po: boolean, sbPx: number): number => {
    const filesPx = fo ? (inFlow ? input.filesWidth : 0) : focus || mode === "phone" ? 0 : LAYOUT.filesStripPx;
    const marginPx = m === "cards" ? LAYOUT.marginPx : m === "ticks" ? 36 : 0;
    const panelPx = panelMode === "docked" && po ? input.panelWidth : 0;
    return Math.floor((width - sbPx - filesPx - marginPx - panelPx) / LAYOUT.chPx);
  };

  // The ADR-128 priority collapse — at widths where panes are in flow the frame must hold the
  // 45-ch floor: (1) Files → strip, (2) the right panel → closed, (3) the Margin → hidden.
  // Overlays/sheets consume no Page width, so the pass is a no-op at single/phone.
  if (inFlow && !focus) {
    for (;;) {
      const { px: sbPx } = sidebarFor(panelOpen);
      if (pageChFor(filesOpen, margin, panelOpen, sbPx) >= LAYOUT.pageMinCh) break;
      if (filesOpen) filesOpen = false;
      else if (panelOpen) panelOpen = false;
      else if (margin !== "hidden") margin = "hidden";
      else break;
    }
  }

  const { mode: sidebar, px: sidebarPx } = sidebarFor(panelOpen);
  // `files` is the presentation MODE token (what the pane would do at this width) — "overlay"
  // below 1024 open or closed, "strip"/"open" elsewhere; the open VERDICT is `filesOpen`.
  const files: PaneLayout["files"] =
    focus || mode === "phone" ? "hidden" : mode === "single" ? "overlay" : filesOpen ? "open" : "strip";
  const pageCh = Math.max(0, Math.min(LAYOUT.pageMaxCh, pageChFor(filesOpen, margin, panelOpen, sidebarPx)));

  return {
    mode,
    rail,
    sidebar,
    files,
    page: "reader",
    margin,
    panel: panelMode,
    statusBar,
    pageCh,
    filesOpen,
    panelOpen,
  };
}

/** Round to the nearest snap point within `threshold` px; otherwise keep the raw value. */
export function snapTo(snaps: readonly number[], px: number, threshold = 24): number {
  let best = px;
  let bestD = threshold + 1;
  for (const s of snaps) {
    const d = Math.abs(px - s);
    if (d <= threshold && d < bestD) {
      best = s;
      bestD = d;
    }
  }
  return best;
}

/**
 * A drag on Files or the right panel (REQ-IDE-9): a width that would push the Page below
 * the 45-ch clamp collapses the pane instead of violating the measure; below the minimum
 * drag, the pane collapses (Files → the 36-px strip, the panel → closed).
 */
export function paneDrag(
  state: PaneState,
  pane: "files" | "panel",
  px: number,
  viewportWidth: number,
): PaneState {
  if (pane === "files") {
    if (px < 160) return { ...state, filesOpen: false };
    const w = snapTo(LAYOUT.filesSnapPx, px);
    const next = { ...state, filesOpen: true, filesWidth: w };
    // Would this violate the Page's 45-ch floor? Then the pane collapses instead — the check
    // asks paneLayout() whether the DRAGGED pane survives the priority collapse in the hosted
    // frame (the only drag caller) at the expanded-sidebar occupancy.
    const l = paneLayout(viewportWidth, { ...next, hasFindings: true, hosted: true, sidebarOpen: true });
    return l.filesOpen ? next : { ...state, filesOpen: false };
  }
  // panel — below the minimum the panel closes.
  if (px < 160) return { ...state, panelOpen: false };
  const w = snapTo(LAYOUT.timelineSnapPx, px);
  const next = { ...state, panelOpen: true, panelWidth: w };
  const l = paneLayout(viewportWidth, { ...next, hasFindings: true, hosted: true, sidebarOpen: true });
  return l.panelOpen ? next : { ...state, panelOpen: false };
}
