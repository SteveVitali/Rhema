import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrchestratorTestDb,
  seedProject,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "@rhema/orchestrator/testing";
import { InMemoryContentStore } from "@rhema/mirror";
import { SqlObligationHook, routeDisposition } from "@rhema/obligations";
import { deliverReviewViaHook } from "@rhema/obligations/testing";
import { createApp, type Principal } from "./index.js";
import type { SqlClient } from "./invite.js";
import type { ExportRunner } from "./export-routes.js";

// PRB.11 — export + the AI-use statement, end-to-end on PGlite (AC2/AC3/AC4): the dialog read sweeps
// `pre_export` horizons, reports the never-blocking obligation line + links, and previews the generated
// statement; the export POST proceeds with open blocking obligations and embeds the obligation sentence
// when the statement is attached; additions are append-only (no update/delete route exists). The
// `ExportRunner` seam is faked in-process — conversion itself is the export container's job (AC5).

const MD = `# Seeded manuscript

A body paragraph with a claim the Editor flagged.[^1]

[^1]: A footnote that must survive the docx round-trip.
`;

let db: OrchestratorTestDb;
let deps: TestDeps;
let sql: SqlClient;
let store: InMemoryContentStore;
let seed: Awaited<ReturnType<typeof seedProject>>;
let draftId: string;

/** The fake export runner — records the markdown it received and echoes it back (md passthrough). */
const runnerCalls: { markdown: string; format: string }[] = [];
const fakeRunner: ExportRunner = {
  async run({ markdown, format }) {
    runnerCalls.push({ markdown, format });
    return {
      bytes: new TextEncoder().encode(markdown),
      mediaType:
        format === "docx"
          ? "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          : format === "txt"
            ? "text/plain; charset=utf-8"
            : "text/markdown; charset=utf-8",
      extension: format,
    };
  },
};

const principal = (): Principal => ({
  userId: seed.userId,
  workspaceId: seed.workspaceId,
  billingAccountId: seed.billingAccountId,
});

/** Seed the promoted head: artifact + version (markdown in the store) + a frozen v1 draft. */
async function seedManuscript() {
  draftId = deps.ids("dft");
  const artId = deps.ids("art");
  const verId = deps.ids("av");
  const { sha256 } = await store.putText(seed.workspaceId, MD);
  await db.pg.query(
    `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
     values ($1,$2,$3,'draft','shared','drafts/v1.md',$4)`,
    [artId, seed.workspaceId, seed.projectId, verId],
  );
  await db.pg.query(
    `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
     values ($1,$2,1,$3,'k',$4,'text/markdown',$5::jsonb)`,
    [verId, artId, sha256, Buffer.byteLength(MD), JSON.stringify({ kind: "agent", runId: deps.ids("run"), draftN: 1 })],
  );
  await db.pg.query(
    `insert into drafts(id, project_id, n, origin, state, promoted_version_id)
     values ($1,$2,1,'imported','frozen',$3)`,
    [draftId, seed.projectId, verId],
  );
}

/** Deliver a review through the obligation hook → spawn the findings' obligations. Returns the
 *  obligation ids in finding order. */
async function deliverReview(findings: { ordinal: number; severity: string; title: string }[]) {
  const runId = deps.ids("run");
  await db.txRunner.run(seed.workspaceId, (tx) =>
    tx.query(
      `insert into runs(id, workspace_id, project_id, workflow, state, current_attempt, inputs, model_profile,
         model_tier, rigor, estimate_credits, cap_credits, rate_table_version)
       values ($1,$2,$3,'review','finalizing',1,'{}'::jsonb,'balanced','balanced','standard',100,840,1)`,
      [runId, seed.workspaceId, seed.projectId],
    ),
  );
  const hook = new SqlObligationHook({ ids: deps.ids, clock: deps.clock });
  let obligationIds: string[] = [];
  await db.txRunner.run(seed.workspaceId, async (tx) => {
    const { findingIds } = await deliverReviewViaHook(tx, hook, {
      projectId: seed.projectId,
      draftId,
      runId,
      findings: findings.map((f) => ({ ...f })),
    });
    const rows = (
      await tx.query(
        `select o.id from revision_obligations o join obligation_findings of on of.obligation_id = o.id
          where of.finding_id = any($1::text[]) order by o.id`,
        [findingIds],
      )
    ).rows as { id: string }[];
    obligationIds = rows.map((r) => r.id);
  });
  return { runId, obligationIds };
}

