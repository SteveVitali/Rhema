import { describe, it, expect } from "vitest";
import { routeVoiceUpdate, routeVoiceUpgrade, voiceFactsPanel } from "./voice-update.js";
import {
  pickHoldout,
  auditHoldoutLeak,
  holdoutMirrorPath,
  CALIBRATOR_AGENT_LABEL,
  MIN_HOLDOUT_WORDS,
  type Querier,
} from "./holdout.js";
import {
  PROFILE_SECTION_ORDER,
  approveSampleCard,
  checkVoiceBuildGate,
  holdoutRevealed,
  HOLDOUT_LINE,
  CALIBRATION_OFF_WARNING,
} from "./profile-surface.js";
import type { VoiceSnapshotFacts, VoiceStatus } from "./voice-status.js";
import { deriveVoiceStatus } from "./voice-status.js";

// P1.14 — the Update-voice scope router (REQ-SPEC-27), the diff-of-inputs panel (§9.3), the hold-out
// spec + leak audit (§9.5), and the §9.4 profile surfaces (section order, approve-sample card, build
// gates, reveal predicate).

const SNAPSHOT: VoiceSnapshotFacts = {
  builtAt: "2026-08-20T10:00:00Z",
  seedSha256: "a".repeat(64),
  sampleSet: { item_1: "s1".padEnd(64, "1"), item_2: "s2".padEnd(64, "2") },
  corpusWordsAtBuild: 5000,
  calibrationStatus: "tested",
  tier: "full",
};

const statusFor = (over: Partial<Parameters<typeof deriveVoiceStatus>[0]> = {}): VoiceStatus =>
  deriveVoiceStatus({
    snapshot: SNAPSHOT,
    current: { seedSha256: "a".repeat(64), samples: SNAPSHOT.sampleSet, corpusWords: 5000 },
    now: new Date("2026-09-16T12:00:00Z"),
    ...over,
  });

describe("routeVoiceUpdate (REQ-SPEC-27 cheapest sufficient scope)", () => {
  it("never built → build", () => {
    const r = routeVoiceUpdate({ status: statusFor({ snapshot: null }), snapshot: null });
    expect(r.scope).toBe("build");
    expect(r.workflow).toBe("profile_voice");
  });

  it("seed-only change → synth", () => {
    const r = routeVoiceUpdate({
      status: statusFor({ current: { seedSha256: "b".repeat(64), samples: SNAPSHOT.sampleSet, corpusWords: 5000 } }),
      snapshot: SNAPSHOT,
    });
    expect(r.scope).toBe("synth");
    expect(r.workflow).toBe("refresh_voice");
    expect(r.inputs.scope).toBe("synth");
    expect(r.sentence).toContain("corpus is not re-read");
  });

  it("samples delta → delta (subsumes a seed change — delta re-renders prose anyway)", () => {
    const r = routeVoiceUpdate({
      status: statusFor({
        current: {
          seedSha256: "b".repeat(64),
          samples: { ...SNAPSHOT.sampleSet, item_3: "s3".padEnd(64, "3") },
          corpusWords: 6000,
        },
      }),
      snapshot: SNAPSHOT,
    });
    expect(r.scope).toBe("delta");
    expect(r.workflow).toBe("refresh_voice");
    expect(r.inputs.scope).toBe("delta");
    expect(r.sentence).toContain("1 new piece");
  });

  it("aged (>180d or >25% growth) → delta", () => {
    const old = routeVoiceUpdate({
      status: statusFor({ snapshot: { ...SNAPSHOT, builtAt: "2026-01-01T00:00:00Z" } }),
      snapshot: { ...SNAPSHOT, builtAt: "2026-01-01T00:00:00Z" },
    });
    expect(old.scope).toBe("delta");
    const grew = routeVoiceUpdate({
      status: statusFor({
        current: { seedSha256: "a".repeat(64), samples: SNAPSHOT.sampleSet, corpusWords: 7000 },
      }),
      snapshot: SNAPSHOT,
    });
    expect(grew.scope).toBe("delta");
  });

  it("untested → calibrate_voice (the 'Test this voice' card)", () => {
    const snap = { ...SNAPSHOT, calibrationStatus: "untested" };
    const r = routeVoiceUpdate({ status: statusFor({ snapshot: snap }), snapshot: snap });
    expect(r.scope).toBe("calibrate");
    expect(r.workflow).toBe("calibrate_voice");
  });

  it("badly off → full profile_voice rebuild", () => {
    const snap = { ...SNAPSHOT, calibrationStatus: "tested-badly-off" };
    const r = routeVoiceUpdate({ status: statusFor({ snapshot: snap }), snapshot: snap });
    expect(r.scope).toBe("full");
    expect(r.workflow).toBe("profile_voice");
    expect(r.inputs.tier).toBe("full");
  });

  it("badly off beats untested and samples deltas (rebuild wins)", () => {
    const snap = { ...SNAPSHOT, calibrationStatus: "tested-badly-off" };
    const r = routeVoiceUpdate({
      status: statusFor({
        snapshot: snap,
        current: { seedSha256: "b".repeat(64), samples: { ...SNAPSHOT.sampleSet, i9: "9".padEnd(64, "9") }, corpusWords: 6000 },
      }),
      snapshot: snap,
    });
    expect(r.scope).toBe("full");
  });

  it("fresh → none (the verb disappears)", () => {
    const r = routeVoiceUpdate({ status: statusFor(), snapshot: SNAPSHOT });
    expect(r.scope).toBe("none");
    expect(r.workflow).toBeNull();
  });
});

