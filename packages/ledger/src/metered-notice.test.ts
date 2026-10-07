import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deliverMeteredNotice,
  meteredNoticeRecipients,
  meteredNoticeTemplate,
  planMeteredNotice,
  METERED_NOTICE_COLLAPSE_KEY,
  METERED_NOTICE_DEDUP_KEY,
} from "./metered-notice.js";
import {
  createLedgerTestDb,
  seedProject,
  testEntryDeps,
  type LedgerTestDb,
} from "./testing/index.js";

// ECON.1 — the paid-account notice for the metered flip: recipients = active paid subs + top-up
// holders (never test tenants / free plans), the template honors D.2 vocabulary, and --dry-run
// (send=false) writes nothing.

let db: LedgerTestDb;
const NOW = new Date("2026-10-05T00:00:00Z");
const deps = () => testEntryDeps(NOW);

beforeEach(async () => {
  db = await createLedgerTestDb();
});
afterEach(() => db.close());

async function member(workspaceId: string, userId: string): Promise<void> {
  await db.pg.query(
    "insert into workspace_members(workspace_id, user_id, role) values ($1,$2,'admin') on conflict do nothing",
    [workspaceId, userId],
  );
}
async function topupGrant(
  billingAccountId: string,
  workspaceId: string,
  credits = 500,
): Promise<void> {
  await db.pg.query(
    `insert into credit_ledger (id, workspace_id, billing_account_id, kind, credits, bucket, source, idempotency_key)
     values ($1,$2,$3,'grant',$4,'topup','stripe',$5)`,
    [`cl_${billingAccountId}`, workspaceId, billingAccountId, credits, `ik_${billingAccountId}`],
  );
}

describe("meteredNoticeRecipients — the paid-account query (allowlisted, test tenants excluded)", () => {
  it("returns active paid subscribers and top-up holders; excludes free + test tenants", async () => {
    // paid subscription (seedProject defaults to an active studio_max sub)
    const paid = await seedProject(db, {
      userId: "usr_paid",
      billingAccountId: "ba_paid",
      workspaceId: "ws_paid",
      projectId: "prj_paid",
    });
    await member(paid.workspaceId, paid.userId);
    // top-up holder on a free plan (no subscription row → plan 'free')
    const top = await seedProject(db, {
      userId: "usr_top",
      billingAccountId: "ba_top",
      workspaceId: "ws_top",
      projectId: "prj_top",
      plan: null,
    });
    await member(top.workspaceId, top.userId);
    await topupGrant(top.billingAccountId, top.workspaceId);
    // free plan, no top-up → NOT a recipient
    const free = await seedProject(db, {
      userId: "usr_free",
      billingAccountId: "ba_free",
      workspaceId: "ws_free",
      projectId: "prj_free",
      plan: null,
    });
    await member(free.workspaceId, free.userId);
    // paid but flagged test tenant → excluded
    const test = await seedProject(db, {
      userId: "usr_test",
      billingAccountId: "ba_test",
      workspaceId: "ws_test",
      projectId: "prj_test",
    });
    await member(test.workspaceId, test.userId);
    await db.pg.query("update workspaces set is_test = true where id = $1", [test.workspaceId]);
    // cancelled paid sub → excluded
    const cancelled = await seedProject(db, {
      userId: "usr_cxl",
      billingAccountId: "ba_cxl",
      workspaceId: "ws_cxl",
      projectId: "prj_cxl",
    });
    await member(cancelled.workspaceId, cancelled.userId);
    await db.pg.query(
      "update subscriptions set status = 'cancelled' where billing_account_id = $1",
      [cancelled.billingAccountId],
    );

    const recips = await meteredNoticeRecipients(db.client);
    const ids = recips.map((r) => r.userId);
    expect(ids).toContain("usr_paid");
    expect(ids).toContain("usr_top");
    expect(ids).not.toContain("usr_free");
    expect(ids).not.toContain("usr_test");
    expect(ids).not.toContain("usr_cxl");
    expect(recips.find((r) => r.userId === "usr_paid")!.reason).toBe("subscription");
    expect(recips.find((r) => r.userId === "usr_top")!.reason).toBe("topup");
  });
});

