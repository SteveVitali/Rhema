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
  | { readonly ok: false; readonly state: RunState; readonly code: "validation"; readonly reason: string };

/**
 * Deliver a finalizing run. On success: the dossier is committed, the draft frozen, the artifacts immutable,
 * the run `completed`, the hold released, `cost.final` emitted, credentials revoked — one atomic transaction.
 * On a validation failure: nothing commits; the run ends `failed(validation)` (partials kept) via `failRun`.
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
      const delivery = await runDeliveryTransaction(
        tx,
        { ids: deps.ids, clock: deps.clock, store: deps.store, eventWriter, ...(deps.obligationHook ? { obligationHook: deps.obligationHook } : {}) },
        args.delivery,
      );
      await applyTransition(tx, deps, { runId, from: "finalizing", to: "completed" });
      if (args.holdLedgerId) {
        await deps.ledger.release(tx, {
          billingAccountId: args.billingAccountId,
          workspaceId,
          runId,
          holdLedgerId: args.holdLedgerId,
          idempotencyKey: `release:${runId}`,
        });
      }
      await deps.eventWriter.append(tx, {
        runId,
        type: "cost.final",
        payload: { spentCredits: args.spentCredits, capCredits: args.capCredits, ...(args.byPhase ? { byPhase: args.byPhase } : {}) },
        at: deps.clock.now(),
      });
      await revokeRunCredentials(tx, runId, deps.clock.now()); // terminal revocation (REQ-SPEC-11)
      return delivery;
    });
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
