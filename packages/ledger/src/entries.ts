// The single write path for every ledger mutation (§11.4; REQ-DATA-34). `applyLedgerEntry` inserts one
// `credit_ledger` row and maintains the matching `credit_balances` row IN THE SAME TRANSACTION (REQ-SPEC-24.1)
// — the caller's `tx`, so a ledger effect commits with the run-state transition it belongs to. Idempotent on
// the row's `idempotency_key`: a retried write returns the existing id and touches no balance (so a re-enqueue
// or an at-least-once queue never double-charges).

import type { SqlClient, IdFactory, Clock } from "@rhema/orchestrator";
import { balanceEffect, type LedgerKind } from "./balance-effect.js";
import type { HoldBucket } from "./buckets.js";

/** Where a ledger entry's `source` came from (the audit provenance, not the meter). */
export type LedgerSource = "run" | "hold" | "system" | "reconcile" | "stripe" | "admin";

export interface LedgerEntryInput {
  readonly workspaceId: string;
  readonly billingAccountId: string;
  readonly kind: LedgerKind;
  /** A positive magnitude; the sign is applied by `balanceEffect` (§14.4). */
  readonly credits: number;
  readonly bucket: HoldBucket;
  readonly runId?: string;
  readonly phaseId?: string;
  readonly source: LedgerSource;
  readonly reason?: string;
  readonly expiresAt?: Date | null;
  /** The Stripe object id the entry came from (a checkout session / dispute) — `credit_ledger.stripe_ref`. */
  readonly stripeRef?: string;
  /** Unique per logical write; a repeat is a no-op that returns the first id (REQ-DATA-34). */
  readonly idempotencyKey: string;
}

export interface AppliedEntry {
  readonly ledgerId: string;
  /** false when this exact `idempotency_key` was already written (the balance was not touched again). */
  readonly applied: boolean;
}

export interface EntryDeps {
  readonly ids: IdFactory;
  readonly clock: Clock;
}

/**
 * Write one ledger row + maintain its balance, idempotently. The `credit_balances.check(available >= 0)`
 * constraint is the guard: a debit/hold that would drive a bucket negative rolls the transaction back rather
 * than overspending. Balance rows are created on first touch (`on conflict do update`).
 */
export async function applyLedgerEntry(
  tx: SqlClient,
  deps: EntryDeps,
  entry: LedgerEntryInput,
): Promise<AppliedEntry> {
  const id = deps.ids("led");
  const at = deps.clock.now();
  const inserted = await tx.query(
    `insert into credit_ledger
       (id, workspace_id, billing_account_id, kind, credits, bucket, run_id, phase_id, source, reason, expires_at, stripe_ref, idempotency_key, at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
     on conflict (idempotency_key) do nothing
     returning id`,
    [
      id,
      entry.workspaceId,
      entry.billingAccountId,
      entry.kind,
      Math.max(0, Math.trunc(entry.credits)),
      entry.bucket,
      entry.runId ?? null,
      entry.phaseId ?? null,
      entry.source,
      entry.reason ?? null,
      entry.expiresAt ?? null,
      entry.stripeRef ?? null,
      entry.idempotencyKey,
      at,
    ],
  );
  if (inserted.rows.length === 0) {
    // A prior write already applied this key — return its id without re-touching the balance.
    const prior = (await tx.query("select id from credit_ledger where idempotency_key = $1", [entry.idempotencyKey]))
      .rows[0] as { id: string } | undefined;
    return { ledgerId: prior?.id ?? id, applied: false };
  }
  const { availableDelta, heldDelta } = balanceEffect(entry.kind, entry.credits);
  if (availableDelta !== 0 || heldDelta !== 0) {
    // Ensure the (account, bucket) balance row exists at 0/0, THEN apply the signed delta. A one-statement
    // `insert … on conflict do update` would evaluate `check (available >= 0)` against the proposed insert
    // tuple (which carries the negative delta) and reject a legitimate decrement of an existing balance.
    await tx.query(
      `insert into credit_balances (billing_account_id, bucket, available, held, updated_at)
       values ($1,$2,0,0,$3) on conflict (billing_account_id, bucket) do nothing`,
      [entry.billingAccountId, entry.bucket, at],
    );
    await tx.query(
      `update credit_balances set available = available + $3, held = held + $4, updated_at = $5
         where billing_account_id = $1 and bucket = $2`,
      [entry.billingAccountId, entry.bucket, availableDelta, heldDelta, at],
    );
  }
  return { ledgerId: id, applied: true };
}

/**
 * A grant (REQ-BILL-14/15): purchased top-up, plan-included credits, a promo, or a trial pocket enter a
 * bucket. Stripe (PRB.8) and plans (P1.16) call this — the ONE place credits are created. Idempotent.
 */
export async function grant(
  tx: SqlClient,
  deps: EntryDeps,
  args: {
    workspaceId: string;
    billingAccountId: string;
    bucket: HoldBucket;
    credits: number;
    idempotencyKey: string;
    source?: LedgerSource;
    reason?: string;
    expiresAt?: Date | null;
    stripeRef?: string;
  },
): Promise<AppliedEntry> {
  return applyLedgerEntry(tx, deps, {
    workspaceId: args.workspaceId,
    billingAccountId: args.billingAccountId,
    kind: "grant",
    credits: args.credits,
    bucket: args.bucket,
    source: args.source ?? "system",
    reason: args.reason,
    expiresAt: args.expiresAt ?? null,
    ...(args.stripeRef !== undefined ? { stripeRef: args.stripeRef } : {}),
    idempotencyKey: args.idempotencyKey,
  });
}
