import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrchestratorTestDb,
  seedProject,
  seedRun,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "@rhema/orchestrator/testing";
import { lockKeys } from "@rhema/orchestrator";
import { InMemoryContentStore } from "@rhema/mirror";
import { splitMarkdownBlocks } from "@rhema/findings-core";
import { createApp, type Principal } from "./index.js";
import type { SqlClient } from "./invite.js";

// PRB.07 — the source-editor API end-to-end on PGlite: the document read (markdown + lock + findings rail
// with "from Review of vN" labels), the autosave POST (fork on first save, then in-place; 409 while a run
// holds the head), the note→Guidance field, the Cancel-run release, and "Revise using your edits" (review of
// vN + base v(N+1); lost quotes auto-mooted through the obligation machine — REQ-DATA-26).

const BASE_MD = "# Doc\n\nThe pillar stands on the old claim.\n\nA middle section that stays.\n";
const EDITED_MD = "# Doc\n\nThe pillar stands on the old claim.\n\nA middle section that stays.\n\nAdded by hand.\n";

let db: OrchestratorTestDb;
let deps: TestDeps;
let sql: SqlClient;
let store: InMemoryContentStore;
let seed: Awaited<ReturnType<typeof seedProject>>;
let app: ReturnType<typeof createApp>;
let draftId: string; // the frozen, reviewed v1 (ULID ids — event payloads validate idSchema)

const principal = (): Principal => ({
  userId: seed.userId,
  workspaceId: seed.workspaceId,
  billingAccountId: seed.billingAccountId,
});

const url = (suffix: string) => `/projects/${seed.projectId}/editor/${draftId}${suffix}`;
const post = (u: string, body: unknown) =>
  app.request(u, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) });

/** Seed the reviewed v1: artifact + promoted version + frozen draft + a review corr with two findings. */
async function seedReviewedHead() {
  draftId = deps.ids("dft");
  const artId = deps.ids("art");
  const verId = deps.ids("av");
  const corrId = deps.ids("corr");
  const { sha256 } = await store.putText(seed.workspaceId, BASE_MD);
  await db.pg.query(
    `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
     values ($1,$2,$3,'draft','shared','drafts/v1.md',$4)`,
    [artId, seed.workspaceId, seed.projectId, verId],
  );
  await db.pg.query(
    `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
     values ($1,$2,1,$3,'k',$4,'text/markdown',$5::jsonb)`,
    [verId, artId, sha256, Buffer.byteLength(BASE_MD), JSON.stringify({ kind: "agent", runId: deps.ids("run"), draftN: 1 })],
  );
  await db.pg.query(
    `insert into drafts(id, project_id, n, origin, state, promoted_version_id)
     values ($1,$2,1,'agent','frozen',$3)`,
    [draftId, seed.projectId, verId],
  );
  await db.pg.query(
    `insert into correspondence_items(id, project_id, kind, draft_id, run_id, ordinal, delivered_at, artifact_ids)
     values ($1,$2,'review',$3,$4,1, now(), '{}')`,
    [corrId, seed.projectId, draftId, deps.ids("run")],
  );
  const bodyBlock = splitMarkdownBlocks(BASE_MD).find((b) => b.text.includes("middle section"))!;
  const fSurv = deps.ids("fnd");
  const fLost = deps.ids("fnd");
  await db.pg.query(
    `insert into findings(id, correspondence_id, draft_id, ordinal, kind, severity, origin, title, body, anchor)
     values
       ($1,$3,$4,1,'argument','major','editor','middle section works','body',$5),
       ($2,$3,$4,2,'claim','minor','editor','gone passage','body',$6)`,
    [
      fSurv,
      fLost,
      corrId,
      draftId,
      JSON.stringify({ blockId: bodyBlock.blockId, quote: "A middle section that stays.", startOffset: 0, endOffset: 28, confidence: 1 }),
      JSON.stringify({ blockId: bodyBlock.blockId, quote: "this quote no longer exists anywhere", startOffset: 0, endOffset: 37, confidence: 1 }),
    ],
  );
  return { corrId, fSurv, fLost };
}

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  sql = { query: (q, p) => db.pg.query(q, p as unknown[]) as Promise<{ rows: unknown[] }> };
  store = new InMemoryContentStore();
  seed = await seedProject(db);
  app = createApp({ ...deps, principal: () => principal(), db: sql, store });
});
afterEach(() => db.close());

