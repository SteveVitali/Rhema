import { describe, it, expect } from "vitest";
import { WORKFLOW_MANIFESTS, type PhaseManifest } from "@rhema/protocols";
import { RUBRIC_DIMENSIONS } from "@rhema/contracts";
import type { HarnessRunSpec } from "@rhema/orchestrator";
import { buildPhaseOutputs } from "./work-reader.js";
import { AGENT_RESULT_FILENAME } from "./agent-entry.js";

const review = WORKFLOW_MANIFESTS.review!;
const letter = review.phases.find((p) => p.key === "letter")!;

function enc(v: unknown): Uint8Array {
  return Buffer.from(typeof v === "string" ? v : JSON.stringify(v), "utf8");
}

function makeSpec(phase: PhaseManifest): HarnessRunSpec {
  return {
    request: {
      runId: "run1",
      attempt: 1,
      cwd: "/work/project",
      phase,
      ordinal: phase.index,
      of: review.phases.length,
      skill: review.skill,
      inputs: {},
      seat: "editor",
      maxBudgetUsd: 5,
      maxTurns: 40,
    },
    skillsDir: "/app/skills",
    manifest: { seat: "editor", entries: [] },
    serverFiles: {},
    hookPolicyInput: { seat: "editor", tools: [], urlPolicy: { blockedDomains: [], knownDomains: [] }, phase: { key: phase.key, phaseClass: phase.phaseClass, allowsSubagents: phase.allowsSubagents }, runId: "run1" },
    delivery: { projectId: "prj1", draftId: "dft1", correspondenceKind: "review", draftPromotedVersionId: "av_head" },
  } as unknown as HarnessRunSpec;
}

/** A valid 8-dimension rubric sidecar (satisfies rubric_dimensions_complete + sidecar_validates). */
const validRubric = { sidecar: "rubric", version: 1, dimensions: RUBRIC_DIMENSIONS.map((d) => ({ dimension: d, score: 3 })) };
const validFindings = { sidecar: "findings", version: 1, findings: [] };

describe("buildPhaseOutputs — reading a phase's /work outputs (P0.15e)", () => {
  it("reads the SDK result + phase-result + facts + dossier for the final letter phase", () => {
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, enc({ subtype: "success", usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0, webSearchRequests: 0, webFetchRequests: 0, costUsd: 0.01 } })],
      [".rhema/phase-result.json", enc({ status: "done" })],
      ["editors-letter.md", enc("# Editor's letter\n\nThorough and complete.")],
      ["findings.json", enc(validFindings)],
      ["rubric.json", enc(validRubric)],
    ]);

    const out = buildPhaseOutputs(files, makeSpec(letter), "editor");

    expect(out.subtype).toBe("success");
    expect(out.usage.inputTokens).toBe(10);
    expect(out.phaseResult).toEqual({ status: "done" });
    // every letter predicate's fact is satisfied by the /work content.
    expect(out.facts.letterSectionsComplete).toBe(true);
    expect(out.facts.rubricDimensionCount).toBe(8);
    expect(out.facts.sidecarValidates?.["findings.json"]).toBe(true);
    expect(out.facts.sidecarValidates?.["rubric.json"]).toBe(true);
    // the final phase carries the delivery dossier.
    expect(out.delivery).toBeDefined();
    expect(out.delivery!.deliveredPaths).toContain("editors-letter.md");
    expect(out.delivery!.sidecars.map((s) => s.filename).sort()).toEqual(["findings.json", "rubric.json"]);
    expect(out.delivery!.coversAllObligations).toBe(true);
  });

  it("a missing/unparseable phase-result reads as null (the oracle then treats the phase incomplete)", () => {
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, enc({ subtype: "success", usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, webSearchRequests: 0, webFetchRequests: 0, costUsd: 0 } })],
      ["editors-letter.md", enc("")], //  present but empty
    ]);
    const out = buildPhaseOutputs(files, makeSpec(letter), "editor");
    expect(out.phaseResult).toBeNull();
    expect(out.facts.letterSectionsComplete).toBe(false); // empty file → not complete
    expect(out.facts.sidecarValidates?.["findings.json"]).toBe(false); // absent sidecar → invalid
    expect(out.agentError).toBeUndefined(); // no error captured → no agentError
  });

  it("threads a captured agent error fact out of the result file (D-P0.15e-4 observability sink)", () => {
    const files = new Map<string, Uint8Array>([
      [
        AGENT_RESULT_FILENAME,
        enc({
          subtype: "error_during_execution",
          usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, webSearchRequests: 0, webFetchRequests: 0, costUsd: 0 },
          error: { class: "Error", message: "vendored @anthropic-ai/claude-agent-sdk is not present in this image" },
        }),
      ],
    ]);
    const out = buildPhaseOutputs(files, makeSpec(letter), "editor");
    expect(out.subtype).toBe("error_during_execution");
    expect(out.agentError).toEqual({ class: "Error", message: "vendored @anthropic-ai/claude-agent-sdk is not present in this image" });
  });

  it("a totally missing agent-result → error_during_execution subtype, no agentError (the killed/hung path)", () => {
    // the agent was killed before writing any result (e.g. OOM / activeDeadline). The oracle's leg (a) then
    // treats the phase incomplete; there is no captured message, but the step still fails (queryable).
    const files = new Map<string, Uint8Array>([["editors-letter.md", enc("some content")]]);
    const out = buildPhaseOutputs(files, makeSpec(letter), "editor");
    expect(out.subtype).toBe("error_during_execution");
    expect(out.agentError).toBeUndefined();
  });
});
