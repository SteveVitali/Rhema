// @rhema/egress-proxy — turn a response's usage into a `usage_records{source:'proxy'}` row (REQ-SPEC-11; §12.7).
//
// These are the ROWS OF RECORD: they drive the run card, the debits (P0.11) and the margin report. The cost is
// computed ONLY from the provider response's usage block under the RUN's versioned rate table — never from
// anything the sandbox sent (cross-cutting invariant). `listCostUsd` is the raw provider list price at full
// precision; `credits` is a per-row convenience (platform credits, rounded) — the authoritative debit rounds
// ONCE per run over Σ list cost (P0.11 / §14.1), so the cap accountant sums the precise `platformCredits`.

import type { RunContext } from "./context.js";
import { listCostUsd, platformCredits, rateTableFor, type MeteredUsage } from "./rates.js";

/** A row for `usage_records` (mirrors packages/db billing.ts). `source` is always `'proxy'` here. */
export interface UsageRecordRow {
  readonly id: string;
  readonly ts: string;
  readonly workspaceId: string;
  readonly billingAccountId: string;
  readonly userId: string | null;
  readonly projectId: string | null;
  readonly personaId: string | null;
  readonly runId: string;
  readonly attempt: number;
  readonly stepId: string | null;
  readonly role: string;
  readonly agentInstanceId: string | null;
  readonly subagentLabel: string | null;
  readonly provider: string;
  readonly model: string;
  readonly modelTier: string;
  readonly rateTableVersion: number;
  readonly inputTokens: number;
  readonly cacheWriteTokens: number;
  readonly cacheReadTokens: number;
  readonly outputTokens: number;
  readonly searches: number;
  readonly fetches: number;
  readonly listCostUsd: number;
  readonly credits: number;
  readonly source: "proxy";
  /** The provider's per-request id (the `request-id` response header) — the nightly `usage.reconcile` job's
   *  join key against the provider's Usage & Cost report (PRB.08; REQ-BILL-13). */
  readonly providerRequestId: string | null;
  /**
   * CITE.1 — the harness-stamped phase class (`x-rhema-phase-class`: `research`/`preflight`/`backfill`,
   * else NULL) on the row of record: the column the mechanism's per-run metered delta reads
   * (`where phase_class = 'backfill'`) and the attribution ECON.2 costs the pipeline with.
   */
  readonly phaseClass: string | null;
}

export interface MeteredResult {
  readonly row: UsageRecordRow;
  /** Precise platform credits for this response (unrounded) — the cap accountant sums these (§14.1). */
  readonly platformCredits: number;
  readonly listCostUsd: number;
}

/**
 * Meter one served response: rate its `usage` under the run's rate table and build the `usage_records` row.
 * `model` is the model the provider actually billed (from the response); `agentId` is the per-request
 * attribution (subagent) resolved by the caller. Throws (never meters silently) if the model/table is unknown.
 */
export function meterResponse(input: {
  ctx: RunContext;
  usage: MeteredUsage;
  model: string;
  agentId: string;
  id: string;
  ts?: string;
  stepId?: string;
  providerRequestId?: string | null;
  /** CITE.1 — the request's harness-stamped phase class (folded onto the row of record). */
  phaseClass?: string | null;
}): MeteredResult {
  const { ctx, usage, model, agentId } = input;
  const table = rateTableFor(ctx.rateTableVersion);
  const listUsd = listCostUsd(usage, table, model);
  const credits = platformCredits(listUsd);
  const row: UsageRecordRow = {
    id: input.id,
    ts: input.ts ?? new Date().toISOString(),
    workspaceId: ctx.workspaceId,
    billingAccountId: ctx.billingAccountId,
    userId: ctx.userId ?? null,
    projectId: ctx.projectId ?? null,
    personaId: ctx.personaId ?? null,
    runId: ctx.runId,
    attempt: ctx.attempt,
    stepId: input.stepId ?? null,
    role: ctx.role,
    agentInstanceId: ctx.agentInstanceId ?? null,
    subagentLabel: agentId,
    provider: ctx.provider,
    model,
    modelTier: ctx.modelTier,
    rateTableVersion: table.version,
    inputTokens: usage.inputTokens,
    cacheWriteTokens: usage.cacheWriteTokens,
    cacheReadTokens: usage.cacheReadTokens,
    outputTokens: usage.outputTokens,
    searches: usage.webSearchRequests,
    fetches: usage.webFetchRequests,
    listCostUsd: listUsd,
    // Per-row convenience only; the authoritative per-run debit rounds ONCE over Σ list cost (P0.11 / §14.1).
    credits: Math.round(credits),
    source: "proxy",
    providerRequestId: input.providerRequestId ?? null,
    phaseClass: input.phaseClass ?? null,
  };
  return { row, platformCredits: credits, listCostUsd: listUsd };
}
