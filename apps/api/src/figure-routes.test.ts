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
import type { SqlClient } from "./invite.js";

// P1.13 — the Figure surface's server side (§7.5; REQ-VIZ-1/2/9…12): the pane + card DTOs (badge
// text verbatim, readiness), the field PATCH (alt ≤250), the insert-as-proposal lifecycle
// (propose → ONE-tx Accept splicing through saveManualRevision — a frozen draft forks v(N+1);
// Reject keeps the asset), the 0-cr type-chip spec edit, a version restore, and the lazy PNG.

let db: OrchestratorTestDb;
let deps: TestDeps;
let sql: SqlClient;
let store: InMemoryContentStore;
let seed: Awaited<ReturnType<typeof seedProject>>;
let app: ReturnType<typeof createApp>;

const FIG_ID = "01ARZ3NDEKTSV4RRFFQ69G5FBF";

const principal = (): Principal => ({
  userId: seed.userId,
  workspaceId: seed.workspaceId,
  billingAccountId: seed.billingAccountId,
});

const get = (path: string) => app.request(path);
const postJson = (path: string, body: Record<string, unknown> = {}) =>
  app.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
const patchJson = (path: string, body: Record<string, unknown>) =>
  app.request(path, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  sql = { query: (q, p) => db.pg.query(q, p as unknown[]) as Promise<{ rows: unknown[] }> };
  store = new InMemoryContentStore();
  seed = await seedProject(db, {
    userId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    workspaceId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
    billingAccountId: "01ARZ3NDEKTSV4RRFFQ69G5FAX",
    projectId: "01ARZ3NDEKTSV4RRFFQ69G5FAY",
  });
  app = createApp({
    ...deps,
    principal: () => principal(),
    db: sql,
    contentStore: store,
  });
});
afterEach(() => db.close());

/** A mirror file with committed head bytes in the in-memory store (artifact + head version). */
async function seedMirrorFile(path: string, kind: string, text: string, idSuffix: string, mediaType = "text/markdown") {
  const { sha256 } = await store.putText(seed.workspaceId, text);
  const artId = `art_${idSuffix}`;
  const verId = `av_${idSuffix}`;
  await db.pg.query(
    `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
     values ($1,$2,$3,$4,'shared',$5,$6)`,
    [artId, seed.workspaceId, seed.projectId, kind, path, verId],
  );
  await db.pg.query(
    `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
     values ($1,$2,1,$3,'k',$4,$5,'{}'::jsonb)`,
    [verId, artId, sha256, Buffer.byteLength(text), mediaType],
  );
  return { artId, verId, sha256 };
}

const VEGA_SPEC = JSON.stringify({
  $schema: "https://vega.github.io/schema/vega-lite/v5.json",
  mark: "bar",
  data: { values: [{ group: "a", score: 0.7 }] },
  encoding: { x: { field: "group", type: "nominal" }, y: { field: "score", type: "quantitative" } },
});

/** Seed a figures row (+ its spec/data/provenance heads) in the §7.5 layout. */
async function seedFigure(over: {
  alt?: string | null;
  sourceLine?: string | null;
  specKind?: string;
  provenance?: Record<string, unknown>;
  pendingProposal?: Record<string, unknown> | null;
  insertedInDraftId?: string | null;
} = {}) {
  const specKind = over.specKind ?? "vega_lite";
  const specFile = specKind === "vega_lite" ? "spec.vl.json" : specKind === "mermaid" ? "diagram.mmd" : "table.md";
  const spec = await seedMirrorFile(
    `assets/figures/${FIG_ID}/${specFile}`,
    "figure",
    specKind === "vega_lite" ? VEGA_SPEC : specKind === "mermaid" ? "flowchart LR\na-->b" : "| a | b |\n|---|---|\n| 1 | 2 |",
    `figspec`,
    specKind === "table" ? "text/markdown" : "application/json",
  );
  const data = await seedMirrorFile(`assets/figures/${FIG_ID}/data.csv`, "figure", "group,score\na,0.7\n", "figdata", "text/csv");
  const prov = over.provenance ?? {
    kind: "claim_ledger",
    refs: [{ claimId: "01ARZ3NDEKTSV4RRFFQ69G5FC1" }],
    computedBy: "drafter",
    verification: "unverified",
  };
  await seedMirrorFile(
    `assets/figures/${FIG_ID}/provenance.json`,
    "figure",
    JSON.stringify(prov),
    "figprov",
    "application/json",
  );
  await db.pg.query(
    `insert into figures(id, project_id, artifact_id, spec_kind, spec_version_id, data_version_id,
       caption, alt, source_line, provenance, inserted_in_draft_id, pending_proposal)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12::jsonb)`,
    [
      FIG_ID,
      seed.projectId,
      spec.artId,
      specKind,
      spec.verId,
      data.verId,
      "Scores by group.",
      over.alt === undefined ? "Bar chart of visibility scores." : over.alt,
      over.sourceLine === undefined ? "The review's claim ledger." : over.sourceLine,
      JSON.stringify(prov),
      over.insertedInDraftId ?? null,
      over.pendingProposal ? JSON.stringify(over.pendingProposal) : null,
    ],
  );
  await db.pg.query(
    `insert into figure_versions(id, figure_id, ordinal, spec_version_id, data_version_id, request, render_status)
     values ('figv_1',$1,1,$2,$3,'initial','rendered')`,
    [FIG_ID, spec.verId, data.verId],
  );
  return { spec, data };
}

