// The operator billing CLI (PRB.08; REQ-BETA-14). OPERATOR-ONLY: it runs outside the request path against
// DATABASE_URL directly, and refuses to do anything without `RHEMA_OPERATOR_ID` — the actor stamped on every
// `admin_actions` audit row (there is no finer auth model for an ops shell; the grant is the env + the audit
// trail). Usage:
//
//   node dist/admin-cli.js house-grant  --billing-account acct_… --credits 200000 --expires 2026-12-31 [--note …]
//   node dist/admin-cli.js house-void   --billing-account acct_… [--credits N] [--note …]
//   node dist/admin-cli.js suspend      --billing-account acct_… [--note …]
//   node dist/admin-cli.js reinstate    --billing-account acct_… [--note …]
//   node dist/admin-cli.js wtp          --workspace ws_… --amount 49 [--source interview]
//
// Every mutation is an ORDINARY ledger row (`promo` bucket for house credits, `expire` for a void — never a
// direct balance UPDATE) plus its audit row in the same transaction (admin.ts). The workspace the ledger row
// is keyed to resolves from the billing account's first workspace (a beta account is one personal workspace)
// unless `--workspace` is given.

import pg from "pg";
import { PgBoss } from "pg-boss";
import { PgPoolTxRunner, PgBossQueue } from "@rhema/live-clients";
import {
  grantHouseCredits,
  voidHouseCredits,
  suspendAccount,
  reinstateAccount,
  recordAnalyticsEvent,
  type EntryDeps,
} from "@rhema/ledger";
import { systemClock, randomUlids, RUN_JOBS, type SqlClient, type Queue } from "@rhema/orchestrator";

export interface AdminCliDeps extends EntryDeps {
  /** tenant-scoped transactions (ledger + audit rows are tenant-keyed writes). */
  readonly txRunner: { run<T>(workspaceId: string, fn: (tx: SqlClient) => Promise<T>): Promise<T> };
  /** a system read for workspace/account resolution (the operator connection). */
  readonly systemExec: SqlClient;
  /** the operator identity stamped on `admin_actions.actor` — REQUIRED (operator-only gate). */
  readonly operatorId: string;
  /**
   * the pg-boss queue a `reinstate` uses to re-drive the account's withheld deliveries (`run.deliver` per
   * stashed run — the pod's original POST was refused). Unset ⇒ the reinstated runs stay stashed and the
   * CLI prints their ids so the operator can re-drive them by hand.
   */
  readonly queue?: Queue;
  readonly out?: (line: string) => void;
}

/** Resolve the billing account's home workspace (first-created) unless one is given. */
async function resolveWorkspace(deps: AdminCliDeps, billingAccountId: string, explicit?: string): Promise<string> {
  if (explicit) return explicit;
  const row = (
    await deps.systemExec.query(
      "select id from workspaces where billing_account_id = $1 order by created_at, id limit 1",
      [billingAccountId],
    )
  ).rows[0] as { id: string } | undefined;
  if (!row) throw new Error(`no workspace for billing account ${billingAccountId}`);
  return row.id;
}

function flag(argv: string[], name: string): string | undefined {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : undefined;
}

const USAGE = `rhema admin — operator billing actions (every action is audited; actor = RHEMA_OPERATOR_ID)

  house-grant  --billing-account <id> --credits <n> --expires <YYYY-MM-DD> [--workspace <id>] [--note <s>]
  house-void   --billing-account <id> [--credits <n>] [--workspace <id>] [--note <s>]
  suspend      --billing-account <id> [--workspace <id>] [--note <s>]
  reinstate    --billing-account <id> [--workspace <id>] [--note <s>]
  wtp          --workspace <id> --amount <usd> [--source interview]
`;

/**
 * Run one CLI invocation; returns the process exit code (0 ok, 2 usage/config error, 1 a failed action).
 * Idempotent by construction: each invocation mints a fresh idempotency key (`--idem` overrides for a
 * deliberate replay test).
 */
