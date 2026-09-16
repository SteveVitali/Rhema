import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrchestratorTestDb,
  seedProject,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "@rhema/orchestrator/testing";
import { InMemoryContentStore } from "@rhema/mirror";
import { createApp, type Principal } from "./index.js";
import { computeReReviewSeed } from "./what-changed.js";
import type { SqlClient } from "./invite.js";

// PRB.06 — the revision surfaces end-to-end on PGlite (AC1/AC5): the What-changed GET assembles the
// server-side view (move card joined through the evidence anchor, the Unlinked group, the rebutted card,
// the strip from obligation rows), and the hunk-comment POST lands a `Guidance` row (source
// inline_comment, project scope, `workflows: [revise]`) the next Revise consumes (§6.5).

let db: OrchestratorTestDb;
let deps: TestDeps;
let sql: SqlClient;
let store: InMemoryContentStore;
let seed: Awaited<ReturnType<typeof seedProject>>;
let app: ReturnType<typeof createApp>;

const REVIEW_CORR = "01J9REVIEW00000000000000001";
const RESPONSE_CORR = "01J9RESPONSE0000000000000001";

const principal = (): Principal => ({
  userId: seed.userId,
  workspaceId: seed.workspaceId,
  billingAccountId: seed.billingAccountId,
});

/** Seed the two-version dossier: base draft (frozen, promoted v2 text) → review + response corrs → v3
 *  (the response's revision) + the frozen response-ledger artifact on the response's artifact_ids. */
async function seedResponseDossier() {
  const beforeText = "# Draft\n\nThe pillar stands on the old claim.\n\nA middle section that stays.\n";
  const afterText =
    "# Draft\n\nThe pillar stands on the restated claim.\n\nA middle section that stays.\n\nAn extra paragraph.\n";
  const before = await store.putText(seed.workspaceId, beforeText);
  const after = await store.putText(seed.workspaceId, afterText);
  const ledger = {
    sidecar: "response_ledger",
    version: 1,
    entries: [
      {
        findingOrdinal: 1,
        disposition: { kind: "accept", status: "verified", moveOrdinal: 1, actor: "drafter" },
        anchor: { blockId: "b2", quote: "restated claim", startOffset: 0, endOffset: 0, confidence: 1 },
      },
      {
        findingOrdinal: 2,
        disposition: { kind: "rebut", status: "done", rationale: "the stat is sourced in §2", actor: "drafter" },
      },
    ],
    moves: [{ ordinal: 1, title: "Restate the pillar", type: "argument" }],
  };
  const ledgerBlob = await store.putText(seed.workspaceId, JSON.stringify(ledger));

  await db.pg.query(
    `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
     values
       ('art_v2',$1,$2,'draft','shared','drafts/v2.md','av_v2'),
       ('art_v3',$1,$2,'draft','shared','drafts/v3.md','av_v3'),
       ('art_ledger',$1,$2,'sidecar','run','correspondence/response-ledger.json','av_ledger')`,
    [seed.workspaceId, seed.projectId],
  );
  await db.pg.query(
    `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
     values
       ('av_v2','art_v2',1,$1,'k',40,'text/markdown','{"kind":"system"}'::jsonb),
       ('av_v3','art_v3',1,$2,'k',60,'text/markdown','{"kind":"system"}'::jsonb),
       ('av_ledger','art_ledger',1,$3,'k',600,'application/json','{"kind":"system"}'::jsonb)`,
    [before.sha256, after.sha256, ledgerBlob.sha256],
  );
  // the base draft freezes at v2's text; the response's v3 is its promoted working head.
  await db.pg.query(
    `update drafts set state = 'frozen', promoted_version_id = 'av_v2' where id = $1`,
    [seed.draftId],
  );
  await db.pg.query(
    `insert into drafts(id, project_id, n, origin, state, base_draft_id, promoted_version_id)
     values ('dft_v3',$1,3,'response_to_review','working',$2,'av_v3')`,
    [seed.projectId, seed.draftId],
  );
  // the review (one finding the move answers, one the response rebuts) + the response corr.
  await db.pg.query(
    `insert into correspondence_items(id, project_id, kind, draft_id, run_id, delivered_at, artifact_ids)
     values ($1,$2,'review',$3,'run_rev', now(), '{}')`,
    [REVIEW_CORR, seed.projectId, seed.draftId],
  );
  await db.pg.query(
    `insert into findings(id, correspondence_id, draft_id, ordinal, kind, severity, origin, title, body)
     values
       ('fnd_1',$1,$2,1,'argument','major','editor','weak pillar','body'),
       ('fnd_2',$1,$2,2,'claim','minor','editor','unsupported stat','body')`,
    [REVIEW_CORR, seed.draftId],
  );
  await db.pg.query(
    `insert into correspondence_items(id, project_id, kind, draft_id, run_id, prior_review_id, delivered_at, artifact_ids)
     values ($1,$2,'response',$3,'run_resp',$4, now(), '{av_v3,av_ledger}')`,
    [RESPONSE_CORR, seed.projectId, seed.draftId, REVIEW_CORR],
  );
  // one still-open obligation → the strip's "1 still open".
  await db.pg.query(
    `insert into revision_obligations(id, project_id, source, severity, title, state, created_by)
     values ('obl_open',$1,'finding','major','a lingering debt','open','{"kind":"system"}'::jsonb)`,
    [seed.projectId],
  );
}

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  sql = { query: (q, p) => db.pg.query(q, p as unknown[]) as Promise<{ rows: unknown[] }> };
  store = new InMemoryContentStore();
  seed = await seedProject(db, { draftN: 2 });
  app = createApp({ ...deps, principal: () => principal(), db: sql, store });
});
afterEach(() => db.close());

