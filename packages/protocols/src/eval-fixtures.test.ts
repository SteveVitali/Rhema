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
import {
  evalFixtureById,
  evalMatrix,
  GOLDEN_EVAL_FIXTURES,
  GOLDEN_LIVE_FLOORS,
  minimalCohort,
} from "./eval-fixtures.js";

const wordsOf = (path: string) =>
  readFileSync(join(FIXTURES_ROOT, path), "utf8").split(/\s+/).filter(Boolean).length;

describe("§13.5 golden eval registry (ticket 49 AC7)", () => {
  it("registers the three benchmark projects plus one golden fixture per non-Essay protocol", () => {
    expect(GOLDEN_EVAL_FIXTURES.filter((f) => f.kind === "project").map((f) => f.id)).toEqual([
      "constitution-of-reason",
      "structure-of-political-difference",
      "the-politics-of-visibility",
    ]);
    // R6GLD.1 (REQ-DISC-3) — every seeded protocol carries a golden row: essay + academic landed
    // here; op-ed + memo were P1.21's.
    const protocolFixtures = GOLDEN_EVAL_FIXTURES.filter((f) => f.kind === "protocol");
    expect(protocolFixtures.map((f) => f.protocol).sort()).toEqual(PROTOCOL_SEEDS.map((p) => p.id).sort());
  });

  it("the R6GLD.1 minimal cohort is exactly one fixture per protocol × review/base (GD-GOLDEN-CAP.R6)", () => {
    const cohort = minimalCohort();
    expect(cohort).toHaveLength(PROTOCOL_SEEDS.length);
    expect(cohort.map((l) => l.fixture.protocol)).toEqual(PROTOCOL_SEEDS.map((p) => p.id));
    for (const leg of cohort) {
      expect(leg.workflow).toBe("review");
      expect(leg.modelTier).toBe("base");
      expect(leg.rigor).toBe("standard");
      expect(leg.fixture.draft?.path).toBeTruthy();
      expect(leg.fixture.floors).toBe(GOLDEN_LIVE_FLOORS);
    }
  });

  it("minimalCohort fails loudly when a protocol has no golden — never trims silently", () => {
    const dropped = GOLDEN_EVAL_FIXTURES.filter((f) => f.protocol !== "memo");
    expect(() => minimalCohort(dropped)).toThrow(/no protocol golden fixture for protocol "memo"/);
    const noFloors = GOLDEN_EVAL_FIXTURES.map((f) =>
      f.id === "golden-essay" ? { ...f, floors: undefined } : f,
    );
    expect(() => minimalCohort(noFloors)).toThrow(/has no committed floors/);
  });

  it("every minimal-cohort fixture's expected verdicts match its protocol seed", () => {
    const seeds = new Map(PROTOCOL_SEEDS.map((p) => [p.id, p]));
    for (const leg of minimalCohort()) {
      expect(leg.fixture.expected.verdicts, leg.fixture.id).toEqual(
        seeds.get(leg.fixture.protocol)!.calibration_language.verdicts,
      );
      // every declared phase-default opt-out matches the seed verbatim (memo: discourse off).
      for (const [k, v] of Object.entries(leg.fixture.expected.phaseDefaults ?? {})) {
        const seed = seeds.get(leg.fixture.protocol)!;
        expect(seed.phase_defaults[k as keyof typeof seed.phase_defaults], `${leg.fixture.id}.${k}`).toBe(v);
      }
    }
  });

  it("the committed floors only declare checks a live run can measure", () => {
    // corpus-gated floors (recall/word-delta/voice/round-trip) need the benchmark corpus — a live
    // protocol golden never declares them, because an unmeasured score fails the gate.
    for (const leg of minimalCohort()) {
      const f = leg.fixture.floors!;
      expect(f.schemaValid).toBe(true);
      expect(f.citedFetched).toBe(true);
      expect(f.attestationViolationsMax).toBe(0);
      expect(Object.keys(f.findingCountsBySeverity ?? {}).sort()).toEqual([
        "blocking", "major", "minor", "note",
      ]);
      // GD-GOLDEN-BAND.R6 (2026-10-23, operator "I accept the band" on F-R6GLD.1-2): the
      // a-priori major band max 10 was re-calibrated to 12 — headroom +1 over the rerun1
      // academic leg's measured 11 non-degenerate majors. Pinned so the band can't drift
      // back silently.
      expect(f.findingCountsBySeverity?.major?.max).toBe(12);
      expect(f).not.toHaveProperty("materialRecallFloor");
      expect(f).not.toHaveProperty("wordBudgetDeltaMax");
      expect(f).not.toHaveProperty("voiceFeatureBands");
      expect(f).not.toHaveProperty("markdownRoundTrip");
    }
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
