// PGlite-backed test harness for the orchestrator (the chain's deterministic DB-test pattern). Spins up an
// in-process Postgres (WASM), applies the real @rhema/db migrations, and exposes a tenant-scoped TxRunner so
// the orchestrator's transactions run exactly as they would against AlloyDB (RLS included).

import { PGlite } from "@electric-sql/pglite";
import { applyMigrations } from "@rhema/db";
import type { SqlClient, TxRunner } from "../tx.js";

export interface OrchestratorTestDb {
  /** raw PGlite handle — for seeding / reading non-RLS tables (proxy_*, run_idempotency, gates, steps). */
  readonly pg: PGlite;
  /** a bare SqlClient over the raw handle (no tenant set) — non-RLS reads only. */
  readonly client: SqlClient;
  /** tenant-scoped transaction runner (sets app.tenant_id for RLS). */
  readonly txRunner: TxRunner;
  close(): Promise<void>;
}

export async function createOrchestratorTestDb(): Promise<OrchestratorTestDb> {
  const pg = new PGlite();
  await applyMigrations({
    exec: (sql: string) => pg.exec(sql),
    query: (sql: string, params?: unknown[]) => pg.query(sql, params),
  });

  const client: SqlClient = { query: (sql, params) => pg.query(sql, params as unknown[]) };

  const txRunner: TxRunner = {
    async run<T>(tenantId: string, fn: (tx: SqlClient) => Promise<T>): Promise<T> {
      await pg.query("begin");
      try {
        // transaction-local RLS tenant (is_local = true), reset automatically at commit/rollback.
        await pg.query("select set_config('app.tenant_id', $1, true)", [tenantId]);
        const out = await fn(client);
        await pg.query("commit");
        return out;
      } catch (e) {
        await pg.query("rollback");
        throw e;
      }
    },
  };

  return { pg, client, txRunner, close: () => pg.close() };
}

export interface SeedProjectArgs {
  readonly userId?: string;
  readonly billingAccountId?: string;
  readonly workspaceId?: string;
  readonly projectId?: string;
  /** create a working draft with this version number (omit for no draft). */
  readonly draftN?: number;
  readonly draftId?: string;
  /**
   * PRB.13 — the seeded user's `email_verified` (the run-creation gate, REQ-BETA-19 amended). Defaults
   * `true`: the fixture stands in for a signed-in account, and every signed-in beta account verified its
   * mailbox via its sign-in link. Pass `false` to seed an unverified self-serve account.
   */
  readonly emailVerified?: boolean;
}

export interface SeededProject {
  readonly userId: string;
  readonly billingAccountId: string;
  readonly workspaceId: string;
  readonly projectId: string;
  readonly draftId?: string;
}

/** Seed a billing account + workspace + owner user + project (+ optional working draft) for run tests. */
export async function seedProject(db: OrchestratorTestDb, args: SeedProjectArgs = {}): Promise<SeededProject> {
  const userId = args.userId ?? "usr_seed";
  const billingAccountId = args.billingAccountId ?? "ba_seed";
  const workspaceId = args.workspaceId ?? "ws_seed";
  const projectId = args.projectId ?? "prj_seed";
  const draftId = args.draftId ?? (args.draftN != null ? `dft_${projectId}_${args.draftN}` : undefined);

  await db.pg.query(
    `insert into "user"(id, email, email_verified) values ($1,$2,$3) on conflict (id) do nothing`,
    [userId, `${userId}@example.test`, args.emailVerified ?? true],
  );
  await db.pg.query(`insert into billing_accounts(id) values ($1) on conflict (id) do nothing`, [
    billingAccountId,
  ]);
  await db.pg.query(
    `insert into workspaces(id, kind, name, billing_account_id) values ($1,'personal','Seed',$2)
       on conflict (id) do nothing`,
    [workspaceId, billingAccountId],
  );
  await db.pg.query(
    `insert into projects(id, workspace_id, owner_id, title, slug)
       values ($1,$2,$3,'Seed project',$4) on conflict (id) do nothing`,
    [projectId, workspaceId, userId, `slug-${projectId}`],
  );
  if (draftId != null && args.draftN != null) {
    await db.pg.query(
      `insert into drafts(id, project_id, n, origin, state) values ($1,$2,$3,'agent','working')
         on conflict (id) do nothing`,
      [draftId, projectId, args.draftN],
    );
  }
  return { userId, billingAccountId, workspaceId, projectId, draftId };
}