describe("GET /projects/:id/responses/:cid/what-changed (§5.8)", () => {
  it("assembles the server-joined view: move card + unlinked hunk + rebutted card + strip", async () => {
    await seedResponseDossier();
    const res = await app.request(`/projects/${seed.projectId}/responses/${RESPONSE_CORR}/what-changed`);
    expect(res.status).toBe(200);
    const dto = (await res.json()) as {
      responseId: string;
      reviewId: string;
      beforeN: number;
      afterN: number;
      view: {
        strip: { addressed: number; rebutted: number; stillOpen: number; moves: number; hunks: number };
        moves: { moveId: string; title: string; hunks: { id: string }[]; findings: { findingOrdinal: number }[] }[];
        unlinked: { hunks: { id: string }[] };
        rebutted: { findingOrdinal: number; rationale: string }[];
      };
    };
    expect(dto.responseId).toBe(RESPONSE_CORR);
    expect(dto.reviewId).toBe(REVIEW_CORR);
    expect(dto.beforeN).toBe(2);
    expect(dto.afterN).toBe(3);

    // two hunks: the edited pillar (claimed by Move 1's evidence anchor) + the unclaimed addition.
    expect(dto.view.moves.length).toBe(1);
    expect(dto.view.moves[0]).toMatchObject({ moveId: "M1", title: "Restate the pillar" });
    expect(dto.view.moves[0]!.hunks.map((h) => h.id)).toEqual(["h1"]);
    expect(dto.view.moves[0]!.findings[0]).toMatchObject({ findingOrdinal: 1 });
    expect(dto.view.unlinked.hunks.map((h) => h.id)).toEqual(["h2"]);
    expect(dto.view.rebutted).toEqual([
      {
        findingOrdinal: 2,
        findingId: "fnd_2",
        title: "unsupported stat",
        severity: "minor",
        rationale: "the stat is sourced in §2",
      },
    ]);
    // the strip reads obligation rows: nothing routed on this run, one still-open row.
    expect(dto.view.strip).toMatchObject({ addressed: 0, rebutted: 0, stillOpen: 1, moves: 1, hunks: 2 });
  });

  it("404s on a non-response correspondence", async () => {
    await seedResponseDossier();
    const res = await app.request(`/projects/${seed.projectId}/responses/${REVIEW_CORR}/what-changed`);
    expect(res.status).toBe(404);
  });
});

