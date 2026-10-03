import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrchestratorTestDb,
  seedProject,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "./testing/index.js";
import { InMemoryContentStore } from "@rhema/mirror";
import {
  applyFigureDelivery,
  figureRenderJob,
  enqueueFigureRender,
  FIGURE_RENDER_QUEUE,
  type FigureDeps,
} from "./figure-delivery.js";

// P1.13 — the Figure run's delivery consequences (§7.5; REQ-VIZ-1/9): the finalize fold writes the
// card fields + structured provenance onto the row, pins the produced spec/data versions, appends
// `figure_versions` (iterate = n+1 with the PRIOR files snapshotted under `versions/<n>/`), and the
// worker-owned `figure.render` job persists the deterministic light+dark SVG pair.

let db: OrchestratorTestDb;
let deps: TestDeps;
let store: InMemoryContentStore;
let seed: Awaited<ReturnType<typeof seedProject>>;
let figDeps: FigureDeps;

const FIG_ID = "01ARZ3NDEKTSV4RRFFQ69G5FBF";

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  store = new InMemoryContentStore();
  figDeps = { ids: deps.ids, clock: deps.clock, eventWriter: deps.eventWriter, store };
  seed = await seedProject(db, {
    userId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    workspaceId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
    billingAccountId: "01ARZ3NDEKTSV4RRFFQ69G5FAX",
    projectId: "01ARZ3NDEKTSV4RRFFQ69G5FAY",
  });
});
afterEach(() => db.close());

async function seedMirrorFile(path: string, text: string, suffix: string, ordinal = 1) {
  const { sha256 } = await store.putText(seed.workspaceId, text);
  await db.pg.query(
    `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
     values ($1,$2,$3,'figure','shared',$4,$5)
     on conflict (id) do update set head_version_id = excluded.head_version_id`,
    [`art_${suffix}`, seed.workspaceId, seed.projectId, path, `av_${suffix}${ordinal}`],
  );
  await db.pg.query(
    `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
     values ($1,$2,$3,$4,'k',$5,'application/octet-stream','{}'::jsonb)`,
    [`av_${suffix}${ordinal}`, `art_${suffix}`, ordinal, sha256, Buffer.byteLength(text)],
  );
  return { artId: `art_${suffix}`, verId: `av_${suffix}${ordinal}`, sha256 };
}

const VEGA_SPEC = JSON.stringify({
  mark: "bar",
  data: { values: [] },
  encoding: { x: { field: "group", type: "nominal" }, y: { field: "score", type: "quantitative" } },
});

const PROV = { kind: "claim_ledger", refs: [{ claimId: "01ARZ3NDEKTSV4RRFFQ69G5FC1" }], computedBy: "drafter", verification: "unverified" };

/** The run creation's seeded figures row (no spec yet — the finalize fold fills it). */
async function seedFigureRow() {
  await db.pg.query(
    `insert into figures(id, project_id, spec_kind, provenance) values ($1,$2,'vega_lite',$3::jsonb)`,
    [FIG_ID, seed.projectId, JSON.stringify(PROV)],
  );
}

/** The committed run products: the seat's figure.json + the spec/data/provenance heads. */
async function seedRunProducts(over: { spec?: string; figureJson?: Record<string, unknown> } = {}) {
  await seedMirrorFile(
    "agents/author/.rhema/figure.json",
    JSON.stringify(
      over.figureJson ?? {
        sidecar: "figure",
        version: 1,
        figureId: FIG_ID,
        specKind: "vega_lite",
        kind: "chart",
        title: "Visibility scores",
        caption: "Scores by group.",
        alt: "A bar chart of visibility scores.",
        sourceLine: "The claim ledger.",
        provenanceKind: "claim_ledger",
      },
    ),
    "figjson",
  );
  const spec = await seedMirrorFile(`assets/figures/${FIG_ID}/spec.vl.json`, over.spec ?? VEGA_SPEC, "figspec");
  const data = await seedMirrorFile(`assets/figures/${FIG_ID}/data.csv`, "group,score\na,0.7\n", "figdata");
  await seedMirrorFile(`assets/figures/${FIG_ID}/provenance.json`, JSON.stringify(PROV), "figprov");
  return { spec, data };
}

