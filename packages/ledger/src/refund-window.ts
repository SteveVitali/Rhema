// DEF.4 — the §14.4 user refund window (BL-30; D-P0.15d-2; REQ-SPEC-24(6); REQ-IDE-18; REQ-DATA-34;
// REQ-SPEC-30/32). The user-facing caller for `refundPhases`: an authenticated, RLS-scoped request on
// a terminal run inside its own tenant transaction. §14.4's fairness rule made concrete (ADR-07x):
//
//   • ELIGIBLE — the run is `completed` / `completed_partial` / `cancelled` (delivered or
//     stopped-with-partials), inside REFUND_WINDOW_DAYS of `runs.ended_at` (the real terminal
//     timestamp — `finished_at` does not exist), not entitlement-covered, with committed debits
//     outstanding. `failed` is never user-refundable: failures settle through the platform's own
//     refund classes (the failed-run refund, `platform_fault:*`) — never the user's allowance.
//   • ONE AUTOMATIC REFUND PER BILLING ACCOUNT PER UTC CALENDAR QUARTER — the first eligible
//     request refunds every committed phase at once. A second eligible request lands
//     `pending_review` + an ops page (the stranded sweep's leg G); the admin verb decides it.
//   • NEVER COUNTS — `platform_fault:*` refunds (RES.2) and the automatic failed-run refunds:
//     the allowance reads ONLY `user_refund_requests.state='refunded'` rows, so a platform-fault
//     refund on the same account leaves the quarter's allowance untouched.
//   • RESUME — every refundable state is TERMINAL: the state machine has no outgoing edge, so a
//     user-refunded run provably cannot resume and REQ-SPEC-24(6)'s re-debit rule is discharged
//     by construction (reDebitOnResume fires only on `run.resume`, which no terminal run emits).
//   • IDEMPOTENT — `unique(run_id)` makes a replay return the recorded verdict; the refund episode
//     keys on `user-refund:<runId>` so a retry can never double-return credits.
//
// The durable request row (`user_refund_requests`, 0055) IS the audit — RES.2's 0047 precedent:
// `admin_actions.action`'s CHECK cannot widen under the additive-migration gate.

import {
  REFUND_WINDOW_DAYS,
  USER_REFUND_REASON,
  USER_REFUNDABLE_RUN_STATES,
  refundQuarterKey,
} from "@rhema/contracts";
import type { EventWriter, SqlClient, TxRunner } from "@rhema/orchestrator";
import type { EntryDeps } from "./entries.js";
import { refundPhases } from "./resume.js";

export interface RefundWindowDeps extends EntryDeps {
  readonly txRunner: TxRunner;
  readonly eventWriter: EventWriter;
}

/** Why a run is not user-refundable — the route maps each to a 409 + a readable sentence. */
export type RefundIneligibility =
  | "state" // not in a refundable terminal state (incl. `failed` — the platform's class)
  | "window_expired" // terminal more than REFUND_WINDOW_DAYS ago
  | "entitlement" // an Included (trial-entitlement) run — it never touched the credit ledger
  | "nothing_to_refund"; // no committed debit outstanding (never debited / already fully refunded)

export interface RefundEligibility {
  readonly eligible: boolean;
  readonly reason?: RefundIneligibility;
  /** the run's outstanding net debit (Σ debit − Σ refund) — the refundable figure. */
  readonly refundableCredits: number;
}

export type UserRefundOutcome =
  | { readonly kind: "refunded"; readonly requestId: string; readonly credits: number }
  | { readonly kind: "pending_review"; readonly requestId: string; readonly credits: number }
  | { readonly kind: "denied"; readonly requestId: string }
  | { readonly kind: "not_found" }
  | { readonly kind: "ineligible"; readonly reason: RefundIneligibility };

export type RefundReviewOutcome =
  | { readonly kind: "approved"; readonly requestId: string; readonly credits: number }
  | { readonly kind: "denied"; readonly requestId: string }
  | { readonly kind: "nothing_to_refund"; readonly requestId: string }
  | { readonly kind: "already_decided"; readonly requestId: string; readonly state: string }
  | { readonly kind: "not_found" };

interface RequestRow {
  readonly id: string;
  readonly run_id: string;
  readonly workspace_id: string;
  readonly billing_account_id: string;
  readonly state: string;
  readonly credits: number;
}

/** The refund episode key — ONE per run, shared by the auto path and the review-approve path so a
 *  refund applied under either is the same episode (never double-returned). */
export function userRefundEpisodeKey(runId: string): string {
  return `user-refund:${runId}`;
}

/**
 * Read the run's refund eligibility INSIDE an open tenant tx (the route's request tx, or the
 * report's read tx for the affordance block). Pure read — the money decision happens under the
 * request path's locks.
 */
