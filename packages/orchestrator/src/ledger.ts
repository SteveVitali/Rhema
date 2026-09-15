// The hold / debit / release / refund interface (REQ-DATA-34; §12.4 steps 2, 8, 9). This ticket DEFINES the
// signatures and ships a test stub only — P0.11 supplies the sole real implementation (the account-locked
// ledger writes, the credit_balances maintenance, the min(actual, cap − Σ) cap guarantee). No ledger rows are
// written here. The orchestrator calls these at the coupling points: hold(cap) at queue, debit per committed
// step, release the unused hold at a terminal state, refund before any delivery for failed/refused runs.

import type { SqlClient } from "./tx.js";

export type HoldBucket = "included" | "topup" | "trial_pocket" | "daily" | "promo";

export interface HoldArgs {
  readonly billingAccountId: string;
  readonly workspaceId: string;
  readonly runId: string;
  readonly credits: number; // the cap to hold
  readonly idempotencyKey: string;
  /** trial entitlement runs hold against the entitlement, not credits (§12.4 step 2). */
  readonly entitlementId?: string;
}
export interface HoldResult {
  readonly ledgerId: string;
  readonly bucket: HoldBucket;
}

export interface DebitArgs {
  readonly billingAccountId: string;
  readonly workspaceId: string;
  readonly runId: string;
  readonly phaseId?: string;
  readonly credits: number;
  readonly idempotencyKey: string;
}
export interface ReleaseArgs {
  readonly billingAccountId: string;
  readonly workspaceId: string;
  readonly runId: string;
  readonly holdLedgerId: string;
  readonly idempotencyKey: string;
}
export interface RefundArgs {
  readonly billingAccountId: string;
  readonly workspaceId: string;
  readonly runId: string;
  readonly credits: number;
  readonly idempotencyKey: string;
}

export interface LedgerEntryRef {
  readonly ledgerId: string;
}

/**
 * The ledger operations the orchestrator couples to. Every method runs inside the caller-provided transaction
 * `tx` so the ledger effect commits with the state transition it belongs to. P0.11 owns the real impl.
 */
export interface HoldLedger {
  hold(tx: SqlClient, args: HoldArgs): Promise<HoldResult>;
  debit(tx: SqlClient, args: DebitArgs): Promise<LedgerEntryRef>;
  release(tx: SqlClient, args: ReleaseArgs): Promise<LedgerEntryRef>;
  refund(tx: SqlClient, args: RefundArgs): Promise<LedgerEntryRef>;
}

export class InsufficientBalanceError extends Error {
  constructor(readonly required: number) {
    super(`insufficient balance: ${required} credits required`);
    this.name = "InsufficientBalanceError";
  }
}

interface RecordedOp {
  readonly op: "hold" | "debit" | "release" | "refund";
  readonly args: HoldArgs | DebitArgs | ReleaseArgs | RefundArgs;
}

/**
 * A test stub for the hold/debit/release/refund interface. Records every call (so tests assert the coupling
 * points fired) and mints deterministic ledger ids; never touches the DB. Can be primed to reject a hold with
 * InsufficientBalanceError to exercise the run-creation resolution path.
 */
export class TestHoldLedger implements HoldLedger {
  readonly ops: RecordedOp[] = [];
  private seq = 0;
  private bucket: HoldBucket = "included";

  constructor(private opts: { insufficient?: boolean } = {}) {}

  primeInsufficient(v = true): void {
    this.opts.insufficient = v;
  }

  private next(): string {
    return `led_${String(++this.seq).padStart(4, "0")}`;
  }

  hold(_tx: SqlClient, args: HoldArgs): Promise<HoldResult> {
    if (this.opts.insufficient) return Promise.reject(new InsufficientBalanceError(args.credits));
    this.ops.push({ op: "hold", args });
    return Promise.resolve({ ledgerId: this.next(), bucket: this.bucket });
  }
  debit(_tx: SqlClient, args: DebitArgs): Promise<LedgerEntryRef> {
    this.ops.push({ op: "debit", args });
    return Promise.resolve({ ledgerId: this.next() });
  }
  release(_tx: SqlClient, args: ReleaseArgs): Promise<LedgerEntryRef> {
    this.ops.push({ op: "release", args });
    return Promise.resolve({ ledgerId: this.next() });
  }
  refund(_tx: SqlClient, args: RefundArgs): Promise<LedgerEntryRef> {
    this.ops.push({ op: "refund", args });
    return Promise.resolve({ ledgerId: this.next() });
  }

  opsOf(op: RecordedOp["op"]): RecordedOp[] {
    return this.ops.filter((o) => o.op === op);
  }
}
