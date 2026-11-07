// R7TALK.1b — REQ-SYNC-6 / REQ-SPEC-32 conformance (RV-21; R5 B6 "16 / 5 cr" + "43/40 cr").
// The deterministic reproduction of the audit's overspend shapes: a `chat_turn` run whose proxy
// meter EXCEEDS its `cap_credits` — lawful by design (§12.4: the cap-crossing request is served
// and metered; the NEXT request 402s — the residual bound is one in-flight request). What the
// ledger charges is the REQ-SPEC-32 question: this suite pins that net debits NEVER exceed the
// cap under either debit mode, that the residual books `adjustment(absorbed)` (COGS), that a
// FAILED turn charges the user nothing (refund + whole-burn absorb), and that the `debitedCredits`
// read (the chat turn's charge field — `Σ debit − Σ refund`, ADR-135) stays ≤ cap.
//
// The reproduction FAILS if the `writeDebit` clamp (sql-ledger.ts ~:176) or the terminal refund
// leg is removed — that is the conformance pin, not a fixture pin.

import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { absorbMeteredGap, resettleRun, type SqlClient } from "@rhema/orchestrator";
import { SqlHoldLedger } from "./sql-ledger.js";
import {
  createLedgerTestDb,
  seedProject,
  seedRun,
  seedBalances,
  testEntryDeps,
  readLedgerRows,
  type LedgerTestDb,
} from "./testing/index.js";

let db: LedgerTestDb;
const WS = "ws_seed";
const BA = "ba_seed";

beforeEach(async () => {
  db = await createLedgerTestDb();
  await seedProject(db, { workspaceId: WS, billingAccountId: BA });
});
afterEach(() => db.close());

function ledger() {
  return new SqlHoldLedger(testEntryDeps());
}
function inTx<T>(fn: (tx: SqlClient) => Promise<T>): Promise<T> {
  return db.txRunner.run(WS, fn);
}

/** A chat_turn run held at `cap`, with `metered` proxy credits already on `usage_records`. */
async function chatTurn(runId: string, cap: number, metered: number): Promise<void> {
  await seedBalances(db, { billingAccountId: BA, balances: { included: 5000 } });
  await seedRun(db, {
    runId,
    workspaceId: WS,
    state: "running",
    capCredits: cap,
    workflow: "chat_turn",
    holdLedgerId: `h_${runId}`,
  });
  const led = ledger();
  await inTx((tx) =>
    led.hold(tx, {
      billingAccountId: BA,
      workspaceId: WS,
      runId,
      credits: cap,
      idempotencyKey: `hold:${runId}`,
    }),
  );
  await db.client.query(
    `insert into usage_records(id, ts, workspace_id, billing_account_id, run_id, attempt, role, provider,
                               model, model_tier, rate_table_version, list_cost_usd, credits, source)
     values ($1, now(), $2, $3, $4, 1, 'assistant', 'anthropic', 'm', 'base', 1, $5, $6, 'proxy')`,
    [`u_${runId}`, WS, BA, runId, (metered / 140).toFixed(4), metered],
  );
}

function sums(rows: { kind: string; reason: string | null; credits: number }[]) {
  return {
    debited: rows.filter((r) => r.kind === "debit").reduce((s, r) => s + r.credits, 0),
    refunded: rows.filter((r) => r.kind === "refund").reduce((s, r) => s + r.credits, 0),
    absorbed: rows.filter((r) => r.kind === "adjustment" && r.reason === "absorbed").reduce((s, r) => s + r.credits, 0),
  };
}

/** The `debitedCredits` read verbatim — `Σ debit − Σ refund` for the run (chat-routes turnDebited). */
async function debitedCredits(runId: string): Promise<number> {
  const r = (
    await db.client.query(
      `select coalesce(sum(case kind when 'debit' then credits when 'refund' then -credits else 0 end),0)::int as s
         from credit_ledger where run_id = $1 and kind in ('debit','refund')`,
      [runId],
    )
  ).rows[0] as { s: number };
  return Number(r.s);
}

