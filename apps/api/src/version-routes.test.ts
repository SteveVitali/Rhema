import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createOrchestratorTestDb,
  seedProject,
  seedRun,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "@rhema/orchestrator/testing";
import {
  InMemoryContentStore,
  InMemoryRestoreBlobStore,
} from "@rhema/mirror";
import { markdownToUpdate, docToCanonicalMarkdown } from "@rhema/editor";
import { seedRealProjects } from "@rhema/db";
import * as Y from "yjs";
import { createApp, type Principal } from "./index.js";
import { loadFiles } from "./version-routes.js";
import type { SqlClient } from "./invite.js";

// P1.08 — the version surfaces end-to-end on PGlite (§5.8 + §5.13): the rail read model (origins,
// flags, the ⚑ blocking/major chip), the generalized compare (`/v/:n/diff/:m` over ANY pair — a
// human-revision pair lands every hunk Unlinked), the §5.13 Files read (REQ-VIS-3's no-I/H-in-rows
// contract + sealed counts + provenance/lock/freshness), the restore-point groups/preview/undoable
// apply (with the correspondence + agent-memory isolation assert), and the H-kind route refusal.

let db: OrchestratorTestDb;
let deps: TestDeps;
let sql: SqlClient;
let store: InMemoryContentStore;
let blobs: InMemoryRestoreBlobStore;
let seed: Awaited<ReturnType<typeof seedProject>>;
let app: ReturnType<typeof createApp>;

const NOW = new Date("2026-09-02T12:00:00Z");

/** v6's draft id is ULID-shaped — the save path's `revision.move_traced` event validates ids. */
const V6_ID = "01J9V6AAAAAAAAAAAAAAAAAAV6"; // 26-char Crockford base32 (no I/L/O/U)

const principal = (): Principal => ({
  userId: seed.userId,
  workspaceId: seed.workspaceId,
  billingAccountId: seed.billingAccountId,
});

/** Insert an artifact + head version whose bytes live in the in-memory content store. */
async function putArtifact(args: {
  id: string;
  kind: string;
  mirrorPath: string;
  text: string;
  createdBy?: unknown;
  createdAt?: string;
  immutable?: boolean;
  personaId?: string;
}): Promise<{ artifactId: string; versionId: string }> {
  const blob = await store.putText(seed.workspaceId, args.text);
  const versionId = `av_${args.id}`;
  await db.pg.query(
    `insert into artifacts(id, workspace_id, project_id, persona_id, kind, namespace, mirror_path, head_version_id)
     values ($1,$2,$3,$4,$5,'shared',$6,$7)`,
    [
      args.id,
      seed.workspaceId,
      args.personaId ? null : seed.projectId,
      args.personaId ?? null,
      args.kind,
      args.mirrorPath,
      versionId,
    ],
  );
  await db.pg.query(
    `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, word_count, media_type, created_by, created_at, immutable)
     values ($1,$2,1,$3,$4,$5,$6,'text/markdown',$7,$8,$9)`,
    [
      versionId,
      args.id,
      blob.sha256,
      blob.key,
      Buffer.byteLength(args.text),
      args.text.split(/\s+/).filter(Boolean).length,
      JSON.stringify(args.createdBy ?? { kind: "system" }),
      args.createdAt ?? "2026-08-01T00:00:00Z",
      args.immutable ?? false,
    ],
  );
  return { artifactId: args.id, versionId };
}

/**
 * The rail/compare fixture — six drafts covering every origin the chips render:
 *   v1 drafted_from_outline (frozen) · v2 response_to_review (frozen, reviewed+answered)
 *   v3 human_upload (frozen) · v4 duplicate (frozen) · v5 imported (frozen)
 *   v6 human_revision (WORKING, claims pending verification) — the head.
 */
