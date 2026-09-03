import { describe, it, expect } from "vitest";
import { createBenchmarkTestDb, testDeps, buildFinding, fakeExtractor } from "./testing/harness.js";
import {
  deBrand,
  assertDeBranded,
  brandTokensIn,
  BrandedInputError,
  verbatimSubstanceViolations,
  VerbatimSubstanceError,
  normalizeArmOutput,
  loadNormalizedFindings,
  sampleForAudit,
  recordExtractionAudit,
  extractionFidelity,
} from "./normalization.js";
import { createWave, recordArmRun } from "@rhema/benchmark";

describe("blind normalization (REQ-EVAL-7; AC2)", () => {
  it("de-brands: brand tokens are stripped and the result has none", () => {
    const branded = "Rhema's Full board found that GPT and Grammarly disagree with Claude.";
    expect(brandTokensIn(branded).length).toBeGreaterThan(0);
    const clean = deBrand(branded);
    expect(brandTokensIn(clean)).toEqual([]);
    expect(clean).not.toMatch(/Rhema|Grammarly|Claude|GPT/);
  });

  it("assertDeBranded REJECTS a branded fixture, naming the tokens (AC2)", () => {
    expect(() => assertDeBranded("The Grammarly output is fluent.")).toThrow(BrandedInputError);
    try {
      assertDeBranded("Claude and GPT reviewed it.");
      throw new Error("should have thrown");
    } catch (e) {
      expect(e).toBeInstanceOf(BrandedInputError);
      expect((e as BrandedInputError).tokens.sort()).toEqual(["Claude", "GPT"]);
    }
    expect(() => assertDeBranded("the reviewer flagged an unsupported claim")).not.toThrow();
  });

  it("verbatim-substance rule: a sharpened finding (body not a segment of the source) is a violation", () => {
    const source = "the argument on page two lacks a citation";
    const faithful = buildFinding({ id: "a", body: "the argument on page two lacks a citation" });
    const sharpened = buildFinding({ id: "b", body: "the argument fabricates a statistic on page two" });
    expect(verbatimSubstanceViolations([faithful], source)).toHaveLength(0);
    expect(verbatimSubstanceViolations([sharpened], source).map((f) => f.id)).toEqual(["b"]);
  });

  it("normalizeArmOutput de-brands → blind-extracts → enforces verbatim → persists", async () => {
    const db = await createBenchmarkTestDb();
    const deps = testDeps();
    const waveId = await createWave(db.exec, deps, { name: "w", agreementFloor: 0.6, isDevSet: true, kind: "pilot" });
    // need a draft + arm run row for the FK; register via raw insert (dev-set corpus draft)
    await db.exec.query(
      `insert into benchmark_corpus_drafts (id, protocol, length_band, word_count, created_at, license_ref, content_sha256, enclave_key, canary_id, is_dev_set)
       values ('d1','essay','2k',100, now(), 'lic','sha','key','can1', true)`,
    );
    const armRunId = await recordArmRun(db.exec, deps, { waveId, draftId: "d1", arm: "A4", configHash: "h" });
    // a brand token embedded WITHIN a segment — de-branding must remove it before the blind extractor sees it
    const rawText = "major: the Grammarly passage on page two is unsupported\n\nminor: a stray comma appears";
    const out = await normalizeArmOutput(db.exec, deps, { armRunId, rawText, draftId: "d1", extractor: fakeExtractor() });
    expect(out).toHaveLength(2);
    expect(out[0]!.finding.severity).toBe("major");
    expect(out[0]!.finding.body).not.toMatch(/Grammarly/); // de-branded before extraction (REQ-EVAL-7)
    // persisted + loadable, the row id == finding.id (referenced by match records)
    const loaded = await loadNormalizedFindings(db.exec, armRunId);
    expect(loaded.map((f) => f.id)).toEqual(out.map((o) => o.id));
    expect(loaded[0]!.finding.id).toBe(loaded[0]!.id);
    await db.close();
  });

  it("normalizeArmOutput throws if the extractor sharpens (verbatim-substance)", async () => {
    const db = await createBenchmarkTestDb();
    const deps = testDeps();
    const waveId = await createWave(db.exec, deps, { name: "w", agreementFloor: 0.6, isDevSet: true, kind: "pilot" });
    await db.exec.query(
      `insert into benchmark_corpus_drafts (id, protocol, length_band, word_count, created_at, license_ref, content_sha256, enclave_key, canary_id, is_dev_set)
       values ('d1','essay','2k',100, now(), 'lic','sha','key','can1', true)`,
    );
    const armRunId = await recordArmRun(db.exec, deps, { waveId, draftId: "d1", arm: "A4", configHash: "h" });
    const sharpeningExtractor = {
      id: "bad",
      extract: () => Promise.resolve([buildFinding({ id: "s", body: "an assertion the source never made" })]),
    };
    await expect(
      normalizeArmOutput(db.exec, deps, { armRunId, rawText: "the source said something else", draftId: "d1", extractor: sharpeningExtractor }),
    ).rejects.toThrow(VerbatimSubstanceError);
    await db.close();
  });

  it("audit sampler takes ~10% (≥1) deterministically; extractionFidelity aggregates verdicts", async () => {
    const items = Array.from({ length: 20 }, (_, i) => ({ id: `x_${String(i).padStart(2, "0")}` }));
    const sample = sampleForAudit(items, 0.1);
    expect(sample).toHaveLength(2);
    expect(sampleForAudit(items, 0.1)).toEqual(sample); // deterministic
    expect(sampleForAudit([], 0.1)).toEqual([]);
    expect(sampleForAudit([{ id: "a" }], 0.1)).toHaveLength(1); // always ≥1 when non-empty

    const db = await createBenchmarkTestDb();
    const deps = testDeps();
    const waveId = await createWave(db.exec, deps, { name: "w", agreementFloor: 0.6, isDevSet: true, kind: "pilot" });
    await db.exec.query(
      `insert into benchmark_corpus_drafts (id, protocol, length_band, word_count, created_at, license_ref, content_sha256, enclave_key, canary_id, is_dev_set)
       values ('d1','essay','2k',100, now(), 'lic','sha','key','can1', true)`,
    );
    const armRunId = await recordArmRun(db.exec, deps, { waveId, draftId: "d1", arm: "A4", configHash: "h" });
    const out = await normalizeArmOutput(db.exec, deps, {
      armRunId,
      rawText: "major: alpha issue here\n\nminor: beta issue here",
      draftId: "d1",
      extractor: fakeExtractor(),
    });
    await recordExtractionAudit(db.exec, deps, { waveId, normalizedFindingId: out[0]!.id, auditor: "ed", verdict: "faithful" });
    await recordExtractionAudit(db.exec, deps, { waveId, normalizedFindingId: out[1]!.id, auditor: "ed", verdict: "sharpened" });
    const fid = await extractionFidelity(db.exec, waveId);
    expect(fid).toEqual({ audited: 2, faithful: 1, fidelity: 0.5 });
    await db.close();
  });
});
