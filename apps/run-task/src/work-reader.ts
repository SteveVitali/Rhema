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
import { pathToNamespace } from "@rhema/protocols";
import { harvest, manifestByPath, sha256Hex, type HarvestFile, type MirrorManifest, type NewVersion, type SidecarInput } from "@rhema/mirror";
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
  // draft-version TEMPLATES (PRB.16b F15): manifest predicates name `vN` / `v(N+1)` placeholders
  // (`agents/author/ledgers/vN-response-ledger.md`, `drafts/v(N+1).md`) while the agent writes the
  // concrete ordinal (`v1-response-ledger.md`, `v2.md`) — an exact/basename match never resolves, so
  // every template-bearing predicate read as missing. Compile the target into a `v\d+` regex.
  const tpl = versionTemplateRegex(target);
  if (tpl) {
    const byTpl = [...files.keys()].filter((k) => tpl.test(k)).sort((a, b) => a.length - b.length)[0];
    if (byTpl) return byTpl;
  }
  const base = target.slice(target.lastIndexOf("/") + 1);
  const byBase = [...files.keys()].filter((k) => k.slice(k.lastIndexOf("/") + 1) === base).sort((a, b) => a.length - b.length)[0];
  if (byBase) return byBase;
  // produced-VERSION basename (PRB.16b F24, live): the agent may write the sidecar/artifact at its
  // versioned twin path directly — `agents/author/ledgers/v1-response-ledger.json` for the declared
  // `response-ledger.json` — skipping `.rhema/` entirely. Exact/suffix/template/basename all miss on
  // the `v1-` prefix, so the oracle read a valid ledger as "missing or unparseable JSON" and failed
  // `sidecar_validates` + `response_ledger_one_row_per_finding` on BOTH triage sub-runs of live run
  // 01M2T6D3B32AVXHCQH73ZGJGBD. A literal basename match still wins — this is the last resort.
  const byVersionedBase = [...files.keys()]
    .filter((k) => {
      const b = k.slice(k.lastIndexOf("/") + 1);
      return /^v\d+-/.test(b) && b.replace(/^v\d+-/, "") === base;
    })
    .sort((a, b) => a.length - b.length)[0];
  return byVersionedBase ?? target;
}

/**
 * Resolve a manifest target (`vN` templates allowed) against a set of PRODUCED paths — the same
 * suffix/template/basename cascade as `resolveKey`, for callers that hold a `byPath` map rather than
 * the `/work` file map (PRB.16b F19: binding the produced version a `gateAfter` gate must carry).
 * Returns undefined when no produced path matches.
 */
export function resolveProducedPath(paths: readonly string[], target: string): string | undefined {
  const set = new Set(paths);
  const k = resolveKey(set as unknown as ReadonlyMap<string, Uint8Array>, target);
  return set.has(k) ? k : undefined;
}

/** true when a manifest target carries a draft-version placeholder (`vN`, `v(N+1)`, `(N+1)`). */
const VERSION_PLACEHOLDER = /v\(N\+1\)|vN|\(N\+1\)/;

/**
 * Compile a version-template target (`drafts/v(N+1).md`) into a path-suffix regex
 * (`(^|/)drafts/v\d+\.md$`) — matching the suffix-resolution convention above (the artifact may sit
 * under a seat/output_dir subtree, so the pattern anchors at a path boundary, never mid-segment).
 */
