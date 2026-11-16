import { readFileSync, readdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

// The forward-only migrator (REQ-DATA-3). Migrations are plain SQL files in packages/db/migrations, applied in
// lexicographic order by a TypeScript migrator in CI against a seed built from the three real projects. The
// migrator is engine-agnostic: it takes an `exec(sql)` callback, so the same code runs against PGlite (the
// deterministic unit tests) and against real Postgres/Aurora (the integration job). Applied migrations are
// tracked in `_migrations`; re-running is a no-op.

/** The migrations directory (package-root/migrations), resolvable from both src/ and dist/. */
const MIGRATIONS_DIR = fileURLToPath(new URL("../migrations/", import.meta.url));

export interface Migration {
  name: string;
  sql: string;
}

/** Read every `NNNN_*.sql` migration, sorted by filename (forward-only order). */
export function readMigrations(): Migration[] {
  return readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+.*\.sql$/.test(f))
    .sort()
    .map((name) => ({ name, sql: readFileSync(`${MIGRATIONS_DIR}${name}`, "utf8") }));
}

/**
 * A migration target: `exec` runs (possibly multi-statement) SQL — a whole migration file; `query` runs one
 * statement and returns rows. PGlite (`.exec` / `.query`) and node-postgres (both via `.query`) satisfy it.
 */
export interface MigrationDb {
  exec: (sql: string) => Promise<unknown>;
  query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
}

export interface ApplyOptions {
  /** Apply only up to and including this migration name (for tests that need to seed mid-history). */
  until?: string;
  /** Called after each migration is applied (for logging). */
  onApplied?: (name: string) => void;
}

/**
 * BL-119 (RH-A1-10) — one advisory lock for the whole run: two concurrent migrators (a deploy
 * race) serialize on the session; the loser waits, re-reads `_migrations` under the winner's
 * committed state, and no-ops. Session-scoped on `db` — see the pinning contract below.
 */
const MIGRATION_LOCK = "rhema-db-migrations";

/** A file whose DDL cannot ride a tx (e.g. CREATE INDEX CONCURRENTLY) opts out on its FIRST line. */
const NO_TX_MARKER = "-- no-migration-tx";

/**
 * Apply all not-yet-applied migrations in order. Idempotent: a migration recorded in `_migrations` is skipped.
 * Returns the names actually applied in this call.
 *
 * BL-119 — `db` MUST be a pinned single connection (`pg.PoolClient`, `pg.Client`, PGlite): the
 * advisory lock, each `begin`/`exec`/record/`commit`, and the unlock all ride the same wire. A
 * `pg.Pool` scatters statements across connections — pool callers use `applyMigrationsPinned`.
 * Each file + its `_migrations` row commit atomically in ONE tx, so a mid-file failure rolls both
 * back (no applied-but-unrecorded drift). A file that cannot ride a tx opts out with a first-line
 * `-- no-migration-tx` marker (the one non-atomic arm — the record insert still follows the file).
 */
export async function applyMigrations(db: MigrationDb, opts: ApplyOptions = {}): Promise<string[]> {
  await db.query(`select pg_advisory_lock(hashtext($1))`, [MIGRATION_LOCK]);
  try {
    await db.exec(
      `create table if not exists _migrations (name text primary key, applied_at timestamptz not null default now())`,
    );
    const res = await db.query(`select name from _migrations`);
    const applied = new Set(
      res.rows
        .map((r) => (r && typeof r === "object" ? (r as { name?: unknown }).name : undefined))
        .filter((n): n is string => typeof n === "string"),
    );

    const appliedNow: string[] = [];
    for (const m of readMigrations()) {
      if (applied.has(m.name)) {
        if (opts.until && m.name === opts.until) break;
        continue;
      }
      if (m.sql.trimStart().toLowerCase().startsWith(NO_TX_MARKER)) {
        await db.exec(m.sql);
        await db.query(`insert into _migrations (name) values ($1)`, [m.name]);
      } else {
        await db.query("begin");
        try {
          await db.exec(m.sql);
          await db.query(`insert into _migrations (name) values ($1)`, [m.name]);
          await db.query("commit");
        } catch (err) {
          await db.query("rollback").catch(() => undefined);
          throw err;
        }
      }
      applied.add(m.name);
      appliedNow.push(m.name);
      opts.onApplied?.(m.name);
      if (opts.until && m.name === opts.until) break;
    }
    return appliedNow;
  } finally {
    await db.query(`select pg_advisory_unlock(hashtext($1))`, [MIGRATION_LOCK]).catch(() => undefined);
  }
}

/** A pool that can pin one connection for a whole run — `pg.Pool` satisfies this. */
export interface MigrationPool {
  connect: () => Promise<{
    query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }>;
    release: () => void;
  }>;
}

/**
 * `applyMigrations` over a pool: ONE connection is checked out for the whole run so the advisory
 * lock, every begin/exec/record/commit, and the unlock ride the same wire (BL-119 — the defect the
 * pool wrapper had: `pool.query` per statement scattered them across connections, so a migration's
 * file and its `_migrations` row could even land on different connections).
 */
export async function applyMigrationsPinned(pool: MigrationPool, opts: ApplyOptions = {}): Promise<string[]> {
  const conn = await pool.connect();
  const db: MigrationDb = {
    exec: (sql) => conn.query(sql),
    query: (sql, params) => conn.query(sql, params),
  };
  try {
    return await applyMigrations(db, opts);
  } finally {
    conn.release();
  }
}
