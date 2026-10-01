// The §5.12 keyboard map — a PURE dispatcher: a key event + the focus zone → an IdeAction the client
// island executes. Findings chords (J/K/P/A D R F E/Enter/Esc/⌥J/⌥K) are scoped to Margin /
// Findings-list focus ONLY — inert while the caret is in the Page (§5.12's scoped-chords row; the
// chord BEHAVIOURS land with P1.07's findings surface, the dispatcher + focus scoping land here).

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
  | { readonly kind: "pane"; readonly pane: "files" | "timeline" | "desk" }
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

/**
 * Dispatch one key event to an IdeAction (or null = let the browser handle it). Callers normalize
 * `key` to lowercase for letters (`e.key.length === 1 ? e.key.toLowerCase() : e.key`) before calling —
 * the map is written against that contract. `mod` = ⌘ on mac / Ctrl elsewhere (the island passes
 * metaKey||ctrlKey; both fields stay on the chord for tests that distinguish them).
 *
 * Rules (§5.12):
 *  - `input` focus: bare keys are inert (typing); ONLY the mod chords that make sense in a field
 *    dispatch (⌘K palette, ⌘S restore — the rest fall through so the field keeps its own editing).
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
      case "1": return { kind: "pane", pane: "files" };
      case "2": return { kind: "pane", pane: "timeline" };
      case "j": return { kind: "pane", pane: "desk" };
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
    if (!FINDINGS_ZONES.includes(zone)) return null;
    if (k === "j") return { kind: "finding-anchor-next" };
    if (k === "k") return { kind: "finding-anchor-prev" };
    return null;
  }

  if (k === "?" || (k === "/" && ev.shiftKey)) return { kind: "cheatsheet" };
  if (k === "[") return { kind: "version-prev" };
  if (k === "]") return { kind: "version-next" };
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

/** The cheat-sheet's row model (⌘K card `?` opens it; the island renders these verbatim). */
export const CHEAT_SHEET: readonly { readonly keys: string; readonly action: string }[] = [
  { keys: "⌘K", action: "Command palette" },
  { keys: "⌘1 · ⌘2 · ⌘J", action: "Files · Timeline · Desk" },
  { keys: "⌘⇧M · ⌘⇧F · ⌘⇧L · ⌘⇧T", action: "View menu · Focus · Paper theme · Triage" },
  { keys: "⌘S", action: "Mark a named restore point" },
  { keys: "⌘⇧R", action: "Run the next step" },
  { keys: "⌘⇧D · ⌘⇧E · ⌘⇧V", action: "Draft · Review · Revise sheets" },
  { keys: "⌘G · ⌘I · ⌘,", action: "Oldest open approval · Inbox · Project settings" },
  { keys: "?", action: "This cheat sheet" },
  { keys: "J/K · P · A D R F E · Enter/Esc", action: "Findings — in the Findings list only" },
  { keys: "⌘⇧C · [ · ] · ⌘Z/⌘⇧Z", action: "Compare · versions · undo/redo" },
];
