// PGlite-backed test harness for the orchestrator (the chain's deterministic DB-test pattern). Spins up an
// in-process Postgres (WASM), applies the real @rhema/db migrations, and exposes a tenant-scoped TxRunner so
// the orchestrator's transactions run exactly as they would against AlloyDB (RLS included).

import { PGlite } from "@electric-sql/pglite";
import { applyMigrations, withTenant, USER_SERVING_ROLE } from "@rhema/db";
import type { SqlClient, TxRunner } from "../tx.js";

export interface OrchestratorTestDb {
  /** raw PGlite handle — the SEED/SYSTEM handle (PGlite's bootstrap superuser, like the bypass role the
   *  system pool holds). For seeding / reading non-RLS tables (proxy_*, run_idempotency, gates, steps)
   *  and for asserting what a tenant transaction must NOT see. */
  readonly pg: PGlite;
  /** a bare SqlClient over the raw handle (superuser, no tenant set) — the system/seeding seam. */
  readonly client: SqlClient;
  /**
   * tenant-scoped transaction runner — SEC.1 (REQ-SPEC-30): every transaction runs
   * `set_config('role','rhema_app_login',true)` + `app.tenant_id` via `withTenant`, so the suite
   * exercises EXACTLY the role prod's user-serving pool authenticates as (grants + RLS bind; a query
   * that silently relied on the bootstrap superuser / a BYPASSRLS role turns red here). The seeding
   * and system seams stay on `pg`/`client`.
   */
  readonly txRunner: TxRunner;
  /**
   * SEC.1 — the SYSTEM-pool twin of `txRunner`: identical tenant-scoped transaction semantics but NO
   * `rhema_app_login` role pin (PGlite's bootstrap superuser ≈ prod's `SYSTEM_DATABASE_URL` role —
   * BYPASSRLS, full grants). Bind it as `deps.systemTxRunner` for the paths prod wires to the system
   * pool (proxy-credential mint, sweeps); a path that needs a grant the user role lacks turns red
   * under `txRunner` and is the audit's signal to reach for this.
   */
  readonly systemTxRunner: TxRunner;
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
      // PGlite is single-connection: `pg` and `client` are the same session, so `withTenant(pg, …)`
      // brackets `fn(client)` on the one wire — the transaction-local ROLE + tenant apply to it.
      return withTenant(pg, tenantId, () => fn(client), { role: USER_SERVING_ROLE });
    },
  };

  // The system-pool runner: same single wire, no role pin — the transaction runs as the bootstrap
  // superuser exactly like prod's elevated pool, so grants + RLS stay inert for system paths.
  const systemTxRunner: TxRunner = {
    async run<T>(tenantId: string, fn: (tx: SqlClient) => Promise<T>): Promise<T> {
      return withTenant(pg, tenantId, () => fn(client));
    },
  };

  return { pg, client, txRunner, systemTxRunner, close: () => pg.close() };
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
  /**
   * P1.16 — the account's plan tier (§14.2): the run-creation gate reads the live subscription row.
   * Defaults `studio_max` — the fixture stands in for a paid account (every model tier, 8 concurrent,
   * no daily ceiling) so seeded runs create cleanly. Pass `"free"` (or `null` — no subscription row)
   * to exercise the free/trial gates.
   */
  readonly plan?: string | null;
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
  // P1.16 — the §14.2 plan gate reads the live subscription. The default is a paid account; "free"
  // needs no row (the effective tier is 'free' when no non-ended subscription exists).
  const plan = args.plan === undefined ? "studio_max" : args.plan;
  if (plan != null && plan !== "free") {
    await db.pg.query(
      `insert into subscriptions(id, billing_account_id, tier, period_start, period_end, status)
         values ($1,$2,$3, now() - interval '1 day', now() + interval '1 month', 'active')
         on conflict (id) do nothing`,
      [`sub_${billingAccountId}`, billingAccountId, plan],
    );
  }
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
  /** pin `state_since` (sweep-threshold tests); defaults to now(). */
  readonly stateSince?: Date;
  /** the frozen input snapshot ({wordCount, claimCount, …}) — PRB.22 research-bound tests. */
  readonly inputSnapshot?: Record<string, unknown>;
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
         current_attempt, inputs, input_snapshot, model_profile, model_tier, rigor, estimate_credits, cap_credits,
         spent_credits, rate_table_version, hold_ledger_id, lock_set, created_at)
       values ($1,$2,$3,$4,$5,$6,$7, $13, $8, '{}'::jsonb, $14::jsonb, 'balanced', 'balanced', 'standard',
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
        args.stateSince ?? new Date(),
        args.inputSnapshot ? JSON.stringify(args.inputSnapshot) : null,
      ],
    ),
  );
  return args.runId;
}
