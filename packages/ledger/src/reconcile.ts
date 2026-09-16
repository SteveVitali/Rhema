// The nightly `usage.reconcile` job (REQ-BILL-13; REQ-ARCH-35 amended; §12.7 cross-check 2 — the record of
// account). Each night the provider's Usage & Cost report is matched against the proxy's meter-of-record rows
// by REQUEST ID (`usage_records.provider_request_id`): a `provider_report` row lands per matched request
// (idempotent — the partial unique index dedupes a re-run), the run's drift is computed, and the ledger
// adjusts ONLY in the user's favour — a provider total LOWER than the metered charge silently refunds the
// difference ("reconciliation drift (silent refund)", §14.6); a provider total HIGHER is platform-eaten, never
// a charge. Fleet drift past 2% pages on-call via the injected `alert` seam, and each reconciled run feeds
// the estimator-recalibration seam (the measured-vs-modeled fold; REQ-ARCH-35).

import type { SqlClient, EventWriter } from "@rhema/orchestrator";
import type { HoldLedger } from "@rhema/orchestrator";
import type { EntryDeps } from "./entries.js";

/** One row of the provider's Usage & Cost report (the Anthropic cost report shape, normalized). */
export interface ProviderReportRow {
  /** the provider's per-request id — matched against `usage_records.provider_request_id`. */
  readonly requestId: string;
  /** the provider's reported list cost for that request, USD. */
  readonly listCostUsd: number;
}

export interface ProviderUsageReport {
  readonly provider: string;
  /** the report's identity (e.g. the report date) — the idempotency anchor for refunds. */
  readonly reportKey: string;
  readonly asOf?: Date;
  readonly rows: readonly ProviderReportRow[];
}

/** platform credits per USD — the 1.4 rate at the $0.01 peg (§14.1). */
const CREDITS_PER_USD = 140;

/** What the recalibration seam receives per reconciled run (the estimator's InstrumentedMeasurement shape,
 *  plus the workflow the fold lands on). The worker binds this to `recordInstrumentedFold` (@rhema/protocols). */
export interface ReconcileMeasurement {
  readonly runId: string;
  readonly workflow: string;
  readonly tier: string;
  readonly rigor: string;
  readonly inputs: { readonly words?: number; readonly claims?: number };
  /** the run's measured platform credits from the PROVIDER report (reportUsd × 140). */
  readonly measuredCredits: number;
  readonly measuredAt: Date;
}

export interface ReconcileAlert {
  readonly kind: "usage_drift" | "balance_divergence";
  readonly reportKey: string;
  readonly driftPct?: number;
  readonly proxyUsd?: number;
  readonly reportUsd?: number;
  readonly detail?: string;
}

export interface ReconcileDeps extends EntryDeps {
  readonly ledger: Pick<HoldLedger, "refund">;
  /** open a tenant-scoped tx for a workspace (refunds + report rows are tenant-keyed). */
  readonly runTx: (workspaceId: string, fn: (tx: SqlClient) => Promise<void>) => Promise<void>;
  /** the >2%-drift on-call page (the deploy binds the ops sink). */
  readonly alert: (a: ReconcileAlert) => void | Promise<void>;
  /** run.state-adjacent facts (cost.refunded) ride the run's event stream. */
  readonly eventWriter: EventWriter;
  /** the estimator recalibration seam — called once per reconciled run with measured-vs-modeled facts. */
  readonly recalibrate?: (m: ReconcileMeasurement) => void | Promise<void>;
}

export interface ReconcileRefund {
  readonly runId: string;
  readonly credits: number;
}

