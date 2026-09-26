// Signed one-click email actions (PRB.09; REQ-SPEC-20; §6.4). An email carries links of the form
//   <apiBaseUrl>/api/action/<payload>.<sig>
// where `payload` is base64url(JSON{tid, ws}) and `sig` is an HMAC-SHA256 over the payload. The SERVER-SIDE
// row (`email_action_tokens`, 0021) is the authority: it binds the token to a gate, a run, the recipient
// user, an action ('open' | 'hold'), and an expiry. Consumption is a single conditional UPDATE
// (`consumed_at is null and expires_at > now`) — one click wins; a replay, a forged id, a tampered
// signature, or an expired token all fail closed.
//
// Two actions exist and no more: `open` (a deep link — the in-app surface keeps its own Approve verbs) and
// `hold` ("Wait for me" — clears the deadline without resolving; gate-expiry's holdGate). Approve is never
// a remote action (REQ-MOBILE-10's rule applied to email).

import { createHmac, timingSafeEqual } from "node:crypto";
import type { Clock } from "./clock.js";
import type { IdFactory } from "./ids.js";
import type { SqlClient, TxRunner } from "./tx.js";

/** Deploy config the api (consume) + worker (mint) both hold — the secret arrives via Secret Manager. */
export interface EmailActionConfig {
  /** the HMAC key signing one-click links (Secret Manager at deploy; never a client env var). */
  readonly actionSecret: string;
  /** the api origin the signed link points at (e.g. `https://api.rhema…`). */
  readonly apiBaseUrl: string;
  /** the web app origin for deep links (e.g. `https://app.rhema…`). */
  readonly appBaseUrl: string;
}

export const EMAIL_ACTIONS = ["open", "hold"] as const;
export type EmailAction = (typeof EMAIL_ACTIONS)[number];

function b64url(s: string): string {
  return Buffer.from(s, "utf8").toString("base64url");
}
function sign(secret: string, payloadB64: string): string {
  return createHmac("sha256", secret).update(payloadB64).digest("base64url");
}
function safeEq(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** The deep link an email's Open action / a reminder's link target (the project's live review surface). */
export function gateDeepLink(appBaseUrl: string, args: { projectId: string | null; runId: string; gateId?: string }): string {
  const base = args.projectId ? `${appBaseUrl}/p/${args.projectId}/review/${args.runId}` : `${appBaseUrl}/app`;
  return args.gateId ? `${base}?gate=${args.gateId}` : base;
}

/** The deep link for non-gate mail (a finished/failed run, the billing page). */
export function runDeepLink(appBaseUrl: string, args: { projectId: string | null; runId?: string }): string {
  if (args.projectId && args.runId) return `${appBaseUrl}/p/${args.projectId}/review/${args.runId}`;
  if (args.projectId) return `${appBaseUrl}/p/${args.projectId}`;
  return `${appBaseUrl}/app`;
}

export function billingDeepLink(appBaseUrl: string): string {
  return `${appBaseUrl}/app`;
}

export interface MintedAction {
  readonly tokenId: string;
  /** the full signed token string that goes in the link's path. */
  readonly token: string;
  /** the absolute one-click URL. */
  readonly url: string;
}

/**
 * Mint a signed one-click action (inside the caller's tenant tx): persist the binding row and return the
 * signed `<payload>.<sig>` token + absolute URL. `expiresAt` is the gate's deadline, or a bounded fallback.
 */
export async function mintEmailAction(
  tx: SqlClient,
  deps: { ids: IdFactory; config: EmailActionConfig },
  args: {
    workspaceId: string;
    gateId: string;
    runId: string;
    userId: string;
    action: EmailAction;
    expiresAt: Date;
  },
): Promise<MintedAction> {
  const tokenId = deps.ids("eat");
  await tx.query(
    `insert into email_action_tokens(id, workspace_id, gate_id, run_id, user_id, action, expires_at)
     values ($1,$2,$3,$4,$5,$6,$7)`,
    [tokenId, args.workspaceId, args.gateId, args.runId, args.userId, args.action, args.expiresAt],
  );
  const payload = b64url(JSON.stringify({ tid: tokenId, ws: args.workspaceId }));
  const token = `${payload}.${sign(deps.config.actionSecret, payload)}`;
  return { tokenId, token, url: `${deps.config.apiBaseUrl}/api/action/${token}` };
}

export type ConsumeResult =
  | {
      readonly ok: true;
      readonly action: EmailAction;
      readonly gateId: string;
      readonly runId: string;
      readonly userId: string;
      readonly workspaceId: string;
    }
  | {
      readonly ok: false;
      readonly reason: "malformed" | "bad_signature" | "unknown" | "expired_or_consumed";
    };

/**
 * Consume a signed one-click token (the `/api/action/<token>` route). The payload carries the tenant so the
 * RLS-scoped consume transaction can be opened; the signature proves the payload is unmolested; the
 * conditional update enforces expiry + single-use in one statement (the row's workspace_id must equal the
 * payload's — a cross-tenant id can never match under RLS).
 */
export async function consumeEmailAction(
  deps: { txRunner: TxRunner; clock: Clock; config: Pick<EmailActionConfig, "actionSecret"> },
  token: string,
): Promise<ConsumeResult> {
  const dot = token.lastIndexOf(".");
  if (dot <= 0) return { ok: false, reason: "malformed" };
  const payloadB64 = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  if (!safeEq(sign(deps.config.actionSecret, payloadB64), sig)) return { ok: false, reason: "bad_signature" };

  let payload: { tid?: unknown; ws?: unknown };
  try {
    payload = JSON.parse(Buffer.from(payloadB64, "base64url").toString("utf8")) as { tid?: unknown; ws?: unknown };
  } catch {
    return { ok: false, reason: "malformed" };
  }
  if (typeof payload.tid !== "string" || typeof payload.ws !== "string") {
    return { ok: false, reason: "malformed" };
  }

  const now = deps.clock.now();
  return deps.txRunner.run(payload.ws, async (tx): Promise<ConsumeResult> => {
    // The conditional update IS the consume: unexpired + unconsumed, atomically. A second click (or a
    // replayed link) matches zero rows.
    const res = await tx.query(
      `update email_action_tokens set consumed_at = $2
        where id = $1 and consumed_at is null and expires_at > $2
        returning action, gate_id, run_id, user_id, workspace_id`,
      [payload.tid, now],
    );
    const row = res.rows[0] as
      | { action: string; gate_id: string; run_id: string; user_id: string; workspace_id: string }
      | undefined;
    if (!row) {
      const exists = (
        await tx.query("select 1 from email_action_tokens where id = $1", [payload.tid])
      ).rows.length;
      return { ok: false, reason: exists ? "expired_or_consumed" : "unknown" };
    }
    return {
      ok: true,
      action: row.action as EmailAction,
      gateId: row.gate_id,
      runId: row.run_id,
      userId: row.user_id,
      workspaceId: row.workspace_id,
    };
  });
}
