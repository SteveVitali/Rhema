import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { FIXTURES_ROOT } from "../fixtures/load.js";
import {
  ACADEMIC_PROTOCOL,
  ESSAY_PROTOCOL,
  MEMO_PROTOCOL,
  OP_ED_PROTOCOL,
  PROTOCOL_SEEDS,
  venueRowAsOf,
  venueRowStale,
} from "./protocols.js";
import { evalFixtureById, evalMatrix, GOLDEN_EVAL_FIXTURES } from "./eval-fixtures.js";

const wordsOf = (path: string) =>
  readFileSync(join(FIXTURES_ROOT, path), "utf8").split(/\s+/).filter(Boolean).length;

describe("§13.5 golden eval registry (ticket 49 AC7)", () => {
  it("registers the three benchmark projects plus one golden fixture per non-Essay protocol", () => {
    expect(GOLDEN_EVAL_FIXTURES.filter((f) => f.kind === "project").map((f) => f.id)).toEqual([
      "constitution-of-reason",
      "structure-of-political-difference",
      "the-politics-of-visibility",
    ]);
    // AC7 requires the op-ed + memo golden rows; academic's golden is registered when it lands.
    const protocolFixtures = GOLDEN_EVAL_FIXTURES.filter((f) => f.kind === "protocol");
    expect(protocolFixtures.map((f) => f.protocol)).toContain("op-ed");
    expect(protocolFixtures.map((f) => f.protocol)).toContain("memo");
  });

  it("every fixture's protocol is a seeded Protocol id and its files exist on disk", () => {
    const seededIds = new Set(PROTOCOL_SEEDS.map((p) => p.id));
    for (const f of GOLDEN_EVAL_FIXTURES) {
      expect(seededIds.has(f.protocol), `${f.id} → ${f.protocol}`).toBe(true);
      expect(f.files.length).toBeGreaterThan(0);
      for (const file of f.files) {
        expect(existsSync(join(FIXTURES_ROOT, file)), file).toBe(true);
      }
      if (f.draft) expect(wordsOf(f.draft.path)).toBeGreaterThan(50);
    }
  });

  it("every fixture runs under every protocol — the eval matrix is the full cross product", () => {
    const matrix = evalMatrix();
    expect(matrix).toHaveLength(GOLDEN_EVAL_FIXTURES.length * PROTOCOL_SEEDS.length);
    for (const f of GOLDEN_EVAL_FIXTURES) {
      const protocols = matrix.filter((r) => r.fixture.id === f.id).map((r) => r.protocol.id);
      expect(protocols.sort()).toEqual(["academic", "essay", "memo", "op-ed"]);
      // exactly one golden pairing per fixture: its own protocol.
      expect(matrix.filter((r) => r.fixture.id === f.id && r.golden)).toHaveLength(1);
    }
  });
});

describe("op-ed golden fixture assertions (§6.7)", () => {
  const f = evalFixtureById("golden-op-ed")!;

  it("pins phase defaults, run/pass verdicts, and the venue cap against the seed", () => {
    // every expected phase-default key exists on the seed and reads true (all phases on).
    for (const [k, v] of Object.entries(f.expected.phaseDefaults ?? {})) {
      expect(OP_ED_PROTOCOL.phase_defaults[k as keyof typeof OP_ED_PROTOCOL.phase_defaults], k).toBe(v);
    }
    expect(OP_ED_PROTOCOL.phase_defaults.stage).toBe("near-final");
    expect(f.expected.verdicts).toEqual(OP_ED_PROTOCOL.calibration_language.verdicts);
    // the pinned venue resolves to a real outlet-table row with the pinned cap.
    const row = OP_ED_PROTOCOL.venue_bar.table!.find((r) => r.venue === f.expected.venueCap!.venue);
    expect(row?.maxWords).toBe(f.expected.venueCap!.maxWords);
  });

  it("the pinned venue row is honest about verification — verified_at or a rendered as_of date", () => {
    const row = OP_ED_PROTOCOL.venue_bar.table!.find((r) => r.venue === "WaPo")!;
    // H4 incomplete → the row must be stale AND surface its as_of date (never a fabricated
    // verification). When H4 lands the row verifies and this stays green either way.
    if (venueRowStale(row)) expect(venueRowAsOf(row)).toBe(row.as_of);
    else expect(row.verified_at).toBeTruthy();
  });
});

describe("memo golden fixture assertions (§6.7)", () => {
  const f = evalFixtureById("golden-memo")!;

  it("pins discourse off + web_fetch_of_user_data forbidden + the ship/rewrite/needs-data verdicts", () => {
    expect(MEMO_PROTOCOL.phase_defaults.discourse).toBe(false);
    expect(f.expected.phaseDefaults?.discourse).toBe(false);
    expect(MEMO_PROTOCOL.phase_defaults.web_fetch_of_user_data).toBe("forbidden");
    expect(MEMO_PROTOCOL.integrity_norms.web_fetch_of_user_data).toBe("forbidden");
    expect(MEMO_PROTOCOL.phase_defaults.user_source_verification).toBe(true);
    expect(f.expected.webFetchOfUserData).toBe("forbidden");
    expect(f.expected.verdicts).toEqual(MEMO_PROTOCOL.calibration_language.verdicts);
  });

  it("carries user_sources[] inputs that satisfy the api's normalization shape", () => {
    // mirrors apps/api normalizeUserSources: name + text and/or url; http(s) urls only; ≤8.
    const sources = f.inputs.userSources!;
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.length).toBeLessThanOrEqual(8);
    for (const s of sources) {
      expect(s.name.trim().length).toBeGreaterThan(0);
      expect(s.text != null || s.url != null).toBe(true);
      if (s.url != null) {
        const u = new URL(s.url);
        expect(["http:", "https:"]).toContain(u.protocol);
      }
    }
  });

  it("essay and academic seeds keep the fixtures' generic expectations honest", () => {
    for (const p of [ESSAY_PROTOCOL, ACADEMIC_PROTOCOL]) {
      expect(p.phase_defaults.web_fetch_of_user_data ?? "allowed").toBe("allowed");
    }
  });
});
