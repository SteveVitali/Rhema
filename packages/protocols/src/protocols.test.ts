import { describe, it, expect } from "vitest";
import { RUBRIC_DIMENSIONS } from "@rhema/contracts";
import {
  ESSAY_PROTOCOL,
  PROTOCOL_SEEDS,
  protocolSeedRow,
  seedProtocols,
  protocolSchema,
  type Protocol,
  type SeedTarget,
} from "./protocols.js";

// P0.03 AC7 — the Essay protocol row seeds with a verified_at-bearing venue-bar config per §6.7.

describe("Essay protocol (§6.7; REQ-GENRE-1/4)", () => {
  it("is the only Phase-0 seed and is well-formed (8 dims, Essay verdicts, safe user-editable fields)", () => {
    expect(PROTOCOL_SEEDS).toEqual([ESSAY_PROTOCOL]);
    expect(ESSAY_PROTOCOL.rubric.dimensions).toHaveLength(8);
    expect(ESSAY_PROTOCOL.rubric.dimensions).toEqual([...RUBRIC_DIMENSIONS]);
    expect(ESSAY_PROTOCOL.calibration_language.verdicts).toEqual(["publish", "revise", "rethink"]);
    expect(ESSAY_PROTOCOL.user_editable).toEqual(["venue", "length", "phase_defaults", "stage"]);
    expect(ESSAY_PROTOCOL.phase_defaults.stage).toBe("infer");
    expect(ESSAY_PROTOCOL.integrity_norms.web_fetch_of_user_data).toBe("allowed");
    expect(() => protocolSchema.parse(ESSAY_PROTOCOL)).not.toThrow();
  });

  it("AC7 — the seeded DB row carries a verified_at-bearing venue bar (REQ-GENRE-3)", () => {
    const row = protocolSeedRow(ESSAY_PROTOCOL);
    expect(row.id).toBe("essay");
    expect(row.version).toBe(1);
    expect(row.venue_table_verified_at).toBeTruthy();
    expect(new Date(row.venue_table_verified_at!).toString()).not.toBe("Invalid Date");
    expect(row.body).toBe(ESSAY_PROTOCOL);
  });

  it("AC7 — seedProtocols inserts into `protocols` idempotently with the verified_at column set", async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const target: SeedTarget = {
      query: async (sql, params = []) => {
        calls.push({ sql, params });
        return { rows: [] };
      },
    };
    await seedProtocols(target);
    expect(calls).toHaveLength(1);
    const { sql, params } = calls[0]!;
    expect(sql).toMatch(/insert into protocols/i);
    expect(sql).toMatch(/on conflict \(id, version\) do update/i); // fills the P0.02 placeholder, idempotent
    // params: [id, version, bodyJson, venue_table_verified_at]
    expect(params[0]).toBe("essay");
    expect(params[3]).toBeTruthy(); // verified_at set
    const body = JSON.parse(params[2] as string) as Protocol;
    expect(body.rubric.dimensions).toHaveLength(8);
    expect(body.id).toBe("essay");
  });
});
