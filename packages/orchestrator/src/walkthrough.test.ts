// P1.05 — the run walkthrough (§5.5 D20; REQ-IDE-19 amended): lazy enqueue on a delivered run's first
// card render, ONE package-class generator call over a narrow whitelist, the mechanical ≤200-word cap,
// and the stored {status,attempts,…} record — all against real migrations via PGlite.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  enforceWordCap,
  maybeEnqueueWalkthrough,
  generateWalkthrough,
  WALKTHROUGH_MAX_WORDS,
  type WalkthroughRecord,
  type WalkthroughGenerator,
} from "./walkthrough.js";
import { RUN_JOBS } from "./queue.js";
import {
  createOrchestratorTestDb,
  seedProject,
  seedRun,
  makeDeps,
  type OrchestratorTestDb,
  type TestDeps,
} from "./testing/index.js";

let db: OrchestratorTestDb;
let deps: TestDeps;
let ws: string;

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  const seed = await seedProject(db);
  ws = seed.workspaceId;
  deps = makeDeps(db);
});
afterEach(() => db.close());

const readRecord = async (runId: string): Promise<WalkthroughRecord | null> =>
  ((await db.client.query("select walkthrough from runs where id = $1", [runId])).rows[0] as {
    walkthrough: WalkthroughRecord | null;
  }).walkthrough;

describe("enforceWordCap — the mechanical ≤200-word cap", () => {
  it("leaves at-cap text untouched", () => {
    const text = Array.from({ length: 200 }, (_, i) => `w${i}`).join(" ");
    expect(enforceWordCap(text)).toBe(text);
  });
  it("cuts over-cap text at the boundary", () => {
    const text = Array.from({ length: 250 }, (_, i) => `w${i}`).join(" ");
    const capped = enforceWordCap(text);
    expect(capped.split(/\s+/)).toHaveLength(WALKTHROUGH_MAX_WORDS);
    expect(capped.endsWith("w199")).toBe(true);
  });
});

describe("maybeEnqueueWalkthrough — the lazy trigger (§5.5)", () => {
  it("enqueues for a delivered run with no record, singleton-keyed", async () => {
    await maybeEnqueueWalkthrough(deps, {
      runId: "run_1",
      workspaceId: ws,
      state: "completed",
      walkthrough: null,
    });
    const sent = deps.queue.ofName(RUN_JOBS.walkthrough);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.singletonKey).toBe("walkthrough:run_1");
    expect(sent[0]!.payload).toEqual({ runId: "run_1", workspaceId: ws });
  });

  it("never enqueues for a live run, or when any record (ready OR failed) exists", async () => {
    await maybeEnqueueWalkthrough(deps, { runId: "r1", workspaceId: ws, state: "running", walkthrough: null });
    await maybeEnqueueWalkthrough(deps, {
      runId: "r1",
      workspaceId: ws,
      state: "completed",
      walkthrough: { status: "ready", attempts: 1 },
    });
    await maybeEnqueueWalkthrough(deps, {
      runId: "r1",
      workspaceId: ws,
      state: "completed",
      walkthrough: { status: "failed", attempts: 2, lastError: "boom" },
    });
    expect(deps.queue.ofName(RUN_JOBS.walkthrough)).toHaveLength(0);
  });
});

