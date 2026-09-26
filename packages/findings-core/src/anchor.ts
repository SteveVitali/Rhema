import type { Anchor } from "@rhema/contracts";

// The anchoring ladder (§5.7; REQ-OBJ-16, REQ-IDE-23). The canonical anchor is
// `(blockId, quote, startOffset, endOffset, confidence)` in the canonical markdown of the frozen version.
// Resolution is a ladder — exact → normalized → fuzzy (with a confidence) — and an unanchored finding is
// NEVER dropped: it heads the list under "Whole piece". This is framework-free logic the beta web and the
// 1.x mobile app both consume verbatim (REQ-MOBILE-4); no React, no DOM.

/** The label the whole-piece (unanchored) group carries in the list-first surface (§5.7). */
export const WHOLE_PIECE = "Whole piece" as const;

/** How a finding's anchor resolved against the current blocks. */
export type AnchorMethod = "exact" | "normalized" | "fuzzy" | "unanchored" | "unresolved";

/** A canonical-markdown block to resolve an anchor against (blockId + its text). */
export interface PassageBlock {
  readonly blockId: string;
  readonly text: string;
}

/** The result of resolving an anchor onto a set of blocks. */
export interface PassageResolution {
  readonly method: AnchorMethod;
  /** the block the passage resolved into, or null for whole-piece / unresolved. */
  readonly blockId: string | null;
  readonly startOffset: number | null;
  readonly endOffset: number | null;
  /** the text actually matched (raw), or null when unanchored / unresolved. */
  readonly matchedText: string | null;
  /** 0..1 — 1 for exact, the anchor's own confidence for unanchored, a similarity for fuzzy. */
  readonly confidence: number;
}

/** The floor a fuzzy match must clear to count as `fuzzy` rather than `unresolved`. */
export const FUZZY_FLOOR = 0.5;

/**
 * Normalize prose for the "normalized" and "fuzzy" rungs: NFC, straighten smart quotes and dashes, collapse
 * runs of whitespace to a single space, trim. Case is preserved (case is meaningful in prose) except where a
 * caller lowercases for fuzzy token matching.
 */
export function normalizeText(s: string): string {
  return s
    .normalize("NFC")
    .replace(/[\u2018\u2019\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201F\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2212]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function words(s: string): string[] {
  return normalizeText(s)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter((w) => w.length > 0);
}

/** Fraction of the quote's words present in a block (order-agnostic coverage) — the fuzzy confidence. */
function coverage(quote: string, blockText: string): number {
  const q = words(quote);
  if (q.length === 0) return 0;
  const b = new Set(words(blockText));
  let hit = 0;
  for (const w of q) if (b.has(w)) hit += 1;
  return hit / q.length;
}

/**
 * Resolve a finding's anchor onto the current blocks along the ladder (§5.7). An unanchored anchor (null, or
 * `unanchored: true`) resolves to the whole piece; a resolvable anchor is matched exact → normalized → fuzzy;
 * an anchor that clears no rung is `unresolved` (still surfaced, never dropped — see `groupFindingsForList`).
 */
export function resolveAnchor(anchor: Anchor | null | undefined, blocks: readonly PassageBlock[]): PassageResolution {
  if (anchor == null || anchor.unanchored === true) {
    return {
      method: "unanchored",
      blockId: null,
      startOffset: null,
      endOffset: null,
      matchedText: null,
      confidence: anchor?.confidence ?? 0,
    };
  }

  const byId = blocks.find((b) => b.blockId === anchor.blockId);

  // Rung 1 — exact: the raw slice at the recorded offsets equals the quote.
  if (byId) {
    const slice = byId.text.slice(anchor.startOffset, anchor.endOffset);
    if (slice === anchor.quote) {
      return {
        method: "exact",
        blockId: byId.blockId,
        startOffset: anchor.startOffset,
        endOffset: anchor.endOffset,
        matchedText: slice,
        confidence: 1,
      };
    }
    // Rung 2 — normalized: the block contains the quote after whitespace/quote/dash normalization.
    const nQuote = normalizeText(anchor.quote);
    if (nQuote.length > 0 && normalizeText(byId.text).includes(nQuote)) {
      const idx = byId.text.indexOf(anchor.quote);
      const start = idx >= 0 ? idx : anchor.startOffset;
      const end = idx >= 0 ? idx + anchor.quote.length : anchor.endOffset;
      return {
        method: "normalized",
        blockId: byId.blockId,
        startOffset: start,
        endOffset: end,
        matchedText: byId.text.slice(start, end),
        confidence: 0.9,
      };
    }
  }

  // Rung 3 — fuzzy: the block (across all blocks, the anchor's own preferred first) with the highest word
  // coverage of the quote, if it clears the floor.
  let best: { block: PassageBlock; score: number } | null = null;
  for (const b of blocks) {
    const score = coverage(anchor.quote, b.text);
    // prefer the recorded block on ties so a lightly-edited passage stays put.
    if (best === null || score > best.score || (score === best.score && b.blockId === anchor.blockId)) {
      best = { block: b, score };
    }
  }
  if (best && best.score >= FUZZY_FLOOR) {
    return {
      method: "fuzzy",
      blockId: best.block.blockId,
      startOffset: null,
      endOffset: null,
      matchedText: null,
      confidence: Number(best.score.toFixed(4)),
    };
  }

  // Cleared no rung — unresolved. Kept (never dropped); the list surfaces it under the recorded block if any.
  return {
    method: "unresolved",
    blockId: anchor.blockId,
    startOffset: null,
    endOffset: null,
    matchedText: null,
    confidence: best ? Number(best.score.toFixed(4)) : 0,
  };
}
