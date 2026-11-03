// Pane-state persistence (§5.1 pane rules): arrangement persists per user + project in localStorage —
// NEVER in the URL. The ONLY URL-carried pane fact is the shareable `?focus=1` deep link, which seeds
// the view and is then stripped from the address (the island does the strip; the flag is not a URL mode).
// The codec is versioned and total: a malformed/partial stored blob falls back per-key to DEFAULTS.
// R7FIX.1 (REQ-WRITE-4): `view:"focus"` is SESSION-scoped — it is never restored from storage and
// never written back (a stored blob's `focus` coerces to `write`; serialize emits `write` for it).

import type { DeskTab, PaneState, ViewMode } from "./layout.js";

export const PANE_STORAGE_VERSION = 1;
/** localStorage key — per user AND project (§5.1 "persists per user/project"). */
export function paneStorageKey(userId: string, projectId: string): string {
  return `rhema:panes:v${PANE_STORAGE_VERSION}:${userId}:${projectId}`;
}

export const DEFAULT_PANE_STATE: PaneState = {
  view: "write",
  filesOpen: false, // the 36-px strip is the default (§5.1)
  filesWidth: 240,
  timelineOpen: true,
  timelineWidth: 320,
  deskOpen: false,
  deskHeight: 280,
  deskTab: "chat",
  findingCards: true,
  suggestionsInline: true,
  advanced: false,
  readerStep: 0,
};

const VIEWS: readonly ViewMode[] = ["write", "read", "focus"];
const DESK_TABS: readonly DeskTab[] = ["chat", "feed", "findings", "claims"];

function bool(v: unknown, d: boolean): boolean {
  return typeof v === "boolean" ? v : d;
}
function num(v: unknown, d: number, lo: number, hi: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], d: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : d;
}

/** Parse a stored blob — never throws; wrong-version/unshaped payloads yield the defaults. */
export function parsePaneState(raw: string | null | undefined): PaneState {
  if (!raw) return { ...DEFAULT_PANE_STATE };
  let o: Record<string, unknown>;
  try {
    o = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return { ...DEFAULT_PANE_STATE };
  }
  if (!o || typeof o !== "object" || o["v"] !== PANE_STORAGE_VERSION) return { ...DEFAULT_PANE_STATE };
  const d = DEFAULT_PANE_STATE;
  const view = oneOf(o["view"], VIEWS, d.view);
  return {
    // REQ-WRITE-4 — focus never survives a reload (legacy blobs may carry it; coerce, don't drop
    // the rest of the arrangement).
    view: view === "focus" ? "write" : view,
    filesOpen: bool(o["filesOpen"], d.filesOpen),
    filesWidth: num(o["filesWidth"], d.filesWidth, 160, 480),
    timelineOpen: bool(o["timelineOpen"], d.timelineOpen),
    timelineWidth: num(o["timelineWidth"], d.timelineWidth, 200, 480),
    deskOpen: bool(o["deskOpen"], d.deskOpen),
    deskHeight: num(o["deskHeight"], d.deskHeight, 120, 480),
    deskTab: oneOf(o["deskTab"], DESK_TABS, d.deskTab),
    findingCards: bool(o["findingCards"], d.findingCards),
    suggestionsInline: bool(o["suggestionsInline"], d.suggestionsInline),
    advanced: bool(o["advanced"], d.advanced),
    readerStep: num(o["readerStep"], d.readerStep, 0, 3),
  };
}

export function serializePaneState(state: PaneState): string {
  // REQ-WRITE-4 — the session-scoped focus view is never written to pane storage.
  return JSON.stringify({
    v: PANE_STORAGE_VERSION,
    ...state,
    view: state.view === "focus" ? "write" : state.view,
  });
}
