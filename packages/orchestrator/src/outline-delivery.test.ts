import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { InMemoryContentStore, sha256Hex } from "@rhema/mirror";
import { createOrchestratorTestDb, seedProject, makeDeps, type OrchestratorTestDb, type TestDeps } from "./testing/index.js";
import { applyOutlineApproval } from "./outline-delivery.js";

// P1.12 — the Approve-outline finalize consequences (§7.3; REQ-CHAT-17/18): the promotion's frozen
// `inputs.sourceCopies` roster COPIES the assistant research notes into `agents/author/research/`
// (content-addressed bytes — never rewritten), the author research index merges the copied entries
// under their new paths, `outline.approved` lands once, and a re-driven finalize is a no-op (the
// copied head is byte-identical ⇒ skipped). The run's own `outline` artifact only needs to exist —
// the `outlined` state computes off `artifacts.kind`.

let db: OrchestratorTestDb;
let deps: TestDeps;
let store: InMemoryContentStore;
let seed: Awaited<ReturnType<typeof seedProject>>;

const RUN_ID = "01ARZ3NDEKTSV4RRFFQ69G5FE0";

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  store = new InMemoryContentStore();
  seed = await seedProject(db, {
    userId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
    workspaceId: "01ARZ3NDEKTSV4RRFFQ69G5FAW",
    billingAccountId: "01ARZ3NDEKTSV4RRFFQ69G5FAX",
    projectId: "01ARZ3NDEKTSV4RRFFQ69G5FAY",
  });
});
afterEach(() => db.close());

/** A committed mirror file: artifact row + head version whose bytes sit in the in-memory store.
 *  Ids are ULID-shaped — the `outline.approved` payload validates them at the write boundary. */
async function seedFile(path: string, kind: string, text: string, artId: string, verId: string) {
  const sha = sha256Hex(text);
  await store.put(seed.workspaceId, sha, Buffer.from(text, "utf8"));
  await db.pg.query(
    `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path, head_version_id)
     values ($1,$2,$3,$4,'project',$5,$6)`,
    [artId, seed.workspaceId, seed.projectId, kind, path, verId],
  );
  await db.pg.query(
    `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
     values ($1,$2,1,$3,'k',$4,$5,'{}'::jsonb)`,
    [verId, artId, sha, Buffer.byteLength(text), path.endsWith(".json") ? "application/json" : "text/markdown"],
  );
  return { artId, verId, sha };
}

const SRC_NOTE = "agents/assistant/research/sources/note-one.md";
const DST_NOTE = "agents/author/research/sources/note-one.md";

/** The assistant research index's serialized shape (the consumer here parses `entries[].path`). */
const indexJson = (entries: Record<string, unknown>[]) =>
  JSON.stringify({ version: 1, entries }, null, 2) + "\n";

async function headOf(path: string) {
  return (
    (
      await db.pg.query(
        `select a.id, av.id as version_id, av.ordinal, av.content_sha256
           from artifacts a left join artifact_versions av on av.id = a.head_version_id
          where a.project_id = $1 and a.mirror_path = $2`,
        [seed.projectId, path],
      )
    ).rows[0] as
      | { id: string; version_id: string | null; ordinal: number | null; content_sha256: string | null }
      | undefined
  ) ?? null;
}

