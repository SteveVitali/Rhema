// The §13.5 SLO probe (P1.22 W9; REQ-ARCH-34). One registry entry per row of the §13.5 SLO table; each
// carries the target text, the alert threshold, and — where the signal is measurable from our own tables —
// a SQL probe that runs on the worker's SYSTEM executor (BYPASSRLS; these are cross-tenant platform
// signals, never tenant data — the payloads are counts and percentiles only).
//
// Honest outcomes per signal (the `SloReading.status` enum):
//   • `ok` / `breach` — a SQL reading exists this sweep and clears/breaks the alert threshold;
//   • `empty`    — the probe ran and returned no value (no data in the window; never fabricated);
//   • `error`    — the probe threw (a not-yet-migrated table on a partial deploy); never fatal;
//   • `unmeasured` — named gap (no Stage-A data path, or measured elsewhere like cost drift →
//     usage.reconcile's alertSink); recorded in the weekly review, never fabricated.
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
  /** The REQ-ARCH-34 weekly-review variant: the same signal read over a 7-day window (SLO.1). Absent
   *  means the alert-window probe is already the honest weekly reading (point-in-time signals and
   *  signals whose window is already 7d reuse `probe`). */
  readonly weeklyProbe?: string;
  /** Why there is no probe — required when probe is absent (the honest-gap record). */
  readonly unmeasuredReason?: string;
}

const MIN = "interval '1 minute'";
const WEEK = "interval '7 days'";

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

// SLO.1 — the per-episode `queued → running` latency, paired from the `run.state_changed` event stream.
// `runs.started_at` is overwritten on EVERY `provisioning → running` heartbeat (internal-api.ts), so the
// pre-SLO.1 probe (`started_at − created_at`) folded every gate wait and resume into "start latency".
// Here each `to='running'` event joins its own latest preceding `to='queued'` event — the first start's
// `created → queued`, a resume's `waiting_gate → queued`, a reaper requeue's `orphaned → queued` — so
// each episode is measured from its own enqueue, and a run that sat parked for a day still reports only
// the seconds of its actual relaunch.
const RUN_START_EPISODES = (win: string) => `select percentile_cont(0.95) within group (order by start_s)
    from (
      select extract(epoch from (re.at - q.at)) as start_s
        from run_events re
        join lateral (
          select e.at from run_events e
           where e.run_id = re.run_id and e.type = 'run.state_changed'
             and e.payload->>'to' = 'queued' and e.at <= re.at
           order by e.at desc limit 1
        ) q on true
       where re.type = 'run.state_changed' and re.payload->>'to' = 'running'
         and re.at > now() - ${win}
         and ${NOT_FROM_TEST_RUN("re.run_id")}
    ) starts`;

// SLO.1 — §13.5's success denominator is "completed + failed + system-cancelled": only USER cancels
// leave the rate. The cancel reason rides the terminal `run.state_changed{to:'cancelled'}` event, and
// the user-side reasons — `stop` (user stop / park-sweep abandonment), `declined` (consent refused),
// `expired` (the gate's deadline passed unanswered — user abandonment), `cancel_to_edit` (cancelled to
// edit inputs) — are enumerated explicitly so a NEW or MISSING reason (e.g. `chargeback`, an
// administrative cancel, a reasonless row) lands in the denominator as a system cancel rather than
// silently dropping out. `completed_partial` is neither completed nor a failure class — the user
// accepted a partial dossier — so it stays out of both sides of the fraction.
const SUCCESS_RATE = (win: string) => `select 100.0 * count(*) filter (where r.state = 'completed'
        and (r.delivery ->> 'label') is distinct from 'unverified') / nullif(count(*), 0)
    from runs r
   where r.ended_at > now() - ${win}
     and (r.state in ('completed','failed')
          or (r.state = 'cancelled' and coalesce((
              select e.payload->>'reason' from run_events e
               where e.run_id = r.id and e.type = 'run.state_changed' and e.payload->>'to' = 'cancelled'
               order by e.at desc limit 1), '')
              not in ('stop','declined','expired','cancel_to_edit')))
     and ${TEST_TENANT_FREE("r")}`;

