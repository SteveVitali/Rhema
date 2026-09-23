import type { Transaction } from "prosemirror-state";
import type { Node as PMNode } from "prosemirror-model";
import { markdownToSlice } from "./md-to-pm.js";
import { ORIGIN_META, type EditOrigin } from "./provenance.js";

// The proposal card's document mechanics (P1.02; REQ-IDE-45 amended, REQ-DATA-28 amended,
// REQ-CHAT-19's primitive). An agent-origin in-place change (Assistant suggestion ≤1 paragraph,
// Figure insert, Apply replacement) arrives as a card anchored to a span/block beside the Page.
//
//   accept — applies ONE plain PM transaction tagged `agent:<seat>:<run>` and EXCLUDED from the
//            human's undo stack (`addToHistory: false` — ⌘Z walks the user's own edits only, §5.12).
//            The applied content is not undoable; the human's own prior edits still undo normally.
//   reject — returns the state untouched; the card dismisses and the document is provably identical
//            (markdown bytes unchanged).
//
// No suggestion marks anywhere — Line edit's mark machinery is 1.x (REQ-DATA-28 amended).

export interface Proposal {
  readonly id: string;
  /** "replace" covers a span with the fragment; "insert" splices it at the anchor. */
  readonly kind: "replace" | "insert";
  /** PM range the proposal targets (the anchored span); for "insert", `from` is the splice point. */
  readonly from: number;
  readonly to: number;
  /** the replacement/insert content as Rhema Markdown (parsed through the same md→PM path). */
  readonly markdown: string;
  /** the agent origin the accept transaction carries — `agent:<seat>:<runId>` (e.g. `agent:assistant:run_…`). */
  readonly origin: EditOrigin;
  /** card copy (SSR-rendered outside the doc). */
  readonly label?: string;
}

/**
 * Build the accept transaction: one plain tr replacing/inserting the proposal's fragment at its
 * anchor. Marked `ORIGIN_META` (provenance + span capture pick it up) and `addToHistory: false`
 * (prosemirror-history skips it — the human's undo stack never contains agent edits).
 */
export function acceptProposalTr(doc: PMNode, tr: Transaction, proposal: Proposal): Transaction {
  const slice = markdownToSlice(proposal.markdown);
  const t = proposal.kind === "insert"
    ? tr.insert(proposal.from, slice.content)
    : tr.replace(proposal.from, proposal.to, slice);
  t.setMeta(ORIGIN_META, proposal.origin);
  t.setMeta("addToHistory", false);
  t.setMeta("rhema:proposal", { id: proposal.id, action: "accept" });
  t.scrollIntoView();
  return t;
}

/** Reject is a no-op on the document — the caller just drops the card (nothing is dispatched). */
export function rejectProposal(doc: PMNode, proposal: Proposal): PMNode {
  void proposal;
  return doc;
}

/** A proposal whose anchor is a whole BLOCK — the card-anchored default at MVP. */
export function blockProposal(
  id: string,
  blockRange: { from: number; to: number },
  markdown: string,
  origin: EditOrigin,
  kind: "replace" | "insert" = "replace",
): Proposal {
  return { id, kind, from: blockRange.from, to: blockRange.to, markdown, origin };
}
