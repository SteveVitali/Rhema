// @rhema/egress-proxy — outbound-channel limits at the proxy (§12.8d; REQ-SPEC-25 proxy half).
//
// Three limits on the search/fetch exfil channel, enforced on the `/v1/messages` body the sandbox sends:
//  1. a `web_fetch` URL whose query string exceeds 256 chars is stripped (or refused if unparseable) — a long
//     `?d=<base64 of the draft>` cannot leave;
//  2. distinct fetched registrable domains not already in the claim ledger or a search result are capped per
//     run (a `NovelDomainTracker`);
//  3. `search.performed` queries are n-gram-diffed against the draft (see ngram.ts).
// Server tools run on Anthropic's side, so a fetch/search issued this turn appears in the body as history on
// the next turn; the proxy neutralizes it there — the honestly-stated residual risk of §12.8.

/** §12.8d: web_fetch query strings longer than this are stripped or refused. */
export const MAX_WEB_FETCH_QUERY_CHARS = 256 as const;

export type WebFetchGuard =
  | { readonly action: "allow"; readonly url: string }
  | { readonly action: "stripped"; readonly url: string; readonly originalUrl: string }
  | { readonly action: "refused"; readonly url: string; readonly reason: string };

/**
 * Guard one web_fetch URL (§12.8d). An unparseable URL is refused; a URL whose query string exceeds 256 chars
 * has its query stripped (the fragment goes too); otherwise it is allowed unchanged. The query length is
 * measured WITHOUT the leading `?`, so a 300-char query string is over the 256 limit.
 */
export function guardWebFetchUrl(raw: string): WebFetchGuard {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return { action: "refused", url: raw, reason: "unparseable web_fetch URL" };
  }
  const queryLen = u.search.replace(/^\?/, "").length;
  if (queryLen > MAX_WEB_FETCH_QUERY_CHARS) {
    u.search = "";
    u.hash = "";
    return { action: "stripped", url: u.toString(), originalUrl: raw };
  }
  return { action: "allow", url: raw };
}

/** A server-tool invocation the proxy extracted from a request body (history), for the outbound checks. */
export type ServerToolInvocation =
  | { readonly kind: "search"; readonly query: string; readonly path: BlockPath }
  | { readonly kind: "fetch"; readonly url: string; readonly path: BlockPath };

/** Where a block lives in the body, so a rewrite can target it: messages[mi].content[ci]. */
export interface BlockPath {
  readonly messageIndex: number;
  readonly contentIndex: number;
}

function toolNameOf(block: Record<string, unknown>): string {
  const name = typeof block["name"] === "string" ? (block["name"] as string) : "";
  const type = typeof block["type"] === "string" ? (block["type"] as string) : "";
  return `${name} ${type}`;
}

/**
 * Walk `body.messages[].content[]` for `tool_use` / `server_tool_use` blocks that invoke web_search (→ query)
 * or web_fetch (→ url). Returns each with its path so the handler can rewrite it in place. Tolerant of any
 * shape: a non-conforming body yields no invocations.
 */
export function extractServerToolInvocations(body: unknown): ServerToolInvocation[] {
  const out: ServerToolInvocation[] = [];
  if (!body || typeof body !== "object") return out;
  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return out;
  messages.forEach((msg, messageIndex) => {
    const content = (msg as { content?: unknown })?.content;
    if (!Array.isArray(content)) return;
    content.forEach((block, contentIndex) => {
      if (!block || typeof block !== "object") return;
      const b = block as Record<string, unknown>;
      const type = b["type"];
      if (type !== "tool_use" && type !== "server_tool_use") return;
      const tag = toolNameOf(b);
      const input = (b["input"] ?? {}) as Record<string, unknown>;
      const path: BlockPath = { messageIndex, contentIndex };
      if (tag.includes("web_search") && typeof input["query"] === "string") {
        out.push({ kind: "search", query: input["query"], path });
      } else if (tag.includes("web_fetch") && typeof input["url"] === "string") {
        out.push({ kind: "fetch", url: input["url"], path });
      }
    });
  });
  return out;
}

/** A server-tool activity the proxy read from a RESPONSE (this turn's real search/fetch), for the fetch log. */
export type ServerToolActivity =
  | { readonly kind: "search"; readonly query: string }
  | { readonly kind: "fetch"; readonly url: string };

function collectFromContent(content: unknown, out: ServerToolActivity[]): void {
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    const type = b["type"];
    if (type !== "tool_use" && type !== "server_tool_use") continue;
    const tag = toolNameOf(b);
    const input = (b["input"] ?? {}) as Record<string, unknown>;
    if (tag.includes("web_search") && typeof input["query"] === "string") {
      out.push({ kind: "search", query: input["query"] });
    } else if (tag.includes("web_fetch") && typeof input["url"] === "string") {
      out.push({ kind: "fetch", url: input["url"] });
    }
  }
}

/**
 * Extract THIS turn's server-tool activity from a JSON Messages RESPONSE (`content[]`). This is the correct,
 * non-duplicative source for the fetch log of record: the request body carries full history (a fetch would be
 * re-logged every turn), whereas the response names only what actually ran this turn. SSE responses stream
 * these across deltas — best-effort skipped here (the JSON path covers the deterministic cases).
 */
export function extractResponseServerTools(body: string): ServerToolActivity[] {
  const out: ServerToolActivity[] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return out;
  }
  if (parsed && typeof parsed === "object") collectFromContent((parsed as { content?: unknown }).content, out);
  return out;
}

