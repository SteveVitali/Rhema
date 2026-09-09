// Read one phase's `/work` outputs into the `PhaseRunOutputs` the commit loop consumes (P0.15e). The pure core
// `buildPhaseOutputs` takes an in-memory `path → bytes` map (so it is unit-testable with no filesystem) and:
//   - reads `.rhema/phase-result.json` (oracle leg b) + `.rhema/agent-result.json` (the SDK subtype/usage the
//     agent reported, leg a);
//   - runs the mirror write-back `harvest` to produce the versions to persist;
//   - derives the `PredicateFacts` each of the phase's completion predicates needs (oracle leg c);
//   - on the final phase, assembles the `/work`-derived delivery dossier (sidecars + claim/findings/rubric).
// `readWorkDir` is the thin node-fs walker that fills the map from a live `/work` (deploy glue, Stage-B verified).
//
// The workflow-specific predicate/dossier parsing here (thesis+inventory, claim counts, rubric dims, letter
// sections) is faithful to the review manifest but tuned against real agent output in the live run (Stage B).

import type { AgentTypeKey } from "@rhema/contracts";
import { SIDECAR_REGISTRY, type SidecarFilename } from "@rhema/contracts";
import { emptyUsage, type ResultSubtype, type UsageSnapshot } from "@rhema/engine";
import type { PhaseManifest } from "@rhema/protocols";
import { harvest, manifestByPath, type HarvestFile, type MirrorManifest, type NewVersion, type SidecarInput } from "@rhema/mirror";
import type { MountRoot } from "@rhema/hooks";
import type { PhaseResultFile, PredicateFacts } from "@rhema/orchestrator";
import type { HarnessRunSpec } from "@rhema/orchestrator";
import type { PhaseRunOutputs, WorkDeliveryContent } from "./harness-loop.js";
import { AGENT_RESULT_FILENAME, type AgentResultFile } from "./agent-entry.js";

const PHASE_RESULT_PATH = ".rhema/phase-result.json";

/**
 * Resolve a completion-predicate artifact path to the actual `/work` key (K5 / D-P0.06-1, diagnosed live). The
 * manifest predicates name bare paths (`00-piece-brief.md`, `.rhema/phase-result.json`), but the skill writes its
 * dossier under an `output_dir` subtree (live: `correspondence/v1-review/00-piece-brief.md`). Match, in order:
 * an exact key, then a key ENDING WITH `/<target>` (the dossier-subdir case), then one whose basename matches —
 * so the oracle finds the artifact wherever the skill placed it. Returns the resolved key, or the target itself.
 */
function resolveKey(files: ReadonlyMap<string, Uint8Array>, target: string): string {
  if (files.has(target)) return target;
  const suffix = `/${target}`;
  const bySuffix = [...files.keys()].filter((k) => k.endsWith(suffix)).sort((a, b) => a.length - b.length)[0];
  if (bySuffix) return bySuffix;
  const base = target.slice(target.lastIndexOf("/") + 1);
  const byBase = [...files.keys()].filter((k) => k.slice(k.lastIndexOf("/") + 1) === base).sort((a, b) => a.length - b.length)[0];
  return byBase ?? target;
}

/** Parse a JSON file from the map (resolving the dossier location), or null when absent/unparseable. */
function readJson<T>(files: ReadonlyMap<string, Uint8Array>, path: string): T | null {
  const bytes = files.get(resolveKey(files, path));
  if (!bytes) return null;
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as T;
  } catch {
    return null;
  }
}

function textOf(files: ReadonlyMap<string, Uint8Array>, path: string): string | null {
  const bytes = files.get(resolveKey(files, path));
  return bytes ? Buffer.from(bytes).toString("utf8") : null;
}

/** true when a sidecar file validates against its registered schema. */
function sidecarValidates(files: ReadonlyMap<string, Uint8Array>, filename: string): boolean {
  type Parser = {
    safeParse(v: unknown): { success: boolean; error?: { issues: unknown[] } };
  };
  const entry = (SIDECAR_REGISTRY as Record<string, { schema: Parser }>)[filename];
  const json = readJson<unknown>(files, filename);
  if (!entry) {
    console.log(`[sidecar] ${filename}: no registered schema`);
    return false;
  }
  if (json == null) {
    console.log(`[sidecar] ${filename}: missing or unparseable JSON`);
    return false;
  }
  const res = entry.schema.safeParse(json);
  if (!res.success) {
    // Log WHY (the zod issues) + a content head, so a schema/skill drift is diagnosable from the pod log
    // instead of a bare `sidecarValidates:false` (P0.15h — the error was previously discarded).
    const issues = JSON.stringify(res.error?.issues ?? []).slice(0, 1500);
    const head = JSON.stringify(json).slice(0, 800);
    console.log(`[sidecar] ${filename}: INVALID issues=${issues} content-head=${head}`);
  }
  return res.success;
}

