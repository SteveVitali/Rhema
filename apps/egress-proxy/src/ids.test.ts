import { describe, expect, it } from "vitest";
import { idSchema } from "@rhema/contracts";
import { ulid } from "./ids.js";

describe("ulid", () => {
  it("generates a 26-char Crockford-base32 id the contracts idSchema accepts", () => {
    for (let i = 0; i < 200; i++) {
      const id = ulid();
      expect(id).toHaveLength(26);
      expect(() => idSchema.parse(id)).not.toThrow();
    }
  });

  it("is time-sortable (later timestamp ⇒ lexicographically ≥)", () => {
    const a = ulid(1_000_000_000_000);
    const b = ulid(1_000_000_001_000);
    expect(b.slice(0, 10) >= a.slice(0, 10)).toBe(true);
  });
});
