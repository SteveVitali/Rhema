import { normalizeText } from "./anchor.js";

// The word-level diff inside a changed paragraph pair (333_R7UX.10, BL-88; §5.8). The block diff
// (`diffMarkdown`, what-changed.ts) already finds WHICH blocks changed; this module aligns the words
// inside a paired before/after block so the compare view can mark the inserted/deleted *words* while
// the paragraph keeps its tint. Same honest machinery as the block diff and `diffTopBlocks`
// (editor/source-mode.ts): a token-level LCS over a bounded dp table with a shared-prefix/suffix
// fast path — never a fuzzy/semantic diff.
//
// prosemirror-changeset seam (recorded for the 1.x pairing, BL-88): `WordRun` is the 1.x `Change`
// shape — `{fromA, toA, fromB, toB}` half-open offsets mapping a span of the BEFORE text to a span
// of the AFTER text. A 1.x `ChangeSet` can be built from these runs directly (a run's
// `inserted`/`deleted` Span lists are the non-empty side); the renderer needs no other projection.

/** One word-diff token: a word, a whitespace run, or a punctuation/symbol run, with its offsets. */
export interface WordToken {
  readonly text: string;
  readonly start: number;
  readonly end: number;
}

/**
 * One aligned span pair — the prosemirror-changeset `Change` shape. `before.slice(fromA, toA)` maps
 * to `after.slice(fromB, toB)`; `kind` is derivable (`fromA === toA` ⇒ `inserted`,
 * `fromB === toB` ⇒ `deleted`, equal slices ⇒ `same`) and carried for the renderer.
 */
export interface WordRun {
  readonly fromA: number;
  readonly toA: number;
  readonly fromB: number;
  readonly toB: number;
  readonly kind: "same" | "inserted" | "deleted" | "edited";
}