export const SLO_SIGNALS: readonly SloSignalDef[] = [
  {
    key: "run_start_latency_p95_s",
    target: "run start latency (queued → running) p95 ≤ 45 s — alert p95 > 90 s for 10 min",
    comparator: "gt",
    threshold: 90,
    probe: RUN_START_EPISODES(`${MIN} * 60`),
    weeklyProbe: RUN_START_EPISODES(WEEK),
  },
  {
    key: "run_success_rate_24h_pct",
    // RES.2 — an Unverified delivery is NOT a success: it stays in the denominator (a completed run) but
    // leaves the numerator. `isSuccessfulDelivery` is the shared predicate; the label is the persisted
    // `runs.delivery` write, so the exclusion reads it here rather than recomputing coverage.
    target: "run success rate (excl. user cancels + Unverified deliveries), weekly ≥ 97% — alert < 95% daily window",
    comparator: "lt",
    threshold: 95,
    probe: SUCCESS_RATE("interval '24 hours'"),
    weeklyProbe: SUCCESS_RATE(WEEK),
  },
  {
    key: "unverified_review_rate_7d_pct",
    // RES.2 (REQ-SPEC-31(3); ADR-015) — the weekly Review Unverified rate. >1% is a platform regression
    // (verification fetched nothing) — breach above. The denominator is completed Reviews in the window;
    // Unverified runs ARE completed, so they count on both sides of the fraction.
    target: "Review Unverified rate ≤ 1% weekly — alert above",
    comparator: "gt",
    threshold: 1,
    probe: `select 100.0 * count(*) filter (where r.delivery ->> 'label' = 'unverified') / nullif(count(*), 0)
              from runs r where r.ended_at > now() - interval '7 days'
                and r.state = 'completed' and r.workflow = 'review' and ${TEST_TENANT_FREE("r")}`,
  },
  {
    key: "gate_resume_latency_p95_s",
    // SLO.1 — §13.5's resume latency is "decision → the run running again", NOT `resolved_at − opened_at`
    // (the HUMAN's decision time — a run parked a week showed as a 7-day "resume latency"). Each resolved
    // blocking gate pairs to the next `run.state_changed{to:'running'}` at/after its `resolved_at` — the
    // resolution and the resume enqueue land in the same transaction (gate-resolution.ts), so the delta is
    // enqueue → relaunch → first heartbeat. `blocking` keeps informational resolutions (a run already
    // running) out; a resolution that ends the run (stop/expired-cancel/finalize) has no `running` to pair
    // and drops out naturally.
    target: "gate resume latency p95 ≤ 60 s — alert > 120 s",
    comparator: "gt",
    threshold: 120,
    probe: `select percentile_cont(0.95) within group (order by resume_s)
              from (
                select extract(epoch from (nx.at - g.resolved_at)) as resume_s
                  from gates g
                  join lateral (
                    select e.at from run_events e
                     where e.run_id = g.run_id and e.type = 'run.state_changed'
                       and e.payload->>'to' = 'running' and e.at >= g.resolved_at
                     order by e.at asc limit 1
                  ) nx on true
                 where g.resolved_at > now() - interval '24 hours'
                   and g.blocking
                   and ${NOT_FROM_TEST_RUN("g.run_id")}
              ) resumes`,
    weeklyProbe: `select percentile_cont(0.95) within group (order by resume_s)
              from (
                select extract(epoch from (nx.at - g.resolved_at)) as resume_s
                  from gates g
                  join lateral (
                    select e.at from run_events e
                     where e.run_id = g.run_id and e.type = 'run.state_changed'
                       and e.payload->>'to' = 'running' and e.at >= g.resolved_at
                     order by e.at asc limit 1
                  ) nx on true
                 where g.resolved_at > now() - ${WEEK}
                   and g.blocking
                   and ${NOT_FROM_TEST_RUN("g.run_id")}
              ) resumes`,
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
    // SLO.1 — §13.5's "mirror errors" row is the DELIVERY/mirror failure class: a delivery-transaction
    // validation reject (`run.state_changed{to:'failed', reason:'validation'}` — delivery.ts →
    // failRun{code:'validation'}) plus `boundary.violation` internal events (the row's third leg —
    // immutable/out-of-allowlist writes the harvest quarantines). `engine.error` is OUT: it is a
    // phase-failure record (artifact_missing / predicate hiccup / cap-402), and its TERMINAL instances
    // already land in `run_success_rate_24h_pct` via the run's failed transition — counting it here too
    // was the mis-measure that made the 2026-09-30 reading "1" unexplained. No failure class is hidden:
    // a run that dies on a phase still counts as failed in the success rate.
    target: "mirror/delivery errors = 0 — alert > 0 (delivery-validation failures + boundary.violation events)",
    comparator: "gt",
    threshold: 0,
    probe: `select (
              select count(*) from run_events e
               where e.type = 'run.state_changed' and e.payload->>'to' = 'failed'
                 and e.payload->>'reason' = 'validation' and e.at > now() - interval '10 minutes'
                 and ${NOT_FROM_TEST_RUN("e.run_id")}
            ) + (
              select count(*) from run_events_internal rei
               where rei.type = 'boundary.violation' and rei.at > now() - interval '10 minutes'
                 and ${TEST_TENANT_FREE("rei")}
            )`,
    weeklyProbe: `select (
              select count(*) from run_events e
               where e.type = 'run.state_changed' and e.payload->>'to' = 'failed'
                 and e.payload->>'reason' = 'validation' and e.at > now() - ${WEEK}
                 and ${NOT_FROM_TEST_RUN("e.run_id")}
            ) + (
              select count(*) from run_events_internal rei
               where rei.type = 'boundary.violation' and rei.at > now() - ${WEEK}
                 and ${TEST_TENANT_FREE("rei")}
            )`,
  },
  {
    key: "egress_denied_10m",
    target: "egress denied ≈ 0 — alert on a spike (any denial in the window)",
    comparator: "gt",
    threshold: 0,
    probe: `select count(*) from fetch_log where decision = 'deny' and ts > now() - interval '10 minutes'
              and ${NOT_FROM_TEST_RUN("fetch_log.run_id")}`,
    weeklyProbe: `select count(*) from fetch_log where decision = 'deny' and ts > now() - ${WEEK}
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
    weeklyProbe: `select 100.0 * count(*) filter (where status = 429 or status >= 500) / nullif(count(*), 0)
              from fetch_log where decision = 'allow' and ts > now() - ${WEEK}
                and ${NOT_FROM_TEST_RUN("fetch_log.run_id")}`,
  },
  {
    key: "proxy_vs_sdk_cost_runs_over5pct_1h",
    // SLO.1 — the §12.7 cross-check is like-for-like per (run_id, attempt): proxy rows carry
    // `run_id + attempt` (metering.ts) and the SDK-side rows the same (internal-api harvest), so the
    // pre-SLO.1 probe's 1-hour per-RUN window mixed attempts — a relaunch's proxy burn sat beside the
    // prior attempt's SDK rows. `list_cost_usd ↔ list_cost_usd` is the honest comparison (provider list
    // price on both sides; the D-PRB.16-5 rate-card ruling is untouched — on clean attempts prod reads
    // exactly 1.000). A > 5% divergence per attempt still flags: proxy-side surplus on crashy runs is
    // REAL uncommitted burn (cap-enforcement COGS — the diagnosis lives in the SLO.1 run ledger), and
    // SDK > proxy would be unmetered inference — the flag's whole purpose.
    target: "proxy-metered vs SDK-reported cost per run ± 2% — alert on any run > 5%",
    comparator: "gt",
    threshold: 0,
    probe: `select count(*) from (
              select run_id, attempt
                from usage_records
               where ts > now() - interval '1 hour' and source in ('proxy', 'sdk_estimate')
                 and ${TEST_TENANT_FREE("usage_records")}
               group by run_id, attempt
              having sum(list_cost_usd) filter (where source = 'proxy') > 0
                 and sum(list_cost_usd) filter (where source = 'sdk_estimate') > 0
                 and abs(sum(list_cost_usd) filter (where source = 'sdk_estimate')
                       - sum(list_cost_usd) filter (where source = 'proxy'))
                     / sum(list_cost_usd) filter (where source = 'proxy') > 0.05
            ) divergent`,
    weeklyProbe: `select count(*) from (
              select run_id, attempt
                from usage_records
               where ts > now() - ${WEEK} and source in ('proxy', 'sdk_estimate')
                 and ${TEST_TENANT_FREE("usage_records")}
               group by run_id, attempt
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
    weeklyProbe: `select 100.0 *
                   coalesce(sum(case when kind = 'adjustment' and reason = 'absorbed' then credits else 0 end), 0)
                   / nullif(coalesce(sum(case when kind = 'debit' then credits
                                             when kind = 'adjustment' and reason = 'absorbed' then credits else 0 end), 0), 0)
              from credit_ledger where at > now() - ${WEEK}
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
    // SLO.1 — LIVE-TAIL samples only: `detail = 'tail'`. `RunEventStreamer` fires `onFlush` solely on
    // post-catch-up pumps, so replay flushes (a connect/`Last-Event-ID` re-read emitting events written
    // while no client was attached) never land a sample — the old unmarked rows could not be told from
    // live traffic, which is why the filter is explicit rather than positional.
    probe: `select percentile_cont(0.95) within group (order by value_ms) / 1000.0
             from slo_samples where signal = 'event_delivery_ms' and detail = 'tail' and at > now() - ${MIN} * 10
               and (workspace_id is null or ${TEST_TENANT_FREE("slo_samples")})`,
    weeklyProbe: `select percentile_cont(0.95) within group (order by value_ms) / 1000.0
             from slo_samples where signal = 'event_delivery_ms' and detail = 'tail' and at > now() - ${WEEK}
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
    // SLO.1 — the signal now carries BOTH save paths (`detail` labels the writer): `http` = the legacy
    // `POST …/editor/:draftId/save` route, `collab` = the Page's live path — the collab service's
    // `onStoreDocument` → `storeDocument` materialization (apps/collab; grant in migration 0054).
    probe: `select percentile_cont(0.95) within group (order by value_ms) / 1000.0
             from slo_samples where signal = 'autosave_save_ms' and at > now() - ${MIN} * 10
               and (workspace_id is null or ${TEST_TENANT_FREE("slo_samples")})`,
    weeklyProbe: `select percentile_cont(0.95) within group (order by value_ms) / 1000.0
             from slo_samples where signal = 'autosave_save_ms' and at > now() - ${WEEK}
               and (workspace_id is null or ${TEST_TENANT_FREE("slo_samples")})`,
  },
  {
    key: "import_preview_p95_s",
    // ONB.1 (REQ-GROWTH-1 / REQ-ARCH-34) — the amended text-import latency SLO: presign → preview-ready
    // p95 ≤ 20 s (the ticket's AC; the warm convert-svc carries the text formats). The api samples
    // `import_preview_ms` per ready preview (elapsed from the Redis first-seen stamp at presign;
    // `detail` = the conversion sourceFormat; workspace-scoped so flagged test tenants never count).
    // The SLO covers the TEXT formats only (md/txt/html/docx — the ticket's wording); a slow PDF
    // through the same route is out of scope, never a breach. A breach means the preview is slower
    // than a re-type — the exact regression the ticket fixes.
    target: "import preview latency (presign → preview-ready) p95 ≤ 20 s — alert p95 > 40 s for 30 min",
    comparator: "gt",
    threshold: 40, // seconds — the ticket's alert threshold (2× the SLO), sustained for 30 min in IaC
    probe: `select percentile_cont(0.95) within group (order by value_ms) / 1000.0
             from slo_samples where signal = 'import_preview_ms' and at > now() - ${MIN} * 30
               and detail in ('md','txt','html','docx')
               and (workspace_id is null or ${TEST_TENANT_FREE("slo_samples")})`,
    weeklyProbe: `select percentile_cont(0.95) within group (order by value_ms) / 1000.0
             from slo_samples where signal = 'import_preview_ms' and at > now() - ${WEEK}
               and detail in ('md','txt','html','docx')
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
  return runProbes(system, (sig) => sig.probe);
}

/**
 * SLO.1 / REQ-ARCH-34 — the WEEKLY review readout: every §13.5 signal read over a 7-day window
 * (`weeklyProbe`, falling back to `probe` where the alert-window reading is already the honest weekly
 * value — point-in-time counts like `orphaned_runs`, already-7d signals like the Unverified rate).
 * The worker's `slo.review.weekly` cron logs one `[slo] weekly` line per reading + a summary line; the
 * `rhema_slo_weekly` log-based metric + the dashboard's weekly-review tile carry the same numbers.
 * Status semantics are identical to `probeSlos` — a weekly `breach` is a budget-breach finding, an
 * `empty`/`unmeasured`/`error` is reported honestly, never skipped.
 */
export async function sloWeeklyReview(system: SqlClient): Promise<SloReading[]> {
  return runProbes(system, (sig) => sig.weeklyProbe ?? sig.probe);
}

async function runProbes(system: SqlClient, sqlOf: (sig: SloSignalDef) => string | undefined): Promise<SloReading[]> {
  const readings: SloReading[] = [];
  for (const sig of SLO_SIGNALS) {
    const sql = sqlOf(sig);
    if (!sql) {
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
    const res = await system.query(sql, []).catch((e: unknown) => {
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
