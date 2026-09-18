import { describe, it, expect } from "vitest";
import { WORKFLOW_MANIFESTS, type PhaseManifest, type WorkflowManifest } from "@rhema/protocols";
import { RUBRIC_DIMENSIONS } from "@rhema/contracts";
import type { HarnessRunSpec } from "@rhema/orchestrator";
import { buildPhaseOutputs } from "./work-reader.js";
import { AGENT_RESULT_FILENAME } from "./agent-entry.js";

const review = WORKFLOW_MANIFESTS.review!;
const letter = review.phases.find((p) => p.key === "letter")!;

function enc(v: unknown): Uint8Array {
  return Buffer.from(typeof v === "string" ? v : JSON.stringify(v), "utf8");
}

function makeSpec(phase: PhaseManifest, wf: WorkflowManifest = review, seat = "editor"): HarnessRunSpec {
  return {
    request: {
      runId: "run1",
      attempt: 1,
      cwd: "/work/project",
      phase,
      ordinal: phase.index,
      of: wf.phases.length,
      skill: wf.skill,
      inputs: {},
      seat,
      maxBudgetUsd: 5,
      maxTurns: 40,
    },
    skillsDir: "/app/skills",
    manifest: { seat, entries: [] },
    serverFiles: {},
    hookPolicyInput: { seat, tools: [], urlPolicy: { blockedDomains: [], knownDomains: [] }, phase: { key: phase.key, phaseClass: phase.phaseClass, allowsSubagents: phase.allowsSubagents }, runId: "run1" },
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

  it("resolves the delivered dossier paths when /work is keyed by the SEAT-ROOTED path (P0.15h — the bare-name miss that finalized without delivering)", () => {
    // Live, the harness materializes files under the seat output_dir, so the map is keyed
    // "agents/editor/editors-letter.md", NOT the bare "editors-letter.md" the manifest declares. A raw
    // `files.has("editors-letter.md")` matched nothing → deliveredPaths empty → the run finalized BARE.
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, enc({ subtype: "success", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, webSearchRequests: 0, webFetchRequests: 0, costUsd: 0 } })],
      ["agents/editor/.rhema/phase-result.json", enc({ status: "done" })],
      ["agents/editor/editors-letter.md", enc("# Editor's letter\n\nThorough and complete.")],
      ["agents/editor/.rhema/findings.json", enc(validFindings)],
      ["agents/editor/.rhema/rubric.json", enc(validRubric)],
    ]);
    const out = buildPhaseOutputs(files, makeSpec(letter), "editor");
    expect(out.delivery).toBeDefined();
    // deliveredPaths resolves to the seat-rooted key (non-empty → the loop DELIVERS the dossier, not finalize-bare).
    expect(out.delivery!.deliveredPaths).toEqual(["agents/editor/editors-letter.md"]);
    expect(out.delivery!.sidecars.map((s) => s.filename).sort()).toEqual(["findings.json", "rubric.json"]);
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

