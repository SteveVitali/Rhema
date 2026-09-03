import { afterAll, describe, expect, it } from "vitest";
import pg from "pg";
import { applyMigrations, seedRealProjects, type MigrationDb } from "@rhema/db";

// Closes D-P0.02-1: run the forward-only migrations + the real-project seed against a SERVER Postgres (the CI
// `postgres:16` service via DATABASE_URL), not only in-process PGlite. Proves the authoritative SQL DDL applies on a
// native Postgres and the seed lands. Skips when DATABASE_URL is unset (local runs use PGlite everywhere else).

const DATABASE_URL = process.env.DATABASE_URL;
const pool = DATABASE_URL ? new pg.Pool({ connectionString: DATABASE_URL }) : null;

afterAll(async () => { await pool?.end(); });

describe.skipIf(!DATABASE_URL)("migrations + real-project seed against a server Postgres (D-P0.02-1)", () => {
  const db: MigrationDb = {
    exec: (sql) => pool!.query(sql),
    query: (sql, params) => pool!.query(sql, params as unknown[]),
  };

  it("applies every migration and seeds the three real projects", async () => {
    const applied = await applyMigrations(db);
    // a fresh CI database applies the full history (0001…0015); an idempotent re-run applies none.
    expect(applied.length).toBeGreaterThanOrEqual(0);

    // every migration file is recorded (the authoritative DDL ran on native Postgres).
    const recorded = (await pool!.query("select count(*)::int n from _migrations")).rows[0] as { n: number };
    expect(recorded.n).toBeGreaterThanOrEqual(15);

    await seedRealProjects(db);
    // drafts is not RLS-forced, so a bare read is valid; seedRealProjects lands 2 versions × 3 projects.
    const drafts = (await pool!.query("select count(*)::int n from drafts")).rows[0] as { n: number };
    expect(drafts.n).toBeGreaterThanOrEqual(6);
  });
});
