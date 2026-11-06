import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrchestratorTestDb,
  seedProject,
  seedRun,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "@rhema/orchestrator/testing";
import { createThread, serializeIndex, type ResearchIndexEntry } from "@rhema/assistant";
import { seatForWorkflow } from "@rhema/orchestrator";
import { InMemoryContentStore } from "@rhema/mirror";
import { serializeOutline, type OutlineSidecar } from "@rhema/protocols";
import { createApp, type Principal } from "./index.js";
import type { SqlClient } from "./invite.js";

// P1.12 — the Outline surface's server side (§7.3): the promotion sheet's verbatim facts, the
// `outline` run create with its frozen inputs (the sheet's Promote click is the consent), the
// editor DTO, the autosave PATCH (full doc → provenance re-stamp; `ed.*`-shaped delta → the shared
// apply), the citation-guarded DELETE, and a gap's Answer landing a `user_typed` claim row.

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
const del = (path: string) => app.request(path, { method: "DELETE" });

const THREAD_ID = "01ARZ3NDEKTSV4RRFFQ69G5FB0";

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  sql = { query: (q, p) => db.pg.query(q, p as unknown[]) as Promise<{ rows: unknown[] }> };
  store = new InMemoryContentStore();
  seed = await seedProject(db, {
    draftN: 1,
    userId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    workspaceId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
    billingAccountId: "01ARZ3NDEKTSV4RRFFQ69G5FAX",
    projectId: "01ARZ3NDEKTSV4RRFFQ69G5FAY",
  });
  await createThread(sql, { projectId: seed.projectId, name: "Research thread" }, () => THREAD_ID);
  app = createApp({
    ...deps,
    principal: () => principal(),
    db: sql,
    contentStore: store,
  });
});
afterEach(() => db.close());

