import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createRun, type CreateRunInput, type OrchestratorDeps, commitStep } from "@rhema/orchestrator";
import { makeDeps, createOrchestratorTestDb, seedProject } from "@rhema/orchestrator/testing";
import { SqlHoldLedger } from "./sql-ledger.js";
import { grant } from "./entries.js";
import { testEntryDeps, seedBalances, readBalances, readLedgerRows, type LedgerTestDb } from "./testing/index.js";

// The orchestrator authored the `HoldLedger` port for P0.11 to fill (packages/orchestrator/src/ledger.ts). Its
// own tests drive the coupling points with the `TestHoldLedger` stub; this proves the SAME orchestrator flow
// works when the REAL `SqlHoldLedger` is injected — a hold at create, a cap-clamped debit at commit — writing
// actual credit_ledger / credit_balances rows. This is the wiring apps/api + apps/worker assemble at deploy
// (the live pg/queue/token binding is D-P0.08-1).

let db: LedgerTestDb;
let seed: Awaited<ReturnType<typeof seedProject>>;
let deps: OrchestratorDeps;
let ledger: SqlHoldLedger;

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  seed = await seedProject(db, { draftN: 1 });
  ledger = new SqlHoldLedger(testEntryDeps());
  // The real ledger replaces the stub in the orchestrator's DI bundle.
  deps = { ...makeDeps(db), ledger } as unknown as OrchestratorDeps;
  await seedBalances(db, { billingAccountId: seed.billingAccountId, balances: { included: 5000 } });
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

describe("the orchestrator drives the real SqlHoldLedger through its port", () => {
  it("createRun places a real hold that moves available → held", async () => {
    const res = await createRun(deps, baseInput());
    expect(res.ok).toBe(true);
    if (!res.ok) return;

    // the hold reserved the 840 cap from the included bucket
    expect((await readBalances(db, seed.billingAccountId)).included).toEqual({ available: 4160, held: 840 });
    const holds = (await readLedgerRows(db, res.runId)).filter((r) => r.kind === "hold");
    expect(holds).toHaveLength(1);
    expect(holds[0]).toMatchObject({ credits: 840, bucket: "included" });
  });

  it("commitStep debits the committed phase against the hold through the real ledger", async () => {
    const created = await createRun(deps, baseInput());
    expect(created.ok).toBe(true);
    if (!created.ok) return;
    const runId = created.runId;

    // move the run to `running` so commitStep's transition is valid (queued→provisioning→running).
    await db.txRunner.run(seed.workspaceId, async (tx) => {
      await tx.query("update runs set state = 'running' where id = $1", [runId]);
    });

    await commitStep(deps, {
      runId,
      attempt: 1,
      workspaceId: seed.workspaceId,
      stepKey: "research",
      ordinal: 1,
      of: 4,
      credits: 300,
      producedVersionIds: [],
      result: { status: "done", sdkSubtype: "success", predicatesPassed: true, compactions: 0 },
      next: { kind: "advance" },
    });

    const debited = (await readLedgerRows(db, runId)).filter((r) => r.kind === "debit").reduce((s, r) => s + r.credits, 0);
    expect(debited).toBe(300);
    // spent 300 of the 840 hold; held falls to 540, available unchanged.
    expect((await readBalances(db, seed.billingAccountId)).included).toEqual({ available: 4160, held: 540 });
  });

  it("insufficient balance surfaces the run-creation resolution (never bills)", async () => {
    // drain the balance so the cap cannot fit
    await db.pg.query("update credit_balances set available = 100 where billing_account_id = $1 and bucket = 'included'", [
      seed.billingAccountId,
    ]);
    const res = await createRun(deps, baseInput({ idempotencyKey: "idem-broke" }));
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("insufficient_balance");
  });

  it("a granted top-up (the ledger's grant op) increases the spendable balance the hold can draw", async () => {
    await db.txRunner.run(seed.workspaceId, (tx) =>
      grant(tx, testEntryDeps(), { workspaceId: seed.workspaceId, billingAccountId: seed.billingAccountId, bucket: "topup", credits: 1000, idempotencyKey: "grant:topup:1" }),
    );
    expect((await readBalances(db, seed.billingAccountId)).topup).toEqual({ available: 1000, held: 0 });
  });
});
