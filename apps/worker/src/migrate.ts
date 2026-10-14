// OPS.1 (REQ-ARCH-38 / REQ-SPEC-30 / REQ-ARCH-39) — the in-VPC migrate/seed/provenance entrypoint,
// `dist/migrate.js` in the worker image; the non-prod `rhema-<stack>-migrate` Cloud Run Job invokes
// it (`args: ["node","/app/dist/migrate.js"]`, DSNs mounted via Secret Manager secretKeyRef — never
// a plaintext env). The prod path is untouched: prod still migrates over the operator IAP tunnel
// (integration/src/live-prod-bringup.ts).
//
// Responsibilities, in order:
//   1. Bootstrap — `create database rhema` when absent (connects to the maintenance db first).
//   2. `applyMigrations` over the SYSTEM dsn (the postgres role — forward-only, idempotent).
//   3. `ALTER ROLE … LOGIN PASSWORD` for the two IaC-generated role credentials —
//      `rhema_app_login` (SEC.1's user-serving role, born NOLOGIN by migration 0045) and
//      `rhema_collab` (born NOLOGIN by 0001). The passwords are parsed back out of the
//      APP_DATABASE_URL/COLLAB_DATABASE_URL DSNs the program mounted — the fresh-stack half of
//      REQ-SPEC-30: no hand ALTER, no postgres-for-everything.
//   4. Seed — `protocolsSeed` + `agentTypesSeed` on every non-prod stage; `seedRealProjects` ONLY
//      when the stage kind resolves `dev`. REQ-ARCH-38 forbids user-text fixtures on previews —
//      a `pr-*`/`preview` target logs the refusal and seeds code rows only.
//   5. RECORD_DEPLOYMENT=1 → insert-or-refresh the `deployments` row via @rhema/infra's
//      `buildDeploymentProvenance` (the same builder integration/record-deployment.ts uses).
//   `--probe <url>` mode — a tiny in-VPC HTTP probe for the smoke's api `/healthz` leg (prints the
//   status + the provenance gitSha field only — no page text, per the smoke-log rule).
//   `--seed-invite <code>` mode — MAINT.6 (D-OPS.1-1): insert ONE code-bound invite row for the
//   preview's test-session minting (email NULL, max_uses 10000, deterministic code `prv-<n>-test`,
//   idempotent upsert). `preview-stack.mjs seed-invite` executes this Job with an `--args`
//   override — the row is written over the same `system-database-url` secretKeyRef the migrate leg
//   mounts, so no DSN ever leaves the VPC. Preview-kind stages only (fail-closed).
//
// Env: SYSTEM_DATABASE_URL (required), APP_DATABASE_URL + COLLAB_DATABASE_URL (required — the role
// passwords live inside them), RHEMA_STAGE (the stack name; preview detection goes through
// @rhema/infra's stageKindFor — `pr-*`/unknown → preview posture), RECORD_DEPLOYMENT/GIT_SHA/
// IMAGE_DIGESTS/PROTOCOLS_VERSION/RATE_TABLE_VERSION for the optional provenance leg.

import pg from "pg";
import {
  applyMigrations,
  agentTypesSeed,
  protocolsSeed,
  seedRealProjects,
  type MigrationDb,
} from "@rhema/db";
import { buildDeploymentProvenance, stageKindFor } from "@rhema/infra";

export interface RolePassword {
  readonly role: string;
  readonly password: string;
}

const ROLE_NAME_RE = /^[a-z_][a-z0-9_]*$/;

/** Extract {role,password} from a postgres DSN — validates the role name is identifier-safe. */
export function rolePasswordFromDsn(dsn: string, label: string): RolePassword {
  let u: URL;
  try {
    u = new URL(dsn);
  } catch {
    throw new Error(`migrate: ${label} is not a parseable postgres URL`);
  }
  const role = decodeURIComponent(u.username);
  const password = decodeURIComponent(u.password);
  if (!ROLE_NAME_RE.test(role)) {
    throw new Error(`migrate: ${label} DSN user '${role}' is not a safe role identifier`);
  }
  if (!password) throw new Error(`migrate: ${label} DSN carries no password`);
  return { role, password };
}

/** SQL literal-quote a password — doubles single quotes + backslash-escapes (E'' form). */
export function sqlQuotePassword(pw: string): string {
  return `E'${pw.replace(/\\/g, "\\\\").replace(/'/g, "\\'")}'`;
}

/**
 * The NOLOGIN→LOGIN statements for the generated role set. Roles not present (older shape) log a
 * warning rather than fail — the grant surface still lands via migrations.
 */
