// Materialize the per-seat mirror (REQ-DATA-5; §11.5). A function of `(project_id, seat, persona_profile_id,
// run inputs, hydration.overlays[])` → a tree, with a `.rhema/manifest.json` listing every mounted path with
// its `artifact_version_id` + `sha256`. Materialization happens before step 1 and at every RESUME, never
// mid-phase (so a concurrent human edit can never change what a running phase sees), and at resume the tree is
// the committed artifacts PLUS the gate-derived overlays (REQ-SPEC-9). Per-seat it mounts EXACTLY the §12.6
// tables (mounts.ts reuses @rhema/hooks' SEAT_MOUNTS), so the Editor tree structurally omits `agents/author/**`,
// `preferences.md`, and voice-print/lexicon/exemplars. `manifest.md` is regenerated from tables (REQ-VIS-6).

import type { AgentTypeKey } from "@rhema/contracts";
import { pathToKind, pathToNamespace } from "@rhema/protocols";
import { enumerateScopedFiles, type ScopedInputs, type ScopedRole } from "@rhema/engine";
import type { MountRoot } from "@rhema/hooks";
import { sha256Hex, type ContentStore } from "./content-store.js";
import { mountFor } from "./mounts.js";
import { renderManifestMd, type MirrorManifest, type MirrorManifestEntry } from "./manifest.js";
import type { SqlExecutor } from "./sql.js";

/** A gate-derived overlay (REQ-SPEC-9): a version id whose file replaces the committed one at resume. */
export interface Overlay {
  readonly artifactVersionId: string;
}

/**
 * A SERVER-GENERATED read-only mount file that is NOT an artifact version — the projection of live rows into a
 * seat's context, like the derived `manifest.md`. The caller is responsible for supplying it only to the seat
 * and context it belongs in (it bypasses the §12.6 allowlist because it is not an artifact path). The re-review
 * `obligations.json` is the v0.3 case (letter-writing context only — REQ-OBJ-4/8; P0.12 builds the bytes); a
 * server file is `derived`, so `materializeScoped` never hands it to an input-scoped independence subagent.
 */
export interface ServerFile {
  readonly path: string;
  readonly root: MountRoot;
  readonly bytes: Uint8Array;
  readonly kind?: MirrorManifestEntry["kind"];
  readonly namespace?: string;
}

export interface MaterializeArgs {
  readonly seat: AgentTypeKey;
  readonly projectId?: string | null;
  readonly personaId?: string | null;
  /** gate-derived overlays applied over the committed tree at resume (REQ-SPEC-9); [] on the first attempt. */
  readonly overlays?: readonly Overlay[];
  /** server-generated read-only mount files (e.g. the re-review `obligations.json` — REQ-OBJ-8); [] normally. */
  readonly serverFiles?: readonly ServerFile[];
}

/** One materialized file in the mirror tree (bytes + its manifest entry). */
export interface MirrorFile {
  readonly path: string;
  readonly root: MountRoot;
  readonly bytes: Uint8Array;
  readonly sha256: string;
  readonly artifactVersionId: string | null;
  readonly mode: "read" | "readwrite";
  readonly kind: MirrorManifestEntry["kind"];
  readonly namespace: string;
  readonly immutable: boolean;
  /** true for regenerated-from-tables files (manifest.md, .rhema/manifest.json) — never a harvested artifact. */
  readonly derived: boolean;
}

export interface MirrorTree {
  readonly seat: AgentTypeKey;
  readonly files: readonly MirrorFile[];
  readonly manifest: MirrorManifest;
  /** the rendered `manifest.md` (REQ-VIS-6). */
  readonly manifestMd: string;
}

interface HeadRow {
  artifact_id: string;
  kind: string;
  mirror_path: string;
  version_id: string;
  content_sha256: string;
  immutable: boolean;
}

/** Read each artifact's HEAD version (its `head_version_id`, else the greatest ordinal) under one root. */
async function readHeads(exec: SqlExecutor, column: "project_id" | "persona_id", id: string): Promise<HeadRow[]> {
  const res = await exec.query(
    `select distinct on (a.id) a.id as artifact_id, a.kind, a.mirror_path,
            av.id as version_id, av.content_sha256, av.immutable
       from artifacts a
       join artifact_versions av on av.artifact_id = a.id
      where a.${column} = $1
        and (a.head_version_id is null or av.id = a.head_version_id)
      order by a.id, av.ordinal desc`,
    [id],
  );
  return res.rows as HeadRow[];
}

