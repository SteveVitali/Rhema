// Operator-side account actions (PRB.08; REQ-BETA-14). The admin CLI's verbs land here — every one writes an
// `admin_actions` audit row IN THE SAME transaction as its ledger/account effect, so an audited action can
// never exist without its audit row (or vice versa). A house-credit grant is an ORDINARY `grant` ledger row —
// `promo` bucket, an expiry, `source: "admin"`, `reason: "house_credit"` — so the balance path, the nightly
// balances = Σ ledger assertion, and the audit read all see it identically to any other grant.
//
// These functions take the caller's transaction (the CLI runs them inside a workspace-scoped tx — the ledger
// is tenant-keyed) and the injected ids/clock; they never open their own connection.

import type { SqlClient } from "@rhema/orchestrator";
import { applyLedgerEntry, type EntryDeps } from "./entries.js";
import { expireCredits } from "./expiry.js";

/** The admin_actions vocabulary (mirrors the 0020 check constraint). */
export type AdminAction =
  | "house_credit_grant"
  | "house_credit_void"
  | "account_suspend"
  | "account_reinstate"
  | "wtp_record";

/** Write the operator audit row; returns its id. */
async function audit(
  tx: SqlClient,
  deps: EntryDeps,
  args: {
    actor: string;
    action: AdminAction;
    billingAccountId?: string;
    workspaceId?: string;
    credits?: number;
    note?: string;
    ledgerId?: string;
  },
): Promise<string> {
  const id = deps.ids("adm");
  await tx.query(
    `insert into admin_actions (id, actor, action, billing_account_id, workspace_id, credits, note, ledger_id, at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
    [
      id,
      args.actor,
      args.action,
      args.billingAccountId ?? null,
      args.workspaceId ?? null,
      args.credits ?? null,
      args.note ?? null,
      args.ledgerId ?? null,
      deps.clock.now(),
    ],
  );
  return id;
}

export interface HouseGrantArgs {
  readonly actor: string;
  readonly workspaceId: string;
  readonly billingAccountId: string;
  readonly credits: number;
  /** House credits expire (a grant that never expires is a silent subsidy). Required, never null. */
  readonly expiresAt: Date;
  readonly note?: string;
  /** Unique per logical grant; a replay is a no-op (REQ-DATA-34). The CLI mints one per invocation. */
  readonly idempotencyKey: string;
}

export interface HouseGrantResult {
  readonly ledgerId: string;
  /** false when the idempotency key was already consumed (the audit row is NOT re-written on replay). */
  readonly applied: boolean;
  readonly auditId: string | null;
}

/**
 * Grant house credits: an ordinary `grant` row in the `promo` bucket with the required expiry, plus the
 * audit row. Idempotent on `idempotencyKey` — a retried CLI run cannot double-grant.
 */
export async function grantHouseCredits(
  tx: SqlClient,
  deps: EntryDeps,
  args: HouseGrantArgs,
): Promise<HouseGrantResult> {
  const res = await applyLedgerEntry(tx, deps, {
    workspaceId: args.workspaceId,
    billingAccountId: args.billingAccountId,
    kind: "grant",
    credits: args.credits,
    bucket: "promo",
    source: "admin",
    reason: "house_credit",
    expiresAt: args.expiresAt,
    idempotencyKey: args.idempotencyKey,
  });
  if (!res.applied) return { ledgerId: res.ledgerId, applied: false, auditId: null };
  const auditId = await audit(tx, deps, {
    actor: args.actor,
    action: "house_credit_grant",
    billingAccountId: args.billingAccountId,
    workspaceId: args.workspaceId,
    credits: args.credits,
    ...(args.note !== undefined ? { note: args.note } : {}),
    ledgerId: res.ledgerId,
  });
  return { ledgerId: res.ledgerId, applied: true, auditId };
}

export interface HouseVoidArgs {
  readonly actor: string;
  readonly workspaceId: string;
  readonly billingAccountId: string;
  /** the amount to void; omitted ⇒ the account's entire spendable promo balance. */
  readonly credits?: number;
  readonly note?: string;
  readonly idempotencyKey: string;
}

export interface HouseVoidResult {
  /** the credits actually removed (clamped to the available promo balance — never below zero). */
  readonly voided: number;
  readonly auditId: string | null;
}

/**
 * Void house credits: remove spendable `promo` balance via an `expire` row (the void IS an expiry — the
 * credits are removed from available, clamped so `check(available >= 0)` can never trip) + the audit row.
 * Held promo credits are untouched (a hold protects its reservation — REQ-SPEC-24.3).
 */
export async function voidHouseCredits(
  tx: SqlClient,
  deps: EntryDeps,
  args: HouseVoidArgs,
): Promise<HouseVoidResult> {
  const available = Number(
    (
      (
        await tx.query(
          "select available::int as a from credit_balances where billing_account_id = $1 and bucket = 'promo'",
          [args.billingAccountId],
        )
      ).rows[0] as { a: number } | undefined
    )?.a ?? 0,
  );
  const amount = args.credits != null ? Math.min(args.credits, available) : available;
  if (amount <= 0) return { voided: 0, auditId: null };
  const voided = await expireCredits(tx, deps, {
    workspaceId: args.workspaceId,
    billingAccountId: args.billingAccountId,
    bucket: "promo",
    credits: amount,
    reason: "house_credit_void",
    idempotencyKey: args.idempotencyKey,
  });
  const auditId = await audit(tx, deps, {
    actor: args.actor,
    action: "house_credit_void",
    billingAccountId: args.billingAccountId,
    workspaceId: args.workspaceId,
    credits: voided,
    ...(args.note !== undefined ? { note: args.note } : {}),
  });
  return { voided, auditId };
}

/**
 * Suspend an account (operator action — the Stripe-driven suspend lives in chargeback.ts). Idempotent:
 * re-suspending keeps the first `suspended_at`.
 */
export async function suspendAccount(
  tx: SqlClient,
  deps: EntryDeps,
  args: { actor: string; billingAccountId: string; workspaceId?: string; note?: string },
): Promise<{ suspended: boolean }> {
  const res = await tx.query(
    "update billing_accounts set suspended_at = $2 where id = $1 and suspended_at is null returning id",
    [args.billingAccountId, deps.clock.now()],
  );
  const suspended = res.rows.length > 0;
  if (suspended) {
    await audit(tx, deps, {
      actor: args.actor,
      action: "account_suspend",
      billingAccountId: args.billingAccountId,
      ...(args.workspaceId !== undefined ? { workspaceId: args.workspaceId } : {}),
      ...(args.note !== undefined ? { note: args.note } : {}),
    });
  }
  return { suspended };
}

/** An account cannot be reinstated while clawback debt remains — "non-negative" is the bar (REQ-SPEC-24.7). */
export class ClawbackDebtError extends Error {
  constructor(
    readonly billingAccountId: string,
    readonly debt: number,
  ) {
    super(`billing account ${billingAccountId} still carries clawback debt ${debt}`);
    this.name = "ClawbackDebtError";
  }
}

/**
 * Reinstate a suspended account: clears `suspended_at` and the delivery-withhold markers on its runs — but
 * REFUSES while `clawback_debt > 0` (deliveries stay withheld until the balance is non-negative;
 * REQ-SPEC-24.7). Writing the debt off first is a separate operator decision (`clawback_debt` is only cleared
 * by the dispute-won path or an explicit settlement — never silently).
 */
export async function reinstateAccount(
  tx: SqlClient,
  deps: EntryDeps,
  args: { actor: string; billingAccountId: string; workspaceId?: string; note?: string },
): Promise<{ reinstated: boolean; withheldRuns: readonly { runId: string; workspaceId: string }[] }> {
  const row = (
    await tx.query("select suspended_at, clawback_debt::int as debt from billing_accounts where id = $1 for update", [
      args.billingAccountId,
    ])
  ).rows[0] as { suspended_at: string | null; debt: number } | undefined;
  if (!row?.suspended_at) return { reinstated: false, withheldRuns: [] };
  if (Number(row.debt) > 0) throw new ClawbackDebtError(args.billingAccountId, Number(row.debt));
  await tx.query("update billing_accounts set suspended_at = null where id = $1", [args.billingAccountId]);
  // Delivery is no longer withheld: clear the marker on every withheld run and hand the caller the
  // (runId, workspaceId) pairs so it enqueues the `run.deliver` re-drive — `pending_delivery` (the stashed
  // DeliverRunArgs) stays until the re-drive consumes it.
  const withheldRuns = (
    await tx.query(
      `update runs set delivery_withheld_at = null
        where delivery_withheld_at is not null
          and workspace_id in (select id from workspaces where billing_account_id = $1)
        returning id, workspace_id`,
      [args.billingAccountId],
    )
  ).rows.map((r) => {
    const row = r as { id: string; workspace_id: string };
    return { runId: row.id, workspaceId: row.workspace_id };
  });
  await audit(tx, deps, {
    actor: args.actor,
    action: "account_reinstate",
    billingAccountId: args.billingAccountId,
    ...(args.workspaceId !== undefined ? { workspaceId: args.workspaceId } : {}),
    ...(args.note !== undefined ? { note: args.note } : {}),
  });
  return { reinstated: true, withheldRuns };
}
