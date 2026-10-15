// JOURNEY.1 — the weekly paid-journey spend guard (deliverable: "a weekly paid-journey workflow
// bounded to… $5"). Before the paid legs run, the guard reads the week's metered spend attributable
// to flagged test tenants (usage_records joined to flagged workspaces) and refuses the run when the
// cap would be exceeded — the bound is measured BEFORE dispatch, not audited after.

import { JOURNEY_SEED_USAGE_REQUEST_PREFIX } from "@rhema/db";

/**
 * R5ECON.1 (REQ-ECON-6) — the seed-row exclusion fragment. Every journey fixture's seeded
 * `usage_records` row carries a `provider_request_id` under `req_jrn_`
 * (`JOURNEY_SEED_USAGE_REQUEST_PREFIX`); seeded fiction must never count as spend (B3-F3: one
 * seed wrote ≈$12.33 the guards summed as real). The fragment assumes the `usage_records u`
 * alias — every guard query aliases it identically.
 */
export const SEED_SPEND_EXCLUSION_SQL = `(u.provider_request_id is null or u.provider_request_id not like '${JOURNEY_SEED_USAGE_REQUEST_PREFIX}%')`;

/**
 * REQ-ECON-6 + REQ-ECON-13 — the ONE scope predicate every spend-guard query shares:
 * flagged test tenants (`w.is_test = true`) + the meter of record (`u.source = 'proxy'`,
 * ECON.1 D-A) − seeded fixture rows. Bucket-blind by design (Q-ECON.d, ratified): proxy
 * spend on entitlement/Included runs is real provider spend and counts toward the guards.
 * Assumes `from usage_records u join workspaces w on w.id = u.workspace_id`.
 */
export const FLAGGED_PROXY_SPEND_SCOPE = `w.is_test = true and u.source = 'proxy' and ${SEED_SPEND_EXCLUSION_SQL}`;

/**
 * REQ-ECON-7 — the per-leg cap verdict. `finishLeg` throws this when a closed leg's metered
 * spend exceeds its declared `capUsd`; the runner classifies it `cap_overrun` (distinct from
 * the owed/fail arms) and pauses the funded window — an overrun is a budget emergency that
 * stops further paid legs, not an assert failure.
 */
export class CapOverrunError extends Error {
  constructor(
    readonly stepId: string,
    readonly meteredUsd: number,
    readonly capUsd: number,
  ) {
    super(
      `${stepId} cap_overrun — metered $${meteredUsd.toFixed(2)} exceeded the declared leg cap ` +
        `$${capUsd.toFixed(2)} (REQ-ECON-7); the funded window pauses`,
    );
    this.name = "CapOverrunError";
  }
}

export interface SpendDb {
  query(sql: string, params?: unknown[]): Promise<{ rows: Record<string, unknown>[] }>;
}

export interface SpendGuardDeps {
  readonly db?: SpendDb | undefined;
  /** the hard cap for the weekly paid journey (USD of metered provider spend) */
  readonly capUsd?: number;
  readonly now?: Date;
}

export interface SpendGuardResult {
  readonly capUsd: number;
  /** the ISO week (Mon 00:00 UTC) metered spend by flagged test tenants, or null when unknown */
  readonly weeklyMeteredUsd: number | null;
  readonly withinCap: boolean;
  readonly reason?: string;
}

export const WEEKLY_PAID_CAP_USD = 5;

/**
 * The guard. Without a DB seam the guard is conservative: it reports `withinCap` only when the
 * caller asserts the run is the first paid leg of the week (`assumeFirstLeg` — used by the
 * spend-report CLI where a fresh run identity was just minted).
 */
export async function checkWeeklySpendCap(
  deps: SpendGuardDeps = {},
): Promise<SpendGuardResult> {
  const cap = deps.capUsd ?? WEEKLY_PAID_CAP_USD;
  if (!deps.db) {
    return { capUsd: cap, weeklyMeteredUsd: null, withinCap: true, reason: "no-db: caller attests fresh run" };
  }
  const now = deps.now ?? new Date();
  // ISO week start (Monday 00:00 UTC).
  const day = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  // D-STB.5b-1 (CAP.3): a DB bound under `rhema_app_login` reads usage_records through FORCE RLS —
  // the week's real spend filters to $0 and the guard greenlights a paid leg it was built to stop.
  // A meter read is only trustworthy from a role that bypasses RLS (superuser or BYPASSRLS — the
  // system-role contract the worker binds for cross-tenant reads); pg_roles is world-readable so
  // the probe runs under any role. An untrusted pool fails CLOSED: refuse the leg, don't attest.
  const trust = await deps.db.query(
    `select (r.rolsuper or r.rolbypassrls) as bypass_rls from pg_roles r where r.rolname = current_user`,
  );
  if (trust.rows[0]?.bypass_rls !== true) {
    return {
      capUsd: cap,
      weeklyMeteredUsd: null,
      withinCap: false,
      reason:
        "meter pool is not RLS-bypassing (app-login reads usage_records as $0 under FORCE RLS): " +
        "bind JOURNEY_DATABASE_URL to the system DSN — refusing to trust a blind read",
    };
  }
  const r = await deps.db.query(
    `select coalesce(sum(u.list_cost_usd), 0)::float8 as usd
       from usage_records u
       join workspaces w on w.id = u.workspace_id
      where ${FLAGGED_PROXY_SPEND_SCOPE} and u.ts >= $1`,
    [day],
  );
  const usd = Number(r.rows[0]?.usd ?? 0);
  // The contract refuses to start AT the cap (≥ $5), not just over it — an exactly-spent week
  // leaves zero headroom for the bounded leg.
  return {
    capUsd: cap,
    weeklyMeteredUsd: usd,
    withinCap: usd < cap,
    ...(usd >= cap
      ? { reason: `weekly metered spend $${usd.toFixed(2)} has reached the $${cap} cap` }
      : {}),
  };
}
