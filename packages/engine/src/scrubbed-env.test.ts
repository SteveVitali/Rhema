import { describe, it, expect } from "vitest";
import {
  buildAgentEnv,
  assertScrubbed,
  ALLOWED_AGENT_ENV_KEYS,
  FORBIDDEN_AGENT_ENV_KEYS,
  PROXY_PLACEHOLDER_ANTHROPIC_API_KEY,
} from "./scrubbed-env.js";

// The scrubbed env is the single most load-bearing secret boundary (REQ-SPEC-10; AC1's env leg). The model's
// process must carry ONLY the four scrubbed keys and NEVER a token/credential — so a shell escape has nothing
// to present to the internal API or the proxy.

describe("buildAgentEnv (REQ-SPEC-10)", () => {
  const env = buildAgentEnv({ runId: "run_9", proxyBaseUrl: "http://proxy.internal:8080", configDir: "/work/.config" });

  it("contains exactly the scrubbed key set", () => {
    expect(Object.keys(env).sort()).toEqual([...ALLOWED_AGENT_ENV_KEYS].sort());
  });

  it("sets the proxy URL, disables auto-memory, and pins the per-run config dir", () => {
    expect(env.ANTHROPIC_BASE_URL).toBe("http://proxy.internal:8080");
    expect(env.CLAUDE_CODE_DISABLE_AUTO_MEMORY).toBe("1");
    expect(env.CLAUDE_CONFIG_DIR).toBe("/work/.config");
    expect(env.RUN_ID).toBe("run_9");
  });

  it("carries the NON-SECRET placeholder ANTHROPIC_API_KEY so the CLI runs (D-P0.06-1), never a real key", () => {
    expect(env.ANTHROPIC_API_KEY).toBe(PROXY_PLACEHOLDER_ANTHROPIC_API_KEY);
    expect(env.ANTHROPIC_API_KEY.includes("placeholder")).toBe(true); // clearly not a real provider key
  });

  it("carries none of the forbidden secret keys", () => {
    for (const k of FORBIDDEN_AGENT_ENV_KEYS) expect(k in env).toBe(false);
  });
});

describe("assertScrubbed (the last-line guard before execve)", () => {
  it("throws if a token rode in", () => {
    expect(() => assertScrubbed({ RUN_ID: "r", RUN_TOKEN: "jwt" } as Record<string, string>)).toThrow(/RUN_TOKEN/);
  });
  it("throws if the proxy credential rode in", () => {
    expect(() => assertScrubbed({ RUN_ID: "r", PROXY_CREDENTIAL: "c" } as Record<string, string>)).toThrow(/PROXY_CREDENTIAL/);
  });
  it("throws on any non-scrubbed key (nothing leaks by inheritance)", () => {
    expect(() => assertScrubbed({ RUN_ID: "r", PATH: "/usr/bin" } as Record<string, string>)).toThrow(/PATH/);
  });
  it("accepts the exact scrubbed set (incl. the placeholder key)", () => {
    expect(() =>
      assertScrubbed({
        RUN_ID: "r",
        ANTHROPIC_BASE_URL: "http://p",
        ANTHROPIC_API_KEY: PROXY_PLACEHOLDER_ANTHROPIC_API_KEY,
        CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1",
        CLAUDE_CONFIG_DIR: "/c",
      }),
    ).not.toThrow();
  });

  it("throws if a REAL ANTHROPIC_API_KEY rode in (only the placeholder is allowed — REQ-SPEC-10/11)", () => {
    expect(() =>
      assertScrubbed({ RUN_ID: "r", ANTHROPIC_API_KEY: "sk-ant-api03-real-key-xyz" } as Record<string, string>),
    ).toThrow(/placeholder/);
  });
});
