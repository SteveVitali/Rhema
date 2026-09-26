import { describe, it, expect } from "vitest";
import {
  computeSeedHash,
  sampleSetHash,
  deriveVoiceStatus,
  BETA_VOICE_STATES,
  VOICE_SURFACES,
  type VoiceSnapshotFacts,
  type VoiceCurrentFacts,
  type VoiceState,
} from "./voice-status.js";

// PRB.10 — the voice status pill (§9.3; REQ-PERSONA-13/14). AC2's property test: every beta-reachable state
// × every surface renders identical strings from one fixture snapshot — derivation is surface-blind by
// construction (the function takes no surface), so the matrix asserts (state × surface) → identical
// {label, tone} plus the spec's exact pill strings.

const NOW = new Date("2026-09-16T12:00:00Z");

const SNAPSHOT: VoiceSnapshotFacts = {
  builtAt: "2026-08-20T10:00:00Z",
  seedSha256: "a".repeat(64),
  sampleSet: { item_1: "s1".padEnd(64, "1"), item_2: "s2".padEnd(64, "2") },
  corpusWordsAtBuild: 5000,
  calibrationStatus: "untested",
  tier: "quick",
};

const CURRENT: VoiceCurrentFacts = {
  seedSha256: "a".repeat(64),
  samples: { item_1: "s1".padEnd(64, "1"), item_2: "s2".padEnd(64, "2") },
  corpusWords: 5000,
};

function factsFor(state: VoiceState): {
  snapshot: VoiceSnapshotFacts | null;
  current: VoiceCurrentFacts;
  runInProgress?: { ordinal: number; of: number } | null;
} {
  switch (state) {
    case "never_built":
      return { snapshot: null, current: CURRENT };
    case "building":
      return { snapshot: SNAPSHOT, current: CURRENT, runInProgress: { ordinal: 3, of: 4 } };
    case "seed_changed":
      return { snapshot: SNAPSHOT, current: { ...CURRENT, seedSha256: "b".repeat(64) } };
    case "samples_changed":
      return {
        snapshot: SNAPSHOT,
        current: {
          ...CURRENT,
          samples: { item_1: "s1".padEnd(64, "1"), item_2: "c2".padEnd(64, "c"), item_3: "s3".padEnd(64, "3") },
        },
      };
    case "aged":
      return { snapshot: { ...SNAPSHOT, builtAt: "2026-01-01T00:00:00Z" }, current: CURRENT };
    case "unfalsified":
      return { snapshot: SNAPSHOT, current: CURRENT };
    case "badly_off":
      return { snapshot: { ...SNAPSHOT, calibrationStatus: "tested-badly-off" }, current: CURRENT };
    case "fresh":
      return { snapshot: { ...SNAPSHOT, calibrationStatus: "tested" }, current: CURRENT };
  }
}

describe("computeSeedHash (ledger J9)", () => {
  it("covers description + byline + registers, NFC-normalized and trimmed", () => {
    const a = computeSeedHash({ description: "  Hello world  ", byline: "S. J.", registers: ["essay"] });
    // whitespace at the edges is not a change
    expect(a).toBe(computeSeedHash({ description: "Hello world", byline: "S. J.", registers: ["essay"] }));
    // every covered field moves the hash
    expect(a).not.toBe(computeSeedHash({ description: "Hello world!", byline: "S. J.", registers: ["essay"] }));
    expect(a).not.toBe(computeSeedHash({ description: "Hello world", byline: "Other", registers: ["essay"] }));
    expect(a).not.toBe(computeSeedHash({ description: "Hello world", byline: "S. J.", registers: ["essay", "memo"] }));
    // NFC: composed and decomposed forms hash identically
    const composed = computeSeedHash({ description: "café" });
    const decomposed = computeSeedHash({ description: "café" });
    expect(composed).toBe(decomposed);
    expect(a).toMatch(/^[a-f0-9]{64}$/);
  });

  it("excludes mode and field-adjacent text (empty fields hash stably)", () => {
    // Mode is metadata only (Q-11) and not an input here at all — by construction it cannot move the hash.
    expect(computeSeedHash({})).toMatch(/^[a-f0-9]{64}$/);
    expect(computeSeedHash({})).toBe(computeSeedHash({ description: null, byline: null, registers: null }));
    // field separators make boundaries unambiguous
    expect(computeSeedHash({ description: "ab", byline: "c" })).not.toBe(
      computeSeedHash({ description: "a", byline: "bc" }),
    );
  });
});

describe("sampleSetHash", () => {
  it("is order-independent and diff-sensitive", () => {
    const a = sampleSetHash({ x: "1", y: "2" });
    expect(a).toBe(sampleSetHash({ y: "2", x: "1" }));
    expect(a).not.toBe(sampleSetHash({ x: "1", y: "3" }));
    expect(a).not.toBe(sampleSetHash({ x: "1", y: "2", z: "3" }));
  });
});