describe("routeVoiceUpgrade (Quick → Full, §9.2 upgrade)", () => {
  it("a Quick snapshot offers full_from_quick; a Full one does not", () => {
    const quick = routeVoiceUpgrade({ ...SNAPSHOT, tier: "quick" });
    expect(quick?.scope).toBe("full_from_quick");
    expect(quick?.workflow).toBe("refresh_voice");
    expect(routeVoiceUpgrade(SNAPSHOT)).toBeNull();
    expect(routeVoiceUpgrade(null)).toBeNull();
  });
});

describe("voiceFactsPanel (§9.3 diff-of-inputs popover)", () => {
  it("renders the four facts with concrete deltas and ONE verb", () => {
    const status = statusFor({
      current: {
        seedSha256: "b".repeat(64),
        samples: { item_1: "s1".padEnd(64, "1"), item_2: "c2".padEnd(64, "c"), item_3: "s3".padEnd(64, "3") },
        corpusWords: 6000,
      },
    });
    const panel = voiceFactsPanel({
      status,
      snapshot: SNAPSHOT,
      currentCorpusWords: 6000,
      titles: { added: ["The Constitution of Reason"] },
    });
    expect(panel.facts.map((f) => f.key)).toEqual(["description", "samples", "corpus", "calibration"]);
    expect(panel.facts[0].line).toBe("changed since the build");
    expect(panel.facts[1].line).toContain('+1 added "The Constitution of Reason"');
    expect(panel.facts[1].line).toContain("1 changed");
    expect(panel.facts[2].line).toBe("5,000 → 6,000 words");
    expect(panel.facts[3].line).toBe("tested");
    expect(panel.verb).toBe("Update voice");
    expect(panel.route.scope).toBe("delta");
  });

  it("never-built offers Build voice; untested offers Test this voice", () => {
    const nb = voiceFactsPanel({ status: statusFor({ snapshot: null }), snapshot: null });
    expect(nb.verb).toBe("Build voice");
    const untestedSnap = { ...SNAPSHOT, calibrationStatus: "untested" };
    const u = voiceFactsPanel({ status: statusFor({ snapshot: untestedSnap }), snapshot: untestedSnap });
    expect(u.verb).toBe("Test this voice");
    expect(u.route.scope).toBe("calibrate");
  });

  it("badly off offers Rebuild everything", () => {
    const snap = { ...SNAPSHOT, calibrationStatus: "tested-badly-off" };
    const p = voiceFactsPanel({ status: statusFor({ snapshot: snap }), snapshot: snap });
    expect(p.verb).toBe("Rebuild everything");
    expect(p.route.scope).toBe("full");
  });
});

describe("pickHoldout (§9.5 deterministic selection)", () => {
  it("picks the first ≥100-word piece sorted by item id; null when none qualify", () => {
    const items = [
      { itemId: "b", words: 50 },
      { itemId: "a", words: 500 },
      { itemId: "c", words: 300 },
    ];
    expect(pickHoldout(items)).toBe("a");
    expect(pickHoldout([{ itemId: "x", words: MIN_HOLDOUT_WORDS - 1 }])).toBeNull();
    expect(pickHoldout([])).toBeNull();
  });
});

