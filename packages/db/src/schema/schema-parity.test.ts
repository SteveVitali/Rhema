import { describe, expect, it } from "vitest";
import { getTableConfig } from "drizzle-orm/pg-core";
import { createTestDb } from "../testing/pglite.js";
import * as schema from "./index.js";

// Drizzle ↔ SQL parity: the migrations are the authoritative DDL; this reflects the migrated database and
// asserts every Drizzle table and column exists in it (and every migrated table has a Drizzle definition), so
// the typed layer can never silently drift from the schema. Deterministic.

function drizzleTables() {
  const out: { name: string; columns: Set<string> }[] = [];
  for (const value of Object.values(schema)) {
    try {
      const cfg = getTableConfig(value as Parameters<typeof getTableConfig>[0]);
      out.push({ name: cfg.name, columns: new Set(cfg.columns.map((c) => c.name)) });
    } catch {
      // non-table export (types etc.) — skip
    }
  }
  return out;
}

describe("Drizzle schema ↔ migrations parity", () => {
  it("every Drizzle table and column exists in the migrated database", async () => {
    const db = await createTestDb();
    const cols = (
      await db.query(
        "select table_name, column_name from information_schema.columns where table_schema='public'",
      )
    ).rows as { table_name: string; column_name: string }[];

    const dbTables = new Map<string, Set<string>>();
    for (const c of cols) {
      if (!dbTables.has(c.table_name)) dbTables.set(c.table_name, new Set());
      dbTables.get(c.table_name)!.add(c.column_name);
    }

    for (const t of drizzleTables()) {
      const dbCols = dbTables.get(t.name);
      expect(dbCols, `table "${t.name}" missing in the migrated DB`).toBeDefined();
      for (const col of t.columns) {
        expect(dbCols!.has(col), `column "${t.name}.${col}" missing in the migrated DB`).toBe(true);
      }
    }
    await db.close();
  });

  it("every migrated table (except _migrations) has a Drizzle definition — no table left un-typed", async () => {
    const db = await createTestDb();
    // Exclude partition CHILD tables (relispartition): a daily `run_events` partition is not separately typed —
    // Drizzle models the partitioned PARENT (relkind 'p'), which this query keeps.
    const rows = (
      await db.query(
        `select c.relname as table_name
           from pg_class c join pg_namespace n on n.oid = c.relnamespace
          where n.nspname = 'public' and c.relkind in ('r', 'p') and not c.relispartition`,
      )
    ).rows as { table_name: string }[];
    const dbTableNames = new Set(rows.map((r) => r.table_name));
    dbTableNames.delete("_migrations"); // migrator bookkeeping, not a data table

    const drizzleNames = new Set(drizzleTables().map((t) => t.name));
    for (const name of dbTableNames) {
      expect(drizzleNames.has(name), `migrated table "${name}" has no Drizzle definition`).toBe(
        true,
      );
    }
    // and no Drizzle table names a table the DB lacks
    expect(drizzleNames.has("backlog_items")).toBe(false);
    // run_events IS now defined (P0.08b) and is the partitioned parent, not a child partition.
    expect(drizzleNames.has("run_events")).toBe(true);
    await db.close();
  });
});