export async function runAdminCli(argv: string[], deps: AdminCliDeps): Promise<number> {
  const out = deps.out ?? ((s: string) => console.log(s));
  const [command, ...rest] = argv;
  const billingAccountId = flag(rest, "billing-account");
  const workspaceArg = flag(rest, "workspace");
  const note = flag(rest, "note");
  const idem = flag(rest, "idem") ?? `admin:${command}:${deps.ids("key")}`;

  const acctArgs = (workspaceId: string) => ({
    actor: deps.operatorId,
    workspaceId,
    billingAccountId: billingAccountId ?? "",
    ...(note !== undefined ? { note } : {}),
  });

  try {
    switch (command) {
      case "house-grant": {
        const credits = Number(flag(rest, "credits"));
        const expiresRaw = flag(rest, "expires");
        if (!billingAccountId || !Number.isFinite(credits) || credits <= 0 || !expiresRaw) {
          out(USAGE);
          return 2;
        }
        const expiresAt = new Date(expiresRaw);
        if (Number.isNaN(expiresAt.getTime())) return (out("--expires must be a date (YYYY-MM-DD)"), 2);
        const workspaceId = await resolveWorkspace(deps, billingAccountId, workspaceArg);
        const res = await deps.txRunner.run(workspaceId, (tx) =>
          grantHouseCredits(tx, deps, {
            ...acctArgs(workspaceId),
            credits: Math.trunc(credits),
            expiresAt,
            idempotencyKey: idem,
          }),
        );
        out(
          res.applied
            ? `granted ${Math.trunc(credits)} house credits → ${billingAccountId} (ledger ${res.ledgerId}, audit ${res.auditId})`
            : `no-op: idempotency key already consumed (ledger ${res.ledgerId})`,
        );
        return 0;
      }
      case "house-void": {
        if (!billingAccountId) return (out(USAGE), 2);
        const credits = flag(rest, "credits");
        const workspaceId = await resolveWorkspace(deps, billingAccountId, workspaceArg);
        const res = await deps.txRunner.run(workspaceId, (tx) =>
          voidHouseCredits(tx, deps, {
            ...acctArgs(workspaceId),
            ...(credits != null ? { credits: Math.trunc(Number(credits)) } : {}),
            idempotencyKey: idem,
          }),
        );
        out(`voided ${res.voided} promo credits on ${billingAccountId} (audit ${res.auditId ?? "—"})`);
        return 0;
      }
      case "suspend": {
        if (!billingAccountId) return (out(USAGE), 2);
        const workspaceId = await resolveWorkspace(deps, billingAccountId, workspaceArg);
        const res = await deps.txRunner.run(workspaceId, (tx) =>
          suspendAccount(tx, deps, { ...acctArgs(workspaceId) }),
        );
        out(res.suspended ? `suspended ${billingAccountId}` : `already suspended: ${billingAccountId}`);
        return 0;
      }
      case "reinstate": {
        if (!billingAccountId) return (out(USAGE), 2);
        const workspaceId = await resolveWorkspace(deps, billingAccountId, workspaceArg);
        const res = await deps.txRunner.run(workspaceId, (tx) =>
          reinstateAccount(tx, deps, { ...acctArgs(workspaceId) }),
        );
        out(res.reinstated ? `reinstated ${billingAccountId}` : `not suspended: ${billingAccountId}`);
        // REQ-SPEC-24.7: a clean reinstate un-withholds the account's stashed deliveries — enqueue the
        // `run.deliver` re-drive for each (idempotent: the worker re-checks the account and re-stashes if
        // it suspended again in the gap).
        for (const r of res.withheldRuns) {
          if (deps.queue) {
            await deps.queue.send(RUN_JOBS.deliver, { runId: r.runId, workspaceId: r.workspaceId }, {
              singletonKey: `deliver:${r.runId}`,
            });
            out(`  re-drove withheld delivery → run.deliver ${r.runId}`);
          } else {
            out(`  withheld delivery pending: ${r.runId} (no queue bound — enqueue run.deliver manually)`);
          }
        }
        return 0;
      }
      case "wtp": {
        // REQ-BETA-12 — the interview/manual WTP signal: `wtp.recorded{source, amount}` on the workspace's
        // member (beta = personal workspace → its first member), as an audited admin action.
        const workspaceId = workspaceArg;
        const amount = Number(flag(rest, "amount"));
        const source = flag(rest, "source") ?? "interview";
        if (!workspaceId || !Number.isFinite(amount) || amount <= 0) return (out(USAGE), 2);
        const eventId = await deps.txRunner.run(workspaceId, async (tx) => {
          const member = (
            await tx.query(
              "select user_id from workspace_members where workspace_id = $1 order by case role when 'owner' then 0 else 1 end, user_id limit 1",
              [workspaceId],
            )
          ).rows[0] as { user_id: string } | undefined;
          if (!member) throw new Error(`no workspace member for ${workspaceId}`);
          const id = await recordAnalyticsEvent(tx, deps, {
            userId: member.user_id,
            workspaceId,
            event: "wtp.recorded",
            props: { source, amount },
          });
          await tx.query(
            `insert into admin_actions (id, actor, action, workspace_id, credits, note, at)
             values ($1,$2,'wtp_record',$3,$4,$5,$6)`,
            [deps.ids("adm"), deps.operatorId, workspaceId, null, `wtp ${source} $${amount}`, deps.clock.now()],
          );
          return id;
        });
        out(eventId ? `wtp.recorded {source:${source}, amount:$${amount}} → ${eventId}` : `wtp skipped — user opted out of analytics`);
        return 0;
      }
      default:
        out(USAGE);
        return 2;
    }
  } catch (e) {
    out(`error: ${e instanceof Error ? e.message : String(e)}`);
    return 1;
  }
}

/** The live entrypoint: `node dist/admin-cli.js <verb> …` with DATABASE_URL + RHEMA_OPERATOR_ID. */
export async function main(): Promise<void> {
  const operatorId = process.env.RHEMA_OPERATOR_ID;
  const databaseUrl = process.env.DATABASE_URL;
  if (!operatorId || !databaseUrl) {
    console.error("rhema admin requires RHEMA_OPERATOR_ID (the audited actor) and DATABASE_URL");
    process.exit(2);
  }
  const pool = new pg.Pool({ connectionString: databaseUrl });
  const systemExec: SqlClient = {
    query: (sql, params) => pool.query(sql, params ? [...params] : undefined).then((r) => ({ rows: r.rows as unknown[] })),
  };
  // pg-boss over the same DATABASE_URL — only `reinstate` sends (the withheld-delivery re-drive).
  const boss = new PgBoss(databaseUrl);
  boss.on("error", (err: unknown) => console.error("[admin] pg-boss error:", err instanceof Error ? err.message : err));
  await boss.start();
  await boss.createQueue(RUN_JOBS.deliver);
  try {
    const code = await runAdminCli(process.argv.slice(2), {
      txRunner: new PgPoolTxRunner(pool),
      systemExec,
      operatorId,
      queue: new PgBossQueue(boss),
      ids: randomUlids(),
      clock: systemClock,
    });
    process.exit(code);
  } finally {
    await boss.stop();
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
