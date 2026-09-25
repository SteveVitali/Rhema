// PRB.13 — signup admission + self-serve account creation (REQ-BETA-19 amended 2026-09-16).
//
// `admitSignup` is THE api-side account-creation gate — the single function every signup path runs:
// `POST /signup` (the web /login flow's pre-auth call for the magic-link path) and, in the live deploy,
// Better Auth's post-OAuth `user.create` hook for the Google path (D-PRB.01-1's live leg binds exactly
// this). `signup.mode` decides whether a code is REQUIRED:
//
//   invite — no valid code ⇒ no account; `consume` happens here at creation (the PRB.01 invariant,
//            now deterministic instead of live-wired-only). Partner cohorts keep redeeming.
//   open   — self-serve creation with no invite required; a supplied code is still validated and
//            consumed (a typo'd partner code fails loudly, never silently ignored).
//
// A provisioned account is `user` + personal `workspaces` row + `billing_accounts` + `workspace_members`
// — all `on conflict`-idempotent so a half-finished signup retries cleanly. New accounts start with ZERO
// spendable credits (no house grants — H3 is deferred): `credit_balances` stays empty and the balance
// read's `coalesce(sum,0)` answers 0, which is what lands the run sheet on the PRB.08 exhaustion panel +
// Payment Link (the only purchase path). `email_verified` stays false until the sign-in link proves the
// mailbox — the magic link IS the verification (one email path; no second send), and run creation refuses
// an unverified account (run-routes.ts's `userEmailVerified` gate).
//
// Abuse control is the ticket's beta-grade throttle: account creation is throttled per source IP and per
// email before any invite or provisioning work runs; over-limit answers 429 + Retry-After. The throttle is
// the shared fixed-window `IpEmailThrottle` (per-instance, in-memory — the shared-store follow-up is
// D-PRB.13-1).

import { Hono } from "hono";
import type { Context } from "hono";
import type { SignupMode, IpEmailThrottle } from "@rhema/contracts";
import type { SqlClient, InviteGate, InviteRejectReason } from "./invite.js";
import type { IdFactory, Clock } from "@rhema/orchestrator";
import { recordAnalyticsEvent, provisionTrial } from "@rhema/ledger";

/** Why a signup was refused — stable codes; the web maps these to copy, the route maps them to statuses. */
export type SignupRejectReason =
  | InviteRejectReason // unknown | expired | revoked | exhausted | email_mismatch
  | "invite_required" // invite mode and no code supplied
  | "email_required"; // missing email

export interface SignupAdmission {
  readonly ok: boolean;
  /** true when this call created the account (false ⇒ the email's account already existed). */
  readonly created?: boolean;
  readonly userId?: string;
  readonly workspaceId?: string;
  readonly billingAccountId?: string;
  readonly reason?: SignupRejectReason;
}

export interface SignupPolicyDeps {
  readonly db: SqlClient;
  readonly mode: SignupMode;
  readonly inviteGate: InviteGate;
  readonly ids: IdFactory;
}

interface ExistingMembership {
  workspace_id: string;
  billing_account_id: string;
}

/**
 * Admit + provision one account. `email` is the account's identity (one user row per email — the unique
 * `user.email` constraint is the concurrency key); a previously-provisioned email is an idempotent
 * `created:false`, never a second account and never a second invite consume.
 */
export async function admitSignup(
  deps: SignupPolicyDeps,
  args: { email: string; code?: string },
): Promise<SignupAdmission> {
  const email = args.email.trim().toLowerCase();
  if (!email) return { ok: false, reason: "email_required" };
  const code = args.code?.trim() || undefined;

  // Already-provisioned (the email has a personal-workspace membership) ⇒ the account was created
  // earlier: idempotent ok — and the invite requirement does NOT re-apply: a returning user
  // re-requesting a sign-in link must not be locked out by their own now-exhausted single-use code.
  // (The created:false-vs-refused distinction is an email-existence oracle — accepted at beta: the
  // magic-link send leaks the same fact, and the throttle caps the probing rate.)
  const existingUser = (
    await deps.db.query(`select id from "user" where email = $1`, [email])
  ).rows[0] as { id: string } | undefined;
  if (existingUser) {
    const mem = (
      await deps.db.query(
        `select w.id as workspace_id, w.billing_account_id
           from workspaces w join workspace_members m on m.workspace_id = w.id
          where m.user_id = $1 and w.kind = 'personal' limit 1`,
        [existingUser.id],
      )
    ).rows[0] as ExistingMembership | undefined;
    if (mem) {
      return {
        ok: true,
        created: false,
        userId: existingUser.id,
        workspaceId: mem.workspace_id,
        billingAccountId: mem.billing_account_id,
      };
    }
  }

  // A NEW (or never-provisioned) account — the mode gate binds here, BEFORE any row is written:
  // invite mode refuses without a code at all; both modes refuse an INVALID code (a supplied partner
  // code is validated, never silently ignored). A refusal leaves nothing behind.
  if (deps.mode === "invite" && !code) return { ok: false, reason: "invite_required" };
  if (code) {
    const check = await deps.inviteGate.check(code, email);
    if (!check.ok) return { ok: false, reason: check.reason };
  }

  // Provision the user row (idempotent by email — the account-creation concurrency key; a concurrent
  // same-email signup resolves to the winner's id and the consume below stays idempotent per
  // (code, user_id)).
  const newUserId = deps.ids("usr");
  const ins = await deps.db.query(
    `insert into "user"(id, email) values ($1, $2) on conflict (email) do nothing returning id`,
    [newUserId, email],
  );
  const userId =
    (ins.rows[0] as { id: string } | undefined)?.id ??
    (
      (await deps.db.query(`select id from "user" where email = $1`, [email]))
        .rows[0] as { id: string } | undefined
    )?.id;
  if (!userId) return { ok: false, reason: "email_required" }; // unreachable in practice; never proceed bare

  // Invite consume happens AT creation (the PRB.01 invariant): a code that raced to exhaustion between
  // the caller's check and this consume is refused here; the bare user row left behind is simply
  // "un-provisioned" — the next attempt with a valid code completes the same idempotent path.
  if (code) {
    const consumed = await deps.inviteGate.consume(code, userId, email);
    if (!consumed.ok) return { ok: false, reason: consumed.reason };
  }

  const provisioned = await provisionPersonalAccount(deps.db, deps.ids, userId);
  return { ok: true, created: true, userId, ...provisioned };
}

