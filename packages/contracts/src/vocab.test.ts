import { describe, expect, it } from "vitest";
import { CANONICAL_VOCAB, MODEL_TIERS, PLAN_TIERS, RIGORS, AGENT_TYPE_KEYS } from "./vocab.js";
import { RESERVED_CLASSES, STRICTLY_BANNED, BANNED_STRINGS } from "./reserved-strings.js";

// REQ-SPEC-2 / REQ-PROD-6: the canonical vocabularies are disjoint, verbatim machine tokens; no synonym
// survives. AC7 (deterministic). The Appendix D.2 reserved/banned data is the lint bedrock.

describe("canonical vocabularies — REQ-SPEC-2 / REQ-PROD-6", () => {
  it("uses the correct canonical enum values (no P0.01 placeholders survive)", () => {
    expect(PLAN_TIERS).toEqual(["free", "writer", "studio", "studio_max", "team"]);
    expect(MODEL_TIERS).toEqual(["base", "balanced", "frontier"]);
    expect(RIGORS).toEqual(["quick", "standard", "full_board"]);
    expect(AGENT_TYPE_KEYS).toEqual(["author", "editor", "assistant", "persona_builder", "system"]);
    // superseded placeholders must be gone (REQ-IDE-50 renames):
    expect(PLAN_TIERS).not.toContain("starter");
    expect(PLAN_TIERS).not.toContain("pro");
    expect(RIGORS as readonly string[]).not.toContain("Deep");
    expect(AGENT_TYPE_KEYS as readonly string[]).not.toContain("researcher");
    expect(AGENT_TYPE_KEYS as readonly string[]).not.toContain("harness");
  });

  it("every enum value is a lower_snake machine token, never a reserved display string", () => {
    for (const values of Object.values(CANONICAL_VOCAB)) {
      for (const v of values) {
        expect(v).toMatch(/^[a-z][a-z0-9_]*$/);
      }
    }
  });

  it("the vocabulary classes are pairwise disjoint (no synonym survives across classes)", () => {
    const classes = Object.entries(CANONICAL_VOCAB);
    for (let i = 0; i < classes.length; i++) {
      for (let j = i + 1; j < classes.length; j++) {
        const a = new Set(classes[i]![1]);
        for (const v of classes[j]![1]) {
          expect(a.has(v), `${classes[i]![0]} and ${classes[j]![0]} share "${v}"`).toBe(false);
        }
      }
    }
  });
});

describe("Appendix D.2 reserved/banned strings — lint bedrock (REQ-PROD-6, REQ-BILL-18)", () => {
  it("carries the seven reserved classes verbatim", () => {
    const ids = RESERVED_CLASSES.map((c) => c.id);
    expect(ids).toEqual([
      "plan_names",
      "model_tiers",
      "rigor_notches",
      "seats",
      "approvals",
      "autonomy",
      "views",
    ]);
    const plans = RESERVED_CLASSES.find((c) => c.id === "plan_names")!;
    expect(plans.strings).toEqual(["Free", "Writer", "Studio", "Studio Max", "Team"]);
  });

  it("bans the load-bearing strings (Pro, gate, tokens, Claude Code, backlog, unlimited)", () => {
    const all = BANNED_STRINGS.map((b) => b.text);
    for (const banned of ["Pro", "gate", "tokens", "Claude Code", "backlog", "unlimited", "ACU"]) {
      expect(all).toContain(banned);
    }
  });

  it("STRICTLY_BANNED excludes context-exception strings (Advanced, tokens) but keeps hard bans", () => {
    expect(STRICTLY_BANNED).toContain("Claude Code");
    expect(STRICTLY_BANNED).toContain("gate");
    expect(STRICTLY_BANNED).not.toContain("Advanced");
    expect(STRICTLY_BANNED).not.toContain("tokens");
  });
});
