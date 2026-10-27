import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createOrchestratorTestDb, seedProject, seedRun, type OrchestratorTestDb } from "@rhema/orchestrator/testing";
import { testEntryDeps } from "@rhema/ledger/testing";
import { STRIPE_EVENT_JOB } from "@rhema/ledger";
import { runAdminCli, type AdminCliDeps } from "./admin-cli.js";
import { InMemoryEventWriter, InMemoryQueue } from "@rhema/orchestrator";

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

describe("stripe-redrive (R6FIX.5 — the F-R6H11B-1 compensation path)", () => {
  it("re-enqueues stripe.event for a parked row + audits; processed rows no-op; unknown exits 1", async () => {
    const queue = new InMemoryQueue();
    // a parked row — the H11B failure's exact shape (verified, inserted, never processed).
    await db.client.query(
      "insert into stripe_events(id, type, payload, received_at) values ('evt_parked','checkout.session.completed','{}',now())",
    );
    const code = await runAdminCli(["stripe-redrive", "--event", "evt_parked"], { ...cliDeps(), queue });
    expect(code).toBe(0);
    expect(lines.at(-1)).toContain("re-drove evt_parked");
    const jobs = queue.ofName(STRIPE_EVENT_JOB);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]!.payload).toEqual({ eventId: "evt_parked" });
    const audit = (await db.client.query("select actor, action, note from admin_actions")).rows[0] as {
      actor: string; action: string; note: string;
    };
    expect(audit).toMatchObject({ actor: "op_steve", action: "stripe_event_redrive" });
    expect(audit.note).toContain("evt_parked");

    // an already-processed row is a no-op (idempotent — no second job, no second audit)
    await db.client.query(
      "insert into stripe_events(id, type, payload, received_at, processed_at) values ('evt_done','invoice.paid','{}',now(),now())",
    );
    expect(await runAdminCli(["stripe-redrive", "--event", "evt_done"], { ...cliDeps(), queue })).toBe(0);
    expect(lines.at(-1)).toContain("already processed");
    expect(queue.ofName(STRIPE_EVENT_JOB)).toHaveLength(1);
    expect(
      (await db.client.query("select count(*)::int n from admin_actions where action = 'stripe_event_redrive'"))
        .rows[0],
    ).toEqual({ n: 1 });

    // unknown event / unbound queue / missing flag
    expect(await runAdminCli(["stripe-redrive", "--event", "evt_ghost"], { ...cliDeps(), queue })).toBe(1);
    expect(lines.at(-1)).toContain("not found");
    expect(await runAdminCli(["stripe-redrive", "--event", "evt_parked"], cliDeps())).toBe(1);
    expect(await runAdminCli(["stripe-redrive"], cliDeps())).toBe(2);
  });
});

describe("refund-review (DEF.4 — the §14.4 operator verb; REQ-SPEC-30)", () => {
  // The live CLI's txRunner IS the system pool (PgPoolTxRunner on SYSTEM_DATABASE_URL) — the
  // user-serving role holds no UPDATE on user_refund_requests, by design.
  const sysRun = (argv: string[], eventWriter?: InstanceType<typeof InMemoryEventWriter>) =>
    runAdminCli(argv, {
      ...testEntryDeps(),
      txRunner: db.systemTxRunner,
      systemExec: db.client,
      operatorId: "op_steve",
      ...(eventWriter ? { eventWriter } : {}),
      out: (s) => lines.push(s),
    });

  async function seedPendingRequest(requestId: string, runId: string): Promise<void> {
    await db.client.query(
      "insert into credit_balances(billing_account_id, bucket, available, held) values ($1,'included',5000,0)",
      [BA],
    );
    await seedRun(db, { runId, workspaceId: WS, state: "completed" });
    await db.client.query(
      "insert into steps(id, run_id, phase, ordinal, state) values ($1,$2,'craft',1,'done')",
      [`st_${runId}`, runId],
    );
    await db.client.query(
      `insert into credit_ledger(id, workspace_id, billing_account_id, kind, credits, bucket, run_id, phase_id, source, idempotency_key)
       values ($1,$2,$3,'debit',160,'included',$4,$5,'phase',$6)`,
      [`led_${runId}`, WS, BA, runId, `st_${runId}`, `debit:${runId}`],
    );
    await db.client.query(
      `insert into user_refund_requests
         (id, workspace_id, billing_account_id, run_id, user_id, state, credits, quarter, requested_at)
       values ($1,$2,$3,$4,$5,'pending_review',160,'2026Q3',now())`,
      [requestId, WS, BA, runId, USER],
    );
  }

  it("--approve runs the same refund episode: user_window rows, decided request row, cost.refunded", async () => {
    await seedPendingRequest("urr_a", "run_ra");
    const eventWriter = new InMemoryEventWriter();
    const code = await sysRun(
      ["refund-review", "--request", "urr_a", "--workspace", WS, "--approve", "--note", "goodwill"],
      eventWriter,
    );
    expect(code).toBe(0);
    expect(lines.at(-1)).toContain("approved urr_a — refunded 160 credits");
    const req = (
      await db.client.query(
        "select state, decision, decided_by, note from user_refund_requests where id = 'urr_a'",
      )
    ).rows[0] as { state: string; decision: string; decided_by: string; note: string };
    expect(req).toEqual({ state: "refunded", decision: "admin_approve", decided_by: "op_steve", note: "goodwill" });
    const refund = (
      await db.client.query("select kind, reason, credits from credit_ledger where run_id = 'run_ra' and kind = 'refund'")
    ).rows[0] as { kind: string; reason: string; credits: number };
    expect(refund).toEqual({ kind: "refund", reason: "user_window", credits: 160 });
    expect(eventWriter.forRun("run_ra").map((e) => e.type)).toContain("cost.refunded");
  });

  it("--deny closes the request without moving money; a re-decision exits 1 already-decided", async () => {
    await seedPendingRequest("urr_d", "run_rd");
    const code = await sysRun(["refund-review", "--request", "urr_d", "--workspace", WS, "--deny"], new InMemoryEventWriter());
    expect(code).toBe(0);
    expect(lines.at(-1)).toContain("denied urr_d");
    const req = (
      await db.client.query("select state, decision from user_refund_requests where id = 'urr_d'")
    ).rows[0] as { state: string; decision: string };
    expect(req).toEqual({ state: "denied", decision: "admin_deny" });
    expect((await db.client.query("select count(*)::int n from credit_ledger where run_id = 'run_rd' and kind = 'refund'")).rows[0]).toEqual({ n: 0 });
    expect(await sysRun(["refund-review", "--request", "urr_d", "--workspace", WS, "--approve"], new InMemoryEventWriter())).toBe(1);
    expect(lines.at(-1)).toContain("already decided");
  });

  it("usage errors exit 2; a missing request exits 1", async () => {
    expect(await sysRun(["refund-review", "--request", "urr_x", "--workspace", WS])).toBe(2); // no verdict flag
    expect(await sysRun(["refund-review", "--request", "urr_x", "--approve"], new InMemoryEventWriter())).toBe(2); // no --workspace
    expect(await sysRun(["refund-review", "--request", "urr_ghost", "--workspace", WS, "--deny"], new InMemoryEventWriter())).toBe(1);
    expect(lines.at(-1)).toContain("not found");
  });
});