/** Resolve overlay version ids → their artifact path + sha (they override the committed file at that path). */
async function readOverlays(exec: SqlExecutor, overlays: readonly Overlay[]): Promise<Map<string, { path: string; root: MountRoot; sha256: string; versionId: string; kind: string }>> {
  const out = new Map<string, { path: string; root: MountRoot; sha256: string; versionId: string; kind: string }>();
  for (const o of overlays) {
    const res = await exec.query(
      `select a.mirror_path, a.kind, a.project_id, a.persona_id, av.content_sha256, av.id as version_id
         from artifact_versions av join artifacts a on a.id = av.artifact_id
        where av.id = $1`,
      [o.artifactVersionId],
    );
    const row = res.rows[0] as
      | { mirror_path: string; kind: string; project_id: string | null; persona_id: string | null; content_sha256: string; version_id: string }
      | undefined;
    if (!row) throw new Error(`overlay artifact_version ${o.artifactVersionId} not found`);
    const root: MountRoot = row.project_id ? "project" : "persona";
    out.set(row.mirror_path, { path: row.mirror_path, root, sha256: row.content_sha256, versionId: row.version_id, kind: row.kind });
  }
  return out;
}

async function fileFor(
  store: ContentStore,
  root: MountRoot,
  path: string,
  sha256: string,
  versionId: string,
  mode: "read" | "readwrite",
  immutable: boolean,
): Promise<MirrorFile> {
  const bytes = await store.get(sha256);
  if (!bytes) throw new Error(`content ${sha256} for ${path} missing from the store (dangling manifest)`);
  return {
    path,
    root,
    bytes,
    sha256,
    artifactVersionId: versionId,
    mode,
    kind: pathToKind(path),
    namespace: pathToNamespace(path),
    immutable,
    derived: false,
  };
}

/** An artifact-backed mounted file, resolved to its version + sha but WITHOUT its bytes (the manifest half). */
interface BackedEntry {
  readonly path: string;
  readonly root: MountRoot;
  readonly sha256: string;
  readonly versionId: string;
  readonly mode: "read" | "readwrite";
  readonly immutable: boolean;
}

/**
 * Build the seat's hydration manifest from committed artifacts (+ overlays) WITHOUT reading bytes — the
 * server-generated signed contract the boundary attestation rests on (REQ-DATA-19/20; §12.6). The orchestrator
 * persists this at hydrate (`recordMounts`); the harness fetches bytes per entry to write `/work`. Includes the
 * derived `manifest.md` entry (REQ-VIS-6). This is the authority for "which paths were mounted for which seat".
 */
export async function buildSeatManifest(exec: SqlExecutor, args: MaterializeArgs): Promise<MirrorManifest> {
  const { manifest } = await resolveSeatTree(exec, args);
  return manifest;
}

/** Resolve the mounted (artifact-backed) entries + the assembled manifest — the shared core of manifest + tree. */
async function resolveSeatTree(exec: SqlExecutor, args: MaterializeArgs): Promise<{ backed: BackedEntry[]; manifest: MirrorManifest }> {
  const overlayByPath = await readOverlays(exec, args.overlays ?? []);
  const backed: BackedEntry[] = [];
  const seen = new Set<string>();

  const consider = (root: MountRoot, path: string, sha256: string, versionId: string, immutable: boolean): void => {
    if (seen.has(path)) return;
    const mount = mountFor(args.seat, root, path);
    if (!mount) return; // not in this seat's allowlist — structurally absent (Editor↔Drafter wall etc.)
    // an overlay for this path overrides the committed version (REQ-SPEC-9); an overlay is user-authored and mutable.
    const overlay = overlayByPath.get(path);
    const eff = overlay && overlay.root === root ? { ...overlay, immutable: false } : { sha256, versionId, immutable };
    backed.push({ path, root, sha256: eff.sha256, versionId: eff.versionId, mode: mount.mode, immutable: eff.immutable });
    seen.add(path);
  };

  if (args.projectId) {
    for (const r of await readHeads(exec, "project_id", args.projectId)) {
      consider("project", r.mirror_path, r.content_sha256, r.version_id, r.immutable);
    }
  }
  if (args.personaId) {
    for (const r of await readHeads(exec, "persona_id", args.personaId)) {
      consider("persona", r.mirror_path, r.content_sha256, r.version_id, r.immutable);
    }
  }
  for (const [path, o] of overlayByPath) consider(o.root, path, o.sha256, o.versionId, false);

  backed.sort((a, b) => a.path.localeCompare(b.path)); // deterministic tree + manifest for the goldens.

  const artifactEntries: MirrorManifestEntry[] = backed.map((b) => ({
    path: b.path,
    root: b.root,
    artifactVersionId: b.versionId,
    sha256: b.sha256,
    mode: b.mode,
    kind: pathToKind(b.path),
    namespace: pathToNamespace(b.path),
    immutable: b.immutable,
  }));

  // server-generated read-only files (e.g. the re-review obligations.json — REQ-OBJ-8): derived manifest
  // entries, so they are attested like every other mount but are never artifact-backed.
  const serverEntries: MirrorManifestEntry[] = (args.serverFiles ?? []).map((s) => ({
    path: s.path,
    root: s.root,
    artifactVersionId: null,
    sha256: sha256Hex(Buffer.from(s.bytes)),
    mode: "read",
    kind: s.kind ?? null,
    namespace: s.namespace ?? "shared",
    immutable: false,
  }));

  // manifest.md — regenerated from tables (REQ-VIS-6), a derived read-only file whose entry heads the manifest.
  const manifestMd = renderManifestMd({ seat: args.seat, entries: artifactEntries });
  const derivedManifestEntry: MirrorManifestEntry = {
    path: "manifest.md",
    root: "project",
    artifactVersionId: null,
    sha256: sha256Hex(Buffer.from(manifestMd, "utf8")),
    mode: "read",
    kind: null,
    namespace: "shared",
    immutable: false,
  };
  return { backed, manifest: { seat: args.seat, entries: [derivedManifestEntry, ...serverEntries, ...artifactEntries] } };
}

