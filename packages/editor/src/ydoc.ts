// The Page doc's Yjs ⟷ canonical-markdown bridge (P1.03; moved from @rhema/collab in P1.08 so the
// api's restore-preview/apply path reuses it). The shared Y.XmlFragment lives at the `prosemirror`
// key (the y-prosemirror default — the client's ySyncPlugin binds the same fragment). Seeding
// converts canonical markdown → PM doc → a Y.Doc whose state becomes `live_docs.y_state`;
// materialization runs the other direction through the SAME `docToMarkdown` the Page's
// schema-first serializer owns, so the stored markdown is byte-identical to the HTTP save path's.

import * as Y from "yjs";
import { prosemirrorToYDoc, updateYFragment, yDocToProsemirror } from "y-prosemirror";
import { docToMarkdown } from "./pm-to-md.js";
import { markdownToDoc } from "./md-to-pm.js";
import { pageSchema } from "./schema.js";

/** The Y.XmlFragment key the ySyncPlugin binds (the y-prosemirror convention). */
export const PAGE_FRAGMENT = "prosemirror";

/** The document's shared fragment (`doc.getXmlFragment(PAGE_FRAGMENT)`). */
export function pageFragment(doc: Y.Doc): Y.XmlFragment {
  return doc.getXmlFragment(PAGE_FRAGMENT);
}

/** Canonical markdown → a Y.Doc state update the server can apply to a fresh Document. */
export function markdownToUpdate(markdown: string): Uint8Array {
  const pmDoc = markdownToDoc(markdown);
  const ydoc = prosemirrorToYDoc(pmDoc, PAGE_FRAGMENT);
  const update = Y.encodeStateAsUpdate(ydoc);
  ydoc.destroy();
  return update;
}

/**
 * R6FIX.2 (F-R6H11-1) — apply `markdown` to an EXISTING doc's shared fragment as ONE
 * transaction: `updateYFragment` diffs the target PM doc against the live fragment, so
 * unchanged blocks keep their Y items (cursors/anchors hold) and removed items TOMBSTONE —
 * a stale replica's copy of them merges as a deletion, never a resurrection. This is the
 * convergent whole-doc replace every out-of-band "make the doc say X" writer must use; a
 * wholesale `y_state` swap of a FRESH doc's update carries no tombstones, so a replica's
 * pre-replace items merge back in and the removed text resurrects (the prod symptom).
 * `origin` tags the transaction (provenance/undo scoping).
 */
export function replaceDocContent(doc: Y.Doc, markdown: string, origin?: unknown): void {
  const pmDoc = markdownToDoc(markdown);
  const meta = { mapping: new Map(), isOMark: new Map() };
  doc.transact(() => updateYFragment(doc, pageFragment(doc), pmDoc, meta), origin);
}

/** The document's canonical markdown — the materialization's output (§11.4 materialized markdown). */
export function docToCanonicalMarkdown(doc: Y.Doc): string {
  const pmDoc = yDocToProsemirror(pageSchema, doc);
  return docToMarkdown(pmDoc);
}
