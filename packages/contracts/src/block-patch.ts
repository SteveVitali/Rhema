// The M17 block-patch contract (REQ-MOBILE-6; §10.2; P1.03 lands the schema + the collab service's
// apply path — the mobile client is 1.x). The mobile light-edit surface receives the working document
// as blocks `{blockId, kind, markdown, hash}` — ids/hashes come from the §5.4 sidecar map, never from
// marks in the text — and saves one block at a time: `PATCH /documents/:id/blocks/:blockId` with
// `{baseHash, markdown}`, applied server-side by a headless ProseMirror behind Hocuspocus in one Yjs
// transaction tagged `human_mobile`, `409` on hash mismatch, refused on a frozen head.

import { z } from "zod";
import { idSchema } from "./ids.js";

/** One block of the working document, as the block view serves it (`hash` = the sidecar contentHash). */
export const documentBlockSchema = z.object({
  /** the sidecar's stable block id (`b<ordinal>`-shaped, from buildBlockIdMap). */
  blockId: z.string(),
  /** the block's kind — the PM node-type name of its first node (paragraph, heading, …). */
  kind: z.string(),
  /** the block's canonical markdown. */
  markdown: z.string(),
  /** the §5.4 sidecar contentHash — the `baseHash` a patch must echo. */
  hash: z.string(),
});
export type DocumentBlock = z.infer<typeof documentBlockSchema>;

/** `GET /documents/:id` — the working document's block view (the mobile editor's read model). */
export const documentBlocksViewSchema = z.object({
  /** the draft (working head) this view was cut from. */
  draftId: idSchema,
  draftN: z.number().int(),
  blocks: z.array(documentBlockSchema),
});
export type DocumentBlocksView = z.infer<typeof documentBlocksViewSchema>;

/** `PATCH /documents/:id/blocks/:blockId` — replace one block iff `baseHash` still matches. */
export const blockPatchRequestSchema = z.object({
  /** the block hash the client read — a drifted head answers 409, never a silent overwrite. */
  baseHash: z.string(),
  /** the replacement markdown for the block. */
  markdown: z.string(),
});
export type BlockPatchRequest = z.infer<typeof blockPatchRequestSchema>;

/** The patch response — the applied block's NEW hash so the client can chain the next patch. */
export const blockPatchResultSchema = z.object({
  draftId: idSchema,
  blockId: z.string(),
  /** the sidecar hash of the block AS APPLIED (the next patch's baseHash). */
  hash: z.string(),
});
export type BlockPatchResult = z.infer<typeof blockPatchResultSchema>;

/** The refusal vocabulary the apply path returns (wire: `{error}` + the HTTP status). */
export const BLOCK_PATCH_ERRORS = {
  /** the block's hash moved under the client — 409, the client re-reads the block view. */
  hashMismatch: "hash_mismatch",
  /** the head is frozen — 409; the client says "Edit on the web to start v(N+1)". */
  frozenHead: "frozen_head",
  /** a run holds the head — 409, same as the web editor's lock. */
  locked: "locked",
  /** no such block on the current head — 404. */
  blockNotFound: "block_not_found",
} as const;
export type BlockPatchError = (typeof BLOCK_PATCH_ERRORS)[keyof typeof BLOCK_PATCH_ERRORS];

/** The frozen-head refusal's user-facing sentence (§10.2 verbatim). */
export const BLOCK_PATCH_FROZEN_MESSAGE =
  "This draft has been reviewed. Edit on the web to start v(N+1).";
