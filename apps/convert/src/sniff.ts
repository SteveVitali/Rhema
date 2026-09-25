import type { ConvertSourceFormat } from "@rhema/contracts";

// Content-type sniffing (§13.3: "the Content-Type of a presigned PUT is client-asserted and is sniffed at
// conversion, never trusted"). Decide the real format from the leading magic bytes; the client's asserted type
// only breaks the md/txt tie (both take the text path). P1.15 widens the sniff to the §9.5 matrix: image and
// binary signatures are detected honestly instead of falling through to "md" as garbage text.

const PK = [0x50, 0x4b, 0x03, 0x04]; // ZIP local file header (docx/epub/odt/…)
const PDF = [0x25, 0x50, 0x44, 0x46]; // "%PDF"
const PNG = [0x89, 0x50, 0x4e, 0x47];
const JPEG = [0xff, 0xd8, 0xff];
const TIFF_LE = [0x49, 0x49, 0x2a, 0x00];
const TIFF_BE = [0x4d, 0x4d, 0x00, 0x2a];
const CFB = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]; // OLE compound (.doc/.ppt/.xls)
const GIF = [0x47, 0x49, 0x46, 0x38]; // "GIF8"
const WEBP_RIFF = [0x52, 0x49, 0x46, 0x46]; // "RIFF" (+ WEBP at offset 8)

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  return sig.every((b, i) => bytes[i] === b);
}

function looksLikeHtml(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 512)).toLowerCase();
  return /<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]/.test(head);
}

function looksLikeRtf(bytes: Uint8Array): boolean {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 8));
  return head.startsWith("{\\rtf");
}

/** NUL bytes in the first block mean a binary we have no converter for — never pass it to the text path. */
function looksBinary(bytes: Uint8Array): boolean {
  const n = Math.min(bytes.length, 512);
  for (let i = 0; i < n; i += 1) {
    if (bytes[i] === 0x00) return true;
  }
  return false;
}

/** A ZIP container is docx OR epub OR odt — peek the first 64KB of raw archive bytes for the markers.
 *  epub stores its `mimetype` entry first and STORED (uncompressed), so the ASCII appears verbatim. */
function zipFlavor(bytes: Uint8Array): "epub" | "binary" | "docx" {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 65536));
  if (head.includes("application/epub+zip")) return "epub";
  if (head.includes("application/vnd.oasis.opendocument")) return "binary"; // .odt — accepted, no converter yet
  if (head.includes("application/vnd.apple.pages") || head.includes("iWork")) return "binary"; // .pages is a zip too
  return "docx";
}

/** True when the bytes are a ZIP container (a docx/epub/odt is a ZIP; guarded before conversion). */
export function isZipContainer(bytes: Uint8Array): boolean {
  return startsWith(bytes, PK);
}

/**
 * Sniff the source format. `asserted` is the untrusted client content-type — used only to distinguish txt from
 * md (both take the text path), never to override the magic-byte verdict.
 */
export function sniffFormat(bytes: Uint8Array, asserted?: string): ConvertSourceFormat {
  if (startsWith(bytes, PDF)) return "pdf";
  if (startsWith(bytes, PNG) || startsWith(bytes, JPEG) || startsWith(bytes, TIFF_LE) || startsWith(bytes, TIFF_BE) || startsWith(bytes, GIF)) {
    return "image";
  }
  if (startsWith(bytes, WEBP_RIFF)) {
    const tag = new TextDecoder("latin1").decode(bytes.subarray(8, 12));
    if (tag === "WEBP") return "image";
  }
  if (startsWith(bytes, CFB)) return "binary"; // .doc — the legacy OLE container, no converter
  if (isZipContainer(bytes)) return zipFlavor(bytes);
  if (looksLikeRtf(bytes)) return "rtf";
  if (looksLikeHtml(bytes)) return "html";
  const a = (asserted ?? "").toLowerCase();
  if (a.includes("text/plain")) return "txt";
  if (looksBinary(bytes)) return "binary";
  return "md";
}