export function loginStatements(roles: RolePassword[]): string[] {
  return roles.map(
    ({ role, password }) => `alter role ${role} login password ${sqlQuotePassword(password)}`,
  );
}

export interface SeedPlan {
  readonly realProjects: boolean;
  readonly reason: string;
}

/**
 * REQ-ARCH-38 — `seedRealProjects` (real-project user text) is allowed ONLY on `dev`. Preview-kind
 * stages (pr-<n>, unknown names — stageKindFor's fail-closed mapping) and anything else refuse.
 * Prod never reaches this entry at all (its runner is unchanged and lives elsewhere).
 */
export function seedPlanFor(stage: string): SeedPlan {
  const kind = stageKindFor(stage);
  if (kind === "dev") {
    return { realProjects: true, reason: "dev stage — the three-real-project fixture is allowed" };
  }
  return {
    realProjects: false,
    reason: `stage '${stage}' resolves kind '${kind}' — seedRealProjects refused (REQ-ARCH-38: no user-text fixtures off dev)`,
  };
}

/** Rewrite a DSN to target the `postgres` maintenance db (for the bootstrap create-database). */
export function maintenanceDsn(dsn: string): string {
  const u = new URL(dsn);
  u.pathname = "/postgres";
  return u.toString();
}

const SEED_MARKERS = ["tr_pv1", "tr_sd1", "tr_cr1"]; // same idempotence markers as the dev runner

// --- MAINT.6 — the preview invite seed (`--seed-invite <code>`; D-OPS.1-1) -------------------
//
// One code-bound invite row lets the journey harness mint signed-in sessions on an invite-mode
// `pr-<n>` preview through the real magic-link path (REQ-BETA-19's invite posture is preserved —
// we seed AROUND the gate, never open it). The code is deterministic (`prv-<n>-test`) and
// non-secret: it admits only `test+*@rhema.tools` identities the mailbox pin already guards.

/** The seeded preview invite code shape — `prv-<n>-<suffix>` (the verb always uses `-test`). */
export const PREVIEW_INVITE_CODE_RE = /^prv-\d+-[a-z0-9][a-z0-9-]*$/;
/** Effectively unbounded for a disposable preview — the api's consume guard, not the count, gates. */
export const PREVIEW_INVITE_MAX_USES = 10_000;

/**
 * Fail-closed admission for `--seed-invite`: preview-kind stage names only (the same mapping
 * `seedPlanFor` uses — `pr-*`/unknown → `preview`, but the verb only ever names `pr-<n>`) and the
 * deterministic code shape. Returns a reason string instead of throwing so `main` can exit 2.
 */
export function seedInvitePlan(stage: string, code: string): { ok: true } | { ok: false; reason: string } {
  const kind = stageKindFor(stage);
  // `dev` is reachable in theory (stageKindFor maps it) but the verb's contract is pr-<n>-only —
  // refuse everything that isn't a preview name so a stray execute on dev/prod can't seed.
  if (!/^pr-\d+$/.test(stage) || kind !== "preview") {
    return {
      ok: false,
      reason: `seed-invite is pr-<n> preview stacks only — stage '${stage}' resolves kind '${kind}' (refused)`,
    };
  }
  if (!PREVIEW_INVITE_CODE_RE.test(code)) {
    return {
      ok: false,
      reason: `seed-invite code must match ${PREVIEW_INVITE_CODE_RE} (deterministic prv-<n>-test) — refused '${code}'`,
    };
  }
  return { ok: true };
}

export interface SeedInviteResult {
  readonly code: string;
  readonly usedCount: number;
  readonly maxUses: number;
}

/**
 * Upsert the ONE preview invite row: `email NULL` (any test identity may redeem it), the generous
 * `max_uses` (many per-step mints per run), un-revoked and un-expired — while preserving
 * `used_count` across re-seeds (idempotent; a live preview's redemptions stay counted).
 */
export async function seedPreviewInviteRow(
  db: { query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }> },
  code: string,
  maxUses: number = PREVIEW_INVITE_MAX_USES,
): Promise<SeedInviteResult> {
  await db.query(
    `insert into invites (code, email, max_uses, note, created_by)
       values ($1, null, $2, $3, 'maint6-seed-invite')
       on conflict (code) do update
         set email = null,
             max_uses = excluded.max_uses,
             expires_at = null,
             revoked_at = null`,
    [code, maxUses, "MAINT.6 preview session code (preview-stack.mjs seed-invite)"],
  );
  const row = (
    await db.query(`select used_count, max_uses from invites where code = $1`, [code])
  ).rows[0] as { used_count: number; max_uses: number } | undefined;
  if (!row) throw new Error(`seed-invite: '${code}' upserted but not readable`);
  return { code, usedCount: row.used_count, maxUses: row.max_uses };
}