// Residue 1 (P0.15h): the per-phase skill-execution fix. Driven phase-by-phase, an intermediate phase (craft,
// argument) must produce its OWN dossier file under the writable `output_dir` (`agents/editor/**`) — the live
// P0.15g failure was the craft phase exiting clean but writing no `04-craft-notes.md`, so its
// `artifact_nonempty` predicate could never pass. These fixtures assert the completion oracle's facts flip
// exactly on whether the declared artifact was written under output_dir (found wherever the skill placed it).
describe("buildPhaseOutputs — per-phase intermediate artifacts under output_dir (residue 1)", () => {
  const craft = review.phases.find((p) => p.key === "craft")!;
  const argument = review.phases.find((p) => p.key === "argument")!;

  const okAgentResult = enc({
    subtype: "success",
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0, webSearchRequests: 0, webFetchRequests: 0, costUsd: 0.01 },
  });

  it("craft phase: `04-craft-notes.md` written under agents/editor → artifact_nonempty fact is TRUE (found via resolveKey)", () => {
    // a realistic multi-phase /work: intake's committed brief re-materialized under the seat namespace, plus
    // this phase's own craft notes under the SAME writable output_dir (the skill honors output_dir=agents/editor).
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, okAgentResult],
      [".rhema/phase-result.json", enc({ status: "done" })],
      ["agents/editor/00-piece-brief.md", enc("# Piece brief\n\nThesis: … inventory: …")],
      ["agents/editor/04-craft-notes.md", enc("# Craft notes\n\nStructure: the opening buries the stakes …")],
    ]);
    const out = buildPhaseOutputs(files, makeSpec(craft), "editor");
    expect(out.subtype).toBe("success");
    expect(out.facts.nonempty?.["04-craft-notes.md"]).toBe(true);
    // an intermediate phase carries NO delivery dossier (only the final letter phase does).
    expect(out.delivery).toBeUndefined();
  });

  it("craft phase: the LIVE failure — no `04-craft-notes.md`, only the re-read intake brief + a stray probe → fact FALSE", () => {
    // reproduces the P0.15g live symptom: the agent re-read the committed intake artifacts and wrote a stray
    // file but never produced its declared craft notes. The oracle's leg (c) must NOT read this as complete.
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, okAgentResult],
      [".rhema/phase-result.json", enc({ status: "done" })],
      ["agents/editor/00-piece-brief.md", enc("# Piece brief\n\nThesis: … inventory: …")],
      ["agents/editor/probe.txt", enc("probe")],
    ]);
    const out = buildPhaseOutputs(files, makeSpec(craft), "editor");
    expect(out.facts.nonempty?.["04-craft-notes.md"]).toBe(false);
  });

  it("argument phase: `03-argument-notes.md` under output_dir → artifact_nonempty fact is TRUE", () => {
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, okAgentResult],
      [".rhema/phase-result.json", enc({ status: "done" })],
      ["agents/editor/03-argument-notes.md", enc("# Argument\n\nThe central analogy fails because …")],
    ]);
    const out = buildPhaseOutputs(files, makeSpec(argument), "editor");
    expect(out.facts.nonempty?.["03-argument-notes.md"]).toBe(true);
  });

  it("an empty `04-craft-notes.md` (a plausible partial) is NOT non-empty — completion must be proven", () => {
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, okAgentResult],
      [".rhema/phase-result.json", enc({ status: "done" })],
      ["agents/editor/04-craft-notes.md", enc("   \n")], // whitespace only
    ]);
    const out = buildPhaseOutputs(files, makeSpec(craft), "editor");
    expect(out.facts.nonempty?.["04-craft-notes.md"]).toBe(false);
  });
});

