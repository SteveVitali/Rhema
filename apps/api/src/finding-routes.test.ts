import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrchestratorTestDb,
  seedProject,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "@rhema/orchestrator/testing";
import { InMemoryContentStore } from "@rhema/mirror";
import { splitMarkdownBlocks } from "@rhema/findings-core";
import { createApp, type Principal } from "./index.js";
import type { SqlClient } from "./invite.js";

// P1.07 — the findings-surface routes end-to-end on PGlite (§5.7): Apply splices + records
// accept·applied + marks `suggestion_applied` provenance; promote un-rejects and spawns; "Add to
// obligations" writes a user row; the deep-link resolve returns the dossier anchor; the bulk
// preview/dispatch pair writes only what the preview showed.

let db: OrchestratorTestDb;
let deps: TestDeps;
let sql: SqlClient;
let store: InMemoryContentStore;
let seed: Awaited<ReturnType<typeof seedProject>>;
let app: ReturnType<typeof createApp>;

const principal = (): Principal => ({
  userId: seed.userId,
  workspaceId: seed.workspaceId,
  billingAccountId: seed.billingAccountId,
});

// ids that reach a run-event payload (draft.forked, revision.move_traced) must be ULIDs — the
// write boundary validates them. `deps.ids()` mints sequential ULIDs; the reviewed draft + review
// run get them, while finding ids stay readable (they never enter an event payload).
let RUN: string;
let DRAFT: string;
const CORR = "corr_p7";
const BASE_MD = "# Seed\n\nThe quick brown fox jumps.\n";

/** A frozen reviewed draft with its version in the store + a delivered review over it. */
async function seedReviewedDraft(
  findings: {
    id: string;
    ordinal: number;
    severity?: string;
    title?: string;
    suggestion?: string;
    anchorQuote?: string;
    reconciliation?: string;
    letterSection?: string;
  }[],
) {
  const bodyBlock = splitMarkdownBlocks(BASE_MD).find((b) => b.text.includes("quick"))!;
  const v1 = await store.putText(seed.workspaceId, BASE_MD);
  await db.txRunner.run(seed.workspaceId, async (tx) => {
    await tx.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path)
       values ('art_p7',$1,$2,'draft','shared','drafts/v1.md')`,
      [seed.workspaceId, seed.projectId],
    );
    await tx.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, word_count,
         media_type, created_by, immutable)
       values ('av_p7','art_p7',1,$1,'k',$2,6,'text/markdown','{"kind":"system"}',true)`,
      [v1.sha256, Buffer.byteLength(BASE_MD)],
    );
    await tx.query(
      `update drafts set state = 'frozen', origin = 'agent', promoted_version_id = 'av_p7'
        where id = $1`,
      [DRAFT],
    );
    await tx.query("update artifacts set head_version_id = 'av_p7' where id = 'art_p7'");
    await tx.query(
      `insert into correspondence_items(id, project_id, kind, draft_id, run_id, ordinal, delivered_at, artifact_ids)
       values ($1,$2,'review',$3,$4,1, now(), '{av_p7}')`,
      [CORR, seed.projectId, DRAFT, RUN],
    );
    for (const f of findings) {
      const anchor =
        f.anchorQuote != null
          ? JSON.stringify({
              blockId: bodyBlock.blockId,
              quote: f.anchorQuote,
              startOffset: bodyBlock.text.indexOf(f.anchorQuote),
              endOffset: bodyBlock.text.indexOf(f.anchorQuote) + f.anchorQuote.length,
              confidence: 1,
            })
          : null;
      await tx.query(
        `insert into findings(id, correspondence_id, draft_id, ordinal, kind, severity, origin, title, body,
                              anchor, suggestion, reconciliation, letter_section)
         values ($1,$2,$3,$4,'argument',$5,'editor',$6,'body',$7::jsonb,$8::jsonb,$9,$10)`,
        [
          f.id,
          CORR,
          DRAFT,
          f.ordinal,
          f.severity ?? "major",
          f.title ?? `finding ${f.ordinal}`,
          anchor,
          f.suggestion != null ? JSON.stringify({ replacement: f.suggestion }) : null,
          f.reconciliation ?? null,
          f.letterSection ?? null,
        ],
      );
    }
  });
}

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  sql = { query: (q, p) => db.pg.query(q, p as unknown[]) as Promise<{ rows: unknown[] }> };
  store = new InMemoryContentStore();
  RUN = deps.ids("run");
  DRAFT = deps.ids("dft");
  seed = await seedProject(db, { draftN: 1, draftId: DRAFT });
  app = createApp({ ...deps, principal: () => principal(), db: sql, store });
});
afterEach(() => db.close());

