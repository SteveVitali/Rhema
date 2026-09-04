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

/** Parse a JSON file from the map, or null when absent/unparseable. */
function readJson<T>(files: ReadonlyMap<string, Uint8Array>, path: string): T | null {
  const bytes = files.get(path);
  if (!bytes) return null;
  try {
    return JSON.parse(Buffer.from(bytes).toString("utf8")) as T;
  } catch {
    return null;
  }
}

function textOf(files: ReadonlyMap<string, Uint8Array>, path: string): string | null {
  const bytes = files.get(path);
  return bytes ? Buffer.from(bytes).toString("utf8") : null;
}

/** true when a sidecar file validates against its registered schema. */
function sidecarValidates(files: ReadonlyMap<string, Uint8Array>, filename: string): boolean {
  const entry = (SIDECAR_REGISTRY as Record<string, { schema: { safeParse(v: unknown): { success: boolean } } }>)[filename];
  const json = readJson<unknown>(files, filename);
  if (!entry || json == null) return false;
  return entry.schema.safeParse(json).success;
}

/** Build the `HarvestFile[]` for the write-back diff: every non-derived `/work` file with its mount root. */
function harvestFiles(files: ReadonlyMap<string, Uint8Array>, manifest: MirrorManifest, defaultRoot: MountRoot): HarvestFile[] {
  const byPath = manifestByPath(manifest);
  const out: HarvestFile[] = [];
  for (const [path, bytes] of files) {
    if (path === "manifest.md" || path.startsWith(".rhema/")) continue; // derived — never harvested
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
        present[p.artifact] = files.has(p.artifact);
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
