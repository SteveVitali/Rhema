import { describe, it, expect } from "vitest";
import type { Pool } from "pg";
import { SqlEventWriter } from "@rhema/orchestrator";
import { pgClientToSqlClient, PgPoolTxRunner } from "./tx.js";

describe("pgClientToSqlClient", () => {
  it("narrows a pg client's QueryResult to { rows } and forwards params as a mutable array", async () => {
    const calls: Array<{ sql: string; params?: unknown[] }> = [];
    const fakePgClient = {
      query: (sql: string, params?: unknown[]) => {
        calls.push({ sql, params });
        return Promise.resolve({ rows: [{ id: 1 }], rowCount: 1, command: "SELECT" });
      },
    };
    const sql = pgClientToSqlClient(fakePgClient);
    const res = await sql.query("select $1", ["ws_1"]);
    expect(res).toEqual({ rows: [{ id: 1 }] });
    expect(calls).toEqual([{ sql: "select $1", params: ["ws_1"] }]);
  });

  it("passes undefined params through", async () => {
    const fakePgClient = { query: (_sql: string, params?: unknown[]) => Promise.resolve({ rows: [], params }) };
    const sql = pgClientToSqlClient(fakePgClient as unknown as { query: (s: string, p?: unknown[]) => Promise<{ rows: unknown[] }> });
    await sql.query("select 1");
    // no throw; undefined params accepted
    expect(true).toBe(true);
  });
});

describe("PgPoolTxRunner — deferred event wakes (D-SLO.1-6 lever 2)", () => {
  // A fake pool that answers just enough SQL for withTenant + SqlEventWriter.append: the seq upsert
  // returns a minted seq, everything else is a no-op row. Queries AND the fan-out publish land in the
  // same `log`, so the sequence proves the wakeup fires strictly after `commit` — never mid-tx.
  function harness() {
    const log: string[] = [];
    let seq = 0;
    const client = {
      query: (sql: string) => {
        const tag = sql.replace(/\s+/g, " ").trim();
        log.push(tag.length > 40 ? tag.slice(0, 40) : tag);
        if (sql.includes("run_event_seq")) return Promise.resolve({ rows: [{ seq: ++seq }] });
        return Promise.resolve({ rows: [] });
      },
      release: () => undefined,
    };
    const pool = { connect: () => Promise.resolve(client) } as unknown as Pool;
    const published: { runId: string; seq: number }[] = [];
    const publisher = {
      publish: (runId: string, s: number) => {
        log.push(`publish:${runId}:${s}`);
        published.push({ runId, seq: s });
      },
    };
    const writer = new SqlEventWriter(publisher);
    const runner = new PgPoolTxRunner(pool);
    const event = {
      runId: "run1",
      type: "run.started" as const,
      payload: {},
      at: new Date("2026-11-25T00:00:00Z"),
    };
    return { runner, writer, log, published, event };
  }

  it("queues an append's wakeup and publishes it only AFTER commit", async () => {
    const { runner, writer, log, published, event } = harness();
    await runner.run("ws_1", async (tx) => {
      await writer.append(tx, event);
      // mid-transaction: queued, not published — an early wake would be a wasted pump.
      expect(published).toHaveLength(0);
    });
    expect(published).toEqual([{ runId: "run1", seq: 1 }]);
    expect(log.indexOf("commit")).toBeGreaterThan(-1);
    expect(log.indexOf("commit")).toBeLessThan(log.indexOf("publish:run1:1"));
  });

  it("a rollback drains nothing — no wakeup for a rolled-back seq", async () => {
    const { runner, writer, log, published, event } = harness();
    await expect(
      runner.run("ws_1", async (tx) => {
        await writer.append(tx, event);
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(log).toContain("rollback");
    expect(published).toHaveLength(0);
  });
});

// The live RLS round-trip is proven on the wire (a real pg.Pool). It runs only when DATABASE_URL is set (the CI
// `integration` job / a local `postgres:16`); it self-skips otherwise, exactly like server-postgres.test.ts.
const DATABASE_URL = process.env.DATABASE_URL;
describe.skipIf(!DATABASE_URL)("PgPoolTxRunner (live pg)", () => {
  it("scopes a transaction to the RLS tenant and commits", async () => {
    const pg = await import("pg");
    const pool = new pg.default.Pool({ connectionString: DATABASE_URL }) as unknown as Pool;
    try {
      const runner = new PgPoolTxRunner(pool);
      const tenant = await runner.run("__system__", async (tx) => {
        const res = await tx.query("select current_setting('app.tenant_id', true) as t");
        return (res.rows[0] as { t: string }).t;
      });
      expect(tenant).toBe("__system__");
    } finally {
      await pool.end();
    }
  });
});