async function seedRail() {
  const texts: Record<number, string> = {
    1: "# Draft\n\nThe pillar stands on the old claim.\n\nA middle section that stays.\n",
    2: "# Draft\n\nThe pillar stands on the old claim.\n\nA middle section that stays.\n\nSecond section.\n",
    3: "# Draft\n\nThe pillar stands on the uploaded claim.\n\nA middle section that stays.\n\nSecond section.\n",
    4: "# Draft\n\nThe pillar stands on the uploaded claim.\n\nA middle section that stays.\n\nSecond section.\n",
    5: "# Draft\n\nThe pillar stands on the imported claim.\n\nA middle section that stays.\n\nSecond section.\n",
    6: "# Draft\n\nThe pillar stands on the restated claim.\n\nA middle section that stays.\n\nSecond section.\n",
  };
  const origins: Record<number, string> = {
    1: "drafted_from_outline",
    2: "response_to_review",
    3: "human_upload",
    4: "duplicate",
    5: "imported",
    6: "human_revision",
  };
  for (const n of [1, 2, 3, 4, 5, 6] as const) {
    const { versionId } = await putArtifact({
      id: `art_v${n}`,
      kind: "draft",
      mirrorPath: `drafts/v${n}.md`,
      text: texts[n]!,
      createdBy:
        n === 6
          ? { kind: "user", userId: seed.userId }
          : { kind: "agent", seat: "Drafter", runId: "run_d" },
      createdAt: `2026-08-0${n}T00:00:00Z`,
    });
    if (n === 1) {
      // seedProject's draft IS v1 — freeze it with its promoted head in one update (the check
      // constraint requires promoted_version_id on frozen rows), then v6 becomes the working head.
      await db.pg.query(
        `update drafts set origin = 'drafted_from_outline', state = 'frozen', promoted_version_id = $1
          where id = $2`,
        [versionId, seed.draftId],
      );
      continue;
    }
    await db.pg.query(
      `insert into drafts(id, project_id, n, origin, state, base_draft_id, promoted_version_id, claims_pending_verification)
       values ($1,$2,$3,$4,$5,$6,$7,$8)`,
      [
        n === 6 ? V6_ID : `dft_v${n}`,
        seed.projectId,
        n,
        origins[n],
        n === 6 ? "working" : "frozen",
        n === 6 ? "dft_v5" : null,
        versionId,
        n === 6, // the human_revision head carries the claims-pending flag (REQ-PROD-11)
      ],
    );
  }
  // v2's review + response (the reviewed/answered flags + the compare pair's ledger link).
  await db.pg.query(
    `insert into correspondence_items(id, project_id, kind, draft_id, run_id, delivered_at, artifact_ids)
     values ('ci_rev_v2',$1,'review','dft_v2','run_rev','2026-08-05T00:00:00Z','{}')`,
    [seed.projectId],
  );
  await db.pg.query(
    `insert into correspondence_items(id, project_id, kind, draft_id, run_id, prior_review_id, delivered_at, artifact_ids)
     values ('ci_resp_v2',$1,'response','dft_v2','run_resp','ci_rev_v2','2026-08-06T00:00:00Z','{}')`,
    [seed.projectId],
  );
  // the ⚑ chip (REQ-OBJ-6): blocking/major only, per-draft + project-level.
  await db.pg.query(
    `insert into revision_obligations(id, project_id, source, severity, title, state, opened_on_draft_id, created_by)
     values
       ('obl_b1',$1,'finding','blocking','a blocking debt','open','dft_v2','{"kind":"system"}'::jsonb),
       ('obl_m1',$1,'finding','major','an addressed debt','addressed','dft_v2','{"kind":"system"}'::jsonb),
       ('obl_minor',$1,'finding','minor','a minor debt','open','dft_v3','{"kind":"system"}'::jsonb),
       ('obl_proj',$1,'user','blocking','a project debt','open',null,'{"kind":"user","userId":"usr_seed"}'::jsonb)`,
    [seed.projectId],
  );
  // the Outline chip's artifact.
  await putArtifact({
    id: "art_outline",
    kind: "outline",
    mirrorPath: "outline.md",
    text: "# Outline\n\n- The pillar\n- The middle\n",
    createdBy: { kind: "user", userId: seed.userId },
  });
}

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db, { now: NOW });
  sql = { query: (q, p) => db.pg.query(q, p as unknown[]) as Promise<{ rows: unknown[] }> };
  store = new InMemoryContentStore();
  blobs = new InMemoryRestoreBlobStore();
  seed = await seedProject(db, { draftN: 1 });
  app = createApp({ ...deps, principal: () => principal(), db: sql, store, restoreBlobs: blobs });
});