const post = (path: string, body: unknown = {}) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("POST /projects/:id/findings/:fid/apply — the free verb (REQ-SPEC-6)", () => {
  it("splices the suggestion into the head, marks suggestion_applied provenance, records accept·applied", async () => {
    await seedReviewedDraft([
      { id: "f_a", ordinal: 1, severity: "minor", suggestion: "slow", anchorQuote: "quick" },
    ]);
    const res = await post(`/projects/${seed.projectId}/findings/f_a/apply`);
    expect(res.status).toBe(200);
    const dto = (await res.json()) as { ok: boolean; draftId: string; disposition: { kind: string; applied: boolean } };
    expect(dto.ok).toBe(true);
    expect(dto.disposition).toMatchObject({ kind: "accept", applied: true });

    // the working head carries the splice (a fork happened — the base was frozen).
    const head = (
      await db.pg.query(
        `select d.promoted_version_id, d.origin, d.state from drafts d where d.id = $1`,
        [dto.draftId],
      )
    ).rows[0] as { promoted_version_id: string; origin: string; state: string };
    expect(head).toMatchObject({ origin: "human_revision", state: "working" });
    const sha = (
      await db.pg.query("select content_sha256 from artifact_versions where id = $1", [
        head.promoted_version_id,
      ])
    ).rows[0] as { content_sha256: string };
    const text = Buffer.from((await store.get(sha.content_sha256))!).toString("utf8");
    expect(text).toBe("# Seed\n\nThe slow brown fox jumps.\n");

    // provenance: the spliced block is suggestion_applied carrying the review's run.
    const pm = (
      await db.pg.query("select spans from provenance_maps where draft_version_id = $1", [
        head.promoted_version_id,
      ])
    ).rows[0] as { spans: { blockId: string; source: { kind: string; runId?: string; findingId?: string } }[] };
    const spliced = pm.spans.find((s) => s.source.kind === "suggestion_applied");
    expect(spliced?.source).toMatchObject({ runId: RUN, findingId: "f_a" });

    // a minor's accept spawns + routes its obligation (REQ-OBJ-2).
    const obl = (
      await db.pg.query("select state from revision_obligations where finding_id = 'f_a'")
    ).rows[0] as { state: string } | undefined;
    expect(obl?.state).toBe("open");
  });

  it("lock-disables cleanly: no suggestion → 422; already applied → 422; frozen → 409", async () => {
    await seedReviewedDraft([
      { id: "f_nosug", ordinal: 1, anchorQuote: "quick" },
      { id: "f_applied", ordinal: 2, severity: "note", suggestion: "slow", anchorQuote: "quick" },
      { id: "f_frozen", ordinal: 3, severity: "note", suggestion: "slow", anchorQuote: "quick" },
    ]);
    expect(((await post(`/projects/${seed.projectId}/findings/f_nosug/apply`)).status)).toBe(422);

    await db.pg.query(
      `insert into dispositions(id, finding_id, kind, status, applied, by_actor, created_at)
       values ('dsp_a','f_applied','accept','done',true,'{"kind":"user","userId":"u"}',now())`,
    );
    const again = await post(`/projects/${seed.projectId}/findings/f_applied/apply`);
    expect(again.status).toBe(422);
    expect(((await again.json()) as { reason: string }).reason).toBe("already_applied");

    await db.pg.query(
      `insert into dispositions(id, finding_id, kind, status, by_actor, created_at, frozen_at)
       values ('dsp_f','f_frozen','accept','done','{"kind":"user","userId":"u"}',now(),now())`,
    );
    expect((await post(`/projects/${seed.projectId}/findings/f_frozen/apply`)).status).toBe(409);
  });

  it("a cross-workspace finding applies as 404 — never a leak", async () => {
    await seedReviewedDraft([{ id: "f_a", ordinal: 1, severity: "note", suggestion: "x", anchorQuote: "quick" }]);
    expect((await post(`/projects/prj_other/findings/f_a/apply`)).status).toBe(404);
  });
});

