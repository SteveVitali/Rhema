// Canonical-Markdown assembly for ingested samples (§9.5 shape; research/9 §4): the canonical
// document is `@rhema/markdown`'s assembleImportedDoc output — front-matter (title, date, source
// URL, fetched-at, hashes, quality) + normalized body (no body H1, `[^n]` footnotes). This module
// adds the one ingestion-specific step: image rewriting to content-addressed `asset://` URIs.
// Images ride the injected fetch port (the fetcher); a failed image keeps its remote src and adds a
// quality note — a missing image never blocks the sample.

import { sha256Hex } from "@rhema/contracts";
import type { QualityVerdict } from "@rhema/contracts";
import { assembleImportedDoc } from "@rhema/markdown";
import type { ImportedDocument } from "@rhema/markdown";
import type { FetchPort, ProviderId } from "./types.js";

export interface ImageStore {
  /** Persist bytes under their content hash; returns the asset URI to reference. */
  put(sha256: string, bytes: Uint8Array, contentType: string): Promise<string>;
}

export interface ImageDeps {
  readonly fetch: FetchPort;
  readonly store: ImageStore;
}

const IMG_RE = /!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;

/** Rewrite `![alt](https://…)` images to `![alt](asset://sha256_<hex>)`, fetching each through the
 *  fetch port and storing under the content hash. Local/relative/`asset:`/data URIs pass through. */
export async function rewriteImages(
  markdown: string,
  deps: ImageDeps,
  onNote?: (note: string) => void,
): Promise<string> {
  const matches = [...markdown.matchAll(IMG_RE)];
  if (matches.length === 0) return markdown;
  let out = markdown;
  for (const m of matches) {
    const [full, alt, src] = m;
    if (!/^https?:\/\//i.test(src!)) continue;
    const res = await deps.fetch.get(src!, { accept: ["image/*"] });
    if (!res.ok) {
      onNote?.(`image could not be fetched: ${src!.slice(0, 80)}`);
      continue;
    }
    const sha = sha256Hex(res.bytes);
    const uri = await deps.store.put(sha, res.bytes, res.contentType || "image/png");
    out = out.replace(full, `![${alt}](${uri})`);
  }
  return out;
}

export interface CanonicalSampleArgs {
  readonly id: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly byline?: string;
  readonly date?: string | null;
  readonly url?: string | null;
  readonly provider: ProviderId;
  readonly connectionId?: string | null;
  readonly externalId?: string | null;
  readonly originalFormat: string;
  readonly originalSha256: string;
  readonly fetchedAt: Date;
  readonly updatedAtRemote?: string | null;
  readonly quality: QualityVerdict;
  readonly qualityNotes?: readonly string[];
  /** convert's canonical markdown — normalized, image-rewritten, hashed, and front-mattered here. */
  readonly bodyMarkdown: string;
}

/** Assemble the canonical sample document. `bodyMarkdown` is convert's canonical markdown. */
export async function canonicalSampleMarkdown(
  args: CanonicalSampleArgs,
  images?: ImageDeps,
): Promise<ImportedDocument> {
  const notes: string[] = [...(args.qualityNotes ?? [])];
  const body = images ? await rewriteImages(args.bodyMarkdown, images, (n) => notes.push(n)) : args.bodyMarkdown;
  return assembleImportedDoc(body, {
    id: args.id,
    title: args.title,
    subtitle: args.subtitle,
    byline: args.byline,
    date: args.date ?? undefined,
    source: {
      kind: args.provider,
      url: args.url ?? undefined,
      connection: args.connectionId ?? null,
      external_id: args.externalId ?? undefined,
      original_format: args.originalFormat,
      original_sha256: args.originalSha256,
      fetched_at: args.fetchedAt.toISOString(),
      updated_at_remote: args.updatedAtRemote ?? undefined,
    },
    quality: args.quality,
    qualityNotes: notes,
  });
}
