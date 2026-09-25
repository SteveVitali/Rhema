import { provenanceSourceLabel, type ProvenanceSpan } from "@rhema/contracts";
import { splitMarkdownBlocks } from "@rhema/findings-core";

// REQ-POS-7 / §8.4 — the block-level provenance appendix for export (P1.18). Renders one row per
// top-level block: `{blockId, first 60 chars, source}` where `source` is the same honest label the
// Version History bars carry (`provenanceSourceLabel` in contracts — single source of truth). The
// granularity is LABELED in the appendix itself: blocks edited by the author after drafting are
// `mixed` (the provenance_maps capture already degrades them — manual-revision.ts / the Page's live
// capture — this renderer never re-derives or guesses). Span-granular export stays out of scope
// until 1.x (REQ-POS-10) — the label says so rather than implying finer fidelity.
//
// The block ids resolve through `splitMarkdownBlocks` — the same splitter that produces the
// provenance capture's `b<n>` ids (buildBlockIdMap/humanRevisionProvenance), so a stored span's
// blockId maps onto the same text run here.

export const PROVENANCE_APPENDIX_LABEL =
  "Block-level provenance — blocks edited by the author after drafting are marked mixed. " +
  "Finer-grained (span-level) provenance is recorded but not exported at MVP.";

/** The first 60 visible characters of a block — markdown sigils flattened to keep the row one line. */
function excerpt(text: string): string {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > 60 ? `${flat.slice(0, 59)}…` : flat;
}

/**
 * Render the `## Provenance` appendix for a draft's canonical markdown + its stored block-level
 * spans. Returns null when no provenance map exists — the caller simply omits the section (the
 * dialog greys the toggle in that case; it never renders a fabricated map).
 */
export function renderProvenanceAppendix(args: {
  markdown: string;
  spans: readonly ProvenanceSpan[] | null | undefined;
}): string | null {
  if (!args.spans || args.spans.length === 0) return null;
  const sourceByBlock = new Map(args.spans.map((s) => [s.blockId, s.source] as const));
  const blocks = splitMarkdownBlocks(args.markdown);
  const rows = blocks.map((b) => {
    const source = sourceByBlock.get(b.blockId);
    const label = source ? provenanceSourceLabel(source) : "unrecorded";
    return `- \`${b.blockId}\` — ${label} — "${excerpt(b.text)}"`;
  });
  return `## Provenance\n\n*${PROVENANCE_APPENDIX_LABEL}*\n\n${rows.join("\n")}\n`;
}
