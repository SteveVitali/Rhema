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

/**
 * Count the server-tool invocations in a request's history that ACTUALLY EXECUTED (RES.1). The PRB.22
 * history counter accepted every `tool_use`-shaped block, including calls the provider never ran — the
 * incident run logged a `web_search` `allow` row (`query "test search"`) against a metered `searches=0`
 * because the model emitted a plain `tool_use` for a tool that was not in the request. A real server-tool
 * execution surfaces as a `server_tool_use` block paired with a `web_*_tool_result` block, so only those
 * count — per kind we take the larger of the two (a compacted/truncated transcript can drop the use block
 * while keeping the result).
 */
export function extractExecutedServerToolUses(body: unknown): { searches: number; fetches: number } {
  let searchUses = 0;
  let fetchUses = 0;
  let searchResults = 0;
  let fetchResults = 0;
  if (!body || typeof body !== "object") return { searches: 0, fetches: 0 };
  const messages = (body as { messages?: unknown }).messages;
  if (!Array.isArray(messages)) return { searches: 0, fetches: 0 };
  for (const msg of messages) {
    const content = (msg as { content?: unknown })?.content;
    if (!Array.isArray(content)) continue;
    for (const block of content) {
      if (!block || typeof block !== "object") continue;
      const b = block as Record<string, unknown>;
      const type = b["type"];
      const tag = toolNameOf(b);
      if (type === "server_tool_use") {
        if (tag.includes("web_search")) searchUses++;
        else if (tag.includes("web_fetch")) fetchUses++;
      } else if (typeof type === "string" && type.includes("web_search_tool_result")) {
        searchResults++;
      } else if (typeof type === "string" && type.includes("web_fetch_tool_result")) {
        fetchResults++;
      }
    }
  }
  return { searches: Math.max(searchUses, searchResults), fetches: Math.max(fetchUses, fetchResults) };
}

/** A server-tool activity the proxy read from a RESPONSE (this turn's real search/fetch), for the fetch log. */
export type ServerToolActivity =
  | { readonly kind: "search"; readonly query: string; readonly url?: undefined; readonly bytes?: undefined }
  /**
   * CITE.1 (ADR-084) — a URL a `web_search_tool_result` surfaced: logged `kind:'search'` (the shape the
   * delivery guard's `RetrievedUrl` union already accepts), NOT `fetch` — the page was never retrieved,
   * only its snippet was. This is what lets the completeness record, the dossier's "Search result" chip,
   * and the §12.8(c) search-domain provenance tell a snippet from a fetched page.
   */
  | { readonly kind: "search"; readonly url: string; readonly bytes?: number; readonly query?: undefined }
  | { readonly kind: "fetch"; readonly url: string; readonly bytes?: number; readonly query?: undefined };

/**
 * The byte receipt for one returned page (PRB.19 — `fetch_log.bytes` on `kind=fetch` server-tool rows). The
 * Anthropic server-tool result carries the fetched content inline, never an HTTP status: a
 * `web_fetch_result`'s `content.source.data` (text or base64) and a `web_search_result`'s opaque
 * `encrypted_content` both size the page the model actually received. Undefined when the block carries
 * neither (an error result or an unrecognized shape).
 */
function resultBytes(r: Record<string, unknown>): number | undefined {
  const encrypted = r["encrypted_content"];
  if (typeof encrypted === "string" && encrypted.length > 0) return Buffer.byteLength(encrypted, "utf8");
  const source = ((r["content"] as Record<string, unknown> | undefined)?.["source"] ?? undefined) as
    | Record<string, unknown>
    | undefined;
  const data = source?.["data"];
  if (typeof data === "string" && data.length > 0) {
    return source?.["type"] === "base64" ? Buffer.byteLength(data, "base64") : Buffer.byteLength(data, "utf8");
  }
  return undefined;
}

/**
 * Pull the RESULT urls out of a `web_search_tool_result` (or `web_fetch_tool_result`) block's content — the
 * pages the server-side search/fetch actually returned and the model then reads and CITES. Without this the
 * fetch log held only the search QUERY (no url), so `cited_not_fetched` failed every claim on a run that did its
 * research through Anthropic's SERVER-SIDE web tools (the fetches never traverse the proxy as separate requests
 * — D-P0.15-2, diagnosed live P0.15h). An error result is an object (not an array) → nothing was fetched.
 */
function collectResultUrls(
  content: unknown,
  out: ServerToolActivity[],
  kind: "search" | "fetch" = "fetch",
): void {
  const results = Array.isArray(content) ? content : content && typeof content === "object" ? [content] : [];
  for (const r of results) {
    if (!r || typeof r !== "object") continue;
    const u = (r as Record<string, unknown>)["url"];
    if (typeof u === "string" && u) {
      const bytes = resultBytes(r as Record<string, unknown>);
      out.push({ kind, url: u, ...(bytes !== undefined ? { bytes } : {}) });
    }
  }
}