describe("applyFigureDelivery — the finalize fold", () => {
  it("folds figure.json + provenance onto the row, pins spec/data versions, appends figure_versions 1", async () => {
    await seedFigureRow();
    await seedRunProducts();
    const out = await db.txRunner.run(seed.workspaceId, (tx) =>
      applyFigureDelivery(tx, figDeps, {
        runId: "run_1",
        workspaceId: seed.workspaceId,
        projectId: seed.projectId,
        inputs: { figureId: FIG_ID, request: "make a chart", entryPoint: "chat" },
      }),
    );
    expect(out).toEqual({ figureId: FIG_ID, versionOrdinal: 1 });
    const fig = (await db.pg.query(`select title, caption, alt, source_line, spec_kind, spec_version_id, data_version_id, provenance from figures where id = $1`, [FIG_ID])).rows[0] as Record<string, unknown>;
    expect(fig.title).toBe("Visibility scores");
    expect(fig.alt).toBe("A bar chart of visibility scores.");
    expect(fig.source_line).toBe("The claim ledger.");
    expect(fig.spec_kind).toBe("vega_lite");
    expect(fig.spec_version_id).toBe("av_figspec1");
    expect(fig.data_version_id).toBe("av_figdata1");
    expect((fig.provenance as { kind: string }).kind).toBe("claim_ledger");
    const v = (await db.pg.query(`select ordinal, request, spec_version_id from figure_versions where figure_id = $1`, [FIG_ID])).rows[0] as { ordinal: number; request: string; spec_version_id: string };
    expect(v.ordinal).toBe(1);
    expect(v.request).toBe("make a chart");
    expect(v.spec_version_id).toBe("av_figspec1");
  });

  it("an iterate run appends version 2 AND snapshots the prior spec/data/provenance under versions/1/", async () => {
    await seedFigureRow();
    const first = await seedRunProducts();
    await db.txRunner.run(seed.workspaceId, (tx) =>
      applyFigureDelivery(tx, figDeps, {
        runId: "run_1",
        workspaceId: seed.workspaceId,
        projectId: seed.projectId,
        inputs: { figureId: FIG_ID, request: "initial" },
      }),
    );
    // the iterate commits a NEW head spec + provenance before its own finalize runs
    const NEW_SPEC = JSON.stringify({ mark: "line", data: { values: [] } });
    await seedMirrorFile(`assets/figures/${FIG_ID}/spec.vl.json`, NEW_SPEC, "figspec", 2);
    const out = await db.txRunner.run(seed.workspaceId, (tx) =>
      applyFigureDelivery(tx, figDeps, {
        runId: "run_2",
        workspaceId: seed.workspaceId,
        projectId: seed.projectId,
        inputs: { figureId: FIG_ID, priorVersion: 1, request: "make it a line chart" },
      }),
    );
    expect(out!.versionOrdinal).toBe(2);
    // the versions/1/ snapshot carries the PRIOR spec bytes (content-addressed — the restore reads them)
    const snap = (
      await db.pg.query(
        `select av.content_sha256 from artifacts a join artifact_versions av on av.id = a.head_version_id
          where a.project_id = $1 and a.mirror_path = $2`,
        [seed.projectId, `assets/figures/${FIG_ID}/versions/1/spec.vl.json`],
      )
    ).rows[0] as { content_sha256: string } | undefined;
    expect(snap).not.toBeUndefined();
    expect(snap!.content_sha256).toBe(first.spec.sha256);
    // and the row's head pin moved to the new spec version
    const fig = (await db.pg.query(`select spec_version_id from figures where id = $1`, [FIG_ID])).rows[0] as { spec_version_id: string };
    expect(fig.spec_version_id).toBe("av_figspec2");
  });

  it("a run that produced no spec leaves the row untouched (no half-written asset)", async () => {
    await seedFigureRow();
    const out = await db.txRunner.run(seed.workspaceId, (tx) =>
      applyFigureDelivery(tx, figDeps, {
        runId: "run_1",
        workspaceId: seed.workspaceId,
        projectId: seed.projectId,
        inputs: { figureId: FIG_ID },
      }),
    );
    expect(out).toBeNull();
    const v = await db.pg.query(`select count(*)::int n from figure_versions where figure_id = $1`, [FIG_ID]);
    expect((v.rows[0] as { n: number }).n).toBe(0);
  });
});

