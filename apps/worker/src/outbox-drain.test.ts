import { describe, it, expect, afterEach, vi } from "vitest";
import {
  createOrchestratorTestDb,
  type OrchestratorTestDb,
} from "@rhema/orchestrator/testing";
import { InMemoryQueue } from "@rhema/orchestrator";
import {
  drainOutbox,
  OUTBOX_CLAIM_LEASE_SECONDS,
  OUTBOX_MAX_ATTEMPTS,
} from "./outbox-drain.js";

// BL-115 (298_R6FIX.31) — the outbox drain on PGlite: claim lease + bounded attempts + verbatim
// send-options replay. `for update skip locked` is the real-Postgres concurrent-claim guarantee;
// PGlite is single-connection, so the concurrency contract is pinned by the claim SQL's lease
// re-arm behaviour (a fresh claim is invisible to a second drain in the same window).

let db: OrchestratorTestDb | undefined;
let queue: InMemoryQueue;
afterEach(async () => {
  await db?.close();
  db = undefined;
});

const insert = async (
  args: { queue?: string; payload?: object; options?: object; attempts?: number; claimedAt?: string } = {},
) => {
  const r = await db!.pg.query(
    `insert into outbox (id, workspace_id, queue, payload, send_options, attempts, claimed_at)
     values ('ob_' || gen_random_uuid()::text, 'w1', $1, $2, $3, $4, $5) returning id`,
    [
      args.queue ?? "project.purge",
      JSON.stringify(args.payload ?? { projectId: "p1" }),
      JSON.stringify(args.options ?? { singletonKey: "k" }),
      args.attempts ?? 0,
      args.claimedAt ?? null,
    ],
  );
  return (r.rows[0] as { id: string }).id;
};

const row = async (id: string) =>
  (await db!.pg.query(`select * from outbox where id = $1`, [id])).rows[0] as {
    sent_at: Date | null;
    claimed_at: Date | null;
    attempts: number;
    last_error: string | null;
  };

describe("drainOutbox — the outbox→pg-boss replay (BL-115)", () => {
  it("claims a pending row, sends with the stored options verbatim, and marks sent", async () => {
    db = await createOrchestratorTestDb();
    queue = new InMemoryQueue();
    const id = await insert({
      queue: "account.hard-delete",
      payload: { tenantId: "w1", userId: "u1", deletionRequestedAt: "2026-11-01T00:00:00Z" },
      options: { startAfterMs: 14 * 24 * 3600 * 1000, singletonKey: "account.hard-delete:u1" },
    });
    const r = await drainOutbox({ queue }, { system: db.client });
    expect(r.claimed).toBe(1);
    expect(r.sent).toEqual([id]);
    expect(queue.sent).toHaveLength(1);
    expect(queue.sent[0]!.name).toBe("account.hard-delete");
    expect((queue.sent[0]!.payload as { userId: string }).userId).toBe("u1");
    expect(queue.sent[0]!.startAfterMs).toBe(14 * 24 * 3600 * 1000);
    expect(queue.sent[0]!.singletonKey).toBe("account.hard-delete:u1");
    const after = await row(id);
    expect(after.sent_at).not.toBeNull();
    expect(after.attempts).toBe(1);
  });

  it("a failed send stays unsent with last_error + is re-claimable after the lease", async () => {
    db = await createOrchestratorTestDb();
    queue = new InMemoryQueue();
    const failing = {
      sent: 0,
      async send() {
        this.sent++;
        throw new Error("pg-boss down");
      },
    };
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const id = await insert();
    const r = await drainOutbox({ queue: failing }, { system: db.client });
    expect(r.sent).toHaveLength(0);
    expect(r.errors).toEqual([id]);
    const after = await row(id);
    expect(after.sent_at).toBeNull();
    expect(after.attempts).toBe(1);
    expect(after.last_error).toContain("pg-boss down");

    // a fresh claim blocks a second drain in-window (the skip-locked lease contract)
    const again = await drainOutbox({ queue }, { system: db.client });
    expect(again.claimed).toBe(0);

    // past the lease the row re-arms and a working queue delivers it.
    await db.pg.query(
      `update outbox set claimed_at = now() - ($2 * interval '1 second') - interval '1 second' where id = $1`,
      [id, OUTBOX_CLAIM_LEASE_SECONDS],
    );
    const third = await drainOutbox({ queue }, { system: db.client });
    expect(third.sent).toEqual([id]);
    expect((await row(id)).sent_at).not.toBeNull();
    spy.mockRestore();
  });

  it("a row at the attempt cap is never claimed — it stays unsent-and-visible", async () => {
    db = await createOrchestratorTestDb();
    queue = new InMemoryQueue();
    const id = await insert({ attempts: OUTBOX_MAX_ATTEMPTS });
    const r = await drainOutbox({ queue }, { system: db.client });
    expect(r.claimed).toBe(0);
    expect(queue.sent).toHaveLength(0);
    const after = await row(id);
    expect(after.sent_at).toBeNull();
    expect(after.attempts).toBe(OUTBOX_MAX_ATTEMPTS);
  });

  it("a sent row is never re-claimed (idempotent replay boundary)", async () => {
    db = await createOrchestratorTestDb();
    queue = new InMemoryQueue();
    const id = await insert();
    await drainOutbox({ queue }, { system: db.client });
    const again = await drainOutbox({ queue }, { system: db.client });
    expect(again.claimed).toBe(0);
    expect(queue.sent).toHaveLength(1);
    expect((await row(id)).sent_at).not.toBeNull();
  });
});