export async function refundEligibility(
  tx: SqlClient,
  args: { runId: string; workspaceId: string; now: Date },
): Promise<RefundEligibility | "not_found"> {
  const run = (
    await tx.query(
      `select r.state, r.ended_at, r.entitlement_id
         from runs r where r.id = $1 and r.workspace_id = $2`,
      [args.runId, args.workspaceId],
    )
  ).rows[0] as { state: string; ended_at: string | Date | null; entitlement_id: string | null } | undefined;
  if (!run) return "not_found";

  const net = Number(
    (
      (
        await tx.query(
          `select coalesce(sum(case kind when 'debit' then credits when 'refund' then -credits else 0 end), 0)::int as s
             from credit_ledger where run_id = $1 and kind in ('debit','refund')`,
          [args.runId],
        )
      ).rows[0] as { s: number }
    ).s,
  );

  if (!(USER_REFUNDABLE_RUN_STATES as readonly string[]).includes(run.state)) {
    return { eligible: false, reason: "state", refundableCredits: net };
  }
  if (run.entitlement_id != null) return { eligible: false, reason: "entitlement", refundableCredits: net };
  const endedAt = run.ended_at != null ? new Date(run.ended_at) : null;
  if (endedAt == null) return { eligible: false, reason: "state", refundableCredits: net };
  if (args.now.getTime() > endedAt.getTime() + REFUND_WINDOW_DAYS * 24 * 3600 * 1000) {
    return { eligible: false, reason: "window_expired", refundableCredits: net };
  }
  if (net <= 0) return { eligible: false, reason: "nothing_to_refund", refundableCredits: net };
  return { eligible: true, refundableCredits: net };
}

/**
 * `POST /runs/:id/refund` — one tenant tx: eligibility → the quarterly allowance under the account
 * row lock → `refundPhases` over every committed phase + the durable request row + `cost.refunded`.
 * A replay returns the recorded verdict (unique run_id); a second-in-quarter parks for review.
 */
export async function requestUserRefund(
  deps: RefundWindowDeps,
  args: { runId: string; workspaceId: string; userId: string },
): Promise<UserRefundOutcome> {
  return deps.txRunner.run(args.workspaceId, async (tx): Promise<UserRefundOutcome> => {
    const run = (
      await tx.query(
        `select r.id, w.billing_account_id
           from runs r join workspaces w on w.id = r.workspace_id
          where r.id = $1 and r.workspace_id = $2 for update of r`,
        [args.runId, args.workspaceId],
      )
    ).rows[0] as { id: string; billing_account_id: string } | undefined;
    if (!run) return { kind: "not_found" };

    // replay — one request per run; a repeat returns the recorded verdict (never a second refund).
    const prior = (
      await tx.query("select id, state, credits from user_refund_requests where run_id = $1", [
        args.runId,
      ])
    ).rows[0] as { id: string; state: string; credits: number } | undefined;
    if (prior) {
      if (prior.state === "refunded") return { kind: "refunded", requestId: prior.id, credits: prior.credits };
      if (prior.state === "pending_review")
        return { kind: "pending_review", requestId: prior.id, credits: prior.credits };
      return { kind: "denied", requestId: prior.id };
    }

    const eligibility = await refundEligibility(tx, {
      runId: args.runId,
      workspaceId: args.workspaceId,
      now: deps.clock.now(),
    });
    if (eligibility === "not_found") return { kind: "not_found" };
    if (!eligibility.eligible) return { kind: "ineligible", reason: eligibility.reason! };

    // serialize the allowance decision per account — two simultaneous requests on different runs
    // of the SAME account must not both read a zero count and both auto-refund.
    await tx.query("select id from billing_accounts where id = $1 for update", [run.billing_account_id]);

    const now = deps.clock.now();
    const quarter = refundQuarterKey(now);
    const used = Number(
      (
        (
          await tx.query(
            `select count(*)::int as n from user_refund_requests
              where billing_account_id = $1 and quarter = $2 and state = 'refunded'`,
            [run.billing_account_id, quarter],
          )
        ).rows[0] as { n: number }
      ).n,
    );

    if (used > 0) {
      // the quarter's automatic refund is spent — the request parks for the operator verb; the
      // sweep's leg G pages ops on the pending row (send-then-mark, `alerted_at`).
      const requestId = deps.ids("urr");
      await tx.query(
        `insert into user_refund_requests
           (id, workspace_id, billing_account_id, run_id, user_id, state, credits, quarter, requested_at)
         values ($1,$2,$3,$4,$5,'pending_review',$6,$7,$8)`,
        [
          requestId,
          args.workspaceId,
          run.billing_account_id,
          args.runId,
          args.userId,
          eligibility.refundableCredits,
          quarter,
          now,
        ],
      );
      return { kind: "pending_review", requestId, credits: eligibility.refundableCredits };
    }

    // the quarter's automatic refund — every committed phase through RES.2's plumbing, the
    // user-window reason on each row (never platform_fault:* — the classes stay disjoint).
    const phaseIds = (
      await tx.query(
        `select distinct phase_id from credit_ledger
          where run_id = $1 and kind = 'debit' and phase_id is not null order by phase_id`,
        [args.runId],
      )
    ).rows.map((r) => (r as { phase_id: string }).phase_id);
    const refunds = await refundPhases(tx, deps, {
      workspaceId: args.workspaceId,
      billingAccountId: run.billing_account_id,
      runId: args.runId,
      phaseIds,
      idempotencyKey: userRefundEpisodeKey(args.runId),
      reason: USER_REFUND_REASON,
    });
    const credits = refunds.reduce((a, r) => a + r.credits, 0);
    if (credits <= 0) return { kind: "ineligible", reason: "nothing_to_refund" };

    const requestId = deps.ids("urr");
    await tx.query(
      `insert into user_refund_requests
         (id, workspace_id, billing_account_id, run_id, user_id, state, decision, credits, quarter,
          requested_at, decided_at)
       values ($1,$2,$3,$4,$5,'refunded','auto_allowance',$6,$7,$8,$8)`,
      [
        requestId,
        args.workspaceId,
        run.billing_account_id,
        args.runId,
        args.userId,
        credits,
        quarter,
        now,
      ],
    );
    await deps.eventWriter.append(tx, {
      runId: args.runId,
      type: "cost.refunded",
      payload: { credits, reason: USER_REFUND_REASON },
      at: now,
    });
    return { kind: "refunded", requestId, credits };
  });
}