describe("auditHoldoutLeak (§9.5)", () => {
  const spec = { itemId: "i_held", url: "https://ex.com/a", mirrorPath: holdoutMirrorPath("i_held"), words: 400, revealedAt: null };

  const fakeTx = (rows: Record<string, { sql: RegExp; rows: unknown[] }>): Querier => ({
    query: async (sql: string) => {
      for (const k of Object.keys(rows)) {
        if (rows[k].sql.test(sql)) return { rows: rows[k].rows };
      }
      return { rows: [] };
    },
  });

  it("a non-calibrator read of the hold-out path leaks; the calibrator's does not", async () => {
    const tx = fakeTx({
      a: {
        sql: /access_log/,
        rows: [
          { path: "docs/samples/i_held.md", agent_label: "persona_builder", ts: "2026-09-01T00:00:00Z" },
          { path: "docs/samples/i_held.md", agent_label: CALIBRATOR_AGENT_LABEL, ts: "2026-09-01T01:00:00Z" },
        ],
      },
      f: { sql: /fetch_log/, rows: [] },
    });
    const audit = await auditHoldoutLeak(tx, { runId: "r1", holdout: spec });
    expect(audit.leaked).toBe(true);
    expect(audit.leaks).toHaveLength(1);
    expect(audit.leaks[0].agent).toBe("persona_builder");
  });

  it("a HOLDOUT- marker path and the hold-out URL both count; denied decisions do not", async () => {
    const tx = fakeTx({
      a: { sql: /access_log/, rows: [{ path: "docs/holdout/HOLDOUT-i_held.md", agent_label: "persona_builder", ts: "t" }] },
      f: { sql: /fetch_log/, rows: [{ url: "https://ex.com/a", agent_label: "editor", ts: "t" }] },
    });
    const audit = await auditHoldoutLeak(tx, { runId: "r1", holdout: spec });
    expect(audit.leaked).toBe(true);
    expect(audit.leaks.map((l) => l.kind).sort()).toEqual(["access", "fetch"]);
  });

  it("no rows → no leak", async () => {
    const tx = fakeTx({ a: { sql: /access_log/, rows: [] }, f: { sql: /fetch_log/, rows: [] } });
    const audit = await auditHoldoutLeak(tx, { runId: "r1", holdout: spec });
    expect(audit.leaked).toBe(false);
  });
});

describe("profile surfaces (§9.4)", () => {
  it("the section order is §9.4's fixed order — calibration first, voice-measures computed", () => {
    expect(PROFILE_SECTION_ORDER.map((s) => s.key)).toEqual([
      "calibration-report",
      "exemplars",
      "positions",
      "continuity",
      "structure",
      "audience-venue",
      "voice-measures",
      "lexicon",
    ]);
    const vm = PROFILE_SECTION_ORDER.find((s) => s.key === "voice-measures")!;
    expect(vm.path).toBeNull(); // renders from @rhema/measure, not a derived artifact
    expect(vm.advanced).toBe(true);
    expect(PROFILE_SECTION_ORDER.filter((s) => s.collapsed).map((s) => s.key)).toEqual([
      "structure",
      "audience-venue",
    ]);
  });

  it("the approve-sample card carries census counts, the unnamed hold-out line, and the calibration-off warning", () => {
    const card = approveSampleCard({
      census: { total: 9, included: 7, excluded: [{ title: "draft", reason: "couldn't fetch the file" }] },
      holdout: true,
      calibration: true,
      sampleCap: 40,
      modelTier: "base",
      estimateCredits: 420,
      capCredits: 800,
    });
    expect(card.includedLine).toBe("7 of 9 pieces");
    expect(card.holdoutLine).toBe(HOLDOUT_LINE);
    expect(card.holdoutLine).not.toContain("held-out piece's name");
    expect(card.exclusions[0].reason).toBe("couldn't fetch the file");
    expect(card.calibrationWarning).toBeNull();

    const off = approveSampleCard({
      census: { total: 9, included: 7, excluded: [] },
      holdout: true,
      calibration: false,
      sampleCap: 40,
      modelTier: "deep",
    });
    expect(off.holdoutLine).toBeNull(); // calibration off ⇒ no hold-out promise
    expect(off.calibrationWarning).toBe(CALIBRATION_OFF_WARNING);
  });

  it("the build gate enforces §9.2's requirements", () => {
    expect(checkVoiceBuildGate({ name: "", description: "d", tier: "quick", includedSamples: 0, readableSamples: 0 }).ok).toBe(false);
    expect(checkVoiceBuildGate({ name: "v", description: null, tier: "quick", includedSamples: 0, readableSamples: 0 })).toMatchObject({ ok: false, reason: "needs_description_or_sample" });
    expect(checkVoiceBuildGate({ name: "v", description: null, tier: "quick", includedSamples: 1, readableSamples: 0 }).ok).toBe(true);
    expect(checkVoiceBuildGate({ name: "v", description: "d", tier: "full", includedSamples: 3, readableSamples: 3 })).toMatchObject({ ok: false, reason: "full_needs_four_samples" });
    expect(checkVoiceBuildGate({ name: "v", description: "d", tier: "full", includedSamples: 4, readableSamples: 1 })).toMatchObject({ ok: false, reason: "full_needs_two_readable" });
    expect(checkVoiceBuildGate({ name: "v", description: null, tier: "full", includedSamples: 4, readableSamples: 2 }).ok).toBe(true);
  });

  it("holdoutRevealed gates identity on revealedAt", () => {
    const spec = { itemId: "i", url: null, mirrorPath: "docs/samples/i.md", words: 200, revealedAt: null };
    expect(holdoutRevealed(spec)).toBe(false);
    expect(holdoutRevealed({ ...spec, revealedAt: "2026-09-01T00:00:00Z" })).toBe(true);
    expect(holdoutRevealed(null)).toBe(false);
  });
});
