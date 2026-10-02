import type { Anchor, FindingView } from "@rhema/contracts";
import { resolveAnchor } from "./anchor.js";
import { splitMarkdownBlocks } from "./what-changed.js";
import { applyGate, bulkSelect, type ApplyDisabledReason, type BulkAction } from "./surface.js";

// Apply — the free verb (§5.7; REQ-SPEC-6). "The only action inside a dossier that changes the document is
// the suggestion Apply on a finding that carries one — deliberately free: 'Yes, take this one' is the verb
// the second reader is FOR." This module is pure derivation: splice math, per-finding applicability, and
// the one consolidated bulk preview. The api/web layers own persistence (saveManualRevision with a
// `suggestion_applied` provenance mark, the accept·applied disposition, the obligation state machine).

export type SpliceFailureReason = "anchor_lost" | "no_anchor";

export type SpliceResult =
  | { readonly ok: true; readonly markdown: string; readonly blockId: string; readonly method: string }
  | { readonly ok: false; readonly reason: SpliceFailureReason };

/**
 * Splice `replacement` into `markdown` at `anchor`'s resolved span (§5.7 "splice it into the working
 * markdown at the anchor's resolved span"). Resolution follows the same ladder the decorations use
 * (exact → normalized → fuzzy): exact/normalized replace the quoted span inside its block; a fuzzy
 * whole-block match replaces the block's text; `unresolved`/`unanchored` refuse — Apply never guesses.
 */
export function applySuggestionToMarkdown(
  markdown: string,
  anchor: Anchor | null | undefined,
  replacement: string,
): SpliceResult {
  const blocks = splitMarkdownBlocks(markdown);
  const res = resolveAnchor(anchor, blocks);
  if (res.method === "unanchored") return { ok: false, reason: "no_anchor" };
  if (res.method === "unresolved" || res.blockId == null) return { ok: false, reason: "anchor_lost" };
  const block = blocks.find((b) => b.blockId === res.blockId);
  if (block == null) return { ok: false, reason: "anchor_lost" };
  // offsets land inside the block's (trimmed) text; startOffset marks the trimmed start in the document.
  const s = res.startOffset ?? 0;
  const e = res.endOffset ?? block.text.length;
  const markdownStart = block.startOffset + s;
  const markdownEnd = block.startOffset + e;
  return {
    ok: true,
    markdown: markdown.slice(0, markdownStart) + replacement + markdown.slice(markdownEnd),
    blockId: block.blockId,
    method: res.method,
  };
}

export type ApplyEligibility =
  | { readonly ok: true }
  | { readonly ok: false; readonly reason: ApplyDisabledReason | SpliceFailureReason };

/**
 * Whether Apply will land for this finding on this markdown — `applyGate` (the card's lock rules) plus the
 * live splice check (the anchor must still resolve). Callers render `reason` verbatim on the locked control.
 */
export function applyEligibility(view: FindingView, markdown: string): ApplyEligibility {
  const gate = applyGate(view);
  if (!gate.ok) return gate;
  const anchor = view.projection ?? view.anchor;
  const splice = applySuggestionToMarkdown(markdown, anchor, view.suggestion?.replacement ?? "");
  if (!splice.ok) return { ok: false, reason: splice.reason };
  return { ok: true };
}

// ---------------------------------------------------------------------------------------------------------------------
// bulk actions — "The Desk and the palette offer three bulk actions … each posts one consolidated preview —
// a checklist of findings with the verb applied, the suggested rewrites diffed, the obligations that will
// open — then dispatches the ledger writes" (§5.7). Pure: the preview; the api layer owns the dispatch.
// ---------------------------------------------------------------------------------------------------------------------

export interface BulkPreviewRow {
  readonly findingId: string;
  readonly title: string;
  readonly severity: FindingView["severity"];
  /** the disposition the action will write. */
  readonly disposition: "accept" | "defer";
  /** the obligation the write will open (apply_notes opens a revision obligation per accept). */
  readonly obligation: "none" | "revision";
  /** the spliced markdown when the action applies a suggestion (the diff the preview renders). */
  readonly appliedMarkdown?: string;
  /** why the row can't proceed (the preview keeps it listed, unchecked, with the reason). */
  readonly skippedReason?: string;
}

export interface BulkPreview {
  readonly action: BulkAction;
  /** rows the verb will write — the checklist's checked side. */
  readonly rows: readonly BulkPreviewRow[];
  /** findings the action covers but can't write (e.g. an apply whose anchor lost its paragraph). */
  readonly skipped: readonly { readonly findingId: string; readonly title: string; readonly reason: string }[];
  readonly total: number;
}

/**
 * The consolidated bulk preview: one checklist over the action's covered findings, each row carrying the
 * verb, the spliced markdown for applies (so the preview can diff it), and the obligation that opens.
 * Skipped rows stay visible with their reason — the preview is the disclosure, never a silent drop.
 */
export function buildBulkPreview(
  views: readonly FindingView[],
  action: BulkAction,
  markdown: string,
  opts?: { readonly section?: string },
): BulkPreview {
  const covered = bulkSelect(views, action, opts?.section);
  const rows: BulkPreviewRow[] = [];
  const skipped: { findingId: string; title: string; reason: string }[] = [];
  for (const v of covered) {
    if (action === "apply_notes") {
      const elig = applyEligibility(v, markdown);
      if (!elig.ok) {
        skipped.push({ findingId: v.id, title: v.title, reason: elig.reason });
        continue;
      }
      const splice = applySuggestionToMarkdown(
        markdown,
        v.projection ?? v.anchor,
        v.suggestion?.replacement ?? "",
      );
      rows.push({
        findingId: v.id,
        title: v.title,
        severity: v.severity,
        disposition: "accept",
        obligation: "revision",
        appliedMarkdown: splice.ok ? splice.markdown : undefined,
      });
    } else {
      rows.push({
        findingId: v.id,
        title: v.title,
        severity: v.severity,
        disposition: action === "defer_minor" ? "defer" : "accept",
        obligation: action === "defer_minor" ? "none" : "revision",
      });
    }
  }
  return { action, rows, skipped, total: covered.length };
}