describe("applyOutlineApproval — the finalize consequence (§7.3)", () => {
  it("copies the frozen sourceCopies to agents/author/research/ + merges the index + emits outline.approved", async () => {
    const note = "# Note one\n\nA fetched source note body.";
    const src = await seedFile(SRC_NOTE, "source_note", note, "01ARZ3NDEKTSV4RRFFQ69G5F10", "01ARZ3NDEKTSV4RRFFQ69G5F30");
    const outline = await seedFile("agents/author/outline/the-piece.md", "outline", "# Outline\n", "01ARZ3NDEKTSV4RRFFQ69G5F12", "01ARZ3NDEKTSV4RRFFQ69G5F32");
    await seedFile(
      "agents/assistant/research/index.json",
      "sidecar",
      indexJson([
        { path: SRC_NOTE, kind: "source", url: "https://example.org/one", words: 6 },
        { path: "agents/assistant/research/sources/not-copied.md", kind: "source", url: "https://example.org/x" },
      ]),
      "01ARZ3NDEKTSV4RRFFQ69G5F13", "01ARZ3NDEKTSV4RRFFQ69G5F33",
    );

    const outcome = await db.txRunner.run(seed.workspaceId, (tx) =>
      applyOutlineApproval(tx, { ...deps, store }, {
        runId: RUN_ID,
        workspaceId: seed.workspaceId,
        projectId: seed.projectId,
        inputs: {
          outlineSlug: "the-piece",
          sourceCopies: [{ src: SRC_NOTE, dst: DST_NOTE }],
          threadId: "01ARZ3NDEKTSV4RRFFQ69G5F20",
          scope: "thread",
        },
      }),
    );

    expect(outcome).not.toBeNull();
    expect(outcome!.slug).toBe("the-piece");
    expect(outcome!.outlineArtifactId).toBe(outline.artId);
    expect(outcome!.outlineVersionId).toBe(outline.verId);
    // the note copy + the merged index are the two writes.
    expect(outcome!.copiedNotes.sort()).toEqual(
      ["agents/author/research/index.json", DST_NOTE].sort(),
    );

    // the copy is byte-identical (content-addressed — the SAME sha the assistant note carries).
    const dst = await headOf(DST_NOTE);
    expect(dst).not.toBeNull();
    expect(dst!.content_sha256).toBe(src.sha);
    expect(dst!.ordinal).toBe(1);

    // the author index carries the copied entry at its NEW path; the un-copied entry stays out.
    const idx = await headOf("agents/author/research/index.json");
    const idxDoc = JSON.parse(
      Buffer.from((await store.get(idx!.content_sha256!))!).toString("utf8"),
    ) as { entries: { path: string; url?: string }[] };
    expect(idxDoc.entries).toEqual([
      { path: DST_NOTE, kind: "source", url: "https://example.org/one", words: 6 },
    ]);

    // the event names the artifact + the copy count (the feed row + the next-step fact).
    const ev = deps.eventWriter.events.find((e) => e.type === "outline.approved");
    expect(ev).toBeDefined();
    expect(ev!.payload).toMatchObject({
      slug: "the-piece",
      artifactId: outline.artId,
      copiedNotes: 2,
      threadId: "01ARZ3NDEKTSV4RRFFQ69G5F20",
      scope: "thread",
    });
  });

  it("a re-driven finalize is a no-op — identical heads skip (no doubled versions)", async () => {
    const note = "same bytes";
    await seedFile(SRC_NOTE, "source_note", note, "01ARZ3NDEKTSV4RRFFQ69G5F10", "01ARZ3NDEKTSV4RRFFQ69G5F30");
    const dst = await seedFile(DST_NOTE, "source_note", note, "01ARZ3NDEKTSV4RRFFQ69G5F11", "01ARZ3NDEKTSV4RRFFQ69G5F31"); // already copied
    await seedFile("agents/author/outline/the-piece.md", "outline", "# Outline\n", "01ARZ3NDEKTSV4RRFFQ69G5F12", "01ARZ3NDEKTSV4RRFFQ69G5F32");
    await seedFile(
      "agents/assistant/research/index.json",
      "sidecar",
      indexJson([{ path: SRC_NOTE, kind: "source" }]),
      "01ARZ3NDEKTSV4RRFFQ69G5F13", "01ARZ3NDEKTSV4RRFFQ69G5F33",
    );
    await seedFile(
      "agents/author/research/index.json",
      "sidecar",
      indexJson([{ path: DST_NOTE, kind: "source" }]),
      "01ARZ3NDEKTSV4RRFFQ69G5F14", "01ARZ3NDEKTSV4RRFFQ69G5F34",
    );

    const outcome = await db.txRunner.run(seed.workspaceId, (tx) =>
      applyOutlineApproval(tx, { ...deps, store }, {
        runId: RUN_ID,
        workspaceId: seed.workspaceId,
        projectId: seed.projectId,
        inputs: { outlineSlug: "the-piece", sourceCopies: [{ src: SRC_NOTE, dst: DST_NOTE }] },
      }),
    );

    expect(outcome).not.toBeNull();
    expect(outcome!.copiedNotes).toEqual([]); // nothing new — the head is already the same bytes
    const after = await headOf(DST_NOTE);
    expect(after!.version_id).toBe(dst.verId); // no second version row
    // the event still lands (the consequence is idempotent but never silent).
    expect(deps.eventWriter.events.some((e) => e.type === "outline.approved")).toBe(true);
  });

  it("returns null when the declared outline artifact never committed", async () => {
    const outcome = await db.txRunner.run(seed.workspaceId, (tx) =>
      applyOutlineApproval(tx, { ...deps, store }, {
        runId: RUN_ID,
        workspaceId: seed.workspaceId,
        projectId: seed.projectId,
        inputs: { outlineSlug: "missing", sourceCopies: [] },
      }),
    );
    expect(outcome).toBeNull();
    expect(deps.eventWriter.events.some((e) => e.type === "outline.approved")).toBe(false);
  });
});
