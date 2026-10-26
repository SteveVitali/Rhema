import { describe, it, expect } from "vitest";
import { RUBRIC_DIMENSIONS, RUBRIC_DIMENSIONS_ALL, WORKFLOW_KEYS } from "@rhema/contracts";
import {
  ACADEMIC_PROTOCOL,
  ESSAY_PROTOCOL,
  MEMO_PROTOCOL,
  OP_ED_PROTOCOL,
  PROTOCOL_SEEDS,
  PROTOCOL_CARDS,
  protocolSeedRow,
  protocolCard,
  seedProtocols,
  protocolSchema,
  venueRowAsOf,
  venueRowStale,
  venueTableVerifiedAt,
  type Protocol,
  type SeedTarget,
} from "./protocols.js";

// P1.21 — the §6.7 protocol table walked column-by-column against the four seeds (REQ-GENRE-1/3).
// P0.03's Essay-seed assertions stay; the Academic/Op-ed/Memo rows are asserted against the table
// verbatim, and the venue-staleness invariants (as_of shown, never a fabricated verified_at) are
// pinned while H4 is incomplete.

describe("Essay protocol (§6.7; REQ-GENRE-1/4)", () => {
  it("seeds first and is well-formed (8 dims, Essay verdicts, safe user-editable fields)", () => {
    expect(PROTOCOL_SEEDS[0]).toBe(ESSAY_PROTOCOL);
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
});

describe("Academic protocol (§6.7 Academic column)", () => {
  it("matches the table: variants, 8 dims as-is, venue bar, phase defaults, verdicts, norms", () => {
    expect(ACADEMIC_PROTOCOL.variants.map((v) => v.id)).toEqual([
      "journal-article",
      "thesis-chapter",
      "grant-proposal",
    ]);
    expect(ACADEMIC_PROTOCOL.variants[0]!.default).toBe(true);
    // rubric: "the 8 as-is"
    expect(ACADEMIC_PROTOCOL.rubric.dimensions).toEqual([...RUBRIC_DIMENSIONS]);
    // venue bar: "target journal / committee; seeded table (e.g. PLOS ONE abstract ≤300)" —
    // H4-verified row (R6CNT.2): `verified_at`, never `as_of`.
    expect(ACADEMIC_PROTOCOL.venue_bar.kind).toBe("outlet-table");
    expect(ACADEMIC_PROTOCOL.venue_bar.table).toEqual([
      { venue: "PLOS ONE", abstractMaxWords: 300, verified_at: expect.any(String) },
    ]);
    expect(ACADEMIC_PROTOCOL.venue_bar.table![0]!.verified_at).toBe("2026-10-21T00:00:00.000Z");
    // phase defaults: "all on; stage: infer"
    expect(ACADEMIC_PROTOCOL.phase_defaults).toEqual({
      verification: true,
      discourse: true,
      second_read: true,
      grounding: true,
      audit: true,
      stage: "infer",
      line_depth: "full",
    });
    // verdicts: "accept · minor · major · reject · reject premise (reviewer voice)"
    expect(ACADEMIC_PROTOCOL.calibration_language.verdicts).toEqual([
      "accept",
      "minor",
      "major",
      "reject",
      "reject premise",
    ]);
    // length/apparatus: "words from venue; apparatus full; abstract & keywords required"
    expect(ACADEMIC_PROTOCOL.length_norms).toMatchObject({
      unit: "words",
      from_venue: true,
      apparatus: "full",
      required: ["abstract", "keywords"],
    });
    // integrity: "no fabricated references; disclosure statement at export; machine may not supply
    // results, data, first-person method"
    expect(ACADEMIC_PROTOCOL.integrity_norms.machine_may_not_supply).toEqual([
      "results",
      "data",
      "first-person method",
    ]);
    expect(ACADEMIC_PROTOCOL.integrity_norms.disclosure_artifact).toBe("icmje");
    expect(ACADEMIC_PROTOCOL.integrity_norms.notes).toContain("no fabricated references");
    // intake: "outline + bibliography + prior drafts / outline"
    expect(ACADEMIC_PROTOCOL.intake_expectations).toEqual({
      typical_inputs: ["outline", "bibliography", "prior drafts"],
      entry_default: "outline",
    });
    // workflow availability: "all; Abstract default; Submission pack 1.x"
    for (const k of WORKFLOW_KEYS) {
      expect(ACADEMIC_PROTOCOL.workflow_availability[k]).toBeDefined();
    }
    expect(ACADEMIC_PROTOCOL.workflow_availability["abstract"]).toBe("default");
    expect(() => protocolSchema.parse(ACADEMIC_PROTOCOL)).not.toThrow();
  });
});

describe("Op-ed protocol (§6.7 Op-ed column)", () => {
  it("matches the table: +Timeliness dim, outlet table, near-final stage, run/pass verdicts", () => {
    expect(OP_ED_PROTOCOL.variants.map((v) => v.id)).toEqual(["national", "regional-trade"]);
    // rubric: "the 8 + Timeliness; Structure anchored to the OpEd Project form"
    expect(OP_ED_PROTOCOL.rubric.dimensions).toEqual([...RUBRIC_DIMENSIONS, "timeliness"]);
    expect(OP_ED_PROTOCOL.rubric.dimensions).toHaveLength(9);
    // venue bar: the named outlet table — R6CNT.2's H4 stamps: NYT/LAT/Globe verified at the
    // fetch-confirmed live bounds; WaPo/WSJ/USA Today stay stale (the evidence's re-fetch
    // condition is unmet — 403/402 again on 2026-10-23).
    expect(OP_ED_PROTOCOL.venue_bar.kind).toBe("outlet-table");
    expect(OP_ED_PROTOCOL.venue_bar.table).toEqual([
      { venue: "NYT", minWords: 800, maxWords: 1200, verified_at: expect.any(String) },
      { venue: "WaPo", maxWords: 750, as_of: expect.any(String) },
      { venue: "WSJ", minWords: 600, maxWords: 1200, as_of: expect.any(String) },
      { venue: "LAT", minWords: 750, maxWords: 1000, verified_at: expect.any(String) },
      { venue: "USA Today", minWords: 650, maxWords: 900, as_of: expect.any(String) },
      { venue: "Globe", maxWords: 800, verified_at: expect.any(String) },
    ]);
    // phase defaults: "all on; near-final; line depth full"
    expect(OP_ED_PROTOCOL.phase_defaults).toEqual({
      verification: true,
      discourse: true,
      second_read: true,
      grounding: true,
      audit: true,
      stage: "near-final",
      line_depth: "full",
    });
    // verdicts: "run · pass ('why not this week')"
    expect(OP_ED_PROTOCOL.calibration_language.verdicts).toEqual(["run", "pass"]);
    expect(OP_ED_PROTOCOL.calibration_language.reviewer_voice).toMatch(/why not this week/i);
    // length/apparatus: "outlet cap; links only"
    expect(OP_ED_PROTOCOL.length_norms).toMatchObject({
      unit: "words",
      from_venue: true,
      apparatus: "none",
    });
    // integrity: "exclusivity reminder at export; sourced news peg"
    expect(OP_ED_PROTOCOL.integrity_norms.exclusivity_reminder).toBe(true);
    expect(OP_ED_PROTOCOL.integrity_norms.notes).toContain("sourced news peg");
    // intake: "a take + a news peg / chat"
    expect(OP_ED_PROTOCOL.intake_expectations).toEqual({
      typical_inputs: ["a take", "a news peg"],
      entry_default: "chat",
    });
    expect(() => protocolSchema.parse(OP_ED_PROTOCOL)).not.toThrow();
  });
});

describe("Memo protocol (§6.7 Memo column; REQ-WF-8/REQ-GENRE-6)", () => {
  it("matches the table: rubric swap+add, silent-read bar, discourse off, ship/rewrite/needs-data", () => {
    expect(MEMO_PROTOCOL.variants.map((v) => v.id)).toEqual(["six-pager", "report", "whitepaper"]);
    expect(MEMO_PROTOCOL.variants[0]!.default).toBe(true);
    // rubric: "swap Originality → Decision readiness; add Scope discipline"
    expect(MEMO_PROTOCOL.rubric.swaps).toEqual([
      { from: "originality_situatedness", to: "decision_readiness" },
    ]);
    expect(MEMO_PROTOCOL.rubric.dimensions).toHaveLength(9);
    expect(MEMO_PROTOCOL.rubric.dimensions).toContain("decision_readiness");
    expect(MEMO_PROTOCOL.rubric.dimensions).toContain("scope_discipline");
    expect(MEMO_PROTOCOL.rubric.dimensions).not.toContain("originality_situatedness");
    for (const d of MEMO_PROTOCOL.rubric.dimensions) {
      expect([...RUBRIC_DIMENSIONS_ALL]).toContain(d);
    }
    // venue bar: "'six-pager read silently'; optional named audience"
    expect(MEMO_PROTOCOL.venue_bar.kind).toBe("silent-read");
    // phase defaults: "discourse OFF; verification with user-supplied-source verdicts;
    // web fetch of user data forbidden"
    expect(MEMO_PROTOCOL.phase_defaults.discourse).toBe(false);
    expect(MEMO_PROTOCOL.phase_defaults.verification).toBe(true);
    expect(MEMO_PROTOCOL.phase_defaults.user_source_verification).toBe(true);
    expect(MEMO_PROTOCOL.phase_defaults.web_fetch_of_user_data).toBe("forbidden");
    // verdicts: "ship · rewrite · needs data"
    expect(MEMO_PROTOCOL.calibration_language.verdicts).toEqual(["ship", "rewrite", "needs data"]);
    // length/apparatus: "pages (6); apparatus light; executive summary required"
    expect(MEMO_PROTOCOL.length_norms).toMatchObject({
      unit: "pages",
      default: 6,
      apparatus: "light",
      required: ["executive_summary"],
    });
    // integrity: "no web fetch of internal figures; machine may not supply the recommendation or numbers"
    expect(MEMO_PROTOCOL.integrity_norms.web_fetch_of_user_data).toBe("forbidden");
    expect(MEMO_PROTOCOL.integrity_norms.machine_may_not_supply).toEqual([
      "the recommendation",
      "numbers",
    ]);
    expect(MEMO_PROTOCOL.integrity_norms.notes).toContain("no web fetch of internal figures");
    // intake: "data + decision + audience / outline"
    expect(MEMO_PROTOCOL.intake_expectations).toEqual({
      typical_inputs: ["data", "a decision", "an audience"],
      entry_default: "outline",
    });
    // workflow availability: "all; Map the field off by default; Figure default; Abstract → exec summary"
    expect(MEMO_PROTOCOL.workflow_availability["map_the_field"]).toBe("off");
    expect(MEMO_PROTOCOL.workflow_availability["figure"]).toBe("default");
    expect(MEMO_PROTOCOL.workflow_availability["abstract"]).toBe("default");
    expect(() => protocolSchema.parse(MEMO_PROTOCOL)).not.toThrow();
  });
});

describe("venue-row staleness (§16.4; REQ-GENRE-3; H4 gate)", () => {
  it("a row without verified_at is stale and shows its as_of date — never a fabricated verified_at", () => {
    const stale = OP_ED_PROTOCOL.venue_bar.table!.find((r) => r.venue === "WaPo")!;
    expect(venueRowStale(stale)).toBe(true);
    expect(venueRowAsOf(stale)).toBe("2026-09-01");
    expect(stale.verified_at).toBeUndefined();
  });

  it("a verified row is not stale and shows no as_of line", () => {
    const verified = { venue: "V", maxWords: 500, verified_at: "2026-09-15T00:00:00.000Z" };
    expect(venueRowStale(verified)).toBe(false);
    expect(venueRowAsOf(verified)).toBeNull();
  });

  it("the seed column `venue_table_verified_at` is null while any table row is stale", () => {
    // Academic's one-row table is fully H4-verified (R6CNT.2) → its rows' stamp; Op-ed still has
    // stale rows → null; Essay's bar carries its own stamp.
    expect(venueTableVerifiedAt(ACADEMIC_PROTOCOL)).toBe("2026-10-21T00:00:00.000Z");
    expect(venueTableVerifiedAt(OP_ED_PROTOCOL)).toBeNull();
    expect(venueTableVerifiedAt(MEMO_PROTOCOL)).toBeNull(); // no table
    expect(venueTableVerifiedAt(ESSAY_PROTOCOL)).toBeTruthy();
    expect(protocolSeedRow(OP_ED_PROTOCOL).venue_table_verified_at).toBeNull();
    // a fully-verified table reports its rows' date.
    const allVerified: Protocol = {
      ...OP_ED_PROTOCOL,
      venue_bar: {
        ...OP_ED_PROTOCOL.venue_bar,
        table: OP_ED_PROTOCOL.venue_bar.table!.map((r) => ({
          ...r,
          as_of: undefined,
          verified_at: "2026-09-15T00:00:00.000Z",
        })),
      },
    };
    expect(venueTableVerifiedAt(allVerified)).toBe("2026-09-15T00:00:00.000Z");
  });

  it("every seeded venue row declares verified_at or as_of — never neither", () => {
    for (const p of PROTOCOL_SEEDS) {
      for (const row of p.venue_bar.table ?? []) {
        expect(row.verified_at != null || row.as_of != null).toBe(true);
      }
    }
  });
});

describe("seeding all four protocols (P1.21; REQ-GENRE-3)", () => {
  it("PROTOCOL_SEEDS is the four §6.7 rows in table order", () => {
    expect(PROTOCOL_SEEDS.map((p) => p.id)).toEqual(["essay", "academic", "op-ed", "memo"]);
    for (const p of PROTOCOL_SEEDS) {
      expect(() => protocolSchema.parse(p)).not.toThrow();
      expect(p.user_editable).toEqual(["venue", "length", "phase_defaults", "stage"]);
      expect(p.inputSources).toEqual(["protocol_seed", "venue_table", "run_input"]);
    }
  });

  it("seedProtocols upserts all four rows idempotently; stale tables land a null verified stamp", async () => {
    const calls: { sql: string; params: unknown[] }[] = [];
    const target: SeedTarget = {
      query: async (sql, params = []) => {
        calls.push({ sql, params });
        return { rows: [] };
      },
    };
    await seedProtocols(target);
    expect(calls).toHaveLength(4);
    expect(calls.map((c) => c.params[0])).toEqual(["essay", "academic", "op-ed", "memo"]);
    for (const { sql } of calls) {
      expect(sql).toMatch(/insert into protocols/i);
      expect(sql).toMatch(/on conflict \(id, version\) do update/i);
    }
    // params[3] = venue_table_verified_at: essay verified; academic fully verified (R6CNT.2);
    // op-ed partially stale ⇒ null; memo no table ⇒ null.
    expect(calls[0]!.params[3]).toBeTruthy();
    expect(calls[1]!.params[3]).toBe("2026-10-21T00:00:00.000Z");
    expect(calls[2]!.params[3]).toBeNull();
    expect(calls[3]!.params[3]).toBeNull();
    const memoBody = JSON.parse(calls[3]!.params[2] as string) as Protocol;
    expect(memoBody.integrity_norms.web_fetch_of_user_data).toBe("forbidden");
  });
});

describe("REQ-GENRE-7 — a fixture protocol is a registry row, no schema change", () => {
  it("a fifth protocol literal validates + seeds with no schema change", async () => {
    const journalism: Protocol = {
      id: "journalism",
      version: 1,
      name: "Journalism",
      tagline: "review-only",
      variants: [{ id: "report", name: "Report", default: true }],
      rubric: { dimensions: [...RUBRIC_DIMENSIONS], caps: [] },
      venue_bar: { kind: "user-venue", prompt: "type a venue" },
      phase_defaults: {
        verification: true,
        discourse: true,
        second_read: true,
        grounding: true,
        audit: true,
        stage: "infer",
        line_depth: "full",
      },
      calibration_language: { verdicts: ["publish", "revise"], reviewer_voice: "desk" },
      length_norms: { unit: "words", apparatus: "none" },
      integrity_norms: { machine_may_not_supply: [], web_fetch_of_user_data: "allowed" },
      intake_expectations: { typical_inputs: ["notes"], entry_default: "chat" },
      workflow_availability: Object.fromEntries(WORKFLOW_KEYS.map((k) => [k, "available" as const])),
      user_editable: ["venue", "length", "phase_defaults", "stage"],
      inputSources: ["protocol_seed", "venue_table", "run_input"],
    };
    expect(() => protocolSchema.parse(journalism)).not.toThrow();
    const calls: { sql: string; params: unknown[] }[] = [];
    await seedProtocols({ query: async (sql, params = []) => (calls.push({ sql, params }), { rows: [] }) }, [
      journalism,
    ]);
    expect(calls).toHaveLength(1);
    expect(calls[0]!.params[0]).toBe("journalism");
  });
});

describe("protocol cards (§5.3) — aligned with the seeded bodies", () => {
  it("every card's venue table matches its seed body's rows (no card/seed drift)", () => {
    for (const p of PROTOCOL_SEEDS) {
      const card = protocolCard(p.id)!;
      expect(card.venueBar.kind).toBe(p.venue_bar.kind);
      expect(card.venueBar.table).toEqual(p.venue_bar.table ?? []);
      expect(card.venueBar.prompt).toBe(p.venue_bar.prompt);
      expect(card.entryDefault).toBe(p.intake_expectations.entry_default);
    }
    expect(PROTOCOL_CARDS).toHaveLength(4);
  });
});
