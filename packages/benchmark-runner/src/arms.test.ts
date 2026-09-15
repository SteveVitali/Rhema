import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { createBenchmarkTestDb, testDeps, type BenchmarkTestDb } from "./testing/harness.js";
import {
  armConfigHash,
  assertArmConfigValid,
  ArmConfigError,
  freezeArmConfig,
  loadArmConfigs,
  reSteelmanA1,
  isRhemaArm,
} from "./arms.js";
import { createWave } from "@rhema/benchmark";
import type { ArmConfig } from "./types.js";

describe("arms as configs (REQ-EVAL-6 / REQ-EVAL-20)", () => {
  let db: BenchmarkTestDb;
  beforeEach(async () => {
    db = await createBenchmarkTestDb();
  });
  afterEach(async () => {
    await db.close();
  });

  it("config hash is deterministic and independent of key insertion order", () => {
    const a: ArmConfig = { arm: "A1", model: "frontier-x", modelFamily: "openai", settings: { a: 1, b: 2 }, prompt: "p" };
    const b: ArmConfig = { arm: "A1", prompt: "p", settings: { b: 2, a: 1 }, modelFamily: "openai", model: "frontier-x" };
    expect(armConfigHash(a)).toBe(armConfigHash(b));
  });

  it("a changed setting changes the hash (the config is reconstructable — REQ-EVAL-20)", () => {
    const a: ArmConfig = { arm: "A5", model: "m", modelFamily: "anthropic", engineBuild: "e1", protocolVersion: "essay@1" };
    const b: ArmConfig = { ...a, engineBuild: "e2" };
    expect(armConfigHash(a)).not.toBe(armConfigHash(b));
  });

  it("a Rhema arm MUST pin its engine build, protocol@version, and model family (REQ-EVAL-6)", () => {
    expect(isRhemaArm("A4")).toBe(true);
    expect(isRhemaArm("A5")).toBe(true);
    expect(isRhemaArm("A1")).toBe(false);
    expect(() => assertArmConfigValid({ arm: "A5", modelFamily: "anthropic", protocolVersion: "essay@1" })).toThrow(ArmConfigError);
    expect(() => assertArmConfigValid({ arm: "A5", modelFamily: "anthropic", engineBuild: "e1" })).toThrow(/protocol@version/);
    expect(() => assertArmConfigValid({ arm: "A5", engineBuild: "e1", protocolVersion: "essay@1" })).toThrow(/model family/);
    // a fully-pinned Rhema arm is valid; a non-Rhema arm needs none of it
    expect(() => assertArmConfigValid({ arm: "A5", modelFamily: "anthropic", engineBuild: "e1", protocolVersion: "essay@1" })).not.toThrow();
    expect(() => assertArmConfigValid({ arm: "A2" })).not.toThrow();
  });

  it("freezes + loads arm configs; freezing a Rhema arm records engine build + protocol (REQ-EVAL-20)", async () => {
    const waveId = await createWave(db.exec, testDeps(), { name: "w", agreementFloor: 0.6 });
    await freezeArmConfig(db.exec, testDeps(), {
      waveId,
      config: { arm: "A5", model: "claude", modelFamily: "anthropic", engineBuild: "engine@abc", protocolVersion: "essay@1.2" },
    });
    await freezeArmConfig(db.exec, testDeps(), { waveId, config: { arm: "A1", model: "gpt", modelFamily: "openai", prompt: "steelman", published: true } });
    const configs = await loadArmConfigs(db.exec, waveId);
    expect(configs.map((c) => c.arm)).toEqual(["A1", "A5"]);
    const a5 = configs.find((c) => c.arm === "A5")!;
    expect(a5.config.engineBuild).toBe("engine@abc");
    expect(a5.config.protocolVersion).toBe("essay@1.2");
    expect(a5.modelFamily).toBe("anthropic");
    expect(a5.configHash).toHaveLength(64);
  });

  it("re-steelmans A1 with a fresh owner + prompt every wave, published (REQ-EVAL-6/18)", async () => {
    const waveId = await createWave(db.exec, testDeps(), { name: "w2", agreementFloor: 0.6 });
    const h1 = await reSteelmanA1(db.exec, testDeps(), { waveId, owner: "alice", prompt: "v1", model: "gpt", modelFamily: "openai" });
    const h2 = await reSteelmanA1(db.exec, testDeps(), { waveId, owner: "bob", prompt: "v2", model: "gpt", modelFamily: "openai" });
    expect(h1).not.toBe(h2); // a fresh steelman is a new config hash
    const [a1] = await loadArmConfigs(db.exec, waveId);
    expect(a1!.config.steelmanOwner).toBe("bob");
    expect(a1!.config.published).toBe(true);
  });
});
