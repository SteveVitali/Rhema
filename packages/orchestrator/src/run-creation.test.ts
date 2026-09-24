import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, type OrchestratorTestDb } from "./testing/pg.js";
import { makeDeps, type TestDeps } from "./testing/deps.js";
import { createRun, type CreateRunInput } from "./run-creation.js";
import { TestHoldLedger } from "./ledger.js";

let db: OrchestratorTestDb;
let deps: TestDeps;
let seed: Awaited<ReturnType<typeof seedProject>>;

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  seed = await seedProject(db, { draftN: 1 });
});
afterEach(() => db.close());

function baseInput(over: Partial<CreateRunInput> = {}): CreateRunInput {
  return {
    idempotencyKey: "idem-1",
    workflow: "review",
    workspaceId: seed.workspaceId,
    billingAccountId: seed.billingAccountId,
    requestedBy: seed.userId,
    projectId: seed.projectId,
    seat: "editor",
    modelProfile: { tier: "balanced" },
    modelTier: "balanced",
    rigor: "standard",
    estimateCredits: 560,
    capCredits: 840,
    rateTableVersion: 1,
    phaseClassesUsed: ["research", "judge", "generate", "package"],
    inputs: { draftId: seed.draftId, phases: {}, sidecar: true },
    inputSnapshot: { draftSha256: "abc", wordCount: 5180, claimCount: 21 },
    sheetLaunched: true,
    lockSetSpec: { projectId: seed.projectId, draftId: seed.draftId, corrKind: "review", corrK: 1 },
    ...over,
  };
}

async function runCount(): Promise<number> {
  const r = await db.txRunner.run(seed.workspaceId, (tx) => tx.query("select count(*)::int as n from runs", []));
  return (r.rows[0] as { n: number }).n;
}

