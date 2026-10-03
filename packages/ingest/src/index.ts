export const PACKAGE_NAME = "@rhema/ingest" as const;

export type {
  ProviderId,
  FetchPort,
  FetchResult,
  ConvertPort,
  BlobPort,
  ConnectionRef,
  DiscoveredAccess,
  DiscoveredDraft,
  FetchedBody,
  FetchOutcome,
  ProviderError,
  ProviderDeps,
  Provider,
} from "./types.js";

export { createSubstackProvider, substackOrigin, draftsFromFeed, rewriteFootnotes } from "./providers/substack.js";
export { createSubstackExportProvider, parseCsv } from "./providers/substack-export.js";
export {
  createUrlProvider,
  normalizeItemUrl,
  detectsPaywall,
  extractArticle,
  urlChangeKey,
} from "./providers/url.js";
export { createUploadProvider, createPasteProvider, uploadChangeKey } from "./providers/manual.js";

export {
  UPLOAD_FORMATS,
  MAX_FILE_BYTES,
  MAX_WORDS,
  MAX_FILES_PER_BATCH,
  checkFileBytes,
  checkSniffedFormat,
  checkWordCount,
  checkBatchSize,
  sampleCaps,
} from "./caps.js";
export type { CapsVerdict } from "./caps.js";

export { canonicalSampleMarkdown, rewriteImages } from "./canonical.js";
export type { CanonicalSampleArgs, ImageStore, ImageDeps } from "./canonical.js";

export { syncConnection, pacedFetchPort } from "./sync.js";
export type {
  ExistingItem,
  WriteSampleArgs,
  SyncStore,
  SyncDeps,
  SyncError,
  SyncReport,
} from "./sync.js";

export {
  buildReconstructionRequest,
  applyReconstruction,
  reconstructionKey,
} from "./reconstruction.js";
export type { ReconstructionTier, ReconstructionRequest, ReconstructionResult } from "./reconstruction.js";

export { sqlSyncStore, loadConnection } from "./sql-store.js";
export type { SqlQuery, ByteSink, SqlStoreDeps } from "./sql-store.js";

import type { Provider, ProviderId } from "./types.js";
import { createSubstackProvider } from "./providers/substack.js";
import { createSubstackExportProvider } from "./providers/substack-export.js";
import { createUrlProvider } from "./providers/url.js";
import { createUploadProvider, createPasteProvider } from "./providers/manual.js";

/** The MVP provider registry (§9.5). Ghost/WordPress/RSS/Medium/Notion/Drive stay 1.x — the
 *  interface is built for them; only these five ship. */
export function createProviderRegistry(): ReadonlyMap<ProviderId, Provider> {
  return new Map<ProviderId, Provider>([
    ["substack", createSubstackProvider()],
    ["substack_export", createSubstackExportProvider()],
    ["url", createUrlProvider()],
    ["upload", createUploadProvider()],
    ["paste", createPasteProvider()],
  ]);
}

export function providerFor(registry: ReadonlyMap<ProviderId, Provider>, id: string): Provider | null {
  return registry.get(id as ProviderId) ?? null;
}
