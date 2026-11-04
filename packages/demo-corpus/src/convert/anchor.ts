// The claim/finding anchor ladder (R2 §3; REQ-CONV-11). Blocks come from `splitMarkdownBlocks` on
// the SANITIZED draft (the single splitter, REQ-OBJ-16) and emitted offsets are block-relative, so
// every emitted anchor round-trips through `resolveAnchor`'s rung-1 `text.slice(start,end) ===
// quote` check on the exact/normalized/line/section rungs.
//
// Ladder: exact (unique) → exact-multi → normalized → fuzzy → line-hint → section-heading → none.
// Confidence constants are the R2 §3 table verbatim. Blocks under a References/Notes-style heading
// are excluded from candidacy (they repeat quoted text) except for `Ref [n]` claims, which anchor
// there instead. An unresolved claim omits `anchor` entirely.

import type { Anchor } from "@rhema/contracts";
import { splitMarkdownBlocks, type DiffBlock } from "@rhema/findings-core";
import { quoteFragments } from "./md/quotes.js";

/** The ladder rungs, in the golden-histogram vocabulary (R2 §3). */
export type AnchorRung =
  | "exact"
  | "exact-multi"
  | "normalized"
  | "fuzzy"
  | "line"
  | "section"
  | "none";

/** Confidence constants — the R2 §3 proposed-confidence table verbatim (golden-tested). */
export const ANCHOR_CONFIDENCE = {
  /** exact unique. */
  exact: 1.0,
  /** exact non-unique (first occurrence; hint-block occurrence when hinted). */
  exactMulti: 0.85,
  /** normalized — equal to `resolveAnchor`'s rung-2 value. */
  normalized: 0.9,
  /** fuzzy: `min(0.8, 0.8·coverage)`. */
  fuzzyCap: 0.8,
  /** fuzzy that agrees with a line hint: floor. */
  fuzzyHintFloor: 0.75,
  /** line-hint only. */
  line: 0.5,
  /** section-heading fallback. */
  section: 0.4,
} as const;

/** Minimum word coverage for a fuzzy hit (R2 §3 "best-block word coverage ≥ 0.6"). */
export const FUZZY_COVERAGE_FLOOR = 0.6;

export interface AnchorOptions {
  /** GM-style `(l.N)` draft line hint, when the quote carried one. */
  readonly lineHint?: number;
  /** `Ref [n]` claims anchor into the References blocks instead of the body blocks. */
  readonly referenceClaim?: boolean;
}

export interface AnchorResolution {
  readonly rung: AnchorRung;
  /** The emitted anchor, or null when no rung resolved (claim omits `anchor`). */
  readonly anchor: Anchor | null;
  /** How many candidate fragments the quote produced. */
  readonly fragmentCount: number;
}

/** Normalize with an index map back to raw offsets: smart quotes/dashes, emphasis, footnote refs, whitespace. */
function normMap(raw: string): { out: string; map: number[] } {
  let out = "";
  const map: number[] = [];
  let prevSpace = false;
  for (let i = 0; i < raw.length; i++) {
    let c = raw[i] ?? "";
    if (c === "[") {
      const m = /^\[\^?\d+(?:[–-]\d+)?\]/.exec(raw.slice(i));
      if (m) {
        i += m[0].length - 1;
        continue;
      }
    }
    if (c === "*" || c === "_" || c === "`") continue;
    if (/[‘’‛′]/.test(c)) c = "'";
    else if (/[“”‟″]/.test(c)) c = '"';
    else if (/[–—−]/.test(c)) c = "-";
    else if (c === "…") {
      for (const d of "...") {
        out += d;
        map.push(i);
      }
      prevSpace = false;
      continue;
    }
    if (/\s/.test(c)) {
      if (prevSpace) continue;
      c = " ";
      prevSpace = true;
    } else {
      prevSpace = false;
    }
    out += c;
    map.push(i);
  }
  return { out, map };
}

const norm = (s: string) => normMap(s).out.trim();
const words = (s: string) =>
  norm(s)
    .toLowerCase()
    .split(/[^\p{L}\p{N}]+/u)
    .filter(Boolean);

interface FragmentMatch {
  method: Exclude<AnchorRung, "line" | "section" | "none"> | "none";
  len?: number;
  anchor?: Anchor;
}