afterEach(() => db.close());

// ── the version rail (§5.8; REQ-IDE-32, REQ-OBJ-6, REQ-PROD-11) ────────────────────────────────────

describe("GET /projects/:id/versions — the rail read model", () => {
  it("renders every origin, the 🔒/● states, reviewed/answered, claims-pending, and the ⚑ chip", async () => {
    await seedRail();
    const res = await app.request(`/projects/${seed.projectId}/versions`);
    expect(res.status).toBe(200);
    const dto = (await res.json()) as {
      workingN: number;
      chip: { open: number; addressed: number };
      outline: { artifactId: string; words: number | null } | null;
      drafts: {
        n: number;
        origin: string;
        state: string;
        frozen: boolean;
        words: number | null;
        reviewed: boolean;
        answered: boolean;
        claimsPendingVerification: boolean;
        obligations: { open: number; addressed: number };
      }[];
    };
    expect(dto.workingN).toBe(6);
    expect(dto.outline?.artifactId).toBe("art_outline");
    expect(dto.drafts.map((d) => d.n)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(dto.drafts.map((d) => d.origin)).toEqual([
      "drafted_from_outline",
      "response_to_review",
      "human_upload",
      "duplicate",
      "imported",
      "human_revision",
    ]);
    expect(dto.drafts.map((d) => d.frozen)).toEqual([true, true, true, true, true, false]);
    expect(dto.drafts.map((d) => d.words)).toEqual([14, 16, 16, 16, 16, 16]);
    // v2 is the reviewed + answered draft.
    expect(dto.drafts[1]).toMatchObject({ reviewed: true, answered: true });
    expect(dto.drafts[0]!.reviewed).toBe(false);
    // claims-pending rides ONLY the human_revision head.
    expect(dto.drafts.map((d) => d.claimsPendingVerification)).toEqual([
      false, false, false, false, false, true,
    ]);
    // ⚑ counts are blocking/major only — the minor row counts in NEITHER bucket.
    expect(dto.chip).toEqual({ open: 2, addressed: 1 });
    expect(dto.drafts[1]!.obligations).toEqual({ open: 1, addressed: 1 });
    expect(dto.drafts[2]!.obligations).toEqual({ open: 0, addressed: 0 });
  });

  it("404s on another workspace's project", async () => {
    const other = await seedProject(db, {
      projectId: "prj_other",
      workspaceId: "ws_other",
      userId: "usr_other",
      billingAccountId: "ba_other",
    });
    const res = await app.request(`/projects/${other.projectId}/versions`);
    expect(res.status).toBe(404);
  });
});

// ── the generalized compare (§5.8; REQ-IDE-33) ───────────────────────────────────────────────────

describe("GET /projects/:id/v/:n/diff/:m — the arbitrary-pair compare", () => {
  it("a human-revision pair carries no ledger: responseId null, every hunk Unlinked", async () => {
    await seedRail();
    const res = await app.request(`/projects/${seed.projectId}/v/5/diff/6`);
    expect(res.status).toBe(200);
    const dto = (await res.json()) as {
      responseId: string | null;
      before: { n: number; origin: string };
      after: { n: number; origin: string; claimsPendingVerification: boolean };
      diff: { hunks: { id: string; kind: string }[]; unchanged: number };
      view: { unlinked: { hunks: { id: string }[] }; moves: unknown[]; strip: { stillOpen: number } };
    };
    expect(dto.responseId).toBeNull();
    expect(dto.before).toMatchObject({ n: 5, origin: "imported" });
    expect(dto.after).toMatchObject({ n: 6, origin: "human_revision", claimsPendingVerification: true });
    expect(dto.diff.hunks.length).toBeGreaterThan(0);
    // the whole diff lands in Unlinked — the coherence read.
    expect(dto.view.moves).toEqual([]);
    expect(dto.view.unlinked.hunks.length).toBe(dto.diff.hunks.length);
    expect(dto.view.strip.stillOpen).toBe(3); // every live obligation row, all severities
  });

  it("normalizes direction: /v/6/diff/5 diffs the same pair before=lower n", async () => {
    await seedRail();
    const res = await app.request(`/projects/${seed.projectId}/v/6/diff/5`);
    expect(res.status).toBe(200);
    const dto = (await res.json()) as { before: { n: number }; after: { n: number } };
    expect(dto.before.n).toBe(5);
    expect(dto.after.n).toBe(6);
  });

  it("a ledgered pair joins the move + the rebutted card exactly as the response route does", async () => {
    // v2 frozen (reviewed) → response produces v3 (frozen), v4 human_revision working.
    const beforeText = "# Draft\n\nThe pillar stands on the old claim.\n\nA middle section that stays.\n";
    const afterText =
      "# Draft\n\nThe pillar stands on the restated claim.\n\nA middle section that stays.\n\nAn extra paragraph.\n";
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
    const av2 = (await putArtifact({ id: "art_b", kind: "draft", mirrorPath: "drafts/v2.md", text: beforeText })).versionId;
    const av3 = (await putArtifact({ id: "art_c", kind: "draft", mirrorPath: "drafts/v3.md", text: afterText })).versionId;
    await db.pg.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path)
       values ('art_ledger',$1,$2,'sidecar','run','correspondence/response-ledger.json')`,
      [seed.workspaceId, seed.projectId],
    );
    await db.pg.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
       values ('av_ledger','art_ledger',1,$1,$2,600,'application/json','{"kind":"system"}'::jsonb)`,
      [ledgerBlob.sha256, ledgerBlob.key],
    );
    // seedProject's v1 draft becomes the reviewed v2; v3 is the response's revision (frozen), v4 working.
    await db.pg.query(
      `update drafts set n = 2, state = 'frozen', promoted_version_id = $1 where id = $2`,
      [av2, seed.draftId],
    );
    await db.pg.query(
      `insert into drafts(id, project_id, n, origin, state, base_draft_id, promoted_version_id)
       values ('dft_v3',$1,3,'response_to_review','frozen',$2,$3)`,
      [seed.projectId, seed.draftId, av3],
    );
    await db.pg.query(
      `insert into drafts(id, project_id, n, origin, state, base_draft_id, promoted_version_id)
       values ('dft_v4',$1,4,'human_revision','working','dft_v3',$2)`,
      [seed.projectId, av3],
    );
    await db.pg.query(
      `insert into correspondence_items(id, project_id, kind, draft_id, run_id, delivered_at, artifact_ids)
       values ('ci_rev',$1,'review',$2,'run_rev','2026-08-05T00:00:00Z','{}')`,
      [seed.projectId, seed.draftId],
    );
    await db.pg.query(
      `insert into findings(id, correspondence_id, draft_id, ordinal, kind, severity, origin, title, body)
       values ('fnd_1','ci_rev',$1,1,'argument','major','editor','weak pillar','body'),
              ('fnd_2','ci_rev',$1,2,'claim','minor','editor','unsupported stat','body')`,
      [seed.draftId],
    );
    await db.pg.query(
      `insert into correspondence_items(id, project_id, kind, draft_id, run_id, prior_review_id, delivered_at, artifact_ids)
       values ('ci_resp',$1,'response',$2,'run_resp','ci_rev','2026-08-06T00:00:00Z','{av_ledger}')`,
      [seed.projectId, seed.draftId],
    );

    const res = await app.request(`/projects/${seed.projectId}/v/2/diff/3`);
    expect(res.status).toBe(200);
    const dto = (await res.json()) as {
      responseId: string | null;
      reviewId: string | null;
      before: { n: number };
      after: { n: number };
      view: {
        moves: { moveId: string; hunks: { id: string }[] }[];
        unlinked: { hunks: { id: string }[] };
        rebutted: { findingOrdinal: number; rationale: string }[];
      };
    };
    expect(dto.responseId).toBe("ci_resp");
    expect(dto.reviewId).toBe("ci_rev");
    expect(dto.before.n).toBe(2);
    expect(dto.after.n).toBe(3);
    expect(dto.view.moves[0]).toMatchObject({ moveId: "M1" });
    expect(dto.view.moves[0]!.hunks.map((h) => h.id)).toEqual(["h1"]);
    expect(dto.view.unlinked.hunks.map((h) => h.id)).toEqual(["h2"]);
    expect(dto.view.rebutted).toEqual([
      expect.objectContaining({ findingOrdinal: 2, rationale: "the stat is sourced in §2" }),
    ]);
  });

  it("`m` may be `working`; an unknown version 404s", async () => {
    await seedRail();
    const ok = await app.request(`/projects/${seed.projectId}/v/5/diff/working`);
    expect(ok.status).toBe(200);
    const missing = await app.request(`/projects/${seed.projectId}/v/5/diff/99`);
    expect(missing.status).toBe(404);
  });

  it("a hunk comment lands a Guidance row (source inline_comment, workflows [revise])", async () => {
    await seedRail();
    const res = await app.request(
      `/projects/${seed.projectId}/v/5/diff/6/hunks/h1/comments`,
      {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ text: "keep the restated claim tighter" }),
      },
    );
    expect(res.status).toBe(201);
    const dto = (await res.json()) as { guidanceId: string };
    const row = (
      await db.pg.query("select source, body, workflows, run_id from guidance where id = $1", [
        dto.guidanceId,
      ])
    ).rows[0] as { source: string; body: string; workflows: string[]; run_id: string | null };
    expect(row).toMatchObject({
      source: "inline_comment",
      body: "keep the restated claim tighter",
      workflows: ["revise"],
      run_id: null,
    });
  });
});

