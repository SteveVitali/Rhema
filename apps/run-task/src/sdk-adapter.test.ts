import { describe, it, expect } from "vitest";
import type { AgentSdkQueryOptions, SdkMessage } from "@rhema/engine";
import { adaptSdkQuery, toSdkOptions, type SdkQueryLike } from "./sdk-adapter.js";

// A minimal AgentSdkQueryOptions — only what the adapter passes through (it does not inspect the fields).
const OPTIONS = { cwd: "/work/project", maxTurns: 10 } as unknown as AgentSdkQueryOptions;

describe("adaptSdkQuery (D-P0.06-4 — the QueryFn↔SDK bridge)", () => {
  it("passes prompt + mapped options to the SDK query and streams its messages back as SdkMessage", async () => {
    const seen: Array<{ prompt: string; options: unknown }> = [];
    const messages: SdkMessage[] = [
      { type: "system", subtype: "init" },
      { type: "assistant", message: { content: [{ type: "text", text: "hi" }] } },
      { type: "result", subtype: "success", total_cost_usd: 0.01 },
    ];
    const fakeSdkQuery: SdkQueryLike = (args) => {
      seen.push(args);
      return (async function* () {
        for (const m of messages) yield m;
      })();
    };

    const queryFn = adaptSdkQuery(fakeSdkQuery);
    const out: SdkMessage[] = [];
    for await (const m of queryFn({ prompt: "/editorial-review", options: OPTIONS })) out.push(m);

    // The adapter forwards prompt + options (identity mapping today) exactly once.
    expect(seen).toHaveLength(1);
    expect(seen[0].prompt).toBe("/editorial-review");
    expect(seen[0].options).toBe(toSdkOptions(OPTIONS));
    // Every SDK message is yielded, in order, unchanged.
    expect(out).toEqual(messages);
    // The terminal result (completion-oracle leg a) survives the bridge.
    expect(out.at(-1)).toMatchObject({ type: "result", subtype: "success" });
  });

  it("toSdkOptions is the identity mapping (the single adjustment point)", () => {
    expect(toSdkOptions(OPTIONS)).toBe(OPTIONS);
  });

  it("propagates an SDK stream error rather than swallowing it", async () => {
    const boom: SdkQueryLike = () =>
      (async function* () {
        yield { type: "system", subtype: "init" } as SdkMessage;
        throw new Error("sdk exploded");
      })();
    const queryFn = adaptSdkQuery(boom);
    await expect(async () => {
      for await (const _ of queryFn({ prompt: "/x", options: OPTIONS })) void _;
    }).rejects.toThrow("sdk exploded");
  });
});
