// The M17 block-patch apply path (P1.03; REQ-MOBILE-6; §10.2 — the mobile client itself is 1.x).
// The block view cuts the working head's live document into the sidecar's stable `{blockId, kind,
// markdown, hash}` rows (ids/hashes are the same `buildBlockIdMap`/`blockContentHash` the version
// sidecar uses — never marks in the text). A patch is a single-block replacement guarded by
// `baseHash`: splice the block's canonical-markdown span, re-parse, and apply through
// `updateYFragment` inside a `directConnection.transact` so the change enters the Yjs document as
// one transaction tagged `human_mobile` (provenance materializes that source on the next store).
// Refusals are wire errors: `hash_mismatch`/`frozen_head`/`locked` → 409, `block_not_found` → 404.

import * as Y from "yjs";
import { updateYFragment, yDocToProsemirror } from "y-prosemirror";
import {
  blockContentHash,
  buildBlockIdMap,
  splitMarkdownBlocks,
} from "@rhema/findings-core";
import { buildDocMap, markdownToDoc, pageSchema } from "@rhema/editor";
import {
  BLOCK_PATCH_ERRORS,
  isHumanEditableDraftOrigin,
  type BlockPatchError,
  type DocumentBlock,
} from "@rhema/contracts";
import { resolveDraftBinding, type DraftBinding } from "./auth.js";
import { docToCanonicalMarkdown, pageFragment } from "@rhema/editor";
import type { CollabDb } from "./sql.js";

/** A Y.Doc accessor the route calls — the in-memory Document if connected, else load from y_state. */
export type BlockDocSource = (
  documentName: string,
) => Promise<{ doc: Y.Doc; release: () => Promise<void> }>;

export interface BlockView {
  readonly binding: DraftBinding;
  readonly blocks: readonly DocumentBlock[];
}

export type BlockPatchOutcome =
  | { readonly ok: true; readonly blockId: string; readonly hash: string }
  | { readonly ok: false; readonly error: BlockPatchError; readonly status: 404 | 409 };

/** The block kind is the PM node-type name of the block's first top-level node (the contract's
 *  "kind" is the editor's vocabulary, not a markdown heuristic). Falls back to 'paragraph' when the
 *  docmap can't prove alignment (a degraded view still answers; the hash stays the guard). */
function blockKind(byId: ReturnType<typeof buildDocMap>["byBlockId"], blockId: string): string {
  return byId.get(blockId)?.nodes[0]?.node.type.name ?? "paragraph";
}

/**
 * Cut the document's block view: the sidecar `{blockId → (ordinal, contentHash)}` over the current
 * canonical markdown, each row carrying the block's trimmed markdown + PM kind.
 */
export function blocksForDocument(doc: Y.Doc): readonly DocumentBlock[] {
  const md = docToCanonicalMarkdown(doc);
  const pm = yDocToProsemirror(pageSchema, doc);
  const map = buildDocMap(pm, md);
  const sidecar = buildBlockIdMap(md);
  return splitMarkdownBlocks(md).map((b) => ({
    blockId: b.blockId,
    kind: blockKind(map.byBlockId, b.blockId),
    markdown: b.text,
    hash: sidecar[b.blockId]?.contentHash ?? blockContentHash(b.text),
  }));
}

/**
 * Apply one block patch: splice the guarded span out of the canonical markdown and re-render the
 * whole document into the Yjs fragment in a single transaction (updateYFragment diffs, so unchanged
 * blocks keep their Y items — cursors/anchors on untouched text survive). The caller owns the
 * connection lifecycle (disconnect() after this resolves flushes the store hooks).
 */
export async function applyBlockPatchToDoc(
  doc: Y.Doc,
  args: { blockId: string; baseHash: string; markdown: string },
): Promise<BlockPatchOutcome> {
  const md = docToCanonicalMarkdown(doc);
  const blocks = splitMarkdownBlocks(md);
  const target = blocks.find((b) => b.blockId === args.blockId);
  if (!target) {
    return { ok: false, error: BLOCK_PATCH_ERRORS.blockNotFound, status: 404 };
  }
  if (blockContentHash(target.text) !== args.baseHash) {
    return { ok: false, error: BLOCK_PATCH_ERRORS.hashMismatch, status: 409 };
  }

  const nextMd = md.slice(0, target.startOffset) + args.markdown.trim() + md.slice(target.endOffset);
  const nextPm = markdownToDoc(nextMd);
  // updateYFragment diffs pm vs the shared type — unchanged blocks keep their Y items (anchors hold).
  const meta = { mapping: new Map(), isOMark: new Map() };
  doc.transact(() => {
    updateYFragment(doc, pageFragment(doc), nextPm, meta);
  }, "human_mobile");

  // The applied block's NEW identity: same ordinal position in the re-split (a multi-block patch
  // shifts later ids — the response's hash is the client's next baseHash for THIS block slot).
  const nextBlocks = splitMarkdownBlocks(docToCanonicalMarkdown(doc));
  const applied = nextBlocks.find((b) => b.index === target.index) ?? nextBlocks[0];
  return {
    ok: true,
    blockId: applied?.blockId ?? args.blockId,
    hash: applied ? blockContentHash(applied.text) : "",
  };
}

/**
 * The route's guard half (the HTTP handler composes this): resolve the draft under the tenant and
 * refuse the wire's 409s BEFORE the doc is touched — frozen heads never fork through this path
 * (§10.2: the mobile client is told to edit on the web to start v(N+1)).
 */
export async function blockPatchGuards(
  db: CollabDb,
  workspaceId: string,
  draftId: string,
): Promise<{ ok: true; binding: DraftBinding } | { ok: false; error: BlockPatchError; status: 404 | 409 }> {
  return db.scoped(workspaceId, async (tx) => {
    const binding = await resolveDraftBinding(tx, workspaceId, draftId);
    if (!binding) return { ok: false, error: BLOCK_PATCH_ERRORS.blockNotFound, status: 404 as const };
    if (binding.lock) return { ok: false, error: BLOCK_PATCH_ERRORS.locked, status: 409 as const };
    if (binding.state === "frozen" || !isHumanEditableDraftOrigin(binding.origin)) {
      return { ok: false, error: BLOCK_PATCH_ERRORS.frozenHead, status: 409 as const };
    }
    return { ok: true, binding };
  });
}
