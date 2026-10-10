// packages/editor/src/source-mode.ts — the source-mode commit core (REQ-ED-17; design/30; the R20
// "revive as a designed feature" ruling). Source mode is an alternate PROJECTION over the live PM
// EditorState — never a second document. This module owns the markdown⇄doc seam and the commit
// transaction shape:
//
//   * `diffTopBlocks` aligns two docs by top-level-block equality — longest-common-subsequence over
//     `node.eq` (≤200k cells; larger falls back to a single prefix/suffix run). The diff is what
//     keeps provenance honest: a commit touches only the blocks the markdown edit actually changed,
//     so `touchedRanges`/`touchedBlockIds` (provenance.ts) stamp those — and only those — `human`.
//   * `applySourceMarkdown` is a three-way merge at top-level-block granularity: the caller keeps
//     `base` (the doc the buffer was last committed/seeded from). USER runs = base→next; FOREIGN
//     runs = base→cur (remote collab writes, proposal accepts, restores — anything that landed on
//     the live doc while the buffer drifted). User runs apply to `cur` translated past kept foreign
//     runs; a foreign run overlapping a user run drops (last-writer-wins per overlapping run — the
//     stale note warns the user). Foreign writes in blocks the user didn't touch survive the commit.
//   * The tr carries `ORIGIN_META` ("human" | "pasted") + `SOURCE_EDIT_META` (the bridge's own-echo
//     filter). Returning null when buffer == base keeps normalization-only churn and remote-echo
//     no-ops off the undo stack and off provenance entirely.
//
// The caller (apps/web page-source-mode.ts) owns timing (debounce + flush points), the CodeMirror
// buffer, and the base-doc bookkeeping; nothing here touches the DOM or transports — the same
// "framework-free" posture as collab.ts.

import type { Node as PMNode } from "prosemirror-model";
import type { EditorState, Transaction } from "prosemirror-state";
import type { EditOrigin } from "./provenance.js";
import { humanTr } from "./plugins.js";

/**
 * `tr.getMeta(SOURCE_EDIT_META)` — true on transactions a source-mode commit produced. The mount's
 * `onTransaction` bridge uses it to skip its own echo (the CM buffer is already the commit's
 * source; re-seeding it would clobber caret/history mid-type).
 */
export const SOURCE_EDIT_META = "rhema:source-edit";

/** One contiguous unmatched run: replace the base doc's children `[fromIndex, toIndex)` with `insert`. */
export interface SourceEditRun {
  readonly fromIndex: number;
  readonly toIndex: number;
  readonly insert: readonly PMNode[];
}

const LCS_CELL_LIMIT = 200_000; // ~500×400 top-level blocks; beyond that fall back to one run

function topChildren(doc: PMNode): PMNode[] {
  const out: PMNode[] = [];
  doc.forEach((n) => out.push(n));
  return out;
}

/** The content-coordinate boundary BEFORE child `index` (index == childCount → content end). */
function offsetAt(doc: PMNode, index: number): number {
  let pos = 0;
  doc.forEach((child, off, i) => {
    if (i < index) pos = off + child.nodeSize;
  });
  return pos;
}

/**
 * Diff two PM docs at top-level-block granularity. Runs are in ascending order and disjoint;
 * empty `insert` = pure deletion, `fromIndex === toIndex` = pure insertion. Direction: what `cur`
 * needs to become `next`.
 */