describe("run creation (§12.4 step 2; REQ-SPEC-16)", () => {
  it("sheet-launched → queued, hold placed, input snapshot frozen", async () => {
    const res = await createRun(deps, baseInput());
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.state).toBe("queued");
      expect(res.deduped).toBe(false);
    }
    expect(deps.ledger.opsOf("hold")).toHaveLength(1);
    // the created→queued transition paired a run.state_changed event (REQ-DATA-33).
    if (res.ok) {
      const types = deps.eventWriter.typesForRun(res.runId);
      expect(types).toContain("run.state_changed");
    }
    // the frozen snapshot + estimate/cap/rate_table_version live on the row (REQ-BILL-6).
    const row = (
      await db.txRunner.run(seed.workspaceId, (tx) =>
        tx.query("select cap_credits, estimate_credits, rate_table_version, hold_ledger_id, state from runs", []),
      )
    ).rows[0] as { cap_credits: number; estimate_credits: number; rate_table_version: number; hold_ledger_id: string; state: string };
    expect(row).toMatchObject({ cap_credits: 840, estimate_credits: 560, rate_table_version: 1, state: "queued" });
    expect(row.hold_ledger_id).toBeTruthy();
  });

  it("AC5: a duplicate POST with one idempotency key → one row", async () => {
    const first = await createRun(deps, baseInput());
    const second = await createRun(deps, baseInput());
    expect(first.ok && second.ok).toBe(true);
    if (first.ok && second.ok) {
      expect(second.runId).toBe(first.runId);
      expect(second.deduped).toBe(true);
    }
    expect(await runCount()).toBe(1);
    // only one hold was placed (the dedup path never re-holds).
    expect(deps.ledger.opsOf("hold")).toHaveLength(1);
  });

  it("a different idempotency key makes a distinct run once the active run is terminal", async () => {
    await createRun(deps, baseInput());
    // PRB.21 — at most ONE non-terminal run per project: the second key only creates after the first
    // run lands terminal (the live-run conflict is its own test below).
    await db.client.query("update runs set state = 'completed' where project_id = $1", [seed.projectId]);
    await createRun(deps, baseInput({ idempotencyKey: "idem-2" }));
    expect(await runCount()).toBe(2);
  });

  it("PRB.21 / D-PRB.20-1: a second create while a run is non-terminal → run_in_progress, one row, one hold", async () => {
    const first = await createRun(deps, baseInput());
    expect(first.ok).toBe(true);
    if (!first.ok) return;

    const second = await createRun(deps, baseInput({ idempotencyKey: "idem-2" }));
    expect(second.ok).toBe(false);
    if (!second.ok) {
      expect(second.reason).toBe("run_in_progress");
      if (second.reason === "run_in_progress") expect(second.activeRunId).toBe(first.runId);
    }
    // No second run row, no second memo, and never a second hold — the whole creation rolled back.
    expect(await runCount()).toBe(1);
    expect(deps.ledger.opsOf("hold")).toHaveLength(1);
    const memo = await db.client.query("select count(*)::int as n from run_idempotency", []);
    expect((memo.rows[0] as { n: number }).n).toBe(1);
  });

  it("PRB.21: a run parked in awaiting_consent still blocks a second create (non-terminal is the real set)", async () => {
    const first = await createRun(deps, baseInput({ sheetLaunched: false }));
    expect(first.ok && first.state).toBe("awaiting_consent");
    const second = await createRun(deps, baseInput({ idempotencyKey: "idem-2" }));
    expect(second.ok).toBe(false);
    if (!second.ok) expect(second.reason).toBe("run_in_progress");
    expect(await runCount()).toBe(1);
  });

  it("PRB.21: an idempotent replay of the in-flight run dedupes (200-path) instead of 409ing", async () => {
    const first = await createRun(deps, baseInput());
    // same idempotency key = the same submission's retry — it must return the live run, never the guard.
    const retry = await createRun(deps, baseInput());
    expect(first.ok && retry.ok).toBe(true);
    if (first.ok && retry.ok) {
      expect(retry.runId).toBe(first.runId);
      expect(retry.deduped).toBe(true);
    }
    expect(await runCount()).toBe(1);
  });

  it("PRB.21: a project-less run (persona builds) skips the project guard entirely", async () => {
    const a = await createRun(deps, baseInput({ projectId: undefined }));
    const b = await createRun(deps, baseInput({ projectId: undefined, idempotencyKey: "idem-2" }));
    expect(a.ok && b.ok).toBe(true);
    expect(await runCount()).toBe(2);
  });

  it("AC6: a model-profile override whose provider lacks the class's capabilities is rejected at creation", async () => {
    const res = await createRun(
      deps,
      baseInput({ modelProfile: { tier: "balanced", overrides: [{ phaseClass: "research", provider: "openai" }] } }),
    );
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("model_profile_rejected");
    expect(await runCount()).toBe(0); // rejected before any row is written
  });

  it("sheet-less run → awaiting_consent with a confirm_cost gate (no hold yet)", async () => {
    const res = await createRun(deps, baseInput({ sheetLaunched: false }));
    expect(res.ok && res.state).toBe("awaiting_consent");
    expect(deps.ledger.opsOf("hold")).toHaveLength(0);
    if (res.ok) {
      const gate = (
        await db.txRunner.run(seed.workspaceId, (tx) =>
          tx.query("select kind, blocking, on_expiry from gates where run_id = $1", [res.runId]),
        )
      ).rows[0] as { kind: string; blocking: boolean; on_expiry: string };
      expect(gate).toMatchObject({ kind: "confirm_cost", blocking: true, on_expiry: "cancel" });
      expect(deps.eventWriter.typesForRun(res.runId)).toContain("gate.opened");
    }
  });

  it("insufficient balance never bills — the whole creation rolls back (no run, no memo)", async () => {
    const ledger = new TestHoldLedger({ insufficient: true });
    const d = makeDeps(db, { ledger });
    const res = await createRun(d, baseInput());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("insufficient_balance");
    expect(await runCount()).toBe(0);
    const memo = await db.client.query("select count(*)::int as n from run_idempotency", []);
    expect((memo.rows[0] as { n: number }).n).toBe(0);
  });

  it("PRB.08 / REQ-SPEC-24.7: a suspended account's hold refusal rolls the creation back as account_suspended", async () => {
    const ledger = new TestHoldLedger({ suspended: true });
    const d = makeDeps(db, { ledger });
    const res = await createRun(d, baseInput());
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("account_suspended"); // the api surfaces 403
    expect(await runCount()).toBe(0); // no run row, no memo — a suspended account never silently queues
    const memo = await db.client.query("select count(*)::int as n from run_idempotency", []);
    expect((memo.rows[0] as { n: number }).n).toBe(0);
  });
});