describe("POST /projects/:id/findings/:fid/promote (REQ-IDE-26)", () => {
  it("a rejected finding joins the main list; a major spawns its obligation on promote", async () => {
    await seedReviewedDraft([
      { id: "f_r", ordinal: 1, severity: "major", reconciliation: "rejected" },
      { id: "f_k", ordinal: 2, reconciliation: "kept" },
    ]);
    expect((await post(`/projects/${seed.projectId}/findings/f_k/promote`)).status).toBe(409);
    const res = await post(`/projects/${seed.projectId}/findings/f_r/promote`);
    expect(res.status).toBe(200);
    const dto = (await res.json()) as { obligationId?: string };
    expect(dto.obligationId).toBeTruthy();
    const row = (
      await db.pg.query("select reconciliation from findings where id = 'f_r'")
    ).rows[0] as { reconciliation: string };
    expect(row.reconciliation).toBe("kept");
    const obl = (
      await db.pg.query("select state, severity, source from revision_obligations where finding_id = 'f_r'")
    ).rows[0] as { state: string; severity: string; source: string };
    expect(obl).toMatchObject({ state: "open", severity: "major", source: "finding" });
  });

  it("a rejected NOTE promotes without an obligation (notes never spawn)", async () => {
    await seedReviewedDraft([{ id: "f_n", ordinal: 1, severity: "note", reconciliation: "rejected" }]);
    const res = await post(`/projects/${seed.projectId}/findings/f_n/promote`);
    expect(res.status).toBe(200);
    expect((await res.json()) as { obligationId?: string }).not.toMatchObject({ obligationId: expect.anything() });
    const rows = await db.pg.query("select id from revision_obligations where finding_id = 'f_n'");
    expect(rows.rows).toHaveLength(0);
  });
});

describe("POST /projects/:id/findings/:fid/obligations — 'Add to obligations' (REQ-OBJ-9)", () => {
  it("writes a user-sourced obligation, append-only transition, idempotent per root finding", async () => {
    await seedReviewedDraft([{ id: "f_o", ordinal: 1, severity: "note", title: "user-flagged" }]);
    const res = await post(`/projects/${seed.projectId}/findings/f_o/obligations`);
    expect(res.status).toBe(200);
    const { obligationId } = (await res.json()) as { obligationId: string };
    const row = (
      await db.pg.query("select source, state, title from revision_obligations where id = $1", [obligationId])
    ).rows[0] as { source: string; state: string; title: string };
    expect(row).toMatchObject({ source: "user", state: "open", title: "user-flagged" });
    // a second add returns the same obligation — one per root finding.
    const again = await post(`/projects/${seed.projectId}/findings/f_o/obligations`);
    expect(((await again.json()) as { obligationId: string }).obligationId).toBe(obligationId);
  });
});

describe("GET /projects/:id/findings/:fid/resolve — the shared deep link", () => {
  it("returns the dossier anchor for the palette + cross-page links", async () => {
    await seedReviewedDraft([{ id: "f_dl", ordinal: 1 }]);
    const res = await app.request(`/projects/${seed.projectId}/findings/f_dl/resolve`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ findingId: "f_dl", runId: RUN, anchor: "finding-f_dl" });
    expect((await app.request(`/projects/${seed.projectId}/findings/nope/resolve`)).status).toBe(404);
  });
});

