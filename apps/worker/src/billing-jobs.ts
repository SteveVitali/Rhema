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
  reconcileProviderWindow,
  assertBalances,
  RUN_DELIVER_JOB,
  runBillingPeriodTick,
  sweepExpiredTrials,
  sweepTrialSpend,
  sweepAutoReload,
  weeklyEstimatorRefit,
  harvestCostObservations,
  recomputeCostCards,
  refitCapMultipliers,
  type ProviderUsageReport,
  type ReconcileAlert,
  type ReconcileMeasurement,
  type ReconcileResult,
  type ReconcileWindowResult,
  type StripeEventOutcome,
  type StripePort,
  type PeriodTickResult,
  type SubDeps,
} from "@rhema/ledger";
import {
  deliverRun,
  NOTIFY_QUEUE,
  type DeliverRunArgs,
  type DeliverRunDeps,
} from "@rhema/orchestrator";
import { WORKFLOW_MANIFESTS } from "@rhema/protocols";
import { ProviderReportFetchError } from "./provider-report.js";
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
  return processStripeEvent(
    deps.systemExec,
    {
      ids: deps.ids,
      clock: deps.clock,
      ledger: deps.ledger,
      runTx: (workspaceId, fn) => deps.txRunner.run(workspaceId, fn),
      eventWriter: deps.eventWriter,
      queue: deps.queue,
      // P1.16 — billing emails ride the notify queue (`trial_payment` carries a free reason string).
      // BILL.3 — a `tag` (e.g. `checkout:<sessionId>`) keys the pending-checkout mail exactly-once.
      notify: async (p) => {
        await deps.queue.send(NOTIFY_QUEUE, p, {
          singletonKey: `notify:billing:${p.billingAccountId ?? p.userId}:${(p.tag ?? p.reason).slice(0, 40)}`,
        });
      },
    },
    payload.eventId,
  );
}

// ---- usage.reconcile (nightly) -------------------------------------------------------------------------

export interface UsageReconcileResult {
  readonly report: ReconcileResult | null;
  /** the aggregate-window arm's result (Anthropic emits windows, never per-request rows). */
  readonly window: ReconcileWindowResult | null;
  /**
   * R6OPS.1 — the recorded fetch denial: a bound-but-refused admin key (401/403) degrades the
   * report/window arms to null the same way the placeholder guard does at boot, with the denial
   * recorded here + paged once through the alert sink — while the balances assertion still runs.
   * null = the source fetched (or none was configured); a string = the recorded denial message.
   */
  readonly reportError: string | null;
  /** REQ-SPEC-24.1 — the nightly balances = Σ ledger assertion riding the same job. */
  readonly balances: { ok: boolean; accountsChecked: number; divergences: number };
}

/** The nightly reconciliation: report → match by request id → user-favourable refunds → >2% alert →
 *  estimator recalibration → the balances assertion. A missing reportSource is a logged skip, never
 *  a crash; a bound-but-DENIED key (401/403) degrades the same way — recorded + paged, assertion
 *  still runs (R6OPS.1). A non-denial fetch fault stays a job failure (pg-boss retries transients). */
