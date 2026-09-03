import type { Finding } from "@rhema/contracts";
import { createBenchmarkTestDb, testDeps, seedUsageRecord, InMemoryEnclaveBlobStore } from "@rhema/benchmark/testing";
import type { ArmExecutor, BenchmarkArm, JudgeModel, ModelFamily, RawArmOutput } from "../types.js";
import type { BlindExtractor } from "../normalization.js";

// Deterministic test harness for @rhema/benchmark-runner — reuses the P0.13 PGlite harness (real migrations,
// in-process, no DB service; migration 0014 rides along) and adds the runner's DI seam fakes: an ArmExecutor, a
// blind BlindExtractor, and a JudgeModel. The fakes are deterministic so every runner test is reproducible.

export { createBenchmarkTestDb, testDeps, seedUsageRecord, InMemoryEnclaveBlobStore };
export type BenchmarkTestDb = Awaited<ReturnType<typeof createBenchmarkTestDb>>;

type Severity = "blocking" | "major" | "minor" | "note";

/** Build a minimal valid §5.7 Finding (all required fields present), overridable. */
export function buildFinding(overrides: Partial<Finding> & { draftId?: string } = {}): Finding {
  const anchored = overrides.anchor !== undefined;
  return {
    id: overrides.id ?? "f_0",
    correspondenceId: overrides.correspondenceId ?? "corr_0",
    draftId: overrides.draftId ?? "draft_0",
    ordinal: overrides.ordinal ?? 0,
    kind: overrides.kind ?? "argument",
    severity: overrides.severity ?? "major",
    origin: overrides.origin ?? "editor",
    reconciliation: overrides.reconciliation,
    anchor: anchored
      ? overrides.anchor!
      : { blockId: "b1", quote: "the passage", startOffset: 0, endOffset: 11, confidence: 0.9 },
    title: overrides.title ?? "A finding",
    body: overrides.body ?? "the passage is unsupported",
    evidence: overrides.evidence,
    suggestion: overrides.suggestion,
    rubricDims: overrides.rubricDims ?? ["argument_rigor"],
    letterSection: overrides.letterSection,
    projections: overrides.projections ?? [],
    carriesObligationId: overrides.carriesObligationId,
  };
}

/**
 * Build a raw arm output whose text is the concatenation of the given finding bodies (so each body is a VERBATIM
 * segment — the fake extractor re-segments it and passes the verbatim-substance rule). A `brandLeak` prepends a
 * brand token, to exercise the de-branding rejection (AC2). Each segment may carry a `severity:` prefix the fake
 * extractor reads.
 */
export function makeRawOutput(
  arm: BenchmarkArm,
  draftId: string,
  segments: ReadonlyArray<{ body: string; severity?: Severity }>,
  opts: { runId?: string; model?: string; latencyMs?: number; brandLeak?: string } = {},
): RawArmOutput {
  const parts = segments.map((s) => (s.severity ? `${s.severity}: ${s.body}` : s.body));
  const text = (opts.brandLeak ? `${opts.brandLeak} says:\n\n` : "") + parts.join("\n\n");
  return { arm, draftId, text, runId: opts.runId, model: opts.model, latencyMs: opts.latencyMs };
}

/** A fixed-output ArmExecutor keyed `${arm}:${draftId}` (a missing key ⇒ the arm did not run that draft). */
export function fakeExecutor(outputs: Readonly<Record<string, RawArmOutput | null>>): ArmExecutor {
  return {
    run({ waveId: _w, draftId, arm }) {
      return Promise.resolve(outputs[`${arm}:${draftId}`] ?? null);
    },
  };
}

/**
 * A deterministic blind extractor: segments the de-branded text on blank lines and emits one §5.7 Finding per
 * segment, body = the segment VERBATIM (so the verbatim-substance rule holds by construction). A leading
 * `severity:` token sets the finding severity; otherwise 'minor'. Every finding is anchored (specificity > 0).
 */
export function fakeExtractor(id = "fake-extractor"): BlindExtractor {
  return {
    id,
    extract({ deBrandedText, draftId }) {
      const segments = deBrandedText.split(/\n\n+/).map((s) => s.trim()).filter((s) => s.length > 0);
      const findings: Finding[] = segments.map((seg, i) => {
        const m = /^(blocking|major|minor|note):\s*/.exec(seg);
        const severity = (m ? m[1] : "minor") as Severity;
        return buildFinding({
          id: `x_${i}`,
          draftId,
          ordinal: i,
          severity,
          title: seg.slice(0, 40),
          body: seg, // VERBATIM segment
          anchor: { blockId: `b${i}`, quote: seg.slice(0, 12), startOffset: 0, endOffset: 12, confidence: 0.85 },
        });
      });
      return Promise.resolve(findings);
    },
  };
}

/** A deterministic LLM-judge fake. `respond` maps a prompt → a completion (default: echoes a fixed string). */
export function fakeJudge(
  id: string,
  family: ModelFamily,
  opts: { model?: string; respond?: (prompt: string) => string } = {},
): JudgeModel {
  return {
    id,
    model: opts.model ?? `${family}-judge`,
    family,
    complete(prompt) {
      return Promise.resolve(opts.respond ? opts.respond(prompt) : "score: 0.5");
    },
  };
}