/** A draft row + its `drafts/v<N>.md` head in the store (state controls the fork path). The draft
 *  id must be ULID-shaped — the fork path emits `draft.forked`, whose payload validates ids. */
const DRAFT_IDS: Record<number, string> = {
  3: "01ARZ3NDEKTSV4RRFFQ69G5FD3",
  4: "01ARZ3NDEKTSV4RRFFQ69G5FD4",
};
async function seedDraft(n: number, state: "working" | "frozen", markdown: string, origin = "human_revision") {
  const head = await seedMirrorFile(`drafts/v${n}.md`, "draft", markdown, `draft${n}`);
  const draftId = DRAFT_IDS[n] ?? `dft_${seed.projectId}_${n}`;
  await db.pg.query(
    `insert into drafts(id, project_id, n, origin, state, promoted_version_id, frozen_at, frozen_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`,
    [
      draftId,
      seed.projectId,
      n,
      origin,
      state,
      head.verId,
      state === "frozen" ? new Date() : null,
      state === "frozen" ? JSON.stringify({ kind: "user", userId: seed.userId }) : null,
    ],
  );
  return { draftId, head };
}

describe("the Figures pane + card DTOs", () => {
  it("GET /figures lists rows with the verbatim badge text + version + insert state", async () => {
    await seedFigure({ provenance: { kind: "none", refs: [], computedBy: "drafter", verification: "unverified" } });
    const res = await get(`/projects/${seed.projectId}/figures`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as { figures: { id: string; badgeText: string | null; n: number; specKind: string }[] };
    expect(body.figures).toHaveLength(1);
    expect(body.figures[0]!.id).toBe(FIG_ID);
    expect(body.figures[0]!.badgeText).toBe("[unverified data]");
    expect(body.figures[0]!.n).toBe(1);
    expect(body.figures[0]!.specKind).toBe("vega_lite");
  });

  it("GET /figures/:figureId returns the card — files, provenance, versions, readiness", async () => {
    await seedFigure();
    const res = await get(`/projects/${seed.projectId}/figures/${FIG_ID}`);
    expect(res.status).toBe(200);
    const card = (await res.json()) as {
      specKind: string;
      files: { spec: string | null; dataCsv: string | null };
      provenance: { kind: string };
      readiness: { ok: boolean };
      versions: { n: number; request: string | null }[];
    };
    expect(card.specKind).toBe("vega_lite");
    expect(card.files.spec).toContain('"mark":"bar"');
    expect(card.files.dataCsv).toContain("group,score");
    expect(card.provenance.kind).toBe("claim_ledger");
    expect(card.readiness.ok).toBe(true);
    expect(card.versions[0]!.request).toBe("initial");
  });

  it("404s for a figure in no project / a missing id", async () => {
    const res = await get(`/projects/${seed.projectId}/figures/fig_gone`);
    expect(res.status).toBe(404);
  });
});

describe("the card's field edits (PATCH)", () => {
  it("writes title/caption/alt/sourceLine; an alt >250 is 422", async () => {
    await seedFigure({ alt: null, sourceLine: null });
    const res = await patchJson(`/projects/${seed.projectId}/figures/${FIG_ID}`, {
      caption: "New cap.",
      alt: "Alt.",
      sourceLine: "A source.",
    });
    expect(res.status).toBe(200);
    const card = (await res.json()) as { alt: string; sourceLine: string; readiness: { ok: boolean } };
    expect(card.alt).toBe("Alt.");
    expect(card.sourceLine).toBe("A source.");
    expect(card.readiness.ok).toBe(true);

    const tooLong = await patchJson(`/projects/${seed.projectId}/figures/${FIG_ID}`, { alt: "x".repeat(251) });
    expect(tooLong.status).toBe(422);
    expect(((await tooLong.json()) as { error: string }).error).toBe("alt_too_long");
  });
});

describe("insert-as-proposal — propose → Accept/Reject", () => {
  it("propose refuses a not-ready figure (alt + source line gate, REQ-VIZ-2)", async () => {
    await seedFigure({ alt: null });
    const res = await postJson(`/projects/${seed.projectId}/figures/${FIG_ID}/proposals`, { draftId: "d_any" });
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("figure_not_ready");
  });

  it("propose writes the pending card with the block markdown (marker + footnoted source); nothing touches the draft", async () => {
    await seedFigure();
    const { draftId } = await seedDraft(3, "frozen", "Intro paragraph.\n\nSecond paragraph.\n");
    const res = await postJson(`/projects/${seed.projectId}/figures/${FIG_ID}/proposals`, {
      draftId,
      afterBlockId: "b1",
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      ok: true;
      pendingProposal: { draftId: string; afterBlockId: string | null; version: number; markdown: string };
      block: string;
    };
    expect(body.pendingProposal.draftId).toBe(draftId);
    expect(body.pendingProposal.afterBlockId).toBe("b1");
    expect(body.block).toContain(`asset://fig_${FIG_ID}`);
    expect(body.block).toContain(`<!-- rhema:figure id=fig_${FIG_ID} version=1 -->`);
    expect(body.block).toContain("Source: The review's claim ledger.");
    // the draft is untouched — no new version was written
    const v = await db.pg.query(`select promoted_version_id from drafts where id = $1`, [draftId]);
    expect((v.rows[0] as { promoted_version_id: string }).promoted_version_id).toBe("av_draft3");
  });

  it("Accept on a FROZEN draft forks v(N+1) — the frozen markdown never mutates (REQ-VIZ-10/REQ-DATA-24)", async () => {
    const head = await seedMirrorFile("drafts/v3.md", "draft", "Intro paragraph.\n\nSecond paragraph.\n", "draft3");
    const draftId = DRAFT_IDS[3]!;
    await db.pg.query(
      `insert into drafts(id, project_id, n, origin, state, promoted_version_id, frozen_at, frozen_by)
       values ($1,$2,3,'agent','frozen',$3,now(),'{"kind":"user"}'::jsonb)`,
      [draftId, seed.projectId, head.verId],
    );
    await seedFigure({
      pendingProposal: {
        draftId,
        afterBlockId: "b1",
        version: 1,
        markdown: `![Alt.](asset://fig_${FIG_ID})\n*Figure 1. Scores.[^fig1]*\n<!-- rhema:figure id=fig_${FIG_ID} version=1 -->\n[^fig1]: Source: The review's claim ledger.`,
        at: "2026-01-01T00:00:00Z",
      },
    });
    const res = await postJson(`/projects/${seed.projectId}/figures/${FIG_ID}/proposals/accept`);
    expect(res.status).toBe(200);
    const out = (await res.json()) as {
      ok: true;
      inserted: { draftId: string; draftN: number; forked: boolean };
    };
    expect(out.inserted.forked).toBe(true);
    expect(out.inserted.draftN).toBe(4);
    expect(out.inserted.draftId).not.toBe(draftId);
    // the frozen draft's promoted version is UNCHANGED — the fork carries the splice
    const frozen = (await db.pg.query(`select promoted_version_id from drafts where id = $1`, [draftId]))
      .rows[0] as { promoted_version_id: string };
    expect(frozen.promoted_version_id).toBe(head.verId);
    // the fork's head markdown has the block spliced after the b1 anchor
    const fork = (
      await db.pg.query(`select promoted_version_id from drafts where id = $1`, [out.inserted.draftId])
    ).rows[0] as { promoted_version_id: string };
    const forkSha = (
      await db.pg.query(`select content_sha256 from artifact_versions where id = $1`, [fork.promoted_version_id])
    ).rows[0] as { content_sha256: string };
    const forkMd = Buffer.from((await store.get(forkSha.content_sha256))!).toString("utf8");
    expect(forkMd).toContain("Intro paragraph.");
    expect(forkMd.indexOf("Intro paragraph.")).toBeLessThan(forkMd.indexOf(`asset://fig_${FIG_ID}`));
    expect(forkMd.indexOf(`asset://fig_${FIG_ID}`)).toBeLessThan(forkMd.indexOf("Second paragraph."));
    // the figure row flips to inserted; the proposal clears
    const fig = (await db.pg.query(`select inserted_in_draft_id, pending_proposal from figures where id = $1`, [FIG_ID]))
      .rows[0] as { inserted_in_draft_id: string; pending_proposal: unknown };
    expect(fig.inserted_in_draft_id).toBe(out.inserted.draftId);
    expect(fig.pending_proposal).toBeNull();
    // figure.accepted landed on the timeline
    const ev = await db.pg.query(`select type from timeline_events where project_id = $1 and type = 'figure.accepted'`, [
      seed.projectId,
    ]);
    expect(ev.rows).toHaveLength(1);
  });

  it("Accept without a pending proposal is 409; Reject clears the card and keeps the asset", async () => {
    await seedFigure();
    const noPending = await postJson(`/projects/${seed.projectId}/figures/${FIG_ID}/proposals/accept`);
    expect(noPending.status).toBe(409);

    const { draftId } = await seedDraft(3, "frozen", "Para.\n");
    await postJson(`/projects/${seed.projectId}/figures/${FIG_ID}/proposals`, { draftId });
    const rej = await postJson(`/projects/${seed.projectId}/figures/${FIG_ID}/proposals/reject`);
    expect(rej.status).toBe(200);
    const fig = (
      await db.pg.query(`select pending_proposal, inserted_in_draft_id from figures where id = $1`, [FIG_ID])
    ).rows[0] as { pending_proposal: unknown; inserted_in_draft_id: string | null };
    expect(fig.pending_proposal).toBeNull();
    expect(fig.inserted_in_draft_id).toBeNull(); // the asset stays in working figures
  });
});

describe("the card-owned iterates — the 0-cr type chip + restore", () => {
  it("a chip edit rewrites the spec's mark, appends figure_versions, and enqueues figure.render", async () => {
    await seedFigure();
    const res = await postJson(`/projects/${seed.projectId}/figures/${FIG_ID}/spec-edit`, { mark: "line" });
    expect(res.status).toBe(200);
    const out = (await res.json()) as { ok: true; n: number };
    expect(out.n).toBe(2);
    // the head spec's mark changed
    const specV = (
      await db.pg.query(`select spec_version_id from figures where id = $1`, [FIG_ID])
    ).rows[0] as { spec_version_id: string };
    const sha = (
      await db.pg.query(`select content_sha256 from artifact_versions where id = $1`, [specV.spec_version_id])
    ).rows[0] as { content_sha256: string };
    const spec = JSON.parse(Buffer.from((await store.get(sha.content_sha256))!).toString("utf8")) as { mark: string };
    expect(spec.mark).toBe("line");
    // the render job queued (the worker renders — never the api itself)
    expect(deps.queue.ofName("figure.render").length).toBe(1);
    // a non-vega figure declines the chip
    await db.pg.query(`update figures set spec_kind = 'mermaid' where id = $1`, [FIG_ID]);
    const declined = await postJson(`/projects/${seed.projectId}/figures/${FIG_ID}/spec-edit`, { mark: "arc" });
    expect(declined.status).toBe(409);
    expect(((await declined.json()) as { error: string }).error).toBe("chip_not_supported");
  });

  it("restore copies the version's spec/data/provenance back to head as a NEW version + re-renders", async () => {
    const { spec } = await seedFigure();
    // the v1 snapshot under versions/1/
    const v1Spec = JSON.stringify({ mark: "point", data: { values: [] } });
    await seedMirrorFile(`assets/figures/${FIG_ID}/versions/1/spec.vl.json`, "figure", v1Spec, "figv1spec", "application/json");
    const res = await postJson(`/projects/${seed.projectId}/figures/${FIG_ID}/versions/1/restore`);
    expect(res.status).toBe(200);
    const vrow = (
      await db.pg.query(`select ordinal, request from figure_versions where figure_id = $1 order by ordinal desc limit 1`, [FIG_ID])
    ).rows[0] as { ordinal: number; request: string };
    expect(vrow.ordinal).toBe(2);
    expect(vrow.request).toBe("restore:1");
    // the head spec version now carries the restored bytes (NOT the prior spec head)
    const fig = (await db.pg.query(`select spec_version_id from figures where id = $1`, [FIG_ID])).rows[0] as {
      spec_version_id: string;
    };
    const sha = (
      await db.pg.query(`select content_sha256 from artifact_versions where id = $1`, [fig.spec_version_id])
    ).rows[0] as { content_sha256: string };
    const restored = Buffer.from((await store.get(sha.content_sha256))!).toString("utf8");
    expect(restored).toBe(v1Spec);
    expect(fig.spec_version_id).not.toBe(spec.verId);
    expect(deps.queue.ofName("figure.render").length).toBe(1);
  });
});

describe("the lazy PNG@2x endpoint", () => {
  it("a table figure has no raster — 404; an unrendered figure is not_rendered", async () => {
    await seedFigure({ specKind: "table" });
    const res = await get(`/projects/${seed.projectId}/figures/${FIG_ID}/render.png`);
    expect(res.status).toBe(404);

    await db.pg.query(`update figures set spec_kind = 'vega_lite' where id = $1`, [FIG_ID]);
    const res2 = await get(`/projects/${seed.projectId}/figures/${FIG_ID}/render.png`);
    expect(res2.status).toBe(404);
    expect(((await res2.json()) as { error: string }).error).toBe("not_rendered");
  });
});