/**
 * Extract THIS turn's server-tool activity from a STREAMING (`stream:true`) Messages response (D-P0.07-5). A
 * `server_tool_use` block streams as `content_block_start` (carrying the tool name) then a run of
 * `input_json_delta` deltas (the `input` JSON assembled piecewise) closed by `content_block_stop`. We accumulate
 * the partial JSON per block index, parse it at stop (or end of stream), and emit the same `ServerToolActivity`
 * the JSON path emits — so a streaming response logs its fetch/search rows once, exactly like a buffered one.
 * Malformed lines / unparseable input are skipped (best-effort — the fetch log must never crash the response).
 */
export function extractResponseServerToolsSse(body: string): ServerToolActivity[] {
  const out: ServerToolActivity[] = [];
  // per content-block index: the tool name (from content_block_start) + the accumulated input JSON string.
  const blocks = new Map<number, { name: string; json: string }>();

  const resolve = (index: number): void => {
    const b = blocks.get(index);
    if (!b) return;
    blocks.delete(index);
    let input: Record<string, unknown>;
    try {
      input = (b.json ? JSON.parse(b.json) : {}) as Record<string, unknown>;
    } catch {
      return; // partial/garbled input — skip rather than mis-log
    }
    if (b.name.includes("web_search") && typeof input["query"] === "string") {
      out.push({ kind: "search", query: input["query"] });
    } else if (b.name.includes("web_fetch") && typeof input["url"] === "string") {
      out.push({ kind: "fetch", url: input["url"] });
    }
  };

  for (const line of body.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice("data:".length).trim();
    if (payload === "" || payload === "[DONE]") continue;
    let ev: Record<string, unknown>;
    try {
      ev = JSON.parse(payload) as Record<string, unknown>;
    } catch {
      continue;
    }
    const type = ev["type"];
    if (type === "content_block_start") {
      const index = ev["index"];
      const cb = ev["content_block"] as Record<string, unknown> | undefined;
      const cbType = cb?.["type"];
      if (typeof index === "number" && (cbType === "server_tool_use" || cbType === "tool_use")) {
        const name = typeof cb?.["name"] === "string" ? (cb["name"] as string) : "";
        // some responses inline a complete `input` at start (no deltas) — seed the json from it.
        const seeded = cb?.["input"] && Object.keys(cb["input"] as object).length > 0 ? JSON.stringify(cb["input"]) : "";
        blocks.set(index, { name, json: seeded });
      }
    } else if (type === "content_block_delta") {
      const index = ev["index"];
      const delta = ev["delta"] as Record<string, unknown> | undefined;
      if (typeof index === "number" && delta?.["type"] === "input_json_delta" && typeof delta["partial_json"] === "string") {
        const b = blocks.get(index);
        if (b) b.json += delta["partial_json"] as string;
      }
    } else if (type === "content_block_stop") {
      const index = ev["index"];
      if (typeof index === "number") resolve(index);
    }
  }
  // resolve any blocks that never saw an explicit stop (a truncated stream).
  for (const index of [...blocks.keys()]) resolve(index);
  return out;
}

/** Set `body.messages[mi].content[ci].input.url` to `url` on a deep clone; returns the new body. */
export function rewriteFetchUrl(body: unknown, path: BlockPath, url: string): unknown {
  const clone = JSON.parse(JSON.stringify(body)) as {
    messages?: { content?: { input?: Record<string, unknown> }[] }[];
  };
  const block = clone.messages?.[path.messageIndex]?.content?.[path.contentIndex];
  if (block && typeof block === "object") {
    block.input = { ...(block.input ?? {}), url };
  }
  return clone;
}

/**
 * Per-run tracker for the distinct-novel-domain cap (§12.8d). A registrable domain already in the claim ledger
 * or a prior search result (`knownDomains`) is free; a genuinely new domain counts against `cap`. State is
 * per run and in-memory (the proxy is a single meter of record for the run's lifetime); P0.08 seeds
 * `knownDomains` from committed state.
 */
export class NovelDomainTracker {
  private readonly novelByRun = new Map<string, Set<string>>();

  /**
   * Admit a fetched domain for a run. Returns whether it is allowed and the running novel count. A domain in
   * `knownDomains`, or already admitted for this run, never pushes the count up. When `cap` is undefined the
   * channel is uncapped (still counted, always admitted).
   */
  admit(
    runId: string,
    domain: string,
    knownDomains: readonly string[] | undefined,
    cap: number | undefined,
  ): { admitted: boolean; novelCount: number; novel: boolean } {
    const known = new Set((knownDomains ?? []).map((d) => d.toLowerCase()));
    const d = domain.toLowerCase();
    const seen = this.novelByRun.get(runId) ?? new Set<string>();
    if (known.has(d) || seen.has(d)) {
      return { admitted: true, novelCount: seen.size, novel: false };
    }
    // A new novel domain: admit only if it stays within the cap.
    if (cap !== undefined && seen.size >= cap) {
      return { admitted: false, novelCount: seen.size, novel: true };
    }
    seen.add(d);
    this.novelByRun.set(runId, seen);
    return { admitted: true, novelCount: seen.size, novel: true };
  }

  /** Distinct novel domains admitted for a run so far (for tests / diagnostics). */
  novelCount(runId: string): number {
    return this.novelByRun.get(runId)?.size ?? 0;
  }
}
