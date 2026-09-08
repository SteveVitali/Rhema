// @rhema/run-task — stage the baked skills into a CLI-discoverable location (F2; §12.2).
//
// The vendored Agent SDK's `skillsDir` field is NOT a real SDK option — it is silently ignored (preflight
// audit F2/F5). The skills are baked read-only at `/app/skills` (the run-task `Dockerfile` COPYs
// `packages/protocols/skills` there), which is on no path the `claude` CLI scans, so `/editorial-review` would
// not resolve. The HARNESS (uid `harness`, before it launches the agent) therefore stages each baked skill into
// the CLI's user-config skills directory, `$CLAUDE_CONFIG_DIR/skills/<name>`, and the engine enables them with
// the real `skills: "all"` option (see `sdk-adapter.toSdkOptions`). Staging by SYMLINK keeps the ~read-only
// image cheap: the target `/app/skills/<name>` is world-readable, and only the small symlink lives in the
// per-run writable config tmpfs (never in the agent's cwd, so it is not harvested as an output).
//
// The staging is a pure filesystem projection over an injected `SkillsStagingFs`, so it is unit-tested with an
// in-memory fake; `nodeSkillsFs` binds it to node fs for the live harness.

/** The minimal filesystem surface skill staging needs (node binds it live; a fake backs the tests). */
export interface SkillsStagingFs {
  /** List the immediate entries of `dir` with a directory flag; returns [] when `dir` is absent. */
  readDir(dir: string): Promise<readonly { name: string; isDirectory: boolean }[]>;
  mkdirp(dir: string): Promise<void>;
  /** Create `linkPath` → `target` (idempotent: a pre-existing entry at `linkPath` is removed first). */
  symlink(target: string, linkPath: string): Promise<void>;
}

export interface StageSkillsArgs {
  /** where the skills are baked, read-only (defaults to `/app/skills`). */
  readonly skillsDir: string;
  /** the per-run writable config dir (`CLAUDE_CONFIG_DIR`); skills are staged under `<configDir>/skills`. */
  readonly configDir: string;
  readonly fs?: SkillsStagingFs;
}

/** The subdirectory under `CLAUDE_CONFIG_DIR` the CLI discovers user skills in. */
export const SKILLS_SUBDIR = "skills";

/**
 * Stage every baked skill directory (a `<name>/SKILL.md` tree) into `<configDir>/skills/<name>` as a symlink.
 * Returns the skill names staged (their directory names, which match the SKILL.md `name` the CLI resolves
 * `/<name>` against). Idempotent — re-staging on a guided retry replaces existing links. A skills dir with no
 * skills (or an absent one) stages nothing rather than throwing.
 */
export async function stageSkills(args: StageSkillsArgs): Promise<string[]> {
  const fs = args.fs ?? nodeSkillsFs;
  const skillsDir = args.skillsDir.replace(/\/$/, "");
  const dest = `${args.configDir.replace(/\/$/, "")}/${SKILLS_SUBDIR}`;
  const entries = await fs.readDir(skillsDir);
  const staged: string[] = [];
  await fs.mkdirp(dest);
  for (const entry of entries) {
    if (!entry.isDirectory) continue; // skip the manifest .mjs and any stray files — only skill dirs are staged
    await fs.symlink(`${skillsDir}/${entry.name}`, `${dest}/${entry.name}`);
    staged.push(entry.name);
  }
  return staged;
}

/** The node fs binding for `SkillsStagingFs` (lazy imports so the module stays load-light). */
export const nodeSkillsFs: SkillsStagingFs = {
  async readDir(dir) {
    const { readdir } = await import("node:fs/promises");
    try {
      const ents = await readdir(dir, { withFileTypes: true });
      return ents.map((e) => ({ name: e.name, isDirectory: e.isDirectory() }));
    } catch {
      return []; // an absent skills dir stages nothing (a CI placeholder image with no baked skills)
    }
  },
  async mkdirp(dir) {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(dir, { recursive: true });
  },
  async symlink(target, linkPath) {
    const { symlink, rm } = await import("node:fs/promises");
    await rm(linkPath, { recursive: true, force: true }); // idempotent: replace a prior attempt's link/dir
    await symlink(target, linkPath);
  },
};