describe("REQ-SYNC-6 — chat-turn burn above cap (R5 B6): the charge still clamps", () => {
  for (const [label, cap, metered] of [
    ["B6 shrunk budget: cap 5, burn 16", 5, 16],
    ["B16 default budget: cap 40, burn 43", 40, 43],
  ] as const) {
    it(`${label} — committed mode: debited == cap, residual absorbs, net ≤ cap`, async () => {
      await chatTurn("turn_c", cap, metered);
      const r = await inTx((tx) =>
        resettleRun(tx, { ledger: ledger(), debitMode: "committed" }, {
          runId: "turn_c", workspaceId: WS, billingAccountId: BA, state: "completed", attempt: 1,
        }),
      );
      expect(r.debited).toBe(metered); // the settle asked for the full gap…
      const s = sums((await readLedgerRows(db, "turn_c")) as { kind: string; reason: string | null; credits: number }[]);
      expect(s.debited).toBe(cap); // …the ledger clamped the write at the cap
      expect(s.absorbed).toBe(metered - cap); // the overrun is platform COGS, never charged
      expect(await debitedCredits("turn_c")).toBe(cap); // the turn's charge reads cap-clamped
    });

    it(`${label} — metered mode: identical cap clamp (the modes differ in who keeps the excess)`, async () => {
      await chatTurn("turn_m", cap, metered);
      await inTx((tx) =>
        resettleRun(tx, { ledger: ledger(), debitMode: "metered" }, {
          runId: "turn_m", workspaceId: WS, billingAccountId: BA, state: "completed", attempt: 1,
        }),
      );
      const s = sums((await readLedgerRows(db, "turn_m")) as { kind: string; reason: string | null; credits: number }[]);
      expect(s.debited).toBe(cap);
      expect(s.absorbed).toBe(metered - cap);
      expect(await debitedCredits("turn_m")).toBe(cap);
    });

    it(`${label} — a FAILED turn charges nothing: refund + whole burn absorbs`, async () => {
      await chatTurn("turn_f", cap, metered);
      // the commit charged the cap first (a partial kept), then the terminal failure settles
      await inTx((tx) =>
        ledger().debit(tx, {
          billingAccountId: BA, workspaceId: WS, runId: "turn_f", credits: cap,
          idempotencyKey: "debit:turn_f:answer:1",
        }),
      );
      await inTx(async (tx) => {
        await ledger().refund(tx, {
          billingAccountId: BA, workspaceId: WS, runId: "turn_f", credits: cap,
          idempotencyKey: "refund:turn_f:terminal:1",
        });
        await absorbMeteredGap(tx, { ledger: ledger() }, {
          runId: "turn_f", workspaceId: WS, billingAccountId: BA,
        });
      });
      expect(await debitedCredits("turn_f")).toBe(0); // the user paid nothing — B6's failed turn
      const s = sums((await readLedgerRows(db, "turn_f")) as { kind: string; reason: string | null; credits: number }[]);
      expect(s.absorbed).toBe(metered); // the WHOLE metered burn is COGS
    });
  }

  it("the absorb is idempotent across a late-arrival re-settle (no double COGS)", async () => {
    await chatTurn("turn_r", 40, 43);
    const deps = { ledger: ledger(), debitMode: "committed" as const };
    await inTx((tx) =>
      resettleRun(tx, deps, {
        runId: "turn_r", workspaceId: WS, billingAccountId: BA, state: "completed", attempt: 1,
      }),
    );
    const before = (await readLedgerRows(db, "turn_r")) as unknown[];
    const again = await inTx((tx) =>
      resettleRun(tx, deps, {
        runId: "turn_r", workspaceId: WS, billingAccountId: BA, state: "completed", attempt: 1,
      }),
    );
    // `debited`/`absorbed` report the REQUESTED residuals — both no-ops by idempotency (the
    // settle key already ran): net charge stays the cap and zero new ledger rows book.
    expect(again.absorbed).toBe(0); // metered − debited − absorbed = 0 — nothing rebooks
    expect((await readLedgerRows(db, "turn_r")) as unknown[]).toHaveLength(before.length);
    expect(await debitedCredits("turn_r")).toBe(40);
  });
});
