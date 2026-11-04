/**
 * REQ-CORPUS-5 — image sanitization. PNGs are chunk-stripped: critical chunks plus the rendering
 * ancillary set are kept verbatim (CRCs preserved); everything else — tEXt/zTXt/iTXt (incl. XMP),
 * eXIf, tIME and private/vendor chunks — is dropped. Filesystem xattrs never travel: the exporter
 * copies BYTES (read + write), never file metadata.
 */

const PNG_SIG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Ancillary chunks a renderer may need; every other ancillary chunk is dropped. */
const KEEP_ANCILLARY = new Set([
  "gAMA",
  "cHRM",
  "sRGB",
  "iCCP",
  "sBIT",
  "pHYs",
  "tRNS",
  "bKGD",
  "hIST",
  "sPLT",
]);

const CRITICAL = new Set(["IHDR", "PLTE", "IDAT", "IEND"]);

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++) c = CRC_TABLE[(c ^ (bytes[i] as number)) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

export class PngError extends Error {}

export interface PngResult {
  readonly bytes: Uint8Array;
  /** Chunk type ids dropped, in encounter order (recorded in PROVENANCE's redaction table). */
  readonly dropped: readonly string[];
}

export function sanitizePng(input: Uint8Array): PngResult {
  if (input.length < 8 || !PNG_SIG.every((b, i) => input[i] === b)) {
    throw new PngError("not a PNG (bad signature)");
  }
  const out: number[] = [...PNG_SIG];
  const dropped: string[] = [];
  let off = 8;
  let sawIend = false;
  while (off + 8 <= input.length) {
    const len =
      ((input[off]! << 24) | (input[off + 1]! << 16) | (input[off + 2]! << 8) | input[off + 3]!) >>>
      0;
    const end = off + 12 + len;
    if (end > input.length) throw new PngError(`truncated chunk at offset ${off}`);
    const type = String.fromCharCode(
      input[off + 4]!,
      input[off + 5]!,
      input[off + 6]!,
      input[off + 7]!,
    );
    const stored =
      ((input[end - 4]! << 24) |
        (input[end - 3]! << 16) |
        (input[end - 2]! << 8) |
        input[end - 1]!) >>>
      0;
    if (stored !== crc32(input, off + 4, off + 8 + len)) {
      throw new PngError(`bad CRC on ${type} at offset ${off}`);
    }
    if (CRITICAL.has(type) || KEEP_ANCILLARY.has(type)) {
      for (let i = off; i < end; i++) out.push(input[i]!);
    } else {
      dropped.push(type);
    }
    off = end;
    if (type === "IEND") {
      sawIend = true;
      break; // trailing bytes after IEND never travel
    }
  }
  if (!sawIend) throw new PngError("no IEND chunk");
  return { bytes: new Uint8Array(out), dropped };
}
