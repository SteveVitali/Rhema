// @rhema/run-task — the harness /work materializer (D-P0.09-1; §11.5/§12.6). The SERVER generates the hydration
// manifest (packages/mirror materializeSeat → run_mounts); the HARNESS writes /work from it: it fetches each
// content-addressed version's bytes from GCS (the injected ContentStore) and writes each derived server file's
// bytes, then sets read-only paths mode 0444 so a `chmod +w`+edit is caught (harvest's hash check fails it even
// before the kernel ro-mount). The image then ro-mounts the read paths at the kernel (entrypoint / scoped-runner,
// CAP_SYS_ADMIN) and scopes the input-subagent namespaces. This module is the pure filesystem projection — the
// ContentStore + fs are injected, so it is unit-tested with an in-memory store + fs.

import type { ContentStore, MirrorManifest, MirrorManifestEntry } from "@rhema/mirror";
import type { MountRoot } from "@rhema/hooks";

/** The minimal filesystem surface the materializer needs (node fs binds it live; a fake backs the tests). */
export interface WorkFs {
  /** Create a directory and any missing parents (like `mkdir -p`). */
  mkdirp(dir: string): Promise<void>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  /** Set the file mode (0o444 read-only, 0o644 writable). */
  chmod(path: string, mode: number): Promise<void>;
  /** true if a path already exists (used to skip re-writing an immutable, already-ro-mounted read-only entry). */
  exists(path: string): Promise<boolean>;
  /** Remove a file if present (used to replace a prior-phase agent-created file the harness cannot chmod). */
  rm(path: string): Promise<void>;
}

export interface MaterializeWorkArgs {
  /**
   * The `/work` base directory for each mount root: a `project`-root entry is written under `roots.project`
   * (e.g. `/work/project/drafts/v1.md`), a `persona`-root entry under `roots.persona`
   * (e.g. `/work/personas/<id>/PERSONA.md`). These MUST be the SAME roots the §12.6 hook compiles against
   * (`@rhema/hooks` `resolveSeatRoots`) and the SDK's cwd (`request.cwd` = `roots.project`) — otherwise the
   * agent's read of `/work/drafts/v1.md` would fall OUTSIDE `/work/project` and the hook would DENY it
   * (`boundary.attested violations ≠ 0`), and the CLI cwd would not exist (F3). The manifest entry's `path`
   * is relative to its root and carries no root prefix (the seed's `mirror_path` is `drafts/v1.md`).
   */
  readonly roots: { readonly project: string; readonly persona: string };
  readonly manifest: MirrorManifest;
  /** content-addressed bytes for artifact-version entries (GCS in prod). */
  readonly contentStore: ContentStore;
  /** derived server-file bytes by path (manifest.md, obligations.json, …) — entries with no artifactVersionId. */
  readonly serverFiles?: ReadonlyMap<string, Uint8Array>;
  readonly fs: WorkFs;
}

export const READ_ONLY_MODE = 0o444;
export const READWRITE_MODE = 0o644;

export interface MaterializeWorkResult {
  /** absolute paths written, in manifest order. */
  readonly written: readonly string[];
  /** the read-only paths (the caller ro-mounts these at the kernel). */
  readonly readOnlyPaths: readonly string[];
}

/** Join a mount-root base with a manifest path, keeping it inside the mount (no `..` escape). */
export function workPath(base: string, entryPath: string): string {
  const clean = entryPath.replace(/^\/+/, "");
  if (clean.split("/").includes("..")) throw new Error(`materialize: unsafe manifest path '${entryPath}'`);
  return `${base.replace(/\/$/, "")}/${clean}`;
}

/** The `/work` base for one manifest entry's mount root. */
function baseForRoot(root: MountRoot, roots: MaterializeWorkArgs["roots"]): string {
  return root === "persona" ? roots.persona : roots.project;
}

function parentDir(path: string): string {
  const i = path.lastIndexOf("/");
  return i <= 0 ? "/" : path.slice(0, i);
}

/** Resolve one entry's bytes: content-addressed (ContentStore) for a version, else the derived server file. */
async function bytesForEntry(entry: MirrorManifestEntry, args: MaterializeWorkArgs): Promise<Uint8Array> {
  if (entry.artifactVersionId) {
    const bytes = await args.contentStore.get(entry.sha256);
    if (!bytes) throw new Error(`materialize: missing content ${entry.sha256} for '${entry.path}' (dangling manifest entry)`);
    return bytes;
  }
  const derived = args.serverFiles?.get(entry.path);
  if (!derived) throw new Error(`materialize: no server-file bytes for derived entry '${entry.path}'`);
  return derived;
}

/**
 * Write /work from the hydration manifest. Read-only entries (`mode: "read"`) are chmod 0444 so a write is
 * refused (belt to the kernel ro-mount + harvest's hash check); readwrite entries are 0644. Returns the written
 * paths and the read-only subset (which the image ro-mounts at the kernel).
 */
export async function materializeWork(args: MaterializeWorkArgs): Promise<MaterializeWorkResult> {
  const written: string[] = [];
  const readOnlyPaths: string[] = [];
  for (const entry of args.manifest.entries) {
    const abs = workPath(baseForRoot(entry.root, args.roots), entry.path);
    const readOnly = entry.mode === "read";
    // Idempotent re-materialization on a guided retry (same pod): a read-only entry from the first attempt is
    // already written AND kernel ro-mounted (the entrypoint ro-mounts the read paths, CAP_SYS_ADMIN). Its
    // content is immutable (content-addressed), so re-writing it is both unnecessary and IMPOSSIBLE — chmod +w
    // and writeFile fail EACCES/EROFS against the ro-mount (the live P0.15h crash re-writing /work/project/
    // manifest.md on the craft retry). Skip an already-materialized read-only entry entirely.
    if (readOnly && (await args.fs.exists(abs))) {
      written.push(abs);
      readOnlyPaths.push(abs);
      continue;
    }
    const bytes = await bytesForEntry(entry, args);
    await args.fs.mkdirp(parentDir(abs));
    // A readwrite entry may already exist from a PRIOR phase in the same pod, created by the AGENT (uid 10002)
    // and therefore not chmod-able or overwritable by the harness (uid 10001) — the live P0.15h crash advancing
    // craft→verification: `EACCES open agents/editor/04-craft-notes.md`. The seat namespace dir is world-writable
    // (harness-main makeTreeAgentWritable), so UNLINK the stale file first (needs only dir-write, not file
    // ownership), then write the server-truth bytes fresh (harness-owned). rm is a no-op when absent.
    await args.fs.rm(abs);
    await args.fs.writeFile(abs, bytes);
    await args.fs.chmod(abs, readOnly ? READ_ONLY_MODE : READWRITE_MODE);
    written.push(abs);
    if (readOnly) readOnlyPaths.push(abs);
  }
  return { written, readOnlyPaths };
}

/** The node fs binding for `WorkFs` (lazy import so the module stays load-light in the hook subprocess). */
export const nodeWorkFs: WorkFs = {
  async mkdirp(dir) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
  },
  async writeFile(path, bytes) {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(path, bytes);
  },
  async chmod(path, mode) {
    const { chmod } = await import("node:fs/promises");
    await chmod(path, mode);
  },
  async exists(path) {
    const { access } = await import("node:fs/promises");
    return access(path).then(() => true).catch(() => false);
  },
  async rm(path) {
    const { rm } = await import("node:fs/promises");
    await rm(path, { force: true }).catch(() => undefined);
  },
};
