// Usage-dashboard read models (P1.16; §14.5; REQ-DATA-42). Four levels — L0 status strip, L1 account,
// L2 project rollup, L4 phase×seat×model drill-down (Advanced disclosure only). Every field is
// SERVER-COMPUTED: no prompts, private memory, transcripts, or source-note bodies in any level; tokens
// appear only in L4 rows. CSV export covers L1–L2 (§14.5).

import type { SqlClient } from "@rhema/orchestrator";
import type {
  BucketBalanceLine,
  UsageCsvRow,
  UsageLevel0,
  UsageLevel1,
  UsageLevel2,
  UsageLevel4Row,
  UsageRunLine,
} from "@rhema/contracts";
import { PRICING, planOf } from "@rhema/contracts";
import { effectivePlanTier } from "./subscriptions.js";

const DAY_MS = 24 * 60 * 60 * 1000;

/** Level 0 — the always-on status strip. */
export async function usageLevel0(
  exec: SqlClient,
  billingAccountId: string,
  now: Date,
): Promise<UsageLevel0> {
  const totals = (
    await exec.query(
      `select coalesce(sum(available),0)::int as a, coalesce(sum(held),0)::int as h
         from credit_balances where billing_account_id = $1`,
      [billingAccountId],
    )
  ).rows[0] as { a: number; h: number };
  const account = (
    await exec.query("select trial_state from billing_accounts where id = $1", [billingAccountId])
  ).rows[0] as { trial_state: string | null } | undefined;
  const ent = (
    await exec.query(
      "select expires_at from trial_entitlements where billing_account_id = $1 order by expires_at desc nulls last limit 1",
      [billingAccountId],
    )
  ).rows[0] as { expires_at: string | null } | undefined;
  const tier = await effectivePlanTier(exec, billingAccountId);
  const daysLeft = ent?.expires_at
    ? Math.max(0, Math.ceil((new Date(ent.expires_at).getTime() - now.getTime()) / DAY_MS))
    : null;
  return {
    spendableCredits: Number(totals.a),
    heldCredits: Number(totals.h),
    plan: planOf(tier).display,
    trialState: account?.trial_state ?? null,
    trialDaysLeft: account?.trial_state === "trial_active" || account?.trial_state === "trial_pending" ? daysLeft : null,
  };
}

/** Level 1 — account usage: per-bucket balances, month-to-date spend, period facts, warnings. */
export async function usageLevel1(
  exec: SqlClient,
  billingAccountId: string,
  workspaceId: string,
  now: Date,
): Promise<UsageLevel1> {
  const level0 = await usageLevel0(exec, billingAccountId, now);
  const bucketRows = (
    await exec.query(
      `select b.bucket, b.available::int as a, b.held::int as h,
              (select min(l.expires_at) from credit_ledger l
                 where l.billing_account_id = b.billing_account_id and l.bucket = b.bucket
                   and l.kind = 'grant' and l.expires_at is not null and l.expires_at > $2) as exp
         from credit_balances b where b.billing_account_id = $1 order by b.bucket`,
      [billingAccountId, now],
    )
  ).rows as { bucket: BucketBalanceLine["bucket"]; a: number; h: number; exp: string | null }[];
  const buckets: BucketBalanceLine[] = bucketRows.map((r) => ({
    bucket: r.bucket,
    available: Number(r.a),
    held: Number(r.h),
    expiresAt: r.exp ? new Date(r.exp).toISOString() : null,
  }));

  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const mtd = Number(
    (
      (
        await exec.query(
          `select coalesce(sum(credits),0)::int as s from credit_ledger
             where billing_account_id = $1 and kind = 'debit' and at >= $2`,
          [billingAccountId, monthStart],
        )
      ).rows[0] as { s: number }
    ).s,
  );

  const sub = (
    await exec.query(
      `select tier, period_start, period_end, status, renewal_failed_at from subscriptions
         where billing_account_id = $1 and status in ('active','past_due')
         order by created_at desc limit 1`,
      [billingAccountId],
    )
  ).rows[0] as
    | { tier: string; period_start: string; period_end: string; status: string; renewal_failed_at: string | null }
    | undefined;
  const tier = sub ? (sub.tier as Parameters<typeof planOf>[0]) : "free";
  const includedRow = buckets.find((b) => b.bucket === "included");

  // server-computed warnings — the UI renders them verbatim (§14.5: templated sentences).
  const warnings: string[] = [];
  if (sub?.status === "past_due" && sub.renewal_failed_at) {
    const daysLeft = Math.max(
      0,
      14 - Math.floor((now.getTime() - new Date(sub.renewal_failed_at).getTime()) / DAY_MS),
    );
    warnings.push(`Your payment didn't go through — we'll keep retrying for ${daysLeft} more day${daysLeft === 1 ? "" : "s"}.`);
  }
  const nextExpiry = buckets
    .filter((b) => b.expiresAt && b.available > 0)
    .sort((a, b) => new Date(a.expiresAt!).getTime() - new Date(b.expiresAt!).getTime())[0];
  if (nextExpiry) {
    const days = Math.ceil((new Date(nextExpiry.expiresAt!).getTime() - now.getTime()) / DAY_MS);
    if (days <= 7) {
      warnings.push(
        `${nextExpiry.available} ${nextExpiry.bucket === "daily" ? "daily" : nextExpiry.bucket === "included" ? "included" : nextExpiry.bucket === "topup" ? "top-up" : nextExpiry.bucket} credit${nextExpiry.available === 1 ? "" : "s"} expire${nextExpiry.available === 1 ? "s" : ""} in ${days} day${days === 1 ? "" : "s"}.`,
      );
    }
  }

  return {
    level0,
    buckets,
    monthToDateCredits: mtd,
    includedRemaining: includedRow?.available ?? 0,
    includedMonthly: planOf(tier).includedCreditsMonthly,
    includedRolloverCap: planOf(tier).includedCreditsMonthly * PRICING.rollover.balanceCapMultiple,
    periodStart: sub ? new Date(sub.period_start).toISOString() : null,
    periodEnd: sub ? new Date(sub.period_end).toISOString() : null,
    warnings,
    nextExpiry: nextExpiry
      ? { bucket: nextExpiry.bucket, credits: nextExpiry.available, at: nextExpiry.expiresAt! }
      : null,
  };
}

