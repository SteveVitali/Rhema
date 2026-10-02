// The Page doc's Yjs ⟷ canonical-markdown bridge (P1.03; moved from @rhema/collab in P1.08 so the
// api's restore-preview/apply path reuses it). The shared Y.XmlFragment lives at the `prosemirror`
// key (the y-prosemirror default — the client's ySyncPlugin binds the same fragment). Seeding
// converts canonical markdown → PM doc → a Y.Doc whose state becomes `live_docs.y_state`;
// materialization runs the other direction through the SAME `docToMarkdown` the Page's
// schema-first serializer owns, so the stored markdown is byte-identical to the HTTP save path's.

import * as Y from "yjs";
import { prosemirrorToYDoc, yDocToProsemirror } from "y-prosemirror";
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

/** The document's canonical markdown — the materialization's output (§11.4 materialized markdown). */
export function docToCanonicalMarkdown(doc: Y.Doc): string {
  const pmDoc = yDocToProsemirror(pageSchema, doc);
  return docToMarkdown(pmDoc);
}