function versionTemplateRegex(target: string): RegExp | null {
  if (!VERSION_PLACEHOLDER.test(target)) return null;
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = escaped
    .split("v\\(N\\+1\\)").join("v\\d+")
    .split("vN").join("v\\d+")
    .split("\\(N\\+1\\)").join("\\d+");
  return new RegExp(`(^|/)${pattern}$`);
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

/**
 * A compact one-line summary of why a sidecar failed schema validation (`path: message; …`, ≤3 issues,
 * bounded) — the text that rides `PredicateFacts.sidecarIssues` into the predicate detail, the failStep
 * reason, and the guided-retry prompt, so the NEXT attempt sees the exact contract violation (PRB.16b
 * F15). Kept short: it lands in a prompt line and an event payload.
 */
function summarizeIssues(issues: readonly { path?: PropertyKey[]; message?: string }[]): string {
  return issues
    .slice(0, 3)
    .map((i) => `${(i.path ?? []).map(String).join(".") || "(root)"}: ${i.message ?? "invalid"}`)
    .join("; ")
    .slice(0, 300);
}

/** Validate a sidecar file against its registered schema; returns `{ok, issue?}` (issue names WHY). */
function validateSidecar(
  files: ReadonlyMap<string, Uint8Array>,
  filename: string,
): { readonly ok: boolean; readonly issue?: string } {
  type Parser = {
    safeParse(v: unknown):
      | { success: true }
      | { success: false; error: { issues: { path?: PropertyKey[]; message?: string }[] } };
  };
  const entry = (SIDECAR_REGISTRY as Record<string, { schema: Parser }>)[filename];
  const json = readJson<unknown>(files, filename);
  if (!entry) {
    console.log(`[sidecar] ${filename}: no registered schema`);
    return { ok: false, issue: "no registered schema" };
  }
  if (json == null) {
    console.log(`[sidecar] ${filename}: missing or unparseable JSON`);
    return { ok: false, issue: "missing or unparseable JSON" };
  }
  const res = entry.schema.safeParse(json);
  if (!res.success) {
    // Log WHY (the zod issues) + a content head, so a schema/skill drift is diagnosable from the pod log
    // instead of a bare `sidecarValidates:false` (P0.15h — the error was previously discarded).
    const issues = JSON.stringify(res.error?.issues ?? []).slice(0, 1500);
    const head = JSON.stringify(json).slice(0, 800);
    console.log(`[sidecar] ${filename}: INVALID issues=${issues} content-head=${head}`);
    return { ok: false, issue: summarizeIssues(res.error.issues) };
  }
  return { ok: true };
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
  const sidecarIssues: Record<string, string> = {};
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
      case "sidecar_validates": {
        const v = validateSidecar(files, p.sidecar);
        sidecarValid[p.sidecar] = v.ok;
        // carry WHY into the facts → the predicate detail → failStep reason + guided-retry text (F15).
        if (!v.ok && v.issue) sidecarIssues[p.sidecar] = v.issue;
        break;
      }
      case "response_ledger_one_row_per_finding":
        // PRB.16b F15 — this predicate was DECLARED (revise triage) but never COMPUTED: no fact
        // producer existed, so `responseLedgerRowPerFinding` was always absent → the predicate failed
        // on every attempt regardless of the agent's output (a guaranteed-incomplete oracle leg).
        facts.responseLedgerRowPerFinding = responseLedgerRowPerFinding(files, p.artifact);
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

  return { ...facts, present, nonempty, sidecarValidates: sidecarValid, sidecarIssues };
}

/**
 * `response_ledger_one_row_per_finding` (PRB.16b F15): every finding in the review's `findings.json`
 * has ≥1 response-ledger row. Rows are read from the structured sidecar's `entries` when it parses
 * (the machine-readable truth the delivery freezes); otherwise the markdown twin's `## Finding N`
 * rows stand in — the predicate's declared `artifact` is that twin (an invalid sidecar still fails
 * `sidecar_validates` independently, so the fallback cannot smuggle a green). `findings.json` absent
 * ⇒ the row set is unprovable ⇒ false. Extra rows (e.g. user-authored pre-triage dispositions on a
 * finding) are permitted — coverage, not exact count, is the contract (REQ-IDE-28).
 */
function responseLedgerRowPerFinding(
  files: ReadonlyMap<string, Uint8Array>,
  ledgerArtifact: string,
): boolean {
  const findings = readJson<{ findings?: { ordinal?: unknown }[] }>(files, "findings.json")?.findings;
  if (!Array.isArray(findings)) return false;
  const rowOrdinals = new Set<number>();
  const sidecar = readJson<{ entries?: { findingOrdinal?: unknown }[] }>(files, "response-ledger.json");
  if (Array.isArray(sidecar?.entries)) {
    for (const e of sidecar.entries) {
      if (typeof e.findingOrdinal === "number") rowOrdinals.add(e.findingOrdinal);
    }
  } else {
    const md = textOf(files, ledgerArtifact) ?? "";
    for (const m of md.matchAll(/^##\s+Finding\s+(\d+)/gm)) rowOrdinals.add(Number(m[1]));
  }
  return findings.every((f) => typeof f.ordinal === "number" && rowOrdinals.has(f.ordinal));
}

/** The dossier content for the final delivery — read the phase's declared sidecars + artifacts from `/work`. */
function dossierForPhase(files: ReadonlyMap<string, Uint8Array>, phase: PhaseManifest): WorkDeliveryContent {
  const sidecars: SidecarInput[] = [];
  for (const filename of phase.sidecars) {
    const json = readJson<unknown>(files, filename);
    if (json != null) sidecars.push({ filename: filename as SidecarFilename, json });
  }
  // the delivered dossier artifacts are the phase's declared markdown artifacts that were produced. The manifest
  // names them by BASENAME ("editors-letter.md") but the /work files map is keyed by the seat-rooted path
  // ("agents/editor/editors-letter.md"), so resolve each like the sidecar/ledger reads do — a raw `files.has`
  // matched nothing and the run finalized BARE (no delivery / no correspondence row), diagnosed live P0.15h.
  const deliveredPaths = phase.artifacts
    .filter((a) => a.endsWith(".md"))
    .map((a) => resolveKey(files, a))
    .filter((k) => files.has(k));
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
  // PRB.16b F20 — a declared sidecar the agent wrote under `.rhema/` is skipped by the mirror's
  // derived-file rule (root `.rhema/` is never harvested), so the structured rows the oracle just
  // validated never became a content-addressed artifact — and the gate card / write-back merge
  // (`loadLedgerEntries`' `<md> → <json>` twin lookup) read an EMPTY agent set (live: the
  // approve_triage overlay carried only the 4 user dispositions; the agent's ~15 proposals were
  // dropped from the materialized ledger). Persist each declared sidecar at its ledger-twin path —
  // `<resolved gateArtifact .md> → .json`, the same convention serializeGateOverlay writes — so the
  // agent's proposed rows survive into the merge. Skipped when the agent already wrote the twin.
  // resolveKey returns the target itself when nothing matched — `files.has` proves a real produced file,
  // so the twin never lands under an unresolved `vN` template path.
  const twinBase = phase.gateArtifact ? resolveKey(files, phase.gateArtifact) : undefined;
  if (twinBase?.endsWith(".md") && files.has(twinBase)) {
    const twinPath = twinBase.replace(/\.md$/, ".json");
    for (const filename of phase.sidecars) {
      if (files.has(twinPath) || versions.some((v) => v.path === twinPath)) break;
      const bytes = files.get(resolveKey(files, filename));
      if (!bytes) continue;
      versions.push({
        path: twinPath,
        root: primaryRoot(seat),
        kind: "sidecar",
        namespace: pathToNamespace(twinPath),
        sha256: sha256Hex(bytes),
        bytes,
        wordCount: 0,
      });
      break; // one twin per gate artifact — the first declared sidecar wins
    }
  }
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

/**
 * Read BOTH work roots into one path-keyed map (PRB.16b F22 — live). The harvest/judgement pass
 * historically walked only `roots.project` (`cwd`) — but a persona-builder run's CANONICAL outputs
 * (`profile/**`) live under `/work/personas/<id>/`, so an agent writing to the correct mount produced
 * zero harvestable output and failed `artifact_present` (live: Quick Voice 01M2T65W… attempt-1
 * exited `success` twice with `/work/project` holding only `manifest.md`). Persona-root files fill
 * keys the project walk did not produce — the PROJECT copy wins a collision, so a stale mounted
 * input (e.g. the seeded `profile/index.md` stub) can never shadow a fresh same-path agent write in
 * `cwd`. Mounted read-only inputs enter the map unchanged: identical bytes harvest to `unchanged`
 * and a tampered read-only artifact still trips `readOnlyHashMismatch` exactly as project files do.
 */
export async function readWorkRoots(
  projectDir: string,
  personaDir?: string,
): Promise<Map<string, Uint8Array>> {
  const files = await readWorkDir(projectDir);
  if (!personaDir || personaDir === projectDir) return files;
  for (const [path, bytes] of await readWorkDir(personaDir)) {
    if (!files.has(path)) files.set(path, bytes);
  }
  return files;
}