export async function handleUsageReconcile(deps: WorkerBillingDeps): Promise<UsageReconcileResult> {
  const alert: AlertSink =
    deps.alert ?? ((a) => console.error("[worker] billing alert:", JSON.stringify(a)));

  let report: ReconcileResult | null = null;
  let window: ReconcileWindowResult | null = null;
  let reportError: string | null = null;
  if (deps.reportSource) {
    let usageReport: ProviderUsageReport | null = null;
    try {
      usageReport = await deps.reportSource.fetch();
    } catch (err) {
      // R6OPS.1 — a bound-but-DENIED admin key (401/403) is the same class as the boot placeholder
      // guard: the credential can't pull the report tonight. Degrade honestly — record + page the
      // denial, and still run the REQ-SPEC-24.1 balances assertion (a denied key must never eat the
      // nightly invariant — the prod defect had the job failing BEFORE assertBalances for 7+ days).
      // Any OTHER fetch fault (5xx, network, a shape error) stays a job failure so pg-boss retries
      // transients loudly rather than paging on a blip.
      if (err instanceof ProviderReportFetchError && (err.status === 401 || err.status === 403)) {
        reportError = err.message;
        console.error(
          `[worker] usage.reconcile: ${err.message} — report/window arms skipped (admin key denied upstream); balances still asserted`,
        );
        await alert({
          kind: "report_fetch_denied",
          reportKey: "provider-report", // no report exists to key — the fetch itself was refused
          detail: err.message,
        });
      } else {
        throw err;
      }
    }
    if (usageReport) {
      // The window arm first: Anthropic's Usage & Cost API serves ONLY aggregate buckets — no
      // per-request rows — so `window` is the real reconcile and `rows` stays empty there. The
      // request-id arm runs whenever a provider DOES emit rows (the seam is provider-generic).
      const w = usageReport.window;
      if (w) {
        window = await reconcileProviderWindow(
          deps.systemExec,
          { alert },
          { ...usageReport, window: w },
        );
      }
      if (usageReport.rows.length > 0) {
        report = await reconcileProviderReport(
          deps.systemExec,
          {
            ids: deps.ids,
            clock: deps.clock,
            ledger: deps.ledger,
            runTx: (workspaceId, fn) => deps.txRunner.run(workspaceId, fn),
            eventWriter: deps.eventWriter,
            alert,
            ...(deps.recalibrate ? { recalibrate: deps.recalibrate } : {}),
          },
          usageReport,
        );
      }
    }
  } else {
    console.error(
      "[worker] usage.reconcile: no provider report source configured — skipping (deploy leg)",
    );
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
    window,
    reportError,
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
    await deps.systemExec.query("select state, pending_delivery from runs where id = $1", [
      payload.runId,
    ])
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
      await tx.query(
        "update runs set pending_delivery = null, delivery_withheld_at = null where id = $1",
        [payload.runId],
      );
    });
    return { ok: true };
  }
  return { ok: false, withheld: res.code === "withheld", reason: res.reason };
}

export { RUN_DELIVER_JOB };

// ---- P1.16 — the billing crons (§14.2/14.3/14.6) --------------------------------------------------------

/** `billing.period-tick` — hourly: period-boundary grants, scheduled downgrades, the renewal-failure
 *  grace window (7-day warning → Free at +14d), trial expiry, and the Free-tier daily chat allowance. */
export const BILLING_PERIOD_TICK_JOB = "billing.period-tick" as const;
/** `billing.auto-reload` — hourly: the opt-in auto-reload sweep (REQ-BILL-17). */
export const BILLING_AUTO_RELOAD_JOB = "billing.auto-reload" as const;
/** `billing.estimator-refit` — weekly: the REQ-BILL-7 cap-multiplier re-fit. */
export const BILLING_REFIT_JOB = "billing.estimator-refit" as const;

export interface WorkerFullBillingDeps extends WorkerBillingDeps {
  /** the Stripe port auto-reload charges through (unset ⇒ the sweep is a logged skip — never a fake charge). */
  readonly stripe?: StripePort;
  /**
   * ECON.1 admissibility cutovers (ticket §4): `calibrationPresetCutover` = the §6.5 conformance
   * deploy's timestamp (pre-cutover runs are evidence, never cap-fit input); `calibrationResearchAfter`
   * = RES.1's research-restore deploy timestamp (research-bearing runs ended earlier are
   * `pre_res1_research`). Both optional — unset ⇒ the predicate does not fire.
   */
  readonly calibrationPresetCutover?: Date;
  readonly calibrationResearchAfter?: Date;
}

export async function handleBillingPeriodTick(
  deps: WorkerFullBillingDeps,
): Promise<
  PeriodTickResult & { expiredTrials: number; trialSpend: { day: string; paused: boolean } }