// PRB.16b F15 — the Revise triage oracle legs that failed 4× on prod run 01M2SH38…:
//   (1) `response_ledger_one_row_per_finding` was DECLARED but never COMPUTED (no fact producer → a
//       guaranteed-incomplete predicate no output could satisfy);
//   (2) `sidecar_validates` reported a bare `false` — the zod issues never reached the facts, so the
//       guided retry re-guessed the same contract violation (`rows` for the required `entries`);
//   (3) the predicate's declared artifact carries a `vN` version template
//       (`agents/author/ledgers/vN-response-ledger.md`, `drafts/v(N+1).md`) that resolveKey could not
//       match against the concrete `v1`/`v2` files the agent writes.
describe("buildPhaseOutputs — revise triage sidecar facts (PRB.16b F15)", () => {
  const reviseWf = WORKFLOW_MANIFESTS.revise!;
  const triage = reviseWf.phases.find((p) => p.key === "triage")!;
  const revisePhase = reviseWf.phases.find((p) => p.key === "revise")!;

  const okAgentResult = enc({
    subtype: "success",
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0, webSearchRequests: 0, webFetchRequests: 0, costUsd: 0.01 },
  });
  // the fact reads only `findings[].ordinal` (the row set) — no schema validation of findings.json here.
  const findings3 = {
    sidecar: "findings",
    version: 1,
    findings: [{ ordinal: 0 }, { ordinal: 1 }, { ordinal: 2 }],
  };
  const ledgerEntry = (o: number, actor?: string) => ({
    findingOrdinal: o,
    disposition: { kind: "accept", status: "proposed", ...(actor ? { actor } : {}) },
  });

  it("valid sidecar entries covering every finding ordinal → row-per-finding TRUE + sidecar validates", () => {
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, okAgentResult],
      [".rhema/phase-result.json", enc({ status: "done" })],
      ["correspondence/review/1/findings.json", enc(findings3)],
      // user-authored pre-triage rows are permitted extras (coverage, not exact count — REQ-IDE-28).
      [".rhema/response-ledger.json", enc({ sidecar: "response_ledger", version: 1, entries: [ledgerEntry(0, "user"), ledgerEntry(0), ledgerEntry(1), ledgerEntry(2)] })],
      ["agents/author/ledgers/v1-response-ledger.md", enc("# Response ledger\n\n<!-- rhema:response_ledger v1 -->\n")],
    ]);
    const out = buildPhaseOutputs(files, makeSpec(triage, reviseWf, "author"), "author");
    expect(out.facts.responseLedgerRowPerFinding).toBe(true);
    expect(out.facts.sidecarValidates?.["response-ledger.json"]).toBe(true);
    expect(out.facts.sidecarIssues?.["response-ledger.json"]).toBeUndefined();
  });

  it("markdown-twin fallback: `## Finding N` rows in the vN ledger cover the findings (sidecar absent → still invalid)", () => {
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, okAgentResult],
      [".rhema/phase-result.json", enc({ status: "done" })],
      ["correspondence/review/1/findings.json", enc(findings3)],
      // the vN TEMPLATE artifact resolves to the concrete v1 file the agent wrote (resolveKey fix).
      ["agents/author/ledgers/v1-response-ledger.md", enc("# Response ledger\n\n## Finding 0\n## Finding 1\n## Finding 2\n")],
    ]);
    const out = buildPhaseOutputs(files, makeSpec(triage, reviseWf, "author"), "author");
    expect(out.facts.responseLedgerRowPerFinding).toBe(true);
    expect(out.facts.sidecarValidates?.["response-ledger.json"]).toBe(false);
    expect(out.facts.sidecarIssues?.["response-ledger.json"]).toBe("missing or unparseable JSON");
  });

  it("a findings-ordinal gap → row-per-finding FALSE (coverage is proven, never assumed)", () => {
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, okAgentResult],
      ["correspondence/review/1/findings.json", enc(findings3)],
      [".rhema/response-ledger.json", enc({ sidecar: "response_ledger", version: 1, entries: [ledgerEntry(0), ledgerEntry(1)] })],
    ]);
    const out = buildPhaseOutputs(files, makeSpec(triage, reviseWf, "author"), "author");
    expect(out.facts.responseLedgerRowPerFinding).toBe(false);
  });

  it("findings.json absent → the row set is unprovable → FALSE", () => {
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, okAgentResult],
      [".rhema/response-ledger.json", enc({ sidecar: "response_ledger", version: 1, entries: [ledgerEntry(0), ledgerEntry(1), ledgerEntry(2)] })],
    ]);
    const out = buildPhaseOutputs(files, makeSpec(triage, reviseWf, "author"), "author");
    expect(out.facts.responseLedgerRowPerFinding).toBe(false);
  });

  it("the LIVE failure shape — `rows` for the required `entries` — fails with the zod issue named in sidecarIssues", () => {
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, okAgentResult],
      ["correspondence/review/1/findings.json", enc(findings3)],
      [".rhema/response-ledger.json", enc({ sidecar: "response_ledger", version: 1, rows: [ledgerEntry(0), ledgerEntry(1), ledgerEntry(2)] })],
    ]);
    const out = buildPhaseOutputs(files, makeSpec(triage, reviseWf, "author"), "author");
    expect(out.facts.sidecarValidates?.["response-ledger.json"]).toBe(false);
    expect(out.facts.sidecarIssues?.["response-ledger.json"]).toContain("entries");
    // `rows` is not `entries` → the MD fallback applies; no ledger file → coverage unprovable.
    expect(out.facts.responseLedgerRowPerFinding).toBe(false);
  });

  it("revise phase: `drafts/v(N+1).md` resolves the concrete `drafts/v2.md` (version-template resolveKey)", () => {
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, okAgentResult],
      [".rhema/phase-result.json", enc({ status: "done" })],
      ["drafts/v1.md", enc("# Draft v1")],
      ["drafts/v2.md", enc("# Draft v2\n\nRevised prose with substance.")],
    ]);
    const out = buildPhaseOutputs(files, makeSpec(revisePhase, reviseWf, "author"), "author");
    expect(out.facts.nonempty?.["drafts/v(N+1).md"]).toBe(true);
  });
});

