import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { materializeSeat, materializeScoped } from "./materialize.js";
import { harvest } from "./harvest.js";
import type { HarvestFile } from "./harvest.js";
import { createMirrorTestDb, type MirrorTestDb } from "./testing/harness.js";
import { InMemoryContentStore } from "./content-store.js";
import { seedAllRealProjects, seedArtifact, type SeededMirrorProject } from "./testing/fixture.js";
import { declaredWritableArtifacts } from "./mounts.js";
import { WORKFLOW_MANIFESTS } from "@rhema/protocols";

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

  // PRB.19 (F26b) — the declared-output write grant: the manifest's `phase.artifacts` under a §12.6
  // read-only shared mount are writable for the run that declares them, and a committed artifact at a
  // granted path mounts `readwrite` (re-materialized but still editable through verify/deliver).
  it("declaredWritableArtifacts resolves the manifest's vN/v(N+1) templates to concrete granted paths", () => {
    const revise = WORKFLOW_MANIFESTS.revise!;
    // canonical revise: base = reviewed = v1 → drafts/v2.md + correspondence/v1-response.md granted;
    // `agents/author/**` declarations are already readwrite (no grant) and basename-only manifests grant none.
    expect(declaredWritableArtifacts("author", revise, { baseDraftN: 1, reviewedDraftN: 1 })).toEqual([
      "correspondence/v1-response.md",
      "drafts/v2.md",
    ]);
    // a divergent head (manualRevision on v2 while the review covered v1) grants BOTH readings.
    expect(declaredWritableArtifacts("author", revise, { baseDraftN: 2, reviewedDraftN: 1 })).toEqual([
      "correspondence/v1-response.md",
      "correspondence/v2-response.md",
      "drafts/v2.md",
      "drafts/v3.md",
    ]);
    // the review manifest declares only output_dir-relative basenames → no shared-path grants.
    expect(declaredWritableArtifacts("editor", WORKFLOW_MANIFESTS.review!, { baseDraftN: 1, reviewedDraftN: 1 })).toEqual([]);
    // no draft context → no template expansion → no grant.
    expect(declaredWritableArtifacts("author", revise, { baseDraftN: null, reviewedDraftN: null })).toEqual([]);
  });

  it("a committed artifact at a granted declared-output path mounts readwrite (the grant upgrades the mode)", async () => {
    const p = projects[0]!;
    // the committed `drafts/v2.md` — the revise phase's produced draft, re-materialized at verify/deliver.
    await seedArtifact(db.exec, store, workspaceId, {
      scope: "project", scopeId: p.projectId, kind: "draft", namespace: "shared",
      mirrorPath: "drafts/v2.md", content: "# v2 revised\n",
    });
    const granted = await materializeSeat(db.exec, store, {
      seat: "author", projectId: p.projectId, personaId: p.personaId,
      writablePaths: ["drafts/v2.md", "correspondence/v1-response.md"],
    });
    expect(granted.manifest.entries.find((e) => e.path === "drafts/v2.md")?.mode).toBe("readwrite");
    expect(granted.manifest.entries.find((e) => e.path === "drafts/v1.md")?.mode).toBe("read"); // untouched
    // without the grant the same artifact stays read-only.
    const plain = await materializeSeat(db.exec, store, { seat: "author", projectId: p.projectId, personaId: p.personaId });
    expect(plain.manifest.entries.find((e) => e.path === "drafts/v2.md")?.mode).toBe("read");
  });
});
