import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrchestratorTestDb,
  seedProject,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "@rhema/orchestrator/testing";
import { InMemoryContentStore } from "@rhema/mirror";
import { venueCapLabel } from "@rhema/editor";
import { OP_ED_PROTOCOL, seedProtocols, evalFixtureById } from "@rhema/protocols";
import { createApp, type Principal } from "./index.js";
import type { SqlClient } from "./invite.js";

// P1.21 (§6.7/§13.5; REQ-GENRE-1/3/6) — the golden-eval assertions that need the seeded DB:
// the four protocol rows land via `seedProtocols`; the op-ed venue cap renders end-to-end on the
// editor document DTO (projects.venue → seeded venue_bar row → the status-bar label); and a memo
// project's sheet context carries the confidentiality marker the run-sheet renders.

const OP_ED_MD =
  "On Tuesday the council approved another round of broadband subsidies. " +
  "The maps it relied on mark whole blocks served when a single house can get a connection.";

let db: OrchestratorTestDb;
let deps: TestDeps;
let sql: SqlClient;
let store: InMemoryContentStore;
let seed: Awaited<ReturnType<typeof seedProject>>;
let app: ReturnType<typeof createApp>;
let draftId: string;

const principal = (): Principal => ({
  userId: seed.userId,
  workspaceId: seed.workspaceId,
  billingAccountId: seed.billingAccountId,
});

/** Seed the protocol table + a frozen head draft for the seeded project. */
async function seedFrozenHead(markdown: string) {
  draftId = deps.ids("dft");
  const artId = deps.ids("art");
  const verId = deps.ids("av");
  const { sha256 } = await store.putText(seed.workspaceId, markdown);
  await db.pg.query(
    `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
     values ($1,$2,$3,'draft','shared','drafts/v1.md',$4)`,
    [artId, seed.workspaceId, seed.projectId, verId],
  );
  await db.pg.query(
    `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
     values ($1,$2,1,$3,'k',$4,'text/markdown',$5::jsonb)`,
    [verId, artId, sha256, Buffer.byteLength(markdown), JSON.stringify({ kind: "agent", draftN: 1 })],
  );
  await db.pg.query(
    `insert into drafts(id, project_id, n, origin, state, promoted_version_id)
     values ($1,$2,2,'agent','frozen',$3)`,
    [draftId, seed.projectId, verId],
  );
}

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  sql = { query: (q, p) => db.pg.query(q, p as unknown[]) as Promise<{ rows: unknown[] }> };
  store = new InMemoryContentStore();
  seed = await seedProject(db, { draftN: 1 });
  await seedProtocols({ query: (q, p) => db.pg.query(q, p as unknown[]) });
  app = createApp({ ...deps, principal: () => principal(), db: sql, store });
});
afterEach(() => db.close());

describe("P1.21 — seeded protocol rows (§6.7)", () => {
  it("seeds all four versioned protocols, each body carrying its §6.7 venue_bar kind", async () => {
    const rows = (
      await db.pg.query("select id, version, body from protocols order by id")
    ).rows as { id: string; version: number; body: { venue_bar?: { kind?: string } } }[];
    expect(rows.map((r) => r.id)).toEqual(["academic", "essay", "memo", "op-ed"]);
    for (const r of rows) expect(r.version).toBeGreaterThanOrEqual(1);
    expect(rows.find((r) => r.id === "op-ed")?.body.venue_bar?.kind).toBe("outlet-table");
    expect(rows.find((r) => r.id === "memo")?.body.venue_bar?.kind).toBe("silent-read");
  });
});

describe("op-ed golden fixture — the venue cap renders on the document (REQ-PROD-14/REQ-GENRE-3)", () => {
  it("the editor doc DTO carries the WaPo cap label computed from the seeded outlet row", async () => {
    const fixture = evalFixtureById("golden-op-ed")!;
    await db.pg.query(
      `update projects set protocol_id = $1, protocol_version = $2, venue = $3 where id = $4`,
      [fixture.protocol, OP_ED_PROTOCOL.version, fixture.inputs.venue, seed.projectId],
    );
    await seedFrozenHead(OP_ED_MD);
    const words = OP_ED_MD.split(/\s+/).filter(Boolean).length;

    const res = await app.request(`/projects/${seed.projectId}/editor/${draftId}?exact=1`);
    expect(res.status).toBe(200);
    const dto = (await res.json()) as { venueCap: string | null };
    // the status bar's "+N over WaPo" / "N under WaPo" — computed from the seeded venue row.
    expect(dto.venueCap).toBe(venueCapLabel(words, "WaPo", fixture.expected.venueCap!.maxWords));
  });
});

describe("memo golden fixture — the sheet states the confidentiality rule (§16.4)", () => {
  it("a memo project's run-sheet context carries memoConfidentiality + the four protocol options", async () => {
    await db.pg.query(`update projects set protocol_id = 'memo', protocol_version = 1 where id = $1`, [
      seed.projectId,
    ]);
    const res = await app.request(`/projects/${seed.projectId}/run-sheet-context?workflow=review`);
    expect(res.status).toBe(200);
    const dto = (await res.json()) as {
      project: { protocol: string; memoConfidentiality: boolean };
      protocols: { id: string }[];
    };
    expect(dto.project.protocol).toBe("memo");
    expect(dto.project.memoConfidentiality).toBe(true);
    expect(dto.protocols.map((p) => p.id).sort()).toEqual(["academic", "essay", "memo", "op-ed"]);
  });

  it("a memo fixture's user_sources reject on a non-memo project (REQ-GENRE-6)", async () => {
    const fixture = evalFixtureById("golden-memo")!;
    expect(fixture.inputs.userSources!.length).toBeGreaterThan(0);
    await db.pg.query(`update projects set protocol_id = 'essay', protocol_version = 1 where id = $1`, [
      seed.projectId,
    ]);
    const res = await app.request(`/projects/${seed.projectId}/runs`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        idempotencyKey: "idem-memo-fixture-1",
        workflow: "review",
        modelProfile: { tier: "balanced" },
        modelTier: "balanced",
        rigor: "standard",
        estimateCredits: 560,
        capCredits: 840,
        rateTableVersion: 1,
        inputs: { draftId: seed.draftId, sidecar: true },
        inputSnapshot: { wordCount: 5180 },
        draftId: seed.draftId,
        corrKind: "review",
        corrK: 1,
        userSources: fixture.inputs.userSources,
      }),
    });
    expect(res.status).toBe(422);
    expect(((await res.json()) as { error: string }).error).toBe("user_sources_memo_only");
  });
});
