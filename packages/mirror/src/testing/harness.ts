// PGlite-backed test harness for @rhema/mirror — the chain's deterministic DB-test pattern. Applies the real
// @rhema/db migrations in-process and exposes a bare `SqlExecutor`. The mirror's reads/writes are RLS tables,
// but PGlite's superuser bypasses RLS, so materialize/harvest/delivery run against real Postgres semantics
// without a tenant scope; the orchestrator's own tests cover the RLS-wrapped path.

import { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "@rhema/db";
import type { SqlExecutor } from "../sql.js";
import { InMemoryContentStore, sha256Hex } from "../content-store.js";

export interface MirrorTestDb {
  readonly pg: PGlite;
  readonly exec: SqlExecutor;
  close(): Promise<void>;
}

export async function createMirrorTestDb(): Promise<MirrorTestDb> {
  const pg = new PGlite();
  await applyMigrations({
    exec: (sql: string) => pg.exec(sql),
    query: (sql: string, params?: unknown[]) => pg.query(sql, params),
  });
  const exec: SqlExecutor = { query: (sql, params) => pg.query(sql, params as unknown[]) };
  return { pg, exec, close: () => pg.close() };
}

// Crockford base32 (ULID alphabet) — ids must be a valid 26-char ULID because they flow into event payloads
// validated against @rhema/contracts' `idSchema` (e.g. run.report.reportVersionId).
const CROCKFORD = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
function toUlid(n: number): string {
  let s = "";
  let v = n + 1;
  while (v > 0) {
    s = CROCKFORD[v % 32] + s;
    v = Math.floor(v / 32);
  }
  return s.padStart(26, "0");
}

/** Deterministic id factory (valid ULIDs) + fixed clock for tests. */
export function testDeps(seed = 0): { ids: (p: string) => string; clock: { now(): Date } } {
  let n = seed;
  return {
    ids: (_p: string) => toUlid(n++),
    clock: { now: () => new Date("2026-09-03T00:00:00.000Z") },
  };
}

export { InMemoryContentStore, sha256Hex };