describe("GET /projects/:id/editor/:draftId (the document + lock + findings rail)", () => {
  it("returns the frozen head's markdown, no lock, and findings labeled 'from Review of v1'", async () => {
    await seedReviewedHead();
    const res = await app.request(url(""));
    expect(res.status).toBe(200);
    const dto = (await res.json()) as {
      draftId: string;
      draftN: number;
      state: string;
      markdown: string;
      lock: unknown;
      findings: { findingId: string; sourceLabel: string; method: string; lost: boolean }[];
    };
    expect(dto.draftId).toBe(draftId);
    expect(dto.draftN).toBe(1);
    expect(dto.state).toBe("frozen");
    expect(dto.markdown).toBe(BASE_MD);
    expect(dto.lock).toBeNull();
    expect(dto.findings).toHaveLength(2);
    expect(dto.findings[0]).toMatchObject({ sourceLabel: "from Review of v1", method: "exact", lost: false });
    expect(dto.findings[1]).toMatchObject({ method: "unresolved", lost: true });
  });

  it("404s for a draft outside the principal's workspace (and for a missing draft)", async () => {
    await seedReviewedHead();
    const res = await app.request(`/projects/${seed.projectId}/editor/${deps.ids("dft")}`);
    expect(res.status).toBe(404);
  });
});

describe("POST …/save — the debounced autosave (AC1/AC5; no Save verb)", () => {
  it("forks v2 human_revision on the first save, then saves in place; events land on the timeline", async () => {
    await seedReviewedHead();
    const r1 = await post(`${url("")}/save`, { markdown: EDITED_MD });
    expect(r1.status).toBe(200);
    const s1 = (await r1.json()) as { draftId: string; draftN: number; forked: boolean; sync: string };
    expect(s1).toMatchObject({ draftN: 2, forked: true, sync: "synced" });
    expect(s1.draftId).not.toBe(draftId);

    // the forked head row + the timeline events.
    const head = (await db.pg.query("select origin, state, base_draft_id from drafts where id = $1", [s1.draftId]))
      .rows[0] as { origin: string; state: string; base_draft_id: string };
    expect(head).toMatchObject({ origin: "human_revision", state: "working", base_draft_id: draftId });
    const evs = await db.pg.query("select type from timeline_events where project_id = $1 order by at", [seed.projectId]);
    expect((evs.rows as { type: string }[]).map((e) => e.type)).toEqual(
      expect.arrayContaining(["draft.forked", "revision.move_traced"]),
    );

    // a second autosave updates the same head — no second fork.
    const r2 = await post(`/projects/${seed.projectId}/editor/${s1.draftId}/save`, {
      markdown: `${EDITED_MD}\nMore.\n`,
    });
    const s2 = (await r2.json()) as { draftId: string; forked: boolean };
    expect(s2.draftId).toBe(s1.draftId);
    expect(s2.forked).toBe(false);
  });

  it("a stale base URL stays live after the fork: GET resolves to the child, a second base save does not re-fork", async () => {
    await seedReviewedHead();
    const r1 = await post(`${url("")}/save`, { markdown: EDITED_MD });
    const s1 = (await r1.json()) as { draftId: string; forked: boolean };
    expect(s1.forked).toBe(true);

    // a client that never saw the fork response (old tab, retried beacon) hits the BASE id again —
    // the save lands on the SAME working child; no v3 materializes.
    const r2 = await post(`${url("")}/save`, { markdown: `${EDITED_MD}\nMore.\n` });
    expect(r2.status).toBe(200);
    const s2 = (await r2.json()) as { draftId: string; draftN: number; forked: boolean };
    expect(s2).toMatchObject({ draftId: s1.draftId, draftN: 2, forked: false });
    const drafts = await db.pg.query("select count(*)::int n from drafts where project_id = $1", [
      seed.projectId,
    ]);
    expect((drafts.rows[0] as { n: number }).n).toBe(2);

    // …and a stale /edit/:baseId load serves the child's text + id (the user's edits are never invisible).
    const res = await app.request(url(""));
    const doc = (await res.json()) as { draftId: string; draftN: number; state: string; markdown: string };
    expect(doc).toMatchObject({ draftId: s1.draftId, draftN: 2, state: "working" });
    expect(doc.markdown).toContain("More.");
  });

  it("409s while a run holds the head (read-only during runs — §6.3), and saves after the lock clears", async () => {
    await seedReviewedHead();
    await seedRun(db, {
      runId: "run_writer",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "draft",
      state: "running",
      lockSet: [lockKeys.nsWrite("writer", seed.projectId)],
    });
    const locked = await post(`${url("")}/save`, { markdown: EDITED_MD });
    expect(locked.status).toBe(409);
    expect(((await locked.json()) as { lock: { kind: string } }).lock.kind).toBe("writer");

    // the banner's Cancel-run releases the lock (the run cancels; the writer pin clears).
    const rel = await post(`${url("")}/cancel-run`, {});
    expect(rel.status).toBe(200);
    const run = (await db.pg.query("select state from runs where id = 'run_writer'")).rows[0] as { state: string };
    expect(run.state).toBe("cancelled");

    const ok = await post(`${url("")}/save`, { markdown: EDITED_MD });
    expect(ok.status).toBe(200);
  });
});