beforeEach(async () => {
  runnerCalls.length = 0;
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  sql = { query: (q, p) => db.pg.query(q, p as unknown[]) as Promise<{ rows: unknown[] }> };
  store = new InMemoryContentStore();
  seed = await seedProject(db);
  await seedManuscript();
});
afterEach(() => db.close());

const app = () =>
  createApp({ ...deps, principal: () => principal(), db: sql, contentStore: store, exportRunner: fakeRunner });

describe("GET /projects/:id/export/dialog", () => {
  it("returns the beta formats + the never-blocking obligation line + linkable items", async () => {
    const { runId } = await deliverReview([
      { ordinal: 1, severity: "blocking", title: "Resolve the thesis gap" },
      { ordinal: 2, severity: "major", title: "Tighten the close" },
    ]);
    const res = await app().request(`/projects/${seed.projectId}/export/dialog`);
    expect(res.status).toBe(200);
    const dto = (await res.json()) as {
      formats: { id: string }[];
      obligations: {
        blockingOpen: number;
        open: number;
        line: string;
        items: { id: string; title: string; severity: string; reviewRunId: string | null }[];
        returnedIds: string[];
      };
      statement: { generated: string[] };
    };
    expect(dto.formats.map((f) => f.id)).toEqual(["md", "txt", "docx"]);
    expect(dto.obligations.blockingOpen).toBe(1);
    expect(dto.obligations.open).toBe(2);
    expect(dto.obligations.line).toBe("1 blocking obligation open");
    // items carry the link target (the review run the finding was filed on).
    expect(dto.obligations.items).toHaveLength(2);
    expect(dto.obligations.items[0]!.severity).toBe("blocking");
    expect(dto.obligations.items[0]!.reviewRunId).toBe(runId);
    // the statement preview is generated from the run rows (one review so far).
    expect(dto.statement.generated.join(" ")).toContain("1 editorial workflow");
  });

  it("a pre_export-deferred obligation returns to open when the dialog opens (AC4, REQ-OBJ-3)", async () => {
    const { obligationIds } = await deliverReview([
      { ordinal: 1, severity: "major", title: "Parked until export" },
    ]);
    // defer it until pre_export.
    await db.txRunner.run(seed.workspaceId, (tx) =>
      routeDisposition(tx, { ids: deps.ids, clock: deps.clock }, {
        obligationId: obligationIds[0]!,
        kind: "defer",
        rationale: "Handle at export",
        deferHorizon: { until: "pre_export" },
        draftId,
        byActor: { kind: "user", userId: seed.userId },
      }),
    );
    // before the dialog opens it is deferred — the count line doesn't see it.
    let res = await app().request(`/projects/${seed.projectId}/export/dialog`);
    let dto = (await res.json()) as {
      obligations: { open: number; line: string; items: { id: string }[]; returnedIds: string[] };
    };
    expect(dto.obligations.open).toBe(1); // the horizon arrived AT the dialog → returned + counted
    expect(dto.obligations.returnedIds).toEqual(obligationIds);
    expect(dto.obligations.items.map((i) => i.id)).toEqual(obligationIds);
    // and it stays open afterward (the sweep is a one-way arrival).
    res = await app().request(`/projects/${seed.projectId}/export/dialog`);
    dto = (await res.json()) as { obligations: { open: number; returnedIds: string[] } };
    expect(dto.obligations.open).toBe(1);
    expect(dto.obligations.returnedIds).toEqual([]);
  });
});

