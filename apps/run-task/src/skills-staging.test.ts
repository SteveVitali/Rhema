import { describe, it, expect } from "vitest";
import { stageSkills, SKILLS_SUBDIR, type SkillsStagingFs } from "./skills-staging.js";

/** An in-memory SkillsStagingFs recording created dirs + symlinks. */
class FakeFs implements SkillsStagingFs {
  readonly entries: Record<string, { name: string; isDirectory: boolean }[]> = {};
  readonly dirs = new Set<string>();
  readonly links = new Map<string, string>(); // linkPath → target
  readDir(dir: string) {
    return Promise.resolve(this.entries[dir] ?? []);
  }
  mkdirp(dir: string) {
    this.dirs.add(dir);
    return Promise.resolve();
  }
  symlink(target: string, linkPath: string) {
    this.links.set(linkPath, target);
    return Promise.resolve();
  }
}

describe("stageSkills (F2 — make /app/skills CLI-discoverable so /editorial-review resolves)", () => {
  it("symlinks each baked skill DIR into <configDir>/skills and returns their names", async () => {
    const fs = new FakeFs();
    fs.entries["/app/skills"] = [
      { name: "editorial-review", isDirectory: true },
      { name: "respond-to-review", isDirectory: true },
      { name: "bootstrap-persona", isDirectory: true },
      { name: "upstream-port.manifest.mjs", isDirectory: false }, // a stray file, not a skill — skipped
    ];
    const staged = await stageSkills({ skillsDir: "/app/skills", configDir: "/config", fs });

    expect(staged.sort()).toEqual(["bootstrap-persona", "editorial-review", "respond-to-review"]);
    expect(fs.dirs.has(`/config/${SKILLS_SUBDIR}`)).toBe(true);
    expect(fs.links.get("/config/skills/editorial-review")).toBe("/app/skills/editorial-review");
    expect(fs.links.has("/config/skills/upstream-port.manifest.mjs")).toBe(false);
  });

  it("tolerates a trailing slash on either dir", async () => {
    const fs = new FakeFs();
    fs.entries["/app/skills"] = [{ name: "editorial-review", isDirectory: true }];
    await stageSkills({ skillsDir: "/app/skills/", configDir: "/config/", fs });
    expect(fs.links.get("/config/skills/editorial-review")).toBe("/app/skills/editorial-review");
  });

  it("stages nothing (does not throw) when the skills dir is absent or empty", async () => {
    const fs = new FakeFs();
    expect(await stageSkills({ skillsDir: "/nope", configDir: "/config", fs })).toEqual([]);
  });
});
