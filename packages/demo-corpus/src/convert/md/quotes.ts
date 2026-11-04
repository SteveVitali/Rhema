// Quote-fragment extraction for the anchor ladder (R2 §5 `md/quotes.ts`; REQ-CONV-1). A claim's
// `> …` quote is never a single reliable span: the ledger carries ellipses, editorial insertions
// and locator parentheticals, so the anchor matcher works on candidate verbatim FRAGMENTS, longest
// first.

const WORD_SPLIT = /[^\p{L}\p{N}]+/u;

/** Word count after markdown-ish normalization (for the fragment floors). */
export function wordCount(text: string): number {
  return text.split(WORD_SPLIT).filter((w) => w.length > 0).length;
}

/**
 * Candidate verbatim fragments from a quote/where string: double-quoted spans (`"…"`/`“…”`), split
 * on `…`/`...`/`[…]` and on editorial insertions `[welfare nationalism]` — but never on footnote
 * markers `[^8]`/`[12]`. Pieces are kept at ≥3 words, or ≥2 when they came from inside quotes (R2
 * §5 module table). When no quoted span exists the whole text (minus a trailing locator
 * parenthetical) is the single candidate.
 */
export function quoteFragments(text: string): string[] {
  const t = text.replace(/\s+/g, " ").trim();
  const quoted: string[] = [];
  const re = /[“"]([^”"]{8,}?)[”"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) quoted.push(m[1] ?? "");
  const base = quoted.length > 0 ? quoted : [t.replace(/\s*\([^()]*\)\s*$/, "")];
  const minWords = quoted.length > 0 ? 2 : 3;
  const out: string[] = [];
  for (const q of base) {
    for (const piece of q.split(/\s*(?:…|\.\.\.|\[…\]|\[\.\.\.\]|\[(?![\^\d])[^\]]*\])\s*/)) {
      const p = piece.trim().replace(/^[,;:.\s]+|[,;:\s]+$/g, "");
      if (p.length > 0 && wordCount(p) >= minWords) out.push(p);
    }
  }
  return out;
}

/**
 * Strip the trailing locator parenthetical from a joined quote — `(l.10)`, `(§IV)`, `(Opening
 * ¶1)`, `(§IV; fn 1)`. One trailing group is removed, nested one level deep; the quote's own text
 * is kept verbatim otherwise (the fixtures' paraphrased texts are not a precedent — R2 §2.1).
 */
export function stripLocator(text: string): string {
  return text.replace(/\s*\((?:[^()]|\([^()]*\))*\)\s*$/, "").trim();
}

/** The GM line hint — `(l.N)` inside a quote — resolved to a draft line number, or undefined. */
export function lineHintOf(text: string): number | undefined {
  const m = /\(l\.(\d+)\)/.exec(text);
  return m ? Number(m[1]) : undefined;
}