describe("meteredNoticeTemplate — D.2 vocabulary; never 'you will be billed'", () => {
  it("uses credits/cap/top-up/plan and names the effective date", () => {
    const m = meteredNoticeTemplate({
      effectiveDate: "2026-11-02",
      appOrigin: "https://rhema.app",
    });
    for (const body of [m.subject, m.text, m.html]) {
      expect(body).not.toMatch(/you will be billed/i);
      expect(body).not.toMatch(/invoice/i);
    }
    expect(m.text).toContain("credits");
    expect(m.text).toContain("cap");
    expect(m.text).toContain("top-up");
    expect(m.text).toContain("plan");
    expect(m.text).toContain("2026-11-02");
    expect(m.text).toContain("https://rhema.app/usage");
    expect(m.html).toContain("/usage");
  });
});

describe("deliverMeteredNotice — dry-run default; exactly-once sends", () => {
  it("dry-run writes nothing and sends nothing", async () => {
    const p = await seedProject(db, {
      userId: "usr_a",
      billingAccountId: "ba_a",
      workspaceId: "ws_a",
      projectId: "prj_a",
    });
    await member(p.workspaceId, p.userId);
    const plan = await planMeteredNotice(db.client, {
      effectiveDate: "2026-11-02",
      appOrigin: "https://rhema.app",
    });
    expect(plan.wouldEmail).toBe(1);
    const out = await deliverMeteredNotice(db.client, deps(), {
      effectiveDate: "2026-11-02",
      appOrigin: "https://rhema.app",
      send: false,
      now: NOW,
    });
    expect(out[0]).toMatchObject({ inbox: "skipped", emailLeg: "skipped" });
    const inbox = await db.client.query("select count(*)::int as n from inbox_items", []);
    const deliveries = await db.client.query(
      "select count(*)::int as n from notification_deliveries",
      [],
    );
    expect((inbox.rows[0] as { n: number }).n).toBe(0);
    expect((deliveries.rows[0] as { n: number }).n).toBe(0);
  });

  it("send writes the inbox row + claims+sends the delivery exactly once (a re-run never double-mails)", async () => {
    const p = await seedProject(db, {
      userId: "usr_a",
      billingAccountId: "ba_a",
      workspaceId: "ws_a",
      projectId: "prj_a",
    });
    await member(p.workspaceId, p.userId);
    const sent: { to: string; subject: string }[] = [];
    const mailer = {
      send: async (m: { to: string; subject: string }) => {
        sent.push(m);
        return { id: `m_${sent.length}` };
      },
    };
    const first = await deliverMeteredNotice(
      db.client,
      { ...deps(), mailer, emailFrom: "billing@rhema.app" },
      {
        effectiveDate: "2026-11-02",
        appOrigin: "https://rhema.app",
        send: true,
        now: NOW,
      },
    );
    expect(first[0]).toMatchObject({ inbox: "written", emailLeg: "sent" });
    const inbox = (
      await db.client.query(
        "select kind, collapse_key, payload from inbox_items where user_id = $1",
        [p.userId],
      )
    ).rows as { kind: string; collapse_key: string; payload: { type: string; href: string } }[];
    expect(inbox).toHaveLength(1);
    expect(inbox[0]!.collapse_key).toBe(METERED_NOTICE_COLLAPSE_KEY);
    expect(inbox[0]!.payload.type).toBe("billing_notice");
    const deliv = (
      await db.client.query(
        "select dedup_key, status from notification_deliveries where user_id = $1",
        [p.userId],
      )
    ).rows as { dedup_key: string; status: string }[];
    expect(deliv).toHaveLength(1);
    expect(deliv[0]).toMatchObject({ dedup_key: METERED_NOTICE_DEDUP_KEY, status: "sent" });
    expect(sent).toHaveLength(1);

    // second send — the dedup row blocks the email; the collapse key re-writes the inbox row in place.
    const second = await deliverMeteredNotice(
      db.client,
      { ...deps(), mailer },
      {
        effectiveDate: "2026-11-02",
        appOrigin: "https://rhema.app",
        send: true,
        now: new Date(NOW.getTime() + 60000),
      },
    );
    expect(second[0]).toMatchObject({ emailLeg: "skipped" });
    expect(sent).toHaveLength(1);
  });
});
