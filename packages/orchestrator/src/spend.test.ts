// DEF.2/F5 — the row-level settle math behind the terminal-settle policies (§12.4 step 9; REQ-SPEC-24.8).
// internal-api.test.ts covers the call-site coupling via the recording TestHoldLedger; these exercise
// `meteredCredits` / `netDebitedCredits` / `incrementalMeteredDebit` / `settleMeteredDebit` /
// `absorbMeteredGap` against REAL seeded rows — including the post-refund reads a terminal settle does
// in the same transaction (where SqlHoldLedger's writes are visible, unlike the recording double's).

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { SqlClient } from "./tx.js";
import {
  absorbMeteredGap,
  incrementalMeteredDebit,
  meteredCredits,
  netDebitedCredits,
  settleMeteredDebit,
} from "./spend.js";
import { TestHoldLedger } from "./ledger.js";
import {
  createOrchestratorTestDb,
  seedProject,
  seedRun,
  makeDeps,
  type OrchestratorTestDb,
} from "./testing/index.js";

let db: OrchestratorTestDb;
let ws: string;
let ba: string;
let ledger: TestHoldLedger;

beforeEach(async () => {
  db = await createOrchestratorTestDb();
  const seed = await seedProject(db);
  ws = seed.workspaceId;
  ba = seed.billingAccountId;
  ledger = makeDeps(db).ledger;
  await seedRun(db, { runId: "run1", workspaceId: ws, projectId: seed.projectId, state: "running" });
});
afterEach(() => db.close());

const seedUsage = (id: string, runId: string, attempt: number, credits: number, source = "proxy") =>
  db.client.query(
    `insert into usage_records(id, ts, workspace_id, billing_account_id, run_id, attempt, role, provider, model, model_tier,
       rate_table_version, list_cost_usd, credits, source)
     values ($1, now(), $2, $3, $4, $5, 'editor', 'anthropic', 'claude-x', 'balanced', 1, 0.5, $6, $7)`,
    [id, ws, ba, runId, attempt, credits, source],
  );

const seedLedger = (id: string, kind: string, credits: number, key: string, reason?: string) =>
  db.client.query(
    `insert into credit_ledger(id, workspace_id, billing_account_id, kind, credits, bucket, run_id, source, reason, idempotency_key, at)
     values ($1, $2, $3, $4, $5, 'included', 'run1', 'run', $6, $7, now())`,
    [id, ws, ba, kind, credits, reason ?? null, key],
  );

const inTx = <T>(fn: (tx: SqlClient) => Promise<T>) => db.txRunner.run(ws, fn);

describe("meteredCredits / netDebitedCredits", () => {
  it("metered reads only proxy rows — sdk-side rows never count as the meter", async () => {
    await seedUsage("u1", "run1", 1, 40);
    await seedUsage("u2", "run1", 1, 25);
    await seedUsage("u3", "run1", 1, 999, "sdk_stream");
    await seedUsage("u4", "run1", 2, 7);
    expect(await inTx((tx) => meteredCredits(tx, "run1"))).toBe(72); // whole run
    expect(await inTx((tx) => meteredCredits(tx, "run1", 1))).toBe(65); // attempt-scoped
  });

  it("net debited = Σ debit − Σ refund (adjustments never count)", async () => {
    await seedLedger("l1", "debit", 100, "debit:run1:a:1#included");
    await seedLedger("l2", "debit", 60, "debit:run1:b:1#included");
    await seedLedger("l3", "refund", 40, "refund:run1#included");
    await seedLedger("l4", "adjustment", 25, "absorb:run1:1#absorbed", "absorbed");
    expect(await inTx((tx) => netDebitedCredits(tx, "run1"))).toBe(120);
  });
});