describe("POST /projects/:id/export", () => {
  it("proceeds with open blocking obligations and returns the canonical bytes (AC3)", async () => {
    await deliverReview([{ ordinal: 1, severity: "blocking", title: "Open debt" }]);
    const res = await app().request(`/projects/${seed.projectId}/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ format: "md" }),
    });
    expect(res.status).toBe(200); // never blocked
    expect(res.headers.get("content-type")).toContain("text/markdown");
    expect(res.headers.get("content-disposition")).toContain("attachment");
    expect(res.headers.get("content-disposition")).toContain(".md");
    const text = await res.text();
    expect(text).toBe(MD); // canonical passthrough, no attachment requested
    expect(runnerCalls).toHaveLength(1);
    expect(runnerCalls[0]!.format).toBe("md");
  });

  it("attaches the AI-use statement — the generated obligation sentence rides along (AC3)", async () => {
    await deliverReview([{ ordinal: 1, severity: "blocking", title: "Open debt" }]);
    const res = await app().request(`/projects/${seed.projectId}/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ format: "docx", attachAiUse: true }),
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("wordprocessingml");
    // the markdown the runner received carries the manuscript + the statement section.
    const sent = runnerCalls[0]!.markdown;
    expect(sent).toContain(MD.trimEnd());
    expect(sent).toContain("## AI-use statement");
    expect(sent).toContain("1 review obligation remained open, 1 of them blocking");
    expect(runnerCalls[0]!.format).toBe("docx");
  });

  it("rejects a non-beta format and a cross-workspace project", async () => {
    const res = await app().request(`/projects/${seed.projectId}/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ format: "pdf" }),
    });
    expect(res.status).toBe(422);
    // a project in another workspace is not_found, never a leak.
    const other = await seedProject(db, {
      userId: "usr_other", billingAccountId: "ba_other", workspaceId: "ws_other", projectId: "prj_other",
    });
    const res2 = await app().request(`/projects/${other.projectId}/export/dialog`);
    expect(res2.status).toBe(404);
  });

  it("answers 503 when no export runner is wired (a deploy without the export service)", async () => {
    const bare = createApp({ ...deps, principal: () => principal(), db: sql, contentStore: store });
    const res = await bare.request(`/projects/${seed.projectId}/export`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ format: "md" }),
    });
    expect(res.status).toBe(503);
    expect(((await res.json()) as { error: string }).error).toBe("export_not_wired");
  });
});

describe("the AI-use statement routes (REQ-VIS-10)", () => {
  it("GET /ai-use returns the generated statement; ?format=md downloads it standalone", async () => {
    const res = await app().request(`/projects/${seed.projectId}/ai-use`);
    expect(res.status).toBe(200);
    const dto = (await res.json()) as { generated: string[]; additions: unknown[]; markdown: string };
    expect(dto.generated[0]).toContain("Rhēma");
    expect(dto.additions).toEqual([]);
    expect(dto.markdown).toContain("# AI-use statement");

    const dl = await app().request(`/projects/${seed.projectId}/ai-use?format=md`);
    expect(dl.status).toBe(200);
    expect(dl.headers.get("content-disposition")).toContain("ai-use-statement.md");
    expect(await dl.text()).toContain("# AI-use statement");
  });

  it("POST /ai-use/additions appends (and survives regeneration); no update/delete route exists", async () => {
    const add = await app().request(`/projects/${seed.projectId}/ai-use/additions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sentence: "I rewrote the ending myself." }),
    });
    expect(add.status).toBe(201);
    // regeneration still carries it.
    const dto = (await (await app().request(`/projects/${seed.projectId}/ai-use`)).json()) as {
      additions: { sentence: string }[];
      markdown: string;
    };
    expect(dto.additions.map((a) => a.sentence)).toEqual(["I rewrote the ending myself."]);
    expect(dto.markdown).toContain("I rewrote the ending myself.");
    // there is no way to remove generated sentences — or an addition — through the API.
    const del = await app().request(`/projects/${seed.projectId}/ai-use`, { method: "DELETE" });
    expect(del.status).toBe(404);
    const patch = await app().request(`/projects/${seed.projectId}/ai-use/additions`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ sentence: "edit" }),
    });
    expect(patch.status).toBe(404);
  });
});
