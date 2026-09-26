import type { Anchor, ProvenanceSource } from "@rhema/contracts";
import { normalizeText, resolveAnchor, type AnchorMethod, type PassageBlock } from "./anchor.js";
import { diffMarkdown, splitMarkdownBlocks, type DiffBlock } from "./what-changed.js";

// Manual-revision projections + provenance (PRB.07; §5.4, §11.6, REQ-DATA-24/26/29). The pure half of the
// beta source-editing seam: re-anchor a review's findings onto a human-edited head (the SAME ladder the
// dossier and What-changed use — `resolveAnchor`), compute the block-level provenance map a human revision
// emits at materialization (`human` on every touched block; unchanged blocks inherit their base span), and
// build the §5.4 stable-block-id sidecar `{blockId → (ordinal, contentHash)}` that keeps ids OUT of the
// canonical markdown (REQ-DATA-29's stripping rule — provenance is never serialized into the text).

// ---------------------------------------------------------------------------------------------------------------------
// finding projection — "findings follow the text" (§5.4)
// ---------------------------------------------------------------------------------------------------------------------

export interface FindingProjectionResult {
  readonly findingId: string;
  /** the projection row appended to `findings.projections` (§11.3 `findingProjectionSchema` shape). */
  readonly anchor: Anchor;
  /** the ladder rung the projection resolved on (informative; "unresolved" ⇒ `lost`). */
  readonly method: AnchorMethod;
  /**
   * true when the finding HAD a resolvable anchor and the edit cleared every rung — the projection goes to
   * Whole piece ("passage changed — still applies?") and the finding is a REQ-DATA-26 `mooted` candidate at
   * the next Revise's triage. A finding that was already unanchored stays unanchored (`lost: false`).
   */
  readonly lost: boolean;
}

/**
 * Project one finding's anchor onto edited markdown. Resolution uses `resolveAnchor` verbatim so the same
 * quote that anchored the review lands on the same words after an edit (exact → normalized → fuzzy). An
 * unresolved anchor projects as `unanchored: true` — the finding is NEVER dropped (§5.4 Whole piece).
 */
export function projectFindingAnchor(
  anchor: Anchor | null | undefined,
  blocks: readonly PassageBlock[],
): Omit<FindingProjectionResult, "findingId"> {
  const res = resolveAnchor(anchor, blocks);
  switch (res.method) {
    case "exact":
    case "normalized":
      return {
        method: res.method,
        lost: false,
        anchor: {
          blockId: res.blockId!,
          quote: anchor!.quote,
          startOffset: res.startOffset ?? anchor!.startOffset,
          endOffset: res.endOffset ?? anchor!.endOffset,
          confidence: res.confidence,
        },
      };
    case "fuzzy":
      // fuzzy resolves to a BLOCK, not a span — the projection covers the block's range.
      return {
        method: res.method,
        lost: false,
        anchor: {
          blockId: res.blockId!,
          quote: anchor!.quote,
          startOffset: 0,
          endOffset: blocks.find((b) => b.blockId === res.blockId)?.text.length ?? anchor!.endOffset,
          confidence: res.confidence,
        },
      };
    case "unresolved":
      return {
        method: res.method,
        lost: true,
        anchor: {
          blockId: anchor!.blockId,
          quote: anchor!.quote,
          startOffset: anchor!.startOffset,
          endOffset: anchor!.endOffset,
          confidence: anchor!.confidence,
          unanchored: true,
        },
      };
    default:
      // already unanchored (or anchor-less): the projection is the whole piece — unchanged semantics.
      return {
        method: "unanchored",
        lost: false,
        anchor: {
          blockId: anchor?.blockId ?? "b1",
          quote: anchor?.quote ?? "",
          startOffset: anchor?.startOffset ?? 0,
          endOffset: anchor?.endOffset ?? 0,
          confidence: anchor?.confidence ?? 0,
          unanchored: true,
        },
      };
  }
}

/** Project every finding's anchor onto the edited head's blocks (deterministic input order preserved). */
export function projectFindingsOntoMarkdown(
  findings: readonly { readonly id: string; readonly anchor?: Anchor | null }[],
  markdown: string,
): FindingProjectionResult[] {
  const blocks = splitMarkdownBlocks(markdown);
  return findings.map((f) => ({ findingId: f.id, ...projectFindingAnchor(f.anchor, blocks) }));
}

// ---------------------------------------------------------------------------------------------------------------------
// block-level provenance (§5.4; REQ-DATA-29 block half)
// ---------------------------------------------------------------------------------------------------------------------

