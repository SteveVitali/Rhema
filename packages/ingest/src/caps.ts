// Sample caps (REQ-INGEST-8): the §9.5 format matrix, 25 MB/file, 200,000 words/sample,
// 50 files/batch — enforced server-side on the SNIFFED type (never the client-supplied
// extension). Over-cap and unreadable files still LIST as items (auto-omitted, counting
// against coverage) — "the file stays listed" is the spec's exact language.

import type { ConvertSourceFormat } from "@rhema/contracts";

/** The upload/import allowlist — the sniffed sourceFormat must be in this set. `.doc`/`.pages`/
 *  `.rtf`/`.odt`/`.epub`/image files sniff as `binary`/`image` and convert warns "format sniffed
 *  but no converter" — they remain accepted formats (listed + auto-omitted as unreadable until a
 *  converter lands; the converter coverage matrix is §9.5's own table). */
export const UPLOAD_FORMATS: ReadonlySet<ConvertSourceFormat> = new Set<ConvertSourceFormat>([
  "md",
  "txt",
  "docx",
  "epub",
  "rtf",
  "binary", // .doc/.pages/.odt — accepted, convert warns until converters land
  "html",
  "pdf",
  "image", // .png/.jpg/.tiff — accepted, OCR is the opt-in visual path
]);

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_WORDS = 200_000;
export const MAX_FILES_PER_BATCH = 50;

export interface CapsVerdict {
  readonly ok: boolean;
  /** Why the file was rejected — carried into the item's quality note verbatim. */
  readonly reason: string | null;
}

/** Byte cap — checked on the presigned upload size AND the stored byte length. */
export function checkFileBytes(bytes: number): CapsVerdict {
  return bytes <= MAX_FILE_BYTES
    ? { ok: true, reason: null }
    : { ok: false, reason: `file exceeds the ${Math.round(MAX_FILE_BYTES / 1024 / 1024)} MB cap` };
}

/** Sniffed-format cap — the allowlist runs on convertBytes' sniff, not the file name. */
export function checkSniffedFormat(format: ConvertSourceFormat): CapsVerdict {
  return UPLOAD_FORMATS.has(format)
    ? { ok: true, reason: null }
    : { ok: false, reason: `unsupported format: ${format}` };
}

/** Word cap — checked on the converted markdown's word count. */
export function checkWordCount(words: number): CapsVerdict {
  return words <= MAX_WORDS
    ? { ok: true, reason: null }
    : { ok: false, reason: `sample exceeds the ${MAX_WORDS.toLocaleString("en-US")}-word cap` };
}

/** Batch cap — enforced at the batch boundary (api). */
export function checkBatchSize(files: number): CapsVerdict {
  return files <= MAX_FILES_PER_BATCH
    ? { ok: true, reason: null }
    : { ok: false, reason: `batches are capped at ${MAX_FILES_PER_BATCH} files` };
}

/** One verdict over a conversion result — the reason the item auto-omits, or null. */
export function sampleCaps(args: {
  readonly format: ConvertSourceFormat;
  readonly words: number;
  readonly bytes?: number;
}): CapsVerdict {
  const fmt = checkSniffedFormat(args.format);
  if (!fmt.ok) return fmt;
  const words = checkWordCount(args.words);
  if (!words.ok) return words;
  if (args.bytes != null) {
    const b = checkFileBytes(args.bytes);
    if (!b.ok) return b;
  }
  return { ok: true, reason: null };
}