/** Build the `HarvestFile[]` for the write-back diff: every non-derived `/work` file with its mount root. */
function harvestFiles(files: ReadonlyMap<string, Uint8Array>, manifest: MirrorManifest, defaultRoot: MountRoot): HarvestFile[] {
  const byPath = manifestByPath(manifest);
  const out: HarvestFile[] = [];
  for (const [path, bytes] of files) {
    // Never harvest the manifest.md or the per-phase TRANSIENT status files — `phase-result.json` and
    // `agent-result.json` — wherever they sit (they are written under the seat output_dir, e.g.
    // `agents/editor/.rhema/phase-result.json`, so a root-only check missed them and they got harvested +
    // re-materialized, making the NEXT phase's oracle read a STALE `{status:"complete"}` — the live P0.15h
    // craft-read-intake bug). But the STRUCTURED SIDECARS (`01-claim-ledger.json`, `findings.json`,
    // `rubric.json`) ALSO live under `.rhema/` and ARE deliverables — they MUST be harvested. So exclude only
    // the two transient basenames, never the whole `.rhema/` subtree.
    const base = path.slice(path.lastIndexOf("/") + 1);
    if (path === "manifest.md" || base === "phase-result.json" || base === "agent-result.json") continue;
    const root = byPath.get(path)?.root ?? defaultRoot;
    out.push({ path, root, bytes });
  }
  return out;
}

/** The predicate facts each of the phase's completion predicates reads (oracle leg c). */
function factsForPhase(files: ReadonlyMap<string, Uint8Array>, phase: PhaseManifest): PredicateFacts {
  const present: Record<string, boolean> = {};
  const nonempty: Record<string, boolean> = {};
  const sidecarValid: Record<string, boolean> = {};
  const facts: {
    -readonly [K in keyof PredicateFacts]: PredicateFacts[K];
  } = {};

  for (const p of phase.completionPredicates ?? []) {
    switch (p.kind) {
      case "artifact_present":
        present[p.artifact] = files.has(resolveKey(files, p.artifact));
        break;
      case "artifact_nonempty":
        nonempty[p.artifact] = (textOf(files, p.artifact)?.trim().length ?? 0) > 0;
        break;
      case "sidecar_validates":
        sidecarValid[p.sidecar] = sidecarValidates(files, p.sidecar);
        break;
      case "thesis_and_inventory_present": {
        const brief = textOf(files, p.artifact) ?? "";
        facts.thesisPresent = /thesis/i.test(brief) && brief.trim().length > 0;
        facts.inventoryPresent = /inventor/i.test(brief);
        break;
      }
      case "claim_rows_gte_inventory": {
        const ledger = readJson<{ claims?: unknown[]; inventoryCount?: number }>(files, p.artifact.replace(/\.md$/, ".json")) ?? readJson<{ claims?: unknown[]; inventoryCount?: number }>(files, "01-claim-ledger.json");
        facts.claimRowCount = ledger?.claims?.length ?? 0;
        facts.inventoryCount = ledger?.inventoryCount ?? 0; // the inventory count is carried on the ledger sidecar
        break;
      }
      case "rubric_dimensions_complete": {
        const rubric = readJson<{ dimensions?: unknown[] }>(files, "rubric.json");
        facts.rubricDimensionCount = rubric?.dimensions?.length ?? 0;
        break;
      }
      case "letter_sections_complete":
        facts.letterSectionsComplete = (textOf(files, p.artifact)?.trim().length ?? 0) > 0;
        break;
      case "second_read_producer_checked": {
        const marker = readJson<{ producerQueryId?: string; expectedProducerQueryId?: string }>(files, ".rhema/second-read.json");
        facts.secondReadProducerQueryId = marker?.producerQueryId ?? null;
        facts.expectedProducerQueryId = marker?.expectedProducerQueryId ?? null;
        break;
      }
      default:
        // predicates the review workflow does not use (draft_sections_eq_plan, spine_min, response_ledger…).
        break;
    }
  }

  return { ...facts, present, nonempty, sidecarValidates: sidecarValid };
}