/** A mirror file with committed head bytes in the in-memory store (artifact + head version). */
async function seedMirrorFile(path: string, kind: string, text: string, idSuffix: string) {
  const { sha256 } = await store.putText(seed.workspaceId, text);
  const artId = `art_${idSuffix}`;
  const verId = `av_${idSuffix}`;
  await db.pg.query(
    `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [artId, seed.workspaceId, seed.projectId, kind, "project", path, verId],
  );
  await db.pg.query(
    `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
     values ($1,$2,1,$3,'k',$4,$5,'{}'::jsonb)`,
    [verId, artId, sha256, Buffer.byteLength(text), kind === "sidecar" ? "application/json" : "text/markdown"],
  );
  return { artId, verId };
}

/** The assistant research index the promotion reads for its source-note roster + URL set. */
async function seedResearchIndex(entries: ResearchIndexEntry[]) {
  return seedMirrorFile(
    "agents/assistant/research/index.json",
    "sidecar",
    serializeIndex({ version: 1, entries }),
    "rindex",
  );
}

const OUTLINE_DOC: OutlineSidecar = {
  sidecar: "outline",
  version: 1,
  thesis: "Visibility is a governance technology.",
  provenance: {
    threadId: THREAD_ID,
    scope: "thread",
    runId: "01ARZ3NDEKTSV4RRFFQ69G5FB9",
    generatedAt: "2026-09-20T14:05:00Z",
    urls: [
      { url: "https://example.org/one", fetchedAt: "2026-09-20T14:02:00Z" },
      { url: "https://example.org/two", unverified: true },
    ],
  },
  spine: ["c1", "c2", "c3", "c4", "c5"],
  sections: [
    {
      ref: "I",
      title: "Set-up",
      targetWords: 500,
      function: "Stage the commonplace",
      entry: "Seen = good",
      exit: "Seen has a price",
      claims: [
        {
          id: "c1",
          text: "Platforms frame visibility as empowerment.",
          provenance: { kind: "thread", turnId: "01ARZ3NDEKTSV4RRFFQ69G5FC0" },
        },
        {
          id: "c2",
          text: "The burden of being seen falls unevenly.",
          provenance: { kind: "source", url: "https://example.org/two" },
          unverified: true,
        },
      ],
    },
    {
      ref: "II",
      title: "The argument",
      targetWords: 700,
      claims: [
        { id: "c3", text: "Visibility demands legibility to power.", provenance: { kind: "source", url: "https://example.org/one" } },
        { id: "c4", text: "Opting out reads as political.", provenance: { kind: "generated" } },
        { id: "c5", text: "Selective opacity is defensible.", provenance: { kind: "user_typed" } },
      ],
    },
  ],
  alternativesConsidered: ["A genealogy of surveillance — rejected."],
  gaps: [{ id: "g1", needed: "A first-person refusal example", relatedClaimId: "c5", sectionRef: "II" }],
};

/** The outline artifact pair (`<slug>.md` + `.json`) as committed versions in the store. */
async function seedOutlineArtifact(slug: string, doc: OutlineSidecar = OUTLINE_DOC) {
  const { markdown, json } = serializeOutline(doc);
  const md = await seedMirrorFile(`agents/author/outline/${slug}.md`, "outline", markdown, "outline_md");
  await seedMirrorFile(`agents/author/outline/${slug}.json`, "sidecar", json, "outline_json");
  return md;
}

describe("GET /projects/:id/outline/promotion — the sheet's frozen facts", () => {
  it("thread scope: sources/urls/estimate/cap come from the research index + thread words", async () => {
    await seedResearchIndex([
      { path: "agents/assistant/research/sources/n1.md", kind: "source", url: "https://example.org/one", threadId: THREAD_ID, words: 300 },
      { path: "agents/assistant/research/sources/n2.md", kind: "source", url: "https://example.org/two", threadId: THREAD_ID, unverified: true, words: 150 },
      { path: "agents/assistant/research/sources/n3.md", kind: "source", url: "https://example.org/other", threadId: "thr_other", words: 50 },
    ]);
    const res = await get(
      `/projects/${seed.projectId}/outline/promotion?scope=thread&threadId=${THREAD_ID}`,
    );
    expect(res.status).toBe(200);
    const dto = (await res.json()) as {
      slug: string;
      sources: number;
      sourceCopies: { src: string; dst: string }[];
      urls: string[];
      threadTokens: number;
      estimateCredits: number;
      capCredits: number;
      existing: boolean;
    };
    // only THIS thread's notes count (n3 is another thread's).
    expect(dto.sources).toBe(2);
    expect(dto.urls.sort()).toEqual(["https://example.org/one", "https://example.org/two"]);
    expect(dto.sourceCopies[0]!.dst).toContain("agents/author/research/");
    // threadTokens = ceil(450 × 4/3) = 600 → 20 + 0.004·600 + 6·2 + 4 phases ≈ priced.
    expect(dto.threadTokens).toBe(600);
    expect(dto.estimateCredits).toBeGreaterThan(0);
    expect(dto.capCredits).toBeGreaterThanOrEqual(dto.estimateCredits);
    expect(dto.slug).toBe("slug-01arz3ndektsv4rrffq69g5fay");
    expect(dto.existing).toBe(false);
  });

  it("422s a bad scope / missing threadId, 404s an unknown thread", async () => {
    expect(
      (await get(`/projects/${seed.projectId}/outline/promotion?scope=bogus`)).status,
    ).toBe(422);
    expect(
      (await get(`/projects/${seed.projectId}/outline/promotion?scope=thread`)).status,
    ).toBe(422);
    const res = await get(
      `/projects/${seed.projectId}/outline/promotion?scope=thread&threadId=thr_nope`,
    );
    expect(res.status).toBe(404);
    expect(((await res.json()) as { error: string }).error).toBe("thread_not_found");
  });

  it("research scope needs no threadId — the whole index is the roster", async () => {
    await seedResearchIndex([
      { path: "agents/assistant/research/sources/n1.md", kind: "source", url: "https://example.org/one", threadId: THREAD_ID },
      { path: "agents/assistant/research/sources/n3.md", kind: "source", url: "https://example.org/other" },
    ]);
    const res = await get(`/projects/${seed.projectId}/outline/promotion?scope=research`);
    expect(res.status).toBe(200);
    const dto = (await res.json()) as { sources: number; scope: string };
    expect(dto.scope).toBe("research");
    expect(dto.sources).toBe(2);
  });
});

describe("POST /projects/:id/outline/promotions — the consent click creates ONE run", () => {
  it("201s with frozen inputs: outlineSlug, promotion_scope, urls, outline_path, sourceCopies", async () => {
    await seedResearchIndex([
      { path: "agents/assistant/research/sources/n1.md", kind: "source", url: "https://example.org/one", threadId: THREAD_ID },
    ]);
    const res = await postJson(`/projects/${seed.projectId}/outline/promotions`, {
      scope: "thread",
      threadId: THREAD_ID,
      thesis: "Visibility costs.",
    });
    expect(res.status).toBe(201);
    const out = (await res.json()) as { runId: string; slug: string; deduped: boolean };
    const run = (
      await db.pg.query(
        `select workflow, state, inputs, input_snapshot from runs where id = $1`,
        [out.runId],
      )
    ).rows[0] as { workflow: string; state: string; inputs: Record<string, unknown>; input_snapshot: Record<string, unknown> };
    expect(run.workflow).toBe("outline");
    // the workflow's seat is derived at hydration — `outline` rides the Assistant seat (the
    // outline artifact is the ONLY author-namespace write its conduit grants).
    expect(seatForWorkflow("outline")).toBe("assistant");
    expect(run.state).toBe("queued");
    expect(run.inputs["outlineSlug"]).toBe(out.slug);
    expect(run.inputs["promotion_scope"]).toBe("thread");
    expect(run.inputs["threadId"]).toBe(THREAD_ID);
    expect(run.inputs["thread_dir"]).toBe(`agents/assistant/threads/${THREAD_ID}`);
    expect(run.inputs["urls"]).toBe("https://example.org/one");
    expect(run.inputs["outline_path"]).toBe(`agents/author/outline/${out.slug}.md`);
    expect((run.inputs["sourceCopies"] as { dst: string }[])[0]!.dst).toContain("agents/author/research/");
    expect(run.inputs["thesis"]).toBe("Visibility costs.");
    expect(run.input_snapshot["outlineSlug"]).toBe(out.slug);
  });

  it("dedupes a replayed promote (the default idempotency key covers scope+slug)", async () => {
    await seedResearchIndex([]);
    const body = { scope: "thread", threadId: THREAD_ID };
    const a = (await (await postJson(`/projects/${seed.projectId}/outline/promotions`, body)).json()) as { runId: string; deduped: boolean };
    const b = (await (await postJson(`/projects/${seed.projectId}/outline/promotions`, body)).json()) as { runId: string; deduped: boolean };
    expect(b.runId).toBe(a.runId);
    expect(b.deduped).toBe(true);
    const n = (
      await db.pg.query(`select count(*)::int n from runs where project_id = $1 and workflow = 'outline'`, [seed.projectId])
    ).rows[0] as { n: number };
    expect(n.n).toBe(1);
  });

  it("404s a foreign thread and 422s an invalid scope — never mints a run", async () => {
    expect(
      (await postJson(`/projects/${seed.projectId}/outline/promotions`, { scope: "thread", threadId: "thr_foreign" })).status,
    ).toBe(404);
    expect(
      (await postJson(`/projects/${seed.projectId}/outline/promotions`, { scope: "bogus" })).status,
    ).toBe(422);
    const n = (
      await db.pg.query(`select count(*)::int n from runs where project_id = $1 and workflow = 'outline'`, [seed.projectId])
    ).rows[0] as { n: number };
    expect(n.n).toBe(0);
  });
});

describe("GET /projects/:id/outline — the editor DTO", () => {
  it("404s with no outline artifact; returns the parsed twin + citation set when seeded", async () => {
    expect((await get(`/projects/${seed.projectId}/outline`)).status).toBe(404);
    const { artId } = await seedOutlineArtifact("the-piece");
    const res = await get(`/projects/${seed.projectId}/outline`);
    expect(res.status).toBe(200);
    const dto = (await res.json()) as {
      artifactId: string;
      slug: string;
      outline: OutlineSidecar;
      citedBy: { runs: string[]; draftIds: string[] };
      markdown: string;
    };
    expect(dto.artifactId).toBe(artId);
    expect(dto.slug).toBe("the-piece");
    expect(dto.outline.thesis).toBe(OUTLINE_DOC.thesis);
    expect(dto.outline.sections).toHaveLength(2);
    expect(dto.markdown).toContain("rhema:outline v1");
    expect(dto.citedBy.runs).toEqual([]);
  });
});

describe("REQ-HOME-6 (R7HOME.2b, G5) — one 'outline exists' source", () => {
  it("a kind='outline' artifact at a non-author mirror path is the outline — route and Files tree agree", async () => {
    // the uploaded-outline home (`mirror_path = 'outline.md'`): the Files tree lists it (its
    // `kind='outline'` row) while the OLD route's `agents/author/outline/%` scan answered 404 —
    // the disagreement this ticket removes.
    await seedMirrorFile("outline.md", "outline", "# Uploaded outline\n\n- one\n- two\n", "up_outline");
    const res = await get(`/projects/${seed.projectId}/outline`);
    expect(res.status).toBe(200);
    const dto = (await res.json()) as { artifactId: string; slug: string | null; mirrorPath: string };
    expect(dto.mirrorPath).toBe("outline.md");
    // slug-less outside the author-outline namespace — saves resolve it by recency.
    expect(dto.slug).toBeNull();
    // the Files tree's own read lists the same artifact (one source, never a disagreement).
    const files = await get(`/projects/${seed.projectId}/files`);
    expect(files.status).toBe(200);
    const filesDto = (await files.json()) as {
      sections?: { rows?: { artifactId?: string }[]; advancedRows?: { artifactId?: string }[] }[];
    };
    const flat = (filesDto.sections ?? []).flatMap((s) => [
      ...(s.rows ?? []),
      ...(s.advancedRows ?? []),
    ]);
    expect(flat.some((i) => i.artifactId === dto.artifactId)).toBe(true);
  });

  it("the reverse direction agrees too: NO kind='outline' row → the route 404s even when author-namespace bytes exist", async () => {
    // a non-outline artifact under the author namespace must not conjure an outline — the route
    // keys on `kind`, the same fact the tree lists.
    await seedMirrorFile("agents/author/outline/stale.md", "note", "# stale\n", "stale_note");
    expect((await get(`/projects/${seed.projectId}/outline`)).status).toBe(404);
  });

  it("the newest outline wins across both namespaces; a named slug still resolves verbatim", async () => {
    await seedOutlineArtifact("the-piece");
    // a NEWER uploaded outline outranks the older author one (created_at desc).
    await new Promise((r) => setTimeout(r, 5));
    await seedMirrorFile("outline.md", "outline", "# Newer outline\n", "newer_outline");
    const res = await get(`/projects/${seed.projectId}/outline`);
    const dto = (await res.json()) as { mirrorPath: string; slug: string | null };
    expect(dto.mirrorPath).toBe("outline.md");
    expect(dto.slug).toBeNull();
    const named = await get(`/projects/${seed.projectId}/outline?slug=the-piece`);
    const namedDto = (await named.json()) as { mirrorPath: string; slug: string | null };
    expect(named.status).toBe(200);
    expect(namedDto.mirrorPath).toBe("agents/author/outline/the-piece.md");
    expect(namedDto.slug).toBe("the-piece");
  });
});

describe("PATCH /projects/:id/outline — the autosave's version pair", () => {
  it("a structured `edit` delta applies through the shared gate-edit apply", async () => {
    await seedOutlineArtifact("the-piece");
    const res = await patchJson(`/projects/${seed.projectId}/outline`, {
      edit: { sections: [{ index: 0, order: 2 }], values: { thesis: "A tighter thesis." } },
    });
    expect(res.status).toBe(200);
    const out = (await res.json()) as { ok: boolean; versionIds: string[] };
    expect(out.ok).toBe(true);
    expect(out.versionIds.length).toBeGreaterThanOrEqual(2); // .md + .json pair
    const dto = (await (await get(`/projects/${seed.projectId}/outline`)).json()) as { outline: OutlineSidecar };
    expect(dto.outline.sections[0]!.ref).toBe("II"); // section I moved after II
    expect(dto.outline.thesis).toBe("A tighter thesis.");
  });

  it("a full-document save re-stamps provenance + unverified the client tried to strip", async () => {
    await seedOutlineArtifact("the-piece");
    const stripped = JSON.parse(JSON.stringify(OUTLINE_DOC)) as OutlineSidecar;
    stripped.sections[1]!.claims[0]!.provenance = { kind: "user_typed" };
    stripped.sections[0]!.claims[1]!.unverified = false;
    stripped.provenance = undefined;
    const res = await patchJson(`/projects/${seed.projectId}/outline`, { outline: stripped });
    expect(res.status).toBe(200);
    const dto = (await (await get(`/projects/${seed.projectId}/outline`)).json()) as { outline: OutlineSidecar };
    const c3 = dto.outline.sections[1]!.claims.find((c) => c.id === "c3")!;
    expect(c3.provenance).toEqual({ kind: "source", url: "https://example.org/one" });
    const c2 = dto.outline.sections[0]!.claims.find((c) => c.id === "c2")!;
    expect(c2.unverified).toBe(true);
    // the run-authored provenance header is restored too.
    expect(dto.outline.provenance?.threadId).toBe(THREAD_ID);
  });

  it("422s an invalid document and a no-op body", async () => {
    await seedOutlineArtifact("the-piece");
    const bad = await patchJson(`/projects/${seed.projectId}/outline`, {
      outline: { sidecar: "outline", version: 1 }, // no thesis/sections
    });
    expect(bad.status).toBe(422);
    expect(((await bad.json()) as { error: string }).error).toBe("invalid_outline");
    expect((await patchJson(`/projects/${seed.projectId}/outline`, {})).status).toBe(422);
  });
});

describe("DELETE /projects/:id/outline — the citation guard (§7.3)", () => {
  it("409s `outline_cited` while a draft run's frozen inputs name the artifact", async () => {
    const { artId } = await seedOutlineArtifact("the-piece");
    const runId = await seedRun(db, {
      runId: "01ARZ3NDEKTSV4RRFFQ69G5FD0",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "draft",
    });
    await db.pg.query(`update runs set inputs = $1 where id = $2`, [
      JSON.stringify({ outlineArtifactId: artId }),
      runId,
    ]);
    const res = await del(`/projects/${seed.projectId}/outline`);
    expect(res.status).toBe(409);
    expect(((await res.json()) as { error: string }).error).toBe("outline_cited");
    // the artifact pair survives.
    expect((await get(`/projects/${seed.projectId}/outline`)).status).toBe(200);
  });

  it("deletes the artifact pair (md + json) when nothing cites it", async () => {
    await seedOutlineArtifact("the-piece");
    const res = await del(`/projects/${seed.projectId}/outline`);
    expect(res.status).toBe(200);
    expect((await get(`/projects/${seed.projectId}/outline`)).status).toBe(404);
    const n = (
      await db.pg.query(`select count(*)::int n from artifacts where mirror_path like 'agents/author/outline/%'`)
    ).rows[0] as { n: number };
    expect(n.n).toBe(0);
  });
});

describe("POST /projects/:id/outline/gaps/:gapId/answer — the elicit → user_typed claim", () => {
  it("lands the answer as a user_typed claim in the gap's section and resolves the gap", async () => {
    await seedOutlineArtifact("the-piece");
    const res = await postJson(`/projects/${seed.projectId}/outline/gaps/g1/answer`, {
      text: "I declined the panel invite in March.",
    });
    expect(res.status).toBe(200);
    const dto = (await (await get(`/projects/${seed.projectId}/outline`)).json()) as { outline: OutlineSidecar };
    expect(dto.outline.gaps).toHaveLength(0);
    const claims = dto.outline.sections[1]!.claims;
    const typed = claims.find((c) => c.text === "I declined the panel invite in March.");
    expect(typed?.provenance).toEqual({ kind: "user_typed" });
    expect(typed?.id).toMatch(/^u\d+$/);
  });

  it("404s an unknown gap and 422s an empty answer", async () => {
    await seedOutlineArtifact("the-piece");
    expect(
      (await postJson(`/projects/${seed.projectId}/outline/gaps/g9/answer`, { text: "x" })).status,
    ).toBe(404);
    expect(
      (await postJson(`/projects/${seed.projectId}/outline/gaps/g1/answer`, { text: " " })).status,
    ).toBe(422);
  });
});
