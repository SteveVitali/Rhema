// The §5.12 keyboard map — a PURE dispatcher: a key event + the focus zone → an IdeAction the client
// island executes. Findings chords (J/K/P/A D R F E/Enter/Esc/⌥J/⌥K) are scoped to Margin /
// Findings-list focus ONLY — inert while the caret is in the Page (§5.12's scoped-chords row; the
// chord BEHAVIOURS land with P1.07's findings surface, the dispatcher + focus scoping land here).
//
// REQ-KEYS-1 (226_R7SHELL.1a; RV-14/33) — the map is now DATA: `IDE_KEYMAP` is the committed
// binding table every chord (and every shortcut a tooltip or the `?` sheet shows) derives from,
// and `reserved-chords.json`'s checker pins it against the browser-safe rules. The sidebar/panel
// chords land here: `[` toggles the AppShell sidebar, `]` toggles the right-side pane (today's
// Timeline; 229 retargets the right panel). ⌘1/⌘2/⌘J and `[`/`]`-as-version-step are retired —
// version prev/next is the PROVISIONAL `⌥[`/`⌥]` pair until 239 writes the full table.

/** Where keyboard focus sits. `page` = caret in the editor surface; `input` = a text field (palette,
 *  sheet, sheet fields); `margin`/`findings` = the Findings list focus ring; `none` = chrome. */
export type FocusZone = "page" | "margin" | "findings" | "input" | "none";

