// The beta's persisted analytics sink (REQ-BETA-12; design/9 §7.2 envelope). `recordAnalyticsEvent` is the
// ONE write boundary for `analytics_events` rows (0020): the payload is validated against the catalogue
// (`parseAnalyticsEvent` — an unknown name or bad props throw, never land), and the per-account opt-out is
// honored before the write (REQ-PROD-15 — a user with `analytics_opt_out` produces no row at all).
//
// The emitters live at their owning surfaces: the exhaustion prompt (`credits.exhausted_prompt`), the Stripe
// top-up (`topup.purchased`, `wtp.recorded{source:"purchase"}`), and the operator CLI's interview entry
// (`wtp.recorded{source:"interview"}`). The warehouse/export half of the pipeline is a later phase; the beta
// needs the rows durable and honest, not shipped anywhere.

import { parseAnalyticsEvent, type AnalyticsEventName } from "@rhema/contracts";
import type { SqlClient } from "@rhema/orchestrator";
import type { EntryDeps } from "./entries.js";

export interface AnalyticsInput {
  readonly userId: string;
  readonly workspaceId: string;
  readonly projectId?: string;
  readonly runId?: string;
  /** The emitting surface (the envelope's `surface`; "web" for every beta emitter). */
  readonly surface?: "web" | "mobile";
  /** The envelope tier label ("beta" at this phase — plan tiers are P1.16). */
  readonly tier?: string;
  readonly event: AnalyticsEventName;
  readonly props: Record<string, unknown>;
  /**
   * When the event happened. Live emitters leave it unset (the ledger clock stamps it); the
   * domain→stream materializer passes the source fact's timestamp (a delivered review's
   * `delivered_at`, a run's `created_at`), so a backfilled row lands in the week it belongs to —
   * not the week the projector ran.
   */
  readonly at?: Date;
  /**
   * Idempotent-intake key (PRB.12; 0024 `dedupe_key`). The domain→stream materializer writes with
   * `mat:<event>:<source row key>`; a replayed projection is a no-op (the partial unique index
   * rejects the duplicate, `on conflict … do nothing` absorbs it). Live emitters leave it unset.
   */
  readonly dedupeKey?: string;
}

/**
 * Validate + persist one analytics event. Returns the row id, or `null` when the user has opted out of
 * product analytics (REQ-PROD-15 — the row simply does not exist for them; the absence IS the honor) or
 * when the `dedupe_key` already exists (an idempotent-intake replay). Throws on an unknown event name or
 * a payload that fails the catalogue schema — a bad emitter is a bug, never a silently-dropped write.
 */
export async function recordAnalyticsEvent(
  tx: SqlClient,
  deps: EntryDeps,
  input: AnalyticsInput,
): Promise<string | null> {
  // Opt-out first (REQ-PROD-15): read the user's flag before doing any other work.
  const user = (
    await tx.query('select analytics_opt_out from "user" where id = $1', [input.userId])
  ).rows[0] as { analytics_opt_out: boolean } | undefined;
  if (user?.analytics_opt_out) return null;

  const parsed = parseAnalyticsEvent(
    input.event,
    {
      user_id: input.userId,
      workspace_id: input.workspaceId,
      ...(input.projectId !== undefined ? { project_id: input.projectId } : {}),
      ...(input.runId !== undefined ? { run_id: input.runId } : {}),
      tier: input.tier ?? "beta",
      surface: input.surface ?? "web",
    },
    input.props,
  );

  const id = deps.ids("anev");
  const inserted = await tx.query(
    `insert into analytics_events (id, user_id, workspace_id, project_id, run_id, event, props, dedupe_key, at)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
     on conflict (dedupe_key) where dedupe_key is not null do nothing
     returning id`,
    [
      id,
      parsed.user_id,
      parsed.workspace_id,
      parsed.project_id ?? null,
      parsed.run_id ?? null,
      parsed.event,
      JSON.stringify(parsed.props),
      input.dedupeKey ?? null,
      input.at ?? deps.clock.now(),
    ],
  );
  return (inserted.rows[0] as { id: string } | undefined)?.id ?? null;
}
