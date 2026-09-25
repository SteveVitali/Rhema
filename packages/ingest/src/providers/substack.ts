// The Substack public-API provider (§9.5 matrix row 1; REQ-INGEST-2/3/5/12). Public endpoints only —
// the archive list (`/api/v1/archive`, paginated) for discovery, `/api/v1/posts/{slug}` for bodies,
// `/feed` (RSS) as the archive fallback when the endpoint 404s. There is NO credentialed path:
// `audience !== 'everyone'` items list as *Paywalled — import your export* and are never fetched
// (the export-zip provider is the only lossless path for paid posts).
//
// Change detection: `updated_at` when the archive row carries it, else the normalized body hash
// (remoteChangeKey stays null at discovery → every re-sync conditionally re-fetches and the body
// hash decides — AC-I-A: an `updated_at` bump with an unchanged body produces ZERO new versions).

import { XMLParser } from "fast-xml-parser";
import type {
  ConnectionRef,
  DiscoveredDraft,
  FetchOutcome,
  Provider,
  ProviderDeps,
  ProviderError,
} from "../types.js";

const ARCHIVE_PAGE = 12;
const ARCHIVE_MAX_PAGES = 50; // safety bound: 600 posts per publication per discover pass
const ARCHIVE_ACCEPT = ["application/json"] as const;
const FEED_ACCEPT = ["application/rss+xml", "application/xml", "text/xml", "text/plain", "application/octet-stream"] as const;

/** Normalize a user handle to the publication origin (`https://<host>`). Accepts
 *  `name.substack.com`, `name.substack.com/…`, `https://…`, or a custom domain URL. */
export function substackOrigin(handle: string): string | null {
  const trimmed = handle.trim().replace(/\/+$/, "");
  // Reject any explicit non-http(s) scheme (`ftp://x` is not "a host named ftp").
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed) && !/^https?:\/\//i.test(trimmed)) return null;
  const withScheme = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" && url.protocol !== "http:") return null;
  return url.origin;
}

function err(message: string, remedy: string): ProviderError {
  return { message, remedy };
}

function fail(outcome: { ok: false; reason: string; denyReason?: string; status?: number }, what: string): ProviderError {
  if (outcome.status === 404) return err(`${what} not found (404)`, "Check the publication address, or import your Substack export");
  if (outcome.denyReason === "ssrf" || outcome.denyReason === "scheme")
    return err(outcome.reason, "The link must be a public https address");
  if (outcome.denyReason === "robots")
    return err(outcome.reason, "The site disallows crawling — import your Substack export instead");
  if (outcome.denyReason === "rate_limited" || outcome.status === 429)
    return err(outcome.reason, "Rate limited — retry the sync in a minute");
  return err(outcome.reason, "Check the link and try again; for paid publications use the export zip");
}

interface ArchiveRow {
  readonly id?: number | string;
  readonly slug?: string;
  readonly title?: string;
  readonly post_date?: string;
  readonly canonical_url?: string;
  readonly audience?: string;
  readonly wordcount?: number;
  readonly word_count?: number;
  readonly updated_at?: string;
}

const accessOf = (audience: string | undefined): DiscoveredDraft["access"] =>
  audience === "everyone" ? "free" : audience == null ? "unknown" : "paywalled";

const isoDay = (v: string | undefined): string | null =>
  typeof v === "string" && v ? v.slice(0, 10) : null;

function archiveDraft(row: ArchiveRow): DiscoveredDraft | null {
  const slug = typeof row.slug === "string" ? row.slug : null;
  const id = row.id != null ? String(row.id) : slug;
  if (!id) return null;
  return {
    externalId: id,
    title: typeof row.title === "string" ? row.title : slug,
    url: typeof row.canonical_url === "string" ? row.canonical_url : null,
    date: isoDay(row.post_date),
    wordCount:
      typeof row.wordcount === "number" ? row.wordcount : typeof row.word_count === "number" ? row.word_count : null,
    access: accessOf(row.audience),
    remoteChangeKey: typeof row.updated_at === "string" ? `updated_at:${row.updated_at}` : null,
  };
}