export function diffTopBlocks(cur: PMNode, next: PMNode, cellLimit = LCS_CELL_LIMIT): SourceEditRun[] {
  const a = topChildren(cur);
  const b = topChildren(next);
  const m = a.length;
  const n = b.length;
  if (m === 0 && n === 0) return [];

  // Fast path: shared prefix/suffix — by far the common case (one paragraph edited).
  let p = 0;
  while (p < m && p < n && a[p]!.eq(b[p]!)) p++;
  let s = 0;
  while (s < m - p && s < n - p && a[m - 1 - s]!.eq(b[n - 1 - s]!)) s++;
  const midA = m - p - s;
  const midB = n - p - s;
  if (midA === 0 && midB === 0) return [];
  if (m * n > cellLimit || midA * midB === 0) {
    // Oversized docs (or a pure insert/delete middle) don't get an LCS table — one run still lands
    // the same document, just with coarser touched-ranges for provenance.
    return [{ fromIndex: p, toIndex: m - s, insert: b.slice(p, n - s) }];
  }

  // LCS over the unmatched middles: dp[i][j] = matches in a[p..p+i) × b[p..p+j). Backtrack yields
  // the matched anchors; gaps between consecutive anchors are the runs.
  const dp = new Uint32Array((midA + 1) * (midB + 1));
  const at = (i: number, j: number) => i * (midB + 1) + j;
  for (let i = 1; i <= midA; i++) {
    for (let j = 1; j <= midB; j++) {
      dp[at(i, j)] = a[p + i - 1]!.eq(b[p + j - 1]!)
        ? dp[at(i - 1, j - 1)]! + 1
        : Math.max(dp[at(i - 1, j)]!, dp[at(i, j - 1)]!);
    }
  }
  const anchors: Array<[number, number]> = [];
  for (let i = midA, j = midB; i > 0 && j > 0; ) {
    if (a[p + i - 1]!.eq(b[p + j - 1]!)) {
      anchors.push([p + i - 1, p + j - 1]);
      i--;
      j--;
    } else if (dp[at(i - 1, j)]! >= dp[at(i, j - 1)]!) i--;
    else j--;
  }
  anchors.reverse();

  const runs: SourceEditRun[] = [];
  let i = p;
  let j = p;
  for (const [ai, bj] of anchors) {
    if (i < ai || j < bj) runs.push({ fromIndex: i, toIndex: ai, insert: b.slice(j, bj) });
    i = ai + 1;
    j = bj + 1;
  }
  if (i < m - s || j < n - s) runs.push({ fromIndex: i, toIndex: m - s, insert: b.slice(j, n - s) });
  return runs;
}

/**
 * Build the commit transaction for a source buffer (already parsed to `next`) against the live
 * `state`, merging past foreign changes since `base` — or null when the buffer equals `base`
 * (nothing net-new to commit; foreign writes are already in `cur`). Positions translate through
 * kept foreign runs so user edits land at the right blocks; overlapping runs resolve local-wins.
 */
export function applySourceMarkdown(
  state: EditorState,
  next: PMNode,
  base: PMNode,
  origin: Extract<EditOrigin, "human" | "pasted"> = "human",
): Transaction | null {
  const userRuns = diffTopBlocks(base, next);
  if (userRuns.length === 0) return null;
  const cur = state.doc;
  // Foreign runs in base coordinates; a run overlapping any user run drops — the local buffer wins
  // that region (the mount surfaces the loss via the stale note).
  const foreignRuns = diffTopBlocks(base, cur).filter(
    (f) => !userRuns.some((u) => u.fromIndex < f.toIndex && f.fromIndex < u.toIndex),
  );
  // base-index boundary → cur-index boundary, shifted by kept foreign runs. Asymmetric by design:
  // a foreign INSERTION at boundary i counts for a run STARTING at i (the foreign block precedes the
  // user's content) but not for a run ENDING at i (it belongs to the region after).
  const curStart = (i: number): number => {
    let d = 0;
    for (const f of foreignRuns) {
      if (f.toIndex <= i) d += f.insert.length - (f.toIndex - f.fromIndex);
    }
    return i + d;
  };
  const curEnd = (i: number): number => {
    let d = 0;
    for (const f of foreignRuns) {
      if (f.fromIndex < i) d += f.insert.length - (f.toIndex - f.fromIndex);
    }
    return i + d;
  };
  const tr = humanTr(state.tr, origin).setMeta(SOURCE_EDIT_META, true);
  // Apply back-to-front so earlier run positions stay valid in `cur`'s coordinates.
  for (let k = userRuns.length - 1; k >= 0; k--) {
    const u = userRuns[k]!;
    const from = offsetAt(cur, curStart(u.fromIndex));
    const to = offsetAt(cur, curEnd(u.toIndex));
    if (u.insert.length === 0) tr.delete(from, to);
    else tr.replaceWith(from, to, u.insert as PMNode[]);
  }
  return tr;
}
