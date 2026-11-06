// The §5.12 keyboard map — a PURE dispatcher: a key event + the focus zone (+ any pending
// two-key prefix) → an IdeAction the client island executes. Findings chords (J/K/P/A D R F
// E/Enter/Esc/⌥J/⌥K) are scoped to Margin / Findings-list focus ONLY — inert while the caret is
// in the Page (§5.12's scoped-chords row; the chord BEHAVIOURS land with P1.07's findings
// surface, the dispatcher + focus scoping land here).
//
// REQ-KEYS-1 (226_R7SHELL.1a, completed 239_R7WRITE.2; RV-14/33) — the map is DATA: `IDE_KEYMAP`
// is the committed binding table every chord (and every shortcut a tooltip or the `?` sheet
// shows) derives from, and `reserved-chords.json`'s checker pins it against the browser-safe
// rules. 239's remap, under Rules 1–5:
//   • every ⌘⇧*/⌘G/⌘,/⌘I conventional chord is RE-HOMED to Rule 3's idiom — bare keys (`f`,
//     `t`, `v`, `c`, `h`, `l`, `T`) and `g`/`r` two-key sequences (`g p/i/v/s` go-to per the
//     spec; `r d/r/v/n` run sheets) — firing only OUTSIDE text input;
//   • ⌘K / ⌘⏎ / ⌘S / ⌘Z / ⌘⇧Z stay (Rule 4 + the recorded ⌘S save-semantics exception);
//   • `goto-approval` is the map's one recorded REMOVAL — its Needs-you surface moved to the
//     Inbox (R7HOME.2b), so `g i` owns the intent;
//   • `[`/`]` sidebar/panel chords from 226 are unchanged; version prev/next leaves 226's
//     provisional `⌥[`/`⌥]` for the final `h`/`l` pair;
//   • ⌘I is free for the Page editor's italic; `mod+enter` (⌘⏎) is newly bound — the run sheet
//     from the Page (Rule 4).
// The `source` focus zone (Rule 5) narrows dispatch while CodeMirror has focus: only ⌘S
// (the buffer's commit mint) fires — every other chord belongs to the editor's own bindings.

/** Where keyboard focus sits. `page` = caret in the editor surface; `source` = focus inside the
 *  Source-mode CodeMirror host; `input` = a text field (palette, sheet, sheet fields);
 *  `margin`/`findings` = the Findings list focus ring; `none` = chrome. */
export type FocusZone = "page" | "source" | "margin" | "findings" | "input" | "none";

export interface KeyChord {
  readonly key: string; // KeyboardEvent.key, case-normalized by the caller contract below
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
  readonly shiftKey: boolean;
  readonly altKey: boolean;
}

export type IdeAction =
  | { readonly kind: "prefix"; readonly prefix: "g" | "r" }
  | { readonly kind: "palette" }
  | { readonly kind: "sidebar" }
  | { readonly kind: "pane"; readonly pane: "panel" }
  | { readonly kind: "view-menu" }
  | { readonly kind: "focus-mode" }
  | { readonly kind: "paper-theme" }
  | { readonly kind: "triage" }
  | { readonly kind: "restore-point" }
  | { readonly kind: "run-next" }
  | { readonly kind: "run-sheet" }
  | { readonly kind: "sheet"; readonly workflow: "draft" | "review" | "revise" }
  | { readonly kind: "goto-projects" }
  | { readonly kind: "inbox" }
  | { readonly kind: "goto-voices" }
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
// REQ-KEYS-1 — the committed binding table. `chord` is canonical (`mod+shift+t`, `alt+[`, a bare
// key, or a two-key sequence `g p` / `r d` — the checker validates each key of a sequence).
// `actionKind` is the IdeAction discriminator (`sheet:<workflow>` carries the payload).
// `scope:"findings"` marks the Margin/list-scoped rows (inert in Page/input focus). Descriptions
// are the `?` sheet's text; `keys` is the display glyph a tooltip or the sheet shows.
// ---------------------------------------------------------------------------

