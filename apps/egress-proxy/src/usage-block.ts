// @rhema/egress-proxy — read the `usage` block out of an Anthropic Messages response (§12.7).
//
// The proxy is the meter of record, so it reads usage from the ACTUAL provider response — never from anything
// the sandbox supplied (cross-cutting invariant: no sandbox data alters metering). Handles both a non-streaming
// JSON response and a streaming SSE response (`stream: true`), where the final usage is assembled from
// `message_start` (input + cache tokens) and the last `message_delta` (cumulative output + server_tool_use).

import { EMPTY_METERED_USAGE, type MeteredUsage } from "./rates.js";

interface RawUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  server_tool_use?: { web_search_requests?: number; web_fetch_requests?: number };
}

function fromRaw(u: RawUsage | undefined, base: MeteredUsage): MeteredUsage {
  if (!u || typeof u !== "object") return base;
  return {
    inputTokens: u.input_tokens ?? base.inputTokens,
    outputTokens: u.output_tokens ?? base.outputTokens,
    cacheReadTokens: u.cache_read_input_tokens ?? base.cacheReadTokens,
    cacheWriteTokens: u.cache_creation_input_tokens ?? base.cacheWriteTokens,
    webSearchRequests: u.server_tool_use?.web_search_requests ?? base.webSearchRequests,
    webFetchRequests: u.server_tool_use?.web_fetch_requests ?? base.webFetchRequests,
  };
}

/** True when the body/content-type is a streaming SSE response rather than a single JSON object. */
export function isSseBody(body: string, contentType?: string): boolean {
  if (contentType && contentType.toLowerCase().includes("text/event-stream")) return true;
  const head = body.slice(0, 64).trimStart();
  return head.startsWith("event:") || head.startsWith("data:");
}

/**
 * Extract the metered usage from a non-streaming JSON Messages response. Returns `null` when the body carries
 * no `usage` block (e.g. an error body) — the caller then knows there is nothing to meter for this response.
 */
export function extractUsageFromJson(body: string): MeteredUsage | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object" || !("usage" in parsed)) return null;
  const usage = (parsed as { usage?: RawUsage }).usage;
  if (!usage || typeof usage !== "object") return null;
  return fromRaw(usage, EMPTY_METERED_USAGE);
}

/**
 * Extract the metered usage from a streaming SSE Messages response. Folds `message_start` (input + cache) with
 * the last `message_delta` (cumulative output + server_tool_use). Returns `null` when no usage is seen at all.
 */
export function extractUsageFromSse(body: string): MeteredUsage | null {
  let acc = EMPTY_METERED_USAGE;
  let saw = false;
  for (const line of body.split(/\r?\n/)) {
    const trimmed = line.trimStart();
    if (!trimmed.startsWith("data:")) continue;
    const json = trimmed.slice("data:".length).trim();
    if (!json || json === "[DONE]") continue;
    let ev: unknown;
    try {
      ev = JSON.parse(json);
    } catch {
      continue;
    }
    if (!ev || typeof ev !== "object") continue;
    const rec = ev as { type?: string; message?: { usage?: RawUsage }; usage?: RawUsage };
    const usage = rec.message?.usage ?? rec.usage;
    if (usage && typeof usage === "object") {
      acc = fromRaw(usage, acc);
      saw = true;
    }
  }
  return saw ? acc : null;
}

/** Extract metered usage from a Messages response, auto-detecting JSON vs SSE. `null` when no usage present. */
export function extractUsage(body: string, contentType?: string): MeteredUsage | null {
  return isSseBody(body, contentType) ? extractUsageFromSse(body) : extractUsageFromJson(body);
}

/**
 * The model the provider actually billed, from the response — the authoritative model for metering (a request
 * may omit it, but a Messages response always names the model it ran). JSON: top-level `model`; SSE: the
 * `message_start` event's `message.model`. `null` when absent.
 */
export function extractModel(body: string, contentType?: string): string | null {
  if (isSseBody(body, contentType)) {
    for (const line of body.split(/\r?\n/)) {
      const trimmed = line.trimStart();
      if (!trimmed.startsWith("data:")) continue;
      const json = trimmed.slice("data:".length).trim();
      if (!json || json === "[DONE]") continue;
      try {
        const ev = JSON.parse(json) as { message?: { model?: unknown }; model?: unknown };
        const m = ev.message?.model ?? ev.model;
        if (typeof m === "string" && m.length > 0) return m;
      } catch {
        continue;
      }
    }
    return null;
  }
  try {
    const parsed = JSON.parse(body) as { model?: unknown };
    return typeof parsed.model === "string" && parsed.model.length > 0 ? parsed.model : null;
  } catch {
    return null;
  }
}
