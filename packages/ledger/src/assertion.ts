// The nightly balances = sum-of-ledger assertion (REQ-SPEC-24.1; review 13 F25). credit_balances is a TABLE
// maintained in each ledger transaction, not a materialized view -- so a bug that writes a balance without a
// ledger row (or vice versa) would silently corrupt the money. This job rebuilds every account's per-bucket
// balance by folding balanceEffect over its ledger rows (the SAME function the write path uses) and compares
// it to the maintained table; any mismatch is a divergence to page on. Deterministic and read-only.

import type { SqlClient } from "@rhema/orchestrator";
import { balanceEffect, type LedgerKind } from "./balance-effect.js";

export interface BalanceDivergence {
  readonly billingAccountId: string;
  readonly bucket: string;
  readonly expectedAvailable: number;
  readonly actualAvailable: number;
  readonly expectedHeld: number;
  readonly actualHeld: number;
}

export interface AssertionResult {
  readonly ok: boolean;
  readonly divergences: readonly BalanceDivergence[];
  readonly accountsChecked: number;
}

interface Acc {
  available: number;
  held: number;
}

/**
 * Rebuild balances from the ledger and diff against credit_balances. Pass billingAccountId to check one
 * account (the hot path after a suspicious run); omit it for the whole-fleet nightly sweep.
 */
export async function assertBalances(
  exec: SqlClient,
  opts: { billingAccountId?: string } = {},
): Promise<AssertionResult> {
  const filter = opts.billingAccountId ? " where billing_account_id = $1" : "";
  const params = opts.billingAccountId ? [opts.billingAccountId] : [];

  const ledgerRows = (
    await exec.query(`select billing_account_id, bucket, kind, credits from credit_ledger${filter}`, params)
  ).rows as { billing_account_id: string; bucket: string; kind: LedgerKind; credits: number | string }[];

  // Rebuild per (account, bucket). The key delimiter "#" never appears in an account id or a bucket name.
  const expected = new Map<string, Acc>();
  const key = (account: string, bucket: string): string => `${account}#${bucket}`;
  const accounts = new Set<string>();
  for (const r of ledgerRows) {
    accounts.add(r.billing_account_id);
    const { availableDelta, heldDelta } = balanceEffect(r.kind, Number(r.credits));
    const k = key(r.billing_account_id, r.bucket);
    const cur = expected.get(k) ?? { available: 0, held: 0 };
    cur.available += availableDelta;
    cur.held += heldDelta;
    expected.set(k, cur);
  }

  const balanceRows = (
    await exec.query(
      `select billing_account_id, bucket, available::int as available, held::int as held from credit_balances${filter}`,
      params,
    )
  ).rows as { billing_account_id: string; bucket: string; available: number; held: number }[];

  const actual = new Map<string, Acc>();
  for (const r of balanceRows) {
    accounts.add(r.billing_account_id);
    actual.set(key(r.billing_account_id, r.bucket), { available: Number(r.available), held: Number(r.held) });
  }

  const divergences: BalanceDivergence[] = [];
  for (const k of new Set([...expected.keys(), ...actual.keys()])) {
    const hash = k.indexOf("#");
    const billingAccountId = k.slice(0, hash);
    const bucket = k.slice(hash + 1);
    const e = expected.get(k) ?? { available: 0, held: 0 };
    const a = actual.get(k) ?? { available: 0, held: 0 };
    if (e.available !== a.available || e.held !== a.held) {
      divergences.push({
        billingAccountId,
        bucket,
        expectedAvailable: e.available,
        actualAvailable: a.available,
        expectedHeld: e.held,
        actualHeld: a.held,
      });
    }
  }
  divergences.sort((x, y) => (x.billingAccountId + x.bucket).localeCompare(y.billingAccountId + y.bucket));
  return { ok: divergences.length === 0, divergences, accountsChecked: accounts.size };
}