describe("deriveVoiceStatus (§9.3 precedence)", () => {
  it("never_built — no snapshot", () => {
    const s = deriveVoiceStatus({ snapshot: null, current: CURRENT, now: NOW });
    expect(s.state).toBe("never_built");
    expect(s.pill).toEqual({ label: "No voice profile", tone: "neutral" });
    expect(s.action).toBe("build");
  });

  it("building wins over staleness (a run in flight reports progress, not drift)", () => {
    const s = deriveVoiceStatus({
      snapshot: SNAPSHOT,
      current: { ...CURRENT, seedSha256: "b".repeat(64) },
      runInProgress: { ordinal: 3, of: 4 },
      now: NOW,
    });
    expect(s.state).toBe("building");
    expect(s.pill).toEqual({ label: "Building · phase 3 of 4", tone: "running" });
    expect(s.action).toBe("open_run");
  });

  it("seed_changed beats samples_changed (first match wins)", () => {
    const s = deriveVoiceStatus({
      snapshot: SNAPSHOT,
      current: {
        ...CURRENT,
        seedSha256: "b".repeat(64),
        samples: { item_1: "s1".padEnd(64, "1") },
      },
      now: NOW,
    });
    expect(s.state).toBe("seed_changed");
    expect(s.pill).toEqual({ label: "Description changed", tone: "attention" });
    expect(s.action).toBe("update_voice");
    // …but the detail still records the samples delta (the diff panel reads it).
    expect(s.detail.samples).toEqual({ added: 0, removed: 1, changed: 0 });
  });

  it("samples_changed counts added + removed + hash-changed", () => {
    const s = deriveVoiceStatus({
      snapshot: SNAPSHOT,
      current: {
        ...CURRENT,
        samples: { item_1: "s1".padEnd(64, "1"), item_2: "c2".padEnd(64, "c"), item_3: "s3".padEnd(64, "3") },
      },
      now: NOW,
    });
    expect(s.state).toBe("samples_changed");
    expect(s.pill).toEqual({ label: "2 samples changed", tone: "attention" });
    expect(s.detail.samples).toEqual({ added: 1, removed: 0, changed: 1 });
  });

  it("aged — >180 days or >25% corpus growth", () => {
    const old = deriveVoiceStatus({
      snapshot: { ...SNAPSHOT, builtAt: "2026-01-01T00:00:00Z", calibrationStatus: "tested" },
      current: CURRENT,
      now: NOW,
    });
    expect(old.state).toBe("aged");
    expect(old.pill.label).toBe("Profile from Jan 1");
    const grew = deriveVoiceStatus({
      snapshot: { ...SNAPSHOT, calibrationStatus: "tested" },
      current: { ...CURRENT, corpusWords: 7000 },
      now: NOW,
    });
    expect(grew.state).toBe("aged");
    expect(grew.pill.label).toContain("grew a lot");
  });

  it("unfalsified — built but untested (the Quick Voice resting state; neutral, never stale)", () => {
    const s = deriveVoiceStatus({ snapshot: SNAPSHOT, current: CURRENT, now: NOW });
    expect(s.state).toBe("unfalsified");
    expect(s.pill).toEqual({ label: "Untested voice", tone: "neutral" });
    expect(s.action).toBe("test");
  });

  it("badly_off and fresh", () => {
    const bad = deriveVoiceStatus({
      snapshot: { ...SNAPSHOT, calibrationStatus: "tested-badly-off" },
      current: CURRENT,
      now: NOW,
    });
    expect(bad.state).toBe("badly_off");
    expect(bad.pill).toEqual({ label: "Tested — badly off", tone: "attention" });
    expect(bad.action).toBe("rebuild");
    const fresh = deriveVoiceStatus({
      snapshot: { ...SNAPSHOT, calibrationStatus: "tested" },
      current: CURRENT,
      now: NOW,
    });
    expect(fresh.state).toBe("fresh");
    expect(fresh.pill).toEqual({ label: "Voice profile current", tone: "ready" });
    expect(fresh.action).toBe("none");
  });
});

describe("AC2 / REQ-PERSONA-14 — the pill is identical on every surface", () => {
  const EXPECTED: Record<string, { label: string; tone: string; action: string }> = {
    never_built: { label: "No voice profile", tone: "neutral", action: "build" },
    building: { label: "Building · phase 3 of 4", tone: "running", action: "open_run" },
    seed_changed: { label: "Description changed", tone: "attention", action: "update_voice" },
    samples_changed: { label: "2 samples changed", tone: "attention", action: "update_voice" },
    unfalsified: { label: "Untested voice", tone: "neutral", action: "test" },
  };

  it("every beta-reachable state × surface pair renders identical strings and tones from one snapshot", () => {
    // The function is surface-blind by construction (no surface parameter exists to vary on). The matrix
    // re-derives per surface as each call site does — and asserts byte-identical output, which is the
    // property REQ-PERSONA-14 requires: one function, one fixture, one string.
    for (const state of BETA_VOICE_STATES) {
      const facts = factsFor(state);
      const rendered = VOICE_SURFACES.map(
        (surface) => [surface, deriveVoiceStatus({ ...facts, now: NOW })] as const,
      );
      const [first] = rendered;
      for (const [, status] of rendered) {
        expect(status.pill).toEqual(first[1].pill);
        expect(status.action).toBe(first[1].action);
      }
      // and the spec's exact pill string for this state.
      const exp = EXPECTED[state]!;
      expect(first[1].pill).toEqual({ label: exp.label, tone: exp.tone });
      expect(first[1].action).toBe(exp.action);
    }
  });
});
