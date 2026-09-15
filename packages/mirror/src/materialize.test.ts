import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { materializeSeat, materializeScoped } from "./materialize.js";
import { harvest } from "./harvest.js";
import type { HarvestFile } from "./harvest.js";
import { createMirrorTestDb, type MirrorTestDb } from "./testing/harness.js";
import { InMemoryContentStore } from "./content-store.js";
import { seedAllRealProjects, type SeededMirrorProject } from "./testing/fixture.js";

// P0.09 materialize (REQ-DATA-5) + the seat-mount exclusions (REQ-DATA-10; §12.6) + the round-trip golden
// (REQ-DATA-9a). Deterministic over PGlite + an in-memory content store.

describe("materialize + harvest", () => {
  let db: MirrorTestDb;
  let store: InMemoryContentStore;
  let projects: SeededMirrorProject[];
  let workspaceId: string;

  beforeEach(async () => {
    db = await createMirrorTestDb();
    store = new InMemoryContentStore();
    ({ workspaceId, projects } = await seedAllRealProjects(db.exec, store));
  });
  afterEach(() => db.close());

  // AC1 — the golden: materialize + immediate harvest with no changes yields ZERO new versions, on each of the
  // three real projects.
  it("materialize + immediate harvest yields zero new versions on the three real projects (REQ-DATA-9a)", async () => {
    for (const p of projects) {
      const tree = await materializeSeat(db.exec, store, { seat: "author", projectId: p.projectId, personaId: p.personaId });
      const files: HarvestFile[] = tree.files.map((f) => ({ path: f.path, root: f.root, bytes: f.bytes }));
      const result = harvest({ seat: "author", manifest: tree.manifest, files });
      expect(result.newVersions, `project ${p.projectId}`).toEqual([]);
      expect(result.readOnlyHashMismatch).toEqual([]);
      expect(result.boundaryViolations).toEqual([]);
      expect(result.stepFailed).toBe(false);
      // every artifact-backed file is accounted for as unchanged.
      expect(result.unchanged.length).toBeGreaterThan(0);
    }
  });

  // AC2 — the Editor's tree structurally omits the Drafter's namespace, the voice files, and preferences.md.
  it("the Editor mount excludes agents/author/**, voice-print/lexicon/exemplars, and preferences.md (§12.6)", async () => {
    const p = projects[0]!;
    const tree = await materializeSeat(db.exec, store, { seat: "editor", projectId: p.projectId, personaId: p.personaId });
    const paths = tree.files.map((f) => f.path);

    expect(paths.some((x) => x.startsWith("agents/author/"))).toBe(false); // the Editor↔Drafter wall
    expect(paths).not.toContain("preferences.md"); // REQ-OBJ-10
    expect(paths).not.toContain("profile/voice-print.md");
    expect(paths).not.toContain("profile/lexicon.md");
    expect(paths).not.toContain("profile/exemplars.md");
    // but it DOES mount its own namespace + the shared dossier + the allowed persona files.
    expect(paths).toContain("agents/editor/notes.md");
    expect(paths).toContain("correspondence/v1-review-1/editors-letter.md");
    expect(paths).toContain("profile/positions.md");
    expect(paths).toContain("PERSONA.md");
  });

  it("the Drafter mount DOES include agents/author/**, the voice files, and preferences.md", async () => {
    const p = projects[0]!;
    const tree = await materializeSeat(db.exec, store, { seat: "author", projectId: p.projectId, personaId: p.personaId });
    const paths = tree.files.map((f) => f.path);
    expect(paths).toContain("agents/author/notebook.md");
    expect(paths).toContain("preferences.md");
    expect(paths).toContain("profile/voice-print.md");
    expect(paths).toContain("profile/lexicon.md");
    expect(paths).toContain("profile/exemplars.md");
    // and never the Editor's private namespace.
    expect(paths.some((x) => x.startsWith("agents/editor/"))).toBe(false);
  });

  // AC2 — the second read's namespace is exactly [draft] (with P0.06's enumeration).
  it("the input-scoped second read receives exactly the draft (§12.6; REQ-DATA-17)", async () => {
    const p = projects[0]!;
    const tree = await materializeSeat(db.exec, store, { seat: "editor", projectId: p.projectId, personaId: p.personaId });
    expect(materializeScoped(tree, "second-reader")).toEqual(["/work/project/drafts/v1.md"]);
  });

  it("the manifest is a signed contract: every artifact-backed entry carries an artifact_version_id + sha256", async () => {
    const p = projects[0]!;
    const tree = await materializeSeat(db.exec, store, { seat: "editor", projectId: p.projectId, personaId: p.personaId });
    const backed = tree.manifest.entries.filter((e) => e.artifactVersionId);
    expect(backed.length).toBeGreaterThan(0);
    for (const e of backed) expect(e.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(tree.manifestMd).toContain("# Manifest");
    expect(workspaceId).toBe("ws_mirror");
  });

  // Overlays (REQ-SPEC-9): a gate-derived version overrides the committed file at resume.
  it("an overlay overrides the committed version at the same path", async () => {
    const p = projects[0]!;
    // author a new version of the editor's letter (an overlay stand-in), then materialize with it.
    const overlaySha = (await store.putText(workspaceId, "# Overlaid letter\n")).sha256;
    const artId = (
      await db.exec.query("select id from artifacts where project_id=$1 and mirror_path=$2", [
        p.projectId,
        "correspondence/v1-review-1/editors-letter.md",
      ])
    ).rows[0] as { id: string };
    await db.exec.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
       values ('av_overlay',$1,2,$2,'k',10,'text/markdown','{"kind":"user"}'::jsonb)`,
      [artId.id, overlaySha],
    );
    const tree = await materializeSeat(db.exec, store, {
      seat: "editor", projectId: p.projectId, personaId: p.personaId, overlays: [{ artifactVersionId: "av_overlay" }],
    });
    const letter = tree.files.find((f) => f.path === "correspondence/v1-review-1/editors-letter.md")!;
    expect(letter.sha256).toBe(overlaySha);
    expect(letter.artifactVersionId).toBe("av_overlay");
  });
});