/**
 * The idempotent `create database rhema` bootstrap shared by `runMigrate` and `--seed-invite` —
 * a fresh preview's `rhema` db may not exist yet when the seed leg runs first.
 */
export async function ensureRhemaDatabase(
  systemDatabaseUrl: string,
  log: (msg: string) => void = console.log,
): Promise<void> {
  const boot = new pg.Pool({ connectionString: maintenanceDsn(systemDatabaseUrl), max: 1 });
  try {
    const exists = (await boot.query(`select 1 from pg_database where datname = 'rhema'`)).rowCount;
    if (!exists) {
      await boot.query("create database rhema");
      log("[migrate] created database rhema");
    } else {
      log("[migrate] rhema database present");
    }
  } finally {
    await boot.end();
  }
}

export interface MigrateResult {
  readonly applied: string[];
  readonly rolesEnabled: string[];
  readonly realProjectsSeeded: boolean;
  readonly deploymentRecorded?: string;
}

export async function runMigrate(env: {
  stage: string;
  systemDatabaseUrl: string;
  appDatabaseUrl: string;
  collabDatabaseUrl: string;
  record?: { gitSha: string; imageDigestsJson: string; protocolsVersion: string; rateTableVersion: string };
  log?: (msg: string) => void;
}): Promise<MigrateResult> {
  const log = env.log ?? console.log;
  const seed = seedPlanFor(env.stage);
  log(`[migrate] stage=${env.stage} → ${seed.reason}`);

  // 1 — bootstrap the `rhema` database off the maintenance db (idempotent). CREATE DATABASE can't
  //     run inside a transaction/DO block, so check-then-create as two plain statements.
  await ensureRhemaDatabase(env.systemDatabaseUrl, log);

  const pool = new pg.Pool({ connectionString: env.systemDatabaseUrl });
  try {
    const db: MigrationDb = {
      exec: (sql) => pool.query(sql),
      query: (sql, params) => pool.query(sql, params as unknown[]),
    };

    // 2 — forward-only migrations.
    const applied = await applyMigrations(db, { onApplied: (n) => log(`[migrate] applied ${n}`) });
    if (applied.length === 0) log("[migrate] no new migrations — schema already up to date");

    // 3 — REQ-SPEC-30: turn the generated role secrets live. The roles exist post-migration
    //     (0001 + 0045) as NOLOGIN members; their passwords ride inside the mounted DSNs.
    const roles = [
      rolePasswordFromDsn(env.appDatabaseUrl, "APP_DATABASE_URL"),
      rolePasswordFromDsn(env.collabDatabaseUrl, "COLLAB_DATABASE_URL"),
    ];
    for (const stmt of loginStatements(roles)) {
      await pool.query(stmt);
      log(`[migrate] role enabled for LOGIN (password sourced from its mounted DSN)`);
    }
    const rolesEnabled = roles.map((r) => r.role);

    // 4 — seeds: code rows everywhere; the real-project fixture only where the stage permits.
    await agentTypesSeed(db);
    await protocolsSeed(db);
    log("[seed] agent_types + protocols seeded");
    let realProjectsSeeded = false;
    if (seed.realProjects) {
      const marker = (
        await pool.query(`select count(*)::int n from obligation_transitions where id = any($1)`, [
          SEED_MARKERS,
        ])
      ).rows[0] as { n: number };
      if (marker.n > 0) {
        log("[seed] real-project seed already present — skipping (idempotent re-run)");
      } else {
        await seedRealProjects(db);
        realProjectsSeeded = true;
        log("[seed] applied the three-real-project seed");
      }
    } else {
      log(`[seed] preview-safe path — seedRealProjects NOT run (${seed.reason})`);
    }

    // 5 — REQ-ARCH-39: the deployments provenance row (optional — skipped when unpinned).
    let deploymentRecorded: string | undefined;
    if (env.record) {
      if (env.record.protocolsVersion === "stub-0.0.0" || env.record.protocolsVersion.trim() === "") {
        throw new Error("migrate: refusing stub/empty protocols_version (D-P0.04-2)");
      }
      const rec = buildDeploymentProvenance({
        stage: env.stage,
        gitSha: env.record.gitSha,
        imageDigests: JSON.parse(env.record.imageDigestsJson),
        protocolsVersion: env.record.protocolsVersion,
        rateTableVersion: env.record.rateTableVersion,
      });
      const id = `${rec.stage}:${rec.git_sha}`;
      await pool.query(
        `insert into deployments (id, stage, git_sha, image_digests, protocols_version, rate_table_version)
         values ($1,$2,$3,$4,$5,$6)
         on conflict (id) do update
           set image_digests = excluded.image_digests,
               protocols_version = excluded.protocols_version,
               rate_table_version = excluded.rate_table_version,
               deployed_at = now()`,
        [id, rec.stage, rec.git_sha, JSON.stringify(rec.image_digests), rec.protocols_version, rec.rate_table_version],
      );
      deploymentRecorded = id;
      log(`[deployments] recorded ${id} protocols_version=${rec.protocols_version}`);
    }

    return { applied, rolesEnabled, realProjectsSeeded, ...(deploymentRecorded ? { deploymentRecorded } : {}) };
  } finally {
    await pool.end();
  }
}

