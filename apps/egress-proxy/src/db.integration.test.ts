import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, type MigrationDb } from "@rhema/db";
import type { RunContext } from "./context.js";
import { meterResponse } from "./metering.js";
import { EMPTY_METERED_USAGE } from "./rates.js";
import { buildRequestFetchLogRow } from "./fetch-log.js";
import { SqlCapAccountant, SqlFetchLogWriter, SqlUsageWriter, type SqlExecutor } from "./sinks.js";
import { ulid } from "./ids.js";

// Integration: run the proxy's SQL writers against the REAL migrated schema (PGlite = Postgres in WASM), so the
// rows of record and the fetch log of record are proven valid against the authoritative migration DDL — incl.
// the FORCE-RLS + FK constraints and the 0006 fetch_log.attempt column this ticket added. Deterministic.

let pg: PGlite;
let db: SqlExecutor & MigrationDb;

beforeEach(async () => {
  pg = new PGlite();
  await pg.exec("select 1");
  db = {
    exec: (sql: string) => pg.exec(sql),
    query: (sql: string, params?: unknown[]) => pg.query(sql, params) as Promise<{ rows: unknown[] }>,
  };
  await applyMigrations(db);
  // Minimal parents for the FKs (usage_records → workspaces + billing_accounts; fetch_log → runs → workspaces).
  await pg.exec(`
    insert into billing_accounts (id) values ('bill1');
    insert into workspaces (id, kind, name, billing_account_id) values ('ws1','personal','W','bill1');
    insert into runs (id, workspace_id, workflow, state, inputs, model_profile, model_tier, rigor,
                      estimate_credits, cap_credits, rate_table_version)
      values ('run_1','ws1','review','running','{}'::jsonb,'balanced-v1','balanced','standard', 1000, 5000, 1);
  `);
});

afterEach(async () => {
  await pg.close();
});

function ctx(): RunContext {
  return {
    runId: "run_1",
    attempt: 2,
    agentId: "editor",
    role: "editor",
    workspaceId: "ws1",
    billingAccountId: "bill1",
    provider: "anthropic",
    modelTier: "balanced",
    rateTableVersion: 1,
    capCredits: 5000,
    allowlist: { endpoints: [], models: ["claude-opus-5"] },
    urlPolicy: { blockedDomains: [] },
  };
}

describe("SqlUsageWriter → usage_records (meter of record, AC2)", () => {
  it("writes a metered row that round-trips through the migrated schema", async () => {
    const usage = { ...EMPTY_METERED_USAGE, inputTokens: 1_000_000, outputTokens: 1_000_000 };
    const { row } = meterResponse({ ctx: ctx(), usage, model: "claude-opus-5", agentId: "editor", id: ulid() });
    await new SqlUsageWriter(db).write(row);

    const res = await db.query(
      `select run_id, attempt, source, model, model_tier, rate_table_version, list_cost_usd, credits, searches
         from usage_records where run_id = 'run_1'`,
    );
    expect(res.rows).toHaveLength(1);
    const got = res.rows[0] as Record<string, unknown>;
    expect(got.run_id).toBe("run_1");
    expect(got.attempt).toBe(2);
    expect(got.source).toBe("proxy");
    expect(got.model).toBe("claude-opus-5");
    expect(Number(got.list_cost_usd)).toBeCloseTo(30, 6);
    expect(got.credits).toBe(4200);
  });

  it("SqlCapAccountant sums list cost × 1.4 ÷ $0.01 across served rows (AC2)", async () => {
    const writer = new SqlUsageWriter(db);
    const usage = { ...EMPTY_METERED_USAGE, inputTokens: 1_000_000, outputTokens: 1_000_000 };
    // two served responses: $30 each → $60 list → $84 platform → 8400 credits.
    await writer.write(meterResponse({ ctx: ctx(), usage, model: "claude-opus-5", agentId: "e", id: ulid() }).row);
    await writer.write(meterResponse({ ctx: ctx(), usage, model: "claude-opus-5", agentId: "e", id: ulid() }).row);
    const spent = await new SqlCapAccountant(db).spentCredits("run_1");
    expect(spent).toBeCloseTo(8400, 6);
  });
});

describe("SqlFetchLogWriter → fetch_log (fetch log of record, AC6)", () => {
  it("writes a request row incl. the 0006 attempt column", async () => {
    const row = buildRequestFetchLogRow(
      { runId: "run_1", attempt: 2, agentLabel: "editor" },
      { url: "https://api.anthropic.com/v1/messages", status: 200, bytes: 128, decision: "allow" },
    );
    await new SqlFetchLogWriter(db).write(row);

    const res = await db.query(
      `select run_id, attempt, agent_label, kind, url, status, decision from fetch_log where run_id = 'run_1'`,
    );
    expect(res.rows).toHaveLength(1);
    expect(res.rows[0]).toMatchObject({
      run_id: "run_1",
      attempt: 2,
      agent_label: "editor",
      kind: "inference",
      status: 200,
      decision: "allow",
    });
  });
});
