// REQ-KEYS-1 (226_R7SHELL.1a; RV-14) — the reserved-chords checker. `reserved-chords.json`
// carries Rules 1–4 as data (non-capturable set, conventional-avoid set, keep set, and the
// transitional grandfathering 239_R7WRITE.2 retires). A chord descriptor is canonicalized to
// `mod[+shift]+<key>` / `alt[+shift]+<key>` / bare `<key>` and checked against the sets:
// nonCapturable is ALWAYS illegal; conventionalAvoid is legal only in `keep` or when the
// `transitional` map pins the chord to exactly that action — so a planted ⌘1 binding, or a
// planted second action on a grandfathered chord like ⌘⇧T, fails the check.

import reserved from "./reserved-chords.json" with { type: "json" };

export interface ChordSpec {
  readonly key: string;
  readonly metaKey?: boolean;
  readonly ctrlKey?: boolean;
  readonly shiftKey?: boolean;
  readonly altKey?: boolean;
}

export interface ReservedChords {
  readonly nonCapturable: readonly string[];
  readonly conventionalAvoid: readonly string[];
  readonly keep: readonly string[];
  /** grandfathered chord → the ONE action it may carry until 239 completes the remap. */
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

/** Canonicalize a chord descriptor: `mod+shift+t`, `alt+[`, or the bare key. `mod` = ⌘/Ctrl. */
export function canonicalChord(c: ChordSpec): string {
  const parts: string[] = [];
  if (c.metaKey || c.ctrlKey) parts.push("mod");
  if (c.altKey) parts.push("alt");
  if (c.shiftKey) parts.push("shift");
  parts.push(c.key.length === 1 ? c.key.toLowerCase() : c.key);
  return parts.join("+");
}

export type ChordVerdict = "ok" | "non-capturable" | "conventional-avoid" | "transitional-mismatch";

/** The rule verdict for one chord+action pair. */
export function checkChord(chord: string, action: string): ChordVerdict {
  if (NON_CAPTURABLE.has(chord)) return "non-capturable";
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

/** Every rule violation in a binding list — the checker test asserts this is empty. */
export function chordViolations(
  bindings: readonly { readonly chord: string; readonly actionKind: string }[],
): ChordViolation[] {
  const out: ChordViolation[] = [];
  for (const b of bindings) {
    const verdict = checkChord(b.chord, b.actionKind);
    if (verdict !== "ok") out.push({ chord: b.chord, action: b.actionKind, verdict });
  }
  return out;
}
