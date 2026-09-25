// The §13.5 SLO probe (P1.22 W9; REQ-ARCH-34). One registry entry per row of the §13.5 SLO table; each
// carries the target text, the alert threshold, and — where the signal is measurable from our own tables —
// a SQL probe that runs on the worker's SYSTEM executor (BYPASSRLS; these are cross-tenant platform
// signals, never tenant data — the payloads are counts and percentiles only).
//
// Three honest outcomes per signal:
//   • `probed`    — a SQL reading exists this sweep;
//   • `measured_elsewhere` — an existing path already alerts (cost drift → usage.reconcile's alertSink);
//   • `unmeasured` — named gap (no Stage-A data path); recorded in the §17 readout, never fabricated.
//
// The worker's `slo.probe` job (5-minute sweep) runs `probeSlos`, logs one structured `[slo]` line per
// breach (the log-based metric `rhema_slo_violations` in infra/pulumi/monitoring.ts keys on it), and pages
// the ops webhook. REQ-ARCH-34's weekly-review/breach-pauses-feature-work rule lives in
// docs/ops/slo-review.md.

import type { SqlClient } from "./tx.js";

export interface SloSignalDef {
  /** stable key — the alert policy + the `[slo]` log line carry it. */
  readonly key: string;
  /** the §13.5 target, verbatim-ish. */
  readonly target: string;
  /** breach when `value > threshold` (gt) or `value < threshold` (lt); null-valued probes never breach. */
  readonly comparator: "gt" | "lt";
  readonly threshold: number;
  /** SQL returning one numeric value (scalar first column of the first row), or absent for unmeasured rows. */
  readonly probe?: string;
  /** Why there is no probe — required when probe is absent (the honest-gap record). */
  readonly unmeasuredReason?: string;
}

const MIN = "interval '1 minute'";

