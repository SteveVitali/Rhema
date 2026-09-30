// The LIVE PROD migrate + seed runner (PRB.15 Stage B — operator-gated). Applies the forward-only SQL
// migrations then seeds the PROTOCOL rows (`seedProtocols` — the Essay protocol; §6.7) against the
// production managed Postgres over a pg.Pool (prod = Cloud SQL, amended 2026-09-17 — reach it via
// `cloud-sql-proxy --private-ip` per infra/PROD-BRINGUP.md §7). Deliberately does NOT run
// `seedRealProjects` — that fixture is
// dev/preview sample data and must never land on prod (real accounts provision themselves through
// self-serve signup). The code-seeded data prod DOES need: the protocol table + the `agent_types` seat
// rows (PRB.17 — the seat tool-token sets the §12.6 hook enforces come from `agent_types.tools`).
//
// Idempotent: `applyMigrations` skips already-recorded migrations; `seedProtocols` upserts on
// (id, version). Safe to re-run. Verifies afterward: prints the recorded-migration count and every
// `protocols` row id+version so the operator can eyeball the Essay seed.
//
// `@rhema/db` + `@rhema/protocols` + `pg` are pnpm-isolated to this package, so a plain repo-root `.mjs`
// cannot import them; the thin `scripts/live/prod-migrate-seed.mjs` runner spawns tsx on this file.

import pg from "pg";
import { applyMigrations, agentTypesSeed, type MigrationDb } from "@rhema/db";
import { seedProtocols } from "@rhema/protocols";

export interface ProdBringupResult {
  /** migration filenames actually applied by this call (empty on an idempotent re-run). */
  readonly applied: string[];
  readonly migrationsRecorded: number;
  /** every (id, version) pair now in `protocols` — the prod seed content. */
  readonly protocols: { id: string; version: number }[];
}

export async function runProdMigrateSeed(
  pool: pg.Pool,
  log: (msg: string) => void = console.log,
): Promise<ProdBringupResult> {
  // The MigrationDb target `@rhema/db` expects, adapted onto a pg.Pool (the D-P0.02-1 pattern).
  const db: MigrationDb = {
    exec: (sql) => pool.query(sql),
    query: (sql, params) => pool.query(sql, params as unknown[]),
  };

  const applied = await applyMigrations(db, { onApplied: (name) => log(`[migrate] applied ${name}`) });
  if (applied.length === 0) log("[migrate] no new migrations — schema already up to date");
  const recorded = (await pool.query("select count(*)::int n from _migrations")).rows[0] as { n: number };
  log(`[migrate] ${recorded.n} migrations recorded`);

  // The protocol seed — Essay only in this phase (Q-22); upserts on (id, version) so a re-run refreshes
  // the §6.7 body rather than duplicating. NO seedRealProjects here — prod holds real accounts only.
  await seedProtocols(db);
  const protocols = (
    await pool.query("select id, version from protocols order by id, version")
  ).rows as { id: string; version: number }[];
  for (const p of protocols) log(`[seed] protocol ${p.id} v${p.version}`);
  if (protocols.length === 0) throw new Error("seedProtocols ran but the protocols table is empty");

  // The agent_types code-seed (REQ-DATA-3): the five seat rows drive `agent_types.tools` → the seat
  // policy's tool-token set the §12.6 hook enforces. PRB.17 found prod's table EMPTY (this runner only
  // seeded protocols), so once the PreToolUse envelope fix made enforcement real, every matched tool
  // was denied for every seat and no phase could commit. Idempotent (on conflict do nothing).
  await agentTypesSeed(db);
  const seats = (await pool.query("select key from agent_types order by key")).rows as { key: string }[];
  log(`[seed] agent_types: ${seats.map((s) => s.key).join(", ") || "(none)"}`);
  if (seats.length === 0) throw new Error("agentTypesSeed ran but the agent_types table is empty");

  return { applied, migrationsRecorded: recorded.n, protocols };
}

/** CLI entry: read DATABASE_URL (a privileged AlloyDB connection — operator-held), run, exit non-zero on error. */
export async function main(): Promise<void> {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    console.error("[prod-migrate-seed] DATABASE_URL is required (a privileged prod Postgres connection — Cloud SQL via cloud-sql-proxy)");
    process.exit(1);
    return;
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  try {
    await runProdMigrateSeed(pool);
    console.log("[prod-migrate-seed] done");
  } catch (err) {
    console.error("[prod-migrate-seed] failed:", err);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

// Run when invoked directly (`tsx integration/src/live-prod-bringup.ts`), not when imported.
if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  void main();
}
