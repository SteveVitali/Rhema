// @rhema/engine — OTel configuration with all content flags OFF (§13.5; cross-cutting invariant 10).
//
// The SDK inherits OTel config so a run is one trace with phase + subagent spans — but traces carry ids and
// counts ONLY. Prompts, tool details, tool content and raw API bodies are never exported (REQ-DATA-37;
// §13.5). This builder is the single source of that config; a test asserts every content flag is off, so a
// future SDK upgrade that adds a content flag fails CI rather than silently leaking prompt text.

export interface OtelConfig {
  /** enable tracing export (ids + counts only). */
  readonly OTEL_SDK_DISABLED: "false";
  /** W3C trace context is propagated from the worker span so a run is one trace (§13.5). */
  readonly OTEL_PROPAGATORS: "tracecontext";
  /** content flags — ALL off. Names mirror the Claude Code / Agent SDK telemetry envs. */
  readonly OTEL_LOG_USER_PROMPTS: "0";
  readonly CLAUDE_CODE_ENABLE_TELEMETRY: "1";
  readonly OTEL_METRICS_INCLUDE_SESSION_ID: "false";
  readonly OTEL_LOGS_EXPORTER: "none";
  readonly OTEL_LOG_TOOL_INPUTS: "0";
  readonly OTEL_LOG_TOOL_OUTPUTS: "0";
  readonly OTEL_LOG_API_REQUEST_BODIES: "0";
  readonly OTEL_LOG_THINKING: "0";
}

/** Every key in `OtelConfig` that must be a content flag pinned OFF. The test enumerates these. */
export const OTEL_CONTENT_FLAGS = [
  "OTEL_LOG_USER_PROMPTS",
  "OTEL_LOG_TOOL_INPUTS",
  "OTEL_LOG_TOOL_OUTPUTS",
  "OTEL_LOG_API_REQUEST_BODIES",
  "OTEL_LOG_THINKING",
] as const;

/**
 * Build the OTel env the SDK inherits: tracing on (spans = ids + counts), every content flag off (§13.5).
 * Logs exporter is `none` so no log body carrying prompt/tool content is emitted at all.
 */
export function buildOtelConfig(): OtelConfig {
  return {
    OTEL_SDK_DISABLED: "false",
    OTEL_PROPAGATORS: "tracecontext",
    OTEL_LOG_USER_PROMPTS: "0",
    CLAUDE_CODE_ENABLE_TELEMETRY: "1",
    OTEL_METRICS_INCLUDE_SESSION_ID: "false",
    OTEL_LOGS_EXPORTER: "none",
    OTEL_LOG_TOOL_INPUTS: "0",
    OTEL_LOG_TOOL_OUTPUTS: "0",
    OTEL_LOG_API_REQUEST_BODIES: "0",
    OTEL_LOG_THINKING: "0",
  };
}
