import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SqlExecutor } from "./sql.js";
import { saveManualRevision, type ManualRevisionDeps } from "./manual-revision.js";
import { createMirrorTestDb, testDeps, type MirrorTestDb } from "./testing/harness.js";
import { InMemoryContentStore, sha256Hex } from "./content-store.js";
import { seedBase, seedMirrorProject, type SeededMirrorProject } from "./testing/fixture.js";
import { splitMarkdownBlocks } from "@rhema/findings-core";

// PRB.07 — the manual-revision save path (§5.4/§11.6): frozen head → fork v(N+1) `human_revision` with a
// `draft.forked` timeline event and no confirm; the markdown lands content-addressed with the block-id
// sidecar on the version row (never in the text); findings re-anchor as projections; touched blocks carry
// `human` provenance; a snapshot restore point lands per save; the PRB.06 seam emits `revision.move_traced`.

const USER = "01JQ00000000000000000000U1"; // ULID-shaped (the actor/anchor ids validate at the boundary)

describe("saveManualRevision (PRB.07)", () => {
  let db: MirrorTestDb;
  let store: InMemoryContentStore;
  let workspaceId: string;
  let proj: SeededMirrorProject;
  let deps: ManualRevisionDeps;
  let runEvents: { type: string; payload: unknown }[];
  /** the frozen v1 under edit — ULID-shaped ids (event payloads validate `idSchema` at the boundary). */
  let frozenDraftId: string;
  const BASE_MD = "# MR\n\nThe draft body for MR.\n";

  beforeEach(async () => {
    db = await createMirrorTestDb();
    store = new InMemoryContentStore();
    ({ workspaceId } = await seedBase(db.exec));
    proj = await seedMirrorProject(db.exec, store, workspaceId, {
      id: "proj_mr",
      personaId: "prs_mr",
      tag: "MR",
    });
    runEvents = [];
    deps = {
      ...testDeps(100),
      store,
      eventWriter: {
        async append(_e: SqlExecutor, ev: { type: string; payload: unknown }) {
          runEvents.push(ev);
        },
      },
    };

    // the frozen, reviewed v1 the editor opens (its own ULID ids — fixture ids are not ULIDs). The fixture's
    // own (proj_mr, n=1, drafts/v1.md) rows come out first so the uniques don't collide.
    await db.exec.query("delete from drafts where id = $1", [proj.draftId]);
    await db.exec.query("delete from artifacts where project_id = $1 and mirror_path = 'drafts/v1.md'", [
      proj.projectId,
    ]);
    const v1 = await store.putText(workspaceId, BASE_MD);
    const artId = testDeps(200).ids("art");
    const verId = testDeps(201).ids("av");
    frozenDraftId = testDeps(202).ids("dft");
    await db.exec.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
       values ($1,$2,$3,'draft','shared','drafts/v1.md',$4)`,
      [artId, workspaceId, proj.projectId, verId],
    );
    await db.exec.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, word_count,
         media_type, created_by, immutable)
       values ($1,$2,1,$3,'k',$4,5,'text/markdown',$5::jsonb,true)`,
      [
        verId,
        artId,
        v1.sha256,
        Buffer.byteLength(BASE_MD),
        JSON.stringify({ kind: "agent", runId: testDeps(203).ids("run"), draftN: 1 }),
      ],
    );
    await db.exec.query(
      `insert into drafts(id, project_id, n, origin, state, promoted_version_id)
       values ($1,$2,1,'agent','frozen',$3)`,
      [frozenDraftId, proj.projectId, verId],
    );
  });
  afterEach(() => db.close());

  async function timelineEvents(): Promise<{ type: string; payload: Record<string, unknown> }[]> {
    const res = await db.exec.query(
      "select type, payload from timeline_events where project_id = $1 order by at, id",
      [proj.projectId],
    );
    return res.rows as { type: string; payload: Record<string, unknown> }[];
  }

  it("AC1 — saving a frozen head forks v(N+1) human_revision, emits draft.forked, keeps the base immutable", async () => {
    const md = "# MR\n\nThe draft body for MR.\n\nA new closing line.\n";
    const r = await saveManualRevision(db.exec, deps, {
      workspaceId,
      projectId: proj.projectId,
      draftId: frozenDraftId,
      markdown: md,
      userId: USER,
    });
    if (!r.ok) throw new Error(`save failed: ${JSON.stringify(r)}`);
    expect(r).toMatchObject({ ok: true, forked: true, changed: true, draftN: 2 });

    // the forked head (REQ-DATA-24): origin=human_revision, state=working, base → the frozen v1.
    const head = (
      await db.exec.query("select n, origin, state, base_draft_id, promoted_version_id from drafts where id = $1", [
        r.draftId,
      ])
    ).rows[0] as { n: number; origin: string; state: string; base_draft_id: string; promoted_version_id: string };
    expect(head).toMatchObject({ n: 2, origin: "human_revision", state: "working", base_draft_id: frozenDraftId });

    // the timeline event landed (project-scoped — a human save has no run).
    const evs = await timelineEvents();
    expect(evs.map((e) => e.type)).toContain("draft.forked");
    expect(evs.find((e) => e.type === "draft.forked")!.payload).toMatchObject({
      draftId: r.draftId,
      baseDraftId: frozenDraftId,
      n: 2,
    });

    // the base stayed frozen + immutable; the stored markdown is VERBATIM (no ids/marks — REQ-DATA-29).
    const base = (
      await db.exec.query("select state from drafts where id = $1", [frozenDraftId])
    ).rows[0] as { state: string };
    expect(base.state).toBe("frozen");
    const stored = await store.get(sha256Hex(md));
    expect(Buffer.from(stored!).toString("utf8")).toBe(md);

    // the version row carries the block-id sidecar + human provenance (AC5).
    const ver = (
      await db.exec.query("select block_id_map, created_by from artifact_versions where id = $1", [r.versionId])
    ).rows[0] as { block_id_map: Record<string, { ordinal: number }>; created_by: { kind: string } };
    expect(Object.keys(ver.block_id_map).length).toBeGreaterThan(0);
    expect(ver.created_by.kind).toBe("user");
    const pm = (
      await db.exec.query("select spans from provenance_maps where draft_version_id = $1", [r.versionId])
    ).rows[0] as { spans: { blockId: string; source: { kind: string } }[] };
    expect(pm.spans.some((s) => s.source.kind === "human")).toBe(true);

    // a snapshot restore point landed beside the live doc (§11.6 storage tier).
    const rps = await db.exec.query(
      `select rp.kind, rp.cause from restore_points rp join live_docs ld on ld.id = rp.live_doc_id
        where ld.draft_id = $1`,
      [r.draftId],
    );
    expect(rps.rows).toEqual([{ kind: "snapshot", cause: "auto" }]);

    // the PRB.06 manual trace emitted on the diff (AC4) — project-scoped here, no run.
    expect(evs.map((e) => e.type)).toContain("revision.move_traced");
  });

  it("AC1 — findings follow the text: a surviving quote re-anchors; a deleted quote lands on Whole piece", async () => {
    // a review's findings filed on the frozen v1.
    const corr = testDeps(300).ids("corr");
    await db.exec.query(
      `insert into correspondence_items(id, project_id, kind, draft_id, run_id, ordinal, delivered_at, artifact_ids)
       values ($1,$2,'review',$3,$4,1, now(), '{}')`,
      [corr, proj.projectId, frozenDraftId, testDeps(301).ids("run")],
    );
    const surviving = testDeps(302).ids("fnd");
    const lost = testDeps(303).ids("fnd");
    const bodyBlock = splitMarkdownBlocks(BASE_MD).find((b) => b.text.includes("draft body"))!;
    await db.exec.query(
      `insert into findings(id, correspondence_id, draft_id, ordinal, kind, severity, origin, title, body, anchor)
       values ($1,$2,$3,1,'issue','major','editor','Keep this','body',$4),
              ($5,$2,$3,2,'issue','minor','editor','Fix that','body',$6)`,
      [
        surviving,
        corr,
        frozenDraftId,
        JSON.stringify({ blockId: bodyBlock.blockId, quote: "The draft body for MR.", startOffset: 0, endOffset: 24, confidence: 1 }),
        lost,
        JSON.stringify({ blockId: bodyBlock.blockId, quote: "a passage that will be deleted", startOffset: 0, endOffset: 30, confidence: 1 }),
      ],
    );

    const md = "# MR\n\nThe draft body for MR.\n\nA new closing line.\n";
    const r = await saveManualRevision(db.exec, deps, {
      workspaceId,
      projectId: proj.projectId,
      draftId: frozenDraftId,
      markdown: md,
      userId: USER,
    });
    expect(r.ok).toBe(true);
    if (!r.ok) return;

    const surv = r.projections.find((p) => p.findingId === surviving)!;
    expect(surv.method).toBe("exact");
    expect(surv.lost).toBe(false);
    const lostP = r.projections.find((p) => p.findingId === lost)!;
    expect(lostP.method).toBe("unresolved");
    expect(lostP.lost).toBe(true);
    expect(lostP.anchor.unanchored).toBe(true); // Whole piece — "passage changed — still applies?"

    // the projection row persisted onto the finding (§11.3 findingProjection shape).
    const f = (
      await db.exec.query("select projections from findings where id = $1", [surviving])
    ).rows[0] as { projections: { draftId: string; anchor: { blockId: string } }[] };
    expect(f.projections.some((p) => p.draftId === r.draftId)).toBe(true);
  });

  it("AC1 — a second save on the working head reuses v(N+1): no re-fork, no second draft.forked", async () => {
    const first = await saveManualRevision(db.exec, deps, {
      workspaceId,
      projectId: proj.projectId,
      draftId: frozenDraftId,
      markdown: "# MR\n\nThe draft body for MR.\n\nEdit one.\n",
      userId: USER,
    });
    expect(first.ok && first.forked).toBe(true);
    if (!first.ok) return;

    const second = await saveManualRevision(db.exec, deps, {
      workspaceId,
      projectId: proj.projectId,
      draftId: first.draftId, // the working head the first save returned
      markdown: "# MR\n\nThe draft body for MR.\n\nEdit two.\n",
      userId: USER,
    });
    expect(second).toMatchObject({ ok: true, forked: false, changed: true, draftId: first.draftId, draftN: 2 });

    // still exactly one working head + one fork event.
    const heads = await db.exec.query(
      "select count(*)::int n from drafts where project_id = $1 and state = 'working'",
      [proj.projectId],
    );
    expect((heads.rows[0] as { n: number }).n).toBe(1);
    const evs = await timelineEvents();
    expect(evs.filter((e) => e.type === "draft.forked")).toHaveLength(1);
    expect(evs.filter((e) => e.type === "revision.move_traced")).toHaveLength(2);
  });

  it("a save to the STALE frozen base id routes to the existing working child — never a second fork", async () => {
    const first = await saveManualRevision(db.exec, deps, {
      workspaceId,
      projectId: proj.projectId,
      draftId: frozenDraftId,
      markdown: "# MR\n\nThe draft body for MR.\n\nEdit one.\n",
      userId: USER,
    });
    expect(first.ok && first.forked).toBe(true);
    if (!first.ok) return;

    // a client that missed the fork response (or a retried beacon) posts to the base id again —
    // it must land on the SAME working child, not fork v3 off the still-frozen base.
    const second = await saveManualRevision(db.exec, deps, {
      workspaceId,
      projectId: proj.projectId,
      draftId: frozenDraftId,
      markdown: "# MR\n\nThe draft body for MR.\n\nEdit two.\n",
      userId: USER,
    });
    expect(second).toMatchObject({ ok: true, forked: false, changed: true, draftId: first.draftId, draftN: 2 });

    const drafts = await db.exec.query(
      "select count(*)::int n from drafts where project_id = $1",
      [proj.projectId],
    );
    expect((drafts.rows[0] as { n: number }).n).toBe(2); // v1 frozen + v2 working — no v3
    const evs = await timelineEvents();
    expect(evs.filter((e) => e.type === "draft.forked")).toHaveLength(1);
  });

  it("an identical save is a no-op: no new version, no restore point, no events", async () => {
    const r = await saveManualRevision(db.exec, deps, {
      workspaceId,
      projectId: proj.projectId,
      draftId: frozenDraftId,
      markdown: BASE_MD,
      userId: USER,
    });
    // the fork still happens (the head is now working) but no new version/event lands.
    expect(r).toMatchObject({ ok: true, forked: true, changed: false, restorePointId: null });
    const evs = await timelineEvents();
    expect(evs.filter((e) => e.type === "revision.move_traced")).toHaveLength(0);
  });

  it("P1.07 — an Apply save marks the spliced block `suggestion_applied` with the finding's run (REQ-SPEC-6)", async () => {
    // a finding filed on the frozen v1 with a suggestion — the Apply splice rewrites its block.
    const runId = testDeps(310).ids("run");
    const corr = testDeps(311).ids("corr");
    await db.exec.query(
      `insert into correspondence_items(id, project_id, kind, draft_id, run_id, ordinal, delivered_at, artifact_ids)
       values ($1,$2,'review',$3,$4,1, now(), '{}')`,
      [corr, proj.projectId, frozenDraftId, runId],
    );
    const findingId = testDeps(312).ids("fnd");
    await db.exec.query(
      `insert into findings(id, correspondence_id, draft_id, ordinal, kind, severity, origin, title, body)
       values ($1,$2,$3,1,'issue','note','editor','Tighten','body')`,
      [findingId, corr, frozenDraftId],
    );

    const md = "# MR\n\nThe suggestion's replacement sentence.\n";
    const splicedBlock = splitMarkdownBlocks(md).find((b) => b.text.includes("replacement"))!;
    const r = await saveManualRevision(db.exec, deps, {
      workspaceId,
      projectId: proj.projectId,
      draftId: frozenDraftId,
      markdown: md,
      userId: USER,
      appliedSuggestions: [{ blockId: splicedBlock.blockId, runId, findingId }],
    });
    expect(r.ok && r.changed).toBe(true);
    if (!r.ok) return;

    const pm = (
      await db.exec.query("select spans from provenance_maps where draft_version_id = $1", [r.versionId])
    ).rows[0] as { spans: { blockId: string; source: { kind: string; runId?: string; findingId?: string } }[] };
    const mark = pm.spans.find((s) => s.blockId === splicedBlock.blockId);
    expect(mark?.source).toEqual({ kind: "suggestion_applied", runId, findingId });
    // the untouched block keeps its normal (human-or-inherited) source.
    expect(pm.spans.find((s) => s.blockId !== splicedBlock.blockId)?.source.kind).not.toBe("suggestion_applied");
  });

  it("rejects a non-frozen, non-human-revision draft (a working agent head is not editable here)", async () => {
    await db.exec.query("update drafts set state = 'working' where id = $1", [frozenDraftId]);
    const r = await saveManualRevision(db.exec, deps, {
      workspaceId,
      projectId: proj.projectId,
      draftId: frozenDraftId,
      markdown: "# x\n",
      userId: USER,
    });
    expect(r).toEqual({ ok: false, reason: "not_editable" });
  });
});