/** Parse an RSS `/feed` body into discovery rows (feed carries no `updated_at` → changeKey null). */
export function draftsFromFeed(xml: string): DiscoveredDraft[] {
  const parsed = new XMLParser({ ignoreAttributes: false, removeNSPrefix: true }).parse(xml) as {
    rss?: { channel?: { item?: unknown } };
  };
  const raw = parsed.rss?.channel?.item;
  const items = Array.isArray(raw) ? raw : raw != null ? [raw] : [];
  const out: DiscoveredDraft[] = [];
  for (const it of items as Record<string, unknown>[]) {
    const link = typeof it.link === "string" ? it.link : null;
    const guid = typeof it.guid === "string" ? it.guid : ((it.guid as { "#text"?: string })?.["#text"] ?? link);
    const slug = link ? (link.split("/").filter(Boolean).pop() ?? null) : null;
    const externalId = (typeof guid === "string" && guid) || slug || link;
    if (!externalId) continue;
    out.push({
      externalId: String(externalId),
      title: typeof it.title === "string" ? it.title : slug,
      url: link,
      date: typeof it.pubDate === "string" ? isoDay(new Date(it.pubDate).toISOString()) : null,
      wordCount: null,
      access: "unknown",
      remoteChangeKey: null,
    });
  }
  return out;
}

/**
 * Rewrite Substack's footnote markup into the canonical `[^n]` shape BEFORE conversion:
 * in-text anchors (`a.footnote-anchor`, `a[href^="#footnote"]`) become literal `[^n]` markers and
 * the `.footnote`/`.footnotes` blocks are lifted out and appended as `[^n]: <text>` paragraphs —
 * the footnotes land at the end of the converted markdown (research/9 §4).
 */
export function rewriteFootnotes(html: string): string {
  // Collect footnote bodies in document order: <div|li class="footnote…">…</…> blocks.
  const bodies: string[] = [];
  const bodyRe = /<(?:div|li)[^>]*class="[^"]*footnote(?:-content)?[^"]*"[^>]*>([\s\S]*?)<\/(?:div|li)>/gi;
  let m: RegExpExecArray | null;
  while ((m = bodyRe.exec(html))) {
    const text = m[1]!
      .replace(/<a[^>]*>([\s\S]*?)<\/a>/gi, "") // drop anchor chrome (the "1" backlink)
      .replace(/<sup[^>]*>[\s\S]*?<\/sup>/gi, "")
      .replace(/<[^>]+>/g, "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;|&apos;/g, "'")
      .replace(/\s+/g, " ")
      .replace(/^\d+[.\s)]+/, "") // a bare leading marker ("1. text" / "1 text") is the footnote label
      .trim();
    if (text && !/^\d+$/.test(text)) bodies.push(text);
  }
  if (bodies.length === 0) return html;

  // In-text references → literal [^n] markers (anchors already sit inside <sup>).
  const orderOf = (href: string): number => {
    const n = /(\d+)\s*$/.exec(href);
    return n ? Number(n[1]) : -1;
  };
  let out = html.replace(
    /<a[^>]*class="[^"]*footnote-anchor[^"]*"[^>]*href="#[^"]*?(\d+)"[^>]*>[\s\S]*?<\/a>/gi,
    (_a, n: string) => `[^${Number(n)}]`,
  );
  out = out.replace(/<a[^>]*href="#(footnote[^"]*|fn[^"]*)"[^>]*>[\s\S]*?<\/a>/gi, (a) => {
    const href = /href="#([^"]+)"/.exec(a)?.[1] ?? "";
    const n = orderOf(href);
    return n > 0 ? `[^${n}]` : "";
  });
  // Drop the footnote blocks (they're re-appended as `[^n]:` definitions).
  out = out.replace(bodyRe, "");
  const defs = bodies.map((b, i) => `<p>[^${i + 1}]: ${b}</p>`).join("\n");
  return `${out}\n${defs}`;
}

