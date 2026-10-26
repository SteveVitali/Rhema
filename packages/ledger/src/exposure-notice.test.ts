import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  deliverExposureNotice,
  exposureNoticeRecipients,
  exposureNoticeTemplate,
  planExposureNotice,
  EXPOSURE_NOTICE_COLLAPSE_KEY,
  EXPOSURE_NOTICE_DEDUP_KEY,
} from "./exposure-notice.js";
import {
  createLedgerTestDb,
  seedProject,
  testEntryDeps,
  type LedgerTestDb,
} from "./testing/index.js";

// R6CNT.2 (REQ-LCH-4; GD-EXPOSURE-NOTICE.R6 "Approve as drafted") — the RLS-exposure notice:
// recipients = holders of the real workspaces active in the window (test tenants excluded), the
// body is the H11-approved text verbatim, and --dry-run (send=false) writes nothing.

let db: LedgerTestDb;
const NOW = new Date("2026-10-23T00:00:00Z");
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
async function session(
  userId: string,
  token: string,
  createdAt: string,
  expiresAt: string,
): Promise<void> {
  await db.pg.query(
    `insert into session(id, user_id, token, expires_at, created_at) values ($1,$2,$3,$4,$5)`,
    [`ses_${token}`, userId, `tok_${token}`, expiresAt, createdAt],
  );
}

describe("exposureNoticeRecipients — real workspaces active in the window", () => {
  it("returns real-workspace members with a session overlapping the window; excludes test tenants + inactive", async () => {
    // real workspace, session inside the window → included
    const a = await seedProject(db, {
      userId: "usr_a",
      billingAccountId: "ba_a",
      workspaceId: "ws_a",
      projectId: "prj_a",
    });
    await member(a.workspaceId, a.userId);
    await session(a.userId, "a", "2026-09-20T00:00:00Z", "2026-11-20T00:00:00Z");
    // real workspace, session created before window but still live inside it → included
    const b = await seedProject(db, {
      userId: "usr_b",
      billingAccountId: "ba_b",
      workspaceId: "ws_b",
      projectId: "prj_b",
    });
    await member(b.workspaceId, b.userId);
    await session(b.userId, "b", "2026-09-01T00:00:00Z", "2026-10-15T00:00:00Z");
    // real workspace but no session → excluded
    const c = await seedProject(db, {
      userId: "usr_c",
      billingAccountId: "ba_c",
      workspaceId: "ws_c",
      projectId: "prj_c",
    });
    await member(c.workspaceId, c.userId);
    // real workspace, session entirely before the window (expired first) → excluded
    const d = await seedProject(db, {
      userId: "usr_d",
      billingAccountId: "ba_d",
      workspaceId: "ws_d",
      projectId: "prj_d",
    });
    await member(d.workspaceId, d.userId);
    await session(d.userId, "d", "2026-08-01T00:00:00Z", "2026-09-01T00:00:00Z");
    // active in window but flagged test tenant → excluded
    const t = await seedProject(db, {
      userId: "usr_t",
      billingAccountId: "ba_t",
      workspaceId: "ws_t",
      projectId: "prj_t",
    });
    await member(t.workspaceId, t.userId);
    await db.pg.query("update workspaces set is_test = true where id = $1", [t.workspaceId]);
    await session(t.userId, "t", "2026-09-20T00:00:00Z", "2026-11-20T00:00:00Z");

    const recips = await exposureNoticeRecipients(db.client);
    const ids = recips.map((r) => r.userId);
    expect(ids).toEqual(["usr_a", "usr_b"]);
    expect(recips[0]).toMatchObject({ email: "usr_a@example.test", workspaceId: "ws_a" });
  });
});

