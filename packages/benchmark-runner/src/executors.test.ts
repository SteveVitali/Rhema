import { describe, it, expect } from "vitest";
import type { ArmConfig } from "./types.js";
import {
  createArmExecutor,
  type ArmModelClient,
  type EngineArmRunner,
  type HumanEditorIntake,
  type ModelCompletion,
} from "./executors.js";

const CONFIGS: ArmConfig[] = [
  { arm: "A1", model: "frontier-x", modelFamily: "anthropic", settings: { search: true, reasoning: "max" } },
  { arm: "A2", model: "generic-y", modelFamily: "openai", prompt: "review this" },
  { arm: "A3", modelFamily: undefined },
  { arm: "A4", model: "rhema-base", modelFamily: "anthropic", engineBuild: "eng-1", protocolVersion: "0.4.0+ab" },
  { arm: "A5", model: "rhema-frontier", modelFamily: "anthropic", engineBuild: "eng-1", protocolVersion: "0.4.0+ab" },
  { arm: "A6", modelFamily: undefined },
];

describe("createArmExecutor — the live per-arm bindings (D-P0.14-1)", () => {
  it("A1 runs best-of-two and selects the longer completion by default", async () => {
    let calls = 0;
    const completions: ModelCompletion[] = [
      { text: "short", model: "frontier-x" },
      { text: "a much longer and more substantive review", model: "frontier-x" },
    ];
    const modelClient: ArmModelClient = {
      complete: () => Promise.resolve(completions[calls++] ?? completions[0]),
    };
    const exec = createArmExecutor(CONFIGS, { modelClient });
    const out = await exec.run({ waveId: "w1", draftId: "d1", arm: "A1" });
    expect(calls).toBe(2); // best-of-two
    expect(out?.text).toBe("a much longer and more substantive review");
    expect(out).toMatchObject({ arm: "A1", draftId: "d1", model: "frontier-x" });
  });

  it("A1 honors an injected selector (e.g. a pairwise judge)", async () => {
    const modelClient: ArmModelClient = {
      complete: () => Promise.resolve({ text: `cand-${Math.random()}` }),
    };
    const exec = createArmExecutor(CONFIGS, {
      modelClient,
      selectBestOf: (cands) => cands[0], // always the first
    });
    const out = await exec.run({ waveId: "w1", draftId: "d1", arm: "A1" });
    expect(out?.text.startsWith("cand-")).toBe(true);
  });

  it("A2 runs a single generic completion", async () => {
    let calls = 0;
    const modelClient: ArmModelClient = {
      complete: (input) => {
        calls++;
        expect(input.prompt).toBe("review this");
        return Promise.resolve({ text: "generic review", model: "generic-y" });
      },
    };
    const exec = createArmExecutor(CONFIGS, { modelClient });
    const out = await exec.run({ waveId: "w1", draftId: "d1", arm: "A2" });
    expect(calls).toBe(1);
    expect(out).toMatchObject({ arm: "A2", text: "generic review", model: "generic-y" });
  });

  it("A4/A5 drive the engine at the pinned build+protocol and stamp the run_id", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const engineRunner: EngineArmRunner = {
      runReview: (input) => {
        seen.push({ ...input });
        return Promise.resolve({ text: `engine review of ${input.draftId}`, runId: `run_${input.draftId}` });
      },
    };
    const exec = createArmExecutor(CONFIGS, { engineRunner });
    const a4 = await exec.run({ waveId: "w1", draftId: "d1", arm: "A4" });
    const a5 = await exec.run({ waveId: "w1", draftId: "d2", arm: "A5" });
    expect(a4).toMatchObject({ arm: "A4", runId: "run_d1", text: "engine review of d1" });
    expect(a5).toMatchObject({ arm: "A5", runId: "run_d2" });
    expect(seen[0]).toMatchObject({ engineBuild: "eng-1", protocolVersion: "0.4.0+ab" });
  });

  it("A3/A6 read pre-entered intake results, and return null when none is entered", async () => {
    const store = new Map<string, { text: string }>([["A6:d1", { text: "human editor letter" }]]);
    const intake: HumanEditorIntake = {
      load: ({ arm, draftId }) => Promise.resolve(store.get(`${arm}:${draftId}`) ?? null),
    };
    const exec = createArmExecutor(CONFIGS, { intake });
    expect(await exec.run({ waveId: "w1", draftId: "d1", arm: "A6" })).toMatchObject({ arm: "A6", text: "human editor letter" });
    expect(await exec.run({ waveId: "w1", draftId: "d2", arm: "A6" })).toBeNull(); // not entered yet
    expect(await exec.run({ waveId: "w1", draftId: "d1", arm: "A3" })).toBeNull();
  });

  it("returns null for an arm not configured in this wave", async () => {
    const exec = createArmExecutor([{ arm: "A2", model: "g" }], { modelClient: { complete: () => Promise.resolve({ text: "x" }) } });
    expect(await exec.run({ waveId: "w1", draftId: "d1", arm: "A1" })).toBeNull();
  });

  it("throws a clear error when a needed binding is missing", async () => {
    const exec = createArmExecutor(CONFIGS, {}); // no bindings
    await expect(exec.run({ waveId: "w1", draftId: "d1", arm: "A1" })).rejects.toThrow(/needs the 'modelClient' binding/);
    await expect(exec.run({ waveId: "w1", draftId: "d1", arm: "A4" })).rejects.toThrow(/needs the 'engineRunner' binding/);
    await expect(exec.run({ waveId: "w1", draftId: "d1", arm: "A6" })).rejects.toThrow(/needs the 'intake' binding/);
  });
});
