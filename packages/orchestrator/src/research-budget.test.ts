// RES.3 (REQ-ENG-3) — the research-budget consult: the run-scoped claim-scaled envelope, summed
// across ALL attempts, counted like the proxy's own tracker (source='proxy' rows only; preflight
// probes + CITE.1 backfill isolated off the bound). The retry gate reads this figure — the
// D-RES.3-1 drain happened because nothing consulted it before re-executing.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, seedRun, type OrchestratorTestDb } from "./testing/pg.js";
import { makeDeps, type TestDeps } from "./testing/deps.js";
import {
  readRunWebToolsPolicy,
  researchBudgetConsult,
  RESEARCH_BUDGET_DEFAULT_FETCHES,
  RESEARCH_BUDGET_DEFAULT_SEARCHES,
} from "./research-budget.js";
import { mintProxyCredential } from "./provision.js";
import { authorRunAllowlist } from "./allowlist.js";

let db: OrchestratorTestDb;
let deps: TestDeps;
let seed: Awaited<ReturnType<typeof seedProject>>;

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  deps = makeDeps(db);
  seed = await seedProject(db, { draftN: 1 });
});
afterEach(() => db.close());

let seq = 0;
async function usageRow(args: {
  runId: string;
  attempt?: number;
  source?: string;
  phaseClass?: string | null;
  searches?: number;
  fetches?: number;
}): Promise<void> {
  seq++;
  await db.txRunner.run(seed.workspaceId, (tx) =>
    tx.query(
      `insert into usage_records(
         id, ts, workspace_id, billing_account_id, run_id, attempt, role, provider, model,
         model_tier, rate_table_version, searches, fetches, list_cost_usd, credits, source, phase_class)
       values ($1, now(), $2, $3, $4, $5, 'editor', 'anthropic', 'm', 'balanced', 1, $6, $7, 0, 1, $8, $9)`,
      [
        `usg_${seq}`,
        seed.workspaceId,
        seed.billingAccountId,
        args.runId,
        args.attempt ?? 1,
        args.searches ?? 0,
        args.fetches ?? 0,
        args.source ?? "proxy",
        args.phaseClass ?? null,
      ],
    ),
  );
}

describe("researchBudgetConsult — counting parity with the proxy tracker", () => {
  it("sums proxy-metered searches/fetches and subtracts from the authored bound", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId });
    await usageRow({ runId: "run1", searches: 12, fetches: 12 });
    const consult = await researchBudgetConsult(deps, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      webTools: { searchBudget: 17, fetchBudget: 48 },
    });
    expect(consult).toMatchObject({
      searchesUsed: 12,
      fetchesUsed: 12,
      searchBudget: 17,
      fetchBudget: 48,
      searchesRemaining: 5,
      fetchesRemaining: 36,
      exhausted: false,
    });
  });

  it("sums across ALL attempts — a fresh attempt/pod never resets the envelope (D-RES.3-1 isolation)", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId });
    await usageRow({ runId: "run1", attempt: 1, searches: 12, fetches: 12 });
    await usageRow({ runId: "run1", attempt: 2, searches: 3, fetches: 20 });
    await usageRow({ runId: "run1", attempt: 3, searches: 2, fetches: 16 });
    const consult = await researchBudgetConsult(deps, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      webTools: { searchBudget: 17, fetchBudget: 48 },
    });
    // the RES.3 live figure exactly: 17 searches + 48 fetches across attempts 1–3 → dead.
    expect(consult.searchesUsed).toBe(17);
    expect(consult.fetchesUsed).toBe(48);
    expect(consult.searchesRemaining).toBe(0);
    expect(consult.fetchesRemaining).toBe(0);
    expect(consult.exhausted).toBe(true);
  });

  it("preflight + backfill rows are isolated off the bound; non-proxy sources never count", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId });
    await usageRow({ runId: "run1", searches: 5, fetches: 5 });
    await usageRow({ runId: "run1", searches: 2, fetches: 2, phaseClass: "preflight" });
    await usageRow({ runId: "run1", fetches: 9, phaseClass: "backfill" });
    await usageRow({ runId: "run1", searches: 7, fetches: 7, source: "sdk_stream" });
    await usageRow({ runId: "run1", searches: 8, fetches: 8, source: "sdk_estimate" });
    const consult = await researchBudgetConsult(deps, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      webTools: { searchBudget: 17, fetchBudget: 48 },
    });
    expect(consult.searchesUsed).toBe(5);
    expect(consult.fetchesUsed).toBe(5);
    expect(consult.exhausted).toBe(false);
  });

  it("either axis alive is not exhausted — an alive kind can still do honest work", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId });
    await usageRow({ runId: "run1", searches: 17, fetches: 40 });
    const consult = await researchBudgetConsult(deps, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      webTools: { searchBudget: 17, fetchBudget: 48 },
    });
    expect(consult.searchesRemaining).toBe(0);
    expect(consult.fetchesRemaining).toBe(8);
    expect(consult.exhausted).toBe(false);
  });

  it("falls back to the proxy's fail-safe defaults when no policy is authored", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId });
    const consult = await researchBudgetConsult(deps, { runId: "run1", workspaceId: seed.workspaceId, webTools: null });
    expect(consult.searchBudget).toBe(RESEARCH_BUDGET_DEFAULT_SEARCHES);
    expect(consult.fetchBudget).toBe(RESEARCH_BUDGET_DEFAULT_FETCHES);
    expect(consult.exhausted).toBe(false);
  });

  it("a run with zero metered traffic has the full bound", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId });
    const consult = await researchBudgetConsult(deps, {
      runId: "run1",
      workspaceId: seed.workspaceId,
      webTools: { searchBudget: 17, fetchBudget: 48 },
    });
    expect(consult).toMatchObject({ searchesUsed: 0, fetchesUsed: 0, searchesRemaining: 17, fetchesRemaining: 48 });
  });
});

describe("readRunWebToolsPolicy — the credential-context policy read", () => {
  it("returns the latest active credential's webTools context; null when revoked/none", async () => {
    await seedRun(db, { runId: "run1", workspaceId: seed.workspaceId, projectId: seed.projectId });
    await mintProxyCredential(deps, {
      runId: "run1",
      attempt: 1,
      workspaceId: seed.workspaceId,
      billingAccountId: seed.billingAccountId,
      projectId: seed.projectId,
      role: "editor",
      agentId: "editor",
      provider: "anthropic",
      modelTier: "balanced",
      rateTableVersion: 1,
      capCredits: 840,
      allowlist: authorRunAllowlist({ modelTier: "balanced" }),
      webTools: { search: true, fetch: true, searchBudget: 17, fetchBudget: 48 },
    });
    const wt = await readRunWebToolsPolicy(deps, { runId: "run1", workspaceId: seed.workspaceId });
    expect(wt?.searchBudget).toBe(17);
    expect(wt?.fetchBudget).toBe(48);
    const absent = await readRunWebToolsPolicy(deps, { runId: "run_none", workspaceId: seed.workspaceId });
    expect(absent).toBeNull();
  });
});