> {
  const now = deps.clock.now();
  const subDeps: SubDeps = {
    ids: deps.ids,
    clock: deps.clock,
    runTx: (workspaceId, fn) => deps.txRunner.run(workspaceId, fn),
    notify: async (p: {
      type: "trial_payment";
      workspaceId: string;
      userId?: string;
      billingAccountId?: string;
      reason: string;
    }) => {
      await deps.queue.send(NOTIFY_QUEUE, p, {
        singletonKey: `notify:billing:${p.billingAccountId}:${p.reason.slice(0, 40)}`,
      });
    },
  };
  const tick = await runBillingPeriodTick(deps.systemExec, subDeps, now);
  const trials = await sweepExpiredTrials(deps.systemExec, subDeps, now);
  // ACT.1 — the reconciled daily trial-COGS tally rides this system-pool sweep (REQ-SPEC-30: the
  // aggregate read never serves a user request). On a `$50/day` trip the kill switch pauses new
  // unlocks until UTC rollover; a trip alerts through the same sink the reconcile uses.
  const trialSpend = await sweepTrialSpend(deps.systemExec, now);
  if (trialSpend.paused) {
    const alert: AlertSink =
      deps.alert ?? ((a) => console.error("[worker] billing alert:", JSON.stringify(a)));
    await alert({
      kind: "trial_daily_ceiling",
      reportKey: `trial-spend:${trialSpend.day}`,
      detail: JSON.stringify({
        day: trialSpend.day,
        projectedCredits: trialSpend.projectedCredits,
        reconciledCredits: trialSpend.reconciledCredits,
      }),
    });
  }
  return {
    ...tick,
    expiredTrials: trials.expired,
    trialSpend: { day: trialSpend.day, paused: trialSpend.paused },
  };
}

export async function handleAutoReloadSweep(deps: WorkerFullBillingDeps): Promise<unknown> {
  // The ONLY unattended charge path (§14.2): without a live Stripe port the sweep refuses to run — a
  // no-port sweep must never fabricate a charge (HUMAN-H6; the live binding is the Stage-B leg).
  if (!deps.stripe) {
    console.error(
      "[worker] billing.auto-reload: no Stripe port — skipping (live binding is Stage B)",
    );
    return { skipped: "no_stripe_port" };
  }
  const stripe = deps.stripe;
  return sweepAutoReload(
    deps.systemExec,
    {
      ids: deps.ids,
      clock: deps.clock,
      stripe,
      runTx: (workspaceId, fn) => deps.txRunner.run(workspaceId, fn),
      notify: async (p) => {
        await deps.queue.send(NOTIFY_QUEUE, p, {
          singletonKey: `notify:autoreload:${p.workspaceId}:${p.reason.slice(0, 40)}`,
        });
      },
    },
    deps.clock.now(),
  );
}

export async function handleEstimatorRefit(deps: WorkerFullBillingDeps): Promise<unknown> {
  const now = deps.clock.now();
  const global_ = await weeklyEstimatorRefit(
    deps.systemExec,
    { ids: deps.ids, clock: deps.clock },
    now,
  );
  // ECON.1 — the durable calibration loop rides the same weekly job: harvest the trailing metered legs
  // into cost_observations, recompute the cost-card cells, and write the per-bucket cap reports (the
  // REQ-BILL-7 1.5→1.35 refit, floor 1.25, breaker 2× runtime-preserved; the ≤10% in-sample cap-reach
  // the report row asserts). `researchWorkflows` comes from the manifests (any research-class phase) so
  // the RES.1 cutover predicate only gates the workflows research actually touches.
  const researchWorkflows = Object.values(WORKFLOW_MANIFESTS)
    .filter((m) => m.phases.some((p) => p.phaseClass === "research"))
    .map((m) => m.workflow);
  const harvested = await harvestCostObservations(deps.systemExec, deps.ids, {
    source: "production",
    researchWorkflows,
    ...(deps.calibrationPresetCutover ? { presetCutover: deps.calibrationPresetCutover } : {}),
    ...(deps.calibrationResearchAfter ? { researchAfter: deps.calibrationResearchAfter } : {}),
  });
  const cells = await recomputeCostCards(
    deps.systemExec,
    `econ1@${now.toISOString().slice(0, 10)}`,
    now,
  );
  const reports = await refitCapMultipliers(deps.systemExec, { ids: deps.ids }, now);
  return { global: global_, calibration: { harvested, cells, buckets: reports.length } };
}