/** `--probe <url>` — fetch a URL inside the VPC; print status + the healthz gitSha (no body text). */
async function probe(url: string, log: (msg: string) => void): Promise<number> {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  let gitSha: string | undefined;
  try {
    const j = (await res.json()) as { build?: { gitSha?: string } };
    gitSha = j?.build?.gitSha;
  } catch {
    /* non-JSON probe target — status is the assertion */
  }
  log(`[probe] ${url} → ${res.status}${gitSha ? ` gitSha=${gitSha}` : ""}`);
  return res.ok ? 0 : 1;
}

export async function main(): Promise<number> {
  const args = process.argv.slice(2);
  const probeIdx = args.indexOf("--probe");
  if (probeIdx >= 0) {
    const url = args[probeIdx + 1];
    if (!url) {
      console.error("[migrate] --probe requires a URL");
      return 2;
    }
    return probe(url, console.log);
  }
  const seedIdx = args.indexOf("--seed-invite");
  if (seedIdx >= 0) {
    // MAINT.6 — `preview-stack.mjs seed-invite pr-<n>` executes this Job with
    // `--args node,/app/dist/migrate.js,--seed-invite,prv-<n>-test`. Self-sufficient on a fresh
    // stack: bootstrap + applyMigrations run first (both idempotent) so `invites` always exists.
    const code = args[seedIdx + 1] ?? "";
    const stage = process.env.RHEMA_STAGE ?? "";
    const plan = seedInvitePlan(stage, code);
    if (!plan.ok) {
      console.error(`[seed-invite] ${plan.reason}`);
      return 2;
    }
    const systemDsn = process.env.SYSTEM_DATABASE_URL;
    if (!systemDsn) {
      console.error("[seed-invite] missing required env SYSTEM_DATABASE_URL");
      return 2;
    }
    try {
      await ensureRhemaDatabase(systemDsn, console.log);
      const pool = new pg.Pool({ connectionString: systemDsn, max: 1 });
      try {
        const db: MigrationDb = {
          exec: (sql) => pool.query(sql),
          query: (sql, params) => pool.query(sql, params as unknown[]),
        };
        await applyMigrations(db, { onApplied: (n) => console.log(`[seed-invite] migrated ${n}`) });
        const res = await seedPreviewInviteRow(db, code);
        console.log(
          `[seed-invite] ${res.code} live — email NULL, used ${res.usedCount}/${res.maxUses} (idempotent upsert)`,
        );
      } finally {
        await pool.end();
      }
      return 0;
    } catch (err) {
      console.error("[seed-invite] failed:", err instanceof Error ? err.message : err);
      return 1;
    }
  }
  const req = (name: string): string => {
    const v = process.env[name];
    if (!v) throw new Error(`migrate: missing required env ${name}`);
    return v;
  };
  const record =
    process.env.RECORD_DEPLOYMENT === "1"
      ? {
          gitSha: req("GIT_SHA"),
          imageDigestsJson: req("IMAGE_DIGESTS"),
          protocolsVersion: req("PROTOCOLS_VERSION"),
          rateTableVersion: process.env.RATE_TABLE_VERSION ?? new Date().toISOString().slice(0, 10),
        }
      : undefined;
  try {
    const result = await runMigrate({
      stage: req("RHEMA_STAGE"),
      systemDatabaseUrl: req("SYSTEM_DATABASE_URL"),
      appDatabaseUrl: req("APP_DATABASE_URL"),
      collabDatabaseUrl: req("COLLAB_DATABASE_URL"),
      ...(record ? { record } : {}),
    });
    console.log(`[migrate] done — ${result.applied.length} applied, roles ${result.rolesEnabled.join("/")} LOGIN`);
    return 0;
  } catch (err) {
    console.error("[migrate] failed:", err instanceof Error ? err.message : err);
    return 1;
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().then(
    (code) => (process.exitCode = code),
    (err) => {
      console.error("[migrate] failed:", err);
      process.exitCode = 1;
    },
  );
}
