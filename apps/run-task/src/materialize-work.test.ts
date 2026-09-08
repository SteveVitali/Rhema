import { describe, it, expect } from "vitest";
import { InMemoryContentStore, type MirrorManifest } from "@rhema/mirror";
import { compileSeatPolicy, evaluateToolUse, newDenialState } from "@rhema/hooks";
import {
  materializeWork,
  workPath,
  READ_ONLY_MODE,
  READWRITE_MODE,
  type WorkFs,
} from "./materialize-work.js";

// The roots the harness derives from `resolveSeatRoots` for a project seat (the review path). Materialize MUST
// write project entries here so they line up with the SDK cwd + the §12.6 hook (F3).
const ROOTS = { project: "/work/project", persona: "/work/personas/p1" } as const;

/** An in-memory WorkFs recording writes + modes + created dirs. It ENFORCES 0444 like the kernel: a writeFile
 *  onto a file last chmod'd read-only throws EACCES — so the idempotency guard (pre-write chmod) is exercised. */
class FakeWorkFs implements WorkFs {
  readonly files = new Map<string, Uint8Array>();
  readonly modes = new Map<string, number>();
  readonly dirs = new Set<string>();
  mkdirp(dir: string): Promise<void> {
    this.dirs.add(dir);
    return Promise.resolve();
  }
  writeFile(path: string, bytes: Uint8Array): Promise<void> {
    if (this.files.has(path) && this.modes.get(path) === READ_ONLY_MODE) {
      const err = new Error(`EACCES: permission denied, open '${path}'`);
      return Promise.reject(err);
    }
    this.files.set(path, bytes);
    return Promise.resolve();
  }
  chmod(path: string, mode: number): Promise<void> {
    // the node binding throws ENOENT chmod-ing an absent file; the fake mirrors that so the guard's catch runs.
    if (!this.files.has(path)) return Promise.reject(new Error(`ENOENT: no such file, chmod '${path}'`));
    this.modes.set(path, mode);
    return Promise.resolve();
  }
}

const entry = (over: Partial<MirrorManifest["entries"][number]>): MirrorManifest["entries"][number] => ({
  path: over.path ?? "draft.md",
  root: over.root ?? "project",
  // preserve an explicit null (a derived server file) — `??` would coerce it back to a version id.
  artifactVersionId: "artifactVersionId" in over ? (over.artifactVersionId ?? null) : "av_1",
  sha256: over.sha256 ?? "sha_x",
  mode: over.mode ?? "read",
  kind: over.kind ?? "draft",
  namespace: over.namespace ?? "shared",
  immutable: over.immutable ?? false,
});

describe("workPath", () => {
  it("joins inside the mount root and rejects a `..` escape", () => {
    expect(workPath("/work/project", "drafts/v1.md")).toBe("/work/project/drafts/v1.md");
    expect(() => workPath("/work/project", "../etc/passwd")).toThrow(/unsafe/);
  });
});

