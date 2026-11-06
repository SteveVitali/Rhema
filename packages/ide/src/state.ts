// Pane-state persistence (§5.1 pane rules): arrangement persists per user + project in localStorage —
// NEVER in the URL. The ONLY URL-carried pane fact is the shareable `?focus=1` deep link, which seeds
// the view and is then stripped from the address (the island does the strip; the flag is not a URL mode).
// The codec is versioned and total: a malformed/partial stored blob falls back per-key to DEFAULTS.
// R7FIX.1 (REQ-WRITE-4): `view:"focus"` is SESSION-scoped — it is never restored from storage and
// never written back (a stored blob's `focus` coerces to `write`; serialize emits `write` for it).
//
// R7PANE.1 (REQ-PANE-3) — codec v2. The v1 fields `deskOpen`/`deskTab`/`deskHeight` and
// `timelineOpen`/`timelineWidth` collapse into the right panel's `panelOpen`/`panelTab`/
// `panelWidth`. The v1→v2 migration is TOTAL: an open Desk wins the tab (its tab was the
// visible surface); a closed Desk + open Timeline maps to the Timeline tab; a closed Desk +
// closed Timeline maps to a closed panel on the Desk's last tab; `panelWidth` inherits the
// Timeline width. Malformed input falls back per key, exactly like v1.

import type { PanelTab, PaneState, ViewMode } from "./layout.js";
import { PANEL_TABS } from "./layout.js";

export const PANE_STORAGE_VERSION = 2;
/** localStorage key — per user AND project (§5.1 "persists per user/project"). */
export function paneStorageKey(userId: string, projectId: string): string {
  return `rhema:panes:v${PANE_STORAGE_VERSION}:${userId}:${projectId}`;
}

export const DEFAULT_PANE_STATE: PaneState = {
  view: "write",
  // R7SHELL.2 — the Files pane is deleted; stored `filesOpen`/`filesWidth` keys are ignored
  // on read (the codec is total over KNOWN keys — removed keys fall back to "absent").
  // panelOpen deliberately ABSENT — the ≥1440-when-findings default lives in paneLayout()
  // (REQ-PANE-2), so the codec must preserve "never touched" as "undefined".
  panelWidth: 320,
  panelTab: "chat",
  findingCards: true,
  suggestionsInline: true,
  advanced: false,
  readerStep: 0,
};

const VIEWS: readonly ViewMode[] = ["write", "read", "focus"];
const V1_DESK_TABS: readonly string[] = ["chat", "feed", "findings", "claims"];

function bool(v: unknown, d: boolean): boolean {
  return typeof v === "boolean" ? v : d;
}
function num(v: unknown, d: number, lo: number, hi: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : d;
}
function oneOf<T extends string>(v: unknown, allowed: readonly T[], d: T): T {
  return typeof v === "string" && (allowed as readonly string[]).includes(v) ? (v as T) : d;
}

interface ParsedBase {
  view: ViewMode;
  findingCards: boolean;
  suggestionsInline: boolean;
  advanced: boolean;
  readerStep: number;
}

function parseBase(o: Record<string, unknown>, d: PaneState): ParsedBase {
  const view = oneOf(o["view"], VIEWS, d.view);
  return {
    // REQ-WRITE-4 — focus never survives a reload (legacy blobs may carry it; coerce, don't drop
    // the rest of the arrangement). R7SHELL.2 — `filesOpen`/`filesWidth` are retired keys: the
    // tolerant read simply never consults them (a pre-change v2 blob yields the defaults).
    view: view === "focus" ? "write" : view,
    findingCards: bool(o["findingCards"], d.findingCards),
    suggestionsInline: bool(o["suggestionsInline"], d.suggestionsInline),
    advanced: bool(o["advanced"], d.advanced),
    readerStep: num(o["readerStep"], d.readerStep, 0, 3),
  };
}

/** The total v1→v2 migration: every key of the result is derived — an unmapped v1 key never
 *  leaks through, and a missing/garbage v1 key takes its v2 default. */
function migrateV1(o: Record<string, unknown>): PaneState {
  const d = DEFAULT_PANE_STATE;
  const base = parseBase(o, d);
  const deskOpen = o["deskOpen"] === true;
  const timelineOpen = o["timelineOpen"] === true;
  // An open Desk was the visible surface — its tab wins. Otherwise an open Timeline maps to
  // the Timeline tab; both closed keeps the Desk's last tab (a sensible reopen position).
  const panelTab: PanelTab = deskOpen
    ? oneOf(o["deskTab"], V1_DESK_TABS, "chat") as PanelTab
    : timelineOpen
      ? "timeline"
      : oneOf(o["deskTab"], V1_DESK_TABS, "chat") as PanelTab;
  return {
    ...base,
    panelOpen: deskOpen || timelineOpen ? true : false,
    panelWidth: num(o["timelineWidth"], d.panelWidth, 160, 480),
    panelTab,
  };
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
  if (!o || typeof o !== "object") return { ...DEFAULT_PANE_STATE };
  if (o["v"] === 1) return migrateV1(o);
  if (o["v"] !== PANE_STORAGE_VERSION) return { ...DEFAULT_PANE_STATE };
  const d = DEFAULT_PANE_STATE;
  return {
    ...parseBase(o, d),
    // `panelOpen` keeps three states: absent ⇒ derive the REQ-PANE-2 default in paneLayout();
    // a concrete boolean is the user's explicit intent.
    ...(typeof o["panelOpen"] === "boolean" ? { panelOpen: o["panelOpen"] } : {}),
    panelWidth: num(o["panelWidth"], d.panelWidth, 160, 480),
    panelTab: oneOf(o["panelTab"], PANEL_TABS, d.panelTab),
  };
}

export function serializePaneState(state: PaneState): string {
  // REQ-WRITE-4 — the session-scoped focus view is never written to pane storage; the absent
  // `panelOpen` stays absent (the default rule, not a stored value).
  return JSON.stringify({
    v: PANE_STORAGE_VERSION,
    ...state,
    ...(state.panelOpen === undefined ? {} : { panelOpen: state.panelOpen }),
    view: state.view === "focus" ? "write" : state.view,
  });
}
