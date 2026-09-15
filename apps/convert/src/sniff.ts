import type { ConvertSourceFormat } from "@rhema/contracts";

// Content-type sniffing (§13.3: "the Content-Type of a presigned PUT is client-asserted and is sniffed at
// conversion, never trusted"). Decide the real format from the leading magic bytes; the client's asserted type
// only breaks the md/txt tie (both take the text path).

const PK = [0x50, 0x4b, 0x03, 0x04]; // ZIP local file header (docx/epub/…)
const PDF = [0x25, 0x50, 0x44, 0x46]; // "%PDF"

function startsWith(bytes: Uint8Array, sig: number[]): boolean {
  if (bytes.length < sig.length) return false;
  return sig.every((b, i) => bytes[i] === b);
}

function looksLikeHtml(bytes: Uint8Array): boolean {
  const head = new TextDecoder("utf-8", { fatal: false }).decode(bytes.subarray(0, 512)).toLowerCase();
  return /<!doctype html|<html[\s>]|<head[\s>]|<body[\s>]/.test(head);
}

/** True when the bytes are a ZIP container (a docx is a ZIP; guarded before conversion). */
export function isZipContainer(bytes: Uint8Array): boolean {
  return startsWith(bytes, PK);
}

/**
 * Sniff the source format. `asserted` is the untrusted client content-type — used only to distinguish txt from
 * md (both take the markdown/text path), never to override the magic-byte verdict.
 */
export function sniffFormat(bytes: Uint8Array, asserted?: string): ConvertSourceFormat {
  if (startsWith(bytes, PDF)) return "pdf";
  if (isZipContainer(bytes)) return "docx"; // the only ZIP format the beta accepts
  if (looksLikeHtml(bytes)) return "html";
  const a = (asserted ?? "").toLowerCase();
  if (a.includes("text/plain")) return "txt";
  return "md";
}
