// Harvest the seat's writable namespaces back into content-addressed versions (REQ-DATA-6; §12.2 commit
// step 2). After each phase the harvester walks the tree, hashes every file, and diffs it against the
// hydration manifest:
//   1. read-only-file HASH CHECK — a read-only ARTIFACT whose bytes changed fails the step (a `chmod +w` from
//      the model's own uid is no longer a bypass — review 13 F14 / AC4).
//   2. write-back diff filtered by the seat's WRITE ALLOWLIST — out-of-allowlist writes and writes to an
//      IMMUTABLE artifact are dropped and counted as `boundary.violation`; >5 violations, or any immutable-
//      artifact write, quarantines the run's artifacts (§12.4 boundary class / AC5).
//   3. every changed/new writable file is versioned by the path→kind map (identical files are NOT versioned —
//      the round-trip golden, REQ-DATA-9a); an unknown path inside a writable namespace fails the step.
// The diff is PURE (no writes); `persistHarvest` performs the content-addressed upload + row inserts.

import type { AgentTypeKey } from "@rhema/contracts";
import { pathToKind, pathToNamespace } from "@rhema/protocols";
import type { MountRoot } from "@rhema/hooks";
import { sha256Hex } from "./content-store.js";
import { manifestByPath, type MirrorManifest } from "./manifest.js";
import { isWritable } from "./mounts.js";

/** A file present in the mirror after the phase (bytes from `/work` in prod; supplied directly in tests). */
export interface HarvestFile {
  readonly path: string;
  readonly root: MountRoot;
  readonly bytes: Uint8Array;
  /** the scoped query that produced it (REQ-DATA-6); recorded on the new version. */
  readonly producerQueryId?: string;
}

/** A changed/new writable file to version (content-addressed). */
export interface NewVersion {
  readonly path: string;
  readonly root: MountRoot;
  readonly kind: string;
  readonly namespace: string;
  readonly sha256: string;
  readonly bytes: Uint8Array;
  readonly wordCount: number;
  readonly producerQueryId?: string;
}

/** A dropped write, counted as `boundary.violation` (§12.2). */
export interface BoundaryViolation {
  readonly path: string;
  readonly reason: "out_of_allowlist" | "immutable";
}

export interface HarvestResult {
  readonly newVersions: readonly NewVersion[];
  readonly unchanged: readonly string[];
  /** read-only ARTIFACT files whose bytes no longer match the manifest — the step must FAIL (AC4). */
  readonly readOnlyHashMismatch: readonly string[];
  /** writable files whose path has no ArtifactKind — the step must FAIL ("default by directory or fail"). */
  readonly unknownPaths: readonly string[];
  readonly boundaryViolations: readonly BoundaryViolation[];
  /** >5 violations OR any write to an immutable artifact quarantines the run's artifacts (§12.4). */
  readonly quarantine: boolean;
  /** the step fails when a read-only file was tampered with or a writable path could not be classified. */
  readonly stepFailed: boolean;
}

/** >5 boundary violations, or any immutable-artifact write, quarantines the run's artifacts (§12.4). */
export const BOUNDARY_QUARANTINE_THRESHOLD = 5;

export interface HarvestArgs {
  readonly seat: AgentTypeKey;
  readonly manifest: MirrorManifest;
  readonly files: readonly HarvestFile[];
  /**
   * PRB.19 (F26b) — the run's DECLARED phase-output paths (`spec.writablePaths`, from
   * `declaredWritableArtifacts`): a NEW file at a granted path is harvested even though its §12.6 seat mount
   * is `read` — `drafts/v(N+1).md` + `correspondence/vN-response.md` are the revise run's own deliverables, not
   * boundary violations. (A committed artifact at a granted path already mounts `readwrite` via the manifest.)
   */
  readonly writablePaths?: readonly string[];
}

/** Skip the regenerated-from-tables files: they are never harvested (they carry no `artifactVersionId`). */
function isDerived(path: string): boolean {
  return path === "manifest.md" || path.startsWith(".rhema/");
}

function wordCount(bytes: Uint8Array): number {
  const text = Buffer.from(bytes).toString("utf8").trim();
  return text ? text.split(/\s+/).length : 0;
}

/** Compute the write-back diff (pure). The caller fails the step on `stepFailed`, else persists `newVersions`. */
export function harvest(args: HarvestArgs): HarvestResult {
  const baseline = manifestByPath(args.manifest);
  const writableSet = new Set(args.writablePaths ?? []);
  const newVersions: NewVersion[] = [];
  const unchanged: string[] = [];
  const readOnlyHashMismatch: string[] = [];
  const unknownPaths: string[] = [];
  const violations: BoundaryViolation[] = [];

  for (const f of args.files) {
    if (isDerived(f.path)) continue;
    const sha = sha256Hex(f.bytes);
    const prior = baseline.get(f.path);

    if (prior && prior.artifactVersionId) {
      // an existing artifact file.
      if (prior.mode === "read") {
        if (sha !== prior.sha256) readOnlyHashMismatch.push(f.path); // F14: read-only tamper fails the step.
        else unchanged.push(f.path);
        continue;
      }
      // a writable-namespace artifact.
      if (prior.immutable) {
        violations.push({ path: f.path, reason: "immutable" }); // delivered artifacts are refused at commit.
        continue;
      }
      if (sha === prior.sha256) {
        unchanged.push(f.path); // identical — never versioned (REQ-DATA-6).
        continue;
      }
      pushVersion(newVersions, unknownPaths, f, sha);
      continue;
    }

    // a NEW file (no manifest entry).
    if (isWritable(args.seat, f.root, f.path) || (f.root === "project" && writableSet.has(f.path))) {
      pushVersion(newVersions, unknownPaths, f, sha);
    } else {
      violations.push({ path: f.path, reason: "out_of_allowlist" }); // dropped (mount is read-only + hook denies).
    }
  }

  const quarantine =
    violations.length > BOUNDARY_QUARANTINE_THRESHOLD || violations.some((v) => v.reason === "immutable");
  const stepFailed = readOnlyHashMismatch.length > 0 || unknownPaths.length > 0;

  return { newVersions, unchanged, readOnlyHashMismatch, unknownPaths, boundaryViolations: violations, quarantine, stepFailed };
}

function pushVersion(out: NewVersion[], unknown: string[], f: HarvestFile, sha: string): void {
  const kind = pathToKind(f.path);
  if (!kind) {
    unknown.push(f.path); // unknown path inside a writable namespace — fail the step (the conservative branch).
    return;
  }
  out.push({
    path: f.path,
    root: f.root,
    kind,
    namespace: pathToNamespace(f.path),
    sha256: sha,
    bytes: f.bytes,
    wordCount: wordCount(f.bytes),
    ...(f.producerQueryId !== undefined ? { producerQueryId: f.producerQueryId } : {}),
  });
}