export interface IdeBinding {
  /** canonical chord for the checker — `mod[+shift]+<key>` / `alt[+shift]+<key>` / `shift+<key>`
   *  / bare `<key>` / `<key> <key>` (a two-key sequence). */
  readonly chord: string;
  /** display form for the cheat sheet and tooltips (⌘K, g p, ⇧T). */
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
  { chord: "/", keys: "/", actionKind: "palette", action: "Palette (command mode)" },
  { chord: "mod+enter", keys: "⌘⏎", actionKind: "run-sheet", action: "Run sheet" },
  { chord: "[", keys: "[", actionKind: "sidebar", action: "Toggle the sidebar" },
  { chord: "]", keys: "]", actionKind: "pane:panel", action: "Toggle the right pane" },
  { chord: "v", keys: "v", actionKind: "view-menu", action: "View menu" },
  { chord: "f", keys: "f", actionKind: "focus-mode", action: "Focus view" },
  { chord: "shift+t", keys: "⇧T", actionKind: "paper-theme", action: "Paper theme" },
  { chord: "t", keys: "t", actionKind: "triage", action: "Triage" },
  { chord: "mod+s", keys: "⌘S", actionKind: "restore-point", action: "Named restore point" },
  { chord: "r n", keys: "r n", actionKind: "run-next", action: "Run the next step" },
  { chord: "r d", keys: "r d", actionKind: "sheet:draft", action: "Draft sheet" },
  { chord: "r r", keys: "r r", actionKind: "sheet:review", action: "Review sheet" },
  { chord: "r v", keys: "r v", actionKind: "sheet:revise", action: "Revise sheet" },
  { chord: "g p", keys: "g p", actionKind: "goto-projects", action: "Go to Projects" },
  { chord: "g i", keys: "g i", actionKind: "inbox", action: "Go to Inbox" },
  { chord: "g v", keys: "g v", actionKind: "goto-voices", action: "Go to Voices" },
  { chord: "g s", keys: "g s", actionKind: "settings", action: "Project settings" },
  { chord: "c", keys: "c", actionKind: "compare-previous", action: "Compare with previous" },
  { chord: "h", keys: "h", actionKind: "version-prev", action: "Previous version" },
  { chord: "l", keys: "l", actionKind: "version-next", action: "Next version" },
  { chord: "mod+z", keys: "⌘Z", actionKind: "undo", action: "Undo" },
  { chord: "mod+shift+z", keys: "⌘⇧Z", actionKind: "redo", action: "Redo" },
  { chord: "?", keys: "?", actionKind: "cheatsheet", action: "Cheat sheet" },
  { chord: "j", keys: "J", actionKind: "finding-next", action: "Next finding — findings", scope: "findings" },
  { chord: "k", keys: "K", actionKind: "finding-prev", action: "Previous finding — findings", scope: "findings" },
  { chord: "p", keys: "P", actionKind: "finding-apply", action: "Apply finding — findings", scope: "findings" },
  { chord: "a", keys: "A", actionKind: "finding-disposition:accept", action: "Accept — findings", scope: "findings" },
  { chord: "d", keys: "D", actionKind: "finding-disposition:adapt", action: "Adapt — findings", scope: "findings" },
  { chord: "r", keys: "R", actionKind: "finding-disposition:rebut", action: "Rebut — findings", scope: "findings" },
  { chord: "f", keys: "F", actionKind: "finding-disposition:defer", action: "Defer — findings", scope: "findings" },
  { chord: "e", keys: "E", actionKind: "finding-disposition:escalate", action: "Escalate — findings", scope: "findings" },
  { chord: "enter", keys: "Enter", actionKind: "finding-open", action: "Open finding — findings", scope: "findings" },
  { chord: "escape", keys: "Esc", actionKind: "finding-escape", action: "Clear finding focus — findings", scope: "findings" },
  { chord: "alt+j", keys: "⌥J", actionKind: "finding-anchor-next", action: "Next blocking/major — findings", scope: "findings" },
  { chord: "alt+k", keys: "⌥K", actionKind: "finding-anchor-prev", action: "Previous blocking/major — findings", scope: "findings" },
];

