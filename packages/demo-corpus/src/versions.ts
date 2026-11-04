/**
 * REQ-CORPUS-13 / REQ-CORPUS-12 (data shape) / REQ-CORPUS-8 (data half) — per-slug version metadata
 * and the Published node. Each version's label, title/subtitle (so the v1/v2 → v3 retitle is data,
 * RV-30), origin and the "Writer-directed edit (not reviewed)" label (S-10) are data in
 * `versions.json`; the Published node carries URL, fetch date, sha256, the
 * `Published · <host> · fetched YYYY-MM-DD` label and origin `imported`.
 */

export const WRITER_DIRECTED_LABEL = "Writer-directed edit (not reviewed)";

export interface VersionEntry {
  readonly version: string;
  readonly file: string;
  readonly label: string;
  readonly title: string | null;
  readonly subtitle: string | null;
  readonly origin: "source" | "imported";
  readonly writerDirected?: boolean;
  readonly provenanceLabel?: string;
}

export interface PublishedEntry {
  readonly file: string;
  readonly url: string;
  readonly fetched: string;
  readonly sha256: string;
  readonly label: string;
  readonly origin: "imported";
}

export interface VersionIndex {
  readonly slug: string;
  readonly versions: readonly VersionEntry[];
  readonly published: PublishedEntry | null;
}

/** First `# ` heading = title; first non-blank, non-heading line after it = subtitle (RV-30). */
export function extractTitle(text: string): { title: string | null; subtitle: string | null } {
  const lines = text.split("\n");
  const ti = lines.findIndex((l) => l.startsWith("# "));
  if (ti < 0) return { title: null, subtitle: null };
  const title = lines[ti]!.slice(2).trim();
  const subtitle = lines.slice(ti + 1).find((l) => l.trim().length > 0 && !l.startsWith("#"));
  return { title, subtitle: subtitle?.trim() ?? null };
}

export interface PublishedDoc {
  readonly url: string;
  readonly fetched: string;
  readonly sha256: string;
  readonly body: string;
}

export class PublishedError extends Error {}

/** Parse `published.md` front-matter (`---`-fenced `key: value`) — the shape 214b's fetch writes. */
export function parsePublished(text: string): PublishedDoc {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(text);
  if (!m) throw new PublishedError("published.md: missing --- front-matter fence");
  const fields: Record<string, string> = {};
  for (const line of m[1]!.split("\n")) {
    const kv = /^([a-z0-9_]+):\s*(.+)$/.exec(line.trim());
    if (kv) fields[kv[1]!] = kv[2]!.trim();
  }
  const { url, fetched, sha256 } = fields;
  if (!url || !/^https?:\/\//.test(url)) throw new PublishedError("published.md: bad/missing url");
  if (!fetched || !/^\d{4}-\d{2}-\d{2}$/.test(fetched))
    throw new PublishedError("published.md: bad/missing fetched date");
  if (!sha256 || !/^[0-9a-f]{64}$/.test(sha256))
    throw new PublishedError("published.md: bad/missing sha256");
  return { url, fetched, sha256, body: m[2]! };
}

export function publishedNode(doc: PublishedDoc): PublishedEntry {
  const host = new URL(doc.url).host;
  return {
    file: "published.md",
    url: doc.url,
    fetched: doc.fetched,
    sha256: doc.sha256,
    label: `Published · ${host} · fetched ${doc.fetched}`,
    origin: "imported",
  };
}
