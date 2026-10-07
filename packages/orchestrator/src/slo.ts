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

// JOURNEY.1 (REQ-SPEC-29; ADR-020) — flagged test tenants never count toward SLOs: every probe over a
// workspace-keyed table applies this NOT-EXISTS fragment (`workspaces.is_test`, migration 0046). For a
// table reachable only through `runs` (gates, fetch_log), wrap it: `not exists (select 1 from runs r
// where r.id = <fk> and ${TEST_TENANT_FREE("r")})` — see the probes below.
const TEST_TENANT_FREE = (rel: string) =>
  `not exists (select 1 from workspaces w where w.id = ${rel}.workspace_id and w.is_test)`;
/** Row-level exclusion for a fk into `runs` (the row is test-tenant traffic iff its run's ws is flagged). */
const NOT_FROM_TEST_RUN = (fk: string) =>
  `not exists (select 1 from runs r join workspaces w on w.id = r.workspace_id
     where r.id = ${fk} and w.is_test)`;

export const SLO_SIGNALS: readonly SloSignalDef[] = [
  {
    key: "run_start_latency_p95_s",
    target: "run start latency (queued → running) p95 ≤ 45 s — alert p95 > 90 s for 10 min",
    comparator: "gt",
    threshold: 90,
    probe: `select percentile_cont(0.95) within group (order by extract(epoch from (started_at - created_at)))
              from runs where started_at > now() - ${MIN} * 60 and ${TEST_TENANT_FREE("runs")}`,
  },
  {
    key: "run_success_rate_24h_pct",
    target: "run success rate (excl. user cancels), weekly ≥ 97% — alert < 95% daily window",
    comparator: "lt",
    threshold: 95,
    probe: `select 100.0 * count(*) filter (where state = 'completed') / nullif(count(*), 0)
              from runs where ended_at > now() - interval '24 hours'
                and state in ('completed', 'failed') and ${TEST_TENANT_FREE("runs")}`,
  },
  {
    key: "gate_resume_latency_p95_s",
    target: "gate resume latency p95 ≤ 60 s — alert > 120 s",
    comparator: "gt",
    threshold: 120,
    probe: `select percentile_cont(0.95) within group (order by extract(epoch from (resolved_at - opened_at)))
              from gates where resolved_at > now() - interval '24 hours'
                and ${NOT_FROM_TEST_RUN("gates.run_id")}`,
  },
  {
    key: "orphaned_runs",
    target: "orphaned runs = 0 — alert > 0 for 10 min (a lingering orphan means the reaper didn't clear it)",
    comparator: "gt",
    threshold: 0,
    probe: `select count(*) from runs where state = 'orphaned' and state_since > now() - interval '10 minutes'
              and ${TEST_TENANT_FREE("runs")}`,
  },
  {
    key: "mirror_errors_10m",
    // §13.5's "mirror errors = 0" reads delivery-side failures: delivery-validation rejects and engine-step
    // failures both surface on the internal `engine.error` event channel (internal-api.ts).
    target: "mirror/delivery errors = 0 — alert > 0 (engine.error + boundary.violation internal events)",
    comparator: "gt",
    threshold: 0,
    probe: `select count(*) from run_events_internal
             where type in ('engine.error', 'boundary.violation') and at > now() - interval '10 minutes'
               and ${TEST_TENANT_FREE("run_events_internal")}`,
  },
  {
    key: "egress_denied_10m",
    target: "egress denied ≈ 0 — alert on a spike (any denial in the window)",
    comparator: "gt",
    threshold: 0,
    probe: `select count(*) from fetch_log where decision = 'deny' and ts > now() - interval '10 minutes'
              and ${NOT_FROM_TEST_RUN("fetch_log.run_id")}`,
  },
  {
    key: "provider_429_5xx_pct_5m",
    target: "provider 429/5xx < 1% — alert > 5% for 5 min (outage banner; launches paused ≤ 2 h)",
    comparator: "gt",
    threshold: 5,
    probe: `select 100.0 * count(*) filter (where status = 429 or status >= 500) / nullif(count(*), 0)
              from fetch_log where decision = 'allow' and ts > now() - interval '5 minutes'
                and ${NOT_FROM_TEST_RUN("fetch_log.run_id")}`,
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
                 and ${TEST_TENANT_FREE("usage_records")}
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
              from credit_ledger where at > now() - interval '24 hours'
                and ${TEST_TENANT_FREE("credit_ledger")}`,
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
    // STB.2 / D-P0.08b-3 — `slo_samples.event_delivery_ms`: the SSE tail writes one row per flush
    // batch (max append→flush ms). The server-side half of delivery latency — the socket→render hop
    // is unmeasurable without a client ack (D-P1.22-1 keeps that caveat honest in the target text).
    // slo_samples.workspace_id is nullable — NULL rows (platform-level samples) always count.
    probe: `select percentile_cont(0.95) within group (order by value_ms) / 1000.0
             from slo_samples where signal = 'event_delivery_ms' and at > now() - ${MIN} * 10
               and (workspace_id is null or ${TEST_TENANT_FREE("slo_samples")})`,
  },
  {
    key: "autosave_roundtrip_p95_ms",
    target: "autosave round-trip p95 ≤ 500 ms — alert > 1 s",
    comparator: "gt",
    threshold: 1, // seconds
    // STB.2 / D-P1.22-1 — `slo_samples.autosave_save_ms`: the api's SERVER-side save duration for the
    // debounced autosave POST. The client leg of the round-trip (network + render) is not measured —
    // the probe answers "server save p95", the honest measurable component.
    probe: `select percentile_cont(0.95) within group (order by value_ms) / 1000.0
             from slo_samples where signal = 'autosave_save_ms' and at > now() - ${MIN} * 10
               and (workspace_id is null or ${TEST_TENANT_FREE("slo_samples")})`,
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
  readonly status: "ok" | "breach" | "empty" | "unmeasured" | "error";
  readonly unmeasuredReason?: string;
  /** a probe that threw (e.g. its table isn't migrated yet on a partial deploy) — never fatal. */
  readonly error?: string;
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
    // A throwing probe (a signal table not yet migrated on a partial deploy) degrades to `error` —
    // it must never kill the sweep's remaining signals.
    const res = await system.query(sig.probe, []).catch((e: unknown) => {
      readings.push({
        key: sig.key,
        target: sig.target,
        value: null,
        threshold: sig.threshold,
        comparator: sig.comparator,
        status: "error",
        error: e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200),
      });
      return null;
    });
    if (!res) continue;
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
