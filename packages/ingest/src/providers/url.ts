// The single-URL provider (§9.5 matrix row 7). One linked page = one discovered item; the fetch is a
// Readability-class extraction (article/main preferred, chrome stripped) routed through the fetch
// port — the same operator-owned fetcher every provider uses. Change key: ETag → Last-Modified →
// normalized body hash (REQ-INGEST-12 row). A recognized paywall lands the item `partial` with a
// note — never a credentialed retry (there is none to take, AC-I-B).

import type {
  ConnectionRef,
  DiscoveredDraft,
  FetchOutcome,
  Provider,
  ProviderDeps,
  ProviderError,
} from "../types.js";

const PAGE_ACCEPT = ["text/html", "application/xhtml+xml", "text/plain", "text/markdown"] as const;

function err(message: string, remedy: string): ProviderError {
  return { message, remedy };
}

/** Normalize a linked page URL (lowercase host, drop the hash, strip a trailing slash). */
export function normalizeItemUrl(url: string): string | null {
  try {
    const u = new URL(url.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    const s = u.toString();
    return s.endsWith("/") && u.pathname === "/" ? s.slice(0, -1) : s;
  } catch {
    return null;
  }
}

/** Paywall markers — the honest "we can only see part of this" signal (→ `partial` + note). */
const PAYWALL_MARKERS = [
  /class="[^"]*paywall/i,
  /id="[^"]*paywall/i,
  /is-(?:paid|premium|subscriber)-content/i,
  /data-paywall/i,
  /subscribe to (?:continue|read|unlock)/i,
  /this (?:post|article|story) is (?:for|only for) (?:paid )?subscribers/i,
];

export function detectsPaywall(html: string): boolean {
  return PAYWALL_MARKERS.some((re) => re.test(html));
}

/**
 * Readability-class extraction: prefer `<article>`/`<main>`/a `[role=main]` subtree; strip
 * script/style/nav/header/footer/aside/form/noscript; fall back to `<body>`. Pure string surgery —
 * no DOM dependency, deterministic on fixtures.
 */
export function extractArticle(html: string): string {
  let work = html;
  work = work.replace(/<(script|style|noscript|iframe|svg|canvas|form)[^>]*>[\s\S]*?<\/\1>/gi, "");
  work = work.replace(/<(nav|header|footer|aside)[^>]*>[\s\S]*?<\/\1>/gi, "");
  const pick = (re: RegExp): string | null => {
    const m = re.exec(work);
    return m ? m[1]! : null;
  };
  const article =
    pick(/<article[^>]*>([\s\S]*?)<\/article>/i) ??
    pick(/<main[^>]*>([\s\S]*?)<\/main>/i) ??
    pick(/<div[^>]*role="main"[^>]*>([\s\S]*?)<\/div>/i) ??
    pick(/<body[^>]*>([\s\S]*?)<\/body>/i) ??
    work;
  return article;
}

const titleOf = (html: string): string | null => {
  const og = /<meta[^>]*property="og:title"[^>]*content="([^"]*)"/i.exec(html)?.[1];
  if (og) return og;
  const t = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html)?.[1];
  return t ? t.replace(/\s+/g, " ").trim() : null;
};

export function createUrlProvider(): Provider {
  return {
    id: "url",
    hasDiscovery: true,

    // Discovery emits the ONE row — the linked page itself — and fetches nothing (REQ-INGEST-3).
    async discover(conn: ConnectionRef, _deps: ProviderDeps): Promise<DiscoveredDraft[]> {
      const url = conn.handle ? normalizeItemUrl(conn.handle) : null;
      if (!url) throw err(`invalid url: ${conn.handle ?? "(none)"}`, "Link a public https page");
      return [
        {
          externalId: url,
          title: null,
          url,
          date: null,
          wordCount: null,
          access: "free",
          remoteChangeKey: null,
        },
      ];
    },

    async fetch(item: DiscoveredDraft, _conn: ConnectionRef, deps: ProviderDeps): Promise<FetchOutcome> {
      const url = item.url ?? item.externalId;
      const res = await deps.fetch.get(url, { accept: PAGE_ACCEPT });
      if (!res.ok) {
        const remedy =
          res.status === 404
            ? "The page is gone — the item stays in your corpus"
            : res.denyReason === "robots"
              ? "The site disallows crawling — paste the text or upload a file instead"
              : "Check the link and re-sync";
        return { ok: false, error: err(res.reason, remedy) };
      }
      const html = new TextDecoder().decode(res.bytes);
      const article = extractArticle(html);
      return {
        ok: true,
        body: {
          bytes: new TextEncoder().encode(article),
          contentType: "text/html",
          meta: {
            title: titleOf(html),
            url: res.finalUrl ?? url,
            etag: res.headers["etag"] ?? null,
            lastModified: res.headers["last-modified"] ?? null,
            paywalled: detectsPaywall(html),
          },
        },
      };
    },

    changeKey(draft: DiscoveredDraft): string | null {
      return draft.remoteChangeKey;
    },
  };
}

/** The url provider's post-fetch change key (§9.5): ETag, else Last-Modified, else the body hash. */
export function urlChangeKey(meta: { etag?: string | null; lastModified?: string | null }): string | null {
  if (meta.etag) return `etag:${meta.etag}`;
  if (meta.lastModified) return `last-modified:${meta.lastModified}`;
  return null;
}
