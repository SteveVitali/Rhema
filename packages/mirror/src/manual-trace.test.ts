import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SqlExecutor } from "./sql.js";
import { traceManualRevision } from "./manual-trace.js";
import { createMirrorTestDb, testDeps, type MirrorTestDb } from "./testing/harness.js";
import { InMemoryContentStore } from "./content-store.js";
import { seedBase, seedMirrorProject } from "./testing/fixture.js";

// PRB.06 — `revision.move_traced` for a MANUAL revision (REQ-BETA-7's second half): a human edit carries no
// response ledger, so the server diff emits ONE unlinked trace row covering every changed hunk — the event
// stream accounts for the whole change even with no move explaining it.

describe("traceManualRevision (PRB.06)", () => {
  let db: MirrorTestDb;
  let store: InMemoryContentStore;
  let workspaceId: string;
  const projectId = "proj_mt";
  let events: { type: string; payload: unknown }[];
  let dftHuman: string;
  let deps: { store: InMemoryContentStore; eventWriter: { append(e: SqlExecutor, ev: { type: string; payload: unknown }): Promise<void> } };

  beforeEach(async () => {
    db = await createMirrorTestDb();
    store = new InMemoryContentStore();
    ({ workspaceId } = await seedBase(db.exec));
    await seedMirrorProject(db.exec, store, workspaceId, { id: projectId, personaId: "prs_mt", tag: "MT" });
    events = [];
    deps = {
      store,
      eventWriter: {
        async append(_e: SqlExecutor, ev: { type: string; payload: unknown }) {
          events.push(ev);
        },
      },
    };

    // v2 frozen (the reviewed head) → v3 working human_revision based on it.
    const v2 = await store.putText(workspaceId, "# Doc\n\nOld paragraph.\n");
    await db.exec.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
       values ('art_v2',$1,$2,'draft','shared','drafts/v2.md','av_v2')`,
      [workspaceId, projectId],
    );
    await db.exec.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
       values ('av_v2','art_v2',1,$1,'k',20,'text/markdown','{"kind":"system"}'::jsonb)`,
      [v2.sha256],
    );
    const dftBase = testDeps(10).ids("dft");
    dftHuman = testDeps(11).ids("dft");
    await db.exec.query(
      `insert into drafts(id, project_id, n, origin, state, promoted_version_id)
       values ($1,$2,2,'response_to_review','frozen','av_v2')`,
      [dftBase, projectId],
    );
    await db.exec.query(
      `insert into drafts(id, project_id, n, origin, state, base_draft_id)
       values ($1,$2,3,'human_revision','working',$3)`,
      [dftHuman, projectId, dftBase],
    );
    // the human-edited markdown lands as a new artifact version on the same artifact.
    const v3 = await store.putText(workspaceId, "# Doc\n\nOld paragraph.\n\nA human-added section.\n");
    await db.exec.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
       values ('av_v3','art_v2',2,$1,'k',40,'text/markdown','{"kind":"user","userId":"u_1"}'::jsonb)`,
      [v3.sha256],
    );
  });
  afterEach(() => db.close());

  it("emits one unlinked revision.move_traced covering the human-edited hunks", async () => {
    const traces = await traceManualRevision(db.exec, deps, {
      draftId: dftHuman,
      newVersionId: "av_v3",
      at: new Date("2026-09-03T00:00:00.000Z"),
    });
    expect(traces).toEqual([{ hunkCount: 1, charsChanged: "A human-added section.".length }]);
    expect(events).toHaveLength(1);
    expect(events[0]!.type).toBe("revision.move_traced");
    // ids + counts only — no hunk text, no moveId (a human edit carries no ledger move).
    expect(events[0]!.payload).toMatchObject({ draftId: dftHuman, hunkCount: 1 });
    expect(events[0]!.payload).not.toHaveProperty("moveId");
    expect(events[0]!.payload).not.toHaveProperty("findingId");
  });

  it("emits nothing when the draft is not a human_revision (the seam is honest, not noisy)", async () => {
    const traces = await traceManualRevision(db.exec, deps, {
      draftId: "dft_nonexistent",
      newVersionId: "av_v3",
      at: new Date(),
    });
    expect(traces).toEqual([]);
    expect(events).toHaveLength(0);
  });
});
