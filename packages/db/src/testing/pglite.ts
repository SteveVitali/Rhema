import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, type ApplyOptions } from "../migrate.js";
import type { TenantClient } from "../rls.js";

// In-process Postgres for the deterministic DB tests (AC2–AC5). PGlite is a full Postgres (plpgsql triggers,
// RLS FORCE, non-owner roles, partial indexes) compiled to WASM — no Docker — so the "(deterministic)" ACs
// run as ordinary vitest unit tests in the first CI job, not only against a live Postgres service. The same
// migrator runs here and against real Aurora in the integration job.

export interface TestDb extends TenantClient {
  /** The underlying PGlite instance (for `.exec` multi-statement SQL and `.transaction`). */
  pg: PGlite;
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
  exec(sql: string): Promise<void>;
  close(): Promise<void>;
}

/** Create a fresh in-memory database with all migrations applied (optionally up to `opts.until`). */
export async function createTestDb(opts: ApplyOptions = {}): Promise<TestDb> {
  const pg = new PGlite();
  await pg.exec("select 1"); // force init
  const db: TestDb = {
    pg,
    query: (sql, params) => pg.query(sql, params) as Promise<{ rows: unknown[] }>,
    exec: async (sql) => {
      await pg.exec(sql);
    },
    close: () => pg.close(),
  };
  await applyMigrations(db, opts);
  return db;
}
