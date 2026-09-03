import { describe, expect, it } from "vitest";
import { ARTIFACT_KINDS } from "./enums.js";
import {
  ARTIFACT_KINDS_FROM_8_2,
  artifactPolicy,
  artifactPolicySchema,
  levelCounts,
  policyFor,
} from "./artifact-policy.js";

// REQ-SPEC-14 / REQ-VIS-1 contract test: the policy-table keys, the ArtifactKind enum, and the §8.2 row set
// are the SAME 63-value set. This is AC1 (deterministic).

describe("artifactPolicy — REQ-SPEC-14 contract test", () => {
  const enumSet = new Set<string>(ARTIFACT_KINDS);
  const policyKeys = new Set<string>(Object.keys(artifactPolicy));
  const rowSet = new Set<string>(ARTIFACT_KINDS_FROM_8_2);

  it("has exactly 63 artifact kinds", () => {
    expect(ARTIFACT_KINDS.length).toBe(63);
    expect(enumSet.size).toBe(63);
  });

  it("keys(artifactPolicy) ≡ ArtifactKind", () => {
    expect(policyKeys).toEqual(enumSet);
  });

  it("ArtifactKind ≡ the §8.2 row set", () => {
    expect(rowSet).toEqual(enumSet);
  });

  it("has no duplicate kinds", () => {
    expect(ARTIFACT_KINDS.length).toBe(enumSet.size);
  });

  it("every policy row is a valid ArtifactPolicy", () => {
    for (const kind of ARTIFACT_KINDS) {
      expect(() => artifactPolicySchema.parse(artifactPolicy[kind])).not.toThrow();
    }
  });

  it("preference_profile is the 63rd kind, SR with reasons ux+integrity_boundary (R9)", () => {
    expect(enumSet.has("preference_profile")).toBe(true);
    expect(artifactPolicy.preference_profile).toEqual({
      level: "SR",
      reasons: ["ux", "integrity_boundary"],
      editMode: "none",
    });
  });

  it("obligations add NO artifact kind (no obligation kind exists)", () => {
    expect(enumSet.has("obligation" as never)).toBe(false);
    expect(enumSet.has("revision_obligation" as never)).toBe(false);
  });

  it("level counts are computed from the table and sum to 63", () => {
    const counts = levelCounts();
    expect(counts.SE + counts.SR + counts.I + counts.H).toBe(63);
    // sanity: every level is represented
    expect(counts.SE).toBeGreaterThan(0);
    expect(counts.H).toBeGreaterThan(0);
  });

  it("policyFor rejects an unknown kind", () => {
    expect(() => policyFor("not_a_kind" as never)).toThrow();
  });
});
