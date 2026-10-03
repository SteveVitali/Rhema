// The reconstruction seam (REQ-INGEST-10). The priced pass is NEVER inside convert — convert emits
// the verdict + notes, and a metered worker job calls this module: deterministic prompt shaping in,
// deterministic reassembly out. The model call itself sits between `buildReconstructionRequest`
// and `applyReconstruction` in `apps/worker` (metered, capped, ~4 credits at the shown estimate).
// The visual tier (§9.5's opt-in ~180-credit pass) uses the same seam with `tier: "visual"` plus
// page images the worker renders — only ever from the warning drawer, always behind its estimate.

import { sha256Hex } from "@rhema/contracts";
import { assembleImportedDoc } from "@rhema/markdown";
import type { ImportedDocument } from "@rhema/markdown";
import type { QualityVerdict } from "@rhema/contracts";

export type ReconstructionTier = "text" | "visual";

export interface ReconstructionRequest {
  readonly tier: ReconstructionTier;
  /** The extracted-but-degraded text (fix-spans for `partial`, empty for `unreadable`/scans). */
  readonly extractedText: string;
  /** The front-matter facts to preserve verbatim (the model must not invent provenance). */
  readonly title: string;
  readonly notes: readonly string[];
}

/** The deterministic input for the priced call — the worker wraps this in its metered invoke. */
export function buildReconstructionRequest(args: {
  tier: ReconstructionTier;
  extractedText: string;
  title: string;
  notes: readonly string[];
}): ReconstructionRequest {
  return {
    tier: args.tier,
    extractedText: args.extractedText,
    title: args.title,
    notes: args.notes,
  };
}

export interface ReconstructionResult {
  readonly document: ImportedDocument;
  readonly quality: QualityVerdict;
}

/**
 * Reassemble the model's reconstructed markdown into a new canonical version. The verdict flips to
 * `reconstructed` (or `partial` when the model returns nothing usable) and the note set records the
 * tier. Provenance fields carry over from the previous version — reconstruction never rewrites
 * where a sample came from.
 */
export function applyReconstruction(args: {
  readonly tier: ReconstructionTier;
  readonly modelMarkdown: string;
  readonly prior: {
    readonly id: string;
    readonly title: string;
    readonly date?: string;
    readonly url?: string;
    readonly connectionId?: string | null;
    readonly externalId?: string | null;
    readonly originalFormat: string;
    readonly originalSha256: string;
    readonly fetchedAt: Date;
  };
}): ReconstructionResult {
  const cleaned = args.modelMarkdown.trim();
  const quality: QualityVerdict = cleaned.length === 0 ? "partial" : "reconstructed";
  const note = args.tier === "visual" ? "reconstructed via the visual tier" : "reconstructed via the text pass";
  const document = assembleImportedDoc(cleaned.length === 0 ? "(reconstruction returned no usable text)" : cleaned, {
    id: args.prior.id,
    title: args.prior.title,
    date: args.prior.date,
    source: {
      kind: "reconstruction",
      url: args.prior.url ?? undefined,
      connection: args.prior.connectionId ?? null,
      external_id: args.prior.externalId ?? undefined,
      original_format: args.prior.originalFormat,
      original_sha256: args.prior.originalSha256,
      fetched_at: args.prior.fetchedAt.toISOString(),
    },
    quality,
    qualityNotes: [note],
  });
  return { document, quality };
}

/** Body-hash identity for dedup — reconstruction producing the same bytes twice is the same version. */
export function reconstructionKey(modelMarkdown: string): string {
  return sha256Hex(modelMarkdown.trim());
}
