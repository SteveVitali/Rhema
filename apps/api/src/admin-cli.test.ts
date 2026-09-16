import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, type OrchestratorTestDb } from "@rhema/orchestrator/testing";
import { testEntryDeps } from "@rhema/ledger/testing";
import { runAdminCli, type AdminCliDeps } from "./admin-cli.js";

// PRB.08 — the operator billing CLI (REQ-BETA-14). Driven in-process over PGlite (the live `main()` just
// binds DATABASE_URL + RHEMA_OPERATOR_ID): every verb is an ordinary ledger row + an audit row, idempotent
// on `--idem`, and refuses on bad usage.

let db: OrchestratorTestDb;
const WS = "01JQ0000000000000000000WS1"; // ULID — the wtp analytics envelope validates workspace_id
const BA = "ba_seed";
const USER = "01JQ0000000000000000000MB1";
let lines: string[];

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  await seedProject(db, { userId: USER, workspaceId: WS, billingAccountId: BA });
  await db.pg.query("insert into workspace_members(workspace_id, user_id, role) values ($1,$2,'admin')", [WS, USER]);
  lines = [];
});
afterEach(() => db.close());

function cliDeps(): AdminCliDeps {
  return {
    ...testEntryDeps(),
    txRunner: db.txRunner,
    systemExec: db.client,
    operatorId: "op_steve",
    out: (s) => lines.push(s),
  };
}

const run = (argv: string[]) => runAdminCli(argv, cliDeps());

async function promoAvailable(): Promise<number> {
  const r = (
    await db.client.query("select available::int as a from credit_balances where billing_account_id = $1 and bucket = 'promo'", [BA])
  ).rows[0] as { a: number } | undefined;
  return r?.a ?? 0;
}

describe("rhema admin (operator CLI)", () => {
  it("house-grant lands an audited promo grant the account can spend (AC1)", async () => {
    const code = await run(["house-grant", "--billing-account", BA, "--credits", "200000", "--expires", "2026-12-31", "--note", "beta"]);
    expect(code).toBe(0);
    expect(lines[0]).toContain("granted 200000 house credits");
    expect(await promoAvailable()).toBe(200_000);
    const audit = (await db.client.query("select actor, action, credits from admin_actions")).rows[0] as { actor: string; action: string };
    expect(audit).toMatchObject({ actor: "op_steve", action: "house_credit_grant", credits: 200_000 });
    const row = (await db.client.query("select kind, bucket, source, reason from credit_ledger")).rows[0] as {
      kind: string; bucket: string; source: string; reason: string;
    };
    expect(row).toEqual({ kind: "grant", bucket: "promo", source: "admin", reason: "house_credit" });
  });

  it("a replayed --idem key no-ops (no double grant, no second audit)", async () => {
    const argv = ["house-grant", "--billing-account", BA, "--credits", "500", "--expires", "2026-12-31", "--idem", "k1"];
    await run(argv);
    await run(argv);
    expect(lines[1]).toContain("no-op");
    expect(await promoAvailable()).toBe(500);
    expect((await db.client.query("select count(*)::int n from admin_actions")).rows[0]).toEqual({ n: 1 });
  });

  it("house-void removes promo balance (clamped), audited", async () => {
    await run(["house-grant", "--billing-account", BA, "--credits", "500", "--expires", "2026-12-31"]);
    const code = await run(["house-void", "--billing-account", BA, "--credits", "700"]); // clamps to 500
    expect(code).toBe(0);
    expect(lines.at(-1)).toContain("voided 500");
    expect(await promoAvailable()).toBe(0);
  });

  it("suspend then reinstate (a debt-free account)", async () => {
    await run(["suspend", "--billing-account", BA, "--note", "review"]);
    const acct = (await db.client.query("select suspended_at from billing_accounts where id = $1", [BA])).rows[0] as { suspended_at: string | null };
    expect(acct.suspended_at).not.toBeNull();
    await run(["reinstate", "--billing-account", BA]);
    const after = (await db.client.query("select suspended_at from billing_accounts where id = $1", [BA])).rows[0] as { suspended_at: string | null };
    expect(after.suspended_at).toBeNull();
    const actions = ((await db.client.query("select action from admin_actions order by at, id")).rows as { action: string }[]).map((r) => r.action);
    expect(actions).toEqual(["account_suspend", "account_reinstate"]);
  });

  it("wtp records the interview signal (REQ-BETA-12: wtp.recorded{source, amount})", async () => {
    const code = await run(["wtp", "--workspace", WS, "--amount", "49", "--source", "interview"]);
    expect(code).toBe(0);
    const row = (await db.client.query("select event, props from analytics_events")).rows[0] as { event: string; props: Record<string, unknown> };
    expect(row.event).toBe("wtp.recorded");
    expect(row.props).toEqual({ source: "interview", amount: 49 });
    expect((await db.client.query("select action from admin_actions where action = 'wtp_record'")).rows).toHaveLength(1);
  });

  it("usage errors exit 2; a failed action exits 1", async () => {
    expect(await run(["house-grant", "--billing-account", BA])).toBe(2); // missing credits/expires
    expect(await run(["frobnicate"])).toBe(2);
    expect(await run(["house-void", "--billing-account", "ba_nonexistent"])).toBe(1); // no workspace
  });
});
