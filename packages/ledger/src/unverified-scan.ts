// RES.2 (REQ-SPEC-31(3); ADR-024) — the HISTORICAL zero-coverage scan. RES.2 classifies + settles at
// delivery time going forward; completed runs that predated the label carry no `runs.delivery` row, so
// this READ-ONLY pass recomputes the same predicate off the persisted claim ledger (`claims.tier` /
// `claims.url` + `claim_sources` — the post-Path-B delivered truth, identical to what
// `DeliveryResult.verificationCoverage` counted) and lists the runs an OPERATOR must decide on.
// It never writes: no retroactive relabel, refund, or restore happens without an explicit operator call
// (`admin refund` / a follow-up ticket) — the list is the deliverable, recorded in the run ledger.

import type { SqlClient } from "@rhema/orchestrator";

export interface UnverifiedScanRow {
  readonly runId: string;
  readonly workspaceId: string;
  readonly billingAccountId: string;
  readonly workflow: string;
  readonly endedAt: string | null;
  readonly spentCredits: number;
  readonly entitlementId: string | null;
  readonly correspondenceId: string;
  readonly checkableClaims: number;
  readonly coveredClaims: number;
  /**
   * The would-be platform-fault refund: net debits (debits − refunds) on the run's research-class
   * steps (`verification`/`discourse`) — the same rows `settleUnverifiedDelivery`'s refundPhases arm
   * would return. Read-only; nothing is written.
   */
  readonly wouldRefundCredits: number;
  /** true for workspaces flagged `is_test` — excluded from the operator list but surfaced for context. */
  readonly testTenant: boolean;
}

export interface UnverifiedScanResult {
  /** the historical runs matching the Unverified predicate that need an operator decision. */
  readonly unverified: UnverifiedScanRow[];
  /** how many completed research-bearing runs were examined. */
  readonly scanned: number;
  readonly at: string;
}

/**
 * Scan completed `review`/`fact_check` runs whose delivery predates the label (`delivery is null`) and
 * whose persisted claim inventory satisfies the zero-coverage predicate (≥1 Tier-1/2 claim, zero with a
 * surviving fetched source). Cross-tenant — run against the system-pool client, which is the only role
 * that can see every workspace's rows.
 */
export async function scanHistoricalUnverifiedRuns(
  exec: SqlClient,
  opts?: {
    limit?: number;
    /**
     * The research-class phase keys the would-be refund totals against. Defaults to the union across
     * the research-bearing manifests (`verification` on review + fact_check, `discourse` on review) —
     * the caller may pass manifest-derived keys if the manifests grow a research phase.
     */
    researchPhaseKeys?: readonly string[];
  },
): Promise<UnverifiedScanResult> {
  const phaseKeys = opts?.researchPhaseKeys ?? ["verification", "discourse"];
  const scanned = Number(
    (
      (
        await exec.query(
          `select count(*)::int as c from runs
            where state = 'completed' and workflow in ('review','fact_check')`,
        )
      ).rows[0] as { c: number }
    ).c,
  );
  const rows = (
    await exec.query(
      `select r.id as run_id, r.workspace_id, w.billing_account_id, r.workflow,
              r.ended_at, r.spent_credits, r.entitlement_id, ci.id as correspondence_id,
              count(c.id) filter (where c.tier in (1,2))::int as checkable_claims,
              count(c.id) filter (
                where c.tier in (1,2)
                  and (c.url is not null
                       or exists (select 1 from claim_sources cs where cs.claim_id = c.id))
              )::int as covered_claims,
              coalesce(rf.net_research_debits, 0)::int as would_refund_credits,
              coalesce(w.is_test, false) as test_tenant
         from runs r
         join workspaces w on w.id = r.workspace_id
         join correspondence_items ci on ci.run_id = r.id
         left join claims c on c.correspondence_id = ci.id
         left join lateral (
           select sum(case when cl.kind = 'debit' then cl.credits
                           when cl.kind = 'refund' then -cl.credits
                           else 0 end) as net_research_debits
             from credit_ledger cl
             join steps s2 on s2.id = cl.phase_id
            where s2.run_id = r.id and s2.phase = any($2::text[])
         ) rf on true
        where r.state = 'completed'
          and r.workflow in ('review','fact_check')
          and r.delivery is null
        group by r.id, r.workspace_id, w.billing_account_id, r.workflow, r.ended_at,
                 r.spent_credits, r.entitlement_id, ci.id, w.is_test, rf.net_research_debits
       having count(c.id) filter (where c.tier in (1,2)) > 0
          and count(c.id) filter (
                where c.tier in (1,2)
                  and (c.url is not null
                       or exists (select 1 from claim_sources cs where cs.claim_id = c.id))
              ) = 0
        order by r.ended_at
        limit $1`,
      [opts?.limit ?? 500, [...phaseKeys]],
    )
  ).rows as {
    run_id: string; workspace_id: string; billing_account_id: string; workflow: string;
    ended_at: Date | null; spent_credits: number | string; entitlement_id: string | null;
    correspondence_id: string; checkable_claims: number | string; covered_claims: number | string;
    would_refund_credits: number | string; test_tenant: boolean;
  }[];
  return {
    unverified: rows.map((r) => ({
      runId: r.run_id,
      workspaceId: r.workspace_id,
      billingAccountId: r.billing_account_id,
      workflow: r.workflow,
      endedAt: r.ended_at ? new Date(r.ended_at).toISOString() : null,
      spentCredits: Number(r.spent_credits),
      entitlementId: r.entitlement_id,
      correspondenceId: r.correspondence_id,
      checkableClaims: Number(r.checkable_claims),
      coveredClaims: Number(r.covered_claims),
      wouldRefundCredits: Number(r.would_refund_credits),
      testTenant: r.test_tenant,
    })),
    scanned,
    at: new Date().toISOString(),
  };
}