/** Level 2 — one project's spend rollup (runs newest first). */
export async function usageLevel2(
  exec: SqlClient,
  workspaceId: string,
  projectId: string,
): Promise<UsageLevel2> {
  const project = (
    await exec.query("select title from projects where id = $1 and workspace_id = $2", [projectId, workspaceId])
  ).rows[0] as { title: string } | undefined;
  const rows = (
    await exec.query(
      `select r.id, r.created_at, r.workflow, r.state, r.spent_credits, r.estimate_credits, r.cap_credits
         from runs r where r.project_id = $1 and r.workspace_id = $2 order by r.created_at desc limit 100`,
      [projectId, workspaceId],
    )
  ).rows as {
    id: string;
    created_at: string;
    workflow: string;
    state: string;
    spent_credits: number;
    estimate_credits: number;
    cap_credits: number;
  }[];
  const runs: UsageRunLine[] = rows.map((r) => ({
    runId: r.id,
    at: new Date(r.created_at).toISOString(),
    workflow: r.workflow,
    state: r.state,
    credits: Number(r.spent_credits),
    estimateCredits: Number(r.estimate_credits),
    capCredits: Number(r.cap_credits),
  }));
  return {
    projectId,
    projectName: project?.title ?? projectId,
    totalCredits: runs.reduce((s, r) => s + r.credits, 0),
    runs,
  };
}

/** Level 4 — the phase × seat × model-tier drill-down (Advanced disclosure only; REQ-DATA-42). */
export async function usageLevel4(exec: SqlClient, workspaceId: string, runId: string): Promise<UsageLevel4Row[]> {
  const rows = (
    await exec.query(
      `select u.run_id, coalesce(s.phase, u.role) as phase, u.role as seat, u.model, u.model_tier,
              u.input_tokens::int as it, u.output_tokens::int as ot, u.cache_read_tokens::int as crt,
              u.cache_write_tokens::int as cwt, u.searches, u.fetches, u.credits, u.provider_request_id
         from usage_records u left join steps s on s.id = u.step_id
        where u.run_id = $1 and u.workspace_id = $2 and u.source = 'proxy' -- ECON.1 D-A: meter of record only
        order by u.ts`,
      [runId, workspaceId],
    )
  ).rows as {
    run_id: string;
    phase: string;
    seat: string;
    model: string;
    model_tier: string;
    it: number | null;
    ot: number | null;
    crt: number | null;
    cwt: number | null;
    searches: number | null;
    fetches: number | null;
    credits: number;
    provider_request_id: string | null;
  }[];
  return rows.map((r) => ({
    runId: r.run_id,
    phase: r.phase,
    seat: r.seat,
    model: r.model,
    modelTier: r.model_tier as UsageLevel4Row["modelTier"],
    inputTokens: Number(r.it ?? 0),
    outputTokens: Number(r.ot ?? 0),
    cacheReadTokens: Number(r.crt ?? 0),
    cacheWriteTokens: Number(r.cwt ?? 0),
    searches: Number(r.searches ?? 0),
    fetches: Number(r.fetches ?? 0),
    credits: Number(r.credits),
    providerRequestId: r.provider_request_id,
  }));
}

/** Levels 1–2 CSV export (§14.5): one row per debit, flat. */
export async function usageCsv(exec: SqlClient, billingAccountId: string, workspaceId: string): Promise<UsageCsvRow[]> {
  const rows = (
    await exec.query(
      `select l.at, coalesce(p.title, '') as project, l.run_id, r.workflow, r.state, l.credits, l.bucket
         from credit_ledger l
         left join runs r on r.id = l.run_id
         left join projects p on p.id = r.project_id
        where l.billing_account_id = $1 and l.workspace_id = $2 and l.kind = 'debit'
        order by l.at desc limit 5000`,
      [billingAccountId, workspaceId],
    )
  ).rows as {
    at: string;
    project: string;
    run_id: string | null;
    workflow: string | null;
    state: string | null;
    credits: number;
    bucket: string;
  }[];
  return rows.map((r) => ({
    date: new Date(r.at).toISOString(),
    project: r.project,
    runId: r.run_id ?? "",
    workflow: r.workflow ?? "",
    state: r.state ?? "",
    credits: Number(r.credits),
    bucket: r.bucket,
  }));
}

/** Render the CSV (RFC-4180 quoting; the caller sets the content headers). */
export function usageCsvText(rows: readonly UsageCsvRow[]): string {
  const esc = (v: string | number) => {
    const s = String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = ["date,project,run_id,workflow,state,credits,bucket"];
  for (const r of rows) {
    lines.push([r.date, r.project, r.runId, r.workflow, r.state, r.credits, r.bucket].map(esc).join(","));
  }
  return lines.join("\n") + "\n";
}
