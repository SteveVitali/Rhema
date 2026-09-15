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
export {
  presignQuarantinePut,
  quarantineKey,
  QUARANTINE_PREFIX,
  MAX_UPLOAD_BYTES,
} from "./upload.js";
export type { SignedUrlProvider, PresignedUpload } from "./upload.js";
