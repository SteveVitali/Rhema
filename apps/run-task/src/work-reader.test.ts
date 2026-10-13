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

  // F-SEC3-3 (live run 01M416S2XP7FN37PR3FGZ1SXBX): a prior review's DELIVERED
  // `correspondence/review/<n>/second-read.json` is hydrated into /work — the basename cascade resolved
  // it as the producer marker and the delivery check rejected the run (`producer`: the stale
  // producerQueryId isn't in this run's subagent_launches). The marker read must never resolve a
  // non-`.rhema/` path.
  it("ignores a prior review's delivered second-read.json marker in the delivery dossier (stale-marker F-SEC3-3)", () => {
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, enc({ subtype: "success", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, webSearchRequests: 0, webFetchRequests: 0, costUsd: 0 } })],
      ["agents/editor/.rhema/phase-result.json", enc({ status: "done" })],
      ["agents/editor/editors-letter.md", enc("# Letter\n\nDone.")],
      ["agents/editor/.rhema/findings.json", enc(validFindings)],
      ["agents/editor/.rhema/rubric.json", enc(validRubric)],
      // the STALE marker — a prior round's delivered producer claim, not this run's:
      ["correspondence/review/1/second-read.json", enc({ producerQueryId: "qry_PRIOR_ROUND", expectedProducerQueryId: "qry_PRIOR_ROUND" })],
    ]);
    const out = buildPhaseOutputs(files, makeSpec(letter), "editor");
    expect(out.delivery).toBeDefined();
    expect(out.delivery!.secondReadProducerQueryId).toBeUndefined();
  });

  it("reads the fresh seat-scoped marker into the delivery dossier (the real producer claim still crosses)", () => {
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, enc({ subtype: "success", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, webSearchRequests: 0, webFetchRequests: 0, costUsd: 0 } })],
      ["agents/editor/.rhema/phase-result.json", enc({ status: "done" })],
      ["agents/editor/editors-letter.md", enc("# Letter\n\nDone.")],
      ["agents/editor/.rhema/findings.json", enc(validFindings)],
      ["agents/editor/.rhema/rubric.json", enc(validRubric)],
      // the launch order's markerPath is agents/<seat>/.rhema/second-read.json (runspec.ts):
      ["agents/editor/.rhema/second-read.json", enc({ producerQueryId: "qry_THIS_RUN", expectedProducerQueryId: "qry_THIS_RUN" })],
    ]);
    const out = buildPhaseOutputs(files, makeSpec(letter), "editor");
    expect(out.delivery!.secondReadProducerQueryId).toBe("qry_THIS_RUN");
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

  // PRB.16b F24 — the LIVE shape: run 01M2T6D3B32AVXHCQH73ZGJGBD's triage agent (both sub-runs) wrote
  // the structured ledger at its VERSIONED TWIN path `agents/author/ledgers/v1-response-ledger.json`
  // and skipped `.rhema/` entirely — `resolveKey` never matched the `v1-` prefix, so a valid ledger
  // read as "missing or unparseable JSON" and BOTH predicates failed the phase.
  it("the sidecar at its versioned-twin path (`v1-response-ledger.json`) resolves + validates (F24)", () => {
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, okAgentResult],
      [".rhema/phase-result.json", enc({ status: "done" })],
      ["correspondence/review/1/findings.json", enc(findings3)],
      ["agents/author/ledgers/v1-response-ledger.md", enc("# Response ledger\n")],
      ["agents/author/ledgers/v1-response-ledger.json", enc({ sidecar: "response_ledger", version: 1, entries: [ledgerEntry(0), ledgerEntry(1), ledgerEntry(2)] })],
    ]);
    const out = buildPhaseOutputs(files, makeSpec(triage, reviseWf, "author"), "author");
    expect(out.facts.sidecarValidates?.["response-ledger.json"]).toBe(true);
    expect(out.facts.responseLedgerRowPerFinding).toBe(true);
  });

  it("a literal `.rhema/` sidecar still wins over a versioned-twin namesake (F24 ordering)", () => {
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, okAgentResult],
      [".rhema/phase-result.json", enc({ status: "done" })],
      ["correspondence/review/1/findings.json", enc(findings3)],
      // INVALID .rhema copy + VALID twin — the literal name resolves first and must still fail.
      [".rhema/response-ledger.json", enc({ sidecar: "response_ledger", version: 1, rows: [] })],
      ["agents/author/ledgers/v1-response-ledger.json", enc({ sidecar: "response_ledger", version: 1, entries: [ledgerEntry(0), ledgerEntry(1), ledgerEntry(2)] })],
    ]);
    const out = buildPhaseOutputs(files, makeSpec(triage, reviseWf, "author"), "author");
    expect(out.facts.sidecarValidates?.["response-ledger.json"]).toBe(false);
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

  // PRB.19 (F26) — the deliver phase is the dossier phase: its declared sidecars now include the sealed
  // `response-ledger.json` (the delivery transaction folds ONLY what arrives in `DeliveryArgs.sidecars`),
  // and the declared `correspondence/vN-response.md` letter resolves to the concrete path the skill wrote.
  const deliver = reviseWf.phases.find((p) => p.key === "deliver")!;
  it("deliver phase: the dossier carries the response letter + the sealed response-ledger sidecar (F26)", () => {
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, okAgentResult],
      [".rhema/phase-result.json", enc({ status: "done" })],
      ["drafts/v2.md", enc("# Draft v2\n\nRevised prose with substance.")],
      ["correspondence/v1-response.md", enc("# Response\n\nMove 1 accepted.\n")],
      [".rhema/response-ledger.json", enc({ sidecar: "response_ledger", version: 1, entries: [ledgerEntry(0), ledgerEntry(1), ledgerEntry(2)], moves: [{ ordinal: 1, title: "M1" }] })],
    ]);
    const out = buildPhaseOutputs(files, makeSpec(deliver, reviseWf, "author"), "author");
    expect(out.delivery).toBeDefined();
    expect(out.delivery!.deliveredPaths).toEqual(["correspondence/v1-response.md"]);
    expect(out.delivery!.sidecars.map((s) => s.filename)).toEqual(["response-ledger.json"]);
    // the sealed-ledger predicate: a validating sidecar satisfies leg (c) of the deliver oracle.
    expect(out.facts.sidecarValidates?.["response-ledger.json"]).toBe(true);
    expect(out.facts.nonempty?.["correspondence/vN-response.md"]).toBe(true);
  });

  it("deliver phase: a missing response-ledger fails the declared sidecar predicate (the fold is enforced)", () => {
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, okAgentResult],
      [".rhema/phase-result.json", enc({ status: "done" })],
      ["correspondence/v1-response.md", enc("# Response\n")],
    ]);
    const out = buildPhaseOutputs(files, makeSpec(deliver, reviseWf, "author"), "author");
    expect(out.facts.sidecarValidates?.["response-ledger.json"]).toBe(false);
    expect(out.delivery!.sidecars).toEqual([]);
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