export interface ReconcileResult {
  /** provider rows matched to a proxy row (the request-id join). */
  readonly matched: number;
  /** provider rows with NO proxy row — a metering hole (the proxy never wrote the request). */
  readonly unmatchedReportRows: number;
  /** proxy rows never reconciled by ANY report row so far. */
  readonly pendingProxyRows: number;
  readonly proxyUsd: number;
  readonly reportUsd: number;
  /** signed (report − proxy)/proxy — positive means the platform undercharged (never billed on). */
  readonly driftPct: number;
  /** user-favourable refunds written (report < proxy). */
  readonly refunds: readonly ReconcileRefund[];
  readonly alerted: boolean;
  /** run ids handed to the recalibration seam. */
  readonly recalibrated: readonly string[];
}

/**
 * Reconcile one provider Usage & Cost report. Reads proxy rows system-wide (the report is not tenant-scoped),
 * writes `provider_report` rows + refunds inside each run's own tenant transaction. Re-running the same
 * `reportKey` is a no-op (provider-report rows dedupe on the request id; refunds dedupe on `reconcile:<run>:<key>`).
 */
export async function reconcileProviderReport(
  exec: SqlClient,
  deps: ReconcileDeps,
  report: ProviderUsageReport,
): Promise<ReconcileResult> {
  const asOf = report.asOf ?? deps.clock.now();

  interface ProxyRow {
    id: string;
    workspace_id: string;
    billing_account_id: string;
    user_id: string | null;
    project_id: string | null;
    persona_id: string | null;
    run_id: string;
    attempt: number;
    step_id: string | null;
    role: string;
    agent_instance_id: string | null;
    subagent_label: string | null;
    provider: string;
    model: string;
    model_tier: string;
    rate_table_version: number;
    input_tokens: number | null;
    cache_write_tokens: number | null;
    cache_read_tokens: number | null;
    output_tokens: number | null;
    searches: number | null;
    fetches: number | null;
    list_cost_usd: number | string;
  }

  // ---- match report rows to proxy rows by request id; write provider_report rows ------------------------
  interface RunBucket {
    workspaceId: string;
    billingAccountId: string;
    proxyUsd: number;
    reportUsd: number;
  }
  const byRun = new Map<string, RunBucket>();
  let matched = 0;
  let unmatchedReportRows = 0;

  for (const r of report.rows) {
    const proxy = (
      await exec.query(
        `select * from usage_records where provider_request_id = $1 and source = 'proxy' order by ts limit 1`,
        [r.requestId],
      )
    ).rows[0] as ProxyRow | undefined;
    if (!proxy) {
      unmatchedReportRows++;
      continue;
    }
    matched++;

    const bucket = byRun.get(proxy.run_id) ?? {
      workspaceId: proxy.workspace_id,
      billingAccountId: proxy.billing_account_id,
      proxyUsd: 0,
      reportUsd: 0,
    };
    bucket.proxyUsd += Number(proxy.list_cost_usd);
    bucket.reportUsd += r.listCostUsd;
    byRun.set(proxy.run_id, bucket);

    // the provider_report row of record — idempotent on the request id (0020's partial unique index).
    await deps.runTx(proxy.workspace_id, async (tx) => {
      await tx.query(
        `insert into usage_records
           (id, ts, workspace_id, billing_account_id, user_id, project_id, persona_id, run_id, attempt,
            step_id, role, agent_instance_id, subagent_label, provider, model, model_tier, rate_table_version,
            input_tokens, cache_write_tokens, cache_read_tokens, output_tokens, searches, fetches,
            list_cost_usd, credits, source, reconciled, provider_request_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,
                 'provider_report', true, $26)
         on conflict (provider_request_id) where source = 'provider_report' do nothing`,
        [
          deps.ids("urep"),
          asOf,
          proxy.workspace_id,
          proxy.billing_account_id,
          proxy.user_id,
          proxy.project_id,
          proxy.persona_id,
          proxy.run_id,
          proxy.attempt,
          proxy.step_id,
          proxy.role,
          proxy.agent_instance_id,
          proxy.subagent_label,
          report.provider,
          proxy.model,
          proxy.model_tier,
          proxy.rate_table_version,
          proxy.input_tokens,
          proxy.cache_write_tokens,
          proxy.cache_read_tokens,
          proxy.output_tokens,
          proxy.searches,
          proxy.fetches,
          r.listCostUsd,
          Math.round(r.listCostUsd * CREDITS_PER_USD),
          r.requestId,
        ],
      );
      await tx.query("update usage_records set reconciled = true where id = $1", [proxy.id]);
    });
  }

  // ---- per-run drift → user-favourable refunds only -----------------------------------------------------
  const refunds: ReconcileRefund[] = [];
  const recalibrated: string[] = [];
  for (const [runId, b] of byRun) {
    const diffUsd = b.proxyUsd - b.reportUsd; // > 0 ⇒ the user was overcharged vs the provider report
    if (diffUsd > 0) {
      const credits = Math.floor(diffUsd * CREDITS_PER_USD);
      if (credits > 0) {
        await deps.runTx(b.workspaceId, async (tx) => {
          const res = await deps.ledger.refund(tx, {
            billingAccountId: b.billingAccountId,
            workspaceId: b.workspaceId,
            runId,
            credits,
            idempotencyKey: `reconcile:${runId}:${report.reportKey}`,
          });
          if (res.ledgerId) {
            await deps.eventWriter.append(tx, {
              runId,
              type: "cost.refunded",
              payload: { credits, reason: "reconcile_drift" },
              at: deps.clock.now(),
            });
          }
        });
        refunds.push({ runId, credits });
      }
    }
    // else: the provider reports MORE than we charged — absorbed by the platform, never debited (REQ-BILL-13).

    // the estimator recalibration fold: the run's provider-measured credits vs its frozen estimate inputs.
    if (deps.recalibrate && b.reportUsd > 0) {
      const runRow = (
        await exec.query(
          "select workflow, rigor, model_tier, input_snapshot from runs where id = $1",
          [runId],
        )
      ).rows[0] as
        | { workflow: string; rigor: string; model_tier: string; input_snapshot: Record<string, unknown> | string | null }
        | undefined;
      if (runRow) {
        const snap =
          typeof runRow.input_snapshot === "string"
            ? (JSON.parse(runRow.input_snapshot) as Record<string, unknown>)
            : (runRow.input_snapshot ?? {});
        await deps.recalibrate({
          runId,
          workflow: runRow.workflow,
          tier: runRow.model_tier,
          rigor: runRow.rigor,
          inputs: {
            ...(typeof snap["wordCount"] === "number" ? { words: snap["wordCount"] as number } : {}),
            ...(typeof snap["claimCount"] === "number" ? { claims: snap["claimCount"] as number } : {}),
          },
          measuredCredits: Math.round(b.reportUsd * CREDITS_PER_USD),
          measuredAt: asOf,
        });
        recalibrated.push(runId);
      }
    }
  }

  // ---- fleet drift → the >2% alert (REQ-BILL-13) --------------------------------------------------------
  const proxyUsd = [...byRun.values()].reduce((s, b) => s + b.proxyUsd, 0);
  const reportUsd = [...byRun.values()].reduce((s, b) => s + b.reportUsd, 0);
  const driftPct = proxyUsd > 0 ? (reportUsd - proxyUsd) / proxyUsd : 0;
  let alerted = false;
  if (Math.abs(driftPct) > 0.02) {
    await deps.alert({ kind: "usage_drift", reportKey: report.reportKey, driftPct, proxyUsd, reportUsd });
    alerted = true;
  }

  const pendingProxyRows = Number(
    (
      (
        await exec.query(
          "select count(*)::int as n from usage_records where source = 'proxy' and provider_request_id is not null and reconciled is not true",
        )
      ).rows[0] as { n: number }
    ).n,
  );

  return { matched, unmatchedReportRows, pendingProxyRows, proxyUsd, reportUsd, driftPct, refunds, alerted, recalibrated };
}