describe("exposureNoticeTemplate — the H11-approved text, verbatim claims", () => {
  it("carries the approved subject, window, counts, and contact; never a price or an edit", () => {
    const m = exposureNoticeTemplate();
    expect(m.subject).toBe("A security notice about your Rhema workspace data");
    const t = m.text.replace(/\s+/g, " ");
    // the approved facts — dates, the window, the confirmed figure, the contact, the sign-off
    expect(t).toContain("Between 17 September 2026 and 1 October 2026");
    expect(t).toContain("served across workspace boundaries on 252 occasions");
    expect(t).toContain("4 requests that may have written to another workspace's records");
    expect(t).toContain("first confirmed cross-tenant response was on 22 September 2026");
    expect(t).toContain("approximately 02:09 UTC");
    expect(t).toContain("dossier route on 25 September");
    expect(t).toContain("moved every user-facing service to a database role that cannot bypass");
    expect(t).toContain("internal or staff-operated account");
    expect(t).toContain("no evidence that any outside user received anyone else's data");
    expect(t).toContain("security@rhema.tools");
    expect(t.trim().endsWith("— The Rhema team")).toBe(true);
    // no figure the copy never promised — counts-only, no user identities
    expect(m.text).not.toMatch(/\$\d/);
    expect(m.text).not.toMatch(/real-ws-/);
    expect(m.html).toContain("252");
    expect(m.html).toContain("<li>voice/persona profiles (list and detail views)</li>");
  });
});

describe("deliverExposureNotice — dry-run default; exactly-once sends", () => {
  it("dry-run writes nothing and sends nothing", async () => {
    const p = await seedProject(db, {
      userId: "usr_a",
      billingAccountId: "ba_a",
      workspaceId: "ws_a",
      projectId: "prj_a",
    });
    await member(p.workspaceId, p.userId);
    await session(p.userId, "a", "2026-09-20T00:00:00Z", "2026-11-20T00:00:00Z");
    const plan = await planExposureNotice(db.client);
    expect(plan.wouldEmail).toBe(1);
    const out = await deliverExposureNotice(db.client, deps(), { send: false, now: NOW });
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
    await session(p.userId, "a", "2026-09-20T00:00:00Z", "2026-11-20T00:00:00Z");
    const sent: { to: string; subject: string }[] = [];
    const mailer = {
      send: async (m: { to: string; subject: string }) => {
        sent.push(m);
        return { id: `m_${sent.length}` };
      },
    };
    const first = await deliverExposureNotice(
      db.client,
      { ...deps(), mailer, emailFrom: "Rhema <security@rhema.tools>" },
      { send: true, now: NOW },
    );
    expect(first[0]).toMatchObject({ inbox: "written", emailLeg: "sent" });
    const inbox = (
      await db.client.query(
        "select kind, collapse_key, payload from inbox_items where user_id = $1",
        [p.userId],
      )
    ).rows as { kind: string; collapse_key: string; payload: { type: string } }[];
    expect(inbox).toHaveLength(1);
    expect(inbox[0]!.collapse_key).toBe(EXPOSURE_NOTICE_COLLAPSE_KEY);
    expect(inbox[0]!.payload.type).toBe("security_notice");
    const deliv = (
      await db.client.query(
        "select dedup_key, status, event_type from notification_deliveries where user_id = $1",
        [p.userId],
      )
    ).rows as { dedup_key: string; status: string; event_type: string }[];
    expect(deliv).toHaveLength(1);
    expect(deliv[0]).toMatchObject({
      dedup_key: EXPOSURE_NOTICE_DEDUP_KEY,
      status: "sent",
      event_type: "security_notice",
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({
      to: "usr_a@example.test",
      subject: "A security notice about your Rhema workspace data",
    });

    // second send — the dedup row blocks the email; the collapse key re-writes the inbox row in place.
    const second = await deliverExposureNotice(
      db.client,
      { ...deps(), mailer },
      { send: true, now: new Date(NOW.getTime() + 60000) },
    );
    expect(second[0]).toMatchObject({ emailLeg: "skipped" });
    expect(sent).toHaveLength(1);
  });
});