describe("P1.06 — the concurrency ruling (per-write-lock, not per-project) + scope (REQ-CHAT-23; G22)", () => {
  const READER: Partial<CreateRunInput> = { workflow: "review", seat: "editor" };

  it("two scoped readers of one draft run in parallel (distinct scope keys ⇒ distinct corr locks)", async () => {
    const a = await createRun(deps, baseInput({ ...READER, lockSetSpec: { projectId: seed.projectId, draftId: seed.draftId, corrKind: "review", corrK: 1, scopeKey: "section:III" }, scope: [{ kind: "section", ref: "III" }] }));
    const b = await createRun(deps, baseInput({ ...READER, idempotencyKey: "idem-2", lockSetSpec: { projectId: seed.projectId, draftId: seed.draftId, corrKind: "review", corrK: 1, scopeKey: "section:IV" }, scope: [{ kind: "section", ref: "IV" }] }));
    expect(a.ok && b.ok).toBe(true);
    expect(await runCount()).toBe(2);
  });

  it("an unscoped reader ∥ a scoped reader of the same draft (distinct corr slots)", async () => {
    const a = await createRun(deps, baseInput(READER));
    const b = await createRun(deps, baseInput({ ...READER, idempotencyKey: "idem-2", lockSetSpec: { projectId: seed.projectId, draftId: seed.draftId, corrKind: "review", corrK: 1, scopeKey: "section:III" } }));
    expect(a.ok && b.ok).toBe(true);
    expect(await runCount()).toBe(2);
  });

  it("an identical scoped reader collides — same corr slot, no duplicate spend", async () => {
    const a = await createRun(deps, baseInput({ ...READER, lockSetSpec: { projectId: seed.projectId, draftId: seed.draftId, corrKind: "review", corrK: 1, scopeKey: "section:III" } }));
    const b = await createRun(deps, baseInput({ ...READER, idempotencyKey: "idem-2", lockSetSpec: { projectId: seed.projectId, draftId: seed.draftId, corrKind: "review", corrK: 1, scopeKey: "section:III" } }));
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
    if (!b.ok && b.reason === "run_in_progress" && a.ok) expect(b.activeRunId).toBe(a.runId);
    expect(await runCount()).toBe(1);
  });

  it("variant slots still discriminate (corr k=1 ∥ k=2 — §12.4)", async () => {
    const a = await createRun(deps, baseInput(READER));
    const b = await createRun(deps, baseInput({ ...READER, idempotencyKey: "idem-2", lockSetSpec: { projectId: seed.projectId, draftId: seed.draftId, corrKind: "review", corrK: 2 } }));
    expect(a.ok && b.ok).toBe(true);
  });

  it("a reader ∥ a writer of the same draft (review reads vN while revise writes vN+1 — §12.4)", async () => {
    const reader = await createRun(deps, baseInput(READER));
    const writer = await createRun(
      deps,
      baseInput({
        idempotencyKey: "idem-2",
        workflow: "revise",
        seat: "author",
        lockSetSpec: { projectId: seed.projectId, draftId: seed.draftId, nextDraftId: "dft_next_1" },
      }),
    );
    expect(reader.ok && writer.ok).toBe(true);
    expect(await runCount()).toBe(2);
  });

  it("two writers still exclude one another (ns:write is exclusive — §6.3 'never two writers')", async () => {
    const a = await createRun(
      deps,
      baseInput({ workflow: "revise", seat: "author", lockSetSpec: { projectId: seed.projectId, draftId: seed.draftId, nextDraftId: "dft_next_1" } }),
    );
    const b = await createRun(
      deps,
      baseInput({ idempotencyKey: "idem-2", workflow: "draft", seat: "author", lockSetSpec: { projectId: seed.projectId, nextDraftId: "dft_next_2" } }),
    );
    expect(a.ok).toBe(true);
    expect(b.ok).toBe(false);
    if (!b.ok) expect(b.reason).toBe("run_in_progress");
    expect(await runCount()).toBe(1);
  });

  it("a writer ∥ a reader starting after it (the writer's base-read is shared, not exclusive)", async () => {
    const writer = await createRun(
      deps,
      baseInput({ workflow: "revise", seat: "author", lockSetSpec: { projectId: seed.projectId, draftId: seed.draftId, nextDraftId: "dft_next_1" } }),
    );
    const reader = await createRun(deps, baseInput({ ...READER, idempotencyKey: "idem-2" }));
    expect(writer.ok && reader.ok).toBe(true);
  });

  it("runs.scope persists the parsed scope refs + freezes them into inputs and the snapshot", async () => {
    const res = await createRun(
      deps,
      baseInput({ ...READER, scope: [{ kind: "section", ref: "III" }, { kind: "finding", version: 2, ordinal: 17 }] }),
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const row = (
      await db.txRunner.run(seed.workspaceId, (tx) =>
        tx.query("select scope, inputs, input_snapshot from runs where id = $1", [res.runId]),
      )
    ).rows[0] as { scope: unknown; inputs: { scope?: unknown }; input_snapshot: { scope?: unknown } };
    expect(row.scope).toEqual([{ kind: "section", ref: "III" }, { kind: "finding", version: 2, ordinal: 17 }]);
    expect(row.inputs.scope).toEqual(row.scope);
    expect(row.input_snapshot.scope).toEqual(row.scope);
  });

  it("an unscoped run leaves scope NULL", async () => {
    const res = await createRun(deps, baseInput());
    expect(res.ok).toBe(true);
    const row = (await db.client.query("select scope from runs", [])).rows[0] as { scope: unknown };
    expect(row.scope).toBeNull();
  });

  it("promote-on-launch (§5.6 item 7): a run reading a working head freezes it to its promoted version", async () => {
    // a saved working head — promote-ready (promoted_version_id set).
    await db.pg.query(
      `insert into artifacts(id, workspace_id, project_id, kind, namespace, mirror_path)
         values ('art_1', $1, $2, 'draft', 'drafts', 'drafts/v1.md')`,
      [seed.workspaceId, seed.projectId],
    );
    await db.pg.query(
      `insert into artifact_versions(id, artifact_id, ordinal, content_sha256, s3_key, bytes, media_type, created_by)
         values ('av_1', 'art_1', 1, 'sha1', 's3/av_1', 10, 'text/markdown', '{}')`,
      [],
    );
    await db.pg.query(`update drafts set promoted_version_id = 'av_1' where id = $1`, [seed.draftId]);

    const res = await createRun(deps, baseInput(READER));
    expect(res.ok).toBe(true);
    const d = (await db.client.query("select state, frozen_by from drafts where id = $1", [seed.draftId])).rows[0] as {
      state: string;
      frozen_by: { cause: string; runId?: string };
    };
    expect(d.state).toBe("frozen");
    expect(d.frozen_by.cause).toBe("run_read");
    if (res.ok) expect(d.frozen_by.runId).toBe(res.runId);
  });

  it("a run on an already-frozen (or unpromoted) head leaves it alone", async () => {
    // seeded working head has NO promoted_version_id — freeze must no-op rather than violate the check.
    const res = await createRun(deps, baseInput(READER));
    expect(res.ok).toBe(true);
    const d = (await db.client.query("select state from drafts where id = $1", [seed.draftId])).rows[0] as { state: string };
    expect(d.state).toBe("working");
  });
});