/** Chords the SSR islands bind OUTSIDE the dispatcher (`client/page.ts`'s save listener) — the
 *  table every island-bound chord must come from, so the checker sees the whole surface. */
export const ISLAND_CHORDS: readonly IdeBinding[] = [
  { chord: "mod+s", keys: "⌘S", actionKind: "restore-point", action: "Named restore point" },
];

// ---- canonical chord matching (REQ-KEYS-1) — the two PURE helpers islands + the checker share.
// They live here (the keymap module every importer already pulls) so `reserved-chords.ts` —
// the checker + the rule-set JSON — stays TEST-only and never rides the runtime bundle.

export interface ChordSpec {
  readonly key: string;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
}

/** Canonicalize a chord descriptor: `mod+shift+t`, `shift+t`, `alt+[`, or the bare key. `mod` = ⌘/Ctrl. */
export function canonicalChord(c: ChordSpec): string {
  const parts: string[] = [];
  if (c.metaKey || c.ctrlKey) parts.push("mod");
  if (c.altKey) parts.push("alt");
  if (c.shiftKey) parts.push("shift");
  parts.push(c.key.toLowerCase()); // key names are case-folded (`Enter` ↔ `enter`)
  return parts.join("+");
}

/**
 * True when a KeyboardEvent-shaped chord matches a canonical chord string (`mod+s`, `shift+t`,
 * bare `f`). Islands + inline handlers bind through this so no chord literal lives in the
 * listener (`client/page.ts`'s ⌘S reads `ISLAND_CHORDS`, never a hand-typed `"s"`).
 */
export function matchesChord(ev: ChordSpec, canonical: string): boolean {
  return canonicalChord(ev) === canonical;
}

/** The display glyph a tooltip shows for one action kind (generated from the keymap — REQ-KEYS-2). */
export function shortcutFor(actionKind: string): string | null {
  return IDE_KEYMAP.find((b) => b.actionKind === actionKind)?.keys ?? null;
}

/** The `?` sheet's rows — GENERATED from IDE_KEYMAP so the card can never drift from the map. */
export const CHEAT_SHEET: readonly { readonly keys: string; readonly action: string }[] =
  IDE_KEYMAP.map((b) => ({ keys: b.keys, action: b.action }));

/** The second key a pending `g` prefix maps to a go-to action (Rule 3's Linear/GitHub idiom). */
const GOTO_SECOND: Readonly<Record<string, IdeAction>> = {
  p: { kind: "goto-projects" },
  i: { kind: "inbox" },
  v: { kind: "goto-voices" },
  s: { kind: "settings" },
};

/** The second key a pending `r` prefix maps to a run-sheet action. */
const RUN_SECOND: Readonly<Record<string, IdeAction>> = {
  d: { kind: "sheet", workflow: "draft" },
  r: { kind: "sheet", workflow: "review" },
  v: { kind: "sheet", workflow: "revise" },
  n: { kind: "run-next" },
};

/**
 * Dispatch one key event to an IdeAction (or null = let the browser handle it). Callers normalize
 * `key` to lowercase for letters (`e.key.length === 1 ? e.key.toLowerCase() : e.key`) before
 * calling — the map is written against that contract. `mod` = ⌘ on mac / Ctrl elsewhere (the
 * island passes metaKey||ctrlKey; both fields stay on the chord for tests that distinguish them).
 * `pending` is the armed two-key prefix the caller holds (`g`/`r`), expiring on its own timeout.
 *
 * Rules (§5.12 + REQ-KEYS-1):
 *  - `input` focus: bare keys are inert (typing); ONLY ⌘K dispatches (the field keeps its editing).
 *  - `source` focus (Rule 5): the CodeMirror editor's own bindings win — ONLY ⌘S dispatches (the
 *    buffer's commit mint); everything else returns null so CM/the browser keeps the chord.
 *  - `page` focus: bare keys + prefixes are inert; the mod chords fire (⌘K is contextual link
 *    under a selection, ⌘S restores, ⌘⏎ opens the run sheet — the findings chords NEVER fire).
 *  - bare findings chords dispatch only in `margin`/`findings` focus — and win over the global
 *    bare-key table there (`r` stays Rebut, `f` stays Defer in the list).
 */
