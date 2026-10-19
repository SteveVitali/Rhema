import { describe, expect, it } from "vitest";
import { journeyUlid } from "./ulid.js";

const ULID_RE = /^[0-9A-HJKMNP-TV-Z]{26}$/;

describe("journeyUlid (VERIF.1 — seeded-substrate ids must satisfy the api's idSchema)", () => {
  it("mints 26-char Crockford-base32 ULIDs", () => {
    for (let i = 0; i < 64; i++) expect(journeyUlid()).toMatch(ULID_RE);
  });
  it("is unique without coordination", () => {
    const set = new Set(Array.from({ length: 200 }, () => journeyUlid()));
    expect(set.size).toBe(200);
  });
  it("sorts by timestamp (the ULID property the schema trades on)", () => {
    const a = journeyUlid(1_000_000_000_000);
    const b = journeyUlid(1_000_000_000_001);
    expect(a < b).toBe(true);
  });
});