/** Fraction of `a`'s words present in `b` (order-agnostic) — the shared edited-pair heuristic. */
export function wordCoverage(a: string, b: string): number {
  const wa = normalizeText(a).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (wa.length === 0) return 0;
  const wb = new Set(normalizeText(b).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  let hit = 0;
  for (const w of wa) if (wb.has(w)) hit += 1;
  return hit / wa.length;
}

/** Below this coverage two paired blocks are a remove+add, not an edit — no word marks inside. */
export const EDIT_PAIR_FLOOR = 0.25;

/**
 * Should a before/after block pair get word marks? The same floor `diffMarkdown` uses to call a
 * 1-before/1-after region `edited`: below it the pair is a wholesale remove+add and per-word marks
 * would only restate the paragraph-level mark (every word "changed").
 */
export function wordPairable(beforeText: string, afterText: string): boolean {
  return wordCoverage(beforeText, afterText) >= EDIT_PAIR_FLOOR;
}

/** ~1.4k×1.4k tokens — far above any real paragraph pair; past it the middle falls back to one
 *  coarse `edited` run (a ~800 kB dp table is the ceiling the compare view will ever pay). */
export const WORD_DIFF_CELL_LIMIT = 200_000;

/**
 * Split `text` into tokens on word boundaries. Word tokens are letter/number/mark runs extended
 * through intra-word joiners (`don't`, `well-known`, `v1.2`); whitespace and punctuation/symbol
 * runs are their own tokens. Every character is covered exactly once — token offsets concatenate
 * to the source string, so runs can be sliced back out verbatim.
 */
export function tokenizeWords(text: string): WordToken[] {
  const re = /[\p{L}\p{N}\p{M}]+(?:['’_-][\p{L}\p{N}\p{M}]+)*|\s+|[^\s\p{L}\p{N}\p{M}'’_-]+|./gu;
  const tokens: WordToken[] = [];
  for (const m of text.matchAll(re)) tokens.push({ text: m[0], start: m.index, end: m.index + m[0].length });
  return tokens;
}

/**
 * The word-level diff `before → after` as aligned runs covering both strings in order. Identical
 * input is the no-change fast path (one `same` run); a pure insertion/deletion emits one
 * `inserted`/`deleted` run; otherwise a token-level LCS over the unmatched middle anchors the
 * `same` runs and the gaps between anchors are the marked runs. Over `cellLimit` token pairs the
 * unmatched middle degrades to a single coarse `edited` run — still truthful, just not per-word.
 */
export function diffWords(before: string, after: string, cellLimit = WORD_DIFF_CELL_LIMIT): WordRun[] {
  if (before === after) {
    return before === "" ? [] : [{ fromA: 0, toA: before.length, fromB: 0, toB: after.length, kind: "same" }];
  }
  const a = tokenizeWords(before);
  const b = tokenizeWords(after);
  // Offset helpers take token BOUNDS only — aPos(i) is the offset before token i (before.length at
  // the tail). Every char is covered exactly once, so the offset after token i−1 IS aPos(i); taking
  // bounds never indexes −1 when a gap is empty on one side (an insertion at offset 0).
  const aPos = (i: number) => (i < a.length ? a[i]!.start : before.length); // offset before token i
  const bPos = (i: number) => (i < b.length ? b[i]!.start : after.length);

  // shared prefix/suffix on exact token text — the common case (a few words edited mid-paragraph).
  let p = 0;
  while (p < a.length && p < b.length && a[p]!.text === b[p]!.text) p++;
  let s = 0;
  while (s < a.length - p && s < b.length - p && a[a.length - 1 - s]!.text === b[b.length - 1 - s]!.text) s++;
  const midA = a.length - p - s;
  const midB = b.length - p - s;

  const runs: WordRun[] = [];
  const push = (fromA: number, toA: number, fromB: number, toB: number) => {
    const kind: WordRun["kind"] =
      fromA === toA ? "inserted" : fromB === toB ? "deleted" : before.slice(fromA, toA) === after.slice(fromB, toB) ? "same" : "edited";
    const last = runs[runs.length - 1];
    // merge with the previous run when the boundary is contiguous and the kind agrees.
    if (last && last.kind === kind && last.toA === fromA && last.toB === fromB) {
      runs[runs.length - 1] = { fromA: last.fromA, toA, fromB: last.fromB, toB, kind };
    } else {
      runs.push({ fromA, toA, fromB, toB, kind });
    }
  };

  if (p > 0) push(0, a[p - 1]!.end, 0, b[p - 1]!.end); // shared prefix → same
  if (midA === 0 && midB === 0) {
    // middles exhausted — only the suffix remains.
  } else if (midA === 0 || midB === 0 || midA * midB > cellLimit) {
    // a pure insert/delete middle, or an oversized pair: one coarse run, never the dp table.
    push(aPos(p), aPos(p + midA), bPos(p), bPos(p + midB));
  } else {
    // LCS over the unmatched middles — dp[i][j] = matches in a[p..p+i) × b[p..p+j).
    const dp = new Uint32Array((midA + 1) * (midB + 1));
    const at = (i: number, j: number) => i * (midB + 1) + j;
    for (let i = 1; i <= midA; i++) {
      for (let j = 1; j <= midB; j++) {
        dp[at(i, j)] = a[p + i - 1]!.text === b[p + j - 1]!.text
          ? dp[at(i - 1, j - 1)]! + 1
          : Math.max(dp[at(i - 1, j)]!, dp[at(i, j - 1)]!);
      }
    }
    const anchors: Array<[number, number]> = [];
    for (let i = midA, j = midB; i > 0 && j > 0; ) {
      if (a[p + i - 1]!.text === b[p + j - 1]!.text) {
        anchors.push([p + i - 1, p + j - 1]);
        i--;
        j--;
      } else if (dp[at(i - 1, j)]! >= dp[at(i, j - 1)]!) i--;
      else j--;
    }
    anchors.reverse();
    let ai = p;
    let bj = p;
    for (const [ma, mb] of anchors) {
      if (ai < ma || bj < mb) push(aPos(ai), aPos(ma), bPos(bj), bPos(mb));
      push(a[ma]!.start, a[ma]!.end, b[mb]!.start, b[mb]!.end); // the matched token → same
      ai = ma + 1;
      bj = mb + 1;
    }
    if (ai < p + midA || bj < p + midB) {
      push(aPos(ai), aPos(p + midA), bPos(bj), bPos(p + midB));
    }
  }
  if (s > 0) push(a[a.length - s]!.start, before.length, b[b.length - s]!.start, after.length); // shared suffix → same
  return runs;
}
