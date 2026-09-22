import { describe, it, expect } from "vitest";
import { sequentialIds, sequentialUlids, ulid, randomUlids } from "./ids.js";

describe("id factories", () => {
  it("sequentialIds is deterministic and prefixed", () => {
    const ids = sequentialIds();
    expect(ids("run")).toBe("run_000001");
    expect(ids("run")).toBe("run_000002");
  });

  it("sequentialUlids is a valid 26-char id", () => {
    const ids = sequentialUlids();
    expect(ids()).toHaveLength(26);
  });

  it("ulid is 26 Crockford-base32 chars and time-ordered in the prefix", () => {
    const a = ulid(0);
    const b = ulid(1);
    expect(a).toHaveLength(26);
    expect(a).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
    // the 10-char time prefix increases with the timestamp
    expect(b.slice(0, 10) >= a.slice(0, 10)).toBe(true);
  });

  it("randomUlids mints distinct valid ids", () => {
    const mint = randomUlids();
    const set = new Set(Array.from({ length: 1000 }, () => mint()));
    expect(set.size).toBe(1000);
    for (const id of set) expect(id).toMatch(/^[0-9A-HJKMNP-TV-Z]{26}$/);
  });
});
