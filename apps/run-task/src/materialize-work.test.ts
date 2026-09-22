import { describe, it, expect } from "vitest";
import { InMemoryContentStore, type MirrorManifest } from "@rhema/mirror";
import {
  materializeWork,
  workPath,
  READ_ONLY_MODE,
  READWRITE_MODE,
  type WorkFs,
} from "./materialize-work.js";

/** An in-memory WorkFs recording writes + modes + created dirs. */
class FakeWorkFs implements WorkFs {
  readonly files = new Map<string, Uint8Array>();
  readonly modes = new Map<string, number>();
  readonly dirs = new Set<string>();
  mkdirp(dir: string): Promise<void> {
    this.dirs.add(dir);
    return Promise.resolve();
  }
  writeFile(path: string, bytes: Uint8Array): Promise<void> {
    this.files.set(path, bytes);
    return Promise.resolve();
  }
  chmod(path: string, mode: number): Promise<void> {
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
  it("joins inside the mount and rejects a `..` escape", () => {
    expect(workPath("/work", "project/draft.md")).toBe("/work/project/draft.md");
    expect(() => workPath("/work", "../etc/passwd")).toThrow(/unsafe/);
  });
});

describe("materializeWork", () => {
  it("writes content-addressed + derived files and sets ro/rw modes", async () => {
    const store = new InMemoryContentStore();
    const draft = await store.putText("ws_1", "the draft body");
    const notes = await store.putText("ws_1", "editor notes");
    const manifest: MirrorManifest = {
      seat: "editor",
      entries: [
        entry({ path: "project/draft.md", sha256: draft.sha256, mode: "read", artifactVersionId: "av_draft" }),
        entry({ path: "project/notes.md", sha256: notes.sha256, mode: "readwrite", artifactVersionId: "av_notes" }),
        entry({ path: "manifest.md", sha256: "n/a", mode: "read", artifactVersionId: null }), // derived
      ],
    };
    const fs = new FakeWorkFs();
    const res = await materializeWork({
      workDir: "/work",
      manifest,
      contentStore: store,
      serverFiles: new Map([["manifest.md", Buffer.from("# Manifest\n")]]),
      fs,
    });

    expect(res.written).toEqual(["/work/project/draft.md", "/work/project/notes.md", "/work/manifest.md"]);
    expect(res.readOnlyPaths).toEqual(["/work/project/draft.md", "/work/manifest.md"]);
    expect(Buffer.from(fs.files.get("/work/project/draft.md")!).toString()).toBe("the draft body");
    expect(fs.modes.get("/work/project/draft.md")).toBe(READ_ONLY_MODE); // 0444 — a chmod+w edit is caught
    expect(fs.modes.get("/work/project/notes.md")).toBe(READWRITE_MODE); // 0644 — the seat's writable file
    expect(fs.dirs.has("/work/project")).toBe(true);
  });

  it("throws on a dangling content-addressed entry (a manifest referencing absent bytes)", async () => {
    const manifest: MirrorManifest = { seat: "editor", entries: [entry({ sha256: "missing", artifactVersionId: "av_x" })] };
    await expect(
      materializeWork({ workDir: "/work", manifest, contentStore: new InMemoryContentStore(), fs: new FakeWorkFs() }),
    ).rejects.toThrow(/missing content/);
  });

  it("throws when a derived entry has no server-file bytes", async () => {
    const manifest: MirrorManifest = { seat: "editor", entries: [entry({ path: "manifest.md", artifactVersionId: null })] };
    await expect(
      materializeWork({ workDir: "/work", manifest, contentStore: new InMemoryContentStore(), fs: new FakeWorkFs() }),
    ).rejects.toThrow(/no server-file bytes/);
  });
});