describe("POST …/hunks/:hunkId/comments — hunk comments → Guidance (§6.5)", () => {
  it("captures a Guidance row anchored to the hunk's block for the next Revise", async () => {
    await seedResponseDossier();
    const res = await app.request(
      `/projects/${seed.projectId}/responses/${RESPONSE_CORR}/hunks/h1/comments`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "tighten the second sentence" }),
      },
    );
    expect(res.status).toBe(201);
    const dto = (await res.json()) as { guidanceId: string; hunkId: string };
    expect(dto.hunkId).toBe("h1");

    const row = (
      await db.pg.query(
        "select source, body, standing, workflows, anchors, run_id from guidance where id = $1",
        [dto.guidanceId],
      )
    ).rows[0] as {
      source: string;
      body: string;
      standing: boolean;
      workflows: string[];
      anchors: { blockId: string; quote: string }[];
      run_id: string | null;
    };
    expect(row.source).toBe("inline_comment");
    expect(row.body).toBe("tighten the second sentence");
    expect(row.standing).toBe(true); // project scope — standing guidance for the next Revise
    expect(row.workflows).toEqual(["revise"]);
    expect(row.run_id).toBeNull();
    expect(row.anchors[0]!.blockId).toBe("b2"); // the after-side block of hunk h1
    expect(row.anchors[0]!.quote).toContain("restated claim");
  });

  it("rejects an empty comment and an unknown hunk", async () => {
    await seedResponseDossier();
    const base = `/projects/${seed.projectId}/responses/${RESPONSE_CORR}/hunks`;
    const empty = await app.request(`${base}/h1/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "   " }),
    });
    expect(empty.status).toBe(400);
    const unknown = await app.request(`${base}/h99/comments`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: "hello" }),
    });
    expect(unknown.status).toBe(404);
  });
});

// PRB.06 AC4 — the re-review seed: `prior_review` + `changed_since` computed server-side from the store's
// bytes; a head draft of origin 'human_revision' marks every touched block a humanAdded/unverifiable claim
// placeholder (REQ-DATA-25; REQ-PROD-11).
describe("computeReReviewSeed — the re-review inputs (REQ-DATA-25)", () => {
  it("a human_revision head marks touched blocks humanAdded + unverifiable; an agent head does not", async () => {
    await seedResponseDossier(); // review corr on the frozen base draft (promoted av_v2 text)
    // a human fork of the frozen head: v4, origin human_revision, promoted to the edited bytes.
    const human = await store.putText(
      seed.workspaceId,
      "# Draft\n\nThe pillar stands on the old claim.\n\nA middle section that stays.\n\nA hand-written coda.\n",
    );
    await db.pg.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
       values ('av_v4','art_v3',2,$1,'k',80,'text/markdown','{"kind":"user","userId":"u_1"}'::jsonb)`,
      [human.sha256],
    );
    // dft_v3 is still 'working' — freeze it first (one working head per project).
    await db.pg.query(`update drafts set state = 'frozen' where id = 'dft_v3'`);
    await db.pg.query(
      `insert into drafts(id, project_id, n, origin, state, base_draft_id, promoted_version_id)
       values ('dft_v4',$1,4,'human_revision','working','dft_v3','av_v4')`,
      [seed.projectId],
    );

    const seedOut = await db.txRunner.run(seed.workspaceId, (tx) =>
      computeReReviewSeed(tx, store, { projectId: seed.projectId, headDraftId: "dft_v4" }),
    );
    expect(seedOut).not.toBeNull();
    expect(seedOut!.priorReviewId).toBe(REVIEW_CORR); // the latest review is the re-review's prior
    // the human-added coda block arrives as a humanAdded/unverifiable claim placeholder.
    expect(seedOut!.changedSince.humanAddedClaims.length).toBe(1);
    expect(seedOut!.changedSince.humanAddedClaims[0]).toMatchObject({
      humanAdded: true,
      verdict: "unverifiable",
      text: "A hand-written coda.",
    });
    expect(seedOut!.changedSince.summary.added).toBe(1);

    // the same seed against the AGENT revision head (dft_v3) carries NO placeholders.
    const agentSeed = await db.txRunner.run(seed.workspaceId, (tx) =>
      computeReReviewSeed(tx, store, { projectId: seed.projectId, headDraftId: "dft_v3" }),
    );
    expect(agentSeed!.changedSince.humanAddedClaims).toEqual([]);
  });
});