/**
 * Materialize the seat's mirror tree from committed artifacts (+ overlays). Returns every mounted file with its
 * bytes and the signed manifest; the caller (harness in prod, the test here) writes the tree to `/work` and,
 * after the phase, calls `harvest` with the manifest as the baseline.
 */
export async function materializeSeat(exec: SqlExecutor, store: ContentStore, args: MaterializeArgs): Promise<MirrorTree> {
  const { backed, manifest } = await resolveSeatTree(exec, args);

  const files: MirrorFile[] = [];
  const manifestMd = renderManifestMd({ seat: args.seat, entries: manifest.entries.filter((e) => e.artifactVersionId) });
  const manifestMdBytes = Buffer.from(manifestMd, "utf8");
  files.push({ path: "manifest.md", root: "project", bytes: manifestMdBytes, sha256: sha256Hex(manifestMdBytes), artifactVersionId: null, mode: "read", kind: null, namespace: "shared", immutable: false, derived: true });

  // server-generated read-only files (derived; excluded from input-scoped subagents by materializeScoped).
  for (const s of args.serverFiles ?? []) {
    files.push({
      path: s.path,
      root: s.root,
      bytes: s.bytes,
      sha256: sha256Hex(Buffer.from(s.bytes)),
      artifactVersionId: null,
      mode: "read",
      kind: s.kind ?? null,
      namespace: s.namespace ?? "shared",
      immutable: false,
      derived: true,
    });
  }

  for (const b of backed) {
    files.push(await fileFor(store, b.root, b.path, b.sha256, b.versionId, b.mode, b.immutable));
  }

  // `.rhema/manifest.json` — the signed contract itself (not an entry in the manifest: it IS the manifest).
  const manifestJson = Buffer.from(JSON.stringify(manifest), "utf8");
  files.push({ path: ".rhema/manifest.json", root: "project", bytes: manifestJson, sha256: sha256Hex(manifestJson), artifactVersionId: null, mode: "read", kind: "sidecar", namespace: "project", immutable: false, derived: true });

  return { seat: args.seat, files, manifest, manifestMd };
}

/**
 * The exact files an input-scoped subagent receives (REQ-DATA-17/18; §12.6), derived from a materialized seat
 * tree. Isolation is enforced at the kernel by run-task (P0.06 scoped-subagent.ts); this is the data half —
 * the ORCHESTRATOR enumerates the files, never the parent model. `second-reader → [draft]` is the load-bearing
 * case (AC2): the second read receives only the draft. Absent inputs are dropped. Reuses @rhema/engine's
 * `enumerateScopedFiles` so the mirror and the launch spec agree on exactly one enumeration.
 */
export function materializeScoped(tree: MirrorTree, role: ScopedRole, root = "/work/project"): string[] {
  const abs = (path: string): string => `${root.replace(/\/$/, "")}/${path}`;
  const byKind = (kind: string): string | undefined => {
    const f = tree.files.find((x) => !x.derived && x.kind === kind);
    return f ? abs(f.path) : undefined;
  };
  const inputs: ScopedInputs = {
    draft: byKind("draft"),
    commissioningBrief: byKind("commissioning_brief"),
    structurePlan: byKind("structure_plan"),
    claimLedger: byKind("claim_ledger"),
    voiceBrief: byKind("voice_brief"),
    outline: byKind("outline"),
    profileFiles: tree.files.filter((f) => !f.derived && f.namespace.startsWith("persona")).map((f) => abs(f.path)),
  };
  return enumerateScopedFiles(role, inputs);
}