// ------------------------------------------------------------------ readWorkRoots (PRB.16b F22)

describe("readWorkRoots — the persona root joins the harvest map (F22)", () => {
  // Live: Quick Voice run 01M2T65W5PZ3174FPVFNQRVKZS attempt-1 — the census agent's canonical
  // outputs belong under `/work/personas/<id>/profile/**`, which a project-only walk never saw; a
  // correct-location write would have produced zero harvestable output.
  async function tmp(): Promise<string> {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    return mkdtemp(join(tmpdir(), "rhema-f22-"));
  }
  async function put(root: string, rel: string, body: string): Promise<void> {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { join, dirname } = await import("node:path");
    const abs = join(root, rel);
    await mkdir(dirname(abs), { recursive: true });
    await writeFile(abs, body, "utf8");
  }

  it("persona-root files fill keys the project walk did not produce", async () => {
    const project = await tmp();
    const persona = await tmp();
    await put(project, "manifest.md", "# Manifest\n");
    await put(persona, "PERSONA.md", "# Seed\n");
    await put(persona, "profile/provenance.md", "# Census\n");
    await put(persona, "docs/samples/a.md", "sample\n");
    const { readWorkRoots } = await import("./work-reader.js");
    const files = await readWorkRoots(project, persona);
    expect(files.has("manifest.md")).toBe(true);
    expect(files.has("PERSONA.md")).toBe(true);
    expect(files.has("profile/provenance.md")).toBe(true);
    expect(files.has("docs/samples/a.md")).toBe(true);
  });

  it("a project-root write WINS a same-path collision with the stale mounted input", async () => {
    const project = await tmp();
    const persona = await tmp();
    await put(project, "profile/index.md", "fresh agent output\n");
    await put(persona, "profile/index.md", "stale seeded stub\n");
    const { readWorkRoots } = await import("./work-reader.js");
    const files = await readWorkRoots(project, persona);
    expect(Buffer.from(files.get("profile/index.md")!).toString("utf8")).toBe("fresh agent output\n");
  });

  it("a missing persona dir is simply empty; undefined personaDir degrades to the project walk", async () => {
    const project = await tmp();
    await put(project, "manifest.md", "# Manifest\n");
    const { readWorkRoots } = await import("./work-reader.js");
    const files = await readWorkRoots(project, `${project}/no-such-dir`);
    expect([...files.keys()]).toEqual(["manifest.md"]);
    const filesOnly = await readWorkRoots(project);
    expect([...filesOnly.keys()]).toEqual(["manifest.md"]);
  });
});