export interface KeyChord {
  readonly key: string; // KeyboardEvent.key, case-normalized by the caller contract below
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

export type IdeAction =
  | { readonly kind: "palette" }
  | { readonly kind: "sidebar" }
  | { readonly kind: "pane"; readonly pane: "panel" }
  | { readonly kind: "view-menu" }
  | { readonly kind: "focus-mode" }
  | { readonly kind: "paper-theme" }
  | { readonly kind: "triage" }
  | { readonly kind: "restore-point" }
  | { readonly kind: "run-next" }
  | { readonly kind: "sheet"; readonly workflow: "draft" | "review" | "revise" }
  | { readonly kind: "goto-approval" }
  | { readonly kind: "inbox" }
  | { readonly kind: "settings" }
  | { readonly kind: "cheatsheet" }
  | { readonly kind: "finding-next" }
  | { readonly kind: "finding-prev" }
  | { readonly kind: "finding-apply" }
  | { readonly kind: "finding-disposition"; readonly disposition: "accept" | "adapt" | "rebut" | "defer" | "escalate" }
  | { readonly kind: "finding-open" }
  | { readonly kind: "finding-escape" }
  | { readonly kind: "finding-anchor-next" }
  | { readonly kind: "finding-anchor-prev" }
  | { readonly kind: "compare-previous" }
  | { readonly kind: "version-prev" }
  | { readonly kind: "version-next" }
  | { readonly kind: "undo" }
  | { readonly kind: "redo" };

const FINDINGS_DISPOSITIONS: Readonly<Record<string, "accept" | "adapt" | "rebut" | "defer" | "escalate">> = {
  a: "accept",
  d: "adapt",
  r: "rebut",
  f: "defer",
  e: "escalate",
};

const FINDINGS_ZONES: readonly FocusZone[] = ["margin", "findings"];

// ---------------------------------------------------------------------------
// REQ-KEYS-1 — the committed binding table. `chord` is canonical (`mod+shift+t`, `alt+[`, or a
// bare key) — the reserved-chords checker reads it verbatim. `actionKind` is the IdeAction
// discriminator (`sheet:<workflow>` carries the payload). `scope:"findings"` marks the
// Margin/list-scoped rows (inert in Page/input focus). Descriptions are the `?` sheet's text;
// `keys` is the display glyph a tooltip or the sheet shows.
// ---------------------------------------------------------------------------

export interface IdeBinding {
  /** canonical chord for the checker — `mod[+shift]+<key>` / `alt[+shift]+<key>` / bare key. */
  readonly chord: string;
  /** display form for the cheat sheet and tooltips (⌘⇧T, ⌥[, g p). */
  readonly keys: string;
  /** the IdeAction discriminator the chord dispatches (`sheet:draft` names the payload). */
  readonly actionKind: string;
  /** the `?` sheet row text. */
  readonly action: string;
  /** findings-scoped chords dispatch only in the Margin/Findings list. */
  readonly scope?: "findings";
}

export const IDE_KEYMAP: readonly IdeBinding[] = [
  { chord: "mod+k", keys: "⌘K", actionKind: "palette", action: "Command palette" },
  { chord: "/", keys: "/", actionKind: "palette", action: "Command palette (command mode)" },
  { chord: "[", keys: "[", actionKind: "sidebar", action: "Toggle the sidebar" },
  { chord: "]", keys: "]", actionKind: "pane:panel", action: "Toggle the right-side pane" },
  { chord: "mod+shift+m", keys: "⌘⇧M", actionKind: "view-menu", action: "View menu" },
  { chord: "mod+shift+f", keys: "⌘⇧F", actionKind: "focus-mode", action: "Focus view" },
  { chord: "mod+shift+l", keys: "⌘⇧L", actionKind: "paper-theme", action: "Paper theme" },
  { chord: "mod+shift+t", keys: "⌘⇧T", actionKind: "triage", action: "Triage" },
  { chord: "mod+s", keys: "⌘S", actionKind: "restore-point", action: "Mark a named restore point" },
  { chord: "mod+shift+r", keys: "⌘⇧R", actionKind: "run-next", action: "Run the next step" },
  { chord: "mod+shift+d", keys: "⌘⇧D", actionKind: "sheet:draft", action: "Draft sheet" },
  { chord: "mod+shift+e", keys: "⌘⇧E", actionKind: "sheet:review", action: "Review sheet" },
  { chord: "mod+shift+v", keys: "⌘⇧V", actionKind: "sheet:revise", action: "Revise sheet" },
  { chord: "mod+g", keys: "⌘G", actionKind: "goto-approval", action: "Oldest open approval" },
  { chord: "mod+i", keys: "⌘I", actionKind: "inbox", action: "Inbox" },
  { chord: "mod+,", keys: "⌘,", actionKind: "settings", action: "Project settings" },
  { chord: "mod+shift+c", keys: "⌘⇧C", actionKind: "compare-previous", action: "Compare with previous" },
  // REQ-KEYS-1 — the PROVISIONAL version-step pair (off `[`/`]`, which now own sidebar/pane).
  // ⌥-bracket is capturable and outside Rule 2's conventional set; 239 finalizes the table.
  { chord: "alt+[", keys: "⌥[", actionKind: "version-prev", action: "Previous version" },
  { chord: "alt+]", keys: "⌥]", actionKind: "version-next", action: "Next version" },
  { chord: "mod+z", keys: "⌘Z", actionKind: "undo", action: "Undo" },
  { chord: "mod+shift+z", keys: "⌘⇧Z", actionKind: "redo", action: "Redo" },
  { chord: "?", keys: "?", actionKind: "cheatsheet", action: "This cheat sheet" },
  { chord: "j", keys: "J", actionKind: "finding-next", action: "Next finding — Findings list only", scope: "findings" },
  { chord: "k", keys: "K", actionKind: "finding-prev", action: "Previous finding — Findings list only", scope: "findings" },
  { chord: "p", keys: "P", actionKind: "finding-apply", action: "Apply finding — Findings list only", scope: "findings" },
  { chord: "a", keys: "A", actionKind: "finding-disposition:accept", action: "Accept — Findings list only", scope: "findings" },
  { chord: "d", keys: "D", actionKind: "finding-disposition:adapt", action: "Adapt — Findings list only", scope: "findings" },
  { chord: "r", keys: "R", actionKind: "finding-disposition:rebut", action: "Rebut — Findings list only", scope: "findings" },
  { chord: "f", keys: "F", actionKind: "finding-disposition:defer", action: "Defer — Findings list only", scope: "findings" },
  { chord: "e", keys: "E", actionKind: "finding-disposition:escalate", action: "Escalate — Findings list only", scope: "findings" },
  { chord: "Enter", keys: "Enter", actionKind: "finding-open", action: "Open finding — Findings list only", scope: "findings" },
  { chord: "Escape", keys: "Esc", actionKind: "finding-escape", action: "Clear finding focus — Findings list only", scope: "findings" },
  { chord: "alt+j", keys: "⌥J", actionKind: "finding-anchor-next", action: "Next blocking/major — Findings list only", scope: "findings" },
  { chord: "alt+k", keys: "⌥K", actionKind: "finding-anchor-prev", action: "Previous blocking/major — Findings list only", scope: "findings" },
];

/** The display glyph a tooltip shows for one action kind (generated from the keymap — REQ-KEYS-2 partial). */
export function shortcutFor(actionKind: string): string | null {
  return IDE_KEYMAP.find((b) => b.actionKind === actionKind)?.keys ?? null;
}

/** The `?` sheet's rows — GENERATED from IDE_KEYMAP so the card can never drift from the map. */
export const CHEAT_SHEET: readonly { readonly keys: string; readonly action: string }[] =
  IDE_KEYMAP.map((b) => ({ keys: b.keys, action: b.action }));

/**
 * Dispatch one key event to an IdeAction (or null = let the browser handle it). Callers normalize
 * `key` to lowercase for letters (`e.key.length === 1 ? e.key.toLowerCase() : e.key`) before calling —
 * the map is written against that contract. `mod` = ⌘ on mac / Ctrl elsewhere (the island passes
 * metaKey||ctrlKey; both fields stay on the chord for tests that distinguish them).
 *
 * Rules (§5.12):
 *  - `input` focus: bare keys are inert (typing); ONLY the mod chords that make sense in a field
 *    dispatch (⌘K palette — the rest fall through so the field keeps its own editing).
 *  - `page` focus: the findings chords are INERT — a bare j/k/a/d… while writing must never move a
 *    finding cursor.
 *  - bare findings chords dispatch only in `margin`/`findings` focus.
 */
export function dispatchIdeKey(ev: KeyChord, zone: FocusZone): IdeAction | null {
  const mod = ev.metaKey || ev.ctrlKey;
  const k = ev.key;

  // ---- mod chords (global, with input focus narrowing) ------------------------------------------
  if (mod) {
    if (zone === "input") {
      // inside a field only the overlay chords fire; everything else belongs to the field.
      if (k === "k" && !ev.shiftKey) return { kind: "palette" };
      return null;
    }
    if (ev.shiftKey) {
      switch (k) {
        case "m": return { kind: "view-menu" };
        case "f": return { kind: "focus-mode" };
        case "l": return { kind: "paper-theme" };
        case "t": return { kind: "triage" };
        case "r": return { kind: "run-next" };
        case "d": return { kind: "sheet", workflow: "draft" };
        case "e": return { kind: "sheet", workflow: "review" };
        case "v": return { kind: "sheet", workflow: "revise" };
        case "c": return { kind: "compare-previous" };
        case "z": return { kind: "redo" };
        default: return null;
      }
    }
    switch (k) {
      case "k": return { kind: "palette" };
      // REQ-KEYS-1 — ⌘1/⌘2/⌘J are retired (Rule 2's number-key row). The pane chords are
      // `[` (sidebar) and `]` (Timeline today; the right panel at 229).
      case "s": return { kind: "restore-point" };
      case "g": return { kind: "goto-approval" };
      case "i": return { kind: "inbox" };
      case ",": return { kind: "settings" };
      case "z": return { kind: "undo" };
      default: return null;
    }
  }

  // ---- bare keys ---------------------------------------------------------------------------------
  if (zone === "input" || zone === "page") {
    return null; // typing: every bare key is inert (findings chords NEVER fire in the Page)
  }

  if (ev.altKey) {
    // REQ-KEYS-1 — version stepping moved off `[`/`]` to the provisional ⌥-bracket pair.
    if (k === "[") return { kind: "version-prev" };
    if (k === "]") return { kind: "version-next" };
    if (!FINDINGS_ZONES.includes(zone)) return null;
    if (k === "j") return { kind: "finding-anchor-next" };
    if (k === "k") return { kind: "finding-anchor-prev" };
    return null;
  }

  if (k === "?" || (k === "/" && ev.shiftKey)) return { kind: "cheatsheet" };
  // REQ-KEYS-1 — the sidebar/panel chords. `]` toggles the right panel (R7PANE.1).
  if (k === "[") return { kind: "sidebar" };
  if (k === "]") return { kind: "pane", pane: "panel" };
  if (k === "/") return { kind: "palette" }; // bare / opens the palette in command mode

  if (!FINDINGS_ZONES.includes(zone)) return null;

  switch (k) {
    case "j": return { kind: "finding-next" };
    case "k": return { kind: "finding-prev" };
    case "p": return { kind: "finding-apply" };
    case "Enter": return { kind: "finding-open" };
    case "Escape": return { kind: "finding-escape" };
    default: {
      const disp = FINDINGS_DISPOSITIONS[k];
      return disp ? { kind: "finding-disposition", disposition: disp } : null;
    }
  }
}
