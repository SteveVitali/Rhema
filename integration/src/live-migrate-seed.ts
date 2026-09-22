// The LIVE migrate + seed runner (P0.15c Stage B). Applies the forward-only SQL migrations then the
// three-real-project seed against a SERVER Postgres (DATABASE_URL) so a freshly-provisioned dev database is
// brought up to the authoritative schema + fixture base the live exit driver runs against. It reuses the exact
// `{exec, query}` MigrationDb adaptation server-postgres.test.ts (D-P0.02-1) uses over a pg.Pool.
//
// Idempotent: `applyMigrations` skips already-recorded migrations, and the real-project seed is skipped when its
// non-`on conflict` rows (the obligation_transitions) are already present — so this is safe to re-run.
//
// `@rhema/db` (main → dist/index.js) and `pg` are pnpm-isolated to this package, so a plain repo-root `.mjs`
// cannot import them; the thin `scripts/live/migrate-seed.mjs` runner spawns tsx on this file, where they resolve.

import pg from "pg";
import { applyMigrations, seedRealProjects, type MigrationDb } from "@rhema/db";

/** The obligation_transitions ids the seed inserts WITHOUT `on conflict` — their presence ⇒ the seed already ran. */
const SEED_MARKERS = ["tr_pv1", "tr_sd1", "tr_cr1"];

export interface MigrateSeedResult {
  /** migration filenames actually applied by this call (empty on an idempotent re-run). */
  readonly applied: string[];
  /** total migrations recorded in `_migrations` after applying. */
  readonly migrationsRecorded: number;
  /** whether the real-project seed was run (false ⇒ already present, skipped). */
  readonly seeded: boolean;
  readonly projects: number;
  readonly drafts: number;
}

/**
 * Apply every not-yet-applied migration then the three-real-project seed against `pool`. Logs each migration
 * applied and the seeded project/draft counts. Idempotent (safe to re-run).
 */
export async function runMigrateSeed(pool: pg.Pool, log: (msg: string) => void = console.log): Promise<MigrateSeedResult> {
  // The MigrationDb target `@rhema/db` expects, adapted onto a pg.Pool (the D-P0.02-1 pattern).
  const db: MigrationDb = {
    exec: (sql) => pool.query(sql),
    query: (sql, params) => pool.query(sql, params as unknown[]),
  };

  const applied = await applyMigrations(db, { onApplied: (name) => log(`[migrate] applied ${name}`) });
  if (applied.length === 0) log("[migrate] no new migrations — schema already up to date");
  const recorded = (await pool.query("select count(*)::int n from _migrations")).rows[0] as { n: number };
  log(`[migrate] ${recorded.n} migrations recorded`);

  const marker = (await pool.query("select count(*)::int n from obligation_transitions where id = any($1)", [SEED_MARKERS]))
    .rows[0] as { n: number };
  let seeded = false;
  if (marker.n > 0) {
    log("[seed] real-project seed already present — skipping (idempotent re-run)");
  } else {
    await seedRealProjects(db);
    seeded = true;
    log("[seed] applied the three-real-project seed");
  }

  const projects = (await pool.query("select count(*)::int n from projects")).rows[0] as { n: number };
  const drafts = (await pool.query("select count(*)::int n from drafts")).rows[0] as { n: number };
  log(`[seed] ${projects.n} projects, ${drafts.n} drafts present`);

  return { applied, migrationsRecorded: recorded.n, seeded, projects: projects.n, drafts: drafts.n };
}

/** CLI entry: read DATABASE_URL, run the migrate + seed, exit non-zero on error. */
export async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[migrate-seed] DATABASE_URL is required");
    process.exit(1);
    return;
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await runMigrateSeed(pool);
    console.log("[migrate-seed] done");
  } catch (err) {
    console.error("[migrate-seed] failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

// Run when invoked directly (`tsx integration/src/live-migrate-seed.ts`), not when imported.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void main();
}
