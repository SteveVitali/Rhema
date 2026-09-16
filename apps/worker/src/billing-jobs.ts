// PRB.08 worker-side billing jobs (REQ-BETA-15, REQ-BILL-13, REQ-SPEC-24.7). Three pg-boss consumers on top
// of the @rhema/ledger primitives:
//
//  • `stripe.event` — the queued half of the §14.6 webhook discipline. The api's webhook already verified the
//    signature + parked the row in `stripe_events`; this consumer `processStripeEvent`s it (top-up grant,
//    chargeback, dispute-won reinstate + delivery re-drive).
//  • `usage.reconcile` (nightly cron) — pulls the provider Usage & Cost report through the injected
//    `reportSource` seam and reconciles it by request id (reconcileProviderReport): user-favourable refunds,
//    >2% drift alert, estimator recalibration. Then the REQ-SPEC-24.1 balances = Σ ledger assertion rides the
//    same job; a divergence alerts too.
//  • `run.deliver` — re-drives a delivery a chargeback withheld: the stashed `runs.pending_delivery` args go
//    back through `deliverRun` (whose withhold gate re-checks the account — a still-suspended account stays
//    parked), clearing the stash only on a delivered run.
//
// All handlers are pure over injected seams (systemExec + txRunner + the ledger) — PGlite-testable; the live
// bindings (Secret Manager report key, the alert sink) are main.ts's.

import {
  processStripeEvent,
  reconcileProviderReport,
  assertBalances,
  RUN_DELIVER_JOB,
  type ProviderUsageReport,
  type ReconcileAlert,
  type ReconcileMeasurement,
  type ReconcileResult,
  type StripeEventOutcome,
} from "@rhema/ledger";
import { deliverRun, type DeliverRunArgs, type DeliverRunDeps } from "@rhema/orchestrator";
import type { WorkerLedgerDeps } from "./ledger-jobs.js";

/** The `stripe.event` job payload (sent by the api's webhook intake). */
export interface StripeEventJobPayload {
  readonly eventId: string;
}

/** The nightly provider-report seam — the live binding is the provider's Usage & Cost API (Secret-Manager
 *  key; see main.ts). Tests inject a fixture report. */
export interface ProviderReportSource {
  /** the report to reconcile tonight (the provider's previous-day Usage & Cost report). */
  fetch(): Promise<ProviderUsageReport>;
}

/** Ops alert seam — >2% drift or a balance divergence pages here (the deploy binds the real sink). */
export type AlertSink = (a: ReconcileAlert) => void | Promise<void>;

export interface WorkerBillingDeps extends WorkerLedgerDeps {
  readonly reportSource?: ProviderReportSource;
  readonly alert?: AlertSink;
  /** the estimator recalibration fold (bound to @rhema/protocols' recordInstrumentedFold at deploy). */
  readonly recalibrate?: (m: ReconcileMeasurement) => void | Promise<void>;
  /** a workspace-bound content store for the delivery re-drive (the api's `contentStoreFor` shape). */
  readonly contentStoreFor?: (workspaceId: string) => Promise<DeliverRunDeps["store"]>;
  readonly obligationHook?: DeliverRunDeps["obligationHook"];
}

// ---- stripe.event -------------------------------------------------------------------------------------

/** Process one stored Stripe event (the webhook already deduped on the event id). Safe to retry — every
 *  arm inside `processStripeEvent` is idempotent (grant keys, the dispute prefix guard, processed_at). */
export function handleStripeEvent(
  deps: WorkerBillingDeps,
  payload: StripeEventJobPayload,
): Promise<StripeEventOutcome> {
  return processStripeEvent(deps.systemExec, {
    ids: deps.ids,
    clock: deps.clock,
    ledger: deps.ledger,
    runTx: (workspaceId, fn) => deps.txRunner.run(workspaceId, fn),
    eventWriter: deps.eventWriter,
    queue: deps.queue,
  }, payload.eventId);
}

// ---- usage.reconcile (nightly) -------------------------------------------------------------------------

export interface UsageReconcileResult {
  readonly report: ReconcileResult | null;
  /** REQ-SPEC-24.1 — the nightly balances = Σ ledger assertion riding the same job. */
  readonly balances: { ok: boolean; accountsChecked: number; divergences: number };
}

/** The nightly reconciliation: report → match by request id → user-favourable refunds → >2% alert →
 *  estimator recalibration → the balances assertion. A missing reportSource is a logged skip, never a crash. */
export async function handleUsageReconcile(deps: WorkerBillingDeps): Promise<UsageReconcileResult> {
  const alert: AlertSink =
    deps.alert ??
    ((a) => console.error("[worker] billing alert:", JSON.stringify(a)));

  let report: ReconcileResult | null = null;
  if (deps.reportSource) {
    const usageReport = await deps.reportSource.fetch();
    report = await reconcileProviderReport(deps.systemExec, {
      ids: deps.ids,
      clock: deps.clock,
      ledger: deps.ledger,
      runTx: (workspaceId, fn) => deps.txRunner.run(workspaceId, fn),
      eventWriter: deps.eventWriter,
      alert,
      ...(deps.recalibrate ? { recalibrate: deps.recalibrate } : {}),
    }, usageReport);
  } else {
    console.error("[worker] usage.reconcile: no provider report source configured — skipping (deploy leg)");
  }

  // REQ-SPEC-24.1: balances = Σ ledger, nightly. A divergence pages through the same sink.
  const assertion = await assertBalances(deps.systemExec);
  if (!assertion.ok) {
    await alert({
      kind: "balance_divergence",
      reportKey: "nightly-assertion",
      detail: JSON.stringify(assertion.divergences.slice(0, 10)),
    });
  }
  return {
    report,
    balances: {
      ok: assertion.ok,
      accountsChecked: assertion.accountsChecked,
      divergences: assertion.divergences.length,
    },
  };
}

// ---- run.deliver (withheld-delivery re-drive) ----------------------------------------------------------

export interface RunDeliverJobPayload {
  readonly runId: string;
  readonly workspaceId: string;
}

/**
 * Re-drive a withheld delivery: read `runs.pending_delivery`, hand it back through `deliverRun` (the
 * withhold gate inside re-checks `suspended_at`/`delivery_withheld_at`, so an early job harmlessly
 * re-stashes). The stash clears only when the delivery actually commits.
 */
export async function handleRunDeliver(
  deps: WorkerBillingDeps,
  payload: RunDeliverJobPayload,
): Promise<{ ok: boolean; withheld?: boolean; reason?: string }> {
  const row = (
    await deps.systemExec.query("select state, pending_delivery from runs where id = $1", [payload.runId])
  ).rows[0] as { state: string; pending_delivery: unknown } | undefined;
  if (!row?.pending_delivery) return { ok: true, reason: "nothing_pending" };
  if (!deps.contentStoreFor) return { ok: false, reason: "no content store wired" };

  const args = row.pending_delivery as DeliverRunArgs;
  const store = await deps.contentStoreFor(payload.workspaceId);
  const res = await deliverRun(
    {
      ...deps,
      store,
      ...(deps.obligationHook ? { obligationHook: deps.obligationHook } : {}),
    },
    args,
  );
  if (res.ok) {
    await deps.txRunner.run(payload.workspaceId, async (tx) => {
      await tx.query("update runs set pending_delivery = null, delivery_withheld_at = null where id = $1", [
        payload.runId,
      ]);
    });
    return { ok: true };
  }
  return { ok: false, withheld: res.code === "withheld", reason: res.reason };
}

export { RUN_DELIVER_JOB };