/** One span of a `provenance_maps.spans` row — block-granular at MVP (§5.4; span capture rides P1.02). */
export interface ProvenanceSpan {
  readonly blockId: string;
  readonly source: ProvenanceSource;
}

/** A base version's provenance, for inheritance: content-hash → the source that wrote the block. */
export interface ProvenanceBase {
  /** the base version's `provenance_maps.spans` rows (may be absent for a pre-provenance version). */
  readonly spans?: readonly ProvenanceSpan[] | null;
  /** the base version's block-id map (`{blockId → {ordinal, contentHash}}`) — pairs with `spans`. */
  readonly blockIdMap?: Readonly<Record<string, { ordinal: number; contentHash: string }>> | null;
  /**
   * Fallback source for an unchanged block the base map doesn't cover (a version written before maps
   * existed) — the caller derives it from the base version's `created_by` actor.
   */
  readonly fallbackSource: ProvenanceSource;
}

/**
 * The block-level provenance map a human revision emits (§5.4; REQ-DATA-29). Every after-block inside a diff
 * hunk is `human` (the person typed it); every unchanged block inherits its base span — matched by content
 * hash through the base's block-id sidecar so a positional shift (an inserted block above) doesn't cost the
 * block its attribution. When the base carried no map, the caller's `fallbackSource` (the base version's
 * `created_by`) supplies the inheritance. The output covers EVERY after-block — no orphan spans.
 */
export function humanRevisionProvenance(
  beforeMd: string,
  afterMd: string,
  base: ProvenanceBase,
): ProvenanceSpan[] {
  const diff = diffMarkdown(beforeMd, afterMd);
  const changed = new Set<string>();
  for (const h of diff.hunks) for (const b of h.after) changed.add(b.blockId);

  // base provenance by content hash (the sidecar's contentHash keys the SAME normalized text this emits).
  const byHash = new Map<string, ProvenanceSource>();
  if (base.spans && base.blockIdMap) {
    const sourceByBlock = new Map(base.spans.map((s) => [s.blockId, s.source]));
    for (const [blockId, meta] of Object.entries(base.blockIdMap)) {
      const src = sourceByBlock.get(blockId);
      if (src && !byHash.has(meta.contentHash)) byHash.set(meta.contentHash, src);
    }
  }

  return diff.afterBlocks.map((b) => ({
    blockId: b.blockId,
    source: changed.has(b.blockId)
      ? { kind: "human" }
      : (byHash.get(blockContentHash(b.text)) ?? base.fallbackSource),
  }));
}

// ---------------------------------------------------------------------------------------------------------------------
// the stable-block-id sidecar (§5.4: "{blockId → (ordinal, contentHash)} stored with each version")
// ---------------------------------------------------------------------------------------------------------------------

/**
 * A small stable content hash for block ids (FNV-1a 64-bit over the NORMALIZED block text — whitespace and
 * quote/dash drift don't rekey a block, matching the diff's unchanged spine). Pure TS — no crypto — so the
 * map is deterministic everywhere (browser bundle included). NOT a security hash; it only identifies
 * "same text" within a version's sidecar.
 */
export function blockContentHash(text: string): string {
  const s = normalizeText(text);
  // 64-bit FNV-1a over UTF-16 code units, hex-encoded.
  let h = 0xcbf29ce484222325n;
  for (let i = 0; i < s.length; i++) {
    h ^= BigInt(s.charCodeAt(i));
    h = BigInt.asUintN(64, h * 0x100000001b3n);
  }
  return h.toString(16).padStart(16, "0");
}

export interface BlockIdMapEntry {
  readonly ordinal: number;
  readonly contentHash: string;
}

/** Build the `{blockId → (ordinal, contentHash)}` sidecar for a version's canonical markdown (§5.4). */
export function buildBlockIdMap(markdown: string): Record<string, BlockIdMapEntry> {
  const out: Record<string, BlockIdMapEntry> = {};
  for (const b of splitMarkdownBlocks(markdown)) {
    out[b.blockId] = { ordinal: b.index, contentHash: blockContentHash(b.text) };
  }
  return out;
}

/** The after-block ids a human revision touched (every `after` block of every hunk — edited or added). */
export function editedAfterBlockIds(beforeMd: string, afterMd: string): Set<string> {
  const out = new Set<string>();
  for (const h of diffMarkdown(beforeMd, afterMd).hunks) for (const b of h.after) out.add(b.blockId);
  return out;
}

/** The blocks of a markdown text in the ladder's `PassageBlock` shape (a convenience for callers). */
export function passageBlocks(markdown: string): readonly DiffBlock[] {
  return splitMarkdownBlocks(markdown);
}