/** Resolve one fragment against a block set: exact → exact-multi → normalized → fuzzy. */
function matchFragment(frag: string, blocks: readonly DiffBlock[]): FragmentMatch {
  const hits = blocks.filter((b) => b.text.includes(frag));
  if (hits.length > 0) {
    const b = hits[0] as DiffBlock;
    const s = b.text.indexOf(frag);
    return {
      method: hits.length === 1 ? "exact" : "exact-multi",
      len: frag.length,
      anchor: {
        blockId: b.blockId,
        quote: frag,
        startOffset: s,
        endOffset: s + frag.length,
        confidence: hits.length === 1 ? ANCHOR_CONFIDENCE.exact : ANCHOR_CONFIDENCE.exactMulti,
      },
    };
  }
  const nf = norm(frag);
  if (nf.length >= 12) {
    for (const b of blocks) {
      const { out, map } = normMap(b.text);
      const idx = out.indexOf(nf);
      if (idx >= 0) {
        const s = map[idx] ?? 0;
        const e = (map[idx + nf.length - 1] ?? s) + 1;
        return {
          method: "normalized",
          len: frag.length,
          anchor: {
            blockId: b.blockId,
            quote: b.text.slice(s, e),
            startOffset: s,
            endOffset: e,
            confidence: ANCHOR_CONFIDENCE.normalized,
          },
        };
      }
    }
  }
  const q = words(frag);
  if (q.length >= 4) {
    let best: { block: DiffBlock; cov: number } | null = null;
    for (const b of blocks) {
      const bw = new Set(words(b.text));
      const cov = q.filter((w) => bw.has(w)).length / q.length;
      if (!best || cov > best.cov) best = { block: b, cov };
    }
    if (best && best.cov >= FUZZY_COVERAGE_FLOOR) {
      const len = Math.min(best.block.text.length, 200);
      return {
        method: "fuzzy",
        len: frag.length,
        anchor: {
          blockId: best.block.blockId,
          quote: best.block.text.slice(0, len),
          startOffset: 0,
          endOffset: len,
          confidence: Number(
            Math.min(ANCHOR_CONFIDENCE.fuzzyCap, best.cov * ANCHOR_CONFIDENCE.fuzzyCap).toFixed(4),
          ),
        },
      };
    }
  }
  return { method: "none" };
}

const RANK: Record<string, number> = {
  exact: 4,
  "exact-multi": 3,
  normalized: 3,
  fuzzy: 1,
  line: 0.5,
  section: 0.25,
  none: 0,
};

/** 1-based draft line → the block containing it. */
function lineToBlock(
  markdown: string,
  blocks: readonly DiffBlock[],
): (line: number) => DiffBlock | null {
  const lineStarts = [0];
  for (let i = 0; i < markdown.length; i++) if (markdown[i] === "\n") lineStarts.push(i + 1);
  return (line) => {
    const off = lineStarts[line - 1];
    if (off == null) return null;
    return blocks.find((b) => off >= b.startOffset - 1 && off <= b.endOffset) ?? null;
  };
}

const REFERENCES_HEADING_RE = /^#{1,3}\s*(References|Notes|Endnotes|Bibliography|Sources)\b/i;

/**
 * Split blocks at the first References/Notes-style heading: body blocks are anchor candidates for
 * ordinary claims; the tail is only reachable by `Ref [n]` claims (R2 §3 "Blocks after a
 * References/Notes heading are excluded, because they repeat quoted text").
 */
export function splitAtReferences(blocks: readonly DiffBlock[]): {
  body: readonly DiffBlock[];
  references: readonly DiffBlock[];
} {
  const i = blocks.findIndex((b) => REFERENCES_HEADING_RE.test(b.text));
  return i < 0
    ? { body: blocks, references: [] }
    : { body: blocks.slice(0, i), references: blocks.slice(i) };
}

const SECTION_REF_RE = /§\s*([IVXLC]+|\d+)\b/;
const ROMAN_VALUE: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100 };

function romanToInt(roman: string): number | null {
  if (/^\d+$/.test(roman)) return Number(roman);
  let total = 0;
  for (let i = 0; i < roman.length; i++) {
    const v = ROMAN_VALUE[roman[i] ?? ""];
    if (v == null) return null;
    total += i + 1 < roman.length && (ROMAN_VALUE[roman[i + 1] ?? ""] ?? 0) > v ? -v : v;
  }
  return total > 0 ? total : null;
}

