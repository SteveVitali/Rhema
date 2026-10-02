// @rhema/convert — the no-network, no-DB conversion service (§12.1, §13.3). Quarantine bytes → canonical Rhema
// Markdown + the §5.3 conversion-preview payload. The F41 split: convert PARSES, never fetches; it never runs
// in `api`. Reuses @rhema/markdown for the canonical normalization + count line.

export const PACKAGE_NAME = "@rhema/convert" as const;

export { convertBytes, DecompressionLimitError } from "./convert.js";
export type { ConvertOptions } from "./convert.js";
export { sniffFormat, isZipContainer } from "./sniff.js";
export { assertSafeArchive, MAX_TOTAL_UNCOMPRESSED } from "./decompression-guard.js";
export { convertDocx, convertHtml, convertPdf, convertText } from "./converters.js";
export type { ConverterOutput } from "./converters.js";
export { servingHeadersFor, RENDERED_ALLOWLIST, USERCONTENT_ORIGIN } from "./serving.js";
// ONB.1 (ADR-044) — the warm-service mode: the same pipeline behind a bounded HTTP surface.
export { createConvertService, serveConvert } from "./server.js";
export type { ConvertServiceDeps } from "./server.js";
// PRB.20 — the upload wire contract moved to @rhema/contracts (the api's presign route shares it; the
// parser deps must never reach the api image, REQ-ARCH-23). Re-exported here so the surface is stable.
export {
  presignQuarantinePut,
  quarantineKey,
  convertedResultKey,
  parseQuarantineKey,
  QUARANTINE_PREFIX,
  CONVERTED_PREFIX,
  MAX_UPLOAD_BYTES,
} from "@rhema/contracts";
export type { SignedUrlProvider, PresignedUpload } from "@rhema/contracts";