export interface SeedRunArgs {
  readonly runId: string;
  readonly workspaceId: string;
  readonly projectId?: string;
  readonly personaId?: string;
  readonly workflow?: string;
  readonly state?: string;
  readonly currentAttempt?: number;
  readonly capCredits?: number;
  readonly spentCredits?: number;
  readonly holdLedgerId?: string;
  readonly lockSet?: readonly string[];
  readonly agentInstanceId?: string;
}

export interface SeedGateArgs {
  readonly gateId: string;
  readonly runId: string;
  readonly kind: string;
  readonly onExpiry: string;
  readonly blocking?: boolean;
  readonly openedAt?: Date;
  readonly deadlineAt?: Date | null;
  readonly presenceDeadlineAt?: Date | null;
  readonly held?: boolean;
  readonly artifactVersionId?: string | null;
  readonly stepId?: string | null;
}

/** Insert an open (unresolved) `gates` row directly — gates is not RLS, so a bare client insert is fine. */
export async function seedGate(db: OrchestratorTestDb, args: SeedGateArgs): Promise<string> {
  await db.client.query(
    `insert into gates(id, run_id, step_id, kind, artifact_version_id, opened_at, deadline_at, blocking,
       on_expiry, held, paused_while_reading, presence_deadline_at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,false,$11)`,
    [
      args.gateId,
      args.runId,
      args.stepId ?? null,
      args.kind,
      args.artifactVersionId ?? null,
      args.openedAt ?? new Date("2026-09-02T12:00:00Z"),
      args.deadlineAt ?? null,
      args.blocking ?? true,
      args.onExpiry,
      args.held ?? false,
      args.presenceDeadlineAt ?? null,
    ],
  );
  return args.gateId;
}

/** Read the decision row for a gate (or null), for resolution/expiry assertions. */
export async function readDecision(
  db: OrchestratorTestDb,
  gateId: string,
): Promise<{ by_actor: string; action: string; presence: boolean | null; overlay_version_ids: string[] | null } | null> {
  const res = await db.client.query(
    "select by_actor, action, presence, overlay_version_ids from decisions where gate_id = $1",
    [gateId],
  );
  return (res.rows[0] as { by_actor: string; action: string; presence: boolean | null; overlay_version_ids: string[] | null } | undefined) ?? null;
}

/** Count decision rows for a gate (race tests: exactly one resolution wins). */
export async function countDecisions(db: OrchestratorTestDb, gateId: string): Promise<number> {
  const res = await db.client.query("select count(*)::int n from decisions where gate_id = $1", [gateId]);
  return (res.rows[0] as { n: number }).n;
}

/** Insert a `runs` row directly in a chosen state/attempt for internal-API / reaper / provision tests. */
export async function seedRun(db: OrchestratorTestDb, args: SeedRunArgs): Promise<string> {
  await db.txRunner.run(args.workspaceId, (tx) =>
    tx.query(
      `insert into runs(
         id, workspace_id, project_id, persona_id, workflow, agent_instance_id, state, state_since,
         current_attempt, inputs, model_profile, model_tier, rigor, estimate_credits, cap_credits,
         spent_credits, rate_table_version, hold_ledger_id, lock_set, created_at)
       values ($1,$2,$3,$4,$5,$6,$7, now(), $8, '{}'::jsonb, 'balanced', 'balanced', 'standard',
               100, $9, $10, 1, $11, $12, now())`,
      [
        args.runId,
        args.workspaceId,
        args.projectId ?? null,
        args.personaId ?? null,
        args.workflow ?? "review",
        args.agentInstanceId ?? null,
        args.state ?? "running",
        args.currentAttempt ?? 1,
        args.capCredits ?? 840,
        args.spentCredits ?? 0,
        args.holdLedgerId ?? null,
        (args.lockSet ?? []) as string[],
      ],
    ),
  );
  return args.runId;
}