describe("incrementalMeteredDebit — the commit's charge target", () => {
  it("returns the metered delta over the pod figure; keys scope to the attempt", async () => {
    await seedUsage("u1", "run1", 1, 65);
    // no attempt-1 debits yet → the charge is the full metered total (over the pod's 10).
    expect(await inTx((tx) => incrementalMeteredDebit(tx, "run1", 1, 10))).toBe(65);
    // a debit keyed to a DIFFERENT attempt does not reduce this attempt's charge.
    await seedLedger("l1", "debit", 65, "debit:run1:intake:9#included");
    expect(await inTx((tx) => incrementalMeteredDebit(tx, "run1", 1, 10))).toBe(65);
    // same-attempt keys do: 65 metered − 65 debited → floor is the pod figure.
    await seedLedger("l2", "debit", 65, "debit:run1:intake:1#included");
    expect(await inTx((tx) => incrementalMeteredDebit(tx, "run1", 1, 8))).toBe(8);
  });

  it("unmetered runs fall back to the pod figure verbatim", async () => {
    expect(await inTx((tx) => incrementalMeteredDebit(tx, "run1", 1, 42))).toBe(42);
  });
});

describe("settleMeteredDebit — the completed settle's charge leg", () => {
  it("debits metered − attempt-debited, keyed debit:<run>:settle:<attempt>; zero when settled", async () => {
    await seedUsage("u1", "run1", 1, 65);
    await seedLedger("l1", "debit", 40, "debit:run1:intake:1#included");
    const first = await inTx((tx) =>
      settleMeteredDebit(tx, { ledger }, { runId: "run1", workspaceId: ws, billingAccountId: ba, attempt: 1 }),
    );
    expect(first).toBe(25);
    expect(ledger.opsOf("debit").map((o) => (o.args as { idempotencyKey: string }).idempotencyKey)).toEqual([
      "debit:run1:settle:1",
    ]);
    // idempotent at the READ level too: a second settle against rows that now cover the charge is 0.
    await seedLedger("l2", "debit", 25, "debit:run1:settle:1#included");
    const again = await inTx((tx) =>
      settleMeteredDebit(tx, { ledger }, { runId: "run1", workspaceId: ws, billingAccountId: ba, attempt: 1 }),
    );
    expect(again).toBe(0);
    expect(ledger.opsOf("debit")).toHaveLength(1);
  });
});

describe("absorbMeteredGap — the un-paid burn books platform COGS", () => {
  it("post-refund (net charge 0) the whole metered figure absorbs", async () => {
    await seedUsage("u1", "run1", 1, 65);
    await seedLedger("l1", "debit", 30, "debit:run1:intake:1#included");
    await seedLedger("l2", "refund", 30, "refund:run1#included"); // the settle's refund, persisted
    const gap = await inTx((tx) =>
      absorbMeteredGap(tx, { ledger }, { runId: "run1", workspaceId: ws, billingAccountId: ba }),
    );
    expect(gap).toBe(65);
    expect(ledger.opsOf("absorb").map((o) => (o.args as { idempotencyKey: string }).idempotencyKey)).toEqual([
      "absorb:run1:1",
    ]);
  });

  it("on a cancel (no refund) only the uncommitted residue absorbs", async () => {
    await seedUsage("u1", "run1", 1, 65);
    await seedLedger("l1", "debit", 30, "debit:run1:intake:1#included");
    expect(
      await inTx((tx) =>
        absorbMeteredGap(tx, { ledger }, { runId: "run1", workspaceId: ws, billingAccountId: ba }),
      ),
    ).toBe(35);
  });

  it("already-absorbed rows net out; a second episode takes the next serial key", async () => {
    await seedUsage("u1", "run1", 1, 65);
    await seedLedger("l1", "adjustment", 65, "absorb:run1:1#absorbed", "absorbed");
    // nothing left un-paid → no op.
    expect(
      await inTx((tx) =>
        absorbMeteredGap(tx, { ledger }, { runId: "run1", workspaceId: ws, billingAccountId: ba }),
      ),
    ).toBe(0);
    expect(ledger.opsOf("absorb")).toHaveLength(0);
    // more burn lands after (a resumed attempt) → the NEXT episode key.
    await seedUsage("u2", "run1", 2, 20);
    expect(
      await inTx((tx) =>
        absorbMeteredGap(tx, { ledger }, { runId: "run1", workspaceId: ws, billingAccountId: ba }),
      ),
    ).toBe(20);
    expect(ledger.opsOf("absorb").map((o) => (o.args as { idempotencyKey: string }).idempotencyKey)).toEqual([
      "absorb:run1:2",
    ]);
  });
});