describe("buildPhaseOutputs — Draft facts (P1.10; REQ-WF-4/5)", () => {
  const draftWf = WORKFLOW_MANIFESTS.draft!;
  const planPhase = draftWf.phases.find((p) => p.key === "plan")!;
  const draftPhase = draftWf.phases.find((p) => p.key === "draft")!;
  const deliveryPhase = draftWf.phases.find((p) => p.key === "delivery")!;

  const planSidecar = {
    sidecar: "structure_plan",
    version: 1,
    spine: ["c1", "c2", "c3"],
    sections: [
      { ref: "I", title: "Opening", targetWords: 700 },
      { ref: "II", title: "Middle", targetWords: 900 },
      { ref: "III", title: "Close", targetWords: 400 },
    ],
  };
  const draftLedger = [
    "# Draft ledger — piece v3",
    "",
    "## Sections",
    "",
    "| # | Section | Function | Budget | Actual | Status | Claim rows | Deviation |",
    "|---|---|---|---|---|---|---|---|",
    "| 1 | Opening | intro | 700 | 720 | verified | C1 | — |",
    "| 2 | Middle | develop | 900 | 880 | drafted | C2 | — |",
    "| 3 | Close | land it | 400 | — | planned | — | — |",
    "",
  ].join("\n");

  function draftSpec(phase: PhaseManifest, inputs: Record<string, unknown> = {}): HarnessRunSpec {
    const spec = makeSpec(phase, draftWf, "author");
    (spec.request as { inputs: Record<string, unknown> }).inputs = inputs;
    return spec;
  }

  it("spine_min reads the structure-plan sidecar's spine count", () => {
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, enc({ subtype: "success", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, webSearchRequests: 0, webFetchRequests: 0, costUsd: 0 } })],
      ["agents/author/drafting/v3/02-structure-plan.md", enc("# Plan\n")],
      [".rhema/structure-plan.json", enc(planSidecar)],
    ]);
    const out = buildPhaseOutputs(files, draftSpec(planPhase), "author");
    expect(out.facts.spineCount).toBe(3);
    expect(out.facts.sidecarValidates?.["structure-plan.json"]).toBe(true);
  });

  it("draft_sections_eq_plan counts ledger rows past 'planned' vs the plan's sections", () => {
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, enc({ subtype: "success", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, webSearchRequests: 0, webFetchRequests: 0, costUsd: 0 } })],
      ["drafts/v3.md", enc("# v3\n\nOpening. Middle.\n")],
      ["agents/author/drafting/v3/04-draft-ledger.md", enc(draftLedger)],
      [".rhema/structure-plan.json", enc(planSidecar)],
    ]);
    const out = buildPhaseOutputs(files, draftSpec(draftPhase), "author");
    // 2 drafted (verified + drafted), 3 planned sections — the predicate FAILS (2 ≠ 3).
    expect(out.facts.draftSectionCount).toBe(2);
    expect(out.facts.planSectionCount).toBe(3);
  });

  it("a trial preview clamps the expected section count to inputs.preview.sections", () => {
    const oneSectionLedger = draftLedger.replace("drafted | C2", "planned | —");
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, enc({ subtype: "success", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, webSearchRequests: 0, webFetchRequests: 0, costUsd: 0 } })],
      ["drafts/v3.md", enc("# v3\n\nOpening only.\n")],
      ["agents/author/drafting/v3/04-draft-ledger.md", enc(oneSectionLedger)],
      [".rhema/structure-plan.json", enc(planSidecar)],
    ]);
    const out = buildPhaseOutputs(files, draftSpec(draftPhase, { preview: { sections: 1 } }), "author");
    expect(out.facts.draftSectionCount).toBe(1);
    expect(out.facts.planSectionCount).toBe(1); // min(3 plan sections, preview 1)
  });

  it("the delivery dossier folds the Draft grounding ledger (03-claim-ledger.json), not the review 01-", () => {
    const ledger = { sidecar: "claim_ledger", version: 1, claims: [{ ordinal: 1, text: "c", tier: 2, verdict: "verified", humanAdded: false }] };
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, enc({ subtype: "success", usage: { inputTokens: 1, outputTokens: 1, cacheReadTokens: 0, cacheCreationTokens: 0, webSearchRequests: 0, webFetchRequests: 0, costUsd: 0 } })],
      ["correspondence/v3-drafting-note.md", enc("# Drafting note\n")],
      ["agents/author/drafting/v3/03-claim-ledger.md", enc("# Claim ledger\n")],
      [".rhema/03-claim-ledger.json", enc(ledger)],
    ]);
    const out = buildPhaseOutputs(files, draftSpec(deliveryPhase), "author");
    expect(out.delivery).toBeDefined();
    expect(out.delivery!.deliveredPaths).toContain("correspondence/v3-drafting-note.md");
    expect(out.delivery!.claimLedger?.claims).toHaveLength(1);
    expect(out.delivery!.sidecars.map((s) => s.filename)).toContain("03-claim-ledger.json");
  });
});