function collectFromContent(content: unknown, out: ServerToolActivity[]): void {
  if (!Array.isArray(content)) return;
  for (const block of content) {
    if (!block || typeof block !== "object") continue;
    const b = block as Record<string, unknown>;
    const type = b["type"];
    // RES.1 — only `server_tool_use` counts as executed server-tool activity: a plain `tool_use` is a
    // CLIENT-side call the provider never ran (the incident run's phantom `query "test search"` allow
    // row was exactly that — logged against metered `searches=0`). The fetch log must not mint
    // `allow` evidence for a search/fetch that never executed.
    if (type === "server_tool_use") {
      const tag = toolNameOf(b);
      const input = (b["input"] ?? {}) as Record<string, unknown>;
      if (tag.includes("web_search") && typeof input["query"] === "string") {
        out.push({ kind: "search", query: input["query"] });
      } else if (tag.includes("web_fetch") && typeof input["url"] === "string") {
        out.push({ kind: "fetch", url: input["url"] });
      }
    } else if (typeof type === "string" && (type.includes("web_search_tool_result") || type.includes("web_fetch_tool_result"))) {
      // the server-tool RESULT block: its `content` carries the pages the search/fetch returned (each
      // with `url`). CITE.1 (ADR-084) — a `web_search_tool_result`'s urls are SEARCH HITS (`kind:
      // 'search'` — retrieved as snippets only); a `web_fetch_tool_result`'s are fetched pages.
      collectResultUrls(b["content"], out, type.includes("web_search") ? "search" : "fetch");
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
      // RES.1 — `server_tool_use` only (see collectFromContent): a plain `tool_use` never executed.
      if (typeof index === "number" && cbType === "server_tool_use") {
        const name = typeof cb?.["name"] === "string" ? (cb["name"] as string) : "";
        // some responses inline a complete `input` at start (no deltas) — seed the json from it.
        const seeded = cb?.["input"] && Object.keys(cb["input"] as object).length > 0 ? JSON.stringify(cb["input"]) : "";
        blocks.set(index, { name, json: seeded });
      } else if (typeof cbType === "string" && (cbType.includes("web_search_tool_result") || cbType.includes("web_fetch_tool_result"))) {
        // a server-tool RESULT block streams complete at `content_block_start` (not via input deltas): its
        // `content` holds the returned pages, each with the `url` the model reads + cites (feeds
        // cited⇒fetched). CITE.1 (ADR-084) — search-result urls log as `search` rows (snippet-only).
        collectResultUrls(cb?.["content"], out, cbType.includes("web_search") ? "search" : "fetch");
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

/**
 * A live grant a forwarded `/v1/messages` request holds against the run's research budgets (RES.1;
 * REQ-SPEC-31(2)). The handler reserves the `max_uses` it actually granted at admission and releases the
 * reservation when the response is metered (or the forward fails). `release` is idempotent.
 */
export interface ResearchReservation {
  release(): void;
}

/**
 * Per-run cumulative web_search / web_fetch use (PRB.22 — D-PRB.21-1) PLUS in-flight grants (RES.1).
 *
 * `max_uses` on a server web tool bounds ONE API call, so a run's research volume needs a cross-request
 * bound: the proxy records every response's metered `server_tool_use` counts and the handler subtracts
 * the running totals from the run's `WebToolPolicy` budgets — shrinking `max_uses` to the remainder and
 * dropping the tool entirely at zero.
 *
 * RES.1 adds the missing half the 2026-09-30 incident exposed: four parallel Haiku research subagents
 * were each admitted while the committed count was still 0, each carrying `max_uses` = the full remainder
 * (12) — the wave executed 28 searches against a 12-search budget, then the drop-at-zero left the rest of
 * verification (and every later phase) tool-less. `reserve`/`inflight` close that window: the grant each
 * request is ADMITTED with counts against the next request's headroom until the response settles, so the
 * sum of live grants plus committed use can never exceed the budget by more than one request's own cap.
 *
 * Grants are TTL-bound (`RESEARCH_GRANT_TTL_MS`): a wedged upstream request holds its reservation only
 * until expiry, so a stuck grant can never starve a later attempt's verification (fail-safe direction —
 * a lost grant over-admits; it never under-admits the reserved floor). Run-keyed in-memory state, like the
 * cap accountant: the proxy is the run's one meter of record for its lifetime (prod runs a single-instance
 * MIG — `targetSize: 1`), and the request-history count (the handler's other input) covers any gap a
 * restart would leave.
 */
export const RESEARCH_GRANT_TTL_MS = 10 * 60 * 1000;

export class ResearchUsageTracker {
  private readonly byRun = new Map<
    string,
    {
      fetches: number;
      searches: number;
      /** CITE.1 (ADR-085) — `backfill`-class committed fetches: a SEPARATE counter that never enters
       *  `fetches`, so the mechanism's spend can never shrink the research budget (or the floor share)
       *  the main counters feed. */
      backfillFetches: number;
      grants: Map<number, { searches: number; fetches: number; expiresAt: number; cls?: string }>;
    }
  >();
  private grantSeq = 0;
  private readonly now: () => number;

  constructor(opts: { readonly now?: () => number } = {}) {
    this.now = opts.now ?? (() => Date.now());
  }

  private row(runId: string) {
    let cur = this.byRun.get(runId);
    if (!cur) {
      cur = { fetches: 0, searches: 0, backfillFetches: 0, grants: new Map() };
      this.byRun.set(runId, cur);
    }
    return cur;
  }

  /** Record one served response's server-tool use for the run (from `usage.server_tool_use` / parsed blocks). */
  record(
    runId: string,
    delta: { readonly fetches?: number; readonly searches?: number },
    cls?: string,
  ): void {
    const cur = this.row(runId);
    // CITE.1 — `backfill` use settles on its own counter only: the research budgets and the floor are
    // never drawn down by the mechanism (ADR-085).
    if (cls === "backfill") {
      cur.backfillFetches += delta.fetches ?? 0;
      return;
    }
    cur.fetches += delta.fetches ?? 0;
    cur.searches += delta.searches ?? 0;
  }

  /** The run's cumulative server-tool use so far (committed responses only). */
  usage(runId: string): { fetches: number; searches: number } {
    const cur = this.byRun.get(runId);
    return { fetches: cur?.fetches ?? 0, searches: cur?.searches ?? 0 };
  }

  /**
   * CITE.1 — the run's committed + in-flight `backfill`-class fetch use: the input to the dedicated
   * `backfillFetchBudget` bound (ADR-085 — a separate allowance, never the research budget/floor).
   */
  backfillUsage(runId: string): { fetches: number } {
    const cur = this.byRun.get(runId);
    if (!cur) return { fetches: 0 };
    const now = this.now();
    for (const [id, g] of cur.grants) if (g.expiresAt <= now) cur.grants.delete(id);
    let inflight = 0;
    for (const g of cur.grants.values()) if (g.cls === "backfill") inflight += g.fetches;
    return { fetches: cur.backfillFetches + inflight };
  }

  /**
   * The run's RESERVED-but-unsettled server-tool use: the sum of live admission grants (`max_uses` values
   * already handed to in-flight requests). A grant older than `RESEARCH_GRANT_TTL_MS` is expired out —
   * a wedged request's reservation cannot starve later verification (RES.1's fail-safe direction).
   * `backfill`-class grants are excluded — their dedicated allowance is tracked by `backfillUsage`.
   */
  inflight(runId: string): { searches: number; fetches: number } {
    const cur = this.byRun.get(runId);
    if (!cur) return { searches: 0, fetches: 0 };
    const now = this.now();
    for (const [id, g] of cur.grants) if (g.expiresAt <= now) cur.grants.delete(id);
    let searches = 0;
    let fetches = 0;
    for (const g of cur.grants.values()) {
      if (g.cls === "backfill") continue;
      searches += g.searches;
      fetches += g.fetches;
    }
    return { searches, fetches };
  }

  /**
   * Reserve the grants a request was just admitted with (the `max_uses` on the forwarded web tools).
   * The returned reservation is released when the response is metered (the committed delta replaces the
   * grant) or when the forward fails — never double-counted, never leaked past the TTL. `cls` tags the
   * grant's admission class so a `backfill` grant never masquerades as research headroom.
   */
  reserve(
    runId: string,
    grant: { readonly searches: number; readonly fetches: number },
    cls?: string,
  ): ResearchReservation {
    if (grant.searches <= 0 && grant.fetches <= 0) return { release: () => undefined };
    const cur = this.row(runId);
    const id = ++this.grantSeq;
    cur.grants.set(id, {
      searches: Math.max(0, grant.searches),
      fetches: Math.max(0, grant.fetches),
      expiresAt: this.now() + RESEARCH_GRANT_TTL_MS,
      ...(cls !== undefined ? { cls } : {}),
    });
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        this.byRun.get(runId)?.grants.delete(id);
      },
    };
  }
}
