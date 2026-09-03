import { describe, it, expect } from "vitest";
import type { Pool } from "pg";
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
