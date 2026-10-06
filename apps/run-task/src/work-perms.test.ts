import { describe, it, expect } from "vitest";
import { makeTreeAgentWritable, type PermFs } from "./work-perms.js";

class FakeDirent {
  constructor(
    readonly name: string,
    private readonly kind: "file" | "dir",
  ) {}
  isDirectory() {
    return this.kind === "dir";
  }
  isFile() {
    return this.kind === "file";
  }
}

/** In-memory fs: `dirs` maps dir → entry names present in it; `modes` holds the current chmod state. */
function fakeFs(args: {
  dirs: Record<string, { name: string; kind: "file" | "dir" }[]>;
  modes: Record<string, number>;
}): { fs: PermFs; modes: Record<string, number> } {
  const modes = { ...args.modes };
  const fs: PermFs = {
    async readdir(dir) {
      const entries = args.dirs[dir];
      if (!entries) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return entries.map((e) => new FakeDirent(e.name, e.kind));
    },
    async chmod(path, mode) {
      if (!(path in modes) && !(path in args.dirs)) {
        throw Object.assign(new Error("ENOENT"), { code: "ENOENT" }); // match node: chmod on a missing path fails
      }
      modes[path] = mode;
    },
    async stat(path) {
      const mode = modes[path];
      if (mode === undefined) throw Object.assign(new Error("ENOENT"), { code: "ENOENT" });
      return { mode };
    },
  };
  return { fs, modes };
}

describe("makeTreeAgentWritable", () => {
  it("chmod's the walked ROOT dir to 0777 — the DEF.1 Stage-B fix (persona root stayed 0755 → EACCES on .rhema/phase-result.json + profile/**)", async () => {
    const { fs, modes } = fakeFs({
      dirs: {
        "/work/personas/p1": [
          { name: "PERSONA.md", kind: "file" },
          { name: "docs", kind: "dir" },
        ],
        "/work/personas/p1/docs": [{ name: "voice.md", kind: "file" }],
      },
      modes: {
        "/work/personas/p1": 0o755,
        "/work/personas/p1/PERSONA.md": 0o444,
        "/work/personas/p1/docs": 0o755,
        "/work/personas/p1/docs/voice.md": 0o644,
      },
    });
    await makeTreeAgentWritable("/work/personas/p1", fs);
    expect(modes["/work/personas/p1"]).toBe(0o777); // THE regression: the root itself is agent-writable
    expect(modes["/work/personas/p1/docs"]).toBe(0o777); // nested dirs recurse writable
    expect(modes["/work/personas/p1/PERSONA.md"]).toBe(0o444); // read-only mount untouched
    expect(modes["/work/personas/p1/docs/voice.md"]).toBe(0o666); // prior-round output overwritable
  });

  it("still makes the project tree agent-writable end-to-end (project root + nested seat namespace)", async () => {
    const { fs, modes } = fakeFs({
      dirs: {
        "/work/project": [
          { name: "agents", kind: "dir" },
          { name: "manifest.md", kind: "file" },
        ],
        "/work/project/agents": [{ name: "editor", kind: "dir" }],
        "/work/project/agents/editor": [],
      },
      modes: {
        "/work/project": 0o755,
        "/work/project/agents": 0o755,
        "/work/project/agents/editor": 0o755,
        "/work/project/manifest.md": 0o444,
      },
    });
    await makeTreeAgentWritable("/work/project", fs);
    expect(modes["/work/project"]).toBe(0o777);
    expect(modes["/work/project/agents"]).toBe(0o777);
    expect(modes["/work/project/agents/editor"]).toBe(0o777);
    expect(modes["/work/project/manifest.md"]).toBe(0o444);
  });

  it("tolerates a missing/empty dir (roots.persona may not exist for a project-only seat)", async () => {
    const { fs, modes } = fakeFs({ dirs: {}, modes: {} });
    await expect(makeTreeAgentWritable("/work/personas/absent", fs)).resolves.toBeUndefined();
    expect(modes["/work/personas/absent"]).toBeUndefined(); // the root chmod is best-effort; the walk swallows ENOENT
  });
});
