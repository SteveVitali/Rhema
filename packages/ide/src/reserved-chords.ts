// REQ-KEYS-1 (226_R7SHELL.1a, completed 239_R7WRITE.2; RV-14) — the reserved-chords checker.
// `reserved-chords.json` carries the RULE sets only (non-capturable set, conventional-avoid set,
// keep set, and the now-empty transitional map 239 retired); the documentation fields (sources,
// old→new, keep reasons, the layout note, the editor-scope note) live in
// `reserved-chords-evidence.json`, imported only by the test module — never the entry bundle.
// A chord descriptor is canonicalized to `mod[+shift]+<key>` / `alt[+shift]+<key>` /
// `shift+<key>` / bare `<key>` and checked against the sets: nonCapturable is ALWAYS illegal;
// conventionalAvoid is legal only in `keep` or when the `transitional` map pins the chord to
// exactly that action. A two-key sequence (`g p`) is checked per key — Rule 1/Rule 2 concern
// mod-chords only. A binding marked `scope:"editor"` (the ProseMirror Page keymap) is checked
// against Rule 1 only: inside a focused editor the user's conventions (⌘B/⌘I/⌘⇧S/⌘Z) are the
// expected chords — the evidence file's `editorScopeNote` records the exemption.

import reserved from "./reserved-chords.json" with { type: "json" };
// `ChordSpec`/`canonicalChord`/`matchesChord` live in ./keymap.js — the runtime module every
// importer already pulls; this file (the checker + the rule-set JSON) is TEST-only.

export interface ReservedChords {
  readonly nonCapturable: readonly string[];
  readonly conventionalAvoid: readonly string[];
  readonly keep: readonly string[];
  /** grandfathered chord → the ONE action it may carry — EMPTY since 239 (kept for schema
   *  stability; any repopulated entry pins a chord to exactly that action). */
  readonly transitional: Readonly<Record<string, string>>;
}

export const RESERVED_CHORDS: ReservedChords = {
  nonCapturable: reserved.nonCapturable,
  conventionalAvoid: reserved.conventionalAvoid,
  keep: reserved.keep,
  transitional: reserved.transitional,
};

const NON_CAPTURABLE = new Set(RESERVED_CHORDS.nonCapturable);
const CONVENTIONAL_AVOID = new Set(RESERVED_CHORDS.conventionalAvoid);
const KEEP = new Set(RESERVED_CHORDS.keep);

export type ChordVerdict = "ok" | "non-capturable" | "conventional-avoid" | "transitional-mismatch";

/** The rule verdict for one chord+action pair. `scope:"editor"` exempts Rule 2 (see above). */
export function checkChord(chord: string, action: string, scope?: "editor"): ChordVerdict {
  if (NON_CAPTURABLE.has(chord)) return "non-capturable";
  if (scope === "editor") return "ok";
  if (!CONVENTIONAL_AVOID.has(chord)) return "ok";
  if (KEEP.has(chord)) return "ok";
  if (RESERVED_CHORDS.transitional[chord] === action) return "ok";
  return chord in RESERVED_CHORDS.transitional ? "transitional-mismatch" : "conventional-avoid";
}

export interface ChordViolation {
  readonly chord: string;
  readonly action: string;
  readonly verdict: Exclude<ChordVerdict, "ok">;
}

/** Every rule violation in a binding list — the checker test asserts this is empty. A `g p`-style
 *  two-key chord validates each key in the sequence. */
export function chordViolations(
  bindings: readonly { readonly chord: string; readonly actionKind: string; readonly scope?: "editor" | "findings" }[],
): ChordViolation[] {
  const out: ChordViolation[] = [];
  for (const b of bindings) {
    for (const single of b.chord.split(" ")) {
      const verdict = checkChord(single, b.actionKind, b.scope === "editor" ? "editor" : undefined);
      if (verdict !== "ok") out.push({ chord: b.chord, action: b.actionKind, verdict });
    }
  }
  return out;
}
