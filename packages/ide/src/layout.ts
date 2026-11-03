// §5.1 pane layout (REQ-IDE-8/9) — the PURE function every breakpoint claim is tested against. The CSS
// (packages/tokens/ide-css.ts) renders the same rules; this module is the spec statement: given a viewport
// width and the pane state, which mode is each of the seven regions in? Drag math (`paneDrag`) enforces
// the Page-measure clamp: a drag that would shrink the Page below 45 ch collapses the adjacent pane
// instead (REQ-IDE-9).
//
// Reference frame (§5.1): Rail 56 + Files 240 open / 36 collapsed + Page 660 + Margin 280 + Timeline 320.

import { LAYOUT } from "@rhema/tokens";

/** The §5.1 view modes — the View menu's radio group (Write / Read / Focus; Focus IS a view). */
export type ViewMode = "write" | "read" | "focus";

/** Desk tabs (§5.1 Desk region). */
export type DeskTab = "chat" | "feed" | "findings" | "claims";

/** The persisted pane state — per user + project, never in the URL (§5.1 pane rules). */
export interface PaneState {
  view: ViewMode;
  /** ⌘1 — false renders the 36-px icon strip. */
  filesOpen: boolean;
  /** files width when open (snap-constrained; LAYOUT.filesSnapPx). */
  filesWidth: number;
  /** ⌘2 — the Timeline yields to overlay/sheet/hidden per viewport; this is the open intent. */
  timelineOpen: boolean;
  timelineWidth: number;
  /** ⌘J — the bottom drawer. */
  deskOpen: boolean;
  deskHeight: number;
  deskTab: DeskTab;
  /** View-menu toggles. */
  findingCards: boolean;
  suggestionsInline: boolean;
  /** ⌘⇧M — the Advanced progressive-disclosure tier (§5.1). */
  advanced: boolean;
  /** Reader size stepper position: 0..readerSteps (each step ±2 px on the paper base). */
  readerStep: number;
}

/** What each of the seven regions renders as at this viewport + state. */
export interface PaneLayout {
  /** the viewport class the breakpoints resolved to */
  mode: "wide" | "narrow" | "single" | "phone";
  rail: "visible" | "hidden";
  files: "open" | "strip" | "overlay" | "hidden";
  /** Page is always present — the reader surface (phone mode is reader-only). */
  page: "reader";
  margin: "cards" | "ticks" | "hidden";
  timeline: "pane" | "overlay" | "sheet" | "hidden";
  desk: "open" | "closed" | "hidden";
  statusBar: "visible" | "hidden";
  /** the Page measure in ch the frame leaves — clamped to [45, 80]. */
  pageCh: number;
  /** the pane state carries `hasFindings` at render time (not persisted) — folded in via the input. */
}

export interface LayoutInput extends PaneState {
  /** whether the project currently has findings — no findings ⇒ Margin hidden, not ticks (§5.1). */
  hasFindings: boolean;
}

/**
 * §5.1's yield order, exactly (REQ-PANE-0 stopgap, R7FIX.1):
 *  - <768: phone — reader-only Page; every other region hides (the phone input set lands in P1.19).
 *  - Focus view: everything but the Page + finding ticks hides.
 *  - <1024: single-column — open Files becomes an overlay drawer; an open Timeline becomes a sheet.
 *  - <1280: Margin → ticks; Timeline → overlay.
 *  - <1600 with Files open: Margin → ticks. The Timeline stays DOCKED at ≥1280 — the Page column
 *    reflows under it instead of sliding beneath an overlay (B1). The Timeline overlay arms only
 *    at <1280; the R7PANE.1 SplitPane engine owns the full breakpoint table.
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

  const rail = focus || mode === "phone" ? "hidden" : "visible";
  const statusBar = rail;
  const files =
    focus || mode === "phone"
      ? "hidden"
      : !input.filesOpen
        ? "strip"
        : mode === "single"
          ? "overlay"
          : "open";

  const margin =
    !input.hasFindings || mode === "phone"
      ? "hidden"
      : focus ||
          !input.findingCards ||
          width < LAYOUT.bpNarrowPx ||
          (input.filesOpen && width < LAYOUT.bpFilesTicksMarginPx)
        ? "ticks"
        : "cards";

  const timeline =
    focus || !input.timelineOpen || mode === "phone"
      ? "hidden"
      : mode === "single"
        ? "sheet"
        : mode === "narrow"
          ? "overlay"
          : "pane";

  const desk = focus || mode === "phone" ? "hidden" : input.deskOpen ? "open" : "closed";

  // The Page measure: viewport minus whatever the panes actually occupy, in ch.
  const filesPx = files === "open" ? input.filesWidth : files === "strip" ? LAYOUT.filesStripPx : 0;
  const marginPx = margin === "cards" ? LAYOUT.marginPx : margin === "ticks" ? 36 : 0;
  const timelinePx = timeline === "pane" ? input.timelineWidth : 0;
  const railPx = rail === "visible" ? LAYOUT.railPx : 0;
  const availPx = width - railPx - filesPx - marginPx - timelinePx;
  const rawCh = Math.floor(availPx / LAYOUT.chPx);
  const pageCh = Math.min(LAYOUT.pageMaxCh, Math.max(0, rawCh));

  return { mode, rail, files, page: "reader", margin, timeline, desk, statusBar, pageCh };
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
 * A drag on Files or Timeline (REQ-IDE-9): a width that would push the Page below the 45-ch clamp
 * collapses the adjacent pane instead of violating the measure; below the minimum drag, the pane
 * collapses (Files → the 36-px strip, Timeline → closed). Desk drags resize the drawer height.
 */
export function paneDrag(
  state: PaneState,
  pane: "files" | "timeline" | "desk",
  px: number,
  viewportWidth: number,
): PaneState {
  if (pane === "files") {
    if (px < 160) return { ...state, filesOpen: false };
    const w = snapTo(LAYOUT.filesSnapPx, px);
    const next = { ...state, filesOpen: true, filesWidth: w };
    // Would this violate the Page's 45-ch floor? Then the pane collapses instead.
    const l = paneLayout(viewportWidth, { ...next, hasFindings: true });
    if (l.pageCh < LAYOUT.pageMinCh) return { ...state, filesOpen: false };
    return next;
  }
  if (pane === "timeline") {
    if (px < 160) return { ...state, timelineOpen: false };
    const w = snapTo(LAYOUT.timelineSnapPx, px);
    const next = { ...state, timelineOpen: true, timelineWidth: w };
    const l = paneLayout(viewportWidth, { ...next, hasFindings: true });
    if (l.pageCh < LAYOUT.pageMinCh) return { ...state, timelineOpen: false };
    return next;
  }
  // desk — height drag; below the minimum the drawer closes.
  if (px < 80) return { ...state, deskOpen: false };
  return { ...state, deskOpen: true, deskHeight: Math.min(480, Math.max(120, px)) };
}