// ── the Files pane (§5.13; REQ-IDE-35/36/37, REQ-VIS-3) ──────────────────────────────────────────

describe("GET /projects/:id/files — the typed artifact Browser", () => {
  it("REQ-VIS-3: no I/H row in `rows`; I rides advancedRows; H leaves only a sealed count", async () => {
    await seedRail();
    // an SR round artifact born of a review run (the provenance badge + freshness vs its subject
    // draft need the real run + step rows).
    await seedRun(db, {
      runId: "run_rev",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "review",
      state: "done",
    });
    const letter = await putArtifact({
      id: "art_letter",
      kind: "editors_letter",
      mirrorPath: "correspondence/letter-v2.md",
      text: "Dear writer,\n\nThe pillar needs restating.\n",
      createdBy: { kind: "agent", seat: "Editor", runId: "run_rev" },
      createdAt: "2026-08-01T12:00:00Z", // BEFORE v2's promoted head (08-02) ⇒ stale
    });
    await db.pg.query(
      `insert into steps(id, run_id, phase, ordinal, state, produced_version_ids)
       values ('stp_letter','run_rev','Letter',1,'done',$1)`,
      [[letter.versionId]],
    );
    // an I kind (piece_brief) + an H kind (run_transcript) + an unknown kind + agent memory.
    await putArtifact({
      id: "art_brief",
      kind: "piece_brief",
      mirrorPath: "briefs/piece-brief.md",
      text: "The brief.\n",
      createdBy: { kind: "agent", seat: "Drafter" },
    });
    await putArtifact({
      id: "art_transcript",
      kind: "run_transcript",
      mirrorPath: "runs/run_rev/transcript.md",
      text: "<transcript>\n",
      createdBy: { kind: "system" },
    });
    await putArtifact({
      id: "art_unknown",
      kind: "totally_made_up_kind",
      mirrorPath: "misc/made-up.md",
      text: "n/a\n",
      createdBy: { kind: "system" },
    });
    await putArtifact({
      id: "art_memory",
      kind: "persona_seed",
      mirrorPath: "voice/seed.md",
      text: "My voice.\n",
      createdBy: { kind: "user", userId: seed.userId },
    });

    const res = await app.request(`/projects/${seed.projectId}/files`);
    expect(res.status).toBe(200);
    const dto = (await res.json()) as {
      sections: {
        key: string;
        rows: {
          artifactId: string;
          kind: string;
          level: string;
          lock: string;
          readOnly: boolean;
          draftRef?: { n: number; state: string };
          provenance: { actor: string; runId?: string; workflow?: string; phase?: string };
          freshness?: { subjectDraftN: number; stale: boolean };
        }[];
        advancedRows: { artifactId: string; kind: string; level: string }[];
        sealedCount: number;
      }[];
    };
    const flat = dto.sections.flatMap((s) => s.rows);
    const adv = dto.sections.flatMap((s) => s.advancedRows);

    // the snapshot rule: `rows` carry SE/SR only — never an I or H level.
    for (const r of flat) expect(["SE", "SR"]).toContain(r.level);
    expect(flat.some((r) => r.kind === "piece_brief")).toBe(false);
    expect(flat.some((r) => r.kind === "run_transcript")).toBe(false);
    // an unknown kind is unlisted entirely (fail closed).
    expect(flat.some((r) => r.kind === "totally_made_up_kind")).toBe(false);
    expect(adv.some((r) => r.kind === "totally_made_up_kind")).toBe(false);
    // the I kind rides Advanced only.
    expect(adv.find((r) => r.kind === "piece_brief")?.level).toBe("I");
    // the H kind leaves a sealed COUNT on its nominal section (rounds) — never a row.
    const rounds = dto.sections.find((s) => s.key === "rounds")!;
    expect(rounds.sealedCount).toBeGreaterThanOrEqual(1);
    expect(rounds.rows.some((r) => r.kind === "run_transcript")).toBe(false);

    // the provenance badge links the producing run + phase.
    const letterRow = rounds.rows.find((r) => r.kind === "editors_letter")!;
    expect(letterRow.provenance).toMatchObject({
      actor: "agent",
      runId: "run_rev",
      workflow: "review",
      phase: "Letter",
    });
    // freshness: the letter describes v2 — v2's promoted head postdates it ⇒ stale.
    expect(letterRow.freshness).toEqual({ subjectDraftN: 2, stale: true });

    // the drafts section: the working head is editable; frozen drafts are immutable.
    const drafts = dto.sections.find((s) => s.key === "drafts")!;
    const v6 = drafts.rows.find((r) => r.draftRef?.n === 6)!;
    expect(v6.lock).toBe("editable");
    const v1 = drafts.rows.find((r) => r.draftRef?.n === 1)!;
    expect(v1.lock).toBe("immutable");
    // agent memory opens read-only (REQ-IDE-37).
    const voice = dto.sections.find((s) => s.key === "voice")!;
    expect(voice.rows.find((r) => r.kind === "persona_seed")?.readOnly).toBe(true);
  });

  it("an H-kind artifact has NO route — a direct page read refuses (REQ-VIS-3)", async () => {
    await seedRail();
    await putArtifact({
      id: "art_hidden",
      kind: "run_transcript",
      mirrorPath: "runs/x/transcript.md",
      text: "<transcript>\n",
    });
    const res = await app.request(`/projects/${seed.projectId}/artifacts/art_hidden/page`);
    expect(res.status).toBe(404);
    // …while a visible kind still renders.
    const ok = await app.request(`/projects/${seed.projectId}/artifacts/art_outline/page`);
    expect(ok.status).toBe(200);
  });
});