describe("bulk preview + dispatch (§5.7 — one consolidated preview before the writes)", () => {
  it("bulk-preview lists the covered rows; bulk defer_minor writes only the undecided minors", async () => {
    await seedReviewedDraft([
      { id: "f_m1", ordinal: 1, severity: "minor" },
      { id: "f_m2", ordinal: 2, severity: "minor" },
      { id: "f_n", ordinal: 3, severity: "note", suggestion: "slow", anchorQuote: "quick" },
    ]);
    await db.pg.query(
      `insert into dispositions(id, finding_id, kind, status, by_actor, created_at)
       values ('dsp_m2','f_m2','accept','proposed','{"kind":"user","userId":"u"}',now())`,
    );

    const prev = await post(`/projects/${seed.projectId}/runs/${RUN}/findings/bulk-preview`, {
      action: "defer_minor",
    });
    expect(prev.status).toBe(200);
    const preview = (await prev.json()) as { total: number; rows: { findingId: string; disposition: string }[] };
    expect(preview.total).toBe(1); // f_m2 already decided — out of the preview
    expect(preview.rows[0]).toMatchObject({ findingId: "f_m1", disposition: "defer" });

    const disp = await post(`/projects/${seed.projectId}/runs/${RUN}/findings/bulk`, { action: "defer_minor" });
    expect(disp.status).toBe(200);
    expect(((await disp.json()) as { applied: string[] }).applied).toEqual(["f_m1"]);
    const d = (
      await db.pg.query("select kind, rationale from dispositions where finding_id = 'f_m1'")
    ).rows[0] as { kind: string; rationale: string };
    expect(d).toEqual({ kind: "defer", rationale: "Not this round" });
  });

  it("bulk apply_notes splices every applyable note in ONE save and dispositions them", async () => {
    await seedReviewedDraft([
      { id: "f_n1", ordinal: 1, severity: "note", suggestion: "slow", anchorQuote: "quick" },
      { id: "f_n2", ordinal: 2, severity: "note", suggestion: "red", anchorQuote: "fox" },
      { id: "f_mj", ordinal: 3, severity: "major", suggestion: "x", anchorQuote: "jumps" },
    ]);
    const res = await post(`/projects/${seed.projectId}/runs/${RUN}/findings/bulk`, { action: "apply_notes" });
    expect(res.status).toBe(200);
    const out = (await res.json()) as { applied: string[]; count: number };
    expect(out.applied.sort()).toEqual(["f_n1", "f_n2"]);

    const head = (
      await db.pg.query(
        `select promoted_version_id from drafts where base_draft_id = $1 and state = 'working'`,
        [DRAFT],
      )
    ).rows[0] as { promoted_version_id: string };
    const sha = (
      await db.pg.query("select content_sha256 from artifact_versions where id = $1", [
        head.promoted_version_id,
      ])
    ).rows[0] as { content_sha256: string };
    const text = Buffer.from((await store.get(sha.content_sha256))!).toString("utf8");
    expect(text).toBe("# Seed\n\nThe slow brown red jumps.\n");
    const disps = await db.pg.query(
      "select finding_id, kind, applied from dispositions where finding_id in ('f_n1','f_n2') order by finding_id",
    );
    expect(disps.rows).toEqual([
      { finding_id: "f_n1", kind: "accept", applied: true },
      { finding_id: "f_n2", kind: "accept", applied: true },
    ]);
    // the major was never covered.
    expect((await db.pg.query("select id from dispositions where finding_id = 'f_mj'")).rows).toHaveLength(0);
  });

  it("an unknown action → 422 on both endpoints", async () => {
    await seedReviewedDraft([{ id: "f_1", ordinal: 1 }]);
    expect(
      (await post(`/projects/${seed.projectId}/runs/${RUN}/findings/bulk-preview`, { action: "nuke" })).status,
    ).toBe(422);
    expect(
      (await post(`/projects/${seed.projectId}/runs/${RUN}/findings/bulk`, { action: "nuke" })).status,
    ).toBe(422);
  });
});

describe("POST /projects/:id/obligations — the palette's free-form obligation (REQ-OBJ-10)", () => {
  it("files a source:'user' standing obligation on the head draft; empty title → 422", async () => {
    await seedReviewedDraft([{ id: "f_1", ordinal: 1 }]);
    const res = await post(`/projects/${seed.projectId}/obligations`, {
      title: "Re-check the census stats",
      severity: "major",
    });
    expect(res.status).toBe(200);
    const dto = (await res.json()) as { ok: boolean; obligationId: string };
    const obl = (
      await db.pg.query("select source, finding_id, severity, title, state from revision_obligations where id = $1", [dto.obligationId])
    ).rows[0] as { source: string; finding_id: string | null; severity: string; title: string; state: string };
    expect(obl).toMatchObject({ source: "user", finding_id: null, severity: "major", title: "Re-check the census stats", state: "open" });
    // the spawn transition is the append-only row (no direct state writes).
    const tr = (
      await db.pg.query("select to_state, cause, by_actor from obligation_transitions where obligation_id = $1", [dto.obligationId])
    ).rows[0] as { to_state: string; cause: string; by_actor: { kind: string } };
    expect(tr).toMatchObject({ to_state: "open", cause: "spawn", by_actor: { kind: "user" } });
    expect((await post(`/projects/${seed.projectId}/obligations`, { title: "" })).status).toBe(422);
    // a bad severity string normalizes to minor rather than 422ing.
    const res2 = await post(`/projects/${seed.projectId}/obligations`, { title: "t", severity: "bogus" });
    expect(res2.status).toBe(200);
  });
});
