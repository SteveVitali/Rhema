// @rhema/engine — the minimal structural subset of Claude Agent SDK messages the mapper consumes.
//
// The SDK is a vendored, proprietary dependency of run-task (§12.1 REQ-ARCH-4). It is NOT a workspace
// dependency: the engine talks to it through an injected `query()` function (see agent-sdk-engine.ts), so
// the mapper and the whole engine are testable under Node with recorded fixtures and no SDK install. These
// types capture only the fields the mapper reads; the SDK's own types are a superset. Keeping them here —
// structural, not nominal — means a fixture is plain JSON and the conformance suite (REQ-ARCH-7) is pure.

/** A block inside an assistant `message.content` array. Only the shapes the mapper reads. */
export type SdkContentBlock =
  | { type: "text"; text: string }
  | { type: "thinking"; thinking?: string }
  | {
      /** A tool the model asked to run (its REQUEST — never the source of a `source.read` URL, REQ-ARCH-15). */
      type: "tool_use";
      id: string;
      name: string;
      input: Record<string, unknown>;
    }
  | {
      /** A tool RESULT delivered back to the model. `source.read` URLs come from HERE (REQ-ARCH-15). */
      type: "tool_result";
      tool_use_id: string;
      content: unknown;
      is_error?: boolean;
    };

/** SDK token-usage block (Anthropic shape). All optional; the accumulator tolerates partials. */
export interface SdkUsage {
  input_tokens?: number;
  output_tokens?: number;
  cache_read_input_tokens?: number;
  cache_creation_input_tokens?: number;
  /** server-tool use counts (web search/fetch); the proxy meters cost — we surface counts only. */
  server_tool_use?: { web_search_requests?: number; web_fetch_requests?: number };
}

/** `type: "assistant"` — one model turn. `parent_tool_use_id` is set for subagent turns (depth 1). */
export interface SdkAssistantMessage {
  type: "assistant";
  message: { content: SdkContentBlock[]; usage?: SdkUsage };
  parent_tool_use_id?: string | null;
  uuid?: string;
  session_id?: string;
}

/** `type: "user"` — a tool result (or user text) fed back to the model. Carries tool_result blocks. */
export interface SdkUserMessage {
  type: "user";
  message: { content: SdkContentBlock[] | string };
  parent_tool_use_id?: string | null;
  uuid?: string;
}

/** `type: "system"` — init / compaction notices. */
export interface SdkSystemMessage {
  type: "system";
  subtype: "init" | "compact_boundary" | string;
  session_id?: string;
  /** present on some compaction notices */
  compact_metadata?: { trigger?: string; pre_tokens?: number };
}

/** The terminal `type: "result"` message. `subtype` drives completion-oracle leg (a) — REQ-SPEC-13. */
export interface SdkResultMessage {
  type: "result";
  subtype: "success" | "error_max_turns" | "error_during_execution" | string;
  is_error?: boolean;
  total_cost_usd?: number;
  usage?: SdkUsage;
  /** the proxy is the meter of record; this SDK figure is the cross-check (§12.7). */
  modelUsage?: Record<string, SdkUsage>;
  session_id?: string;
}

/** A partial-streaming event (`type: "stream_event"`). The mapper ignores these — it maps whole messages. */
export interface SdkStreamEvent {
  type: "stream_event";
  event?: unknown;
  parent_tool_use_id?: string | null;
}

/** The SDK message union the mapper accepts. */
export type SdkMessage =
  | SdkAssistantMessage
  | SdkUserMessage
  | SdkSystemMessage
  | SdkResultMessage
  | SdkStreamEvent;
