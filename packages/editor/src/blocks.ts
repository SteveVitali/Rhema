import {
  buildBlockIdMap,
  blockContentHash,
  normalizeText,
  splitMarkdownBlocks,
  type BlockIdMapEntry,
} from "@rhema/findings-core";

// The block-id sidecar's load path (P1.02; §5.4). Each version stores `{blockId → (ordinal,
// contentHash)}` BESIDE the markdown — never in it. On load the ids are RE-DERIVED against the live
// text by hash + ordinal with a small fuzzy step for edited blocks:
//   1. hash   — a block whose normalized content-hash matches a stored entry keeps that entry's id,
//               even when it moved (a moved paragraph is the same block);
//   2. ordinal — an unmatched block takes the unmatched stored id at the SAME ordinal when one's free
//               (the common in-place edit);
//   3. fuzzy   — otherwise the nearest unmatched stored ordinal within ±FUZZY_ORDINAL_RANGE claims it
//               (an edit that shifted neighbours by one block still keeps ids stable);
//   4. fresh   — never-seen blocks get new ids past the stored maximum (`b<max+1>…`), so ids never
//               collide and a later save's sidecar reuses them.
// Result: a light edit keeps every old id resolvable — finding anchors written against vN's ids still
// land on v(N+1)'s blocks (the anchor ladder then locates the quote inside the block).

export interface RederivedBlocks {
  /** the live doc's sidecar — same `{blockId → (ordinal, contentHash)}` shape the version row stores. */
  readonly map: Record<string, BlockIdMapEntry>;
  /** current positional block index (0-based) → its block id, in document order. */
  readonly idsInOrder: readonly string[];
  /** current block index → the stored block id it inherited, when the assignment wasn't fresh. */
  readonly inherited: ReadonlyMap<number, string>;
}

const FUZZY_ORDINAL_RANGE = 2;

/**
 * Re-derive block ids for `markdown` against a stored sidecar map (absent → fresh positional ids,
 * the same map `buildBlockIdMap` writes at save).
 *
 * `prevTexts` — `{blockId → the stored version's block text}` — arms the fuzzy step with content:
 * a candidate must clear the FUZZY similarity floor (the same coverage measure the anchor ladder
 * uses) instead of blindly claiming the nearest ordinal. With it, an INSERTED block (zero overlap
 * with everything stored) correctly gets a fresh id while the EDITED block it displaced keeps its
 * id; without it the step is ordinal-distance only.
 */
export function rederiveBlockIds(
  markdown: string,
  stored: Readonly<Record<string, BlockIdMapEntry>> | null | undefined,
  prevTexts?: Readonly<Record<string, string>> | null,
): RederivedBlocks {
  const blocks = splitMarkdownBlocks(markdown);
  if (!stored || Object.keys(stored).length === 0) {
    const map = buildBlockIdMap(markdown);
    return { map, idsInOrder: blocks.map((b) => b.blockId), inherited: new Map() };
  }

  const byHash = new Map<string, string>(); // contentHash → stored blockId (first wins)
  for (const [id, e] of Object.entries(stored)) if (!byHash.has(e.contentHash)) byHash.set(e.contentHash, id);
  const byOrdinal = new Map<number, string>();
  for (const [id, e] of Object.entries(stored)) if (!byOrdinal.has(e.ordinal)) byOrdinal.set(e.ordinal, id);

  const usedStored = new Set<string>();
  const idsInOrder: string[] = new Array(blocks.length).fill("");
  const inherited = new Map<number, string>();
  const map: Record<string, BlockIdMapEntry> = {};

  const claim = (blockIdx: number, id: string, contentHash: string, ordinal: number) => {
    idsInOrder[blockIdx] = id;
    usedStored.add(id);
    inherited.set(blockIdx, id);
    map[id] = { ordinal, contentHash };
  };

  // pass 1 — hash
  for (let i = 0; i < blocks.length; i++) {
    const h = blockContentHash(blocks[i]!.text);
    const id = byHash.get(h);
    if (id && !usedStored.has(id)) claim(i, id, h, blocks[i]!.index);
  }
  // The word-coverage floor the ordinal passes apply when `prevTexts` is available — an in-place
  // EDIT keeps ≥half its predecessor's words (and claims the id); a fresh insertion at a vacated
  // ordinal has ~zero overlap (and must NOT claim — a mis-claimed id would point a stored anchor's
  // block hint at foreign text).
  const FUZZY_SIMILARITY_FLOOR = 0.5;
  const eligible = (id: string, text: string): boolean => {
    const prev = prevTexts?.[id];
    return prev == null || blockSimilarity(text, prev) >= FUZZY_SIMILARITY_FLOOR;
  };

  // pass 2 — same-ordinal (the in-place edit)
  for (let i = 0; i < blocks.length; i++) {
    if (idsInOrder[i]) continue;
    const id = byOrdinal.get(blocks[i]!.index);
    if (id && !usedStored.has(id) && eligible(id, blocks[i]!.text)) {
      claim(i, id, blockContentHash(blocks[i]!.text), blocks[i]!.index);
    }
  }
  // pass 3 — the fuzzy edited-block step: nearest unmatched stored id within ±FUZZY_ORDINAL_RANGE,
  // similarity-ranked when `prevTexts` is armed (the edited block out-scores an interloping insertion).
  for (let i = 0; i < blocks.length; i++) {
    if (idsInOrder[i]) continue;
    const ord = blocks[i]!.index;
    let best: { id: string; d: number; sim: number } | null = null;
    for (const [id, e] of Object.entries(stored)) {
      if (usedStored.has(id)) continue;
      const d = Math.abs(e.ordinal - ord);
      if (d > FUZZY_ORDINAL_RANGE || !eligible(id, blocks[i]!.text)) continue;
      const sim = prevTexts?.[id] != null ? blockSimilarity(blocks[i]!.text, prevTexts[id]!) : 1;
      if (!best || sim > best.sim || (sim === best.sim && d < best.d)) best = { id, d, sim };
    }
    if (best) claim(i, best.id, blockContentHash(blocks[i]!.text), ord);
  }
  // pass 4 — fresh ids for never-seen blocks.
  let maxId = 0;
  for (const id of Object.keys(stored)) {
    const m = /^b(\d+)$/.exec(id);
    if (m) maxId = Math.max(maxId, Number(m[1]));
  }
  let fresh = maxId;
  for (let i = 0; i < blocks.length; i++) {
    if (idsInOrder[i]) continue;
    const id = `b${++fresh}`;
    idsInOrder[i] = id;
    map[id] = { ordinal: blocks[i]!.index, contentHash: blockContentHash(blocks[i]!.text) };
  }

  return { map, idsInOrder, inherited };
}

/** Word coverage of `b` by `a` — the shared fuzzy-similarity measure used by tests + re-derivation. */
export function blockSimilarity(a: string, b: string): number {
  const wa = normalizeText(a).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  if (wa.length === 0) return 0;
  const wb = new Set(normalizeText(b).toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(Boolean));
  let hit = 0;
  for (const w of wa) if (wb.has(w)) hit += 1;
  return hit / wa.length;
}
