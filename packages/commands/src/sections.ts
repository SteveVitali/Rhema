// P1.06 — section derivation + scoped estimator inputs (§7.2 scoped runs; REQ-CHAT-23). Pure and
// framework-free like the rest of the grammar: the api derives a draft's sections once (sheet-context),
// the web resolves a serialized scope to the estimator inputs the scoped price needs, and tests pin the
// pair deterministically.

import type { ScopeRef } from "./types.js";

export interface ScopedSection {
  /** the heading's scope ref as the grammar spells it ("III" — `@section:III`). */
  readonly ref: string;
  readonly title: string;
  readonly words: number;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII", "XIV", "XV"];

/**
 * Derive a draft's section word counts from its markdown ATX headings (`#`–`###`; fenced code is
 * skipped). Section refs are roman numerals in heading order (`III` = the third section); the
 * `@section:"Title"` form resolves by case-insensitive title substring. Unknown structure yields [] —
 * a scoped estimate then stands at the whole-draft figure (an upper bound, never a fabrication).
 */
export function deriveSections(markdown: string): ScopedSection[] {
  const lines = markdown.split("\n");
  const heads: { title: string; start: number }[] = [];
  let inFence = false;
  lines.forEach((line, i) => {
    if (/^```/.test(line.trim())) inFence = !inFence;
    if (inFence) return;
    const h = /^(#{1,3})\s+(.+)$/.exec(line.trim());
    if (h) heads.push({ title: h[2]!.replace(/#+\s*$/, "").trim(), start: i });
  });
  return heads.map((h, i) => {
    const end = heads[i + 1]?.start ?? lines.length;
    const words = lines.slice(h.start, end).join(" ").split(/\s+/).filter(Boolean).length;
    return { ref: ROMAN[i] ?? String(i + 1), title: h.title, words };
  });
}

/**
 * Resolve parsed scope refs to the scoped estimator inputs the run's price needs (§5.6: the scoped
 * estimate beside the whole-draft figure):
 *  - `@section:III` / `@section:"Title"` → `{ words: <the section's words> }`;
 *  - `@finding:`/`@claim:` → `{ findings: 1 }` (the single-finding slice);
 *  - `@words:6000` → `{ words: 6000 }` (the trial's "first N words" offer);
 *  - `@v3`/`@selection`/`@outline`/`@thread`/`@figure`/`@asset` → null (no narrower price input yet —
 *    the whole-draft figure stands as the scoped bound).
 * Returns null when no scope resolves to a narrower input — the caller shows the whole-draft figure.
 */
export function scopedInputs(
  scopes: readonly ScopeRef[],
  sections: readonly ScopedSection[],
): { words?: number; findings?: number; claims?: number } | null {
  for (const s of scopes) {
    if (s.kind === "section") {
      const ref = s.ref.replace(/^"|"$/g, "");
      const hit =
        sections.find((x) => x.ref.toLowerCase() === ref.toLowerCase()) ??
        sections.find((x) => x.title.toLowerCase().includes(ref.toLowerCase()));
      return hit ? { words: hit.words } : null;
    }
    if (s.kind === "finding" || s.kind === "claim") return { findings: 1 };
    if (s.kind === "words") return { words: s.upto };
  }
  return null;
}
