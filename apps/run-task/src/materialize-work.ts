// @rhema/run-task — the harness /work materializer (D-P0.09-1; §11.5/§12.6). The SERVER generates the hydration
// manifest (packages/mirror materializeSeat → run_mounts); the HARNESS writes /work from it: it fetches each
// content-addressed version's bytes from GCS (the injected ContentStore) and writes each derived server file's
// bytes, then sets read-only paths mode 0444 so a `chmod +w`+edit is caught (harvest's hash check fails it even
// before the kernel ro-mount). The image then ro-mounts the read paths at the kernel (entrypoint / scoped-runner,
// CAP_SYS_ADMIN) and scopes the input-subagent namespaces. This module is the pure filesystem projection — the
// ContentStore + fs are injected, so it is unit-tested with an in-memory store + fs.

import type { ContentStore, MirrorManifest, MirrorManifestEntry } from "@rhema/mirror";

/** The minimal filesystem surface the materializer needs (node fs binds it live; a fake backs the tests). */
export interface WorkFs {
  /** Create a directory and any missing parents (like `mkdir -p`). */
  mkdirp(dir: string): Promise<void>;
  writeFile(path: string, bytes: Uint8Array): Promise<void>;
  /** Set the file mode (0o444 read-only, 0o644 writable). */
  chmod(path: string, mode: number): Promise<void>;
}

export interface MaterializeWorkArgs {
  /** the writable-mount root the seat runs in (e.g. /work). */
  readonly workDir: string;
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

/** Join the work dir with a manifest path, keeping it inside the mount (no `..` escape). */
export function workPath(workDir: string, entryPath: string): string {
  const clean = entryPath.replace(/^\/+/, "");
  if (clean.split("/").includes("..")) throw new Error(`materialize: unsafe manifest path '${entryPath}'`);
  return `${workDir.replace(/\/$/, "")}/${clean}`;
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
    const abs = workPath(args.workDir, entry.path);
    const bytes = await bytesForEntry(entry, args);
    await args.fs.mkdirp(parentDir(abs));
    await args.fs.writeFile(abs, bytes);
    const readOnly = entry.mode === "read";
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
};
