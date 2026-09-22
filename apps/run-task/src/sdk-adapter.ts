// @rhema/run-task — the LIVE Agent SDK adapter (D-P0.06-4).
//
// `AgentSdkEngine` (in @rhema/engine) is DI'd over a `QueryFn` so the whole engine + mapper suite runs
// under Node with recorded fixtures and NO SDK install (REQ-ARCH-4/7). This module is the one place that
// binds that seam to the real, vendored `@anthropic-ai/claude-agent-sdk` `query()` — it lives in run-task
// (the image the SDK is vendored into), NOT in @rhema/engine, so the package stays SDK-free.
//
// The SDK is proprietary and absent from the build env; `@anthropic-ai/claude-agent-sdk` is declared as an
// ambient module (see `sdk-ambient.d.ts`) and loaded by a DYNAMIC import, so this file compiles and
// run-task's own tests run without it. In the run-task image the real vendored module resolves at runtime.

import type { QueryFn } from "@rhema/engine";
import type { AgentSdkQueryOptions, SdkMessage } from "@rhema/engine";

/** The narrow shape we need from the vendored SDK: `query({prompt, options})` → an SDK message stream. */
export type SdkQueryLike = (args: { prompt: string; options: unknown }) => AsyncIterable<unknown>;

/**
 * The SINGLE field-mapping point between our §12.2 `AgentSdkQueryOptions` and the SDK's own `Options`.
 *
 * `buildQueryOptions` (@rhema/engine) already builds this object to the §12.2 shape the SDK expects, so
 * the mapping is the identity today. If a vendored SDK version renames a field, adjust it HERE — one
 * place — and the conformance fixtures (recorded from real SDK messages) keep the mapper honest.
 */
export function toSdkOptions(options: AgentSdkQueryOptions): unknown {
  return options;
}

/**
 * Adapt a vendored SDK `query()` into the engine's `QueryFn`. Pure: no import, no I/O — the SDK-loading is
 * `loadSdkQuery` below, so this bridging (options mapping + message-stream typing) is unit-tested with a
 * fake `sdkQuery`. The SDK's message types are a structural SUPERSET of `SdkMessage`; the mapper reads only
 * the fields `SdkMessage` names, so yielding them as `SdkMessage` is sound (the conformance suite proves it).
 */
export function adaptSdkQuery(sdkQuery: SdkQueryLike): QueryFn {
  return ({ prompt, options }) => {
    const stream = sdkQuery({ prompt, options: toSdkOptions(options) });
    async function* typed(): AsyncIterable<SdkMessage> {
      for await (const message of stream) {
        yield message as SdkMessage;
      }
    }
    return typed();
  };
}

/**
 * Load the vendored SDK and return the bound `QueryFn`. Called once, inside the `agent` process in the
 * run-task image (the SDK runs as uid `agent`, never `harness`). The dynamic import fails fast with a clear
 * error if the SDK was not vendored into the image — never a silent fallback that would run the model with
 * no engine.
 */
export async function loadSdkQuery(): Promise<QueryFn> {
  let mod: { query: SdkQueryLike };
  try {
    mod = await import("@anthropic-ai/claude-agent-sdk");
  } catch (cause) {
    throw new Error(
      "run-task: the vendored @anthropic-ai/claude-agent-sdk is not present in this image — " +
        "it must be vendored at build time (see apps/run-task/Dockerfile). Refusing to run without an engine.",
      { cause },
    );
  }
  if (typeof mod.query !== "function") {
    throw new Error("run-task: vendored @anthropic-ai/claude-agent-sdk has no `query` export.");
  }
  return adaptSdkQuery(mod.query);
}