// PRB.16b F20 — the agent's structured response-ledger rows never became an artifact: the mirror's
// derived-file rule skips the root `.rhema/` subtree, so `.rhema/response-ledger.json` validated for
// the oracle but was then DROPPED. `loadLedgerEntries` (the approve_triage card + the write-back
// overlay merge) reads the persisted `<ledger .md> → .json` twin — absent, the merge saw an EMPTY
// agent set and the live overlay carried only the human's 4 dispositions (the ~15 agent proposals
// vanished). buildPhaseOutputs now persists the declared sidecar at the resolved gateArtifact's twin
// path — the same convention serializeGateOverlay writes.
describe("buildPhaseOutputs — response-ledger sidecar twin persistence (PRB.16b F20)", () => {
  const reviseWf = WORKFLOW_MANIFESTS.revise!;
  const triage = reviseWf.phases.find((p) => p.key === "triage")!;

  const okAgentResult = enc({
    subtype: "success",
    usage: { inputTokens: 10, outputTokens: 5, cacheReadTokens: 0, cacheCreationTokens: 0, webSearchRequests: 0, webFetchRequests: 0, costUsd: 0.01 },
  });
  const ledger = { sidecar: "response_ledger", version: 1, entries: [{ findingOrdinal: 0, disposition: { kind: "accept", status: "proposed" } }] };

  it("persists `.rhema/response-ledger.json` at the produced ledger's `.json` twin path", () => {
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, okAgentResult],
      ["correspondence/review/1/findings.json", enc({ sidecar: "findings", version: 1, findings: [{ ordinal: 0 }] })],
      [".rhema/response-ledger.json", enc(ledger)],
      ["agents/author/ledgers/v1-response-ledger.md", enc("# Response ledger\n\n## Finding 0\n")],
    ]);
    const out = buildPhaseOutputs(files, makeSpec(triage, reviseWf, "author"), "author");
    const twin = out.versions.find((v) => v.path === "agents/author/ledgers/v1-response-ledger.json");
    expect(twin).toBeDefined();
    expect(twin!.kind).toBe("sidecar");
    expect(JSON.parse(Buffer.from(twin!.bytes).toString("utf8"))).toEqual(ledger);
  });

  it("does NOT mint a second twin when the agent already wrote the `.json` ledger sibling", () => {
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, okAgentResult],
      ["correspondence/review/1/findings.json", enc({ sidecar: "findings", version: 1, findings: [{ ordinal: 0 }] })],
      [".rhema/response-ledger.json", enc(ledger)],
      ["agents/author/ledgers/v1-response-ledger.md", enc("# Response ledger\n\n## Finding 0\n")],
      ["agents/author/ledgers/v1-response-ledger.json", enc(ledger)],
    ]);
    const out = buildPhaseOutputs(files, makeSpec(triage, reviseWf, "author"), "author");
    // exactly ONE version at the twin path (the harvested one) — no duplicate appended.
    expect(out.versions.filter((v) => v.path === "agents/author/ledgers/v1-response-ledger.json")).toHaveLength(1);
  });

  it("no ledger markdown produced → no twin (an unresolved `vN` template path is never persisted)", () => {
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, okAgentResult],
      [".rhema/response-ledger.json", enc(ledger)],
    ]);
    const out = buildPhaseOutputs(files, makeSpec(triage, reviseWf, "author"), "author");
    expect(out.versions.some((v) => v.path.includes("vN"))).toBe(false);
    expect(out.versions.some((v) => v.path === "agents/author/ledgers/v1-response-ledger.json")).toBe(false);
  });
});