describe("generateWalkthrough — the run.walkthrough job handler", () => {
  const seedDelivered = async () => {
    await seedRun(db, {
      runId: "run_w",
      workspaceId: ws,
      projectId: "prj_seed",
      workflow: "review",
      state: "completed",
      spentCredits: 520,
    });
    await db.txRunner.run(ws, async (tx) => {
      await tx.query(
        `insert into steps(id, run_id, phase, ordinal, state, credits, started_at, ended_at, produced_version_ids)
         values
           ('st_1','run_w','reading_the_piece',1,'done',120,now(),now()+interval '1 minute','{}'),
           ('st_2','run_w','editors_letter',2,'done',400,now(),now()+interval '2 minutes','{av_letter}')`,
      );
      await tx.query(
        `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path)
         values ('art_letter',$1,'prj_seed','editors_letter','run','correspondence/letter.md')`,
        [ws],
      );
      await tx.query(
        `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, word_count, created_by)
         values ('av_letter','art_letter',1,'x','k',700,'text/markdown',950,'{"kind":"system"}'::jsonb)`,
      );
    });
  };

  const genDeps = (generate: WalkthroughGenerator["generate"]) => ({ ...deps, walkthrough: { generate } });

  it("ONE generator call → a ready record with capped text, model, digest, attempts", async () => {
    await seedDelivered();
    const long = Array.from({ length: 300 }, (_, i) => `word${i}`).join(" ");
    const generate = vi.fn(async () => ({ text: long, model: "claude-haiku-4-5" }));
    const r = await generateWalkthrough(genDeps(generate), { runId: "run_w", workspaceId: ws });
    expect(r).toEqual({ ok: true, status: "ready", attempts: 1 });
    expect(generate).toHaveBeenCalledTimes(1);
    // the whitelist the generator saw: run facts + phase credits + artifact identity/shape — no prose
    const input = generate.mock.calls[0]![0];
    expect(input.runId).toBe("run_w");
    expect(input.workflow).toBe("review");
    expect(input.phases.map((p) => p.phase)).toEqual(["reading_the_piece", "editors_letter"]);
    expect(input.artifacts).toEqual([
      { kind: "editors_letter", path: "correspondence/letter.md", wordCount: 950 },
    ]);
    const rec = await readRecord("run_w");
    expect(rec?.status).toBe("ready");
    expect(rec?.text?.split(/\s+/)).toHaveLength(WALKTHROUGH_MAX_WORDS); // capped mechanically
    expect(rec?.model).toBe("claude-haiku-4-5");
    expect(rec?.inputDigest).toBeTruthy();
    expect(rec?.attempts).toBe(1);
  });

  it("a generator failure lands {status:'failed',lastError} — the card's Retry re-enqueues", async () => {
    await seedDelivered();
    const r = await generateWalkthrough(
      genDeps(async () => {
        throw new Error("model timeout");
      }),
      { runId: "run_w", workspaceId: ws },
    );
    expect(r).toEqual({ ok: true, status: "failed", attempts: 1 });
    const rec = await readRecord("run_w");
    expect(rec?.status).toBe("failed");
    expect(rec?.lastError).toContain("model timeout");
    // a second attempt increments attempts
    const r2 = await generateWalkthrough(genDeps(async () => ({ text: "ok", model: "m" })), {
      runId: "run_w",
      workspaceId: ws,
    });
    expect(r2).toEqual({ ok: true, status: "ready", attempts: 2 });
  });

  it("refuses missing, non-delivered, and already-ready runs without a generator call", async () => {
    const generate = vi.fn(async () => ({ text: "x", model: "m" }));
    expect(await generateWalkthrough(genDeps(generate), { runId: "run_x", workspaceId: ws })).toEqual({
      ok: false,
      reason: "not_found",
    });
    await seedRun(db, { runId: "run_live", workspaceId: ws, projectId: "prj_seed", state: "running" });
    expect(await generateWalkthrough(genDeps(generate), { runId: "run_live", workspaceId: ws })).toEqual({
      ok: false,
      reason: "not_delivered",
    });
    await seedRun(db, { runId: "run_ready", workspaceId: ws, projectId: "prj_seed", state: "completed" });
    await db.client.query(
      `update runs set walkthrough = '{"status":"ready","text":"t","attempts":1}'::jsonb where id = 'run_ready'`,
    );
    expect(await generateWalkthrough(genDeps(generate), { runId: "run_ready", workspaceId: ws })).toEqual({
      ok: false,
      reason: "already_ready",
    });
    expect(generate).not.toHaveBeenCalled();
  });
});
