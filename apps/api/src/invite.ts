import { randomUUID } from "node:crypto";

// Beta invite gating (PRB.01; REQ-BETA-19). The beta is private and invite-only — there is no public signup
// path. `check` answers "may this code sign someone up?" (used by the web /login gate before any auth request
// is made); `consume` atomically claims one use at account creation and records the redemption, so a code
// cannot be reused past `max_uses`. Backed by the 0016 `invites` / `invite_redemptions` tables. The engine is
// a minimal `{ query }` client so the same code runs on PGlite (tests) and a real pg.Pool (deploy).

export interface SqlClient {
  query(sql: string, params?: unknown[]): Promise<{ rows: unknown[] }>;
}

/** Why a code was refused (stable codes; the UI maps these to copy). */
export type InviteRejectReason = "unknown" | "expired" | "revoked" | "exhausted" | "email_mismatch";

export interface InviteCheck {
  readonly ok: boolean;
  readonly reason?: InviteRejectReason;
}

export interface InviteGate {
  /** Non-mutating validity check for a code (and, for an email-bound invite, the redeeming email). */
  check(code: string, email?: string): Promise<InviteCheck>;
  /** Atomically claim one use and record the redemption for `userId`. Idempotent per (code, user). */
  consume(code: string, userId: string, email?: string): Promise<InviteCheck>;
}

export interface InviteGateOptions {
  /** Injected clock (default `Date.now`) so expiry is deterministic in tests. */
  now?: () => Date;
  /** Injected id factory for redemption rows (default a uuid). */
  newId?: () => string;
}

interface InviteRow {
  code: string;
  email: string | null;
  max_uses: number;
  used_count: number;
  expires_at: string | Date | null;
  revoked_at: string | Date | null;
}

function reasonFor(row: InviteRow | undefined, now: Date, email?: string): InviteRejectReason | null {
  if (!row) return "unknown";
  if (row.revoked_at != null) return "revoked";
  if (row.expires_at != null && new Date(row.expires_at).getTime() <= now.getTime()) return "expired";
  if (row.used_count >= row.max_uses) return "exhausted";
  // An email-bound invite (allowlist entry) may be redeemed only by that email.
  if (row.email != null) {
    const want = row.email.trim().toLowerCase();
    if (!email || email.trim().toLowerCase() !== want) return "email_mismatch";
  }
  return null;
}

export function createInviteGate(db: SqlClient, opts: InviteGateOptions = {}): InviteGate {
  const now = opts.now ?? (() => new Date());
  const newId = opts.newId ?? (() => `inv_red_${randomUUID()}`);

  async function load(code: string): Promise<InviteRow | undefined> {
    const res = await db.query(
      `select code, email, max_uses, used_count, expires_at, revoked_at
         from invites where lower(code) = lower($1)`,
      [code.trim()],
    );
    return res.rows[0] as InviteRow | undefined;
  }

  async function check(code: string, email?: string): Promise<InviteCheck> {
    if (!code || !code.trim()) return { ok: false, reason: "unknown" };
    const reason = reasonFor(await load(code), now(), email);
    return reason ? { ok: false, reason } : { ok: true };
  }

  return {
    check,
    async consume(code: string, userId: string, email?: string): Promise<InviteCheck> {
      if (!code || !code.trim()) return { ok: false, reason: "unknown" };
      // One atomic statement claims the seat and records the redemption together. The capacity guard MUST
      // live on the UPDATE, not a SELECT feeding it: data-modifying statements serialize on the invites row
      // lock and re-evaluate their WHERE against the newest committed version (EPQ), so two concurrent
      // consumes of different users cannot both observe `used_count < max_uses` — a snapshot-read guard in
      // the INSERT's source would let both insert (the (code,user_id) unique index cannot fire across
      // users) and over-redeem past max_uses (BL-116).
      //  - `upd` takes the row lock and increments ONLY for a currently-valid invite that this user has not
      //    already redeemed (`not exists` keeps an idempotent re-consume seat-free).
      //  - `ins` records the redemption ONLY for a claim `upd` actually won; `on conflict` stays as the
      //    belt for the narrow concurrent same-user edge (used_count may over-count by one there — fails
      //    closed, never over-grants).
      //  - `already` is the PRE-statement redemption state (data-modifying CTEs are invisible to sibling
      //    reads), so we can tell an idempotent re-consume (already=true) from a genuine rejection.
      const res = await db.query(
        `with upd as (
           update invites set used_count = used_count + 1
             where lower(code) = lower($1)
               and revoked_at is null
               and (expires_at is null or expires_at > $2)
               and used_count < max_uses
               and (email is null or lower(email) = lower($5))
               and not exists (
                 select 1 from invite_redemptions r
                  where r.code = invites.code and r.user_id = $3
               )
             returning code
         ),
         ins as (
           insert into invite_redemptions (id, code, user_id)
             select $4, code, $3 from upd
           on conflict (code, user_id) do nothing
           returning code
         )
         select
           (select count(*)::int from upd) as claimed,
           exists(select 1 from invite_redemptions where lower(code) = lower($1) and user_id = $3) as already`,
        [code.trim(), now(), userId, newId(), email?.trim() ?? null],
      );
      const row = res.rows[0] as { claimed: number; already: boolean } | undefined;
      if (row && (row.claimed > 0 || row.already)) return { ok: true };
      const reason = reasonFor(await load(code), now(), email) ?? "exhausted";
      return { ok: false, reason };
    },
  };
}
