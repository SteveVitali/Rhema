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
 * Apply all not-yet-applied migrations in order. Idempotent: a migration recorded in `_migrations` is skipped.
 * Returns the names actually applied in this call.
 */
export async function applyMigrations(db: MigrationDb, opts: ApplyOptions = {}): Promise<string[]> {
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
    await db.exec(m.sql);
    await db.query(`insert into _migrations (name) values ($1)`, [m.name]);
    applied.add(m.name);
    appliedNow.push(m.name);
    opts.onApplied?.(m.name);
    if (opts.until && m.name === opts.until) break;
  }
  return appliedNow;
}