export function dispatchIdeKey(ev: KeyChord, zone: FocusZone, pending?: string | null): IdeAction | null {
  const mod = ev.metaKey || ev.ctrlKey;
  const k = ev.key;

  // ---- mod chords (global, with input narrowing + Rule-5 source precedence) ------------------
  if (mod) {
    if (zone === "source") {
      if (k === "s" && !ev.shiftKey) return { kind: "restore-point" };
      return null;
    }
    if (zone === "input") {
      // inside a field only the overlay chords fire; everything else belongs to the field.
      if (k === "k" && !ev.shiftKey) return { kind: "palette" };
      return null;
    }
    if (ev.shiftKey) {
      if (k === "z") return { kind: "redo" };
      return null;
    }
    switch (k) {
      case "k": return { kind: "palette" };
      case "s": return { kind: "restore-point" };
      case "Enter": return { kind: "run-sheet" };
      case "z": return { kind: "undo" };
      default: return null;
    }
  }

  // ---- bare keys + two-key sequences ----------------------------------------------------------
  if (zone === "input" || zone === "page" || zone === "source") {
    return null; // typing: every bare key is inert (findings chords NEVER fire in the Page)
  }

  // a pending `g`/`r` prefix consumes the next bare key in the non-typing zones; an unknown
  // second key lapses the prefix and falls through to normal dispatch (GitHub/Linear behavior).
  if (pending === "g") {
    const hit = GOTO_SECOND[k];
    if (hit) return hit;
  } else if (pending === "r") {
    const hit = RUN_SECOND[k];
    if (hit) return hit;
  }

  if (ev.altKey) {
    if (!FINDINGS_ZONES.includes(zone)) return null;
    if (k === "j") return { kind: "finding-anchor-next" };
    if (k === "k") return { kind: "finding-anchor-prev" };
    return null;
  }

  // findings-scoped chords win inside the Margin/Findings zones — `r`/`f` stay Rebut/Defer there
  // and never arm the global prefixes.
  if (FINDINGS_ZONES.includes(zone)) {
    switch (k) {
      case "j": return { kind: "finding-next" };
      case "k": return { kind: "finding-prev" };
      case "p": return { kind: "finding-apply" };
      case "Enter": return { kind: "finding-open" };
      case "Escape": return { kind: "finding-escape" };
      default: {
        const disp = FINDINGS_DISPOSITIONS[k];
        if (disp) return { kind: "finding-disposition", disposition: disp };
      }
    }
  }

  if (k === "?" || (k === "/" && ev.shiftKey)) return { kind: "cheatsheet" };
  // REQ-KEYS-1 — the sidebar/panel chords (R7SHELL.1a). `]` toggles the right panel (R7PANE.1).
  if (k === "[") return { kind: "sidebar" };
  if (k === "]") return { kind: "pane", pane: "panel" };
  if (k === "/") return { kind: "palette" }; // bare / opens the palette in command mode
  // REQ-KEYS-1 (239) — the re-homed Rule-3 chords: single keys + the `g`/`r` prefix arms.
  if (k === "v") return { kind: "view-menu" };
  if (k === "f") return { kind: "focus-mode" };
  if (k === "t" && ev.shiftKey) return { kind: "paper-theme" };
  if (k === "t") return { kind: "triage" };
  if (k === "c") return { kind: "compare-previous" };
  // version stepping's FINAL home — off `[`/`]` (sidebar/pane) and 226's provisional `⌥[`/`⌥]`.
  if (k === "h") return { kind: "version-prev" };
  if (k === "l") return { kind: "version-next" };
  if (k === "g") return { kind: "prefix", prefix: "g" };
  if (k === "r") return { kind: "prefix", prefix: "r" };
  return null;
}
