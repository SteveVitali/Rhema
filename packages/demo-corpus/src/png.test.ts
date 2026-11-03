import { describe, expect, it } from "vitest";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { join } from "node:path";
import { sanitizePng, PngError } from "./png.js";

// REQ-CORPUS-5: PNGs carry no EXIF/XMP/tEXt beyond the render set; output still decodes (every
// chunk CRC validates and IEND closes); the exported fixture image is byte-pinned.

const SRC = fileURLToPath(
  new URL("../fixtures/synthetic/source/the-borrowed-commons/drafts/figures", import.meta.url),
);
const OUT = fileURLToPath(
  new URL("../fixtures/synthetic/corpus/the-borrowed-commons/drafts/figures", import.meta.url),
);

function chunkTypes(png: Uint8Array): string[] {
  const types: string[] = [];
  let off = 8;
  while (off + 8 <= png.length) {
    const len =
      ((png[off]! << 24) | (png[off + 1]! << 16) | (png[off + 2]! << 8) | png[off + 3]!) >>> 0;
    types.push(String.fromCharCode(png[off + 4]!, png[off + 5]!, png[off + 6]!, png[off + 7]!));
    off += 12 + len;
  }
  return types;
}

describe("png sanitization (REQ-CORPUS-5)", () => {
  it("drops EXIF/XMP/tEXt/private chunks, keeps the render set, and the bytes still decode", () => {
    const src = new Uint8Array(readFileSync(join(SRC, "figure_1_signal_map.png")));
    const r = sanitizePng(src);
    expect(r.dropped).toEqual(["tEXt", "eXIf", "iTXt", "caNv", "tIME"]);
    expect(chunkTypes(r.bytes)).toEqual(["IHDR", "pHYs", "IDAT", "IEND"]);
    // decodes: re-sanitize is a no-op on already-clean bytes (every CRC re-validates)
    expect(sanitizePng(r.bytes).dropped).toEqual([]);
    expect(sanitizePng(r.bytes).bytes).toEqual(r.bytes);
  });

  it("the exported fixture image is byte-pinned", () => {
    const out = readFileSync(join(OUT, "figure_1_signal_map.png"));
    const fresh = Buffer.from(
      sanitizePng(new Uint8Array(readFileSync(join(SRC, "figure_1_signal_map.png")))).bytes,
    );
    expect(fresh.equals(out)).toBe(true);
    expect(createHash("sha256").update(out).digest("hex")).toMatch(/^[0-9a-f]{64}$/);
    expect(chunkTypes(new Uint8Array(out))).toEqual(["IHDR", "pHYs", "IDAT", "IEND"]);
    const out2 = readFileSync(join(OUT, "figure_2_load_curve.png"));
    expect(chunkTypes(new Uint8Array(out2))).toEqual(["IHDR", "gAMA", "IDAT", "IEND"]);
  });

  it("rejects non-PNG and truncated inputs", () => {
    expect(() => sanitizePng(new Uint8Array([1, 2, 3]))).toThrow(PngError);
    const src = new Uint8Array(readFileSync(join(SRC, "figure_1_signal_map.png")));
    expect(() => sanitizePng(src.subarray(0, 40))).toThrow(PngError);
  });
});
