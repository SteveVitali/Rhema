// P1.16 — the usage-dashboard read models (§14.5). Four levels: L0 status bar, L1 account, L2 project,
// L4 phase×seat×model drill-down (L3 surfaces belong to P1.05's run report). All fields are
// SERVER-COMPUTED — no prompts, private memory, transcripts, or source-note bodies in any level, and
// tokens exist only in Level 4 (Advanced disclosure; REQ-DATA-42).
import type { ModelTier } from "../vocab.js";
import type { WorkflowKey } from "../enums.js";

/** A bucket balance line as rendered on the dashboard (§14.5: "where credits live"). */
export interface BucketBalanceLine {
  readonly bucket: "trial_pocket" | "daily" | "promo" | "included" | "topup";
  readonly available: number;
  readonly held: number;
  readonly expiresAt: string | null; // ISO — daily/promo/included/topup expiry where applicable
}

/** Level 0 — the always-on status strip (mobile read-only surface). */
export interface UsageLevel0 {
  readonly spendableCredits: number;
  readonly heldCredits: number;
  readonly plan: string;
  readonly trialState: string | null;
  readonly trialDaysLeft: number | null;
}

/** Level 1 — account usage: balances by bucket, month-to-date spend, period facts. */
export interface UsageLevel1 {
  readonly level0: UsageLevel0;
  readonly buckets: readonly BucketBalanceLine[];
  readonly monthToDateCredits: number;
  readonly includedRemaining: number;
  readonly includedMonthly: number;
  readonly includedRolloverCap: number; // 2× monthly (§14.2)
  readonly periodStart: string | null;
  readonly periodEnd: string | null;
  /** Server-computed flags the UI renders verbatim — never client-derived. */
  readonly warnings: readonly string[];
  readonly nextExpiry: { readonly bucket: string; readonly credits: number; readonly at: string } | null;
}

/** A single run's spend line inside a project rollup (Level 2). */
export interface UsageRunLine {
  readonly runId: string;
  readonly at: string; // ISO
  readonly workflow: WorkflowKey | string;
  readonly state: string;
  readonly credits: number;
  readonly estimateCredits: number;
  readonly capCredits: number;
}

/** Level 2 — project usage: spend by project → runs. */
export interface UsageLevel2 {
  readonly projectId: string;
  readonly projectName: string;
  readonly totalCredits: number;
  readonly runs: readonly UsageRunLine[];
}

/** Level 4 row — the phase × seat × model-tier drill-down behind Advanced disclosure (REQ-DATA-42).
 *  R5ECON.2 (REQ-ECON-4/5): `model` is the SERVED model the proxy priced (under the `testCheapRoute`
 *  arm a `base` row can read `claude-haiku-4-5`); `modelTier` is the run's frozen user-facing tier.
 *  A consumer groups on `model` for routing truth — never derives one field from the other. */
export interface UsageLevel4Row {
  readonly runId: string;
  readonly phase: string;
  readonly seat: string;
  readonly model: string;
  readonly modelTier: ModelTier;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
  readonly searches: number;
  readonly fetches: number;
  readonly credits: number;
  readonly providerRequestId: string | null;
}

/** CSV export rows for Levels 1–2 (§14.5). Flat, no nested structure. */
export interface UsageCsvRow {
  readonly date: string;
  readonly project: string;
  readonly runId: string;
  readonly workflow: string;
  readonly state: string;
  readonly credits: number;
  readonly bucket: string;
}