/**
 * The personal-account rows every sign-in resolves through (`resolveSessionPrincipal` joins
 * workspace_members → workspaces for `kind='personal'`): a fresh billing account, a personal workspace,
 * and the user's admin membership. Idempotent — called from `POST /signup` admission AND from Better
 * Auth's `user.create` hook (the OAuth/magic-link paths that never see the signup route; PRB.16).
 */
export async function provisionPersonalAccount(
  db: SqlClient,
  ids: (prefix: string) => string,
  userId: string,
): Promise<{ workspaceId: string; billingAccountId: string }> {
  // already provisioned ⇒ return the existing personal workspace (a second personal workspace would fork
  // the session→principal resolution).
  const existing = (
    await db.query(
      `select w.id as workspace_id, w.billing_account_id
         from workspaces w join workspace_members m on m.workspace_id = w.id
        where m.user_id = $1 and w.kind = 'personal' limit 1`,
      [userId],
    )
  ).rows[0] as { workspace_id: string; billing_account_id: string } | undefined;
  if (existing) return { workspaceId: existing.workspace_id, billingAccountId: existing.billing_account_id };
  const billingAccountId = ids("ba");
  const workspaceId = ids("ws");
  await db.query(`insert into billing_accounts(id) values ($1) on conflict (id) do nothing`, [
    billingAccountId,
  ]);
  // P1.16 (§14.3; REQ-GROWTH-10): every new account starts `trial_pending` with a LOCKED trial
  // entitlement (one Review ≤6,000 words, Standard, Base). The pocket grants only at the unlock gate —
  // identity-before-spend.
  await provisionTrial(
    db,
    { ids: (prefix?: string) => ids(prefix ?? "id"), clock: { now: () => new Date() } },
    { billingAccountId },
  );
  await db.query(
    `insert into workspaces(id, kind, name, billing_account_id) values ($1, 'personal', $2, $3)
       on conflict (id) do nothing`,
    [workspaceId, "Personal", billingAccountId],
  );
  await db.query(
    `insert into workspace_members(workspace_id, user_id, role) values ($1, $2, 'admin')
       on conflict (workspace_id, user_id) do nothing`,
    [workspaceId, userId],
  );
  return { workspaceId, billingAccountId };
}

export interface SignupApiDeps extends SignupPolicyDeps {
  /** The account-creation throttle (per IP + per email). */
  readonly throttle: IpEmailThrottle;
  readonly clock: Clock;
  /** Tenant-scoped tx for the `signup.completed` analytics write (analytics_events is RLS'd to the
   *  new account's workspace). */
  readonly txRunner: { run<T>(workspaceId: string, fn: (tx: SqlClient) => Promise<T>): Promise<T> };
}

/** The deploy's default account-creation throttle — beta-grade (D-PRB.13-1: per-instance, in-memory). */
export const SIGNUP_THROTTLE_DEFAULTS = { perIp: 10, perEmail: 5, windowMs: 3_600_000 } as const;

/** The source IP the LB forwarded (first XFF hop); absent ⇒ every headerless caller shares "unknown". */
function clientIp(c: Context): string {
  return c.req.header("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}

function statusForReason(reason: SignupRejectReason): 400 | 403 {
  return reason === "email_required" ? 400 : 403;
}

export function createSignupRoutes(deps: SignupApiDeps): Hono {
  const app = new Hono();

  // Public: admit + provision an account (REQ-BETA-19 amended). The throttle runs BEFORE any invite or
  // provisioning work — the invite oracle is part of what the throttle protects.
  app.post("/signup", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as {
      email?: unknown;
      code?: unknown;
      method?: unknown;
    };
    const email = typeof body.email === "string" ? body.email : "";
    const code = typeof body.code === "string" && body.code.trim() !== "" ? body.code.trim() : undefined;
    const method = typeof body.method === "string" && body.method !== "" ? body.method : "magic_link";

    const verdict = deps.throttle.attempt(clientIp(c), email || undefined);
    if (!verdict.allowed) {
      c.header("retry-after", String(verdict.retryAfterSec ?? 60));
      return c.json({ error: "rate_limited" }, 429);
    }

    const admission = await admitSignup(deps, { email, ...(code ? { code } : {}) });
    if (!admission.ok) {
      return c.json({ error: admission.reason }, statusForReason(admission.reason!));
    }

    // `signup.completed` (design/9 §7.2) is server-owned — the account-creation fact only the api can
    // attest. Emitted only when this call created the account; the write honors analytics_opt_out
    // (REQ-PROD-15) and is never fatal to the signup.
    if (admission.created && admission.workspaceId && admission.userId) {
      await deps.txRunner
        .run(admission.workspaceId, (tx) =>
          recordAnalyticsEvent(tx, { ids: deps.ids, clock: deps.clock }, {
            userId: admission.userId!,
            workspaceId: admission.workspaceId!,
            event: "signup.completed",
            props: { method },
          }),
        )
        .catch(() => undefined);
    }

    return c.json({ ok: true, created: admission.created === true }, admission.created ? 201 : 200);
  });

  return app;
}
