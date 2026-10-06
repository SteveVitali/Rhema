// Wire the P0.09 delivery transaction into the run lifecycle (§12.4 step 8). At `finalizing`, the orchestrator
// runs the @rhema/mirror delivery transaction (validation → correspondence + freeze + obligation hook →
// attestation) and, IN THE SAME atomic transaction, takes `finalizing → completed`, releases the unused hold,
// emits `cost.final`, and revokes the run's credentials. A delivery-validation failure (cited⇒fetched, sidecar,
// producer) throws `DeliveryValidationError` → the run ends `finalizing → failed(validation)` with the files
// retained as partial and nothing marked immutable (REQ-DATA-7). The ledger DEBIT stays a separate retried
// transaction (this never debits — a ledger failure never rolls back a delivered dossier, review 13 F36).

import type { RunEventType } from "@rhema/contracts";
import {
  DeliveryValidationError,
  runDeliveryTransaction,
  type ContentStore,
  type DeliveryArgs,
  type DeliveryEventAppender,
  type ObligationHook,
} from "@rhema/mirror";
import type { OrchestratorDeps } from "./internal-api.js";
import { failRun } from "./internal-api.js";
import { applyTransition } from "./transition.js";
import { revokeRunCredentials } from "./credentials.js";
import { absorbMeteredGap, reconcileRunSpend, settleMeteredDebit } from "./spend.js";
import type { RunState } from "./state-machine.js";
import type { SqlClient } from "./tx.js";

export interface DeliverRunDeps extends OrchestratorDeps {
  /** the content-addressed artifact store (GCS in prod; in-memory in tests). */
  readonly store: ContentStore;
  /** the obligation spawn/join hook (P0.12); defaults to the mirror's no-op. */
  readonly obligationHook?: ObligationHook;
}

export interface DeliverRunArgs {
  readonly billingAccountId: string;
  readonly holdLedgerId?: string;
  readonly refundCredits?: number;
  readonly spentCredits: number;
  readonly capCredits: number;
  readonly byPhase?: Record<string, number>;
  /** the delivering dossier (parsed sidecars, delivered version ids, verdict context, …). */
  readonly delivery: DeliveryArgs;
}

export type DeliverRunResult =
  | { readonly ok: true; readonly state: RunState; readonly correspondenceId: string; readonly downgradedClaimOrdinals: readonly number[] }
  | { readonly ok: false; readonly state: RunState; readonly code: "validation" | "withheld"; readonly reason: string };

/**
 * Deliver a finalizing run. On success: the dossier is committed, the draft frozen, the artifacts immutable,
 * the run `completed`, the hold released, `cost.final` emitted, credentials revoked — one atomic transaction.
 * On a validation failure: nothing commits; the run ends `failed(validation)` (partials kept) via `failRun`.
 *
 * REQ-SPEC-24.7 (PRB.08): a suspended account's delivery is WITHHELD — the chargeback path marks the run
 * `delivery_withheld_at`; here the delivery args are stashed on `runs.pending_delivery` and the run stays
 * `finalizing`. Once the account is non-negative (dispute won / debt settled / operator reinstate), the
 * `run.deliver` job re-drives the stashed delivery.
 */
