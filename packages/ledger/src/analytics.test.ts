import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SqlClient } from "@rhema/orchestrator";
import { recordAnalyticsEvent } from "./analytics.js";
import { listAnalyticsEvents } from "./analytics-query.js";
import {
  createLedgerTestDb,
  seedProject,
  testEntryDeps,
  type LedgerTestDb,
} from "./testing/index.js";
import type { AnalyticsEventName } from "@rhema/contracts";

// PRB.12 — AC2 (every REQ-BETA-6…12 event has a fixture proving payload shape through the write
// boundary) + AC3 (the opt-out is honored end-to-end: no row on write, excluded on read) + the
// projector's idempotent-intake dedupe key (0024).

let db: LedgerTestDb;
const WS = "01JQ0000000000000000000WS1";
const USER = "01JQ0000000000000000000MB1";
const PROJ = "01JQ0000000000000000000PJ1";
const RUN = "01JQ0000000000000000000RN1";

beforeEach(async () => {
  db = await createLedgerTestDb();
  await seedProject(db, { workspaceId: WS, billingAccountId: "ba_seed", userId: USER, projectId: PROJ });
});
afterEach(() => db.close());

const inTx = <T>(fn: (tx: SqlClient) => Promise<T>) => db.txRunner.run(WS, fn);
const deps = () => testEntryDeps();

async function stored(event: AnalyticsEventName) {
  return (await db.client.query("select event, props, user_id, run_id from analytics_events where event = $1", [event]))
    .rows as { event: string; props: Record<string, unknown>; user_id: string; run_id: string | null }[];
}

describe("AC2 — REQ-BETA-6…12 event fixtures prove payload shape", () => {
  const cases: { event: AnalyticsEventName; props: Record<string, unknown>; run?: boolean }[] = [
    // REQ-BETA-6 — disposition + the one-tap reason code.
    { event: "finding.disposed", props: { disposition: "rebut", reason_code: "wrong" } },
    // REQ-BETA-7 — every accepted/rebutted finding's revision move traced.
    {
      event: "revision.move_traced",
      props: {
        finding_id: "01JQ0000000000000000000FD1",
        move_id: "01JQ0000000000000000000MV1",
        hunk_count: 3,
        chars_changed: 412,
      },
    },
    // REQ-BETA-8 — the re-review lineage counters.
    { event: "rereview.lineage", props: { carried: 4, closed: 9, new: 2, reopened: 1 } },
    // REQ-BETA-9 — the first-class round counter.
    {
      event: "round.completed",
      props: { ordinal: 2, manuscript_id: "01JQ0000000000000000000PJ1", important: true },
    },
    // REQ-BETA-10 — the dwell heartbeat.
    { event: "surface.dwell", props: { surface: "dossier", ms: 42000 } },
    // REQ-BETA-11 — the import signal.
    { event: "draft.imported", props: { origin: "docx", is_new_manuscript: true, venue_set: false } },
    // REQ-BETA-12 — the money events.
    { event: "wtp.recorded", props: { source: "interview", amount: 49 } },
    { event: "credits.exhausted_prompt", props: { action_taken: "shown" } },
  ];

  it("each fixture round-trips through the write boundary with its exact props", async () => {
    for (const c of cases) {
      const id = await inTx((tx) =>
        recordAnalyticsEvent(tx, deps(), {
          userId: USER,
          workspaceId: WS,
          projectId: PROJ,
          ...(c.run !== false ? { runId: RUN } : {}),
          event: c.event,
          props: c.props,
        }),
      );
      expect(id, c.event).not.toBeNull();
    }
    for (const c of cases) {
      const rows = await stored(c.event);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.props).toEqual(c.props);
      expect(rows[0]!.user_id).toBe(USER);
    }
  });

  it("a malformed REQ-BETA payload is refused (shape proven by rejection too)", async () => {
    await expect(
      inTx((tx) =>
        recordAnalyticsEvent(tx, deps(), {
          userId: USER,
          workspaceId: WS,
          event: "finding.disposed",
          props: { disposition: "shrug" },
        }),
      ),
    ).rejects.toThrow();
    await expect(
      inTx((tx) =>
        recordAnalyticsEvent(tx, deps(), {
          userId: USER,
          workspaceId: WS,
          event: "surface.dwell",
          props: { surface: "chat", ms: "a while" },
        }),
      ),
    ).rejects.toThrow();
    expect((await db.client.query("select count(*)::int n from analytics_events")).rows[0]).toEqual({ n: 0 });
  });
});

describe("AC3 — the opt-out is honored end-to-end", () => {
  it("write-side: an opted-out user's event produces no row", async () => {
    await db.pg.query('update "user" set analytics_opt_out = true where id = $1', [USER]);
    const id = await inTx((tx) =>
      recordAnalyticsEvent(tx, deps(), {
        userId: USER,
        workspaceId: WS,
        event: "surface.dwell",
        props: { surface: "dossier", ms: 1000 },
      }),
    );
    expect(id).toBeNull();
    expect((await db.client.query("select count(*)::int n from analytics_events")).rows[0]).toEqual({ n: 0 });
  });

  it("read-side: a user who opts out AFTER writing is excluded from the stream", async () => {
    await inTx((tx) =>
      recordAnalyticsEvent(tx, deps(), {
        userId: USER,
        workspaceId: WS,
        event: "surface.dwell",
        props: { surface: "dossier", ms: 1000 },
      }),
    );
    expect(await listAnalyticsEvents(db.client)).toHaveLength(1);
    await db.pg.query('update "user" set analytics_opt_out = true where id = $1', [USER]);
    expect(await listAnalyticsEvents(db.client)).toHaveLength(0);
    await db.pg.query('update "user" set analytics_opt_out = false where id = $1', [USER]);
    expect(await listAnalyticsEvents(db.client)).toHaveLength(1);
  });
});

describe("idempotent intake (0024 dedupe_key — the projector's replay guard)", () => {
  it("a replayed dedupe key is a no-op", async () => {
    const input = {
      userId: USER,
      workspaceId: WS,
      event: "run.launched" as const,
      props: { kind: "review", rigor: "standard", estimate: 560 },
      dedupeKey: "mat:run.launched:01JQ0000000000000000000RN1",
    };
    const first = await inTx((tx) => recordAnalyticsEvent(tx, deps(), input));
    const second = await inTx((tx) => recordAnalyticsEvent(tx, deps(), input));
    expect(first).not.toBeNull();
    expect(second).toBeNull();
    expect((await db.client.query("select count(*)::int n from analytics_events")).rows[0]).toEqual({ n: 1 });
  });
});
