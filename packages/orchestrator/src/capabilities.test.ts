import { describe, expect, it } from "vitest";
import {
  validateModelProfile,
  ModelProfileRejectedError,
  type ModelProfile,
} from "./capabilities.js";

// REQ-ARCH-9 (AC6): a model-profile override whose provider lacks the phase class's capabilities is rejected.

describe("model-profile validation against the §12.3 capability table (REQ-ARCH-9)", () => {
  it("accepts the default profile (no overrides = Anthropic, which satisfies every class)", () => {
    const profile: ModelProfile = { tier: "balanced" };
    expect(validateModelProfile(profile, ["research", "judge", "generate", "package"])).toEqual({
      ok: true,
    });
  });

  it("rejects a research override to a provider without the server tools (AC6)", () => {
    const profile: ModelProfile = {
      tier: "balanced",
      overrides: [{ phaseClass: "research", provider: "openai" }],
    };
    const res = validateModelProfile(profile, ["research", "judge"]);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.rejections).toHaveLength(1);
      expect(res.rejections[0].phaseClass).toBe("research");
      expect(res.rejections[0].provider).toBe("openai");
      // openai lacks the in-harness server tools + fan-out.
      expect(res.rejections[0].missing).toEqual(
        expect.arrayContaining(["web_search", "web_fetch", "subagent_fanout"]),
      );
    }
  });

  it("accepts a judge/generate override to a non-Anthropic provider (it has long context + read/write)", () => {
    const profile: ModelProfile = {
      tier: "frontier",
      overrides: [
        { phaseClass: "judge", provider: "google" },
        { phaseClass: "generate", provider: "openai" },
      ],
    };
    expect(validateModelProfile(profile, ["judge", "generate"]).ok).toBe(true);
  });

  it("ignores an override for a phase class the run never executes", () => {
    const profile: ModelProfile = {
      tier: "base",
      overrides: [{ phaseClass: "research", provider: "google" }],
    };
    // a fact-check-only run that skips research never trips the research override.
    expect(validateModelProfile(profile, ["judge"]).ok).toBe(true);
  });

  it("reports every rejection, not just the first", () => {
    const profile: ModelProfile = {
      tier: "base",
      overrides: [
        { phaseClass: "research", provider: "openai" },
        { phaseClass: "research", provider: "google" },
      ],
    };
    const res = validateModelProfile(profile, ["research"]);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.rejections).toHaveLength(2);
  });

  it("ModelProfileRejectedError carries a readable message", () => {
    const err = new ModelProfileRejectedError([
      { phaseClass: "research", provider: "openai", missing: ["web_search"] },
    ]);
    expect(err.message).toContain("research→openai lacks web_search");
  });
});