describe("figure.render — the worker-owned deterministic render", () => {
  it("renders the committed spec to the persisted light+dark pair, pins the render, emits figure.rendered", async () => {
    await seedFigureRow();
    const { spec } = await seedRunProducts();
    await db.pg.query(`update figures set spec_version_id = $2, data_version_id = $3 where id = $1`, [
      FIG_ID,
      spec.verId,
      "av_figdata1",
    ]);
    const out = await figureRenderJob(
      { ...figDeps, txRunner: db.txRunner },
      { figureId: FIG_ID, runId: "run_1", workspaceId: seed.workspaceId },
    );
    expect(out.ok).toBe(true);
    expect(out.kind).toBe("rendered");
    // the persisted pair — the canonical render lives on the server, never the browser
    const light = (
      await db.pg.query(
        `select av.content_sha256 from artifacts a join artifact_versions av on av.id = a.head_version_id
          where a.project_id = $1 and a.mirror_path = $2`,
        [seed.projectId, `assets/figures/${FIG_ID}/render.svg`],
      )
    ).rows[0] as { content_sha256: string } | undefined;
    const dark = (
      await db.pg.query(
        `select av.content_sha256 from artifacts a join artifact_versions av on av.id = a.head_version_id
          where a.project_id = $1 and a.mirror_path = $2`,
        [seed.projectId, `assets/figures/${FIG_ID}/render.dark.svg`],
      )
    ).rows[0] as { content_sha256: string } | undefined;
    expect(light).not.toBeUndefined();
    expect(dark).not.toBeUndefined();
    expect(light!.content_sha256).not.toBe(dark!.content_sha256);
    const lightBytes = await store.get(light!.content_sha256);
    expect(Buffer.from(lightBytes!).toString("utf8")).toContain("<svg");
    // the row's render pin + the run's event
    const fig = (await db.pg.query(`select rendered_version_id from figures where id = $1`, [FIG_ID])).rows[0] as { rendered_version_id: string | null };
    expect(fig.rendered_version_id).not.toBeNull();
    expect(deps.eventWriter.events.some((e) => e.type === "figure.rendered" && (e.payload as { figureId: string }).figureId === FIG_ID)).toBe(true);
  });

  it("a table spec marks rendered without an SVG pair (the card shows table.md itself)", async () => {
    await seedFigureRow();
    await db.pg.query(`update figures set spec_kind = 'table' where id = $1`, [FIG_ID]);
    const t = await seedMirrorFile(`assets/figures/${FIG_ID}/table.md`, "| a | b |\n|---|---|\n| 1 | 2 |\n", "figtbl");
    await db.pg.query(`update figures set spec_version_id = $2 where id = $1`, [FIG_ID, t.verId]);
    await db.pg.query(`insert into figure_versions(id, figure_id, ordinal, spec_version_id, request) values ('fv1',$1,1,$2,'initial')`, [FIG_ID, t.verId]);
    const out = await figureRenderJob(
      { ...figDeps, txRunner: db.txRunner },
      { figureId: FIG_ID, runId: null, workspaceId: seed.workspaceId },
    );
    expect(out.ok).toBe(true);
    expect(out.kind).toBe("table");
    const svg = (
      await db.pg.query(
        `select a.id from artifacts a where a.project_id = $1 and a.mirror_path = $2`,
        [seed.projectId, `assets/figures/${FIG_ID}/render.svg`],
      )
    ).rows[0];
    expect(svg).toBeUndefined();
  });

  it("a runless replay (restore-triggered) emits no run event — the pane re-reads the row", async () => {
    await seedFigureRow();
    const { spec } = await seedRunProducts();
    await db.pg.query(`update figures set spec_version_id = $2 where id = $1`, [FIG_ID, spec.verId]);
    await figureRenderJob({ ...figDeps, txRunner: db.txRunner }, { figureId: FIG_ID, runId: null, workspaceId: seed.workspaceId });
    expect(deps.eventWriter.events.filter((e) => e.type === "figure.rendered")).toHaveLength(0);
  });
});

describe("enqueueFigureRender — the commit consequence", () => {
  it("sends the worker job with a (figure, run, attempt) singleton key", async () => {
    const sent: { name: string; payload: Record<string, unknown>; key?: string }[] = [];
    await enqueueFigureRender(
      {
        queue: {
          async send(name, payload, opts) {
            sent.push({ name, payload, key: opts?.singletonKey });
          },
        },
      },
      { runId: "run_1", workspaceId: "ws", figureId: FIG_ID, attempt: 2 },
    );
    expect(sent).toHaveLength(1);
    expect(sent[0]!.name).toBe(FIGURE_RENDER_QUEUE);
    expect(sent[0]!.key).toBe(`figure.render:${FIG_ID}:run_1:2`);
  });
});