// ── REQ-VIS-3 (amended): the snapshot AC over the three seeded real projects ─────────────────────

describe("REQ-VIS-3 — the default Files tree over the three seeded projects", () => {
  it("contains no I- or H-kind row — snapshot per project", async () => {
    await seedRealProjects({
      exec: (s) => db.pg.exec(s),
      query: (s, p) => db.pg.query(s, p as unknown[]) as Promise<{ rows: unknown[] }>,
    });
    for (const projectId of ["proj_pv", "proj_sd", "proj_cr"]) {
      const files = await db.txRunner.run("ws_seed", (tx) => loadFiles(tx, projectId));
      // the default tree (sections[].rows) — no I row, and H can never appear as a row at all.
      for (const s of files.sections) {
        for (const r of s.rows) expect(["SE", "SR"]).toContain(r.level);
        for (const r of s.advancedRows) expect(r.level).toBe("I");
      }
      expect(
        files.sections.map((s) => ({
          key: s.key,
          rows: s.rows.map((r) => `${r.kind}:${r.level}:${r.lock}`),
          advancedRows: s.advancedRows.map((r) => `${r.kind}:${r.level}`),
          sealedCount: s.sealedCount,
        })),
      ).toMatchSnapshot();
    }
  });
});

// ── restore points (§5.8; REQ-IDE-34) ────────────────────────────────────────────────────────────