// DEF.1 (F2, STB.3 live — memo/review run 01M3DKQR…): the second_read phase was produced by nothing —
// `secondReadProducerQueryId: null, expectedProducerQueryId: null` — because no orchestrator-launched,
// input-scoped query ever ran (the judge-phase `Agent` deny correctly refused the parent Editor's own
// spawn). The facts must stay null (failing the oracle) when no marker exists, and populate only from the
// `.rhema/second-read.json` marker the harness stamps after executing the scoped launch (scoped-phase.ts).
describe("buildPhaseOutputs — second_read producer facts (DEF.1 F2)", () => {
  const secondRead = review.phases.find((p) => p.key === "second_read")!;
  const files0 = () =>
    new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, enc({ subtype: "success" })],
      [".rhema/phase-result.json", enc({ status: "done" })],
      ["agents/editor/05-second-read.md", enc("the second read")],
    ]);

  it("no marker → both facts null (the STB.3 state — the predicate must fail)", () => {
    const out = buildPhaseOutputs(files0(), makeSpec(secondRead), "editor");
    expect(out.facts.secondReadProducerQueryId).toBeNull();
    expect(out.facts.expectedProducerQueryId).toBeNull();
  });

  it("the seat-dir marker (agents/editor/.rhema/second-read.json) resolves by suffix → both facts set", () => {
    const files = files0();
    files.set("agents/editor/.rhema/second-read.json", enc({ producerQueryId: "qry_1", expectedProducerQueryId: "qry_1" }));
    const out = buildPhaseOutputs(files, makeSpec(secondRead), "editor");
    expect(out.facts.secondReadProducerQueryId).toBe("qry_1");
    expect(out.facts.expectedProducerQueryId).toBe("qry_1");
  });

  it("a mismatched marker still surfaces both facts (the oracle compares, the reader never fakes a match)", () => {
    const files = files0();
    files.set("agents/editor/.rhema/second-read.json", enc({ producerQueryId: "qry_a", expectedProducerQueryId: "qry_b" }));
    const out = buildPhaseOutputs(files, makeSpec(secondRead), "editor");
    expect(out.facts.secondReadProducerQueryId).toBe("qry_a");
    expect(out.facts.expectedProducerQueryId).toBe("qry_b");
  });

  it("the final-phase dossier carries the marker's producerQueryId for checkSecondReadProducer", () => {
    const files = new Map<string, Uint8Array>([
      [AGENT_RESULT_FILENAME, enc({ subtype: "success" })],
      [".rhema/phase-result.json", enc({ status: "done" })],
      ["agents/editor/editors-letter.md", enc("# Editor's letter\n\nThorough and complete.")],
      ["agents/editor/.rhema/findings.json", enc(validFindings)],
      ["agents/editor/.rhema/rubric.json", enc(validRubric)],
      ["agents/editor/.rhema/second-read.json", enc({ producerQueryId: "qry_1", expectedProducerQueryId: "qry_1" })],
    ]);
    const out = buildPhaseOutputs(files, makeSpec(letter), "editor");
    expect(out.delivery?.secondReadProducerQueryId).toBe("qry_1");
  });
});

// DEF.1 (F1, STB.3 live — profile-voice run 01M3DJ5V…): the persona builder's phase-result lives at the
// PERSONA root (`/work/personas/<id>/.rhema/phase-result.json`), which `readWorkRoots` folds into the map
// at key `.rhema/phase-result.json`. The oracle's leg (b) must read it — a project-only walk reported
// "missing or unparseable .rhema/phase-result.json" on a clean run.
describe("readWorkRoots — persona-root .rhema control files (DEF.1 F1)", () => {
  async function tmp(): Promise<string> {
    const { mkdtemp } = await import("node:fs/promises");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    return mkdtemp(join(tmpdir(), "rhema-f1-"));
  }

  it("the persona-root phase-result resolves at the canonical key", async () => {
    const { mkdir, writeFile } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const project = await tmp();
    const persona = await tmp();
    await mkdir(join(project, ".rhema"), { recursive: true });
    await mkdir(join(persona, ".rhema"), { recursive: true });
    await writeFile(join(project, "manifest.md"), "# Manifest\n");
    await writeFile(join(persona, ".rhema", "phase-result.json"), JSON.stringify({ status: "done" }));
    const { readWorkRoots } = await import("./work-reader.js");
    const files = await readWorkRoots(project, persona);
    expect(JSON.parse(Buffer.from(files.get(".rhema/phase-result.json")!).toString("utf8"))).toEqual({ status: "done" });
  });
});