export const SLO_SIGNALS: readonly SloSignalDef[] = [
  {
    key: "run_start_latency_p95_s",
    target: "run start latency (queued → running) p95 ≤ 45 s — alert p95 > 90 s for 10 min",
    comparator: "gt",
    threshold: 90,
    probe: `select percentile_cont(0.95) within group (order by extract(epoch from (started_at - created_at)))
              from runs where started_at > now() - ${MIN} * 60`,
  },
  {
    key: "run_success_rate_24h_pct",
    target: "run success rate (excl. user cancels), weekly ≥ 97% — alert < 95% daily window",
    comparator: "lt",
    threshold: 95,
    probe: `select 100.0 * count(*) filter (where state = 'completed') / nullif(count(*), 0)
              from runs where ended_at > now() - interval '24 hours'
                and state in ('completed', 'failed')`,
  },
  {
    key: "gate_resume_latency_p95_s",
    target: "gate resume latency p95 ≤ 60 s — alert > 120 s",
    comparator: "gt",
    threshold: 120,
    probe: `select percentile_cont(0.95) within group (order by extract(epoch from (resolved_at - opened_at)))
              from gates where resolved_at > now() - interval '24 hours'`,
  },
  {
    key: "orphaned_runs",
    target: "orphaned runs = 0 — alert > 0 for 10 min (a lingering orphan means the reaper didn't clear it)",
    comparator: "gt",
    threshold: 0,
    probe: `select count(*) from runs where state = 'orphaned' and state_since > now() - interval '10 minutes'`,
  },
  {
    key: "mirror_errors_10m",
    // §13.5's "mirror errors = 0" reads delivery-side failures: delivery-validation rejects and engine-step
    // failures both surface on the internal `engine.error` event channel (internal-api.ts).
    target: "mirror/delivery errors = 0 — alert > 0 (engine.error + boundary.violation internal events)",
    comparator: "gt",
    threshold: 0,
    probe: `select count(*) from run_events_internal
             where type in ('engine.error', 'boundary.violation') and at > now() - interval '10 minutes'`,
  },
  {
    key: "egress_denied_10m",
    target: "egress denied ≈ 0 — alert on a spike (any denial in the window)",
    comparator: "gt",
    threshold: 0,
    probe: `select count(*) from fetch_log where decision = 'deny' and ts > now() - interval '10 minutes'`,
  },
  {
    key: "provider_429_5xx_pct_5m",
    target: "provider 429/5xx < 1% — alert > 5% for 5 min (outage banner; launches paused ≤ 2 h)",
    comparator: "gt",
    threshold: 5,
    probe: `select 100.0 * count(*) filter (where status = 429 or status >= 500) / nullif(count(*), 0)
              from fetch_log where decision = 'allow' and ts > now() - interval '5 minutes'`,
  },
  {
    key: "proxy_vs_sdk_cost_runs_over5pct_1h",
    target: "proxy-metered vs SDK-reported cost per run ± 2% — alert on any run > 5%",
    comparator: "gt",
    threshold: 0,
    probe: `select count(*) from (
              select run_id,
                     sum(list_cost_usd) filter (where source = 'proxy') as proxy_usd,
                     sum(list_cost_usd) filter (where source = 'sdk_estimate') as sdk_usd
                from usage_records
               where ts > now() - interval '1 hour' and source in ('proxy', 'sdk_estimate')
               group by run_id
              having sum(list_cost_usd) filter (where source = 'proxy') > 0
                 and sum(list_cost_usd) filter (where source = 'sdk_estimate') > 0
                 and abs(sum(list_cost_usd) filter (where source = 'sdk_estimate')
                       - sum(list_cost_usd) filter (where source = 'proxy'))
                     / sum(list_cost_usd) filter (where source = 'proxy') > 0.05
            ) divergent`,
  },
  {
    key: "absorbed_adjustments_pct_24h",
    // §13.5: absorbed cap adjustments < X% of gross usage (X set from the reserve) — the circuit breaker's
    // 5% trip is the standing X (packages/ledger/src/circuit-breaker.ts).
    target: "absorbed cap adjustments < 5% of gross usage over 24 h — alert above (circuit-breaker floor)",
    comparator: "gt",
    threshold: 5,
    probe: `select 100.0 *
                   coalesce(sum(case when kind = 'adjustment' and reason = 'absorbed' then credits else 0 end), 0)
                   / nullif(coalesce(sum(case when kind = 'debit' then credits
                                             when kind = 'adjustment' and reason = 'absorbed' then credits else 0 end), 0), 0)
              from credit_ledger where at > now() - interval '24 hours'`,
  },
  {
    key: "cost_drift_pct_nightly",
    target: "cost drift vs provider report < 2% — alert > 2% nightly",
    comparator: "gt",
    threshold: 2,
    unmeasuredReason:
      "measured_elsewhere: usage.reconcile (nightly) already computes the drift and pages through the " +
      "worker alertSink on >2% — a second probe here would double-page",
  },
  {
    key: "event_delivery_latency_p95_s",
    target: "event delivery latency p95 ≤ 2 s — alert > 5 s",
    comparator: "gt",
    threshold: 5,
    unmeasuredReason:
      "needs a delivery timestamp the schema doesn't carry (event `at` is write time; the SSE replay has no " +
      "client-ack). Instrumentation row D-P1.22-1; not fabricated here",
  },
  {
    key: "autosave_roundtrip_p95_ms",
    target: "autosave round-trip p95 ≤ 500 ms — alert > 1 s",
    comparator: "gt",
    threshold: 1, // seconds
    unmeasuredReason:
      "client-side round-trip; no server-visible per-save timing today. Instrumentation row D-P1.22-1",
  },
  {
    key: "api_availability_monthly_pct",
    target: "API availability 99.9% monthly — alert on error-budget burn > 2×",
    comparator: "lt",
    threshold: 99.9,
    unmeasuredReason:
      "measured by Cloud Monitoring's request-based SLI on the api Cloud Run service — the IaC Slo/AlertPolicy " +
      "(infra/pulumi/monitoring.ts) is the record, not a DB probe",
  },
];

export interface SloReading {
  readonly key: string;
  readonly target: string;
  /** measured value this sweep; null for a null probe result or an unmeasured signal. */
  readonly value: number | null;
  readonly threshold: number;
  readonly comparator: "gt" | "lt";
  readonly status: "ok" | "breach" | "empty" | "unmeasured";
  readonly unmeasuredReason?: string;
}

/**
 * Run every probed SLO signal once. A signal whose probe returns no rows or NULL reads `empty` (no data in
 * the window — never a breach, never fabricated). Unmeasured signals read `unmeasured` with the reason.
 */
export async function probeSlos(system: SqlClient): Promise<SloReading[]> {
  const readings: SloReading[] = [];
  for (const sig of SLO_SIGNALS) {
    if (!sig.probe) {
      readings.push({
        key: sig.key,
        target: sig.target,
        value: null,
        threshold: sig.threshold,
        comparator: sig.comparator,
        status: "unmeasured",
        ...(sig.unmeasuredReason ? { unmeasuredReason: sig.unmeasuredReason } : {}),
      });
      continue;
    }
    const res = await system.query(sig.probe, []);
    const raw = res.rows[0] ? Object.values(res.rows[0] as Record<string, unknown>)[0] : null;
    const value = raw === null || raw === undefined ? null : Number(raw);
    if (value === null || Number.isNaN(value)) {
      readings.push({ key: sig.key, target: sig.target, value: null, threshold: sig.threshold, comparator: sig.comparator, status: "empty" });
      continue;
    }
    const breached = sig.comparator === "gt" ? value > sig.threshold : value < sig.threshold;
    readings.push({ key: sig.key, target: sig.target, value, threshold: sig.threshold, comparator: sig.comparator, status: breached ? "breach" : "ok" });
  }
  return readings;
}