describe("restore points — grouped list, preview, undoable apply", () => {
  /** v6 (working human_revision) gets a live doc + four points across the §5.8 groups. */
  async function seedRestorePoints() {
    await seedRail();
    await db.pg.query(
      `insert into live_docs(id, draft_id, y_state, state_vector, md_sha256, materialized_at)
       values ('doc_v6',$3,$1,$2,'x','2026-09-02T11:00:00Z')`,
      [
        Buffer.from(
          markdownToUpdate(
            "# Draft\n\nThe pillar stands on the restated claim.\n\nA middle section that stays.\n\nSecond section.\n",
          ),
        ),
        Buffer.alloc(0),
        V6_ID,
      ],
    );
    await db.pg.query(`update drafts set live_doc_id = 'doc_v6' where id = $1`, [V6_ID]);
    const put = async (id: string, cause: string, at: string, label: string | null, text: string) => {
      const blob = await store.putText(seed.workspaceId, text);
      await db.pg.query(
        `insert into restore_points(id, live_doc_id, s3_key, kind, cause, label, created_at)
         values ($1,'doc_v6',$2,'snapshot',$3,$4,$5)`,
        [id, blob.key, cause, label, at],
      );
    };
    await put("rp_today", "blur", "2026-09-02T08:00:00Z", null, "# Draft\n\nToday's text.\n");
    await put("rp_yesterday", "timer", "2026-09-01T12:00:00Z", null, "# Draft\n\nYesterday's text.\n");
    // a pre_run point BEFORE the v2 review's delivered_at lands in "Before Review of vN".
    await put("rp_prerun", "pre_run", "2026-08-04T00:00:00Z", null, "# Draft\n\nPre-review text.\n");
    await put("rp_named", "named", "2026-07-01T00:00:00Z", "before the rewrite", "# Draft\n\nNamed text.\n");
  }

  it("groups per §5.8 — Earlier today / Yesterday / Before Review of vN / Named; older points ride Advanced", async () => {
    await seedRestorePoints();
    const res = await app.request(`/projects/${seed.projectId}/drafts/${V6_ID}/restore-points`);
    expect(res.status).toBe(200);
    const dto = (await res.json()) as {
      draftId: string;
      points: { id: string; group: string; beforeReviewN?: number; advanced: boolean }[];
    };
    expect(dto.draftId).toBe(V6_ID);
    const byId = Object.fromEntries(dto.points.map((p) => [p.id, p]));
    expect(byId["rp_today"]).toMatchObject({ group: "earlier_today", advanced: false });
    expect(byId["rp_yesterday"]).toMatchObject({ group: "yesterday", advanced: false });
    expect(byId["rp_named"]).toMatchObject({ group: "named", advanced: false });
    expect(byId["rp_prerun"]).toMatchObject({ group: "before_review", beforeReviewN: 2, advanced: true });
  });

  it("preview diffs the point against the current head; apply is undoable + touches nothing else", async () => {
    await seedRestorePoints();
    const preview = await app.request(
      `/projects/${seed.projectId}/drafts/${V6_ID}/restore-points/rp_named/preview`,
    );
    expect(preview.status).toBe(200);
    const pv = (await preview.json()) as {
      ok: true;
      point: { id: string; label: string };
      view: { unlinked: { hunks: { id: string }[] } };
    };
    expect(pv.point).toMatchObject({ id: "rp_named", label: "before the rewrite" });
    expect(pv.view.unlinked.hunks.length).toBeGreaterThan(0);

    // snapshot the surfaces restore must NEVER touch (§5.8: correspondence + agent memory unchanged).
    const beforeCorr = (
      await db.pg.query(`select id from correspondence_items order by id`)
    ).rows.map((r) => (r as { id: string }).id);
    const beforeFindings = (
      await db.pg.query(`select id, projections from findings order by id`)
    ).rows;
    const beforeGuidance = (await db.pg.query(`select id from guidance order by id`)).rows;
    const beforeOtherDrafts = (
      await db.pg.query(`select id, promoted_version_id, state from drafts where id <> $1 order by id`, [V6_ID])
    ).rows;
    const beforeArtifacts = (
      await db.pg.query(`select id, head_version_id from artifacts where kind <> 'draft' order by id`)
    ).rows;

    const res = await app.request(
      `/projects/${seed.projectId}/drafts/${V6_ID}/restore-points/rp_named/restore`,
      { method: "POST" },
    );
    expect(res.status).toBe(200);
    const dto = (await res.json()) as {
      ok: true;
      draftId: string;
      draftN: number;
      forked: boolean;
      undoPointId: string | null;
      restoredFrom: string;
    };
    expect(dto.restoredFrom).toBe("rp_named");
    expect(dto.forked).toBe(false); // the working human_revision head updates in place
    expect(dto.draftN).toBe(6);
    expect(dto.undoPointId).not.toBeNull(); // the pre-restore snapshot IS the undo handle

    // the restored head's promoted version carries the point's bytes.
    const head = (
      await db.pg.query(
        `select av.content_sha256 from drafts d join artifact_versions av on av.id = d.promoted_version_id
          where d.id = $1`,
        [V6_ID],
      )
    ).rows[0] as { content_sha256: string };
    const bytes = await store.get(head.content_sha256);
    expect(Buffer.from(bytes!).toString("utf8")).toBe("# Draft\n\nNamed text.\n");

    // the live doc's y_state converged on the restored bytes too.
    const live = (
      await db.pg.query(`select y_state from live_docs where id = 'doc_v6'`)
    ).rows[0] as { y_state: Uint8Array };
    const doc = new Y.Doc();
    Y.applyUpdate(doc, new Uint8Array(live.y_state));
    expect(docToCanonicalMarkdown(doc)).toBe("# Draft\n\nNamed text.\n");
    doc.destroy();

    // ISOLATION: correspondence, findings/projections, guidance, other drafts, non-draft artifacts
    // (agent memory included) are byte-identical to before the apply.
    expect(
      (await db.pg.query(`select id from correspondence_items order by id`)).rows.map(
        (r) => (r as { id: string }).id,
      ),
    ).toEqual(beforeCorr);
    expect((await db.pg.query(`select id, projections from findings order by id`)).rows).toEqual(
      beforeFindings,
    );
    expect((await db.pg.query(`select id from guidance order by id`)).rows).toEqual(beforeGuidance);
    expect(
      (await db.pg.query(
        `select id, promoted_version_id, state from drafts where id <> $1 order by id`,
        [V6_ID],
      )).rows,
    ).toEqual(beforeOtherDrafts);
    expect(
      (await db.pg.query(
        `select id, head_version_id from artifacts where kind <> 'draft' order by id`,
      )).rows,
    ).toEqual(beforeArtifacts);

    // the undo point names itself and lives on the restore/ blob chain.
    const undo = (
      await db.pg.query(`select label, cause, s3_key from restore_points where id = $1`, [dto.undoPointId])
    ).rows[0] as { label: string; cause: string; s3_key: string };
    expect(undo.label).toContain("Before restore");
    expect(undo.cause).toBe("auto");
    expect(undo.s3_key.startsWith("restore/")).toBe(true);
  });

  it("a held run lock refuses the apply (409)", async () => {
    await seedRestorePoints();
    await seedRun(db, {
      runId: "run_live",
      workspaceId: seed.workspaceId,
      projectId: seed.projectId,
      workflow: "revise",
      state: "running",
      lockSet: [`draft:write:${V6_ID}`],
    });
    const res = await app.request(
      `/projects/${seed.projectId}/drafts/${V6_ID}/restore-points/rp_named/restore`,
      { method: "POST" },
    );
    expect(res.status).toBe(409);
  });
});