/** The dossier content for the final delivery — read the phase's declared sidecars + artifacts from `/work`. */
function dossierForPhase(files: ReadonlyMap<string, Uint8Array>, phase: PhaseManifest): WorkDeliveryContent {
  const sidecars: SidecarInput[] = [];
  for (const filename of phase.sidecars) {
    const json = readJson<unknown>(files, filename);
    if (json != null) sidecars.push({ filename: filename as SidecarFilename, json });
  }
  // the delivered dossier artifacts are the phase's declared markdown artifacts that were produced.
  const deliveredPaths = phase.artifacts.filter((a) => a.endsWith(".md") && files.has(a));
  const claimLedger = readJson<WorkDeliveryContent["claimLedger"]>(files, "01-claim-ledger.json") ?? undefined;
  const findings = readJson<WorkDeliveryContent["findings"]>(files, "findings.json") ?? undefined;
  const rubric = readJson<WorkDeliveryContent["rubric"]>(files, "rubric.json") ?? undefined;
  const secondRead = readJson<{ producerQueryId?: string }>(files, ".rhema/second-read.json");
  return {
    deliveredPaths,
    sidecars,
    ...(claimLedger ? { claimLedger } : {}),
    ...(findings ? { findings } : {}),
    ...(rubric ? { rubric } : {}),
    ...(secondRead?.producerQueryId ? { secondReadProducerQueryId: secondRead.producerQueryId } : {}),
    coversAllObligations: true,
  };
}

/** The seat's primary mount root (a project seat writes under `project`; a persona builder under `persona`). */
function primaryRoot(seat: AgentTypeKey): MountRoot {
  return seat === "persona_builder" ? "persona" : "project";
}

/**
 * Build one phase's `PhaseRunOutputs` from its `/work` file map + the run spec (pure — the loop's prod `runPhase`
 * fills the map from the live `/work`, tests supply it directly). The final phase (last active phase / a pinned
 * `phase:N` finalize) also carries the delivery dossier.
 */
export function buildPhaseOutputs(files: ReadonlyMap<string, Uint8Array>, spec: HarnessRunSpec, seat: AgentTypeKey): PhaseRunOutputs {
  const phase = spec.request.phase;
  const agentResult = readJson<AgentResultFile>(files, AGENT_RESULT_FILENAME);
  const subtype: ResultSubtype = agentResult?.subtype ?? "error_during_execution";
  const usage: UsageSnapshot = agentResult?.usage ?? emptyUsage();
  const phaseResult = readJson<PhaseResultFile>(files, PHASE_RESULT_PATH);

  const diff = harvest({ seat, manifest: spec.manifest, files: harvestFiles(files, spec.manifest, primaryRoot(seat)) });
  const versions: NewVersion[] = [...diff.newVersions];
  const facts = factsForPhase(files, phase);
  const isFinal = spec.stopAfterPhase === true || phase.index === spec.request.of - 1;

  return {
    subtype,
    usage,
    phaseResult,
    versions,
    facts,
    // surface a thrown SDK/engine error the agent captured (D-P0.15e-4); the loop folds it into failStep.
    ...(agentResult?.error ? { agentError: agentResult.error } : {}),
    ...(isFinal ? { delivery: dossierForPhase(files, phase) } : {}),
  };
}

/**
 * Read a live `/work` directory tree into a `path → bytes` map keyed relative to `root` (deploy glue — the pure
 * `buildPhaseOutputs` above does the reasoning). The harness runs this after the agent exits; the manifest /
 * cwd path convention is reconciled against real output in the live re-run (Stage B).
 */
export async function readWorkDir(root: string): Promise<Map<string, Uint8Array>> {
  const { readdir, readFile } = await import("node:fs/promises");
  const nodePath = await import("node:path");
  const out = new Map<string, Uint8Array>();
  async function walk(dir: string): Promise<void> {
    let entries: import("node:fs").Dirent[];
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return; // a missing subtree is simply empty (a phase may not have produced everything)
    }
    for (const e of entries) {
      const abs = nodePath.join(dir, e.name);
      if (e.isDirectory()) await walk(abs);
      else if (e.isFile()) {
        const rel = nodePath.relative(root, abs).split(nodePath.sep).join("/");
        out.set(rel, await readFile(abs));
      }
    }
  }
  await walk(root);
  return out;
}