describe("materializeWork (F3 — honors the mount root; the seed carries no `project/` prefix)", () => {
  it("writes each entry under its mount root and sets ro/rw modes", async () => {
    const store = new InMemoryContentStore();
    const draft = await store.putText("ws_1", "the draft body");
    const notes = await store.putText("ws_1", "editor notes");
    const persona = await store.putText("ws_1", "the persona");
    // real seed-shaped entries: the draft's mirror_path is `drafts/v1.md` (root project, NO `project/` prefix),
    // a writable seat file, a persona file (root persona), and a derived manifest.md.
    const manifest: MirrorManifest = {
      seat: "editor",
      entries: [
        entry({ path: "drafts/v1.md", root: "project", sha256: draft.sha256, mode: "read", artifactVersionId: "av_draft" }),
        entry({ path: "agents/editor/report.md", root: "project", sha256: notes.sha256, mode: "readwrite", artifactVersionId: "av_notes" }),
        entry({ path: "PERSONA.md", root: "persona", sha256: persona.sha256, mode: "read", artifactVersionId: "av_persona" }),
        entry({ path: "manifest.md", root: "project", sha256: "n/a", mode: "read", artifactVersionId: null }),
      ],
    };
    const fs = new FakeWorkFs();
    const res = await materializeWork({
      roots: ROOTS,
      manifest,
      contentStore: store,
      serverFiles: new Map([["manifest.md", Buffer.from("# Manifest\n")]]),
      fs,
    });

    // project entries land under /work/project (matching the SDK cwd + hook), persona under /work/personas/p1.
    expect(res.written).toEqual([
      "/work/project/drafts/v1.md",
      "/work/project/agents/editor/report.md",
      "/work/personas/p1/PERSONA.md",
      "/work/project/manifest.md",
    ]);
    expect(res.readOnlyPaths).toEqual(["/work/project/drafts/v1.md", "/work/personas/p1/PERSONA.md", "/work/project/manifest.md"]);
    expect(Buffer.from(fs.files.get("/work/project/drafts/v1.md")!).toString()).toBe("the draft body");
    expect(fs.modes.get("/work/project/drafts/v1.md")).toBe(READ_ONLY_MODE);
    expect(fs.modes.get("/work/project/agents/editor/report.md")).toBe(READWRITE_MODE);
  });

  it("re-materialization is idempotent over a 0444 file (K3 — a guided retry no longer EACCES)", async () => {
    const store = new InMemoryContentStore();
    const draft = await store.putText("ws_1", "v1");
    const manifest: MirrorManifest = {
      seat: "editor",
      entries: [
        entry({ path: "drafts/v1.md", root: "project", sha256: draft.sha256, mode: "read", artifactVersionId: "av_draft" }),
        entry({ path: "manifest.md", root: "project", sha256: "n/a", mode: "read", artifactVersionId: null }),
      ],
    };
    const serverFiles = new Map([["manifest.md", Buffer.from("# Manifest\n")]]);
    const fs = new FakeWorkFs();
    await materializeWork({ roots: ROOTS, manifest, contentStore: store, serverFiles, fs });
    // both files are now 0444; a naive re-write would EACCES (the live P0.15f failure). The guard makes them
    // writable first, so the SECOND materialization succeeds and leaves them read-only again.
    await expect(materializeWork({ roots: ROOTS, manifest, contentStore: store, serverFiles, fs })).resolves.toBeTruthy();
    expect(fs.modes.get("/work/project/manifest.md")).toBe(READ_ONLY_MODE);
  });

  it("throws on a dangling content-addressed entry (a manifest referencing absent bytes)", async () => {
    const manifest: MirrorManifest = { seat: "editor", entries: [entry({ sha256: "missing", artifactVersionId: "av_x" })] };
    await expect(
      materializeWork({ roots: ROOTS, manifest, contentStore: new InMemoryContentStore(), fs: new FakeWorkFs() }),
    ).rejects.toThrow(/missing content/);
  });

  it("throws when a derived entry has no server-file bytes", async () => {
    const manifest: MirrorManifest = { seat: "editor", entries: [entry({ path: "manifest.md", artifactVersionId: null })] };
    await expect(
      materializeWork({ roots: ROOTS, manifest, contentStore: new InMemoryContentStore(), fs: new FakeWorkFs() }),
    ).rejects.toThrow(/no server-file bytes/);
  });
});

describe("F3 boundary — the §12.6 hook ALLOWs the draft read at the materialized path, DENIES the old one", () => {
  const policy = compileSeatPolicy({
    seat: "editor",
    tools: ["read", "write"],
    phase: { key: "verification", phaseClass: "judge", allowsSubagents: false },
    runId: "run_1",
  });
  const read = (file_path: string) =>
    evaluateToolUse({ tool: "Read", input: { file_path } }, policy, newDenialState(), { resolveRealpath: (p) => p }).decision;

  it("ALLOWs a read of /work/project/drafts/v1.md (where materializeWork now writes it)", () => {
    expect(read("/work/project/drafts/v1.md")).toBe("allow");
  });

  it("DENIES a read of the pre-F3 /work/drafts/v1.md (outside the project root — attested violations ≠ 0)", () => {
    expect(read("/work/drafts/v1.md")).toBe("deny");
  });
});