export async function deliverRun(deps: DeliverRunDeps, args: DeliverRunArgs): Promise<DeliverRunResult> {
  const { runId, workspaceId } = args.delivery;
  // adapt the orchestrator's EventWriter (typed RunEventType) to the mirror's structural appender.
  const eventWriter: DeliveryEventAppender = {
    append: (exec, ev) =>
      deps.eventWriter.append(exec as SqlClient, {
        runId: ev.runId,
        type: ev.type as RunEventType,
        payload: ev.payload,
        at: ev.at,
        ...(ev.agentLabel ? { agentLabel: ev.agentLabel } : {}),
      }),
  };

  try {
    const result = await deps.txRunner.run(workspaceId, async (tx) => {
      // ---- REQ-SPEC-24.7 withhold gate: a suspended account (or a run the chargeback already flagged) ---
      // stashes the delivery and stays `finalizing`; the `run.deliver` re-drive consumes `pending_delivery`
      // once the balance is non-negative. Lock the run row so a concurrent chargeback can't split the check.
      const gate = (
        await tx.query(
          `select r.delivery_withheld_at, b.suspended_at
             from runs r
             join workspaces w on w.id = r.workspace_id
             join billing_accounts b on b.id = w.billing_account_id
            where r.id = $1
            for update of r`,
          [runId],
        )
      ).rows[0] as { delivery_withheld_at: string | null; suspended_at: string | null } | undefined;
      if (gate && (gate.delivery_withheld_at !== null || gate.suspended_at !== null)) {
        await tx.query(
          "update runs set delivery_withheld_at = coalesce(delivery_withheld_at, $2), pending_delivery = $3 where id = $1",
          [runId, deps.clock.now(), JSON.stringify(args)],
        );
        return null;
      }
      const delivery = await runDeliveryTransaction(
        tx,
        { ids: deps.ids, clock: deps.clock, store: deps.store, eventWriter, ...(deps.obligationHook ? { obligationHook: deps.obligationHook } : {}) },
        args.delivery,
      );
      await applyTransition(tx, deps, { runId, from: "finalizing", to: "completed" });
      // DEF.2/F5 — charge the attempt's proxy-metered remainder the phase commits never reached
      // (REQ-SPEC-11: the proxy meter drives debits) BEFORE the release draws the hold away.
      const curAttempt = (
        await tx.query("select current_attempt from runs where id = $1", [runId])
      ).rows[0] as { current_attempt: number } | undefined;
      if (curAttempt) {
        await settleMeteredDebit(tx, deps, {
          runId,
          workspaceId,
          billingAccountId: args.billingAccountId,
          attempt: curAttempt.current_attempt,
        });
      }
      if (args.holdLedgerId) {
        await deps.ledger.release(tx, {
          billingAccountId: args.billingAccountId,
          workspaceId,
          runId,
          holdLedgerId: args.holdLedgerId,
          idempotencyKey: `release:${runId}`,
        });
      }
      await absorbMeteredGap(tx, deps, {
        runId,
        workspaceId,
        billingAccountId: args.billingAccountId,
      });
      // PRB.16b: reconcile spent_credits from the usage rows of record before the final figure is
      // emitted — the run-row figure resolved pre-tx can predate the last metered usage.
      const spentCredits = Math.max(args.spentCredits, await reconcileRunSpend(tx, runId));
      await deps.eventWriter.append(tx, {
        runId,
        type: "cost.final",
        payload: { spentCredits, capCredits: args.capCredits, ...(args.byPhase ? { byPhase: args.byPhase } : {}) },
        at: deps.clock.now(),
      });
      await revokeRunCredentials(tx, runId, deps.clock.now()); // terminal revocation (REQ-SPEC-11)
      return delivery;
    });
    if (result === null) {
      return {
        ok: false,
        state: "finalizing",
        code: "withheld",
        reason: "account suspended — delivery withheld until the balance is non-negative",
      };
    }
    await deps.heartbeats.clear(runId);
    return { ok: true, state: "completed", correspondenceId: result.correspondenceId, downgradedClaimOrdinals: result.downgradedClaimOrdinals };
  } catch (e) {
    if (e instanceof DeliveryValidationError) {
      // delivery validation unrecoverable → finalizing → failed(validation); files retained as partial.
      await failRun(deps, {
        runId,
        workspaceId,
        billingAccountId: args.billingAccountId,
        from: "finalizing",
        failure: { code: "validation", message: e.reason, retryable: false },
        ...(args.refundCredits ? { refundCredits: args.refundCredits } : {}),
        ...(args.holdLedgerId ? { holdLedgerId: args.holdLedgerId } : {}),
      });
      return { ok: false, state: "failed", code: "validation", reason: e.reason };
    }
    throw e;
  }
}