/**
 * The admin verb — approve or deny a `pending_review` request. Callers run it on the SYSTEM pool
 * (the request row's state transitions are deliberately not granted to the user role) with the
 * workspace predicate on every write (REQ-SPEC-30). Approve runs the SAME refund episode the auto
 * path would have — `refundPhases` + `cost.refunded` — so the two decision paths never diverge.
 */
export async function decideRefundReview(
  deps: RefundWindowDeps,
  args: { requestId: string; workspaceId: string; approve: boolean; actor: string; note?: string },
): Promise<RefundReviewOutcome> {
  return deps.txRunner.run(args.workspaceId, async (tx): Promise<RefundReviewOutcome> => {
    const req = (
      await tx.query(
        "select id, run_id, workspace_id, billing_account_id, state, credits from user_refund_requests where id = $1 and workspace_id = $2 for update",
        [args.requestId, args.workspaceId],
      )
    ).rows[0] as RequestRow | undefined;
    if (!req) return { kind: "not_found" };
    if (req.state !== "pending_review") {
      return { kind: "already_decided", requestId: req.id, state: req.state };
    }

    const now = deps.clock.now();
    if (!args.approve) {
      await tx.query(
        `update user_refund_requests
            set state = 'denied', decision = 'admin_deny', decided_at = $3, decided_by = $4, note = $5
          where id = $1 and workspace_id = $2`,
        [req.id, args.workspaceId, now, args.actor, args.note ?? null],
      );
      return { kind: "denied", requestId: req.id };
    }

    // approve — run the identical refund episode (the episode key dedupes any partial replay).
    const phaseIds = (
      await tx.query(
        `select distinct phase_id from credit_ledger
          where run_id = $1 and kind = 'debit' and phase_id is not null order by phase_id`,
        [req.run_id],
      )
    ).rows.map((r) => (r as { phase_id: string }).phase_id);
    const refunds = await refundPhases(tx, deps, {
      workspaceId: req.workspace_id,
      billingAccountId: req.billing_account_id,
      runId: req.run_id,
      phaseIds,
      idempotencyKey: userRefundEpisodeKey(req.run_id),
      reason: USER_REFUND_REASON,
    });
    const credits = refunds.reduce((a, r) => a + r.credits, 0);
    if (credits <= 0) {
      // every debit was refunded by another class in the gap — an approval that returns nothing is
      // NOT a refund; close the request honestly rather than recording a zero-credit grant.
      await tx.query(
        `update user_refund_requests
            set state = 'denied', decision = 'admin_approve', decided_at = $3, decided_by = $4,
                note = $5
          where id = $1 and workspace_id = $2`,
        [
          req.id,
          args.workspaceId,
          now,
          args.actor,
          `no outstanding debit to refund${args.note ? ` — ${args.note}` : ""}`,
        ],
      );
      return { kind: "nothing_to_refund", requestId: req.id };
    }

    await tx.query(
      `update user_refund_requests
          set state = 'refunded', decision = 'admin_approve', credits = $3,
              decided_at = $4, decided_by = $5, note = $6
        where id = $1 and workspace_id = $2`,
      [req.id, args.workspaceId, credits, now, args.actor, args.note ?? null],
    );
    await deps.eventWriter.append(tx, {
      runId: req.run_id,
      type: "cost.refunded",
      payload: { credits, reason: USER_REFUND_REASON },
      at: now,
    });
    return { kind: "approved", requestId: req.id, credits };
  });
}