/** The section-heading fallback: `§<n>` → that section's `## ` heading block (token match first, then ordinal). */
function sectionHeadingBlock(
  text: string,
  blocks: readonly DiffBlock[],
): DiffBlock | null {
  const m = SECTION_REF_RE.exec(text);
  if (!m) return null;
  const n = romanToInt(m[1] ?? "");
  if (n == null || n <= 0) return null;
  const headings = blocks.filter((b) => /^## /.test(b.text));
  const token = new RegExp(`^##\\s+(?:§\\s*)?${m[1]}\\b`, "i");
  const byName = headings.find((b) => token.test(b.text));
  if (byName) return byName;
  return headings[n - 1] ?? null;
}

/** A whole-block anchor (quote = leading ≤200 chars at offsets [0, len]) — the fuzzy/line/section shape. */
function wholeBlockAnchor(block: DiffBlock, confidence: number): Anchor {
  const len = Math.min(block.text.length, 200);
  return {
    blockId: block.blockId,
    quote: block.text.slice(0, len),
    startOffset: 0,
    endOffset: len,
    confidence,
  };
}

/**
 * Resolve a quote (joined `>` lines, locator kept) into the draft along the R2 §3 ladder. The best
 * fragment wins by rung then length. A line hint is tried first on its own block and used as a
 * last-resort rung; a fuzzy hit that lands on the hinted block gets the 0.75 agreement floor. When
 * nothing clears, the first `§<n>` resolves to that section's heading block at 0.4; still nothing →
 * `rung: "none"`, `anchor: null` (the claim omits `anchor` — `unanchored` is never emitted).
 */
export function anchorQuote(
  text: string,
  draftMarkdown: string,
  options: AnchorOptions = {},
): AnchorResolution {
  const allBlocks = splitMarkdownBlocks(draftMarkdown);
  const { body, references } = splitAtReferences(allBlocks);
  const candidates = options.referenceClaim && references.length > 0 ? references : body;
  const frs = quoteFragments(text);

  // A line hint is tried first on the hinted block (R2 §3 "tried first on the hinted block").
  if (options.lineHint != null) {
    const hinted = lineToBlock(draftMarkdown, allBlocks)(options.lineHint);
    if (hinted) {
      for (const f of frs) {
        const r = matchFragment(f, [hinted]);
        if (r.anchor && (r.method === "exact" || r.method === "normalized")) {
          // "hint-block occurrence" is the exact-multi case when the fragment also lives
          // elsewhere: a globally unique hit keeps 1.0, a hinted occurrence of a recurring
          // fragment is 0.85 (R2 §3 confidence table).
          if (
            r.method === "exact" &&
            candidates.filter((b) => b.text.includes(f)).length > 1
          ) {
            return {
              rung: "exact-multi",
              anchor: { ...r.anchor, confidence: ANCHOR_CONFIDENCE.exactMulti },
              fragmentCount: frs.length,
            };
          }
          return { rung: r.method, anchor: r.anchor, fragmentCount: frs.length };
        }
      }
    }
  }

  let best: { method: string; len?: number; anchor?: Anchor } = { method: "none" };
  for (const f of frs) {
    const r = matchFragment(f, candidates);
    if (
      (RANK[r.method] ?? 0) > (RANK[best.method] ?? 0) ||
      ((RANK[r.method] ?? 0) === (RANK[best.method] ?? 0) && (r.len ?? 0) > (best.len ?? 0))
    ) {
      best = r;
    }
  }

  if (best.anchor) {
    // A fuzzy hit agreeing with the hint block gets the agreement floor.
    if (best.method === "fuzzy" && options.lineHint != null) {
      const hinted = lineToBlock(draftMarkdown, allBlocks)(options.lineHint);
      if (hinted && hinted.blockId === best.anchor.blockId) {
        best.anchor = {
          ...best.anchor,
          confidence: Math.max(best.anchor.confidence, ANCHOR_CONFIDENCE.fuzzyHintFloor),
        };
      }
    }
    return {
      rung: best.method as AnchorRung,
      anchor: best.anchor,
      fragmentCount: frs.length,
    };
  }

  // Last-resort line rung: the hinted block, whole-block anchor at 0.5.
  if (options.lineHint != null) {
    const hinted = lineToBlock(draftMarkdown, candidates)(options.lineHint);
    if (hinted) {
      return {
        rung: "line",
        anchor: wholeBlockAnchor(hinted, ANCHOR_CONFIDENCE.line),
        fragmentCount: frs.length,
      };
    }
  }

  // Section-heading fallback: `§<n>` in the quote locates that section's heading block at 0.4.
  const section = sectionHeadingBlock(text, candidates);
  if (section) {
    return {
      rung: "section",
      anchor: wholeBlockAnchor(section, ANCHOR_CONFIDENCE.section),
      fragmentCount: frs.length,
    };
  }

  return { rung: "none", anchor: null, fragmentCount: frs.length };
}