export function createSubstackProvider(): Provider {
  return {
    id: "substack",
    hasDiscovery: true,

    async discover(conn: ConnectionRef, deps: ProviderDeps): Promise<DiscoveredDraft[]> {
      const origin = conn.handle ? substackOrigin(conn.handle) : null;
      if (!origin) {
        throw err(`invalid publication handle: ${conn.handle ?? "(none)"}`, "Link the publication's https address");
      }
      const out: DiscoveredDraft[] = [];
      let archiveDead = false;
      for (let page = 0; page < ARCHIVE_MAX_PAGES; page += 1) {
        const url = `${origin}/api/v1/archive?sort=new&search=&offset=${page * ARCHIVE_PAGE}&limit=${ARCHIVE_PAGE}`;
        const res = await deps.fetch.get(url, { accept: ARCHIVE_ACCEPT });
        if (!res.ok) {
          if (res.status === 404 && page === 0) {
            archiveDead = true;
            break; // /feed fallback below
          }
          throw fail(res, "archive");
        }
        let rows: ArchiveRow[];
        try {
          const parsed = JSON.parse(new TextDecoder().decode(res.bytes)) as unknown;
          rows = Array.isArray(parsed) ? (parsed as ArchiveRow[]) : [];
        } catch {
          throw err("archive response was not JSON", "Import your Substack export instead");
        }
        if (rows.length === 0) break;
        for (const row of rows) {
          const d = archiveDraft(row);
          if (d) out.push(d);
        }
        if (rows.length < ARCHIVE_PAGE) break;
      }
      if (archiveDead) {
        // The `/feed` fallback (§9.5): a publication without the archive endpoint still lists recent
        // items via RSS. Feed rows carry no `updated_at` → remoteChangeKey null → body-hash decides.
        const res = await deps.fetch.get(`${origin}/feed`, { accept: FEED_ACCEPT });
        if (!res.ok) throw fail(res, "feed");
        return draftsFromFeed(new TextDecoder().decode(res.bytes));
      }
      // An empty archive legitimately means zero remote posts (→ removed_remote) — it is NOT a
      // signal to try the feed.
      return out;
    },

    async fetch(item: DiscoveredDraft, conn: ConnectionRef, deps: ProviderDeps): Promise<FetchOutcome> {
      // Paywalled items are NEVER fetched — the export zip is the only path (REQ-INGEST-5).
      if (item.access === "paywalled") {
        return {
          ok: false,
          error: err("post is paywalled", "Import your Substack export — the paid post is in posts/"),
        };
      }
      const origin = conn.handle ? substackOrigin(conn.handle) : null;
      if (!origin) return { ok: false, error: err("missing publication handle", "Re-link the publication") };
      const slug =
        (item.url ? item.url.split("/").filter(Boolean).pop() : null) ?? item.externalId;
      const res = await deps.fetch.get(`${origin}/api/v1/posts/${encodeURIComponent(slug!)}`, {
        accept: ["application/json"],
      });
      if (!res.ok) return { ok: false, error: fail(res, `post ${slug}`) };
      let post: Record<string, unknown>;
      try {
        post = JSON.parse(new TextDecoder().decode(res.bytes)) as Record<string, unknown>;
      } catch {
        return { ok: false, error: err("post response was not JSON", "Retry the sync; if it persists, import your export") };
      }
      const bodyHtml = typeof post.body_html === "string" ? post.body_html : "";
      return {
        ok: true,
        body: {
          bytes: new TextEncoder().encode(rewriteFootnotes(bodyHtml)),
          contentType: "text/html",
          meta: {
            title: typeof post.title === "string" ? post.title : item.title,
            date: isoDay(typeof post.post_date === "string" ? post.post_date : undefined) ?? item.date,
            url: typeof post.canonical_url === "string" ? post.canonical_url : item.url,
            updatedAtRemote: typeof post.updated_at === "string" ? post.updated_at : null,
          },
        },
      };
    },

    changeKey(draft: DiscoveredDraft): string | null {
      return draft.remoteChangeKey;
    },
  };
}
