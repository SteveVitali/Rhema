// @rhema/run-task — the agent-writable tree walk (extracted from harness-main for the DEF.1 Stage-B
// live finding). materializeWork (uid harness, 10001) creates the seat's namespace directories 0755
// and its readwrite files 0644 — all harness-owned. The agent (uid 10002) therefore gets EACCES
// creating its declared artifacts inside `agents/editor/` (the live P0.15h symptom: the agent wrote a
// `_write_test` probe at the 0777 project ROOT, then reported the phase `blocked` because
// `agents/editor/00-piece-brief.md` could not be written).
//
// DEF.1 Stage-B (live, profile_voice run 01M3E42JXTF3HVZZQV0806SZPB): the previous shape chmod'ed a
// directory's CONTENTS but never the directory itself — fine for `/work/project`, which the caller
// chmod'ed separately (`chmod(cwd, 0o777)`), but `/work/personas/<id>` stayed harness-owned 0755, so a
// persona_builder's every write at the persona root (`.rhema/phase-result.json`, `profile/**`) failed
// EACCES *despite the §12.6 hook allowing it* — the census phase exited sdk=success, the model probed
// `.rhema-write-probe.md`/`PROBE_TEST.md`/`zzz_probe_dir` (hook-denied, outside the grant), and the
// oracle still found no phase-result. The walk now chmods the ROOT too.
//
// Every DIRECTORY → 0777 (the agent can create new files anywhere in the writable tree), every FILE
// that is not the 0444 read-only mount → 0666 (the agent can overwrite a prior-round output).
// Read-only mounts (0444) are left untouched — this widens only the writable set; the boundary stays
// the proxy + uid split + the §12.6 hook.

/** The minimal fs surface the walk needs (node fs binds live; a fake backs the tests). */
export interface PermFs {
  readdir(dir: string): Promise<readonly { name: string; isDirectory(): boolean; isFile(): boolean }[]>;
  chmod(path: string, mode: number): Promise<void>;
  stat(path: string): Promise<{ mode: number }>;
}

/** Recursive walk: `dir` itself AND every directory beneath it → 0777; non-0444 files → 0666. */
export async function makeTreeAgentWritable(dir: string, fs: PermFs): Promise<void> {
  // chmod the dir itself FIRST (the DEF.1 Stage-B fix): without it the walk's children become
  // writable while the root stays 0755 harness-owned and the agent cannot create anything inside it.
  await fs.chmod(dir, 0o777).catch(() => undefined);
  let entries: readonly { name: string; isDirectory(): boolean; isFile(): boolean }[];
  try {
    entries = await fs.readdir(dir);
  } catch {
    return;
  }
  for (const e of entries) {
    const abs = `${dir}/${e.name}`;
    if (e.isDirectory()) {
      await makeTreeAgentWritable(abs, fs);
    } else if (e.isFile()) {
      const mode = await fs.stat(abs).then((s) => s.mode & 0o777).catch(() => 0o444);
      if (mode !== 0o444) await fs.chmod(abs, 0o666).catch(() => undefined); // keep read-only mounts read-only
    }
  }
}

/** The node fs binding for `PermFs`. */
export const nodePermFs: PermFs = {
  async readdir(dir) {
    const { readdir } = await import("node:fs/promises");
    return readdir(dir, { withFileTypes: true });
  },
  async chmod(path, mode) {
    const { chmod } = await import("node:fs/promises");
    await chmod(path, mode);
  },
  async stat(path) {
    const { stat } = await import("node:fs/promises");
    return stat(path);
  },
};
