import { inflateRawSync } from "node:zlib";

// The decompression-ratio limit (REQ-ARCH-23 amended; §13.3): docx/epub are ZIPs and pdf.js has had
// arbitrary-JS CVEs, so `convert` refuses a decompression bomb BEFORE handing bytes to a parser. The
// authoritative check does NOT trust the attacker-declared central-directory sizes — it actually inflates each
// entry with a hard `maxOutputLength` budget (node:zlib), so an entry that under-declares its size but really
// expands to gigabytes is refused when the running total would exceed the cap.

export const MAX_TOTAL_UNCOMPRESSED = 100 * 1024 * 1024; // 100 MB across all entries (real, inflated)

export class DecompressionLimitError extends Error {
  constructor(readonly detail: string) {
    super(`decompression limit exceeded: ${detail}`);
    this.name = "DecompressionLimitError";
  }
}

const EOCD_SIG = 0x06054b50; // End Of Central Directory
const CDFH_SIG = 0x02014b50; // Central Directory File Header
const LFH_SIG = 0x04034b50; // Local File Header

interface ZipEntryMeta {
  readonly name: string;
  readonly method: number; // 0 = store, 8 = deflate
  readonly compressedSize: number;
  readonly localHeaderOffset: number;
}

function findEocd(view: DataView): number {
  const min = Math.max(0, view.byteLength - (22 + 0xffff));
  for (let i = view.byteLength - 22; i >= min; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) return i;
  }
  return -1;
}

/** Parse the central directory into entry metadata (method, compressed size, local-header offset). */
function parseCentralDirectory(bytes: Uint8Array): ZipEntryMeta[] | null {
  if (bytes.length < 22) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const eocd = findEocd(view);
  if (eocd < 0) return null;
  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const entries: ZipEntryMeta[] = [];
  for (let i = 0; i < count; i++) {
    if (offset + 46 > bytes.length || view.getUint32(offset, true) !== CDFH_SIG) return null;
    const method = view.getUint16(offset + 10, true);
    const compressedSize = view.getUint32(offset + 20, true);
    const nameLen = view.getUint16(offset + 28, true);
    const extraLen = view.getUint16(offset + 30, true);
    const commentLen = view.getUint16(offset + 32, true);
    const localHeaderOffset = view.getUint32(offset + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(offset + 46, offset + 46 + nameLen));
    entries.push({ name, method, compressedSize, localHeaderOffset });
    offset += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

/** Byte offset where an entry's compressed data begins (past its local header + name + extra). */
function dataStart(bytes: Uint8Array, e: ZipEntryMeta): number | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const lo = e.localHeaderOffset;
  if (lo + 30 > bytes.length || view.getUint32(lo, true) !== LFH_SIG) return null;
  const nameLen = view.getUint16(lo + 26, true);
  const extraLen = view.getUint16(lo + 28, true);
  return lo + 30 + nameLen + extraLen;
}

/**
 * Assert a ZIP is not a decompression bomb by REALLY inflating each entry with a hard output budget. Throws
 * `DecompressionLimitError` when the running inflated total would exceed the cap, when an entry uses an
 * unsupported method, or when the ZIP structure is unreadable. Never trusts declared sizes.
 */
export function assertSafeArchive(bytes: Uint8Array, maxTotal: number = MAX_TOTAL_UNCOMPRESSED): void {
  const entries = parseCentralDirectory(bytes);
  if (entries == null) throw new DecompressionLimitError("unreadable ZIP central directory");
  let total = 0;
  for (const e of entries) {
    const budget = maxTotal - total;
    if (budget <= 0) throw new DecompressionLimitError(`total inflated size exceeds ${maxTotal}`);
    const ds = dataStart(bytes, e);
    if (ds == null) throw new DecompressionLimitError(`entry "${e.name}" has an unreadable local header`);
    if (e.method === 0) {
      // stored: the compressed size IS the real size (no inflation) — still counts against the cap.
      total += e.compressedSize;
      if (total > maxTotal) throw new DecompressionLimitError(`stored entry "${e.name}" exceeds the cap`);
      continue;
    }
    if (e.method !== 8) throw new DecompressionLimitError(`entry "${e.name}" uses unsupported method ${e.method}`);
    const slice = bytes.subarray(ds, ds + e.compressedSize);
    try {
      const out = inflateRawSync(Buffer.from(slice), { maxOutputLength: budget });
      total += out.byteLength;
    } catch (err) {
      // ERR_BUFFER_TOO_LARGE (over budget) or a corrupt stream both fail closed.
      throw new DecompressionLimitError(`entry "${e.name}" inflation refused: ${String((err as Error)?.message ?? err).slice(0, 80)}`);
    }
  }
}
