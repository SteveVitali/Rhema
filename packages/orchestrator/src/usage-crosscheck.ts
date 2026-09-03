// §12.7 cross-check 1 — the proxy-vs-SDK cost divergence check (REQ-SPEC-11; §13.5 SLO row
// "Proxy-metered vs SDK-reported cost per run | ± 2% | any run > 5%").
//
// The proxy is the meter of record: it reads every response's `usage` block and writes
// `usage_records{source:'proxy'}` (the rows that drive debits + the run card). Independently, the SDK
// reports its own per-phase `modelUsage`, persisted as `usage_records{source:'sdk_estimate'}` (with the
// streamed `usage.tick` rows as `sdk_stream`). This function compares the two dollar totals for a run:
// a divergence > 2% raises a flag (the Phase-0 exit criterion asserts ≤ 2% on the three real projects,
// §17), and > 5% is the SLO alert threshold.
//
// It is a PURE READER over `usage_records` — the meter and the SDK rows are written elsewhere (the proxy
// at the wire; the phase loop for `sdk_stream`; the commit path for `sdk_estimate`, D-P0.08-2). The SDK's
// per-phase reported COST is the `sdk_estimate` row; the streamed `sdk_stream` (usage.tick) rows carry
// `list_cost_usd = 0` (token markers, not a dollar figure — phase-loop.ts) and so are NOT the SDK figure.
// A run with no `sdk_estimate` row yet (the live writer is D-P0.08-2) reports `comparable: false` — an unrun
// cross-check is never a false pass NOR a false failure (a 0-dollar `sdk_stream` alone would otherwise read
// as a spurious 100% divergence).

import type { SqlClient } from "./tx.js";

/** The ± 2% Phase-0 exit tolerance (§17); a divergence above it raises a flag. */
export const CROSS_CHECK_TOLERANCE_PCT = 2;
/** The §13.5 SLO alert threshold: any run diverging > 5% pages. */
export const CROSS_CHECK_ALERT_PCT = 5;

/** The source row that carries the SDK's own reported dollar figure (§12.7 cross-check 1). `sdk_stream` is
 *  excluded: it is the streamed usage.tick token-marker rows, written with `list_cost_usd = 0`. */
export const SDK_REPORTED_SOURCE = "sdk_estimate" as const;

export interface UsageCrossCheck {
  readonly runId: string;
  /** Σ list cost from the meter of record (`source='proxy'`). */
  readonly proxyListUsd: number;
  /** Σ list cost the SDK reported (`source='sdk_estimate'`). */
  readonly sdkListUsd: number;
  /** |proxy − sdk| / proxy, as a percentage (0 when both are 0). */
  readonly divergencePct: number;
  /** true iff both a proxy figure and an SDK figure exist to compare. */
  readonly comparable: boolean;
  /** true iff comparable AND divergence ≤ 2% (the §17 exit criterion). */
  readonly withinTolerance: boolean;
  /** true iff comparable AND divergence > 2% (§12.7 "raises a flag"). */
  readonly flagged: boolean;
  /** true iff comparable AND divergence > 5% (§13.5 SLO alert / page). */
  readonly alert: boolean;
}

interface SumRow {
  source: string;
  list_usd: string | number | null;
}

function toNum(v: string | number | null): number {
  if (v == null) return 0;
  return typeof v === "number" ? v : Number(v);
}

/**
 * Compare the proxy-metered cost to the SDK-reported cost for one run (§12.7 cross-check 1).
 *
 * `exec` must be scoped to the run's tenant (usage_records is RLS by workspace_id) — call it inside a
 * `txRunner.run(workspaceId, …)` or with a system/bypass client (as the nightly job does).
 */
export async function proxyVsSdkCrossCheck(exec: SqlClient, runId: string): Promise<UsageCrossCheck> {
  const res = await exec.query(
    `select source, coalesce(sum(list_cost_usd), 0) as list_usd
       from usage_records
      where run_id = $1
      group by source`,
    [runId],
  );
  const rows = res.rows as SumRow[];

  let proxyListUsd = 0;
  let sdkListUsd = 0;
  let sawProxy = false;
  let sawSdk = false;
  for (const r of rows) {
    const usd = toNum(r.list_usd);
    if (r.source === "proxy") {
      proxyListUsd += usd;
      sawProxy = true;
    } else if (r.source === SDK_REPORTED_SOURCE) {
      sdkListUsd += usd;
      sawSdk = true;
    }
  }

  // "comparable" needs a proxy figure, an `sdk_estimate` figure, AND a non-zero denominator. The SDK dollar
  // figure is only present once the commit path records `sdk_estimate` (D-P0.08-2); until then a run has only
  // proxy rows (and 0-dollar `sdk_stream` rows, which do not count), so it is honestly not-yet-comparable —
  // never a spurious pass NOR a spurious 100%-divergence failure.
  const comparable = sawProxy && sawSdk && proxyListUsd > 0;
  const divergencePct = comparable ? (Math.abs(proxyListUsd - sdkListUsd) / proxyListUsd) * 100 : 0;
  const withinTolerance = comparable && divergencePct <= CROSS_CHECK_TOLERANCE_PCT;
  const flagged = comparable && divergencePct > CROSS_CHECK_TOLERANCE_PCT;
  const alert = comparable && divergencePct > CROSS_CHECK_ALERT_PCT;

  return {
    runId,
    proxyListUsd,
    sdkListUsd,
    divergencePct,
    comparable,
    withinTolerance,
    flagged,
    alert,
  };
}