describe("POST …/note — the one note field becomes Guidance (REQ-DATA-41 beta)", () => {
  it("captures a project-scope guidance row narrowed to revise", async () => {
    await seedReviewedHead();
    const res = await post(`${url("")}/note`, { text: "watch the middle section" });
    expect(res.status).toBe(201);
    const g = (await db.pg.query("select source, body, standing, workflows from guidance where project_id = $1", [
      seed.projectId,
    ])).rows[0] as { source: string; body: string; standing: boolean; workflows: string[] };
    expect(g).toMatchObject({ source: "inline_comment", body: "watch the middle section", standing: true });
  });
});

describe("POST …/revise — 'Revise using your edits' (REQ-DATA-26)", () => {
  it("seeds review=v1 review + base=v2 head, and auto-moots the lost finding's obligation", async () => {
    const { fLost } = await seedReviewedHead();
    // the lost finding's open obligation (mooted pending triage).
    const oblId = deps.ids("obl");
    const corrId = (
      await db.pg.query("select correspondence_id from findings where id = $1", [fLost])
    ).rows[0] as { correspondence_id: string };
    await db.pg.query(
      `insert into revision_obligations(id, project_id, source, severity, kind, title, state, finding_id, created_by)
       values ($1,$2,'finding','minor','claim','gone passage','open',$3,'{"kind":"system"}'::jsonb)`,
      [oblId, seed.projectId, fLost],
    );
    await db.pg.query(
      `insert into obligation_findings(obligation_id, finding_id, correspondence_id, relation)
       values ($1,$2,$3,'root')`,
      [oblId, fLost, corrId.correspondence_id],
    );

    // the human saves their edits → v2 working head.
    const saved = await post(`${url("")}/save`, { markdown: EDITED_MD });
    const headId = ((await saved.json()) as { draftId: string }).draftId;

    const res = await post(`/projects/${seed.projectId}/editor/${headId}/revise`, {});
    expect(res.status).toBe(201);
    const body = (await res.json()) as { runId: string; state: string; mootedFindingIds: string[] };
    expect(body.state).toBe("queued");
    expect(body.mootedFindingIds).toEqual([fLost]);

    // a stale form action still bound to the frozen base resolves to the working child too — if the route
    // hadn't followed the child it would 409 `not_a_human_revision`; instead the idempotency key dedupes
    // the re-POST to the SAME run (the revise-edits key is on the resolved head id).
    const stale = await post(`${url("")}/revise`, {});
    expect(stale.status).toBe(200);
    const staleBody = (await stale.json()) as { runId: string; deduped: boolean };
    expect(staleBody.deduped).toBe(true);
    expect(staleBody.runId).toBe(body.runId);

    // the obligation mooted through the closed-world machine (transition row, not a state write).
    const obl = (await db.pg.query("select state from revision_obligations where id = $1", [oblId]))
      .rows[0] as { state: string };
    expect(obl.state).toBe("mooted");
    const tr = (
      await db.pg.query("select to_state, cause from obligation_transitions where obligation_id = $1", [oblId])
    ).rows[0] as { to_state: string; cause: string };
    expect(tr).toMatchObject({ to_state: "mooted", cause: "moot" });

    // the run carries review-of-vN + the manual-revision marker; its lock set reads the v2 head.
    const run = (
      await db.pg.query("select inputs, lock_set from runs where id = $1", [body.runId])
    ).rows[0] as { inputs: { priorReviewId: string; manualRevision: { baseDraftId: string } }; lock_set: string[] };
    expect(run.inputs.priorReviewId).toBeDefined();
    expect(run.inputs.manualRevision.baseDraftId).toBe(headId);
    expect(run.lock_set).toContain(lockKeys.draftRead(headId));
  });
});
