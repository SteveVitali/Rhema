import { tokenFootprint } from "./pins.js";

// Source notes (§7.1; REQ-CHAT-4): everything the Assistant reads or is handed lands as a durable,
// project-scoped note under `agents/assistant/research/` — `sources/<slug>.md` per source plus the
// `index.json` the Browser → Research → "Chat sources" read-only surface lists. A failed fetch writes
// an `[unverified]` note, never a retry storm. Attachments (PDF/DOCX/MD/TXT) come through the same
// quarantine→convert→canonical-Markdown path (PRB.02) and land as source notes — NEVER in the author
// corpus (drafts/**). Thread deletion never touches these (REQ-CHAT-4).

/** The research index (`agents/assistant/research/index.json`). */
export interface ResearchIndex {
  version: 1;
  /** one row per source note / distilled note. */
  entries: ResearchIndexEntry[];
}

export interface ResearchIndexEntry {
  /** the note's path under agents/assistant/research/. */
  path: string;
  /** note kind: fetched source, an attachment conversion, or a research_burst's distilled note. */
  kind: "source" | "attachment" | "research_note";
  title?: string;
  url?: string;
  /** true on a failed fetch — the note body carries the [unverified] mark. */
  unverified?: boolean;
  /** the chat run/turn that produced it (provenance). */
  runId?: string;
  threadId?: string;
  fetchedAt?: string;
  words?: number;
}

export function emptyIndex(): ResearchIndex {
  return { version: 1, entries: [] };
}

export function parseIndex(json: string | null | undefined): ResearchIndex {
  if (!json) return emptyIndex();
  try {
    const v = JSON.parse(json) as ResearchIndex;
    return { version: 1, entries: Array.isArray(v?.entries) ? v.entries : [] };
  } catch {
    return emptyIndex();
  }
}

export function serializeIndex(index: ResearchIndex): string {
  return JSON.stringify({ version: 1, entries: index.entries }, null, 2) + "\n";
}

/** Slugify a source title/url for the note filename (deterministic, path-safe). */
export function sourceSlug(title: string | undefined, url: string | undefined): string {
  const base = (title ?? url ?? "source")
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);
  return base || "source";
}

/** The canonical source-note path under the research root. */
export function sourceNotePath(slug: string): string {
  return `agents/assistant/research/sources/${slug}.md`;
}

/** A research_burst's distilled note path. */
export function researchNotePath(burstId: string): string {
  return `agents/assistant/research/${burstId}/note.md`;
}

export interface SourceNote {
  path: string;
  markdown: string;
  entry: ResearchIndexEntry;
}

/**
 * Compose a fetched source's note (frontmatter-ish header + the canonical markdown). A fetch that
 * FAILED produces the `[unverified]` note — the card still lands in the index so the record of the
 * attempt survives (§7.1: "a failed fetch writes an [unverified] note, not a retry storm").
 */
export function sourceNote(args: {
  url: string;
  title?: string;
  /** the converted/fetched markdown; absent ⇒ the fetch failed → [unverified]. */
  markdown?: string;
  fetchedAt?: string;
  runId?: string;
  threadId?: string;
}): SourceNote {
  const slug = sourceSlug(args.title, args.url);
  const path = sourceNotePath(slug);
  const unverified = args.markdown == null;
  const header = [
    `# ${args.title ?? args.url}`,
    "",
    `Source: ${args.url}`,
    ...(unverified ? [`Status: [unverified] — the fetch failed; nothing here is attested.`] : []),
    "",
  ].join("\n");
  const markdown = unverified ? header : header + args.markdown!.trimStart();
  return {
    path,
    markdown,
    entry: {
      path,
      kind: "source",
      ...(args.title ? { title: args.title } : {}),
      url: args.url,
      ...(unverified ? { unverified: true } : {}),
      ...(args.runId ? { runId: args.runId } : {}),
      ...(args.threadId ? { threadId: args.threadId } : {}),
      ...(args.fetchedAt ? { fetchedAt: args.fetchedAt } : {}),
      ...(!unverified ? { words: countWords(args.markdown!) } : {}),
    },
  };
}

/**
 * An attachment's note: the converter's canonical markdown lands under the assistant namespace —
 * `agents/assistant/research/attachments/<slug>.md` — never the corpus (`drafts/`). `mediaType`
 * admits only PDF/DOCX/MD/TXT (images are 1.x — the caller refuses them before this runs).
 */
export const ATTACHABLE_MEDIA = new Set([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/markdown",
  "text/plain",
]);

export function attachmentNote(args: {
  filename: string;
  mediaType: string;
  markdown: string;
  threadId?: string;
}): SourceNote | { ok: false; error: "unsupported_media" } {
  if (!ATTACHABLE_MEDIA.has(args.mediaType)) return { ok: false, error: "unsupported_media" };
  const slug = sourceSlug(args.filename.replace(/\.[^.]+$/, ""), undefined);
  const path = `agents/assistant/research/attachments/${slug}.md`;
  const markdown = `# ${args.filename}\n\nAttached to chat. Converted to canonical Markdown.\n\n` + args.markdown.trimStart();
  return {
    path,
    markdown,
    entry: {
      path,
      kind: "attachment",
      title: args.filename,
      ...(args.threadId ? { threadId: args.threadId } : {}),
      words: countWords(args.markdown),
    },
  };
}

/** Insert-or-replace an index entry (idempotent by path). */
export function upsertIndexEntry(index: ResearchIndex, entry: ResearchIndexEntry): ResearchIndex {
  const entries = index.entries.filter((e) => e.path !== entry.path);
  entries.push(entry);
  return { version: 1, entries };
}

/** The Browser → Research → "Chat sources" listing (read-only cards, newest first). */
export function sourceCards(index: ResearchIndex): ResearchIndexEntry[] {
  return [...index.entries].reverse();
}

/** Footprint of a note/index pair (the strip's "N sources" count helper). */
export function noteFootprint(note: SourceNote): number {
  return tokenFootprint(note.markdown);
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}
