import { describe, it, expect } from "vitest";
import type { PhaseManifest } from "@rhema/protocols";
import { FakeEngine } from "./fake-engine.js";
import { FIXTURES_BY_NAME } from "./mapper/fixtures/index.js";
import type { EngineEvent, PhaseRequest } from "./engine.js";
import type { SdkMessage } from "./sdk-types.js";

function req(seat = "editor"): PhaseRequest {
  const phase = { key: "verification", skillPhase: "1", seat } as unknown as PhaseManifest;
  return { runId: "r", attempt: 1, cwd: "/work/project", phase, ordinal: 3, of: 7, skill: "editorial-review", inputs: {}, seat, maxBudgetUsd: 5, maxTurns: 40 };
}

describe("FakeEngine (ledger G21)", () => {
  it("replays a fixture and accumulates usage from the result", async () => {
    const fake = new FakeEngine(FIXTURES_BY_NAME["verification-research"]);
    const events: EngineEvent[] = [];
    for await (const ev of fake.startPhase(req())) events.push(ev);
    const result = events.find((e) => e.kind === "result");
    expect(result?.kind === "result" && result.subtype).toBe("success");
    // the terminal result usage is the authoritative CUMULATIVE total (9000), not the per-turn sum (9500) —
    // overwriting on result is what keeps the §12.7 proxy-vs-SDK cross-check from tripping.
    expect(fake.usage().inputTokens).toBe(9000);
  });

  it("honors abort mid-stream → an aborted result (cancellation path)", async () => {
    // a long stream of usage-bearing assistant turns; abort after the first event.
    const messages: SdkMessage[] = [];
    for (let i = 0; i < 20; i++) {
      messages.push({ type: "assistant", message: { content: [{ type: "text", text: "…" }], usage: { input_tokens: 10, output_tokens: 1 } } });
    }
    messages.push({ type: "result", subtype: "success", usage: { input_tokens: 1, output_tokens: 1 } });
    const fake = new FakeEngine(messages, "editor");
    const events: EngineEvent[] = [];
    let n = 0;
    for await (const ev of fake.startPhase(req())) {
      events.push(ev);
      if (++n === 1) fake.abort("cancel");
    }
    const result = events.find((e) => e.kind === "result");
    expect(result?.kind === "result" && result.subtype).toBe("aborted");
    // it stopped well before draining all 20 turns:
    expect(events.filter((e) => e.kind === "usage").length).toBeLessThan(20);
  });
});
