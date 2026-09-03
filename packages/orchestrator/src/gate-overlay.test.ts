import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { InMemoryContentStore, sha256Hex } from "@rhema/mirror";
import { resolveGate } from "./gate-resolution.js";
import { hydration } from "./internal-api.js";
import { createOrchestratorTestDb, seedProject, seedRun, seedGate, readDecision, makeDeps, type OrchestratorTestDb, type TestDeps } from "./testing/index.js";

// AC4 (REQ-SPEC-9; the Phase-0 exit criterion) — an Approve-plan edit is serialized to the FILE, the resumed
// run's mirror carries the overlay, and the skill sees the user's rows with `actor: user`. Deterministic over
// PGlite + an in-memory content store (re-verified live in P0.15). The overlay MECHANICS at the mirror layer
// are proven in @rhema/mirror; this proves the ORCHESTRATOR wiring: resolve → serialize → overlayVersionIds →
// resume hydration materializes the overlay.

const MD_PATH = "agents/author/drafting/v1/02-structure-plan.md";
const JSON_PATH = "agents/author/drafting/v1/02-structure-plan.json";

/** The post-decision structure-plan rows the user edited at the gate (valid structurePlanSidecar). */
const EDITED = {
  sidecar: "structure_plan" as const,
  version: 1 as const,
  spine: ["The harms turn answers, not the nothing-to-hide framing"],
  sections: [{ ref: "I", title: "Opening", targetWords: 650 }],
};

describe("gate write-back overlays (REQ-SPEC-9; §11.5; AC4)", () => {
  let db: OrchestratorTestDb;
  let store: InMemoryContentStore;
  let deps: TestDeps & { store: InMemoryContentStore };
  let ws: string;

  beforeEach(async () => {
    db = await createOrchestratorTestDb();
    store = new InMemoryContentStore();
    const seed = await seedProject(db);
    ws = seed.workspaceId;
    deps = { ...makeDeps(db), store };

    // seat: a Drafter (author) agent instance on the run, so the structure-plan path is mounted at resume.
    await db.client.query(
      `insert into agent_types(key, display_name, readable, writable, persona_view, tools, skills, default_model_profile, subagents)
       values ('author','Drafter','{}','{}','{}','{}','{}','balanced','{}'::jsonb)`,
      [],
    );
    await db.client.query(
      `insert into agent_instances(id, project_id, type_key, namespace) values ('ai_author','prj_seed','author','agent:author')`,
      [],
    );

    // the committed structure-plan (.md + .json), agent-authored (the plan the Drafter produced).
    for (const [artId, verId, path, kind] of [
      ["art_md", "av_md1", MD_PATH, "structure_plan"],
      ["art_json", "av_json1", JSON_PATH, "sidecar"],
    ] as const) {
      await db.client.query(
        `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
         values ($1,$2,'prj_seed',$3,'agent:author',$4,$5)`,
        [artId, ws, kind, path, verId],
      );
      const bytes = `agent v1 for ${path}`;
      const sha = sha256Hex(bytes);
      await store.putText(ws, bytes);
      await db.client.query(
        `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by, immutable)
         values ($1,$2,1,$3,'k',10,'text/markdown','{"kind":"agent"}'::jsonb,false)`,
        [verId, artId, sha],
      );
    }

    await seedRun(db, { runId: "run1", workspaceId: ws, projectId: "prj_seed", workflow: "draft", state: "waiting_gate", currentAttempt: 1, agentInstanceId: "ai_author" });
    await seedGate(db, { gateId: "g1", runId: "run1", kind: "approve_plan", onExpiry: "proceed_conservative", artifactVersionId: "av_md1" });
  });
  afterEach(() => db.close());

  it("serializes the edit to a user-authored overlay, records overlayVersionIds, and resume materializes it", async () => {
    const r = await resolveGate(deps, {
      runId: "run1",
      gateId: "g1",
      workspaceId: ws,
      userId: "usr_seed",
      action: "edit",
      edits: { artifactVersionId: "av_md1", rows: EDITED, changes: 2 },
    });
    expect(r).toMatchObject({ ok: true, resolved: true, state: "queued" });
    if (!r.ok || !r.resolved) throw new Error("resolve failed");
    expect(r.overlayVersionIds).toHaveLength(2); // the .md and its .json twin

    // the Decision records the overlay versions (REQ-SPEC-9).
    const decision = await readDecision(db, "g1");
    expect(decision).toMatchObject({ by_actor: "user", action: "edit" });
    expect(decision!.overlay_version_ids).toEqual(r.overlayVersionIds);

    // the overlay versions are USER-authored (provenance is honest: the user rewrote the plan).
    for (const vid of r.overlayVersionIds) {
      const row = (await db.client.query("select created_by from artifact_versions where id=$1", [vid])).rows[0] as { created_by: unknown };
      const createdBy = typeof row.created_by === "string" ? JSON.parse(row.created_by) : row.created_by;
      expect(createdBy).toMatchObject({ kind: "user", userId: "usr_seed" });
    }

    // the serialized JSON twin's content IS the user's edited rows (the skill reads them AS ROWS).
    const jsonSha = sha256Hex(JSON.stringify(EDITED, null, 2) + "\n");
    const bytes = await store.get(jsonSha);
    expect(bytes).not.toBeNull();
    expect(JSON.parse(Buffer.from(bytes!).toString("utf8"))).toEqual(EDITED);

    // RESUME: hydration loads the overlays from the decision and materializes them over the committed tree.
    const h = await hydration(deps, { runId: "run1", attempt: 2, workspaceId: ws });
    expect(h.seat).toBe("author");
    expect(h.overlays.sort()).toEqual([...r.overlayVersionIds].sort()); // resume carries the overlay
    // the resumed mirror's structure-plan JSON entry points at the user's overlay version + its sha.
    const jsonEntry = h.manifest.entries.find((e) => e.path === JSON_PATH)!;
    expect(jsonEntry.sha256).toBe(jsonSha);
    expect(jsonEntry.artifactVersionId).toBe(r.overlayVersionIds[1]); // json is the second serialized version
  });

  it("resolving a non-serializable gate kind with edits requires a serializable artifact (guards REQ-SPEC-9)", async () => {
    // point the edit at a non-serializable artifact kind (the committed .json sidecar, kind 'sidecar').
    await expect(
      resolveGate(deps, { runId: "run1", gateId: "g1", workspaceId: ws, userId: "usr_seed", action: "edit", edits: { artifactVersionId: "av_json1", rows: EDITED } }),
    ).rejects.toThrow(/no serializer/);
  });
});
