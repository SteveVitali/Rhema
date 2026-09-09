import { describe, it, expect } from "vitest";
import { buildOtelConfig, OTEL_CONTENT_FLAGS } from "./otel.js";

// §13.5 / cross-cutting invariant 10: the SDK inherits OTel config with ALL content flags off, so traces
// carry ids + counts only — never prompts, tool details, tool content, raw bodies, or thinking.

describe("buildOtelConfig (§13.5)", () => {
  const cfg = buildOtelConfig() as unknown as Record<string, string>;

  it("has every content flag OFF", () => {
    for (const flag of OTEL_CONTENT_FLAGS) expect(cfg[flag]).toBe("0");
  });

  it("emits no logs body (logs exporter is none)", () => {
    expect(cfg.OTEL_LOGS_EXPORTER).toBe("none");
  });

  it("keeps tracing on so a run is one trace (spans = ids + counts)", () => {
    expect(cfg.OTEL_SDK_DISABLED).toBe("false");
    expect(cfg.OTEL_PROPAGATORS).toBe("tracecontext");
  });

  it("does not include the session id in metrics", () => {
    expect(cfg.OTEL_METRICS_INCLUDE_SESSION_ID).toBe("false");
  });
});
